import { TICKS_PER_SECOND } from '../core/constants';
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
};
// Tuned via sim, not intuition: raising shotDamage only makes collision-tanking
// costlier, it never shifts the boss kill toward weapon damage (that's governed by
// weapon DPS vs. boss HP vs. approach time). It also risks breaking the `average`
// archetype's safe-by-design 100% campaign completion. See known-issues.md.
const BOSS: EnemySpec = {
  kind: 'boss', hp: 1900, speed: 0.25, shotDamage: 10,
  ticksBetweenShots: seconds(1), blocksConveyor: true, coinReward: 100, isBoss: true,
  critChance: 0.12, missChance: 0, critMult: 2.5,
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
};

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
    { atTimelineTick: seconds(5),  kind: 'fodder', count: 2, spacing: 22 },
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
 * Slow-crawl guardian for t1: no weapon, so the ship must "let them reach you" — the
 * shield absorbs the collision (routed shield-first, conveyor.ts) and bursts a
 * fraction of the absorbed damage back onto every other surviving guardian
 * (SHIELD_BURST_RETURN). Low HP means a couple of accumulated bursts can finish a
 * later guardian before its own collision; missChance=0.9 keeps shot pressure
 * non-lethal so the player can safely observe the mechanic play out.
 */
// speed tuned so t1's first collision lands early enough to feel responsive — see the
// spawn-tick comment on t1's own MissionSpec below for the timing math.
const GUARDIAN_SLOW: EnemySpec = {
  kind: 'guardian', hp: 25, speed: 2.2, shotDamage: 3,
  ticksBetweenShots: seconds(3), blocksConveyor: false, coinReward: 15,
  regenPerTick: 0, critChance: 0, missChance: 0.9, critMult: 2.0,
};

/**
 * Regenerating guardian for t3: regen (2.2/tick = 22 HP/s) exceeds base weapon DPS
 * (20 DPS), making it unkillable by shooting alone. A +30% damage card breaks even.
 */
const GUARDIAN_REGEN: EnemySpec = {
  kind: 'guardian', hp: 55, speed: 0.3, shotDamage: 2,
  ticksBetweenShots: seconds(3), blocksConveyor: true, coinReward: 20,
  regenPerTick: 2.2, critChance: 0, missChance: 0, critMult: 2.0,
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
// Accuracy constraints on t2's lines: the GENERATOR line only claims refill rate
// improves with a better module — capacity does NOT increase on every generator kind
// (items.ts's GENERATOR_BASE; torrent's caps decrease with level, and torrent is what
// TUTORIAL_LOADOUT_BASE gives every tutorial player). The DISPATCH REINFORCEMENTS line
// says "on real missions" rather than "after it": t2's own support call is scripted via
// `firstOfferIds` below and bypasses the subscription-derived pool entirely
// (createAbilityOffer, core/cards.ts), and every tutorial's resolveForcedLoadout sets
// subscriptionCardIds: [] (loadouts.ts) — so the claim is only true outside a tutorial.
const T1_NARRATOR_EVENTS: NarratorEvent[] = [
  {
    atTimelineTick: 0,
    lines: [
      'No weapon loaded, Commander.',
      'Your shield is the only defense here — let them close in.',
      'Watch the SHLD bar — every collision drains it before your hull takes any damage.',
      'The shield absorbs the hit, and the impact bleeds back onto the others.',
      "A stronger SHIELD module absorbs more before it breaks — check the shop's SHIELD tab when you're back at base.",
    ],
  },
];
const T2_NARRATOR_EVENTS: NarratorEvent[] = [
  {
    atTimelineTick: 0,
    lines: [
      'Your laser draws energy on every shot — watch that bar.',
      'It refills on its own between shots. Run it too low and your fire rate slows — but it never stops.',
      "A better GENERATOR module refills that bar faster — check the shop's GENERATOR tab for the tradeoffs between kinds.",
      "When support calls in, you'll be offered a card — pick one to boost your gear for the rest of this fight.",
      "This first offer is scripted to get you started — on real missions, which cards show up depends on your DISPATCH REINFORCEMENTS choice back at base.",
      "A dense wall's inbound. Single-target fire will bog down against it.",
    ],
  },
];
const T3_NARRATOR_EVENTS: NarratorEvent[] = [
  {
    atTimelineTick: 0,
    lines: [
      'That guardian regenerates faster than your base damage.',
      'You will not out-shoot it alone. Wait for support.',
      "A stronger FRONT WEAPON module raises your base damage permanently — worth checking after this fight.",
    ],
  },
];
const T4_NARRATOR_EVENTS: NarratorEvent[] = [
  {
    atTimelineTick: 0,
    lines: [
      'Two reserve supplies are preloaded on your right panel.',
      'Tap them when you need a burst of shield or damage — this fight is built for testing them.',
      "More charges, and new supply kinds, are yours in the shop's SUPPLIES tab — stock up before your next run.",
    ],
  },
];

// ---------- Tutorial missions ----------

const TUTORIAL_MISSIONS: MissionSpec[] = [
  // Every tutorial completes on defeat too (completesOnDefeat), so there's no failure
  // state to protect the player from — each is cut to the minimum content that
  // demonstrates its one mechanic once.
  {
    id: 't1', name: 'Shield Basics', completionCoins: 30,
    blurb: 'No weapon. Your shield is the only weapon. Let them reach you.',
    enemyKinds: { guardian: GUARDIAN_SLOW },
    // 100-unit lane / speed 2.2 ≈ 4.5s travel; with the 1s spawn delay, first collision
    // lands ~5.5s after the popup is dismissed — deliberately not faster, since that
    // would exceed every other enemy's speed (kamikaze, the fastest, is 2.8) and read as
    // an unreadable blink rather than "the shield absorbs a hit". `pnpm pacing`'s
    // SLOW_START flag tracks this going forward.
    events: [
      { atTimelineTick: seconds(1), kind: 'guardian', count: 3, spacing: 24 },
    ],
    supportCallTicks: [],
    stars: [
      { id: 't1-hull-50', family: 'hull-above', threshold: 0.5 },
      { id: 't1-all-kills', family: 'all-kills', threshold: 0 },
    ],
    forcedLoadout: { ...TUTORIAL_LOADOUT_BASE, weaponId: null },
    completesOnDefeat: true,
    narratorEvents: T1_NARRATOR_EVENTS,
  },
  {
    id: 't2', name: 'Weapon Systems', completionCoins: 50,
    blurb: 'Watch energy drain when you fire. Dense walls slow your weapon — the right card fixes that.',
    enemyKinds: { fodder: FODDER },
    events: [
      { atTimelineTick: seconds(3), kind: 'fodder', count: 3, spacing: 14 },
      { atTimelineTick: seconds(9), kind: 'fodder', count: 8, spacing: 14 },
    ],
    supportCallTicks: [seconds(9)],
    firstOfferIds: ['w-dmg-30', 'w-rate-20', 'w-cost-25'],
    stars: standardStars('t2'),
    forcedLoadout: { ...TUTORIAL_LOADOUT_BASE, weaponId: 'pulse-1' },
    completesOnDefeat: true,
    narratorEvents: T2_NARRATOR_EVENTS,
  },
  {
    id: 't3', name: 'Support Cards', completionCoins: 60,
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
    firstOfferIds: ['w-dmg-30', 's-cap-20', 'g-out-08'],
    stars: [
      { id: 't3-hull-50', family: 'hull-above', threshold: 0.5 },
      { id: 't3-all-kills', family: 'all-kills', threshold: 0 },
      { id: 't3-shield', family: 'shield-unbroken', threshold: 0 },
    ],
    forcedLoadout: { ...TUTORIAL_LOADOUT_BASE, weaponId: 'pulse-1' },
    completesOnDefeat: true,
    narratorEvents: T3_NARRATOR_EVENTS,
  },
  {
    id: 't4', name: 'Battle Supplies', completionCoins: 70,
    blurb: 'Two supplies are preloaded. Use them — they are built for moments like this.',
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
    id: 'm1', name: 'First Contact', completionCoins: 120,
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
      { atTimelineTick: seconds(132), kind: 'fodder',  count: 8,  spacing: 14  },
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
    id: 'm2', name: 'Picket Line', completionCoins: 180,
    blurb: 'Strikers hit harder and close in fast.',
    enemyKinds: { fodder: FODDER, striker: STRIKER, blocker: BLOCKER, tank: TANK },
    events: [
      { atTimelineTick: seconds(2),   kind: 'fodder',  count: 4,  spacing: 14 },
      { atTimelineTick: seconds(15),  kind: 'fodder',  count: 4,  spacing: 14 },
      { atTimelineTick: seconds(28),  kind: 'striker', count: 2,  spacing: 18 },
      { atTimelineTick: seconds(42),  kind: 'fodder',  count: 5,  spacing: 14 },
      { atTimelineTick: seconds(56),  kind: 'striker', count: 3,  spacing: 17 },
      { atTimelineTick: seconds(70),  kind: 'fodder',  count: 6,  spacing: 14 },
      { atTimelineTick: seconds(84),  kind: 'striker', count: 3,  spacing: 16 },
      { atTimelineTick: seconds(98),  kind: 'fodder',  count: 6,  spacing: 14 },
      { atTimelineTick: seconds(110), kind: 'blocker', count: 1,  spacing: 0  },
      { atTimelineTick: seconds(124), kind: 'striker', count: 4,  spacing: 15 },
      { atTimelineTick: seconds(138), kind: 'fodder',  count: 7,  spacing: 14  },
      // Provisional tension experiment, not yet validated by a real playtest: an
      // energy-recovery-denial burst just before the 148s support call, meant to read as
      // a "hold out, help is close" moment. Kept to a single enemy — it sits sandwiched
      // between the existing seconds(124)/seconds(152) striker waves, so even a small
      // count bump stacks striker pressure fast. Revert this one event if a playtest
      // says it reads as unfair rather than tense.
      { atTimelineTick: seconds(142), kind: 'striker', count: 1,  spacing: 0 },
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
    id: 'm3', name: 'The Wall', completionCoins: 200,
    blurb: 'Dense fodder walls, then the swarm starts moving faster. Single-target lasers will drown.',
    enemyKinds: { fodder: FODDER, striker: STRIKER, tank: TANK, blocker: BLOCKER },
    events: [
      { atTimelineTick: seconds(2),   kind: 'fodder',  count: 6,  spacing: 14  },
      { atTimelineTick: seconds(14),  kind: 'fodder',  count: 7,  spacing: 14  },
      { atTimelineTick: seconds(26),  kind: 'tank',    count: 1,  spacing: 0  },
      { atTimelineTick: seconds(40),  kind: 'fodder',  count: 7,  spacing: 14  },
      { atTimelineTick: seconds(54),  kind: 'fodder',  count: 8,  spacing: 14  },
      { atTimelineTick: seconds(68),  kind: 'blocker', count: 1,  spacing: 0  },
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
      { atTimelineTick: seconds(182), kind: 'fodder',  count: 10, spacing: 14  },
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
      { atTimelineTick: seconds(245), kind: 'blocker', count: 3,  spacing: 19 },
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
    id: 'm3b', name: 'Supply Column', completionCoins: 230,
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
    id: 'm4', name: 'Blockade', completionCoins: 260,
    blurb: 'Blockers stall your advance until they die. DPS check.',
    // Turret is a static ranged DPS check, distinct from the blocker's approaching one.
    // It swaps the two single-blocker events (the only safe slot — blocker counts
    // elsewhere sit on a difficulty cliff and are untouched).
    enemyKinds: { fodder: FODDER, striker: STRIKER, blocker: BLOCKER, turret: TURRET },
    events: [
      { atTimelineTick: seconds(2),   kind: 'fodder',  count: 4,  spacing: 14 },
      { atTimelineTick: seconds(14),  kind: 'fodder',  count: 5,  spacing: 14 },
      { atTimelineTick: seconds(26),  kind: 'turret',  count: 1,  spacing: 0  },
      { atTimelineTick: seconds(40),  kind: 'striker', count: 3,  spacing: 15 },
      { atTimelineTick: seconds(52),  kind: 'fodder',  count: 6,  spacing: 14 },
      { atTimelineTick: seconds(64),  kind: 'turret',  count: 1,  spacing: 0  },
      // Blocker counts here are deliberately untouched — they sit on a known
      // 2-vs-3-per-wave difficulty cliff and are this mission's load-bearing "DPS
      // check" identity.
      { atTimelineTick: seconds(78),  kind: 'striker', count: 5,  spacing: 15 },
      { atTimelineTick: seconds(92),  kind: 'fodder',  count: 7,  spacing: 14  },
      { atTimelineTick: seconds(106), kind: 'blocker', count: 2,  spacing: 20 },
      { atTimelineTick: seconds(122), kind: 'striker', count: 6,  spacing: 15 },
      { atTimelineTick: seconds(136), kind: 'fodder',  count: 8,  spacing: 14  },
      // Provisional tension experiment (same status as m2's E-3 comment above) — m4 has
      // the most clear-rate headroom of the three, so this is the least risky insert. It
      // lands right before the seconds(150) blocker pair, so the strikers are still
      // closing while the blocker freezes the timeline — a compounded DPS-check moment.
      { atTimelineTick: seconds(142), kind: 'striker', count: 3,  spacing: 15 },
      { atTimelineTick: seconds(150), kind: 'blocker', count: 2,  spacing: 22 },
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
    id: 'm5', name: 'Asteroid Run', completionCoins: 300,
    blurb: 'A swarm too thick to shoot down. Shields are a weapon too.',
    // "Asteroid Run" fiction fits a fast-rock threat, and kamikaze is the sharpest enemy
    // in the game (highest collision damage) — meeting one taste of it here, readably,
    // before m6 throws four mid-chaos is the point. Swaps two of the five striker
    // events (three remain, so the striker mix survives); never touches swarm counts,
    // this mission's own tuned difficulty lever.
    enemyKinds: { fodder: FODDER, swarm: SWARM, striker: STRIKER, blocker: BLOCKER, kamikaze: KAMIKAZE },
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
    id: 'm6', name: 'Leviathan', completionCoins: 500,
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
      { atTimelineTick: seconds(50),  kind: 'striker',  count: 4,  spacing: 15 },
      { atTimelineTick: seconds(62),  kind: 'fodder',   count: 6,  spacing: 14 },
      // First turret gate — static, high fire rate, blocks until burned down
      { atTimelineTick: seconds(70),  kind: 'turret',   count: 1,  spacing: 0  },
      { atTimelineTick: seconds(80),  kind: 'swarm',    count: 10, spacing: 9  },
      { atTimelineTick: seconds(92),  kind: 'striker',  count: 4,  spacing: 15 },
      { atTimelineTick: seconds(106), kind: 'blocker',  count: 2,  spacing: 19 },
      { atTimelineTick: seconds(120), kind: 'fodder',   count: 7,  spacing: 14  },
      { atTimelineTick: seconds(134), kind: 'swarm',    count: 12, spacing: 9  },
      { atTimelineTick: seconds(148), kind: 'striker',  count: 5,  spacing: 15 },
      { atTimelineTick: seconds(162), kind: 'tank',     count: 2,  spacing: 20 },
      // Kamikaze rush through the blocker gate — high speed, high damage
      { atTimelineTick: seconds(170), kind: 'kamikaze', count: 3,  spacing: 12  },
      { atTimelineTick: seconds(178), kind: 'blocker',  count: 3,  spacing: 19 },
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

/** Total stars earnable across non-tutorial missions — used by the menu progress display. */
export function totalStarsAvailable(): number {
  return ALL_MISSIONS
    .filter((m) => m.forcedLoadout === undefined)
    .reduce((sum, mission) => sum + mission.stars.length, 0);
}

/**
 * The mission dependency graph (§9: "completing a mission unlocks the next").
 * [fromId, toId] — completing fromId unlocks toId. A mission with no incoming edge
 * here (t1) is always unlocked. Tutorials and main missions are separate branches
 * joined at a single point (t1 → m1) — a player can skip straight into the missions
 * after the first tutorial, per w0's own narrator dialogue ("skip straight into the
 * sector"). This is also the galaxy map's line layout — shared by `isMissionUnlocked`
 * (save/SaveManager.ts) and `computeGalaxyMap` (viewmodel/hub.ts), not duplicated.
 */
export const MISSION_UNLOCK_EDGES: [string, string][] = [
  ['t1', 't2'], ['t2', 't3'], ['t3', 't4'],
  ['t1', 'm1'],
  ['m1', 'm2'], ['m2', 'm3'], ['m3', 'm3b'], ['m3b', 'm4'], ['m4', 'm5'], ['m5', 'm6'],
];
