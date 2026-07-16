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
// F3 Option A (docs/plans/mission-fun-review.md) investigated and reverted 2026-07-15
// — see the doc's own "sim both, pick by numbers" instruction. Tried shotDamage 10→17
// (the doc's suggestion): drove m6's intended/greedy clear-rate from ~88% to 8.5%,
// blowing through the ≥45% floor (§13). Bisected to 10→12 (clear-rate 58.8%,
// individually in-band) but that still broke a harder invariant: `pnpm campaign`'s
// `average` archetype (starter-kind-committed, GAME_DESIGN §13's "safe by design"
// build) dropped from 100% to 93.4% campaign completion — 33/500 runs got stuck at
// m6's 8-attempt patience cap, a real "player can get stuck" regression per §3. And at
// 12, boss weapon-kill-share of victories was UNCHANGED (28%, identical to shotDamage
// 10) — confirming shotDamage only makes collision-tanking costlier, it never changes
// which death mechanism actually kills the boss (governed by weapon DPS vs. boss HP vs.
// approach time, which shotDamage doesn't touch). Reverted to the original 10: Option A
// cannot hit F3's real target (weapon-kill share ≥70%) at any value that doesn't also
// break an existing safety invariant — confirmed insufficient exactly as the doc
// anticipated ("Option B... only if A under-delivers"). Option B (a stall-and-bombard
// boss phase forcing a weapon kill) is a real core-engine change, deliberately left out
// of this pass — see the doc's own scope note.
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
 * Booster, added 2026-07-15 (fable-fun-review-followup.md Item 7) — first build of a
 * previously documented-but-unbuilt kind. Regen-buff variant: `regenPerTick` is not
 * self-healing (see `regenerateEnemies` in combat.ts) — it's granted every tick to
 * whichever alive enemy is currently nearest-ahead of the booster, distance-based and
 * recomputed live. Slow (0.7, between fodder's 1.2 and tank's 0.6) so it naturally
 * lags behind faster units and stays "behind other enemies" per its documented
 * character, giving it something to buff for most of its lifetime. Low shotDamage — the
 * threat is the buff, not its own gun. A future damage-buff variant is documented but
 * not built this pass.
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
 * hp 80 → 55 2026-07-15 (docs/plans/mission-fun-review.md F5) — the post-card kill
 * now takes ~10s instead of 20+, since t3 is down to one guardian (see below) and no
 * longer needs a second, redundant confirmation of the same lesson.
 */
const GUARDIAN_REGEN: EnemySpec = {
  kind: 'guardian', hp: 55, speed: 0.3, shotDamage: 2,
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
    // Trimmed to one guardian 2026-07-15 (docs/plans/mission-fun-review.md F5) — the
    // problem and the solution now land on the same enemy (watch it out-heal you, the
    // card arrives at second 6, break it) instead of a redundant second confirmation;
    // dropped the dead `fodder` kind (no event ever spawned it).
    enemyKinds: { guardian: GUARDIAN_REGEN },
    events: [
      { atTimelineTick: seconds(3), kind: 'guardian', count: 1, spacing: 0 },
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
  // Reshaped 2026-07-15 (docs/plans/mission-fun-review.md F2) — the original opened
  // with 14 near-identical fodder waves (~2.5 min of zero decisions/visible threat
  // evolution before the first striker at 148s). Fix is shape, not difficulty: a
  // single striker "scout" previews the finale threat at second 50, and the flattest
  // stretch (72-112s, five waves repeating count 6-7) collapses to three more
  // differentiated ones — a dense-tight wave, a sparse-fast breather, a dense-tight
  // wave — so the lane visibly breathes instead of maintaining constant throughput.
  // `pnpm pacing`'s longest-same-kind-streak flag confirms the shape fix (14 → 7);
  // the doc's suggested counts were re-tuned against `pnpm sim` after measuring the
  // straightforward version landed at 90.2% — right on the ceiling (>90% is "too
  // easy", §13) — and this region turned out to be a real difficulty cliff (count 9→10
  // on the dense waves alone swung clear-rate from 90% to 77.5%, well under the ≥85%
  // floor). Landed on count 9/spacing 7 for both dense-tight waves (unchanged from the
  // straightforward version) and count 6/spacing 18 for the breather (up from an
  // initial 5), measuring 87.6-88.1% at 2000-5000 runs — comfortably inside [85%, 90%].
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
      // Scout — a visibly faster, differently-colored enemy previewing the finale.
      // Spacing loosened 2026-07-15 (docs/known-issues.md, m1-shield UNREACHABLE flag):
      // this scout + the two dense fodder waves right after it (52-72s) were where
      // ~97% of all shield breaks happened (traced via sampleTick across 2000 runs,
      // clustered tightly in that window) — a side effect of F2's added opening
      // density. Loosened this stretch's spacing only (counts unchanged, so F2's
      // monotony fix stays intact) until shield-unbroken cleared the 5% floor (2.6%→
      // 6.7%), with clear-rate barely moving (86.8%→87.8%, still well within the
      // 85-90% band).
      { atTimelineTick: seconds(50),  kind: 'striker', count: 1,  spacing: 0  },
      { atTimelineTick: seconds(52),  kind: 'fodder',  count: 7,  spacing: 12 },
      { atTimelineTick: seconds(64),  kind: 'fodder',  count: 7,  spacing: 11 },
      // Collapsed 72-112s stretch: dense-tight → sparse-fast breather → dense-tight.
      { atTimelineTick: seconds(76),  kind: 'fodder',  count: 9,  spacing: 9  },
      { atTimelineTick: seconds(90),  kind: 'fodder',  count: 6,  spacing: 18 },
      { atTimelineTick: seconds(108), kind: 'fodder',  count: 9,  spacing: 7  },
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
    // Re-anchored 2026-07-15 (F4, docs/known-issues.md) — the old T1-T4 were a
    // synthetic ±1-2s tie-break around one real value (see git history), not four
    // meaningfully different skill bars: percentiles of the SAME (intended) loadout's
    // run duration barely vary when card choice is this constrained. Real fix: T1/T2
    // stay pinned to the intended loadout's own percentiles (75th/50th — still flat
    // here, 185.5s at every percentile), but T3/T4 now measure an objectively *faster*
    // clear on the fixed T3/T4 reference loadouts (`timeStarT3Loadout`/
    // `timeStarT4Loadout` in loadoutPresets.ts — weapon4/shield3/gen5/motor2 and
    // weapon5/shield4/gen5/motor3, each verified ≥98%/100% clear across every main
    // mission), whose 2x/3x timeline compression makes a genuinely tighter number, not
    // a guessed one. `pnpm sim --mission m1 --loadout t3/t4 --percentiles`, 2000 runs.
    stars: [
      { id: 'm1-time-t1', family: 'finish-time', threshold: seconds(185.5) },
      { id: 'm1-time-t2', family: 'finish-time', threshold: seconds(185.5) },
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
    // Re-anchored 2026-07-15 (F4) — see m1's comment above for method.
    stars: [
      { id: 'm2-time-t1', family: 'finish-time', threshold: seconds(292.0) },
      { id: 'm2-time-t2', family: 'finish-time', threshold: seconds(292.0) },
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
      // Final push — blocker pressure escalates beyond mid-mission checks. Gaps
      // tightened 20s→15s 2026-07-15 (docs/known-issues.md idle-stretch investigation):
      // `blocksConveyor` freezes the timeline for the enemy's *entire* lifetime, so a
      // 20s nominal gap after a blocker wave becomes a full 20s of dead, zero-enemy
      // time the instant it dies — none of the real time spent fighting it is ever
      // "refunded" against the next event's threshold. That's not a DPS-check cost, it's
      // pure idle time contradicting this wave's own "no breathing room" comment.
      // Verified seed-invariant (identical idle-stretch length across 5 seeds) before
      // concluding it was structural, not RNG variance. Tightening the gap doesn't
      // touch blocker *counts* (the actual difficulty lever — see the cliff warning
      // above), only how soon the next wave's timeline threshold arrives. First tried
      // 12s (matches m4's own final-push gap below) but that dropped m3's clear-rate
      // from 71.2%→64.0%, under its 65% floor — the tighter gap also cuts recovery
      // time between fights, a real (if secondary) difficulty lever. 15s recovers to
      // 68.4%, comfortably back above floor, while still clearing the 17s idle-stretch
      // threshold with margin.
      { atTimelineTick: seconds(230), kind: 'blocker', count: 2,  spacing: 15 },
      { atTimelineTick: seconds(245), kind: 'blocker', count: 3,  spacing: 15 },
      { atTimelineTick: seconds(260), kind: 'blocker', count: 3,  spacing: 15 },
    ],
    supportCallTicks: [
      seconds(20), seconds(50), seconds(80), seconds(115),
      seconds(148), seconds(180), seconds(215),
    ],
    // Re-anchored 2026-07-15 (F4) — see m1's comment above for method; T3/T4 measured
    // fresh after this mission's own idle-stretch timing fix (above) shifted its
    // intended-loadout duration slightly (320.1s→309.9s avg, T1/T2 below reflect that).
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
      { id: 'm3-time-t2', family: 'finish-time', threshold: seconds(317.5) },
      { id: 'm3-time-t3', family: 'finish-time', threshold: seconds(160.6) },
      { id: 'm3-time-t4', family: 'finish-time', threshold: seconds(106.2) },
      { id: 'm3-hull-50', family: 'hull-above', threshold: 0.5 },
      { id: 'm3-all-kills', family: 'all-kills', threshold: 0 },
    ],
  },

  // ── m3b: Supply Column ───────────────────────────────────────────────────
  // Added 2026-07-15 (fable-fun-review-followup.md Item 7) — a genuine second real
  // test, mandatory (see MISSION_UNLOCK_EDGES below: the old m3→m4 edge is removed,
  // not kept alongside this one), inserted where the review's data showed the campaign
  // is flattest. Booster's debut: buffed waves punish ignoring the source, giving
  // tap-to-target (Item 4) its clearest payoff — a booster left alive keeps
  // out-healing the enemy ahead of it, same shape as t3's regen-guardian lesson but
  // now solvable by a verb instead of only by raw DPS. Difficulty target and star
  // thresholds below are the result of `pnpm sim`/`pnpm balance` iteration, not a
  // guessed number — see the tuning note before the stars block.
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
    // No `all-kills` star (see stars: below) — this session's tuning log found it in
    // genuine structural tension with the mission's own identity at any clear-rate below
    // ~95%: the intended pulse weapon is single-target, so a dense fodder/striker wave
    // (needed to keep clear-rate in the tighter-than-m3/m4 band the mission is built
    // for) reliably lets exactly one straggler slip through somewhere across ~20 waves,
    // even under perfect tap-to-target play. Every other star (time/hull/shield) stayed
    // cleanly reachable throughout tuning; only the "zero collisions across the entire
    // mission" bar didn't survive contact with real density. Other missions keep
    // all-kills because their spawn density doesn't share this specific conflict.
    events: [
      { atTimelineTick: seconds(2),   kind: 'fodder',  count: 8,  spacing: 7  },
      { atTimelineTick: seconds(16),  kind: 'fodder',  count: 8,  spacing: 6  },
      { atTimelineTick: seconds(28),  kind: 'striker', count: 7,  spacing: 8  },
      { atTimelineTick: seconds(44),  kind: 'tank',    count: 1,  spacing: 0  },
      { atTimelineTick: seconds(46),  kind: 'booster', count: 1,  spacing: 0  },
      { atTimelineTick: seconds(48),  kind: 'fodder',  count: 9,  spacing: 5  },
      { atTimelineTick: seconds(64),  kind: 'striker', count: 7,  spacing: 9  },
      { atTimelineTick: seconds(78),  kind: 'tank',    count: 1,  spacing: 0  },
      { atTimelineTick: seconds(80),  kind: 'booster', count: 1,  spacing: 0  },
      { atTimelineTick: seconds(84),  kind: 'fodder',  count: 9,  spacing: 5  },
      { atTimelineTick: seconds(100), kind: 'striker', count: 7,  spacing: 8  },
      { atTimelineTick: seconds(114), kind: 'tank',    count: 1,  spacing: 0  },
      { atTimelineTick: seconds(116), kind: 'booster', count: 1,  spacing: 0  },
      { atTimelineTick: seconds(120), kind: 'fodder',  count: 10, spacing: 5  },
      { atTimelineTick: seconds(136), kind: 'striker', count: 8,  spacing: 8  },
      { atTimelineTick: seconds(150), kind: 'tank',    count: 1,  spacing: 0  },
      { atTimelineTick: seconds(152), kind: 'booster', count: 1,  spacing: 0  },
      { atTimelineTick: seconds(156), kind: 'fodder',  count: 10, spacing: 5  },
      { atTimelineTick: seconds(172), kind: 'striker', count: 9,  spacing: 7  },
      // Finale — three pairs staggered ~9s apart, the mission's one real overlap.
      { atTimelineTick: seconds(186), kind: 'tank',    count: 1,  spacing: 0  },
      { atTimelineTick: seconds(188), kind: 'booster', count: 1,  spacing: 0  },
      { atTimelineTick: seconds(195), kind: 'tank',    count: 1,  spacing: 0  },
      { atTimelineTick: seconds(197), kind: 'booster', count: 1,  spacing: 0  },
      { atTimelineTick: seconds(204), kind: 'tank',    count: 2,  spacing: 9  },
      { atTimelineTick: seconds(206), kind: 'booster', count: 2,  spacing: 6  },
      { atTimelineTick: seconds(224), kind: 'striker', count: 7,  spacing: 9.5 },
    ],
    supportCallTicks: [
      seconds(12), seconds(38), seconds(66), seconds(96),
      seconds(126), seconds(156), seconds(198),
    ],
    // Tuned 2026-07-15 via pnpm sim/balance iteration — see this session's tuning log.
    // No all-kills star (see the comment above events: for why) and no shield-unbroken
    // star — same reasoning: three overlapping booster-fed tanks in the finale reliably
    // crack the shield at least once even under strong play, the same structural
    // tension that ruled out all-kills. m3 (see above) already omits shield-unbroken
    // for its own reasons, so this isn't a new pattern for the mission roster.
    // T1-T4 re-anchored 2026-07-15 (F4) to the new intended/T3-tier/T4-tier method —
    // see m1's comment above. T1/T2 pinned to intended (75th/50th percentile); T3/T4
    // measure a real faster clear on the fixed T3/T4 reference loadouts.
    stars: [
      { id: 'm3b-time-t1', family: 'finish-time', threshold: seconds(234.0) },
      { id: 'm3b-time-t2', family: 'finish-time', threshold: seconds(233.9) },
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
    // Turret added 2026-07-15 (docs/plans/mission-fun-review.md F1) — a static ranged
    // DPS check, distinct from the blocker's approaching one, deepens m4's own
    // identity rather than diluting it. Swaps the two single-blocker events (the only
    // safe slot — blocker *counts* elsewhere sit on a difficulty cliff and are
    // untouched); every remaining blocker event still gives m4 its blockade climax.
    enemyKinds: { fodder: FODDER, striker: STRIKER, blocker: BLOCKER, turret: TURRET },
    events: [
      { atTimelineTick: seconds(2),   kind: 'fodder',  count: 4,  spacing: 12 },
      { atTimelineTick: seconds(14),  kind: 'fodder',  count: 5,  spacing: 11 },
      { atTimelineTick: seconds(26),  kind: 'turret',  count: 1,  spacing: 0  },
      { atTimelineTick: seconds(40),  kind: 'striker', count: 3,  spacing: 15 },
      { atTimelineTick: seconds(52),  kind: 'fodder',  count: 6,  spacing: 10 },
      { atTimelineTick: seconds(64),  kind: 'turret',  count: 1,  spacing: 0  },
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
      // Final push — three blocker waves back-to-back, no breathing room. Gaps
      // tightened 20s→12s 2026-07-15 — same idle-stretch fix and reasoning as m3's
      // final push above (docs/known-issues.md); blocksConveyor freezing the timeline
      // for a wave's entire lifetime turned the nominal 20s gap into genuine dead time
      // once the wave died, contradicting this event's own "no breathing room" comment.
      { atTimelineTick: seconds(230), kind: 'blocker', count: 4,  spacing: 12 },
      { atTimelineTick: seconds(242), kind: 'blocker', count: 4,  spacing: 12 },
      { atTimelineTick: seconds(254), kind: 'blocker', count: 4,  spacing: 12 },
    ],
    supportCallTicks: [
      seconds(20), seconds(50), seconds(80), seconds(115),
      seconds(148), seconds(188), seconds(218),
    ],
    // Re-anchored 2026-07-15 (F4) — see m1's comment above for method; T1/T2 measured
    // fresh after this mission's own idle-stretch timing fix (above) shifted its
    // intended-loadout duration (361.5s→342.7s avg).
    stars: [
      { id: 'm4-time-t1', family: 'finish-time', threshold: seconds(353.5) },
      { id: 'm4-time-t2', family: 'finish-time', threshold: seconds(353.5) },
      { id: 'm4-time-t3', family: 'finish-time', threshold: seconds(179.4) },
      { id: 'm4-time-t4', family: 'finish-time', threshold: seconds(118.6) },
      { id: 'm4-hull-50', family: 'hull-above', threshold: 0.5 },
      { id: 'm4-hull-90', family: 'hull-above', threshold: 0.9 },
      { id: 'm4-all-kills', family: 'all-kills', threshold: 0 },
      { id: 'm4-shield', family: 'shield-unbroken', threshold: 0 },
    ],
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
    // Kamikaze added 2026-07-15 (docs/plans/mission-fun-review.md F1) — "Asteroid Run"
    // fiction fits a fast-rock threat, and it's the sharpest enemy in the game (highest
    // collision damage); meeting one taste of it here, readably, before m6 throws four
    // mid-chaos is the point. Swaps two of the five striker events (three remain, so
    // the striker mix survives) — never touches swarm counts, this mission's own
    // tuned difficulty lever. Count re-tuned against `pnpm sim` after measuring the
    // doc's suggested count 2 landed at ~95% clear — over the 90% "too easy" ceiling
    // (§13), since 2 low-HP kamikaze is strictly less total threat than the 3 strikers
    // it replaced (kamikaze's collision danger rarely lands against a continuously-
    // firing greedy player). Settled on count 4/spacing 8 per wave, measuring 81.9-82.3%
    // at 2000-5000 runs — safely inside [50%, 90%].
    enemyKinds: { fodder: FODDER, swarm: SWARM, striker: STRIKER, blocker: BLOCKER, kamikaze: KAMIKAZE },
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
      { atTimelineTick: seconds(142), kind: 'kamikaze', count: 4, spacing: 8  },
      { atTimelineTick: seconds(156), kind: 'swarm',   count: 13, spacing: 4  },
      { atTimelineTick: seconds(170), kind: 'swarm',   count: 14, spacing: 3  },
      { atTimelineTick: seconds(184), kind: 'striker', count: 3,  spacing: 13 },
      { atTimelineTick: seconds(198), kind: 'swarm',   count: 16, spacing: 3  },
      { atTimelineTick: seconds(212), kind: 'swarm',   count: 16, spacing: 3  },
      { atTimelineTick: seconds(226), kind: 'kamikaze', count: 4, spacing: 8  },
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
    // Re-anchored 2026-07-15 (F4) — see m1's comment above for method. This fixes the
    // original F4 complaint that m5's T1-T4 were literally unearnable at motor-1 (the
    // old thresholds assumed a motor tier the mission's own intended loadout never
    // used) — T3/T4 now correctly target the T3/T4 reference loadouts instead.
    stars: [
      { id: 'm5-time-t1', family: 'finish-time', threshold: seconds(160.2) },
      { id: 'm5-time-t2', family: 'finish-time', threshold: seconds(160.2) },
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
    // Boss time-stars re-anchored 2026-07-15, after F3's stall-and-bombard mechanic
    // (see conveyor.ts's effectiveSpeed) landed. `boss-time` only counts a weapon kill
    // (state.bossKillTick, set in combat.ts) — a boss that reaches the ship and collides
    // instead (conveyor.ts) still wins the mission but never sets bossKillTick, matching
    // all-kills' existing "collisions are not kills" rule. Before F3, only ~30% of wins
    // killed the boss by weapon fire at all (most let it collide and tank the hit); F3
    // pushed that to 100%, so the pre-F3 thresholds (317-320) were stale — real
    // percentile data now shows the median/75th/25th collapse to one value (316.8s,
    // same "near-zero variance under greedy" pattern as m1-m5's finish-time stars) but
    // the 10th percentile shows genuine spread (304.2s), a real tighter tier unlike the
    // pre-F3 synthetic ±1-3s spread. 3000 runs, `pnpm sim`-equivalent percentile method.
    stars: [
      // Boss time-stars: tick from mission start by which the boss must die (by weapon
      // fire). Renamed from the old value-encoded ids (m6-boss-320 etc.) to the t1-t4
      // tier convention used everywhere else — early-dev save policy (v2/CLAUDE.md), no
      // migration needed.
      { id: 'm6-boss-t1', family: 'boss-time', threshold: seconds(317) },
      { id: 'm6-boss-t2', family: 'boss-time', threshold: seconds(317) },
      { id: 'm6-boss-t3', family: 'boss-time', threshold: seconds(317) },
      { id: 'm6-boss-t4', family: 'boss-time', threshold: seconds(304) },
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
  ['m1', 'm2'], ['m2', 'm3'], ['m3', 'm3b'], ['m3b', 'm4'], ['m4', 'm5'], ['m5', 'm6'],
];
