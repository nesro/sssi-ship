import { HIT_ALL_TARGETS, HOLD_CHARGE_TIER_2_TICKS, HOLD_CHARGE_TIER_3_TICKS, OVERCHARGE_DAMAGE_MULT } from './constants';
import { brownoutFactor } from './energy';
import { activeDamageMult, activeFireRateMult, activeGeneratorMult, computeEffectiveStats, isInvulnerable } from './stats';
import type { EffectiveStats } from './stats';
import type { CoreState, EnemyState, RunModifiers } from './types';

/**
 * Ship auto-fire: when the fire timer elapses, hit enemies with full conditional
 * and situational modifiers applied. Firing always happens once the timer elapses —
 * low energy stretches the NEXT interval (brownout) instead of blocking the shot.
 */
export function fireShipWeapon(state: CoreState, stats: EffectiveStats): void {
  if (!state.autoFireEnabled) return;
  if (!stats.weaponEquipped) return;
  state.ship.fireTimer -= 1;
  if (state.enemies.length === 0) {
    state.ship.fireTimer = Math.max(state.ship.fireTimer, 1);
    return;
  }
  if (state.ship.fireTimer > 0) return;

  state.shotCounter += 1;
  const mods = state.modifiers;

  const overcharged = mods.overchargeEvery > 0 && state.shotCounter % mods.overchargeEvery === 0;
  const isFreeShot = mods.freeEveryNthShot > 0 && state.shotCounter % mods.freeEveryNthShot === 0;

  const baseDamage = stats.weaponDamage * (overcharged ? OVERCHARGE_DAMAGE_MULT : 1);
  const shotDamage = baseDamage * computeConditionalDmgMult(state, stats, mods);

  const effectiveTargets = computeTargetCount(state, stats, mods);
  const targets = selectTargets(
    state.enemies, effectiveTargets, mods.haywireTargeting, state.rng, state.priorityTargetId,
  );
  const weapon = state.loadout.weapon;

  let hitCount = 0;
  targets.forEach((enemy, index) => {
    const falloff = Math.pow(stats.weaponFalloff, index);
    const situationalMult = computeSituationalMult(enemy, mods);
    const preCritDamage = shotDamage * falloff * situationalMult;
    const critMult = stats.shipCritMultOverride !== null ? stats.shipCritMultOverride : (weapon?.critMult ?? 2);
    const { damage: rolledDamage, wasMiss, wasCrit } = weapon !== null
      ? rollShotOutcome(weapon.missChance, weapon.critChance, critMult, preCritDamage, state.rng)
      : { damage: preCritDamage, wasMiss: false, wasCrit: false };
    if (wasMiss) {
      state.pendingVisualEvents.push({ kind: 'player-miss', enemyId: enemy.id });
      return;
    }
    if (wasCrit) state.pendingVisualEvents.push({ kind: 'player-crit', enemyId: enemy.id });
    const finalDamage = applyRandomness(rolledDamage, mods, state.rng);
    enemy.hp -= finalDamage;
    state.stats.damageDealt += finalDamage;
    hitCount += 1;
  });
  state.stats.shotsFired += 1;

  // DRAIN CYCLE: every N shots restore shield
  if (mods.nthShotShieldInterval > 0 && state.shotCounter % mods.nthShotShieldInterval === 0) {
    state.ship.shield = Math.min(stats.shieldCapacity, state.ship.shield + mods.nthShotShieldAmount);
  }

  const refunded = overcharged && mods.overchargeRefund;
  const energyCost = (refunded || isFreeShot) ? 0 : stats.weaponEnergyPerShot;
  const energyBack = mods.energyPerHit * hitCount;
  state.ship.energy = clampEnergy(state.ship.energy - energyCost + energyBack, stats);

  // BLOODFIRE: each shot burns a sliver of hull
  if (mods.hullDamagePerShot > 0) state.ship.hull -= mods.hullDamagePerShot;

  removeDeadEnemies(state, stats);

  const hullFrac = state.ship.hull / state.ship.maxHull;
  const stretch = brownoutFactor(state.ship.energy, stats.generatorCapacity);
  const rateDivisor = mods.lowHullFireRateMult > 1 && hullFrac < 0.3 ? mods.lowHullFireRateMult : 1;
  state.ship.fireTimer += (stats.weaponInterval * stretch) / rateDivisor;
}

/**
 * Enemy regenerates HP before the ship fires. Two mechanisms share the `regenPerTick`
 * field: most regenerating enemies (t3's guardian) heal themselves. `booster`
 * (fable-fun-review-followup.md Item 7) instead grants its `regenPerTick` to whichever
 * alive enemy is currently nearest-ahead of it — distance-based, recomputed every tick
 * (decision #14: enemies move at independent speeds and can overtake each other, so a
 * spawn-order rule would sometimes buff an enemy that's visually behind the booster).
 * No stacking: each booster targets exactly one nearest-ahead enemy; if that enemy is
 * itself another booster, the buff chains rather than two boosters ever double-feeding
 * the same target directly.
 */
export function regenerateEnemies(state: CoreState): void {
  for (const enemy of state.enemies) {
    if (enemy.regenPerTick <= 0) continue;
    if (enemy.kind === 'booster') {
      const target = nearestEnemyAhead(state.enemies, enemy);
      if (target !== null) target.hp = Math.min(target.maxHp, target.hp + enemy.regenPerTick);
      continue;
    }
    enemy.hp = Math.min(enemy.maxHp, enemy.hp + enemy.regenPerTick);
  }
}

/** The alive enemy with the largest distance that is still smaller than `from`'s own
 * distance — i.e. the closest enemy currently nearer to the ship than `from`. Null if
 * `from` is already the closest (or only) enemy on the lane. Exported (not just used by
 * regenerateEnemies) so CombatScene's booster-buff visual reuses the exact same
 * adjacency rule rather than a view-side approximation that could silently diverge. */
export function nearestEnemyAhead(enemies: EnemyState[], from: EnemyState): EnemyState | null {
  let nearest: EnemyState | null = null;
  for (const candidate of enemies) {
    if (candidate.id === from.id) continue;
    if (candidate.distance >= from.distance) continue; // not ahead of `from`
    if (nearest === null || candidate.distance > nearest.distance) nearest = candidate;
  }
  return nearest;
}

/** Enemies shoot back while descending the lane. Shield absorbs first, remainder hits hull. */
export function fireEnemyWeapons(state: CoreState, stats: EffectiveStats): void {
  for (const enemy of state.enemies) {
    enemy.shootTimer -= 1;
    if (enemy.shootTimer > 0) continue;
    enemy.shootTimer += enemy.ticksBetweenShots;
    const effectiveMissChance = Math.min(1, enemy.missChance + stats.shipEnemyMissBonus);
    const { damage, wasMiss, wasCrit } = rollShotOutcome(
      effectiveMissChance, enemy.critChance, enemy.critMult, enemy.shotDamage, state.rng,
    );
    if (wasMiss) {
      state.pendingVisualEvents.push({ kind: 'enemy-miss', enemyId: enemy.id });
      continue;
    }
    if (wasCrit) state.pendingVisualEvents.push({ kind: 'enemy-crit', enemyId: enemy.id });
    damageShip(state, damage);
  }
}

/**
 * Rear weapon fires sideways at mid-queue enemies: a centered slice around
 * enemies[floor(N/2)]. Brownout does NOT stretch the rear weapon — it fires on a fixed
 * interval so the player can rely on it as a predictable AoE tool.
 */
export function fireRearWeapon(state: CoreState, stats: EffectiveStats): void {
  if (!state.rearWeaponEnabled) return;
  if (!stats.rearWeaponEquipped) return;
  state.ship.rearFireTimer -= 1;
  if (state.enemies.length === 0) {
    state.ship.rearFireTimer = Math.max(state.ship.rearFireTimer, 1);
    return;
  }
  if (state.ship.rearFireTimer > 0) return;

  const midIndex = Math.floor(state.enemies.length / 2);
  const half = Math.floor(stats.rearWeaponMaxTargets / 2);
  const start = Math.max(0, midIndex - half);
  const end = Math.min(state.enemies.length, start + stats.rearWeaponMaxTargets);
  const targets = state.enemies.slice(start, end);
  const rearWeapon = state.loadout.rearWeapon;

  targets.forEach((enemy, index) => {
    const falloff = Math.pow(stats.rearWeaponFalloff, index);
    const { damage, wasMiss } = rearWeapon !== null
      ? rollShotOutcome(rearWeapon.missChance, rearWeapon.critChance, rearWeapon.critMult, stats.rearWeaponDamage * falloff, state.rng)
      : { damage: stats.rearWeaponDamage * falloff, wasMiss: false };
    if (wasMiss) return;
    enemy.hp -= damage;
    state.stats.damageDealt += damage;
  });

  const energyCost = stats.rearWeaponEnergyPerShot;
  state.ship.energy = clampEnergy(state.ship.energy - energyCost, stats);
  state.stats.rearShotsFired += 1;
  removeDeadEnemies(state, stats);
  state.ship.rearFireTimer += stats.rearWeaponInterval;
}

/**
 * Player-triggered: fire the equipped side weapon, consuming one charge (§5). Manual
 * only — never called from advanceTick, same as applyBoost. Throws on an invalid call
 * (no weapon equipped, no charges left, mission not running) since the view disables
 * the button in those cases, matching applyBoost's fail-fast convention.
 */
export function fireSideWeapon(state: CoreState): void {
  const sideWeapon = state.loadout.sideWeapon;
  if (sideWeapon === null) {
    throw new Error('No side weapon equipped');
  }
  if (state.ship.sideWeaponCharges <= 0) {
    throw new Error(`Side weapon "${sideWeapon.id}" has no charges left`);
  }
  if (state.status !== 'running') {
    throw new Error(`Cannot fire side weapon while mission status is "${state.status}"`);
  }
  state.ship.sideWeaponCharges -= 1;
  state.sideWeaponTaps.push(state.tick);

  // Fold active timed boosts (e.g. Rage Protocol) exactly like advanceTick does
  // (tick.ts) — a manual-fire side weapon must feel the same active damage-mult
  // window an auto-firing weapon does.
  const stats = computeEffectiveStats(
    state.loadout, state.modifiers, activeDamageMult(state), activeFireRateMult(state), activeGeneratorMult(state),
  );
  const targets = [...state.enemies].sort((a, b) => a.distance - b.distance).slice(0, sideWeapon.maxTargets);
  targets.forEach((enemy, index) => {
    const falloff = Math.pow(sideWeapon.falloffPerTarget, index);
    const { damage, wasMiss } = rollShotOutcome(
      sideWeapon.missChance, sideWeapon.critChance, sideWeapon.critMult,
      stats.sideWeaponDamage * falloff, state.rng,
    );
    if (wasMiss) return;
    enemy.hp -= damage;
    state.stats.damageDealt += damage;
  });
  state.stats.sideShotsFired += 1;

  removeDeadEnemies(state, stats);
}

/** Toggle auto-fire on or off. When off, the weapon never fires — energy accumulates. */
export function toggleAutoFire(state: CoreState): void {
  state.autoFireEnabled = !state.autoFireEnabled;
}

/** Toggle rear weapon on or off. When off, energy is not drained by rear shots. */
export function toggleRearWeapon(state: CoreState): void {
  state.rearWeaponEnabled = !state.rearWeaponEnabled;
}

/** Toggle auto-shield on or off. When off, the generator never fires a shield pulse. */
export function toggleAutoShield(state: CoreState): void {
  state.autoShieldEnabled = !state.autoShieldEnabled;
}

/** Player-triggered: mark (or clear, with `null`) the front weapon's priority target
 * (fable-fun-review-followup.md Item 4). Soft priority only — does not validate the
 * enemy exists here; `selectTargets` falls back to front-most targeting on its own if
 * the marked enemy is no longer alive/present by the time the weapon fires. Front
 * weapon only, never rear or side weapons. */
export function setPriorityTarget(state: CoreState, enemyId: number | null): void {
  state.priorityTargetId = enemyId;
  state.priorityTargetTaps.push({ tick: state.tick, enemyId });
}

/**
 * Player-triggered: activate the ability in the given slot. No-ops if on cooldown or
 * insufficient energy. The caller (view) is responsible for routing this correctly.
 */
export function activateAbility(state: CoreState, slotIndex: number): void {
  const equipped = state.equippedAbilities[slotIndex];
  if (equipped === undefined) return;
  if (equipped.cooldownLeft > 0) return;
  const def = state.abilityPool.find((a) => a.id === equipped.abilityId);
  if (def === undefined) throw new Error(`Ability "${equipped.abilityId}" not in pool`);
  const cost = def.energyCost ?? 0;
  if (state.ship.energy < cost) return;
  state.ship.energy = Math.max(0, state.ship.energy - cost);
  if (def.activate !== undefined) def.activate(state);
  equipped.cooldownLeft = def.cooldownTicks ?? 0;
}

/** Shield absorbs first; remainder reaches hull. Resets MOMENTUM on hull damage. */
export function damageShip(state: CoreState, amount: number): void {
  if (isInvulnerable(state)) return;
  const absorbed = Math.min(state.ship.shield, amount);
  state.ship.shield -= absorbed;
  const hullDmg = amount - absorbed;
  state.ship.hull -= hullDmg;
  if (state.ship.shield <= 0 && absorbed > 0) state.shieldBroke = true;
  if (hullDmg > 0) state.consecutiveKills = 0;
}

// ── Private helpers ───────────────────────────────────────────────────────────

function computeStateDmgMult(state: CoreState, stats: EffectiveStats, mods: RunModifiers): number {
  let mult = 1;
  const hullFrac = state.ship.hull / state.ship.maxHull;
  if (mods.fullEnergyDmgBonus > 0 && state.ship.energy >= stats.generatorCapacity) {
    mult *= 1 + mods.fullEnergyDmgBonus;
  }
  if (mods.lowHullDmgMult > 1 && hullFrac < 0.3) mult *= mods.lowHullDmgMult;
  if (mods.singleEnemyDmgBonus > 0 && state.enemies.length === 1) {
    mult *= 1 + mods.singleEnemyDmgBonus;
  }
  if (mods.shieldActiveDmgBonus > 0 && state.ship.shield > 0) {
    mult *= 1 + mods.shieldActiveDmgBonus;
  }
  if (mods.shieldZeroDmgMult > 1 && state.ship.shield <= 0) {
    mult *= mods.shieldZeroDmgMult;
  }
  // stats.shieldCapacity > 0 guard: an unequipped shield has capacity 0, which would
  // otherwise satisfy `shield >= capacity` (0 >= 0) and falsely read as "shield full".
  if (mods.shieldFullDmgBonus > 0 && stats.shieldCapacity > 0 && state.ship.shield >= stats.shieldCapacity) {
    mult *= 1 + mods.shieldFullDmgBonus;
  }
  return mult;
}

function computeProgressDmgMult(state: CoreState, mods: RunModifiers): number {
  if (mods.earlyBirdDmgBonus <= 0 && mods.finalPushDmgBonus <= 0) return 1;
  const lastTick = state.mission.events.at(-1)?.atTimelineTick ?? 1;
  const progress = Math.min(1, state.timelineTick / lastTick);
  let mult = 1;
  if (mods.earlyBirdDmgBonus > 0 && progress < 0.25) mult *= 1 + mods.earlyBirdDmgBonus;
  if (mods.finalPushDmgBonus > 0 && progress > 0.75) mult *= 1 + mods.finalPushDmgBonus;
  return mult;
}

function computeKillMomentumMult(state: CoreState, mods: RunModifiers): number {
  let mult = 1;
  if (mods.killDmgPerKillPct > 0) mult *= 1 + (state.stats.kills * mods.killDmgPerKillPct) / 100;
  if (mods.momentumDmgPerKillPct > 0) mult *= 1 + (state.consecutiveKills * mods.momentumDmgPerKillPct) / 100;
  return mult;
}

function computeConditionalDmgMult(state: CoreState, stats: EffectiveStats, mods: RunModifiers): number {
  return computeStateDmgMult(state, stats, mods)
    * computeProgressDmgMult(state, mods)
    * computeKillMomentumMult(state, mods);
}

function computeTargetCount(state: CoreState, stats: EffectiveStats, mods: RunModifiers): number {
  let count = stats.weaponMaxTargets;
  if (mods.manyEnemiesExtraTargets > 0 && state.enemies.length >= 6) {
    count += mods.manyEnemiesExtraTargets;
  }
  if (mods.noShieldPierceAll && state.ship.shield <= 0) {
    count = HIT_ALL_TARGETS;
  }
  return count;
}

function selectTargets(
  enemies: EnemyState[],
  count: number,
  haywire: boolean,
  rng: () => number,
  priorityTargetId: number | null,
): EnemyState[] {
  if (haywire) {
    // HAYWIRE: pick one random enemy instead of front-most
    const idx = Math.floor(rng() * enemies.length);
    return [enemies[idx] as EnemyState];
  }
  const sorted = [...enemies].sort((a, b) => a.distance - b.distance);
  if (priorityTargetId === null) return sorted.slice(0, count);
  const priority = sorted.find((e) => e.id === priorityTargetId);
  // Soft priority: falls straight back to front-most if the marked enemy is dead or
  // was never in range — never wastes a shot idling on a target that no longer exists.
  if (priority === undefined) return sorted.slice(0, count);
  // Priority target takes slot 0 (full damage, no falloff — fable-fun-review-followup.md
  // Item 4's specified multi-target interaction); remaining slots fill from front-most,
  // excluding the priority target itself so it's never counted twice.
  const rest = sorted.filter((e) => e.id !== priorityTargetId).slice(0, Math.max(0, count - 1));
  return [priority, ...rest];
}

function computeSituationalMult(enemy: EnemyState, mods: RunModifiers): number {
  let mult = 1;
  if (mods.blockerDamageMult > 1 && enemy.blocksConveyor) mult *= mods.blockerDamageMult;
  if (mods.bossDamageMult > 1 && enemy.isBoss) mult *= mods.bossDamageMult;
  if (mods.highHpEnemyDamageMult > 1 && enemy.hp > enemy.maxHp * 0.5) mult *= mods.highHpEnemyDamageMult;
  return mult;
}

function rollShotOutcome(
  missChance: number,
  critChance: number,
  critMult: number,
  baseDamage: number,
  rng: () => number,
): { damage: number; wasMiss: boolean; wasCrit: boolean } {
  if (missChance <= 0 && critChance <= 0) return { damage: baseDamage, wasMiss: false, wasCrit: false };
  const r = rng();
  if (r < missChance) return { damage: 0, wasMiss: true, wasCrit: false };
  if (r < missChance + critChance) return { damage: baseDamage * critMult, wasMiss: false, wasCrit: true };
  return { damage: baseDamage, wasMiss: false, wasCrit: false };
}

function applyRandomness(damage: number, mods: RunModifiers, rng: () => number): number {
  if (mods.shotRandomnessFraction <= 0) return damage;
  // ±N fraction: 0 → (1-N)×, 1 → (1+N)×
  return damage * (1 + (rng() * 2 - 1) * mods.shotRandomnessFraction);
}

/** Applies all on-kill mod effects for one enemy; returns that enemy's explosion damage contribution. */
function applyEnemyDeathEffects(
  state: CoreState, stats: EffectiveStats, mods: RunModifiers, enemy: EnemyState,
): number {
  state.stats.kills += 1;
  state.consecutiveKills += 1;
  if (enemy.isBoss && state.bossKillTick === null) state.bossKillTick = state.tick;

  const baseCoins = stats.shipCoinMult !== 1 ? Math.round(enemy.coinReward * stats.shipCoinMult) : enemy.coinReward;
  const coinReward = enemy.blocksConveyor && mods.blockerCoinMult > 1
    ? Math.round(baseCoins * mods.blockerCoinMult)
    : baseCoins;
  state.stats.coinsEarned += coinReward;
  // View-facing only: lets the coin popup show real credited coins instead of the
  // enemy's raw spec coinReward, which a collision self-death (never routed through
  // this function) would otherwise wrongly imply was paid.
  state.pendingVisualEvents.push({ kind: 'enemy-killed', enemyId: enemy.id, coins: coinReward });

  if (mods.coinsEnergyRestore > 0) {
    state.ship.energy = Math.min(
      stats.generatorCapacity,
      state.ship.energy + coinReward * mods.coinsEnergyRestore,
    );
  }
  if (mods.hullPerKill > 0) {
    state.ship.hull = Math.min(state.ship.maxHull, state.ship.hull + mods.hullPerKill);
  }
  if (enemy.blocksConveyor) {
    state.bonusCallsPending += enemy.kind === 'blocker' ? bonusCallsForHoldCharge(enemy.holdChargeTicks) : 1;
    if (mods.extraEnergyOnBlockerKill > 0) {
      state.ship.energy = Math.min(
        stats.generatorCapacity,
        state.ship.energy + mods.extraEnergyOnBlockerKill,
      );
    }
  }
  if (mods.nthKillShieldInterval > 0 && state.stats.kills % mods.nthKillShieldInterval === 0) {
    state.ship.shield = Math.min(
      stats.shieldCapacity,
      state.ship.shield + mods.nthKillShieldAmount,
    );
  }
  return mods.killExplosionDamage;
}

/** Banks a blocker's accumulated hold-charge into its bonus-call payout at death
 * (Item 6). Tiers, not a smooth curve — a clear "held long enough for the next tier"
 * signal is easier to read mid-combat than a continuously scaling number. */
export function bonusCallsForHoldCharge(holdChargeTicks: number): number {
  if (holdChargeTicks >= HOLD_CHARGE_TIER_3_TICKS) return 3;
  if (holdChargeTicks >= HOLD_CHARGE_TIER_2_TICKS) return 2;
  return 1;
}

/** Exported so conveyor.ts's advanceEnemies can route shield-burst kills through the
 * same death pipeline (kill credit, coins, blocker bonus calls, on-kill chains) instead
 * of silently dropping them from state.enemies. */
export function removeDeadEnemies(state: CoreState, stats: EffectiveStats): void {
  const mods = state.modifiers;
  const hadEnemies = state.enemies.length > 0;
  const survivors: EnemyState[] = [];
  let explosionDmg = 0;

  for (const enemy of state.enemies) {
    if (enemy.hp > 0) { survivors.push(enemy); continue; }
    explosionDmg += applyEnemyDeathEffects(state, stats, mods, enemy);
  }

  if (explosionDmg > 0) {
    for (const survivor of survivors) survivor.hp -= explosionDmg;
  }
  state.enemies = survivors.filter((e) => e.hp > 0);

  if (hadEnemies && state.enemies.length === 0) {
    state.wavesClearedThisRun += 1;
    if (
      mods.nthWaveClearRefillInterval > 0 &&
      state.wavesClearedThisRun % mods.nthWaveClearRefillInterval === 0
    ) {
      state.ship.energy = stats.generatorCapacity;
    }
  }
}

function clampEnergy(value: number, stats: EffectiveStats): number {
  return Math.min(stats.generatorCapacity, Math.max(0, value));
}
