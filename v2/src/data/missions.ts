import { TICKS_PER_SECOND } from '../core/constants';
import { composeEnemy } from '../core/enemyCompose';
import type { EnemySpec, ForcedLoadout, MissionSpec, NarratorEvent, StarSpec } from '../core/types';

const seconds = (n: number): number => n * TICKS_PER_SECOND;

// ---------- Shared enemy archetypes ----------

const FODDER: EnemySpec = {
  kind: 'fodder', hp: 20, speed: 1.2, shotDamage: 2,
  ticksBetweenShots: seconds(2), blocksConveyor: false, coinReward: 5,
  critChance: 0, missChance: 0, critMult: 2.0,
};
const STRIKER: EnemySpec = {
  kind: 'striker', hp: 35, speed: 1.6, shotDamage: 3,
  ticksBetweenShots: seconds(1.5), blocksConveyor: false, coinReward: 8,
  critChance: 0.05, missChance: 0, critMult: 2.0,
};
const TANK: EnemySpec = {
  kind: 'tank', hp: 90, speed: 0.6, shotDamage: 5,
  ticksBetweenShots: seconds(2), blocksConveyor: false, coinReward: 15,
  critChance: 0, missChance: 0, critMult: 2.0,
};
const SWARM: EnemySpec = {
  kind: 'swarm', hp: 8, speed: 2.4, shotDamage: 1,
  ticksBetweenShots: seconds(1), blocksConveyor: false, coinReward: 3,
  critChance: 0, missChance: 0.1, critMult: 2.0,
};
const BLOCKER: EnemySpec = {
  kind: 'blocker', hp: 140, speed: 0.5, shotDamage: 4,
  ticksBetweenShots: seconds(1.5), blocksConveyor: true, coinReward: 25,
  critChance: 0.08, missChance: 0, critMult: 2.0,
  // Only blocksConveyor enemy whose bonus support-call payout scales with how long
  // it was held alive (combat.ts's bonusCallsForHoldCharge) — turret/boss/guardian
  // stay flat-1 on purpose, unchanged from before this was a named, explicit field.
  holdBonusTiered: true,
};
// Tuned via sim, not intuition: raising shotDamage only makes collision-tanking
// costlier, it never shifts the boss kill toward weapon damage (that's governed by
// weapon DPS vs. boss HP vs. approach time). It also risks breaking the `average`
// archetype's safe-by-design 100% campaign completion. See known-issues.md.
const BOSS: EnemySpec = {
  kind: 'boss', hp: 1900, speed: 0.25, shotDamage: 10,
  ticksBetweenShots: seconds(1), blocksConveyor: true, coinReward: 100, isBoss: true,
  critChance: 0.12, missChance: 0, critMult: 2.5,
  // Drives the approach/stall alternation (conveyor.ts's effectiveSpeed) — an
  // explicit MOTOR identity now, no longer inferred from kind === 'boss'.
  motorKind: 'stall-cycle',
};
const TURRET: EnemySpec = {
  kind: 'turret', hp: 80, speed: 0, shotDamage: 6,
  ticksBetweenShots: seconds(0.8), blocksConveyor: true, coinReward: 30,
  critChance: 0.10, missChance: 0.05, critMult: 2.0,
};
const KAMIKAZE: EnemySpec = {
  kind: 'kamikaze', hp: 25, speed: 2.8, shotDamage: 12,
  ticksBetweenShots: seconds(2), blocksConveyor: false, coinReward: 12,
  critChance: 0, missChance: 0.15, critMult: 2.0,
};
/**
 * Regen-buff variant: `regenPerTick` is not self-healing (see `regenerateEnemies` in
 * combat.ts) — it's granted every tick to whichever alive enemy is currently
 * nearest-ahead of the booster, distance-based and recomputed live. Slow (0.7, between
 * fodder's 1.2 and tank's 0.6) so it naturally lags behind faster units, giving it
 * something to buff for most of its lifetime. Low shotDamage — the threat is the buff,
 * not its own gun.
 */
const BOOSTER: EnemySpec = {
  kind: 'booster', hp: 45, speed: 0.7, shotDamage: 2,
  ticksBetweenShots: seconds(3), blocksConveyor: false, coinReward: 20,
  regenPerTick: 3, critChance: 0, missChance: 0, critMult: 2.0,
  // Feeds the nearest enemy ahead instead of self-healing (combat.ts's
  // regenerateEnemies) — an explicit GENERATOR identity now, no longer inferred
  // from kind === 'booster'.
  generatorKind: 'ally-regen',
};

/**
 * BREACHER / BREACHER GUNNER: t2's named wall drones (docs/plans/modular-enemies.md
 * — fewer, individually tougher than the old 18-count fodder wall, real modules
 * instead of an anonymous headcount). Deliberately a fresh spec, not a FODDER edit —
 * FODDER is shared by m1-m6 and this mission's numbers are tuned specifically for
 * t2's own pulse-fails/scatter-clears lesson. Both carry a real SHIELD (capacity 8,
 * absorbed before hp — genuine extra effective toughness, not cosmetic); GUNNER also
 * carries a real rear weapon (a second, independent gun, docs/plans/modular-enemies.md
 * — wave 2 escalates from "a wall" to "a wall that shoots back from both ends").
 *
 * Deliberately NOT given a real GENERATOR (generatorKind stays 'none', so the
 * always-on core glow the view draws — CombatScene.ts's drawEnemyGeneratorCore, shown
 * regardless of generatorKind — is purely cosmetic here): an early self-regen
 * candidate (sim-tested at hp=20-30/regen=0.5) inverted the whole lesson — a
 * single-target pulse loadout started CLEARING BETTER than scatter, because
 * concentrating damage on one target at a time occasionally outraces its regen while
 * scatter's thinner per-target damage lets regen claw back more of it, proportionally
 * — confirmed by sim, not assumed, and specifically why regen isn't just "free" to add
 * to every enemy that gets a generator module.
 *
 * hp=34/shotDamage=4/shield=8 (up from the plain-BREACHER draft's 45/4/0 once the
 * shield was added — shield contributes real extra effective toughness, so hp came
 * down to compensate), two waves of 3 half a second apart (down from FODDER's
 * 2+8+8=18): sim-verified (createCoreState + advanceTick sweep, 500 seeds/config)
 * against the pinned generator-torrent-1 this mission already neutralizes to —
 * pulse-1 (single-target) fails 0% of the time; scatter-1 (t2's intended same-level
 * free switch) clears 100% with real hull margin (~18% avg remaining).
 */
const BREACHER_MODULES = {
  weapon: { kind: 'stinger', shotDamage: 4, ticksBetweenShots: seconds(2), critChance: 0, missChance: 0, critMult: 2.0 },
  shield: { kind: 'aegis', capacity: 8 },
  generator: { kind: 'none', regenPerTick: 0 },
  motor: { kind: 'steady', speed: 1.2 },
  gunnerRear: { kind: 'lance', shotDamage: 3, ticksBetweenShots: seconds(3), critChance: 0, missChance: 0, critMult: 2.0 },
} as const;
const BREACHER: EnemySpec = composeEnemy(
  BREACHER_MODULES.weapon, BREACHER_MODULES.shield, BREACHER_MODULES.generator, BREACHER_MODULES.motor,
  // Own `kind` (docs/plans/enemy-hull-redesign.md) — was 'fodder', silently sharing
  // FODDER's texture. Hand-drawn-per-named-enemy needs a distinct kind per archetype.
  { kind: 'breacher', hp: 34, coinReward: 5, displayName: 'BREACHER' },
);
const BREACHER_GUNNER: EnemySpec = composeEnemy(
  BREACHER_MODULES.weapon, BREACHER_MODULES.shield, BREACHER_MODULES.generator, BREACHER_MODULES.motor,
  {
    kind: 'breacher-gunner', hp: 34, coinReward: 5, displayName: 'BREACHER GUNNER',
    rearWeapon: BREACHER_MODULES.gunnerRear,
  },
);

/** 4-star set used by tutorial missions: hull ×2, all-kills, shield-unbroken. */
function standardStars(missionId: string): StarSpec[] {
  return [
    { id: `${missionId}-hull-50`, family: 'hull-above', threshold: 0.5 },
    { id: `${missionId}-hull-90`, family: 'hull-above', threshold: 0.9 },
    { id: `${missionId}-all-kills`, family: 'all-kills', threshold: 0 },
    { id: `${missionId}-shield`, family: 'shield-unbroken', threshold: 0 },
  ];
}

// ---------- Welcome mission ----------

const FODDER_EASY: EnemySpec = {
  kind: 'fodder', hp: 6, speed: 0.7, shotDamage: 1,
  ticksBetweenShots: seconds(4), blocksConveyor: false, coinReward: 2,
  critChance: 0, missChance: 0.3, critMult: 2.0,
};

const W0_NARRATOR_EVENTS: NarratorEvent[] = [
  {
    atTimelineTick: 0,
    lines: [
      'Commander. Welcome to the Nesro Nova training range.',
      'Your ship is equipped with a pulse laser. The generator charges it over time.',
    ],
  },
  {
    atTimelineTick: seconds(7),
    lines: [
      'Good work. Watch the energy bar — when it runs low, your fire rate drops.',
      "That's the brownout. It recovers on its own. You'll never fully stall.",
    ],
  },
  {
    // Matches ResultScene.ts's actual two-button w0 branch (TUTORIAL/EXPLORE). w0 itself
    // is currently unreachable by real players (see known-issues.md).
    atTimelineTick: seconds(17),
    lines: [
      'Two paths open from this station.',
      'Tutorial missions will walk you through each system step by step.',
      'Or skip straight into the sector and figure things out the hard way.',
    ],
  },
  {
    atTimelineTick: seconds(37),
    lines: [
      "That's the calibration complete. Not bad.",
      'Head to the station and choose your path.',
    ],
  },
];

const WELCOME_MISSION: MissionSpec = {
  id: 'w0', name: 'Calibration Run', completionCoins: 50,
  blurb: 'Instructor standing by. Destroy the targets.',
  enemyKinds: { fodder: FODDER_EASY },
  events: [
    { atTimelineTick: seconds(2),  kind: 'fodder', count: 2, spacing: 22 },
    { atTimelineTick: seconds(14), kind: 'fodder', count: 3, spacing: 18 },
    { atTimelineTick: seconds(24), kind: 'fodder', count: 3, spacing: 16 },
    { atTimelineTick: seconds(33), kind: 'fodder', count: 4, spacing: 14 },
  ],
  supportCallTicks: [],
  stars: [],
  forcedLoadout: { shieldId: 'shield-wall-1', generatorId: 'generator-torrent-1', motorId: 'motor-rush-1', weaponId: 'pulse-1' },
  narratorEvents: W0_NARRATOR_EVENTS,
};

// ---------- Tutorial loadout presets ----------

const TUTORIAL_LOADOUT_BASE: Omit<ForcedLoadout, 'weaponId'> = {
  shieldId: 'shield-wall-1',
  generatorId: 'generator-torrent-1',
  motorId: 'motor-rush-1',
};

// ---------- Tutorial enemy archetypes ----------

/**
 * SENTINEL: t1's two named guardians (docs/plans/modular-enemies.md — fewer,
 * individually stronger, real identity instead of an anonymous headcount). No
 * weapon, so the ship must "let them reach you" — the shield absorbs the collision
 * (routed shield-first, conveyor.ts) and bursts a fraction of the absorbed damage
 * back onto the other surviving guardian (SHIELD_BURST_RETURN). missChance=0.9 keeps
 * direct shot pressure non-lethal, so collisions (not ranged fire) are what the
 * mission is actually testing.
 *
 * speed 2.5 stays under kamikaze's 2.8 — the fastest enemy in the game — so this
 * never becomes the single fastest thing on screen and reads as an unreadable blink
 * instead of a real "the shield absorbs a hit" beat.
 *
 * hp=40/shotDamage=16 (up from the old 5-count wave's 25/8): sim-verified (createCoreState
 * + advanceTick sweep, 500-1000 seeds/config) at these numbers with the mission's own
 * spacing=100 — generator-torrent-1 (the real starter default) fails 0% of the time;
 * generator-surge-1 (t1's intended shop fix) clears 100% with real hull margin (~7%
 * avg remaining). Same fail/fix split the old 5-count wave held, reproduced at 2.
 */
// SENTINEL carries a real SHIELD + GENERATOR (not null/'none') for visual completeness
// — docs/plans/modular-enemies.md's "every enemy has all four modules as real hull
// parts, not just the ones that matter this mission." Balance-safe to add here
// specifically: t1 has no weapon at all (disableWeapon), so nothing ever damages a
// guardian via ranged fire; the only thing that ever touches a guardian's own hp/
// shield is the shield-burst splash (conveyor.ts) when the OTHER guardian collides —
// and no mission outcome depends on a guardian's own survival state, only the ship's
// hull/shield. Confirmed unchanged via the same torrent-fails/surge-clears sim sweep
// used to tune the wave itself (see SENTINEL's own comment above).
const SENTINEL_MODULES = {
  weapon: { kind: 'stinger', shotDamage: 16, ticksBetweenShots: seconds(3), critChance: 0, missChance: 0.9, critMult: 2.0 },
  shield: { kind: 'aegis', capacity: 20 },
  generator: { kind: 'self-regen', regenPerTick: 1 },
  motor: { kind: 'steady', speed: 2.5 },
} as const;
const SENTINEL: EnemySpec = composeEnemy(
  SENTINEL_MODULES.weapon, SENTINEL_MODULES.shield, SENTINEL_MODULES.generator, SENTINEL_MODULES.motor,
  // Own `kind` (docs/plans/enemy-hull-redesign.md) — was 'guardian', silently
  // sharing t3's GUARDIAN_REGEN texture despite being a thematically distinct
  // disposable training drone.
  { kind: 'sentinel', hp: 40, coinReward: 15, displayName: 'SENTINEL' },
);

/**
 * Regenerating guardian for t3: regen (2.2/tick = 22 HP/s, 5 ticks/cycle = 11/cycle)
 * exceeds base weapon DPS (pulse-1: 10 dmg / 5-tick cycle) — the guardian heals back to
 * full between every shot and is genuinely unkillable at base damage, not just slowed.
 * A +30% damage card (13/cycle) breaks through at a net -2.5 HP/cycle. Without it, the
 * guardian never dies — its own fire (shotDamage 10 every 2s) is what fails the mission
 * for a wrong pick or a skip, well before its slow (speed 0.3) approach would ever
 * collide (t3 has real stakes now — see this mission's completesOnDefeat: false).
 */
const GUARDIAN_REGEN: EnemySpec = {
  kind: 'guardian', hp: 55, speed: 0.3, shotDamage: 10,
  ticksBetweenShots: seconds(2), blocksConveyor: true, coinReward: 20,
  regenPerTick: 2.1, critChance: 0, missChance: 0, critMult: 2.0,
  // Self-heals (combat.ts's regenerateEnemies) — an explicit GENERATOR identity now,
  // matching the pre-existing default behavior (anything not 'ally-regen' self-heals).
  generatorKind: 'self-regen',
  // Explicit module identity so its gun mount gets a real shape (drawEnemyGunMountShape)
  // instead of the generic null-fallback — a slow, heavy 2s cadence fits 'lance' best.
  weaponKind: 'lance',
};

/**
 * The minimum `SpawnEvent.spacing` (distance units, same scale as `LANE_LENGTH=100`)
 * that keeps two same-kind enemies from visually overlapping on screen.
 *
 * Derived from CombatScene.ts's `ENEMY_VISUAL_RADIUS` (view-layer, not importable
 * here — Phaser can't be pulled into src/data) and `laneToY`'s linear distance→screen-Y
 * mapping: `scale(kind) = (430 - (26 + radius(kind))) / 100` logical px per spacing
 * unit (26 = SHIP_VISUAL_RADIUS, 430/100 = (SHIP_Y − GAME_TOP_Y)/LANE_LENGTH), so
 * `minSpacing(kind) = ceil((2·radius(kind) + 4) / scale(kind))` — the +4 is a small
 * fixed visual buffer beyond exact sprite-edge contact, not a percentage margin.
 * `missions.test.ts` enforces this floor for every wave event; keep this table in sync
 * by hand if `ENEMY_VISUAL_RADIUS` ever changes.
 */
export const MIN_VISUAL_SPACING: Partial<Record<string, number>> = {
  fodder: 14, striker: 15, tank: 16, swarm: 9, blocker: 19,
  guardian: 15, turret: 18, kamikaze: 12, boss: 29, booster: 15,
  // Own kinds (docs/plans/enemy-hull-redesign.md) — same value as the same-size-class
  // kind they used to silently share a texture with (fodder-tier for both BREACHERs,
  // guardian-tier for SENTINEL); keep in sync if their own ENEMY_VISUAL_RADIUS ever
  // diverges from that class once their hulls are hand-drawn.
  breacher: 14, 'breacher-gunner': 14, sentinel: 15,
};

// ---------- Tutorial narrator events ----------
// Tutorials use the blocking modal (checkNarratorEvents/pendingNarrator in
// core/tick.ts, rendered by CombatScene.ts) instead of the passive bottom bar; each
// tutorial's 'first-support-call' bottom-bar line stays since that beat is a
// non-blocking aside while the card overlay is the main focus.
//
// CombatScene.ts's NARRATOR_ARROW_TARGETS points a live arrow at a HUD bar for specific
// line indices in these arrays — kept in sync by hand: reordering or adding lines here
// requires updating that lookup too.
//
// Accuracy constraints on t1/t2's generator lines: only claim refill rate improves with
// a better module — capacity does NOT increase on every generator kind (items.ts's
// GENERATOR_BASE; torrent's caps decrease with level, and torrent is what
// TUTORIAL_LOADOUT_BASE gives every tutorial player). The DISPATCH REINFORCEMENTS line
// says "on real missions" rather than "after it": t2's own support call is scripted via
// `firstOfferIds` below and bypasses the subscription-derived pool entirely
// (createAbilityOffer, core/cards.ts), and every tutorial's resolveForcedLoadout sets
// subscriptionCardIds: [] (loadouts.ts) — so the claim is only true outside a tutorial.
//
// t1 has two narratorEvents, not one: the first (tick 0) sets up the concepts before
// any enemy arrives; the second pauses right after the first SENTINEL's collision
// resolves so the lines can point at real, freshly-changed numbers instead of
// describing the mechanic in the abstract beforehand. atTimelineTick: 55 is picked to
// land safely after the first collision, not before it — SPAWN_JITTER means the first
// collision's exact tick varies by seed (sim-confirmed range: 46-53 — unchanged by the
// 2-count redesign, since only the SECOND SENTINEL's spawn distance depends on
// `spacing`; the first's depends only on LANE_LENGTH), so this is a safe-margin value,
// not the single "the" tick a deterministic run would hit. If SENTINEL's speed or this
// event's spawn tick/count ever change, recompute via runMission's own sampleTick
// policy (core/replay.ts), watching state.stats.collisions for the first increment
// across several seeds — not just one — rather than eyeballing a new value; this tick
// doubles as CombatScene.ts's NARRATOR_ARROW_TARGETS event-index key (t1[1]).
const T1_NARRATOR_EVENTS: NarratorEvent[] = [
  {
    atTimelineTick: 0,
    lines: [
      'Your ship runs on four core modules, Commander: WEAPON, SHIELD, GENERATOR, MOTOR — swap and upgrade each one from the shop between missions.',
      'No weapon loaded for this run. Your SHIELD is the only thing between you and them — let them close in.',
      'Your GENERATOR constantly fills the ENRG bar. Once it\'s full, it discharges straight into your SHIELD, then starts refilling.',
      'Watch the SHLD bar when they hit — every collision drains it before your hull takes any damage.',
    ],
  },
  {
    atTimelineTick: 55,
    lines: [
      'That collision drained real SHLD — a stronger SHIELD module absorbs more before it breaks, and a stronger GENERATOR refills it faster.',
      'Some of what your shield just absorbed bounces back onto the nearest other guardian — that blue number is shield backlash, not weapon fire. Different SHIELD kinds spread that backlash differently.',
    ],
  },
];
const T2_NARRATOR_EVENTS: NarratorEvent[] = [
  {
    atTimelineTick: 0,
    lines: [
      'Your laser draws energy on every shot — watch that bar.',
      'It refills on its own between shots. Run it too low and your fire rate slows — but it never stops.',
      "This generator runs at a fixed baseline for this fight — it's your WEAPON that decides if this wall goes down.",
      "A dense wall's inbound. Single-target fire will bog down against it.",
    ],
  },
];
// Both missions' second event fires a couple ticks before their own supportCallTicks[0]
// (t3: 20, t4: 90) — close enough to read as "right before the choice appears," but far
// enough that checkNarratorEvents (core/tick.ts) resolves and clears pendingNarrator on
// an earlier tick, so maybeTriggerSupportCall's own pendingOffer never has to contend
// with a still-open modal on the exact same tick.
const T3_NARRATOR_EVENTS: NarratorEvent[] = [
  {
    atTimelineTick: 0,
    lines: [
      'That guardian regenerates faster than your base damage.',
      'You will not out-shoot it alone. Wait for support.',
      "A stronger FRONT WEAPON module raises your base damage permanently — worth checking after this fight.",
    ],
  },
  {
    atTimelineTick: seconds(1.8),
    lines: [
      "Support window opening. Shield and generator upgrades won't touch this thing's regen — only raw damage has a shot.",
    ],
  },
];
const T4_NARRATOR_EVENTS: NarratorEvent[] = [
  {
    atTimelineTick: 0,
    lines: [
      'Two reserve supplies are preloaded on your right panel.',
      'Tap them when you need a burst of shield or damage — no wrong pick here, this fight is just built for testing them.',
      "More charges, and new supply kinds, are yours in the shop's SUPPLIES tab — stock up before your next run.",
    ],
  },
  {
    atTimelineTick: seconds(8.8),
    lines: [
      "Support window opening. Pick whatever helps — and don't forget those reserves are sitting ready too.",
    ],
  },
];

/**
 * Shown instead of the first-attempt scripts above on a retry after a real defeat
 * (SaveManager.ts's narratorEventsForAttempt, keyed on t1FailedOnce/t2FailedOnce/
 * t3FailedOnce) — short, acknowledges the fix already made, and deliberately doesn't
 * name a HUD row (NARRATOR_ARROW_TARGETS, CombatScene.ts, only has entries for the
 * first-attempt scripts above; a player retrying already knows where SHLD/ENRG live).
 */
const T1_RETRY_NARRATOR_EVENTS: NarratorEvent[] = [
  { atTimelineTick: 0, lines: ["Same wave, new generator. Let's see if it can keep the shield charged this time."] },
];
const T2_RETRY_NARRATOR_EVENTS: NarratorEvent[] = [
  { atTimelineTick: 0, lines: ['New weapon loaded. Let\'s see if it breaks through this wall.'] },
];
const T3_RETRY_NARRATOR_EVENTS: NarratorEvent[] = [
  { atTimelineTick: 0, lines: ["Different pick this time — that guardian's regen still won't wait for you."] },
];
const RETRY_NARRATOR_EVENTS: Record<string, NarratorEvent[]> = {
  t1: T1_RETRY_NARRATOR_EVENTS,
  t2: T2_RETRY_NARRATOR_EVENTS,
  t3: T3_RETRY_NARRATOR_EVENTS,
};

/**
 * Which narratorEvents a mission should actually run with THIS attempt — the mission's
 * own first-attempt script, unless the matching `*FailedOnce` flag is already set, in
 * which case the shorter retry-aware script above takes over. Takes the three flags
 * directly (not a `SaveData`) so this file never needs to import from save/SaveManager
 * — that module already imports FROM here (missionById, MISSION_UNLOCK_EDGES).
 */
export function narratorEventsForAttempt(
  mission: MissionSpec,
  failedOnce: { t1: boolean | undefined; t2: boolean | undefined; t3: boolean | undefined },
): NarratorEvent[] | undefined {
  const retryVariant = RETRY_NARRATOR_EVENTS[mission.id];
  if (retryVariant === undefined) return mission.narratorEvents;
  const failedBefore = mission.id === 't1' ? failedOnce.t1 : mission.id === 't2' ? failedOnce.t2 : failedOnce.t3;
  return failedBefore === true ? retryVariant : mission.narratorEvents;
}

// ---------- Tutorial missions ----------

const TUTORIAL_MISSIONS: MissionSpec[] = [
  // completesOnDefeat splits the four tutorials by whether they hold the player
  // accountable for something: t4 (use the preloaded supplies or don't — a spectrum,
  // not a right/wrong pick) completes on defeat, since there's nothing to hold the
  // player accountable for. t1/t2/t3 (a starting-gear mismatch or a support-card pick
  // that must be corrected to survive) do NOT — a mission that can't fail teaches
  // nothing, so a wrong starting point or pick is a genuine, intended failure requiring
  // a retry (t1/t2 via a free gear switch in the shop; t3 via a correct card pick).
  {
    id: 't1', name: 'Shield Basics', completionCoins: 30, campaign: 'tutorial',
    blurb: 'No weapon. Two Sentinels — your shield is the only defense, and this generator can\'t keep it charged.',
    enemyKinds: { sentinel: SENTINEL },
    // Both SENTINELs come from ONE event (not two count:1 events) so SPAWN_JITTER's
    // once-per-event roll keeps their relative spacing exactly 100 apart in every
    // run — splitting them into separate events would let each draw its own jitter
    // independently, silently breaking the sim-verified spacing this mission's whole
    // win condition depends on. spacing=100 is load-bearing twice over: it's the real-
    // time gap generator-surge-1 needs to refill the shield before the second
    // collision (sim-confirmed: torrent-1 fails 0%, surge-1 clears 100% at this gap),
    // and it's tight enough that the second SENTINEL is still on-screen (distance <=
    // LANE_LENGTH) at the exact moment the first collides — required for the
    // shield-burst mechanic below to have a real target (sim-confirmed: burst landed
    // in 100/100 probe runs at this spacing).
    events: [
      { atTimelineTick: seconds(1), kind: 'sentinel', count: 2, spacing: 100 },
    ],
    supportCallTicks: [],
    // Tutorial stars never reach the player (isTutorial always renders "TRAINING
    // MISSION / No stars awarded", viewmodel/result.ts) — internal bookkeeping only.
    // Both of t1's former stars are permanently unreachable under the one real fix here
    // (generator-surge-1, sim-confirmed 0% for hull-above 0.5 and shield-unbroken alike
    // — shield always breaks at least once, conveyor.ts routes shield-first) — dropped
    // rather than kept dead, matching t2/t3's own precedent.
    stars: [],
    // No forcedLoadout: this mission runs on the player's REAL equipped gear (weapon
    // stripped via disableWeapon below), same as t2 — a forced loadout is replaced
    // fresh every attempt (ForcedLoadout's own doc comment: "the player's save is
    // ignored for this run"), so a shop fix would never actually change anything on
    // retry. torrent-1 (defaultSave()'s real starter generator) can't refill the
    // shield fast enough against SENTINEL's two collisions — sim-confirmed 0% clear at
    // the current 2-count/hp/shotDamage numbers, and so are reserve-1 and steady-1
    // (also 0%, unlike the old 5-count wave where steady-1 was a real ~52% coin-flip —
    // at 2 hits the margin for a partial fix collapsed entirely, leaving exactly one
    // real fix path, same as t2/t3). generator-surge-1 ("maximum output, tiny battery")
    // is the one kind whose fast small-batch refill reliably keeps pace — a free
    // same-level switch, sim-confirmed 100% clear with real margin (~7% avg hull), and
    // now also earns a real shield-burst kill (a guardian's own coinReward, same
    // universal per-kill path every mission uses) — burst damage only accumulates when
    // the shield is actually absorbing hits, which structurally can't happen on a
    // losing run, so a real fail still nets 0 coins, same as any other mission where
    // the ship dies before a kill lands.
    disableWeapon: true,
    completesOnDefeat: false,
    defeatHint: 'Your generator can\'t refill the shield fast enough to keep up with these hits. Look for a generator built for rapid output over capacity — it\'s a free switch at this level.',
    narratorEvents: T1_NARRATOR_EVENTS,
  },
  {
    id: 't2', name: 'Weapon Systems', completionCoins: 50, campaign: 'tutorial',
    blurb: 'Your real gear, a real wall of Breachers — the second wave shoots back from both ends. If it beats you, the fix is a free switch away in the shop.',
    enemyKinds: { breacher: BREACHER, 'breacher-gunner': BREACHER_GUNNER },
    // No forcedLoadout — this mission runs on the player's real, equipped gear. Under
    // the forced tutorial chain (t1 is the only mission that can precede it, and t1's
    // 30-coin reward can't afford any tier change) that's always exactly starter
    // pulse-1/wall-1/torrent-1/rush-1 on a genuinely first attempt. Two waves of 3 half
    // a second apart (not FODDER's old 2+8+8=18): plain BREACHERs first, rear-armed
    // BREACHER GUNNERs second — see BREACHER's own doc comment for the sim numbers
    // this reproduces at a sixth of the old headcount.
    events: [
      { atTimelineTick: seconds(3), kind: 'breacher', count: 3, spacing: 14 },
      { atTimelineTick: seconds(3.5), kind: 'breacher-gunner', count: 3, spacing: 14 },
    ],
    supportCallTicks: [],
    // hull-90/hull-50/shield-unbroken all dropped: even the fixed (scatter) path clears
    // with real, by-design damage taken (avg hull ~18%) — none of those thresholds are
    // reachable. all-kills is reachable on every real clear (sim-confirmed, 100%).
    stars: [
      { id: 't2-all-kills', family: 'all-kills', threshold: 0 },
    ],
    // Real stakes, same as t3 below — a wrong/unfixed loadout is a genuine, intended
    // failure, not a near-miss; see docs/known-issues.md and 13-balance-and-tuning.md.
    completesOnDefeat: false,
    defeatHint: 'Your weapon hits one target at a time — this wall needs more spread than that. The shop has a same-level switch that fixes it, and it costs nothing.',
    narratorEvents: T2_NARRATOR_EVENTS,
    // The ship has exactly one shared energy pool — the shield's own auto-pulse
    // (core/energy.ts's pulseShield) draws from and gates on the same number
    // fireShipWeapon does. A generator picked to fix t1 (generator-surge-1) carries
    // into this mission on real gear and clears this wall regardless of which weapon
    // is equipped (sim-confirmed), since t1's fix and t2's own difficulty both hinge on
    // the same shared resource. Pinned to generator-torrent-1 — the real starter
    // default the numbers above were tuned against — so t2 stays a genuine test of the
    // WEAPON specifically, the one thing this mission is actually about.
    neutralizeGeneratorId: 'generator-torrent-1',
    // A rear weapon draws from that same shared energy pool and adds independent
    // damage on top — and it's the cheapest opportunistic purchase in the whole shop
    // (30 coins, no core-slot upgrade is affordable yet), so a player who buys one
    // with t1's completion coins carries it straight into t2 and clears regardless of
    // main weapon (sim-confirmed). Stripped for the same reason the generator is
    // pinned above: this mission's own lesson is the main WEAPON specifically.
    disableAuxWeapons: true,
  },
  {
    id: 't3', name: 'Support Cards', completionCoins: 60, campaign: 'tutorial',
    blurb: 'It heals faster than you shoot. You need the right card to break through.',
    // One guardian only: the problem and the solution land on the same enemy (watch it
    // out-heal you, the card breaks it).
    //
    // supportCallTicks must fire at or before the guardian's own spawn tick (seconds(3)).
    // `blocksConveyor: true` freezes `state.timelineTick` entirely once the guardian
    // spawns (timeline.ts's advanceTimeline — the same mechanic that makes a blocker a
    // DPS check), so any call scheduled after that tick never fires. seconds(2) works
    // because the guardian's spawn and maybeTriggerSupportCall both run inside the same
    // advanceTimeline call, using timelineTick's value from before the freeze applies.
    enemyKinds: { guardian: GUARDIAN_REGEN },
    events: [
      { atTimelineTick: seconds(3), kind: 'guardian', count: 1, spacing: 0 },
    ],
    supportCallTicks: [seconds(2)],
    // w-dmg-30 is the only pick that ever damages the guardian net-negative (see
    // GUARDIAN_REGEN's own comment) — s-cap-20/g-out-08/skip all leave it fully
    // unkillable, and its own fire (not its collision) is what fails the mission for a
    // wrong pick (sim-verified, 2000 runs/pick: w-dmg-30 100% clear, everything else
    // ~0%). Real stakes now — see completesOnDefeat: false below.
    firstOfferIds: ['w-dmg-30', 's-cap-20', 'g-out-08'],
    // t3-shield dropped: the survivable (right-pick) path takes real shield damage by
    // design now, so shield-unbroken is permanently unreachable — same reasoning as
    // t2's dropped hull-90/shield-unbroken stars above.
    stars: [
      { id: 't3-hull-50', family: 'hull-above', threshold: 0.5 },
      { id: 't3-all-kills', family: 'all-kills', threshold: 0 },
    ],
    forcedLoadout: { ...TUTORIAL_LOADOUT_BASE, weaponId: 'pulse-1' },
    // Not completesOnDefeat, unlike t1/t4 — see t2's own comment on this same field.
    completesOnDefeat: false,
    narratorEvents: T3_NARRATOR_EVENTS,
  },
  {
    id: 't4', name: 'Battle Supplies', completionCoins: 70, campaign: 'tutorial',
    // Deliberately NOT another fail-then-fix mission like t1/t2/t3 — no starting-gear
    // mismatch or decision to get wrong here, just optional tools to try. The blurb/
    // narrator copy says so explicitly since a player who just retried three straight
    // "you will fail without the fix" tutorials would otherwise expect a fourth.
    blurb: "Two supplies are preloaded. No wrong pick this time — just try them and see what they do.",
    enemyKinds: { fodder: FODDER, striker: STRIKER },
    events: [
      { atTimelineTick: seconds(3), kind: 'fodder', count: 5, spacing: 14 },
      { atTimelineTick: seconds(11), kind: 'striker', count: 3, spacing: 15 },
    ],
    supportCallTicks: [seconds(9)],
    stars: standardStars('t4'),
    forcedLoadout: {
      ...TUTORIAL_LOADOUT_BASE,
      weaponId: 'pulse-1',
      suppliesGifted: { 'sup-damage': 1, 'sup-shield': 1 },
    },
    completesOnDefeat: true,
    narratorEvents: T4_NARRATOR_EVENTS,
  },
];

// ---------- The demo mission tree (single sector, star-gated) ----------
// Target duration: ~5 minutes per mission (motor-1 baseline, no card upgrades).
// Structure: escalating waves over ~0–210s, support calls every ~32s stopping
// at ~80% of timeline, then a final push (last ~60–80s) that introduces one
// harder enemy type not seen earlier in that mission.

export const ALL_MISSIONS: MissionSpec[] = [
  WELCOME_MISSION,
  ...TUTORIAL_MISSIONS,

  // ── m1: First Contact ────────────────────────────────────────────────────
  // A single striker "scout" at second 50 previews the finale threat early rather than
  // saving it for the very end. The 72-112s stretch alternates dense/sparse/dense
  // instead of flat repetition so the lane visibly breathes. That still trips `pnpm
  // pacing`'s MONOTONY threshold on its own same-kind streak — reviewed and accepted
  // (see known-issues.md); going lower reopens a difficulty cliff (count 9→10 on the
  // dense waves alone swings clear-rate from ~90% to ~77.5%, under the ≥85% floor).
  {
    id: 'm1', name: 'First Contact', completionCoins: 120, campaign: 'act1',
    blurb: 'Loose fodder drifting in. Warm up the laser.',
    enemyKinds: { fodder: FODDER, striker: STRIKER },
    events: [
      { atTimelineTick: seconds(2),   kind: 'fodder',  count: 3,  spacing: 14 },
      { atTimelineTick: seconds(12),  kind: 'fodder',  count: 4,  spacing: 14 },
      { atTimelineTick: seconds(22),  kind: 'fodder',  count: 5,  spacing: 14 },
      { atTimelineTick: seconds(32),  kind: 'fodder',  count: 5,  spacing: 14 },
      { atTimelineTick: seconds(42),  kind: 'fodder',  count: 6,  spacing: 14 },
      // Scout — a visibly faster, differently-colored enemy previewing the finale.
      // This scout plus the two dense fodder waves right after it (52-72s) are where
      // nearly all shield breaks happen — spacing is loosened through this stretch only
      // (counts unchanged, so the monotony fix above stays intact) to keep
      // shield-unbroken reachable; see known-issues.md.
      { atTimelineTick: seconds(50),  kind: 'striker', count: 1,  spacing: 0  },
      { atTimelineTick: seconds(52),  kind: 'fodder',  count: 7,  spacing: 14 },
      { atTimelineTick: seconds(64),  kind: 'fodder',  count: 7,  spacing: 14 },
      // Collapsed 72-112s stretch: dense-tight → sparse-fast breather → dense-tight.
      { atTimelineTick: seconds(76),  kind: 'fodder',  count: 9,  spacing: 14  },
      { atTimelineTick: seconds(90),  kind: 'fodder',  count: 6,  spacing: 18 },
      { atTimelineTick: seconds(108), kind: 'fodder',  count: 9,  spacing: 14  },
      { atTimelineTick: seconds(122), kind: 'fodder',  count: 7,  spacing: 14  },
      // Fewer, tougher strikers instead of another fodder wave — breaks the fodder-only
      // streak above without adding on top of it (roughly equivalent total threat).
      { atTimelineTick: seconds(132), kind: 'striker', count: 3,  spacing: 16 },
      // Final push — strikers introduced, with one support call to prep for them
      { atTimelineTick: seconds(148), kind: 'striker', count: 3,  spacing: 16 },
      { atTimelineTick: seconds(164), kind: 'striker', count: 3,  spacing: 15 },
      { atTimelineTick: seconds(180), kind: 'striker', count: 3,  spacing: 15 },
    ],
    supportCallTicks: [
      seconds(20), seconds(44), seconds(68), seconds(92),
      seconds(116), seconds(140), seconds(162),
    ],
    // Time-star thresholds (T1-T4) are anchored to distinct fixed loadouts, not
    // percentile splits of one loadout — run duration barely varies run-to-run once
    // card choice is this constrained, so percentiles of the same loadout collapse
    // toward the same value. T1 is the intended loadout's own 75th percentile (185.5s).
    // T2/T3/T4 each clear on a progressively stronger fixed reference loadout defined in
    // loadoutPresets.ts (`timeStarT2Loadout`/`timeStarT3Loadout`/`timeStarT4Loadout` —
    // weapon3/shield3/gen4/motor2, weapon4/shield3/gen5/motor2, weapon5/shield4/gen5/
    // motor3), each verified ≥98% clear across every main mission that uses it
    // (m1/m2/m3/m3b/m4 for T2 — see that function's own comment for why m5/m6 differ).
    // `pnpm sim --mission m1 --loadout t2/t3/t4 --percentiles`, 2000 runs.
    stars: [
      { id: 'm1-time-t1', family: 'finish-time', threshold: seconds(185.5) },
      { id: 'm1-time-t2', family: 'finish-time', threshold: seconds(93.2) },
      { id: 'm1-time-t3', family: 'finish-time', threshold: seconds(92.0) },
      { id: 'm1-time-t4', family: 'finish-time', threshold: seconds(61.5) },
      { id: 'm1-hull-50', family: 'hull-above', threshold: 0.5 },
      { id: 'm1-hull-90', family: 'hull-above', threshold: 0.9 },
      { id: 'm1-all-kills', family: 'all-kills', threshold: 0 },
      { id: 'm1-shield', family: 'shield-unbroken', threshold: 0 },
    ],
  },

  // ── m2: Picket Line ──────────────────────────────────────────────────────
  // Fodder + strikers alternating, 1 blocker mid-mission → tank final push.
  {
    id: 'm2', name: 'Picket Line', completionCoins: 180, campaign: 'act1',
    blurb: 'Strikers hit harder and close in fast.',
    enemyKinds: { fodder: FODDER, striker: STRIKER, blocker: BLOCKER, tank: TANK },
    events: [
      { atTimelineTick: seconds(2),   kind: 'fodder',  count: 3,  spacing: 14 },
      { atTimelineTick: seconds(9),   kind: 'fodder',  count: 1,  spacing: 0  },
      { atTimelineTick: seconds(15),  kind: 'fodder',  count: 4,  spacing: 14 },
      { atTimelineTick: seconds(28),  kind: 'striker', count: 2,  spacing: 18 },
      { atTimelineTick: seconds(42),  kind: 'fodder',  count: 5,  spacing: 14 },
      { atTimelineTick: seconds(56),  kind: 'striker', count: 3,  spacing: 17 },
      { atTimelineTick: seconds(70),  kind: 'fodder',  count: 6,  spacing: 14 },
      { atTimelineTick: seconds(84),  kind: 'striker', count: 3,  spacing: 16 },
      { atTimelineTick: seconds(98),  kind: 'fodder',  count: 6,  spacing: 14 },
      { atTimelineTick: seconds(110), kind: 'blocker', count: 1,  spacing: 0  },
      // A tank right after the blocker — `timelineTick` was frozen at 1100 for the
      // blocker's whole lifetime, so once it dies there's a genuine 14s real wait
      // before the schedule reaches the next wave at 1240. Firing at 1102 (barely
      // above the blocker's own tick) means it spawns the moment the timeline
      // unfreezes, and its own 90hp bridges most of what was dead air.
      { atTimelineTick: seconds(110.2), kind: 'tank',    count: 1,  spacing: 0  },
      { atTimelineTick: seconds(124), kind: 'striker', count: 4,  spacing: 15 },
      { atTimelineTick: seconds(138), kind: 'fodder',  count: 7,  spacing: 14  },
      { atTimelineTick: seconds(152), kind: 'striker', count: 4,  spacing: 15 },
      { atTimelineTick: seconds(166), kind: 'fodder',  count: 7,  spacing: 14  },
      { atTimelineTick: seconds(180), kind: 'striker', count: 5,  spacing: 15 },
      { atTimelineTick: seconds(196), kind: 'fodder',  count: 8,  spacing: 14  },
      // Strikers bumped rather than tanks — matches this mission's "strikers hit
      // harder" identity, and a matching tank bump has a density cliff (a +1 bump
      // across all three tank waves collapses clear rate to single digits).
      { atTimelineTick: seconds(210), kind: 'striker', count: 4,  spacing: 15 },
      { atTimelineTick: seconds(220), kind: 'fodder',  count: 5,  spacing: 14  },
      // Final push — tanks introduced, unchanged from the mission's original tuning.
      { atTimelineTick: seconds(232), kind: 'tank',    count: 2,  spacing: 20 },
      { atTimelineTick: seconds(240), kind: 'tank',    count: 1,  spacing: 0  },
      { atTimelineTick: seconds(252), kind: 'tank',    count: 3,  spacing: 17 },
      { atTimelineTick: seconds(268), kind: 'tank',    count: 4,  spacing: 16 },
    ],
    supportCallTicks: [
      seconds(22), seconds(52), seconds(82), seconds(116),
      seconds(148), seconds(188), seconds(218),
    ],
    // See m1's star-anchoring comment above for method; `timeStarT2Loadout`, 2000 runs.
    stars: [
      { id: 'm2-time-t1', family: 'finish-time', threshold: seconds(292.0) },
      { id: 'm2-time-t2', family: 'finish-time', threshold: seconds(148.8) },
      { id: 'm2-time-t3', family: 'finish-time', threshold: seconds(144.4) },
      { id: 'm2-time-t4', family: 'finish-time', threshold: seconds(96.9) },
      { id: 'm2-hull-50', family: 'hull-above', threshold: 0.5 },
      { id: 'm2-hull-90', family: 'hull-above', threshold: 0.9 },
      { id: 'm2-all-kills', family: 'all-kills', threshold: 0 },
      { id: 'm2-shield', family: 'shield-unbroken', threshold: 0 },
    ],
  },

  // ── m3: The Wall ─────────────────────────────────────────────────────────
  // Dense fodder walls + tanks + 2 mid-mission blockers → blocker final push.
  {
    id: 'm3', name: 'The Wall', completionCoins: 200, campaign: 'act1',
    blurb: 'Dense fodder walls, then the swarm starts moving faster. Single-target lasers will drown.',
    enemyKinds: { fodder: FODDER, striker: STRIKER, tank: TANK, blocker: BLOCKER },
    events: [
      { atTimelineTick: seconds(2),   kind: 'fodder',  count: 6,  spacing: 14  },
      { atTimelineTick: seconds(14),  kind: 'fodder',  count: 7,  spacing: 14  },
      { atTimelineTick: seconds(26),  kind: 'tank',    count: 1,  spacing: 0  },
      { atTimelineTick: seconds(40),  kind: 'fodder',  count: 7,  spacing: 14  },
      { atTimelineTick: seconds(54),  kind: 'fodder',  count: 8,  spacing: 14  },
      { atTimelineTick: seconds(68),  kind: 'blocker', count: 1,  spacing: 0  },
      { atTimelineTick: seconds(68.2), kind: 'fodder', count: 2,  spacing: 14  },
      { atTimelineTick: seconds(82),  kind: 'fodder',  count: 8,  spacing: 14  },
      { atTimelineTick: seconds(96),  kind: 'tank',    count: 2,  spacing: 22 },
      // Escalating tier introduced here — m3 is mission 3-of-6, first striker exposure.
      // Blocker counts are deliberately untouched — they sit on a known 2-vs-3-per-wave
      // difficulty cliff.
      { atTimelineTick: seconds(110), kind: 'striker', count: 5,  spacing: 15 },
      { atTimelineTick: seconds(124), kind: 'fodder',  count: 9,  spacing: 14  },
      { atTimelineTick: seconds(138), kind: 'blocker', count: 1,  spacing: 0  },
      // Provisional tension experiment (same status as m2's E-3 comment above) — m3 has
      // the thinnest clear-rate headroom of the three missions this touches, so uses the
      // smallest possible count and lands right as the seconds(138) blocker dies,
      // denying the post-blocker recovery window. First candidate to drop if a playtest
      // or a higher-run-count check finds it pushes m3 under its clear-rate floor.
      { atTimelineTick: seconds(143), kind: 'striker', count: 2,  spacing: 15 },
      { atTimelineTick: seconds(154), kind: 'striker', count: 5,  spacing: 15 },
      { atTimelineTick: seconds(168), kind: 'tank',    count: 2,  spacing: 20 },
      { atTimelineTick: seconds(182), kind: 'fodder',  count: 9,  spacing: 14  },
      { atTimelineTick: seconds(196), kind: 'striker', count: 5,  spacing: 15 },
      { atTimelineTick: seconds(208), kind: 'tank',    count: 2,  spacing: 20 },
      { atTimelineTick: seconds(218), kind: 'fodder',  count: 8,  spacing: 14  },
      // Final push — blocker pressure escalates. `blocksConveyor` freezes the timeline
      // for the enemy's entire lifetime, so time spent fighting a blocker is never
      // refunded against the next event's threshold — a nominal gap after a blocker
      // wave becomes genuine dead time the instant it dies. The gaps here are tightened
      // to keep that dead time under the idle-stretch threshold without touching
      // blocker counts (the actual difficulty lever — see the cliff warning above).
      { atTimelineTick: seconds(230), kind: 'blocker', count: 2,  spacing: 19 },
      { atTimelineTick: seconds(230.2), kind: 'tank',  count: 1,  spacing: 0  },
      { atTimelineTick: seconds(245), kind: 'blocker', count: 3,  spacing: 19 },
      // A tank bridges the real gap between the two 3-blocker waves — timelineTick
      // freezes for a living blocker's whole lifetime, so once the 245s wave clears,
      // the schedule still needs the full 245→260 gap in real time before the next
      // one fires. Same shape as m2's blocker/tank bridge above.
      { atTimelineTick: seconds(245.2), kind: 'tank',    count: 1,  spacing: 0  },
      { atTimelineTick: seconds(260), kind: 'blocker', count: 3,  spacing: 19 },
    ],
    supportCallTicks: [
      seconds(20), seconds(50), seconds(80), seconds(115),
      seconds(148), seconds(180), seconds(215),
    ],
    // See m1's star-anchoring comment above for method; `timeStarT2Loadout`, 2000 runs.
    // Still omits hull-90/shield (unlike the standard 8-star set most missions use) —
    // this mission is a deliberate attritional DPS check (its own floor, 65%, is the
    // toughest of m1-m5),
    // and diagnosis found near-zero-damage completion is bimodally blocked: half of all
    // shield breaks happen in the first ~4s (opener density) and the other half at the
    // finale's blocker cliff (load-bearing for the 65% floor, not softened here) — so
    // both a clean opener AND a clean finale would be needed simultaneously, making the
    // bar structurally much harder than intended. Matches m6's existing precedent (a
    // boss-DPS-check mission) of dropping these same two stars for the same reason.
    stars: [
      { id: 'm3-time-t1', family: 'finish-time', threshold: seconds(317.5) },
      { id: 'm3-time-t2', family: 'finish-time', threshold: seconds(170.2) },
      { id: 'm3-time-t3', family: 'finish-time', threshold: seconds(160.6) },
      { id: 'm3-time-t4', family: 'finish-time', threshold: seconds(106.2) },
      { id: 'm3-hull-50', family: 'hull-above', threshold: 0.5 },
      { id: 'm3-all-kills', family: 'all-kills', threshold: 0 },
    ],
  },

  // ── m3b: Supply Column ───────────────────────────────────────────────────
  // Mandatory — see MISSION_UNLOCK_EDGES below: the old m3→m4 edge is removed, not kept
  // alongside this one. Booster's debut: buffed waves punish ignoring the source,
  // giving tap-to-target its clearest payoff — a booster left alive keeps out-healing
  // the enemy ahead of it, same shape as t3's regen-guardian lesson but solvable by a
  // verb instead of only raw DPS.
  {
    id: 'm3b', name: 'Supply Column', completionCoins: 230, campaign: 'act1',
    blurb: 'Boosters keep the line alive. Cut the source, or grind through double the HP.',
    enemyKinds: { fodder: FODDER, striker: STRIKER, tank: TANK, booster: BOOSTER },
    // Booster/tank pairs are spaced far enough apart (~30-36s) that a player who
    // prioritizes the booster on sight (per Combat doc) clears each pair well before
    // the next spawns — confirmed by trace: a solo pair introduced at t=44s is dead by
    // ~t=51.5s, ~13s of margin before the next pair. The finale is the one deliberate
    // exception: three pairs staggered only ~12s apart, so a player who's slow to react
    // to one is punished by real overlap — the mission's one genuine "no breathing room"
    // moment, not a structural weapon-vs-quantity impossibility.
    //
    // No `all-kills` star (see stars: below) — it's in genuine structural tension with
    // the mission's own identity at any clear-rate below
    // ~95%: the intended pulse weapon is single-target, so a dense fodder/striker wave
    // (needed to keep clear-rate in the tighter-than-m3/m4 band the mission is built
    // for) reliably lets exactly one straggler slip through somewhere across ~20 waves,
    // even under perfect tap-to-target play. Every other star (time/hull/shield) stayed
    // cleanly reachable throughout tuning; only the "zero collisions across the entire
    // mission" bar didn't survive contact with real density. Other missions keep
    // all-kills because their spawn density doesn't share this specific conflict.
    events: [
      { atTimelineTick: seconds(2),   kind: 'fodder',  count: 8,  spacing: 14  },
      { atTimelineTick: seconds(16),  kind: 'fodder',  count: 8,  spacing: 14  },
      { atTimelineTick: seconds(28),  kind: 'striker', count: 7,  spacing: 15  },
      { atTimelineTick: seconds(44),  kind: 'tank',    count: 1,  spacing: 0  },
      { atTimelineTick: seconds(46),  kind: 'booster', count: 1,  spacing: 0  },
      { atTimelineTick: seconds(48),  kind: 'fodder',  count: 9,  spacing: 14  },
      { atTimelineTick: seconds(64),  kind: 'striker', count: 7,  spacing: 15  },
      { atTimelineTick: seconds(78),  kind: 'tank',    count: 1,  spacing: 0  },
      { atTimelineTick: seconds(80),  kind: 'booster', count: 1,  spacing: 0  },
      { atTimelineTick: seconds(84),  kind: 'fodder',  count: 9,  spacing: 14  },
      // A lone tank bridges the real gap between the fodder wave dying and the next
      // striker wave's scheduled tick — no blocker/turret involved here, just a wide
      // schedule gap, so a slow, tough single unit keeps the lane occupied through it.
      { atTimelineTick: seconds(92),  kind: 'tank',    count: 1,  spacing: 0  },
      { atTimelineTick: seconds(100), kind: 'striker', count: 7,  spacing: 15  },
      { atTimelineTick: seconds(114), kind: 'tank',    count: 1,  spacing: 0  },
      { atTimelineTick: seconds(116), kind: 'booster', count: 1,  spacing: 0  },
      { atTimelineTick: seconds(120), kind: 'fodder',  count: 10, spacing: 14  },
      { atTimelineTick: seconds(136), kind: 'striker', count: 8,  spacing: 15  },
      { atTimelineTick: seconds(150), kind: 'tank',    count: 1,  spacing: 0  },
      { atTimelineTick: seconds(152), kind: 'booster', count: 1,  spacing: 0  },
      { atTimelineTick: seconds(156), kind: 'fodder',  count: 10, spacing: 14  },
      { atTimelineTick: seconds(172), kind: 'striker', count: 9,  spacing: 15  },
      // Finale — three pairs staggered ~9s apart, the mission's one real overlap.
      { atTimelineTick: seconds(186), kind: 'tank',    count: 1,  spacing: 0  },
      { atTimelineTick: seconds(188), kind: 'booster', count: 1,  spacing: 0  },
      { atTimelineTick: seconds(195), kind: 'tank',    count: 1,  spacing: 0  },
      { atTimelineTick: seconds(197), kind: 'booster', count: 1,  spacing: 0  },
      { atTimelineTick: seconds(204), kind: 'tank',    count: 2,  spacing: 16  },
      { atTimelineTick: seconds(206), kind: 'booster', count: 2,  spacing: 15  },
      { atTimelineTick: seconds(224), kind: 'striker', count: 7,  spacing: 15 },
    ],
    supportCallTicks: [
      seconds(12), seconds(38), seconds(66), seconds(96),
      seconds(126), seconds(156), seconds(198),
    ],
    // No all-kills star (see the comment above events: for why) and no shield-unbroken
    // star — three overlapping booster-fed tanks in the finale reliably crack the
    // shield at least once even under strong play, the same structural tension that
    // ruled out all-kills. m3 already omits shield-unbroken for its own reasons.
    // See m1's star-anchoring comment above for method; `timeStarT2Loadout`, 2000 runs.
    stars: [
      { id: 'm3b-time-t1', family: 'finish-time', threshold: seconds(234.0) },
      { id: 'm3b-time-t2', family: 'finish-time', threshold: seconds(122.8) },
      { id: 'm3b-time-t3', family: 'finish-time', threshold: seconds(117.2) },
      { id: 'm3b-time-t4', family: 'finish-time', threshold: seconds(78.6) },
      { id: 'm3b-hull-50', family: 'hull-above', threshold: 0.5 },
      { id: 'm3b-hull-90', family: 'hull-above', threshold: 0.9 },
    ],
  },

  // ── m4: Blockade ─────────────────────────────────────────────────────────
  // Blocker gauntlet with escalating pairs → rapid triple-blocker final push.
  {
    id: 'm4', name: 'Blockade', completionCoins: 260, campaign: 'act1',
    blurb: 'Blockers stall your advance until they die. DPS check.',
    // Turret is a static ranged DPS check, distinct from the blocker's approaching one.
    // It swaps the two single-blocker events (the only safe slot — blocker counts
    // elsewhere sit on a difficulty cliff and are untouched).
    enemyKinds: { fodder: FODDER, striker: STRIKER, blocker: BLOCKER, turret: TURRET, tank: TANK },
    events: [
      { atTimelineTick: seconds(2),   kind: 'fodder',  count: 4,  spacing: 14 },
      { atTimelineTick: seconds(14),  kind: 'fodder',  count: 5,  spacing: 14 },
      { atTimelineTick: seconds(26),  kind: 'turret',  count: 1,  spacing: 0  },
      // Turret also blocksConveyor — same blocker/tank bridge pattern as the two
      // blocker pairs below.
      { atTimelineTick: seconds(26.2), kind: 'tank',   count: 1,  spacing: 0  },
      { atTimelineTick: seconds(40),  kind: 'striker', count: 3,  spacing: 15 },
      { atTimelineTick: seconds(52),  kind: 'fodder',  count: 6,  spacing: 14 },
      { atTimelineTick: seconds(64),  kind: 'turret',  count: 1,  spacing: 0  },
      { atTimelineTick: seconds(64.2), kind: 'tank',   count: 1,  spacing: 0  },
      // Blocker counts here are deliberately untouched — they sit on a known
      // 2-vs-3-per-wave difficulty cliff and are this mission's load-bearing "DPS
      // check" identity.
      { atTimelineTick: seconds(78),  kind: 'striker', count: 5,  spacing: 15 },
      { atTimelineTick: seconds(92),  kind: 'fodder',  count: 7,  spacing: 14  },
      { atTimelineTick: seconds(106), kind: 'blocker', count: 2,  spacing: 20 },
      // A tank right after the blocker pair — timelineTick is frozen for their whole
      // lifetime, so once they die there's a long real wait before the schedule
      // reaches the next wave. Firing just after the blockers' own tick means the tank
      // spawns the moment the timeline unfreezes, bridging most of that dead air —
      // same mechanism as m2/m3's own blocker/tank bridges above.
      { atTimelineTick: seconds(106.2), kind: 'tank',    count: 1,  spacing: 0  },
      { atTimelineTick: seconds(122), kind: 'striker', count: 6,  spacing: 15 },
      { atTimelineTick: seconds(136), kind: 'fodder',  count: 8,  spacing: 14  },
      // Provisional tension experiment (same status as m2's E-3 comment above) — m4 has
      // the most clear-rate headroom of the three, so this is the least risky insert. It
      // lands right before the seconds(150) blocker pair, so the strikers are still
      // closing while the blocker freezes the timeline — a compounded DPS-check moment.
      { atTimelineTick: seconds(142), kind: 'striker', count: 3,  spacing: 15 },
      { atTimelineTick: seconds(150), kind: 'blocker', count: 2,  spacing: 22 },
      // Same blocker/tank bridge as the seconds(106) pair above.
      { atTimelineTick: seconds(150.2), kind: 'tank',    count: 1,  spacing: 0  },
      { atTimelineTick: seconds(166), kind: 'striker', count: 6,  spacing: 15 },
      { atTimelineTick: seconds(180), kind: 'fodder',  count: 8,  spacing: 14  },
      { atTimelineTick: seconds(196), kind: 'striker', count: 6,  spacing: 15 },
      { atTimelineTick: seconds(208), kind: 'fodder',  count: 6,  spacing: 14  },
      { atTimelineTick: seconds(218), kind: 'striker', count: 4,  spacing: 15 },
      // Final push — three blocker waves back-to-back, no breathing room. Gaps here are
      // tightened for the same reason as m3's final push above: blocksConveyor freezes
      // the timeline for a wave's entire lifetime, turning a looser nominal gap into
      // genuine dead time once the wave dies.
      { atTimelineTick: seconds(230), kind: 'blocker', count: 4,  spacing: 19 },
      { atTimelineTick: seconds(242), kind: 'blocker', count: 4,  spacing: 19 },
      { atTimelineTick: seconds(254), kind: 'blocker', count: 4,  spacing: 19 },
    ],
    supportCallTicks: [
      seconds(20), seconds(50), seconds(80), seconds(115),
      seconds(148), seconds(188), seconds(218),
    ],
    // See m1's star-anchoring comment above for method; `timeStarT2Loadout`, 2000 runs.
    stars: [
      { id: 'm4-time-t1', family: 'finish-time', threshold: seconds(353.5) },
      { id: 'm4-time-t2', family: 'finish-time', threshold: seconds(193.0) },
      { id: 'm4-time-t3', family: 'finish-time', threshold: seconds(179.4) },
      { id: 'm4-time-t4', family: 'finish-time', threshold: seconds(118.6) },
      { id: 'm4-hull-50', family: 'hull-above', threshold: 0.5 },
      { id: 'm4-hull-90', family: 'hull-above', threshold: 0.9 },
      { id: 'm4-all-kills', family: 'all-kills', threshold: 0 },
      { id: 'm4-shield', family: 'shield-unbroken', threshold: 0 },
    ],
  },

  // ── m5: Asteroid Run ─────────────────────────────────────────────────────
  // Patient-tier warm-up → gradual swarm/striker ramp → blocker final push. The
  // Patient-tier lead-in exists because opening directly into a swarm flood is
  // unclearable on starter gear — a shape problem, not just a numbers one.
  {
    id: 'm5', name: 'Asteroid Run', completionCoins: 300, campaign: 'act1',
    blurb: 'A swarm too thick to shoot down. Shields are a weapon too.',
    // "Asteroid Run" fiction fits a fast-rock threat, and kamikaze is the sharpest enemy
    // in the game (highest collision damage) — meeting one taste of it here, readably,
    // before m6 throws four mid-chaos is the point. Swaps two of the five striker
    // events (three remain, so the striker mix survives); never touches swarm counts,
    // this mission's own tuned difficulty lever.
    enemyKinds: { fodder: FODDER, swarm: SWARM, striker: STRIKER, blocker: BLOCKER, kamikaze: KAMIKAZE, tank: TANK },
    events: [
      // Patient-tier warm-up — lane-reading time and a support call before the ramp
      { atTimelineTick: seconds(2),   kind: 'fodder',  count: 5,  spacing: 14 },
      { atTimelineTick: seconds(16),  kind: 'fodder',  count: 6,  spacing: 14 },
      // Escalating tier begins — swarm introduced gradually, with recovery gaps and
      // support calls timed to land before each step up, not mid-wave
      { atTimelineTick: seconds(30),  kind: 'swarm',   count: 8,  spacing: 9  },
      { atTimelineTick: seconds(44),  kind: 'swarm',   count: 9,  spacing: 9  },
      { atTimelineTick: seconds(58),  kind: 'striker', count: 3,  spacing: 15 },
      // Swarm density is this mission's real difficulty lever (blocker count has no
      // effect on its clear rate) — the mid-mission ramp is nudged up here rather than
      // touching the tuned finale below.
      { atTimelineTick: seconds(72),  kind: 'swarm',   count: 11, spacing: 9  },
      { atTimelineTick: seconds(86),  kind: 'swarm',   count: 12, spacing: 9  },
      { atTimelineTick: seconds(100), kind: 'striker', count: 3,  spacing: 15 },
      { atTimelineTick: seconds(114), kind: 'swarm',   count: 13, spacing: 9  },
      { atTimelineTick: seconds(128), kind: 'swarm',   count: 14, spacing: 9  },
      { atTimelineTick: seconds(142), kind: 'kamikaze', count: 4, spacing: 12  },
      { atTimelineTick: seconds(156), kind: 'swarm',   count: 13, spacing: 9  },
      { atTimelineTick: seconds(170), kind: 'swarm',   count: 14, spacing: 9  },
      { atTimelineTick: seconds(184), kind: 'striker', count: 3,  spacing: 15 },
      { atTimelineTick: seconds(198), kind: 'swarm',   count: 16, spacing: 9  },
      { atTimelineTick: seconds(212), kind: 'swarm',   count: 16, spacing: 9  },
      { atTimelineTick: seconds(226), kind: 'kamikaze', count: 4, spacing: 12  },
      { atTimelineTick: seconds(240), kind: 'swarm',   count: 15, spacing: 9  },
      // Final push — blockers, paired with a swarm tail so the escalating tier stays
      // the dominant threat rather than ending the hardest mission on a slow enemy
      { atTimelineTick: seconds(254), kind: 'blocker', count: 3,  spacing: 19 },
      // A tank right after the blocker trio — same blocker/tank bridge mechanism as
      // m2/m3/m4: timelineTick is frozen for the blockers' whole lifetime, so the tank
      // spawns the moment the timeline unfreezes and bridges most of the real wait
      // before the next wave's scheduled tick.
      { atTimelineTick: seconds(254.2), kind: 'tank',   count: 1,  spacing: 0  },
      { atTimelineTick: seconds(270), kind: 'swarm',   count: 14, spacing: 9  },
      { atTimelineTick: seconds(282), kind: 'blocker', count: 2,  spacing: 19 },
    ],
    supportCallTicks: [
      seconds(12), seconds(42), seconds(72), seconds(102),
      seconds(134), seconds(166), seconds(198), seconds(230),
    ],
    // See m1's star-anchoring comment above for method, with one difference: unlike
    // m1-m4, the `timeStarT2Loadout` anchor doesn't work here — m5's own intended
    // loadout already runs motor-2 (the same timeline compression as the T2/T3
    // references), so that reference measures exactly T1's value. T2 is instead the
    // T1↔T3 midpoint. The T1-T3 band being only 4s wide is a pre-existing property of
    // this mission's motor-2-compressed ladder; widening it means retuning m5's ladder
    // structure, not just its thresholds.
    stars: [
      { id: 'm5-time-t1', family: 'finish-time', threshold: seconds(160.2) },
      { id: 'm5-time-t2', family: 'finish-time', threshold: seconds(158.2) },
      { id: 'm5-time-t3', family: 'finish-time', threshold: seconds(156.2) },
      { id: 'm5-time-t4', family: 'finish-time', threshold: seconds(104.1) },
      { id: 'm5-hull-50', family: 'hull-above', threshold: 0.5 },
      { id: 'm5-hull-90', family: 'hull-above', threshold: 0.9 },
      { id: 'm5-all-kills', family: 'all-kills', threshold: 0 },
      { id: 'm5-shield', family: 'shield-unbroken', threshold: 0 },
    ],
  },

  // ── m6: Leviathan ────────────────────────────────────────────────────────
  // Full mixed gauntlet with 3 blocker gates → boss at seconds(250).
  // Boss time-stars measure absolute tick from mission start.
  {
    id: 'm6', name: 'Leviathan', completionCoins: 500, campaign: 'act1',
    blurb: 'It swims below. Kill it fast for the time-stars.',
    enemyKinds: {
      fodder: FODDER, striker: STRIKER, swarm: SWARM,
      tank: TANK, blocker: BLOCKER, turret: TURRET, kamikaze: KAMIKAZE, boss: BOSS,
    },
    events: [
      { atTimelineTick: seconds(2),   kind: 'fodder',   count: 4,  spacing: 14 },
      { atTimelineTick: seconds(12),  kind: 'striker',  count: 3,  spacing: 15 },
      { atTimelineTick: seconds(24),  kind: 'fodder',   count: 5,  spacing: 14 },
      { atTimelineTick: seconds(36),  kind: 'blocker',  count: 1,  spacing: 0  },
      // Relay of tanks — see the seconds(178) blocker/tank relay comment below for why
      // more than one is needed to bridge the whole post-freeze wait.
      { atTimelineTick: seconds(36.2), kind: 'tank',    count: 1,  spacing: 0  },
      { atTimelineTick: seconds(41),   kind: 'tank',    count: 1,  spacing: 0  },
      { atTimelineTick: seconds(46),   kind: 'tank',    count: 1,  spacing: 0  },
      { atTimelineTick: seconds(50),  kind: 'striker',  count: 4,  spacing: 15 },
      { atTimelineTick: seconds(62),  kind: 'fodder',   count: 6,  spacing: 14 },
      // First turret gate — static, high fire rate, blocks until burned down
      { atTimelineTick: seconds(70),  kind: 'turret',   count: 1,  spacing: 0  },
      { atTimelineTick: seconds(80),  kind: 'swarm',    count: 10, spacing: 9  },
      { atTimelineTick: seconds(92),  kind: 'striker',  count: 4,  spacing: 15 },
      // Plain schedule gap (no freeze involved) between the striker wave dying and the
      // next blocker wave's tick — a lone tank keeps the lane occupied through it.
      { atTimelineTick: seconds(97),  kind: 'tank',     count: 1,  spacing: 0  },
      { atTimelineTick: seconds(106), kind: 'blocker',  count: 2,  spacing: 19 },
      { atTimelineTick: seconds(106.2), kind: 'tank',   count: 1,  spacing: 0  },
      { atTimelineTick: seconds(111),   kind: 'tank',   count: 1,  spacing: 0  },
      { atTimelineTick: seconds(116),   kind: 'tank',   count: 1,  spacing: 0  },
      { atTimelineTick: seconds(120), kind: 'fodder',   count: 7,  spacing: 14  },
      { atTimelineTick: seconds(134), kind: 'swarm',    count: 12, spacing: 9  },
      { atTimelineTick: seconds(148), kind: 'striker',  count: 5,  spacing: 15 },
      { atTimelineTick: seconds(162), kind: 'tank',     count: 2,  spacing: 20 },
      // Kamikaze rush through the blocker gate — high speed, high damage
      { atTimelineTick: seconds(170), kind: 'kamikaze', count: 3,  spacing: 12  },
      { atTimelineTick: seconds(178), kind: 'blocker',  count: 3,  spacing: 19 },
      // Blocker/tank bridge relay: timelineTick freezes for the blockers' whole
      // lifetime, and a single tank only stays alive a few seconds against this
      // mission's high-tier loadout — chaining three keeps the lane occupied across
      // the full real-time wait until the next wave's scheduled tick.
      { atTimelineTick: seconds(178.2), kind: 'tank',   count: 1,  spacing: 0  },
      { atTimelineTick: seconds(183),   kind: 'tank',   count: 1,  spacing: 0  },
      { atTimelineTick: seconds(188),   kind: 'tank',   count: 1,  spacing: 0  },
      { atTimelineTick: seconds(194), kind: 'fodder',   count: 8,  spacing: 14  },
      { atTimelineTick: seconds(208), kind: 'striker',  count: 6,  spacing: 15 },
      { atTimelineTick: seconds(220), kind: 'swarm',    count: 15, spacing: 9  },
      // Second turret + kamikaze wave before boss sprint
      { atTimelineTick: seconds(232), kind: 'turret',   count: 1,  spacing: 0  },
      { atTimelineTick: seconds(236), kind: 'kamikaze', count: 4,  spacing: 12  },
      { atTimelineTick: seconds(242), kind: 'tank',     count: 3,  spacing: 18 },
      { atTimelineTick: seconds(248), kind: 'striker',  count: 6,  spacing: 15 },
      { atTimelineTick: seconds(254), kind: 'boss',     count: 1,  spacing: 0  },
    ],
    supportCallTicks: [
      seconds(15), seconds(45), seconds(75), seconds(108),
      seconds(142), seconds(175), seconds(210), seconds(235),
    ],
    // `boss-time` only counts a weapon kill (state.bossKillTick, set in combat.ts) — a
    // boss that reaches the ship and collides instead (conveyor.ts) still wins the
    // mission but never sets bossKillTick, matching all-kills' "collisions are not
    // kills" rule. Percentile data on the intended loadout collapses median/75th/25th
    // to one value (near-zero variance under greedy play, same pattern as m1-m5's
    // finish-time stars) while the 10th percentile shows genuine spread — that spread is
    // what backs the T2/T3 tiers below.
    //
    // T2/T3 don't anchor to the fixed `timeStarT2Loadout` the way m1-m4 do: boss-time
    // measures bossKillTick, not mission duration, and the reference tiers' gear kills
    // the boss roughly twice as fast — anchoring there would halve the finale's T2/T3
    // requirements, a real difficulty change beyond what this star family needs. T2/T3
    // instead step evenly through the intended loadout's own measured kill-tick spread,
    // leaving T1/T4 untouched. See known-issues.md for the deferred reference-tier
    // re-anchor option.
    stars: [
      // Boss time-stars: tick from mission start by which the boss must die (by weapon
      // fire). Renamed from the old value-encoded ids (m6-boss-320 etc.) to the t1-t4
      // tier convention used everywhere else — early-dev save policy (v2/CLAUDE.md), no
      // migration needed.
      { id: 'm6-boss-t1', family: 'boss-time', threshold: seconds(317) },
      { id: 'm6-boss-t2', family: 'boss-time', threshold: seconds(312.7) },
      { id: 'm6-boss-t3', family: 'boss-time', threshold: seconds(308.3) },
      { id: 'm6-boss-t4', family: 'boss-time', threshold: seconds(304) },
      { id: 'm6-hull-50',  family: 'hull-above', threshold: 0.5 },
      { id: 'm6-all-kills', family: 'all-kills', threshold: 0 },
    ],
  },
];

const MISSIONS_BY_ID: Record<string, MissionSpec> = Object.fromEntries(
  ALL_MISSIONS.map((m) => [m.id, m]),
);

// The daily mission (src/data/dailyMission.ts) is generated fresh per calendar day by
// the view layer, not authored here — it's deliberately not part of ALL_MISSIONS/
// MISSION_UNLOCK_EDGES (not a campaign node). This tiny registry lets `missionById`
// resolve it anyway, so CombatScene/buildMissionResult/the result viewmodel can all
// keep using the one lookup path they already use for every other mission.
let dailyMissionSpec: MissionSpec | null = null;

/** Registers today's generated daily mission so `missionById('daily')` resolves it.
 * Called once by HubScene after computing today's date-derived seed. */
export function setDailyMission(spec: MissionSpec): void {
  dailyMissionSpec = spec;
}

export function missionById(id: string): MissionSpec {
  const mission = MISSIONS_BY_ID[id];
  if (mission !== undefined) return mission;
  if (dailyMissionSpec !== null && dailyMissionSpec.id === id) return dailyMissionSpec;
  throw new Error(`Unknown mission "${id}"`);
}

/** Total stars earnable across act1 — used by the menu progress display. w0 is
 * excluded too (campaign is undefined, and its own stars list is always empty). */
export function totalStarsAvailable(): number {
  return ALL_MISSIONS
    .filter((m) => m.campaign === 'act1')
    .reduce((sum, mission) => sum + mission.stars.length, 0);
}

/**
 * The mission dependency graph (§9: "completing a mission unlocks the next").
 * [fromId, toId] — completing fromId unlocks toId. A mission with no incoming edge
 * here (t1) is always unlocked. A single forced chain, no shortcuts: every tutorial
 * must be completed before act1 opens (t1→t2→t3→t4→m1). This is also the galaxy map's
 * line layout — shared by `isMissionUnlocked` (save/SaveManager.ts) and
 * `computeGalaxyMap` (viewmodel/hub.ts), not duplicated.
 */
export const MISSION_UNLOCK_EDGES: [string, string][] = [
  ['t1', 't2'], ['t2', 't3'], ['t3', 't4'], ['t4', 'm1'],
  ['m1', 'm2'], ['m2', 'm3'], ['m3', 'm3b'], ['m3b', 'm4'], ['m4', 'm5'], ['m5', 'm6'],
];
