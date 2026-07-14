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

/** 4-star set used by tutorial missions: hull ×2, all-kills, shield-unbroken. */
function standardStars(missionId: string): StarSpec[] {
  return [
    { id: `${missionId}-hull-50`, family: 'hull-above', threshold: 0.5 },
    { id: `${missionId}-hull-90`, family: 'hull-above', threshold: 0.9 },
    { id: `${missionId}-all-kills`, family: 'all-kills', threshold: 0 },
    { id: `${missionId}-shield`, family: 'shield-unbroken', threshold: 0 },
  ];
}

/** 8-star set for main missions: 4 finish-time thresholds + hull×2 + all-kills + shield-unbroken. */
function missionStars(missionId: string, t1s: number, t2s: number, t3s: number, t4s: number): StarSpec[] {
  return [
    { id: `${missionId}-time-t1`, family: 'finish-time', threshold: seconds(t1s) },
    { id: `${missionId}-time-t2`, family: 'finish-time', threshold: seconds(t2s) },
    { id: `${missionId}-time-t3`, family: 'finish-time', threshold: seconds(t3s) },
    { id: `${missionId}-time-t4`, family: 'finish-time', threshold: seconds(t4s) },
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
    atTimelineTick: seconds(17),
    lines: [
      'Three paths open from this station.',
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
// Speed fixed 2026-07-11 — original 0.15 meant the very first collision (the event that
// starts the burst mechanic) didn't happen until ~67s in, and pnpm sim confirmed the
// whole mission averaged 121s versus t2/t3/t4's 31-51s (GAME_DESIGN.md §13 targets
// ~45s/tutorial). 0.55 lands t1 at ~51s, in line with its siblings, without changing
// hp/shotDamage/missChance or the mechanic being taught.
const GUARDIAN_SLOW: EnemySpec = {
  kind: 'guardian', hp: 25, speed: 0.55, shotDamage: 3,
  ticksBetweenShots: seconds(3), blocksConveyor: false, coinReward: 15,
  regenPerTick: 0, critChance: 0, missChance: 0.9, critMult: 2.0,
};

/**
 * Regenerating guardian for t3: regen (2.2/tick = 22 HP/s) exceeds base weapon DPS
 * (20 DPS), making it unkillable by shooting alone. A +30% damage card breaks even.
 */
const GUARDIAN_REGEN: EnemySpec = {
  kind: 'guardian', hp: 80, speed: 0.3, shotDamage: 2,
  ticksBetweenShots: seconds(3), blocksConveyor: true, coinReward: 20,
  regenPerTick: 2.2, critChance: 0, missChance: 0, critMult: 2.0,
};

// ---------- Tutorial missions ----------

const TUTORIAL_MISSIONS: MissionSpec[] = [
  // Trimmed 2026-07-11 (docs/plans/tutorial-minimalism-and-onboarding.md) — every
  // tutorial now completes on defeat too (completesOnDefeat), so there's no failure
  // state left to protect the player from: each mission is cut to the minimum content
  // that demonstrates its one mechanic once, not several repetitions of the same beat.
  {
    id: 't1', name: 'Shield Basics', completionCoins: 30,
    blurb: 'No weapon. Your shield is the only weapon. Let them reach you.',
    enemyKinds: { guardian: GUARDIAN_SLOW },
    events: [
      { atTimelineTick: seconds(3), kind: 'guardian', count: 3, spacing: 24 },
    ],
    supportCallTicks: [],
    stars: [
      { id: 't1-hull-50', family: 'hull-above', threshold: 0.5 },
      { id: 't1-all-kills', family: 'all-kills', threshold: 0 },
    ],
    forcedLoadout: { ...TUTORIAL_LOADOUT_BASE, weaponId: null },
    completesOnDefeat: true,
  },
  {
    id: 't2', name: 'Weapon Systems', completionCoins: 50,
    blurb: 'Watch energy drain when you fire. Dense walls slow your weapon — the right card fixes that.',
    enemyKinds: { fodder: FODDER },
    events: [
      { atTimelineTick: seconds(3), kind: 'fodder', count: 3, spacing: 14 },
      { atTimelineTick: seconds(9), kind: 'fodder', count: 8, spacing: 9 },
    ],
    supportCallTicks: [seconds(9)],
    firstOfferIds: ['w-dmg-30', 'w-rate-20', 'w-cost-25'],
    stars: standardStars('t2'),
    forcedLoadout: { ...TUTORIAL_LOADOUT_BASE, weaponId: 'pulse-1' },
    completesOnDefeat: true,
  },
  {
    id: 't3', name: 'Support Cards', completionCoins: 60,
    blurb: 'It heals faster than you shoot. You need the right card to break through.',
    enemyKinds: { fodder: FODDER, guardian: GUARDIAN_REGEN },
    events: [
      { atTimelineTick: seconds(3), kind: 'guardian', count: 1, spacing: 0 },
      { atTimelineTick: seconds(16), kind: 'guardian', count: 1, spacing: 0 },
    ],
    supportCallTicks: [seconds(6)],
    firstOfferIds: ['w-dmg-30', 's-cap-20', 'g-out-08'],
    stars: [
      { id: 't3-hull-50', family: 'hull-above', threshold: 0.5 },
      { id: 't3-all-kills', family: 'all-kills', threshold: 0 },
      { id: 't3-shield', family: 'shield-unbroken', threshold: 0 },
    ],
    forcedLoadout: { ...TUTORIAL_LOADOUT_BASE, weaponId: 'pulse-1' },
    completesOnDefeat: true,
  },
  {
    id: 't4', name: 'Battle Supplies', completionCoins: 70,
    blurb: 'Two supplies are preloaded. Use them — they are built for moments like this.',
    enemyKinds: { fodder: FODDER, striker: STRIKER },
    events: [
      { atTimelineTick: seconds(3), kind: 'fodder', count: 5, spacing: 9 },
      { atTimelineTick: seconds(11), kind: 'striker', count: 3, spacing: 13 },
    ],
    supportCallTicks: [seconds(9)],
    stars: standardStars('t4'),
    forcedLoadout: {
      ...TUTORIAL_LOADOUT_BASE,
      weaponId: 'pulse-1',
      suppliesGifted: { 'sup-damage': 1, 'sup-shield': 1 },
    },
    completesOnDefeat: true,
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
  // 14 escalating fodder waves (10s apart — no dead gaps) → striker final push.
  {
    id: 'm1', name: 'First Contact', completionCoins: 120,
    blurb: 'Loose fodder drifting in. Warm up the laser.',
    enemyKinds: { fodder: FODDER, striker: STRIKER },
    events: [
      { atTimelineTick: seconds(2),   kind: 'fodder',  count: 3,  spacing: 14 },
      { atTimelineTick: seconds(12),  kind: 'fodder',  count: 4,  spacing: 13 },
      { atTimelineTick: seconds(22),  kind: 'fodder',  count: 5,  spacing: 12 },
      { atTimelineTick: seconds(32),  kind: 'fodder',  count: 5,  spacing: 11 },
      { atTimelineTick: seconds(42),  kind: 'fodder',  count: 6,  spacing: 11 },
      { atTimelineTick: seconds(52),  kind: 'fodder',  count: 7,  spacing: 10 },
      { atTimelineTick: seconds(62),  kind: 'fodder',  count: 7,  spacing: 9  },
      { atTimelineTick: seconds(72),  kind: 'fodder',  count: 6,  spacing: 11 },
      { atTimelineTick: seconds(82),  kind: 'fodder',  count: 6,  spacing: 10 },
      { atTimelineTick: seconds(92),  kind: 'fodder',  count: 6,  spacing: 10 },
      { atTimelineTick: seconds(102), kind: 'fodder',  count: 7,  spacing: 9  },
      { atTimelineTick: seconds(112), kind: 'fodder',  count: 7,  spacing: 9  },
      { atTimelineTick: seconds(122), kind: 'fodder',  count: 7,  spacing: 8  },
      { atTimelineTick: seconds(132), kind: 'fodder',  count: 8,  spacing: 8  },
      // Final push — strikers introduced, with one support call to prep for them
      { atTimelineTick: seconds(148), kind: 'striker', count: 3,  spacing: 16 },
      { atTimelineTick: seconds(164), kind: 'striker', count: 3,  spacing: 15 },
      { atTimelineTick: seconds(180), kind: 'striker', count: 3,  spacing: 13 },
    ],
    supportCallTicks: [
      seconds(20), seconds(44), seconds(68), seconds(92),
      seconds(116), seconds(140), seconds(162),
    ],
    // Recalibrated 2026-07-10 (second pass, after fixing the ability-pool fidelity bug
    // — see src/data/cards.ts's abilityPoolForLoadout) from 2000 greedy-strategy runs on
    // the intended loadout, per GAME_DESIGN.md §13's percentile method (T1=75th,
    // T2=50th, T3=25th, T4=10th). Greedy specifically, not random or pooled — it's the
    // strategy balance-sweep.ts's report checks star reachability against.
    // m1-m5's real percentiles collapsed to a single value (zero variance): with only
    // sub-basic's 5 cards, greedy's fixed priority makes nearly identical choices every
    // run, so completion time barely varies. Anchored a small synthetic ±1-2s spread
    // around that single real value to keep 4 distinct, orderly tiers — not four
    // meaningfully different skill bars, just a tie-break. m6 kept its real percentiles
    // (its longer runtime and boss RNG produce genuine spread).
    stars: missionStars('m1', 189, 188, 187, 186),
  },

  // ── m2: Picket Line ──────────────────────────────────────────────────────
  // Fodder + strikers alternating, 1 blocker mid-mission → tank final push.
  {
    id: 'm2', name: 'Picket Line', completionCoins: 180,
    blurb: 'Strikers hit harder and close in fast.',
    enemyKinds: { fodder: FODDER, striker: STRIKER, blocker: BLOCKER, tank: TANK },
    events: [
      { atTimelineTick: seconds(2),   kind: 'fodder',  count: 4,  spacing: 13 },
      { atTimelineTick: seconds(15),  kind: 'fodder',  count: 4,  spacing: 12 },
      { atTimelineTick: seconds(28),  kind: 'striker', count: 2,  spacing: 18 },
      { atTimelineTick: seconds(42),  kind: 'fodder',  count: 5,  spacing: 11 },
      { atTimelineTick: seconds(56),  kind: 'striker', count: 3,  spacing: 17 },
      { atTimelineTick: seconds(70),  kind: 'fodder',  count: 6,  spacing: 11 },
      { atTimelineTick: seconds(84),  kind: 'striker', count: 3,  spacing: 16 },
      { atTimelineTick: seconds(98),  kind: 'fodder',  count: 6,  spacing: 10 },
      { atTimelineTick: seconds(110), kind: 'blocker', count: 1,  spacing: 0  },
      { atTimelineTick: seconds(124), kind: 'striker', count: 4,  spacing: 15 },
      { atTimelineTick: seconds(138), kind: 'fodder',  count: 7,  spacing: 9  },
      { atTimelineTick: seconds(152), kind: 'striker', count: 4,  spacing: 14 },
      { atTimelineTick: seconds(166), kind: 'fodder',  count: 7,  spacing: 8  },
      { atTimelineTick: seconds(180), kind: 'striker', count: 5,  spacing: 13 },
      { atTimelineTick: seconds(196), kind: 'fodder',  count: 8,  spacing: 8  },
      // Striker count bumped 2026-07-10 (gradual-tension pass, decision 2 in
      // docs/plans/game-identity-and-design-review-followup.md) — matches this
      // mission's own "strikers hit harder" identity better than a tank bump did
      // (tanks turned out to have the same kind of density cliff as blockers: a +1
      // bump across all three tank waves collapsed the clear rate from 87.3% to 7.3%
      // in testing, so that lever was reverted in favor of this one).
      { atTimelineTick: seconds(210), kind: 'striker', count: 4,  spacing: 13 },
      { atTimelineTick: seconds(220), kind: 'fodder',  count: 5,  spacing: 9  },
      // Final push — tanks introduced, unchanged from the mission's original tuning.
      { atTimelineTick: seconds(232), kind: 'tank',    count: 2,  spacing: 20 },
      { atTimelineTick: seconds(252), kind: 'tank',    count: 3,  spacing: 17 },
      { atTimelineTick: seconds(268), kind: 'tank',    count: 4,  spacing: 15 },
    ],
    supportCallTicks: [
      seconds(22), seconds(52), seconds(82), seconds(116),
      seconds(148), seconds(188), seconds(218),
    ],
    // Recalibrated 2026-07-10 — see m1's comment above for method.
    stars: missionStars('m2', 296, 295, 294, 293),
  },

  // ── m3: The Wall ─────────────────────────────────────────────────────────
  // Dense fodder walls + tanks + 2 mid-mission blockers → blocker final push.
  {
    id: 'm3', name: 'The Wall', completionCoins: 200,
    blurb: 'Dense fodder walls, then the swarm starts moving faster. Single-target lasers will drown.',
    enemyKinds: { fodder: FODDER, striker: STRIKER, tank: TANK, blocker: BLOCKER },
    events: [
      { atTimelineTick: seconds(2),   kind: 'fodder',  count: 6,  spacing: 9  },
      { atTimelineTick: seconds(14),  kind: 'fodder',  count: 7,  spacing: 9  },
      { atTimelineTick: seconds(26),  kind: 'tank',    count: 1,  spacing: 0  },
      { atTimelineTick: seconds(40),  kind: 'fodder',  count: 7,  spacing: 9  },
      { atTimelineTick: seconds(54),  kind: 'fodder',  count: 8,  spacing: 8  },
      { atTimelineTick: seconds(68),  kind: 'blocker', count: 1,  spacing: 0  },
      { atTimelineTick: seconds(82),  kind: 'fodder',  count: 8,  spacing: 7  },
      { atTimelineTick: seconds(96),  kind: 'tank',    count: 2,  spacing: 22 },
      // Escalating tier introduced here — m3 is mission 3-of-6, first striker exposure.
      // Striker counts bumped 2026-07-10 (gradual-tension pass, decision 2 in
      // docs/plans/game-identity-and-design-review-followup.md) — deliberately not
      // touching blocker counts, which sit on a known 2-vs-3-per-wave difficulty cliff.
      { atTimelineTick: seconds(110), kind: 'striker', count: 5,  spacing: 13 },
      { atTimelineTick: seconds(124), kind: 'fodder',  count: 9,  spacing: 6  },
      { atTimelineTick: seconds(138), kind: 'blocker', count: 1,  spacing: 0  },
      { atTimelineTick: seconds(154), kind: 'striker', count: 5,  spacing: 13 },
      { atTimelineTick: seconds(168), kind: 'tank',    count: 2,  spacing: 20 },
      { atTimelineTick: seconds(182), kind: 'fodder',  count: 10, spacing: 5  },
      { atTimelineTick: seconds(196), kind: 'striker', count: 5,  spacing: 11 },
      { atTimelineTick: seconds(208), kind: 'tank',    count: 2,  spacing: 20 },
      { atTimelineTick: seconds(218), kind: 'fodder',  count: 8,  spacing: 6  },
      // Final push — blocker pressure escalates beyond mid-mission checks
      { atTimelineTick: seconds(230), kind: 'blocker', count: 2,  spacing: 15 },
      { atTimelineTick: seconds(250), kind: 'blocker', count: 3,  spacing: 15 },
      { atTimelineTick: seconds(270), kind: 'blocker', count: 3,  spacing: 15 },
    ],
    supportCallTicks: [
      seconds(20), seconds(50), seconds(80), seconds(115),
      seconds(148), seconds(180), seconds(215),
    ],
    // Recalibrated 2026-07-10 — see m1's comment above for method.
    // Omits hull-90/shield (unlike missionStars()'s default set) — this mission is a
    // deliberate attritional DPS check (its own floor, 65%, is the toughest of m1-m5),
    // and diagnosis found near-zero-damage completion is bimodally blocked: half of all
    // shield breaks happen in the first ~4s (opener density) and the other half at the
    // finale's blocker cliff (load-bearing for the 65% floor, not softened here) — so
    // both a clean opener AND a clean finale would be needed simultaneously, making the
    // bar structurally much harder than intended. Matches m6's existing precedent (a
    // boss-DPS-check mission) of dropping these same two stars for the same reason.
    stars: [
      { id: 'm3-time-t1', family: 'finish-time', threshold: seconds(331) },
      { id: 'm3-time-t2', family: 'finish-time', threshold: seconds(330) },
      { id: 'm3-time-t3', family: 'finish-time', threshold: seconds(329) },
      { id: 'm3-time-t4', family: 'finish-time', threshold: seconds(328) },
      { id: 'm3-hull-50', family: 'hull-above', threshold: 0.5 },
      { id: 'm3-all-kills', family: 'all-kills', threshold: 0 },
    ],
  },

  // ── m4: Blockade ─────────────────────────────────────────────────────────
  // Blocker gauntlet with escalating pairs → rapid triple-blocker final push.
  {
    id: 'm4', name: 'Blockade', completionCoins: 260,
    blurb: 'Blockers stall your advance until they die. DPS check.',
    enemyKinds: { fodder: FODDER, striker: STRIKER, blocker: BLOCKER },
    events: [
      { atTimelineTick: seconds(2),   kind: 'fodder',  count: 4,  spacing: 12 },
      { atTimelineTick: seconds(14),  kind: 'fodder',  count: 5,  spacing: 11 },
      { atTimelineTick: seconds(26),  kind: 'blocker', count: 1,  spacing: 0  },
      { atTimelineTick: seconds(40),  kind: 'striker', count: 3,  spacing: 15 },
      { atTimelineTick: seconds(52),  kind: 'fodder',  count: 6,  spacing: 10 },
      { atTimelineTick: seconds(64),  kind: 'blocker', count: 1,  spacing: 0  },
      // Striker counts bumped 2026-07-10 (gradual-tension pass, decision 2 in
      // docs/plans/game-identity-and-design-review-followup.md) — deliberately not
      // touching blocker counts, which sit on a known 2-vs-3-per-wave difficulty cliff
      // and are this mission's own load-bearing "DPS check" identity.
      { atTimelineTick: seconds(78),  kind: 'striker', count: 5,  spacing: 13 },
      { atTimelineTick: seconds(92),  kind: 'fodder',  count: 7,  spacing: 9  },
      { atTimelineTick: seconds(106), kind: 'blocker', count: 2,  spacing: 20 },
      { atTimelineTick: seconds(122), kind: 'striker', count: 6,  spacing: 12 },
      { atTimelineTick: seconds(136), kind: 'fodder',  count: 8,  spacing: 8  },
      { atTimelineTick: seconds(150), kind: 'blocker', count: 2,  spacing: 22 },
      { atTimelineTick: seconds(166), kind: 'striker', count: 6,  spacing: 11 },
      { atTimelineTick: seconds(180), kind: 'fodder',  count: 8,  spacing: 7  },
      { atTimelineTick: seconds(196), kind: 'striker', count: 6,  spacing: 11 },
      { atTimelineTick: seconds(208), kind: 'fodder',  count: 6,  spacing: 9  },
      { atTimelineTick: seconds(218), kind: 'striker', count: 4,  spacing: 12 },
      // Final push — three blocker waves back-to-back, no breathing room
      { atTimelineTick: seconds(230), kind: 'blocker', count: 4,  spacing: 12 },
      { atTimelineTick: seconds(250), kind: 'blocker', count: 4,  spacing: 12 },
      { atTimelineTick: seconds(270), kind: 'blocker', count: 4,  spacing: 12 },
    ],
    supportCallTicks: [
      seconds(20), seconds(50), seconds(80), seconds(115),
      seconds(148), seconds(188), seconds(218),
    ],
    // Recalibrated 2026-07-10 — see m1's comment above for method.
    stars: missionStars('m4', 378, 377, 376, 375),
  },

  // ── m5: Asteroid Run ─────────────────────────────────────────────────────
  // Patient-tier warm-up → gradual swarm/striker ramp → blocker final push.
  // Reshaped 2026-07-10: the original opened directly into a swarm flood with zero
  // Patient-tier lead-in (100% swarm from second 2), which measured at 10.6% clear on
  // starter gear — a design-shape problem, not just a numbers one (see
  // docs/plans/mission-design-and-testing.md item 1).
  {
    id: 'm5', name: 'Asteroid Run', completionCoins: 300,
    blurb: 'A swarm too thick to shoot down. Shields are a weapon too.',
    enemyKinds: { fodder: FODDER, swarm: SWARM, striker: STRIKER, blocker: BLOCKER },
    events: [
      // Patient-tier warm-up — lane-reading time and a support call before the ramp
      { atTimelineTick: seconds(2),   kind: 'fodder',  count: 5,  spacing: 12 },
      { atTimelineTick: seconds(16),  kind: 'fodder',  count: 6,  spacing: 11 },
      // Escalating tier begins — swarm introduced gradually, with recovery gaps and
      // support calls timed to land before each step up, not mid-wave
      { atTimelineTick: seconds(30),  kind: 'swarm',   count: 8,  spacing: 6  },
      { atTimelineTick: seconds(44),  kind: 'swarm',   count: 9,  spacing: 6  },
      { atTimelineTick: seconds(58),  kind: 'striker', count: 3,  spacing: 15 },
      // Swarm counts bumped 2026-07-10 (gradual-tension pass, decision 2 in
      // docs/plans/game-identity-and-design-review-followup.md) — swarm density is
      // this mission's real difficulty lever (blocker count has no effect on its
      // clear rate, confirmed earlier this session), so the mid-mission ramp is
      // nudged up here rather than touching the tuned finale below.
      { atTimelineTick: seconds(72),  kind: 'swarm',   count: 11, spacing: 5  },
      { atTimelineTick: seconds(86),  kind: 'swarm',   count: 12, spacing: 5  },
      { atTimelineTick: seconds(100), kind: 'striker', count: 3,  spacing: 15 },
      { atTimelineTick: seconds(114), kind: 'swarm',   count: 13, spacing: 4  },
      { atTimelineTick: seconds(128), kind: 'swarm',   count: 14, spacing: 4  },
      { atTimelineTick: seconds(142), kind: 'striker', count: 3,  spacing: 14 },
      { atTimelineTick: seconds(156), kind: 'swarm',   count: 13, spacing: 4  },
      { atTimelineTick: seconds(170), kind: 'swarm',   count: 14, spacing: 3  },
      { atTimelineTick: seconds(184), kind: 'striker', count: 3,  spacing: 13 },
      { atTimelineTick: seconds(198), kind: 'swarm',   count: 16, spacing: 3  },
      { atTimelineTick: seconds(212), kind: 'swarm',   count: 16, spacing: 3  },
      { atTimelineTick: seconds(226), kind: 'striker', count: 3,  spacing: 12 },
      { atTimelineTick: seconds(240), kind: 'swarm',   count: 15, spacing: 3  },
      // Final push — blockers, paired with a swarm tail so the escalating tier stays
      // the dominant threat rather than ending the hardest mission on a slow enemy
      { atTimelineTick: seconds(254), kind: 'blocker', count: 3,  spacing: 13 },
      { atTimelineTick: seconds(270), kind: 'swarm',   count: 14, spacing: 3  },
      { atTimelineTick: seconds(282), kind: 'blocker', count: 2,  spacing: 13 },
    ],
    supportCallTicks: [
      seconds(12), seconds(42), seconds(72), seconds(102),
      seconds(134), seconds(166), seconds(198), seconds(230),
    ],
    // Recalibrated 2026-07-10 — see m1's comment above for method.
    stars: missionStars('m5', 164, 163, 162, 161),
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
      { atTimelineTick: seconds(2),   kind: 'fodder',   count: 4,  spacing: 12 },
      { atTimelineTick: seconds(12),  kind: 'striker',  count: 3,  spacing: 15 },
      { atTimelineTick: seconds(24),  kind: 'fodder',   count: 5,  spacing: 11 },
      { atTimelineTick: seconds(36),  kind: 'blocker',  count: 1,  spacing: 0  },
      { atTimelineTick: seconds(50),  kind: 'striker',  count: 4,  spacing: 14 },
      { atTimelineTick: seconds(62),  kind: 'fodder',   count: 6,  spacing: 10 },
      // First turret gate — static, high fire rate, blocks until burned down
      { atTimelineTick: seconds(70),  kind: 'turret',   count: 1,  spacing: 0  },
      { atTimelineTick: seconds(80),  kind: 'swarm',    count: 10, spacing: 5  },
      { atTimelineTick: seconds(92),  kind: 'striker',  count: 4,  spacing: 13 },
      { atTimelineTick: seconds(106), kind: 'blocker',  count: 2,  spacing: 15 },
      { atTimelineTick: seconds(120), kind: 'fodder',   count: 7,  spacing: 9  },
      { atTimelineTick: seconds(134), kind: 'swarm',    count: 12, spacing: 4  },
      { atTimelineTick: seconds(148), kind: 'striker',  count: 5,  spacing: 12 },
      { atTimelineTick: seconds(162), kind: 'tank',     count: 2,  spacing: 20 },
      // Kamikaze rush through the blocker gate — high speed, high damage
      { atTimelineTick: seconds(170), kind: 'kamikaze', count: 3,  spacing: 8  },
      { atTimelineTick: seconds(178), kind: 'blocker',  count: 3,  spacing: 13 },
      { atTimelineTick: seconds(194), kind: 'fodder',   count: 8,  spacing: 8  },
      { atTimelineTick: seconds(208), kind: 'striker',  count: 6,  spacing: 11 },
      { atTimelineTick: seconds(220), kind: 'swarm',    count: 15, spacing: 4  },
      // Second turret + kamikaze wave before boss sprint
      { atTimelineTick: seconds(232), kind: 'turret',   count: 1,  spacing: 0  },
      { atTimelineTick: seconds(236), kind: 'kamikaze', count: 4,  spacing: 6  },
      { atTimelineTick: seconds(242), kind: 'tank',     count: 3,  spacing: 18 },
      { atTimelineTick: seconds(248), kind: 'striker',  count: 6,  spacing: 10 },
      { atTimelineTick: seconds(254), kind: 'boss',     count: 1,  spacing: 0  },
    ],
    supportCallTicks: [
      seconds(15), seconds(45), seconds(75), seconds(108),
      seconds(142), seconds(175), seconds(210), seconds(235),
    ],
    // Boss time-stars recalibrated 2026-07-10. `boss-time` only counts a weapon kill
    // (state.bossKillTick, set in combat.ts) — a boss that reaches the ship and collides
    // instead (conveyor.ts) still wins the mission but never sets bossKillTick, matching
    // all-kills' existing "collisions are not kills" rule. Under greedy play only ~30%
    // of wins kill the boss by weapon fire at all (most let it collide and tank the hit),
    // and whenever it IS weapon-killed the DPS race lands on the same tick every time
    // (3168 ticks / 316.8s) — so, as with m1-m5's collapsed percentiles, these four
    // thresholds are a small synthetic spread clustered just above that single real
    // value rather than four meaningfully different skill bars.
    stars: [
      // Boss time-stars: tick from mission start by which the boss must die (by weapon fire).
      { id: 'm6-boss-320', family: 'boss-time', threshold: seconds(320) },
      { id: 'm6-boss-319', family: 'boss-time', threshold: seconds(319) },
      { id: 'm6-boss-318', family: 'boss-time', threshold: seconds(318) },
      { id: 'm6-boss-317', family: 'boss-time', threshold: seconds(317) },
      { id: 'm6-hull-50',  family: 'hull-above', threshold: 0.5 },
      { id: 'm6-all-kills', family: 'all-kills', threshold: 0 },
    ],
  },
];

const MISSIONS_BY_ID: Record<string, MissionSpec> = Object.fromEntries(
  ALL_MISSIONS.map((m) => [m.id, m]),
);

export function missionById(id: string): MissionSpec {
  const mission = MISSIONS_BY_ID[id];
  if (mission === undefined) throw new Error(`Unknown mission "${id}"`);
  return mission;
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
  ['m1', 'm2'], ['m2', 'm3'], ['m3', 'm4'], ['m4', 'm5'], ['m5', 'm6'],
];
