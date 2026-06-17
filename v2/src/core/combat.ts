import { OVERCHARGE_DAMAGE_MULT } from './constants';
import { brownoutFactor } from './energy';
import type { EffectiveStats } from './stats';
import type { CoreState, EnemyState, RunModifiers } from './types';

/**
 * Ship auto-fire: when the fire timer elapses, hit enemies with full conditional
 * and situational modifiers applied. Firing always happens once the timer elapses —
 * low energy stretches the NEXT interval (brownout) instead of blocking the shot.
 */
export function fireShipWeapon(state: CoreState, stats: EffectiveStats): void {
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
  const targets = selectTargets(state.enemies, effectiveTargets, mods.haywireTargeting, state.rng);

  targets.forEach((enemy, index) => {
    const falloff = Math.pow(stats.weaponFalloff, index);
    const situationalMult = computeSituationalMult(enemy, mods);
    const finalDamage = applyRandomness(shotDamage * falloff * situationalMult, mods, state.rng);
    enemy.hp -= finalDamage;
    state.stats.damageDealt += finalDamage;
  });
  state.stats.shotsFired += 1;

  // DRAIN CYCLE: every N shots restore shield
  if (mods.nthShotShieldInterval > 0 && state.shotCounter % mods.nthShotShieldInterval === 0) {
    state.ship.shield = Math.min(stats.shieldCapacity, state.ship.shield + mods.nthShotShieldAmount);
  }

  const refunded = overcharged && mods.overchargeRefund;
  const energyCost = (refunded || isFreeShot) ? 0 : stats.weaponEnergyPerShot;
  const energyBack = mods.energyPerHit * targets.length;
  state.ship.energy = clampEnergy(state.ship.energy - energyCost + energyBack, stats);

  // BLOODFIRE: each shot burns a sliver of hull
  if (mods.hullDamagePerShot > 0) state.ship.hull -= mods.hullDamagePerShot;

  removeDeadEnemies(state, stats);

  const hullFrac = state.ship.hull / state.ship.maxHull;
  const stretch = brownoutFactor(state.ship.energy, stats.generatorCapacity);
  const rateDivisor = mods.lowHullFireRateMult > 1 && hullFrac < 0.3 ? mods.lowHullFireRateMult : 1;
  state.ship.fireTimer += (stats.weaponInterval * stretch) / rateDivisor;
}

/** Enemy regenerates HP before the ship fires (guardian tutorial mechanic). */
export function regenerateEnemies(state: CoreState): void {
  for (const enemy of state.enemies) {
    if (enemy.regenPerTick > 0) {
      enemy.hp = Math.min(enemy.maxHp, enemy.hp + enemy.regenPerTick);
    }
  }
}

/** Enemies shoot back while descending the lane. Shield absorbs first, remainder hits hull. */
export function fireEnemyWeapons(state: CoreState): void {
  for (const enemy of state.enemies) {
    enemy.shootTimer -= 1;
    if (enemy.shootTimer > 0) continue;
    enemy.shootTimer += enemy.ticksBetweenShots;
    damageShip(state, enemy.shotDamage);
  }
}

/** Shield absorbs first; remainder reaches hull. Resets MOMENTUM on hull damage. */
export function damageShip(state: CoreState, amount: number): void {
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
    count = Infinity;
  }
  return count;
}

function selectTargets(
  enemies: EnemyState[],
  count: number,
  haywire: boolean,
  rng: () => number,
): EnemyState[] {
  if (haywire) {
    // HAYWIRE: pick one random enemy instead of front-most
    const idx = Math.floor(rng() * enemies.length);
    return [enemies[idx] as EnemyState];
  }
  return [...enemies].sort((a, b) => a.distance - b.distance).slice(0, count);
}

function computeSituationalMult(enemy: EnemyState, mods: RunModifiers): number {
  let mult = 1;
  if (mods.blockerDamageMult > 1 && enemy.blocksConveyor) mult *= mods.blockerDamageMult;
  if (mods.bossDamageMult > 1 && enemy.isBoss) mult *= mods.bossDamageMult;
  if (mods.highHpEnemyDamageMult > 1 && enemy.hp > enemy.maxHp * 0.5) mult *= mods.highHpEnemyDamageMult;
  return mult;
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

  const coinReward = enemy.blocksConveyor && mods.blockerCoinMult > 1
    ? Math.round(enemy.coinReward * mods.blockerCoinMult)
    : enemy.coinReward;
  state.stats.coinsEarned += coinReward;

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
    state.bonusCallsPending += 1;
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

function removeDeadEnemies(state: CoreState, stats: EffectiveStats): void {
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
