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

// ---------- Mission data ----------

export interface EnemySpec {
  kind: string;
  hp: number;
  /** Lane distance units travelled toward the ship per tick. */
  speed: number;
  shotDamage: number;
  ticksBetweenShots: number;
  /** Blockers pause the wave timeline until killed — the DPS check (V2_HANDOFF.md §3.1). */
  blocksConveyor: boolean;
  coinReward: number;
  isBoss?: boolean;
  /** HP restored per tick; regenerates up to maxHp. Used by tutorial guardian. */
  regenPerTick?: number;
  /** 0–1 probability of dealing critMult × damage on a shot. */
  critChance: number;
  /** 0–1 probability of dealing 0 damage on a shot (bolt still fires visually). */
  missChance: number;
  /** Damage multiplier on a critical hit. */
  critMult: number;
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
   * was also present (Item 6). Only accrues for `blocksConveyor` enemies; only a
   * `blocker`'s kill handler reads it to scale its bonus support-call payout. */
  holdChargeTicks: number;
  /** Ticks this enemy has been alive on the conveyor, unconditionally (F3). Only a
   * `boss` reads this — to drive its approach/stall cycle (see conveyor.ts's
   * `effectiveSpeed`) — but it's simplest to track for every enemy uniformly. */
  aliveTicks: number;
}

export type ShotEventKind = 'player-crit' | 'player-miss' | 'enemy-crit' | 'enemy-miss' | 'enemy-killed' | 'shield-burst';

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
