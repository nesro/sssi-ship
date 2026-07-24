// All core types. Pure data — no Phaser, no DOM, no Node.

import type { SeededRng } from './rng';

// ---------- Component specs (what the shop sells; what a loadout equips) ----------

// y2010 is a secret, deliberately-unbalanced Easter egg weapon (Nesro's original 2010
// laser) — hidden in the shop until the campaign is beaten or dev mode is on (see
// WEAPON_SYSTEM.isKindVisible, viewmodel/shopSystems.ts). Appended last (index 4) so
// tools/loadoutPresets.ts's kindAt(WEAPON_KINDS, 0) — which assumes 'pulse' — is
// unaffected. NOT tuned for balance on purpose; if you run pnpm tune/campaign/balance,
// expect it to dominate every sweep it's included in — that's expected, not a bug.
export type WeaponKind = 'pulse' | 'ion' | 'scatter' | 'nova' | 'y2010';
export type RearWeaponKind = 'grenade' | 'flak' | 'plasma' | 'arc' | 'cluster';
export type SideWeaponKind = 'focus' | 'flechette' | 'railgun' | 'orbital';

export interface WeaponSpec {
  id: string;
  kind: WeaponKind | RearWeaponKind | SideWeaponKind;
  damagePerShot: number;
  /** Base interval; stretched by brownout when energy is low. Unused (0) by side weapons — manual-fire has no interval. */
  ticksBetweenShots: number;
  /** Unused (0) by side weapons — manual-fire costs a charge, never energy. */
  energyPerShot: number;
  /** How many enemies one shot can hit, front-most first. 1 = single-target. */
  maxTargets: number;
  /** Damage multiplier applied per enemy after the first (pierce falloff). */
  falloffPerTarget: number;
  /** 0–1 probability of dealing critMult × damage instead of normal damage. */
  critChance: number;
  /** 0–1 probability of dealing 0 damage (bolt still fires visually). */
  missChance: number;
  /** Damage multiplier on a critical hit. */
  critMult: number;
  /** Side weapons only: charges granted at mission start, refilled every mission. */
  maxCharges?: number;
}

export interface ShieldSpec {
  id: string;
  capacity: number;
  /** Fraction of shieldCapacity restored each time the generator fires a pulse (0–1). */
  pulseShieldFraction: number;
  /** How far collision-absorbed shield damage splashes back onto other enemies
   * (conveyor.ts's shield-burst mechanic): 'single' hits only the nearest surviving
   * enemy, 'all' hits every enemy currently on screen, 'none' skips the splash
   * entirely. A per-kind identity trait, not a per-level one — shared by every level
   * of a given shield kind. */
  burstMode: 'single' | 'all' | 'none';
}

export interface GeneratorSpec {
  id: string;
  outputPerTick: number;
  capacity: number;
  /** Fraction of generatorCapacity drained when a shield pulse fires (0–1). */
  pulseDrainFraction: number;
}

export interface MotorSpec {
  id: string;
  /** Scales the mission wave timeline: faster motor = waves arrive sooner. */
  timelineMultiplier: number;
  powerDrawPerTick: number;
  /** Each scheduled support call also queues N extra bonus calls (tactical motor path). */
  bonusCardsPerSupportCall?: number;
  /** Extra rerolls granted at mission start beyond REROLLS_PER_MISSION. */
  bonusRerollsPerMission?: number;
}

export type ShipPassiveKind =
  | 'enemy-miss-bonus'       // Interceptor: adds to every enemy's missChance
  | 'collision-reduction'    // Tanker: halves collision damage
  | 'coin-bonus'             // Salvager: multiplies coins from kills
  | 'generator-capacity-bonus' // Reactor: multiplies generator capacity
  | 'crit-mult-override';    // Warship: overrides player critMult

export interface ShipSpec {
  id: string;
  kind: string;
  level: number;
  name: string;
  hull: number;
  price: number;
  starsRequired?: number;
  passiveKind: ShipPassiveKind;
  /** Numeric meaning depends on passiveKind: bonus fraction / multiplier / override value. */
  passiveValue: number;
  passiveDescription: string;
  /** Flavor line shown in the shop detail panel — same text for every level of a kind. */
  blurb: string;
}

export type SupplyKind = 'shield-restore' | 'energy-refill' | 'damage-boost';

/** Reserve supplies: permanent purchases whose charges auto-refill every mission (§3.7). */
export interface SupplySpec {
  id: string;
  name: string;
  description: string;
  kind: SupplyKind;
  /** shield-restore: HP restored. energy-refill: unused. damage-boost: damage multiplier. */
  magnitude: number;
  /** Only used by timed effects (damage-boost). */
  durationTicks: number;
  maxCharges: number;
}

export interface SupplyLoadout {
  spec: SupplySpec;
  charges: number;
}

/** Every equipped item at mission start. Recorded in replays (V2_HANDOFF.md §2.2). */
export interface LoadoutSnapshot {
  ship: ShipSpec;
  weapon: WeaponSpec | null;
  rearWeapon: WeaponSpec | null;
  /** Manual-fire, limited-ammo weapon (§5) — charges refill to maxCharges every mission. */
  sideWeapon: WeaponSpec | null;
  shield: ShieldSpec | null;
  generator: GeneratorSpec;
  motor: MotorSpec;
  supplies: SupplyLoadout[];
  /** Union of all card IDs from owned subscriptions at their current levels. */
  subscriptionCardIds: string[];
}

// ---------- Cards (support calls, §3.6) ----------

/** Cumulative in-run modifiers. Card effects fold into this; effects last one mission. */
export interface RunModifiers {
  // ── Core weapon ─────────────────────────────────────────────────────────────
  weaponDamageMult: number;
  fireIntervalMult: number;
  weaponEnergyMult: number;
  extraPierce: number;
  energyPerHit: number;
  overchargeEvery: number;
  overchargeRefund: boolean;

  // ── Shield / generator / motor ───────────────────────────────────────────────
  shieldPulseMult: number;
  shieldCapacityBonus: number;
  shieldCapacityMult: number;       // GLASS CANNON: 0 collapses capacity to 0
  generatorOutputBonus: number;
  generatorCapacityBonus: number;
  motorTimelineMult: number;
  motorDrawMult: number;

  // ── Situational damage (per-target multipliers; 1.0 = no bonus) ──────────────
  blockerDamageMult: number;        // DEMOLISHER: bonus vs enemies with blocksConveyor
  bossDamageMult: number;           // BOSS HUNTER: bonus vs boss enemies
  highHpEnemyDamageMult: number;    // ARMOR PIERCE: bonus vs enemies above 50 % HP
  killExplosionDamage: number;      // SWARM KILLER: AoE damage dealt on each kill

  // ── Conditional damage (per-shot, checked in fireShipWeapon) ─────────────────
  fullEnergyDmgBonus: number;       // FULL CHARGE: additive bonus at max energy
  lowHullDmgMult: number;           // LAST STAND: multiplier at hull < 30 %
  singleEnemyDmgBonus: number;      // FOCUS FIRE: additive bonus with 1 enemy on screen
  shieldActiveDmgBonus: number;     // SHIELD SYNC: additive bonus while shield > 0
  shieldZeroDmgMult: number;        // ZERO BARRIER: multiplier while shield <= 0
  shieldFullDmgBonus: number;       // PEAK CONDITION: additive bonus while shield is at capacity
  noShieldPierceAll: boolean;       // DESPERATE FIRE: pierce all enemies while shield = 0
  manyEnemiesExtraTargets: number;  // SWARM SENSE: extra hit targets when 6+ enemies present
  earlyBirdDmgBonus: number;        // EARLY BIRD: additive bonus in first 25 % of mission
  finalPushDmgBonus: number;        // FINAL PUSH: additive bonus in last 25 % of mission

  // ── Conditional fire rate ─────────────────────────────────────────────────────
  lowHullFireRateMult: number;      // FRENZY: divides fire interval at hull < 30 % (>1 = faster)

  // ── Conditional generator output ─────────────────────────────────────────────
  highHullGenBonus: number;         // PRISTINE HULL: fraction bonus at hull > 80 %
  bossAliveGenBonus: number;        // BOSS FOCUS: fraction bonus while a boss is alive

  // ── Per-shot counters ─────────────────────────────────────────────────────────
  freeEveryNthShot: number;         // PHANTOM SHOT: every N-th shot costs 0 energy (0 = off)
  nthShotShieldInterval: number;    // DRAIN CYCLE: every N shots restore shield (0 = off)
  nthShotShieldAmount: number;      // DRAIN CYCLE: shield HP restored

  // ── Per-kill counters ─────────────────────────────────────────────────────────
  nthKillShieldInterval: number;    // BOUNTY: every N kills restore shield (0 = off)
  nthKillShieldAmount: number;      // BOUNTY: shield HP restored
  extraEnergyOnBlockerKill: number; // BREAKER BONUS: energy gained per blocker kill

  // ── Wave-clear counters ───────────────────────────────────────────────────────
  nthWaveClearRefillInterval: number; // WINDMILL: every N wave-clears refill energy (0 = off)

  // ── Accumulate (grow stronger through run) ────────────────────────────────────
  killDmgPerKillPct: number;        // KILLCOUNT: +N % weapon damage per kill (additive)
  momentumDmgPerKillPct: number;    // MOMENTUM: +N % per consecutive kill; resets on hull hit

  // ── Per-event payoffs ─────────────────────────────────────────────────────────
  hullPerKill: number;              // LEECH HULL: hull HP restored per kill
  coinsEnergyRestore: number;       // BLOOD MONEY: energy per coin earned
  energyPerPulse: number;           // PULSE NOVA (chain payoff): energy gained per shield pulse
  blockerCoinMult: number;          // BOUNTY HUNTER: coin multiplier on blocker kills (1 = none)

  // ── Trade (visible positive + visible negative) ───────────────────────────────
  hullDamagePerShot: number;        // BLOODFIRE: hull HP lost per shot fired

  // ── Trap / weird (hidden or random) ──────────────────────────────────────────
  shotRandomnessFraction: number;   // GAMBLER: shot deals 1 ± N × rng damage factor
  haywireTargeting: boolean;        // HAYWIRE: shots target a random enemy instead of front-most

  // ── Volatile ──────────────────────────────────────────────────────────────────
  volatileCoreLosePct: number;      // VOLATILE CORE: probability [0–1] energy drops to 0 per pulse
}

/** Which support company supplied this ability. Determines offer pool when that company's
 *  equipment is equipped. */
export type CompanyId = 'nexus' | 'aegis' | 'quantum' | 'comet';

export interface AbilityDefinition {
  id: string;
  name: string;
  description: string;
  /** Which company's pool this ability belongs to. */
  company: CompanyId;
  /** passive: RunModifiers updated immediately on pick (old card behaviour).
   *  active: stored in the ability bar; player manually activates at energy cost. */
  kind: 'passive' | 'active';
  // ── passive ────────────────────────────────────────────────────────────────────
  /** passive: modify RunModifiers when picked */
  apply?: (mods: RunModifiers) => RunModifiers;
  /** side effect executed once when picked (e.g. REROLL CACHE, WINDFALL) */
  onPick?: (state: CoreState) => void;
  // ── active ─────────────────────────────────────────────────────────────────────
  /** active: energy drained from ship.energy on activation */
  energyCost?: number;
  /** active: ticks before the ability can be activated again */
  cooldownTicks?: number;
  /** active: effect when the player manually triggers this ability */
  activate?: (state: CoreState) => void;
  // ── pool filtering ─────────────────────────────────────────────────────────────
  /** chain id this ability unlocks (enabler) */
  enablerFor?: string;
  /** weight-suppressed until this chain's enabler is picked */
  requiresChain?: string;
  /** never offered twice */
  unique?: boolean;
}

/** One slot on the ability bar — an active ability the player can trigger. */
export interface EquippedAbility {
  abilityId: string;
  /** Ticks remaining before this ability can be activated again. 0 = ready. */
  cooldownLeft: number;
}

export interface AbilityOffer {
  abilityIds: [string, string, string];
}

// ---------- Enemy modules (docs/plans/modular-enemies.md) ----------
//
// Four slots mirroring the player ship's own WEAPON/SHIELD/GENERATOR/MOTOR systems.
// `composeEnemy` (core/enemyCompose.ts) folds concrete module objects into a flat
// `EnemySpec` — the shape every enemy has always had, unchanged for hand-written
// consts that never call composeEnemy at all. The four `*Kind` fields on
// EnemySpec/EnemyState below carry module identity separately from the display
// `kind` string specifically so behavior dispatch (generator regen target, motor
// movement pattern) never has to special-case a flavor name again.

export type EnemyWeaponKind = 'stinger' | 'battery' | 'lance';

export interface EnemyWeaponModule {
  kind: EnemyWeaponKind;
  shotDamage: number;
  ticksBetweenShots: number;
  critChance: number;
  missChance: number;
  critMult: number;
}

export type EnemyShieldKind = 'aegis' | 'barrier' | 'ward';

/** An enemy's shield is a fixed-capacity absorb buffer, not a ported version of the
 * player's own generator→shield pulse/brownout resource loop — see the plan doc for
 * why porting that per-enemy at 15 concurrent instances would be a second resource
 * system, not a simple generalization. */
export interface EnemyShieldModule {
  kind: EnemyShieldKind;
  capacity: number;
}

export type EnemyGeneratorKind = 'none' | 'self-regen' | 'ally-regen' | 'shield-regen';

/** `regenPerTick`'s unit depends on `kind`: hp/tick for self-regen (heals its own hp)
 * and ally-regen (feeds the nearest enemy ahead of it, combat.ts's regenerateEnemies —
 * the booster mechanic, generalized), or shield-buffer/tick for shield-regen (only
 * has an effect paired with a SHIELD module — a shield-less enemy has no buffer to
 * regenerate). `none` never regenerates anything. */
export interface EnemyGeneratorModule {
  kind: EnemyGeneratorKind;
  regenPerTick: number;
}

export type EnemyMotorKind = 'steady' | 'stall-cycle' | 'rush';

/** `stall-cycle` alternates approach/stall using BOSS_APPROACH_TICKS/BOSS_STALL_TICKS
 * (conveyor.ts's effectiveSpeed) — the boss mechanic, generalized to any enemy that
 * opts in, not inferred from `isBoss` or the display `kind`. `steady` and `rush` both
 * move at `speed` unconditionally; `rush` exists as a distinct catalog entry (a fast
 * `speed` value) rather than a distinct behavior, matching how WEAPON/SHIELD kinds
 * also don't need dispatch code — most module variety is numeric, not behavioral. */
export interface EnemyMotorModule {
  kind: EnemyMotorKind;
  speed: number;
}

// ---------- Mission data ----------

export interface EnemySpec {
  kind: string;
  hp: number;
  /** Lane distance units travelled toward the ship per tick. */
  speed: number;
  shotDamage: number;
  ticksBetweenShots: number;
  /** Blockers pause the wave timeline until killed — the DPS check (V2_HANDOFF.md §3.1).
   * Independent of `motorKind` — a designer can pair blocking with any motor pattern. */
  blocksConveyor: boolean;
  coinReward: number;
  isBoss?: boolean;
  /** HP restored per tick; regenerates up to maxHp. Used by tutorial guardian.
   * Meaning depends on `generatorKind` when set — see EnemyGeneratorModule. */
  regenPerTick?: number;
  /** 0–1 probability of dealing critMult × damage on a shot. */
  critChance: number;
  /** 0–1 probability of dealing 0 damage on a shot (bolt still fires visually). */
  missChance: number;
  /** Damage multiplier on a critical hit. */
  critMult: number;
  /** Module identity, separate from the display `kind` string — undefined on
   * hand-written consts that predate the module system; timeline.ts's spawnEnemy
   * defaults each to its behaviorally-inert value ('none'/'steady'/null). */
  weaponKind?: EnemyWeaponKind;
  shieldKind?: EnemyShieldKind | null;
  generatorKind?: EnemyGeneratorKind;
  motorKind?: EnemyMotorKind;
  /** Max shield absorb-buffer; 0 (or unset) means no SHIELD module. */
  shieldCapacity?: number;
  /** Scales this blocksConveyor enemy's support-call bonus payout with how long it
   * was held alive (combat.ts's bonusCallsForHoldCharge) instead of a flat 1. A named
   * trait, not inferred from `kind === 'blocker'` — set explicitly per spec so a new
   * modular "tank" role can opt in without silently changing turret/boss/guardian
   * payouts that were never meant to scale this way. */
  holdBonusTiered?: boolean;
  /** Shown above the HP number (CombatScene.ts's updateEnemyHpLabel) — a real identity
   * distinct from `kind` (the texture/behavior-family lookup). Undefined on specs that
   * predate this field; timeline.ts's spawnEnemy defaults it to the uppercased `kind`. */
  displayName?: string;
  /** A second, independent gun mounted at the rear — real extra DPS, not a cosmetic
   * variant of the front shot (combat.ts's fireEnemyRearWeapons runs as its own tick
   * phase, mirroring fireEnemyWeapons exactly). `null`/unset means no rear weapon —
   * zero behavior change for every spec that predates this field. Rendered from a
   * rear mount with a curved inbound trajectory (CombatScene.ts's spawnEnemyRearBolt),
   * distinct from the front weapon's straight drop. */
  rearWeaponKind?: EnemyWeaponKind | null;
  rearShotDamage?: number;
  rearTicksBetweenShots?: number;
  rearCritChance?: number;
  rearMissChance?: number;
  rearCritMult?: number;
}

export interface SpawnEvent {
  /** Fires when the motor-scaled timeline reaches this tick value. */
  atTimelineTick: number;
  kind: string;
  count: number;
  /** Lane distance between consecutive enemies of this event. */
  spacing: number;
}

export type StarFamily = 'boss-time' | 'finish-time' | 'hull-above' | 'all-kills' | 'shield-unbroken';

/** Benchmark stars (§3.4): evaluated per run, several can be earned at once. */
export interface StarSpec {
  id: string;
  family: StarFamily;
  /** boss-time / finish-time: max tick. hull-above: hull fraction. Others: unused (0). */
  threshold: number;
}

/** Pins the loadout for tutorial missions; the player's save is ignored for this run. */
export interface ForcedLoadout {
  weaponId: string | null;
  rearWeaponId?: string | null;
  sideWeaponId?: string | null;
  shieldId: string;
  generatorId: string;
  motorId: string;
  shipId?: string;
  /** Pre-gifted supply charges for the mission (supplyId → count). */
  suppliesGifted?: Record<string, number>;
}

export interface NarratorEvent {
  /** Fires once when timelineTick reaches this value. */
  atTimelineTick: number;
  /** Lines displayed one at a time; player clicks NEXT to advance. */
  lines: string[];
}

export interface MissionSpec {
  id: string;
  name: string;
  blurb: string;
  enemyKinds: Record<string, EnemySpec>;
  /** Must be sorted by atTimelineTick ascending. */
  events: SpawnEvent[];
  /** Timeline ticks at which the helper ship flies by with a card offer. */
  supportCallTicks: number[];
  stars: StarSpec[];
  completionCoins: number;
  /** Narrator popup events — time-based, pause the sim like pendingOffer. */
  narratorEvents?: NarratorEvent[];
  /**
   * If set, the very first support call in this mission offers exactly these three card IDs
   * instead of the normal weighted draw. Used by tutorial missions to guarantee a teaching
   * moment (e.g., "pick a damage card to overcome the regenerating guardian").
   */
  firstOfferIds?: [string, string, string];
  /**
   * Tutorial missions only: overrides the player's equipped loadout for this run.
   * The save is never mutated — the player's real equipment is unaffected.
   */
  forcedLoadout?: ForcedLoadout;
  /**
   * t1-t4 only: a defeat still counts as "completed" (full reward, unlocks the next
   * mission) — the teaching moment is seeing the mechanic once, not surviving it.
   * Deliberately NOT reused from forcedLoadout !== undefined (which also matches w0,
   * a different narrative beat that still requires a real victory).
   */
  completesOnDefeat?: boolean;
  /**
   * Which stretch of the campaign this mission belongs to (t1-t4 = 'tutorial', m1-m6 =
   * 'act1'). Undefined for missions outside both (w0, the runtime-generated daily) —
   * this is the "is this mission a tutorial" source of truth; `forcedLoadout` answers a
   * different question (does this mission override the player's real gear) and must
   * not be reused for this one, even though every current tutorial happens to set both.
   */
  campaign?: 'tutorial' | 'act1';
  /** Shown prominently on the defeat screen when set — a teaching line explaining what
   * went wrong and how to fix it, distinct from the mission's own blurb. */
  defeatHint?: string;
  /**
   * Strips the weapon from an otherwise-real, non-forced loadout (t1 only today — no
   * weapon so the shield/generator interaction is the whole lesson). Distinct from
   * `forcedLoadout`, which replaces the entire loadout and ignores the save: this
   * flag's whole point is to run on the player's REAL equipped generator/shield/motor
   * (so a shop switch actually changes the mission's outcome on retry) while removing
   * only the one slot the mission's teaching point requires gone.
   */
  disableWeapon?: boolean;
  /**
   * Pins the generator to a fixed catalog item regardless of what's really equipped —
   * same real-gear-except-one-slot shape as `disableWeapon` above, for missions whose
   * own lesson is a different module but whose difficulty would otherwise be
   * cross-contaminated by generator choice (t2 today: the ship's weapon and shield draw
   * from one shared energy pool, `core/energy.ts`'s `pulseShield`, so a strong
   * generator picked to fix an EARLIER mission silently makes THIS one easier too,
   * regardless of which weapon is equipped — the exact confound this field exists to
   * sever). Distinct from `neutralizeMotorForDaily` (`data/loadouts.ts`), which is
   * Daily-Mission-specific and not data-driven off a `MissionSpec` field.
   */
  neutralizeGeneratorId?: string;
  /**
   * Strips rear and side weapons from an otherwise-real loadout, regardless of what's
   * equipped — same real-gear-except-one-slot shape as `disableWeapon`/
   * `neutralizeGeneratorId` above, for missions whose tuning assumes the starter
   * loadout's `rearWeapon: null, sideWeapon: null` baseline. Rear weapons draw from the
   * same shared energy pool `neutralizeGeneratorId`'s doc describes and add independent
   * damage on top, so a rear weapon bought opportunistically with a prior mission's
   * coins (cheap and available well before any core-slot upgrade is affordable) quietly
   * does part of THIS mission's job too, regardless of which main weapon is equipped.
   */
  disableAuxWeapons?: boolean;
}

// ---------- Live state ----------

export interface EnemyState {
  id: number;
  kind: string;
  distance: number;
  hp: number;
  maxHp: number;
  shootTimer: number;
  speed: number;
  shotDamage: number;
  ticksBetweenShots: number;
  blocksConveyor: boolean;
  coinReward: number;
  isBoss: boolean;
  /** HP restored per tick; 0 means no regen. */
  regenPerTick: number;
  critChance: number;
  missChance: number;
  critMult: number;
  /** Ticks this enemy has spent alive on the conveyor while at least one other enemy
   * was also present (Item 6). Only accrues for `blocksConveyor` enemies; only read by
   * enemies with `holdBonusTiered` set to scale their bonus support-call payout. */
  holdChargeTicks: number;
  /** Ticks this enemy has been alive on the conveyor, unconditionally (F3). Only read
   * by `motorKind === 'stall-cycle'` enemies to drive their approach/stall cycle (see
   * conveyor.ts's `effectiveSpeed`) — but it's simplest to track for every enemy
   * uniformly. */
  aliveTicks: number;
  /** Module identity, mirrored from EnemySpec at spawn — see EnemySpec's own fields
   * for what each governs. Always set (defaulted by timeline.ts's spawnEnemy), unlike
   * the optional spec fields hand-written consts may omit. */
  weaponKind: EnemyWeaponKind | null;
  shieldKind: EnemyShieldKind | null;
  generatorKind: EnemyGeneratorKind;
  motorKind: EnemyMotorKind;
  holdBonusTiered: boolean;
  /** Current shield absorb-buffer (combat.ts's damageEnemy drains this before hp); 0 if
   * no SHIELD module. Mutates per tick (collision/weapon/shield-regen) — included in
   * hashCoreState's per-enemy hash alongside hp. */
  shield: number;
  /** Max shield buffer; immutable post-spawn — safe to leave out of hashCoreState,
   * same reasoning as `maxHp`. */
  shieldCapacity: number;
  /** Mirrored from EnemySpec at spawn (defaulted if unset) — see EnemySpec's own
   * comment. Immutable post-spawn, view-only: never included in hashCoreState. */
  displayName: string;
  /** Rear-mounted gun — see EnemySpec.rearWeaponKind's own comment. `null` means no
   * rear weapon (the default for every spec that predates this field, zero behavior
   * change). Mirrors the front weapon's own fields exactly, one slot over. */
  rearWeaponKind: EnemyWeaponKind | null;
  rearShotDamage: number;
  rearTicksBetweenShots: number;
  rearCritChance: number;
  rearMissChance: number;
  rearCritMult: number;
  /** Counts down independently of the front `shootTimer` — see fireEnemyRearWeapons. */
  rearShootTimer: number;
}

export type ShotEventKind =
  | 'player-crit' | 'player-miss'
  | 'enemy-crit' | 'enemy-miss'
  | 'enemy-rear-crit' | 'enemy-rear-miss'
  | 'enemy-killed' | 'shield-burst';

export interface ShotEvent {
  kind: ShotEventKind;
  enemyId?: number;
  /** 'enemy-killed' only — the coins actually credited for this kill (post shipCoinMult/
   * blockerCoinMult). The view uses this instead of the enemy's raw spec coinReward so a
   * collision self-death (never credited, see applyEnemyDeathEffects) never shows a coin
   * popup for money the player didn't actually receive. */
  coins?: number;
}

export interface ShipState {
  hull: number;
  maxHull: number;
  shield: number;
  energy: number;
  /** Counts down in ticks; fractional because brownout stretches it smoothly. */
  fireTimer: number;
  /** Counts down in ticks for the rear weapon; independent of front fireTimer. */
  rearFireTimer: number;
  /** Manual-fire charges remaining for the side weapon; refilled at mission start. */
  sideWeaponCharges: number;
}

export interface SupplyState {
  spec: SupplySpec;
  chargesLeft: number;
}

export type ActiveEffect =
  | { kind: 'damage-mult';     multiplier: number; expiresAtTick: number }
  | { kind: 'invulnerable';                        expiresAtTick: number }
  | { kind: 'generator-mult'; multiplier: number; expiresAtTick: number }
  | { kind: 'fire-rate-mult'; multiplier: number; expiresAtTick: number };

export type MissionStatus = 'running' | 'victory' | 'defeat';

export interface RunStats {
  shotsFired: number;
  rearShotsFired: number;
  sideShotsFired: number;
  damageDealt: number;
  /** Weapon kills only — a collision is not a kill (all-kills star tension). */
  kills: number;
  collisions: number;
  coinsEarned: number;
}

export interface CoreState {
  seed: number;
  tick: number;
  /** Advances by the motor multiplier each tick; stalls while a blocker is alive. */
  timelineTick: number;
  nextEventIndex: number;
  nextEnemyId: number;
  status: MissionStatus;
  ship: ShipState;
  enemies: EnemyState[];
  stats: RunStats;
  rng: SeededRng;
  loadout: LoadoutSnapshot;
  mission: MissionSpec;
  abilityPool: AbilityDefinition[];
  modifiers: RunModifiers;
  pickedAbilityIds: string[];
  /** Ordered action stream: -2 = reroll, -1 = skip, 0..2 = pick. Recorded in replays. */
  abilityActions: number[];
  /** While non-null the sim is paused; resolve via resolveAbilityAction. */
  pendingOffer: AbilityOffer | null;
  /** Whether the ship fires automatically. Player toggles this to accumulate energy for active abilities. */
  autoFireEnabled: boolean;
  /** Whether the rear weapon fires automatically. */
  rearWeaponEnabled: boolean;
  /** Whether the shield pulses automatically. */
  autoShieldEnabled: boolean;
  /** Player-marked front-weapon priority target (tap-to-target, front weapon only —
   * fable-fun-review-followup.md Item 4). Soft priority: the front weapon prefers this
   * enemy at target-slot 0 (full damage, no falloff) whenever it's still alive and
   * present; otherwise falls back to today's front-most targeting unchanged. Never
   * affects the rear or side weapons. */
  priorityTargetId: number | null;
  /** Active abilities slotted into the ability bar (max 3). */
  equippedAbilities: EquippedAbility[];
  rerollsLeft: number;
  supportCallsDone: number;
  bonusCallsPending: number;
  shotCounter: number;
  supplies: SupplyState[];
  activeEffects: ActiveEffect[];
  boostTaps: { tick: number; slot: number }[];
  /** Ticks at which the player manually fired the side weapon. Recorded in replays. */
  sideWeaponTaps: number[];
  /** Ticks at which `priorityTargetId` was changed (set or cleared). Recorded in
   * replays, same pattern as `boostTaps`. */
  priorityTargetTaps: { tick: number; enemyId: number | null }[];
  /** Tick the boss died to weapon fire, or null. Collisions don't count. */
  bossKillTick: number | null;
  shieldBroke: boolean;
  spawnedCount: number;
  /** Consecutive kills without the ship taking hull damage; resets in damageShip. */
  consecutiveKills: number;
  /** Total enemy-group wipe events this run; used by WINDMILL counter card. */
  wavesClearedThisRun: number;
  /** Crit/miss events from the current tick; cleared at the start of each tick; never hashed. */
  pendingVisualEvents: ShotEvent[];
  /**
   * Lines of the active narrator popup (pauses ticks like pendingOffer).
   * null = no popup. NOT included in hashCoreState (view-only display state).
   */
  pendingNarrator: string[] | null;
  /** atTimelineTick values of narrator events already fired; prevents re-fire. Included in hash. */
  firedNarratorTicks: number[];
}
