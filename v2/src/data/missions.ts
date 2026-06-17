import { TICKS_PER_SECOND } from '../core/constants';
import type { EnemySpec, ForcedLoadout, MissionSpec, StarSpec } from '../core/types';

const seconds = (n: number): number => n * TICKS_PER_SECOND;

// ---------- Shared enemy archetypes ----------

const FODDER: EnemySpec = {
  kind: 'fodder', hp: 20, speed: 1.2, shotDamage: 2,
  ticksBetweenShots: seconds(2), blocksConveyor: false, coinReward: 5,
};
const STRIKER: EnemySpec = {
  kind: 'striker', hp: 35, speed: 1.6, shotDamage: 3,
  ticksBetweenShots: seconds(1.5), blocksConveyor: false, coinReward: 8,
};
const TANK: EnemySpec = {
  kind: 'tank', hp: 90, speed: 0.6, shotDamage: 5,
  ticksBetweenShots: seconds(2), blocksConveyor: false, coinReward: 15,
};
const SWARM: EnemySpec = {
  kind: 'swarm', hp: 8, speed: 2.4, shotDamage: 1,
  ticksBetweenShots: seconds(1), blocksConveyor: false, coinReward: 3,
};
const BLOCKER: EnemySpec = {
  kind: 'blocker', hp: 140, speed: 0.5, shotDamage: 4,
  ticksBetweenShots: seconds(1.5), blocksConveyor: true, coinReward: 25,
};
const BOSS: EnemySpec = {
  kind: 'boss', hp: 700, speed: 0.25, shotDamage: 8,
  ticksBetweenShots: seconds(1), blocksConveyor: true, coinReward: 100, isBoss: true,
};

/** The standard non-boss star set: hull ×2, all-kills, shield-unbroken. */
function standardStars(missionId: string): StarSpec[] {
  return [
    { id: `${missionId}-hull-50`, family: 'hull-above', threshold: 0.5 },
    { id: `${missionId}-hull-90`, family: 'hull-above', threshold: 0.9 },
    { id: `${missionId}-all-kills`, family: 'all-kills', threshold: 0 },
    { id: `${missionId}-shield`, family: 'shield-unbroken', threshold: 0 },
  ];
}

// ---------- Tutorial loadout presets ----------

const TUTORIAL_LOADOUT_BASE: Omit<ForcedLoadout, 'weaponId'> = {
  shieldId: 'shield-1',
  generatorId: 'generator-1',
  motorId: 'motor-1',
};

// ---------- Tutorial enemy archetypes ----------

/**
 * Slow-crawl guardian for t1: no weapon means shield burst is the only damage tool.
 * Low HP so a single shield burst finishes it; low speed gives the generator time to
 * fire 3–4 pulses before first contact.
 */
const GUARDIAN_SLOW: EnemySpec = {
  kind: 'guardian', hp: 40, speed: 0.15, shotDamage: 3,
  ticksBetweenShots: seconds(3), blocksConveyor: false, coinReward: 15,
  regenPerTick: 0,
};

/**
 * Regenerating guardian for t3: regen (2.2/tick = 22 HP/s) exceeds base weapon DPS
 * (20 DPS), making it unkillable by shooting alone. A +30% damage card breaks even.
 */
const GUARDIAN_REGEN: EnemySpec = {
  kind: 'guardian', hp: 80, speed: 0.3, shotDamage: 2,
  ticksBetweenShots: seconds(3), blocksConveyor: true, coinReward: 20,
  regenPerTick: 2.2,
};

// ---------- Tutorial missions ----------

const TUTORIAL_MISSIONS: MissionSpec[] = [
  {
    id: 't1', name: 'Shield Basics', starGate: 0, completionCoins: 30,
    blurb: 'No weapon. Your shield is the only weapon. Let them reach you.',
    enemyKinds: { guardian: GUARDIAN_SLOW },
    events: [
      { atTimelineTick: seconds(4), kind: 'guardian', count: 1, spacing: 0 },
      { atTimelineTick: seconds(20), kind: 'guardian', count: 1, spacing: 0 },
      { atTimelineTick: seconds(36), kind: 'guardian', count: 2, spacing: 30 },
    ],
    supportCallTicks: [],
    stars: [
      { id: 't1-hull-50', family: 'hull-above', threshold: 0.5 },
      { id: 't1-all-kills', family: 'all-kills', threshold: 0 },
    ],
    forcedLoadout: { ...TUTORIAL_LOADOUT_BASE, weaponId: null },
  },
  {
    id: 't2', name: 'Weapon Systems', starGate: 1, completionCoins: 50,
    blurb: 'Watch energy drain when you fire. Dense walls slow your weapon — the right card fixes that.',
    enemyKinds: { fodder: FODDER },
    events: [
      { atTimelineTick: seconds(3), kind: 'fodder', count: 3, spacing: 14 },
      { atTimelineTick: seconds(9), kind: 'fodder', count: 4, spacing: 12 },
      { atTimelineTick: seconds(14), kind: 'fodder', count: 12, spacing: 5 },
      { atTimelineTick: seconds(24), kind: 'fodder', count: 12, spacing: 5 },
    ],
    supportCallTicks: [seconds(12)],
    firstOfferIds: ['w-dmg-30', 'w-rate-20', 'w-cost-25'],
    stars: standardStars('t2'),
    forcedLoadout: { ...TUTORIAL_LOADOUT_BASE, weaponId: 'pulse-1' },
  },
  {
    id: 't3', name: 'Support Cards', starGate: 2, completionCoins: 60,
    blurb: 'It heals faster than you shoot. You need the right card to break through.',
    enemyKinds: { fodder: FODDER, guardian: GUARDIAN_REGEN },
    events: [
      { atTimelineTick: seconds(3), kind: 'fodder', count: 3, spacing: 14 },
      { atTimelineTick: seconds(10), kind: 'guardian', count: 1, spacing: 0 },
      { atTimelineTick: seconds(22), kind: 'fodder', count: 4, spacing: 12 },
      { atTimelineTick: seconds(28), kind: 'guardian', count: 1, spacing: 0 },
    ],
    supportCallTicks: [seconds(8), seconds(24)],
    firstOfferIds: ['w-dmg-30', 's-cap-20', 'g-out-08'],
    stars: [
      { id: 't3-hull-50', family: 'hull-above', threshold: 0.5 },
      { id: 't3-all-kills', family: 'all-kills', threshold: 0 },
      { id: 't3-shield', family: 'shield-unbroken', threshold: 0 },
    ],
    forcedLoadout: { ...TUTORIAL_LOADOUT_BASE, weaponId: 'pulse-1' },
  },
  {
    id: 't4', name: 'Battle Supplies', starGate: 3, completionCoins: 70,
    blurb: 'Two supplies are preloaded. Use them — they are built for moments like this.',
    enemyKinds: { fodder: FODDER, striker: STRIKER },
    events: [
      { atTimelineTick: seconds(3), kind: 'fodder', count: 5, spacing: 10 },
      { atTimelineTick: seconds(9), kind: 'striker', count: 3, spacing: 13 },
      { atTimelineTick: seconds(15), kind: 'fodder', count: 6, spacing: 9 },
      { atTimelineTick: seconds(21), kind: 'striker', count: 4, spacing: 12 },
      { atTimelineTick: seconds(27), kind: 'fodder', count: 7, spacing: 8 },
    ],
    supportCallTicks: [seconds(12)],
    stars: standardStars('t4'),
    forcedLoadout: {
      ...TUTORIAL_LOADOUT_BASE,
      weaponId: 'pulse-1',
      suppliesGifted: { 'sup-damage': 1, 'sup-shield': 1 },
    },
  },
];

// ---------- The demo mission tree (single sector, star-gated) ----------
// Target duration: ~5 minutes per mission (motor-1 baseline, no card upgrades).
// Structure: escalating waves over ~0–210s, support calls every ~32s stopping
// at ~80% of timeline, then a final push (last ~60–80s) that introduces one
// harder enemy type not seen earlier in that mission.

export const ALL_MISSIONS: MissionSpec[] = [
  ...TUTORIAL_MISSIONS,

  // ── m1: First Contact ────────────────────────────────────────────────────
  // 14 escalating fodder waves → striker final push.
  {
    id: 'm1', name: 'First Contact', starGate: 0, completionCoins: 120,
    blurb: 'Loose fodder drifting in. Warm up the laser.',
    enemyKinds: { fodder: FODDER, striker: STRIKER },
    events: [
      { atTimelineTick: seconds(2),   kind: 'fodder',  count: 3,  spacing: 14 },
      { atTimelineTick: seconds(18),  kind: 'fodder',  count: 4,  spacing: 13 },
      { atTimelineTick: seconds(34),  kind: 'fodder',  count: 5,  spacing: 12 },
      { atTimelineTick: seconds(50),  kind: 'fodder',  count: 5,  spacing: 11 },
      { atTimelineTick: seconds(66),  kind: 'fodder',  count: 6,  spacing: 11 },
      { atTimelineTick: seconds(82),  kind: 'fodder',  count: 7,  spacing: 10 },
      { atTimelineTick: seconds(98),  kind: 'fodder',  count: 7,  spacing: 9  },
      { atTimelineTick: seconds(114), kind: 'fodder',  count: 8,  spacing: 9  },
      { atTimelineTick: seconds(130), kind: 'fodder',  count: 8,  spacing: 8  },
      { atTimelineTick: seconds(146), kind: 'fodder',  count: 9,  spacing: 8  },
      { atTimelineTick: seconds(162), kind: 'fodder',  count: 9,  spacing: 7  },
      { atTimelineTick: seconds(178), kind: 'fodder',  count: 10, spacing: 7  },
      { atTimelineTick: seconds(194), kind: 'fodder',  count: 10, spacing: 6  },
      { atTimelineTick: seconds(210), kind: 'fodder',  count: 11, spacing: 6  },
      // Final push — strikers introduced, no more support calls
      { atTimelineTick: seconds(228), kind: 'striker', count: 4,  spacing: 14 },
      { atTimelineTick: seconds(252), kind: 'striker', count: 5,  spacing: 12 },
      { atTimelineTick: seconds(276), kind: 'striker', count: 6,  spacing: 10 },
    ],
    supportCallTicks: [
      seconds(25), seconds(57), seconds(89), seconds(121),
      seconds(153), seconds(185), seconds(218),
    ],
    stars: standardStars('m1'),
  },

  // ── m2: Picket Line ──────────────────────────────────────────────────────
  // Fodder + strikers alternating, 1 blocker mid-mission → tank final push.
  {
    id: 'm2', name: 'Picket Line', starGate: 2, completionCoins: 180,
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
      // Final push — tanks introduced
      { atTimelineTick: seconds(228), kind: 'tank',    count: 2,  spacing: 22 },
      { atTimelineTick: seconds(252), kind: 'tank',    count: 2,  spacing: 20 },
      { atTimelineTick: seconds(272), kind: 'tank',    count: 3,  spacing: 18 },
    ],
    supportCallTicks: [
      seconds(22), seconds(52), seconds(82), seconds(116),
      seconds(148), seconds(188), seconds(218),
    ],
    stars: standardStars('m2'),
  },

  // ── m3: The Wall ─────────────────────────────────────────────────────────
  // Dense fodder walls + tanks + 2 mid-mission blockers → blocker final push.
  {
    id: 'm3', name: 'The Wall', starGate: 5, completionCoins: 200,
    blurb: 'Dense fodder walls. Single-target lasers will drown.',
    enemyKinds: { fodder: FODDER, tank: TANK, blocker: BLOCKER },
    events: [
      { atTimelineTick: seconds(2),   kind: 'fodder',  count: 6,  spacing: 9  },
      { atTimelineTick: seconds(14),  kind: 'fodder',  count: 8,  spacing: 8  },
      { atTimelineTick: seconds(26),  kind: 'tank',    count: 1,  spacing: 0  },
      { atTimelineTick: seconds(40),  kind: 'fodder',  count: 8,  spacing: 8  },
      { atTimelineTick: seconds(54),  kind: 'fodder',  count: 10, spacing: 7  },
      { atTimelineTick: seconds(68),  kind: 'blocker', count: 1,  spacing: 0  },
      { atTimelineTick: seconds(82),  kind: 'fodder',  count: 10, spacing: 6  },
      { atTimelineTick: seconds(96),  kind: 'tank',    count: 2,  spacing: 22 },
      { atTimelineTick: seconds(110), kind: 'fodder',  count: 11, spacing: 6  },
      { atTimelineTick: seconds(124), kind: 'fodder',  count: 12, spacing: 5  },
      { atTimelineTick: seconds(138), kind: 'blocker', count: 1,  spacing: 0  },
      { atTimelineTick: seconds(154), kind: 'fodder',  count: 12, spacing: 5  },
      { atTimelineTick: seconds(168), kind: 'tank',    count: 3,  spacing: 20 },
      { atTimelineTick: seconds(182), kind: 'fodder',  count: 13, spacing: 4  },
      { atTimelineTick: seconds(196), kind: 'fodder',  count: 14, spacing: 4  },
      // Final push — blocker pressure escalates beyond mid-mission checks
      { atTimelineTick: seconds(228), kind: 'blocker', count: 1,  spacing: 0  },
      { atTimelineTick: seconds(248), kind: 'blocker', count: 2,  spacing: 18 },
      { atTimelineTick: seconds(268), kind: 'blocker', count: 2,  spacing: 16 },
    ],
    supportCallTicks: [
      seconds(20), seconds(50), seconds(80), seconds(115),
      seconds(148), seconds(180), seconds(215),
    ],
    stars: standardStars('m3'),
  },

  // ── m4: Blockade ─────────────────────────────────────────────────────────
  // Blocker gauntlet with escalating pairs → rapid triple-blocker final push.
  {
    id: 'm4', name: 'Blockade', starGate: 8, completionCoins: 260,
    blurb: 'Blockers stall your advance until they die. DPS check.',
    enemyKinds: { fodder: FODDER, striker: STRIKER, blocker: BLOCKER },
    events: [
      { atTimelineTick: seconds(2),   kind: 'fodder',  count: 4,  spacing: 12 },
      { atTimelineTick: seconds(14),  kind: 'fodder',  count: 5,  spacing: 11 },
      { atTimelineTick: seconds(26),  kind: 'blocker', count: 1,  spacing: 0  },
      { atTimelineTick: seconds(40),  kind: 'striker', count: 3,  spacing: 15 },
      { atTimelineTick: seconds(52),  kind: 'fodder',  count: 6,  spacing: 10 },
      { atTimelineTick: seconds(64),  kind: 'blocker', count: 1,  spacing: 0  },
      { atTimelineTick: seconds(78),  kind: 'striker', count: 4,  spacing: 14 },
      { atTimelineTick: seconds(92),  kind: 'fodder',  count: 7,  spacing: 9  },
      { atTimelineTick: seconds(106), kind: 'blocker', count: 2,  spacing: 20 },
      { atTimelineTick: seconds(122), kind: 'striker', count: 5,  spacing: 13 },
      { atTimelineTick: seconds(136), kind: 'fodder',  count: 8,  spacing: 8  },
      { atTimelineTick: seconds(150), kind: 'blocker', count: 2,  spacing: 22 },
      { atTimelineTick: seconds(166), kind: 'striker', count: 5,  spacing: 12 },
      { atTimelineTick: seconds(180), kind: 'fodder',  count: 8,  spacing: 7  },
      { atTimelineTick: seconds(196), kind: 'striker', count: 6,  spacing: 11 },
      // Final push — three blockers back-to-back, no breathing room
      { atTimelineTick: seconds(228), kind: 'blocker', count: 1,  spacing: 0  },
      { atTimelineTick: seconds(244), kind: 'blocker', count: 1,  spacing: 0  },
      { atTimelineTick: seconds(260), kind: 'blocker', count: 1,  spacing: 0  },
    ],
    supportCallTicks: [
      seconds(20), seconds(50), seconds(80), seconds(115),
      seconds(148), seconds(188), seconds(218),
    ],
    stars: standardStars('m4'),
  },

  // ── m5: Asteroid Run ─────────────────────────────────────────────────────
  // Swarm floods + strikers → blocker final push (pierce builds meet their limit).
  {
    id: 'm5', name: 'Asteroid Run', starGate: 11, completionCoins: 300,
    blurb: 'A swarm too thick to shoot down. Shields are a weapon too.',
    enemyKinds: { swarm: SWARM, striker: STRIKER, blocker: BLOCKER },
    events: [
      { atTimelineTick: seconds(2),   kind: 'swarm',   count: 10, spacing: 5  },
      { atTimelineTick: seconds(12),  kind: 'swarm',   count: 12, spacing: 5  },
      { atTimelineTick: seconds(22),  kind: 'swarm',   count: 14, spacing: 4  },
      { atTimelineTick: seconds(33),  kind: 'striker', count: 3,  spacing: 15 },
      { atTimelineTick: seconds(44),  kind: 'swarm',   count: 15, spacing: 4  },
      { atTimelineTick: seconds(55),  kind: 'swarm',   count: 16, spacing: 4  },
      { atTimelineTick: seconds(66),  kind: 'striker', count: 4,  spacing: 14 },
      { atTimelineTick: seconds(77),  kind: 'swarm',   count: 20, spacing: 3  },
      { atTimelineTick: seconds(90),  kind: 'swarm',   count: 18, spacing: 3  },
      { atTimelineTick: seconds(102), kind: 'swarm',   count: 18, spacing: 3  },
      { atTimelineTick: seconds(114), kind: 'striker', count: 5,  spacing: 13 },
      { atTimelineTick: seconds(126), kind: 'swarm',   count: 20, spacing: 3  },
      { atTimelineTick: seconds(138), kind: 'striker', count: 5,  spacing: 12 },
      { atTimelineTick: seconds(150), kind: 'swarm',   count: 22, spacing: 3  },
      { atTimelineTick: seconds(164), kind: 'swarm',   count: 22, spacing: 3  },
      { atTimelineTick: seconds(178), kind: 'swarm',   count: 22, spacing: 3  },
      { atTimelineTick: seconds(192), kind: 'striker', count: 6,  spacing: 12 },
      { atTimelineTick: seconds(206), kind: 'swarm',   count: 24, spacing: 3  },
      // Final push — blockers introduced, forcing a DPS check on a swarm-tuned build
      { atTimelineTick: seconds(228), kind: 'blocker', count: 2,  spacing: 18 },
      { atTimelineTick: seconds(252), kind: 'blocker', count: 2,  spacing: 16 },
      { atTimelineTick: seconds(272), kind: 'blocker', count: 1,  spacing: 0  },
    ],
    supportCallTicks: [
      seconds(18), seconds(48), seconds(82), seconds(115),
      seconds(148), seconds(184), seconds(218),
    ],
    stars: standardStars('m5'),
  },

  // ── m6: Leviathan ────────────────────────────────────────────────────────
  // Full mixed gauntlet with 3 blocker gates → boss at seconds(250).
  // Boss time-stars measure absolute tick from mission start.
  {
    id: 'm6', name: 'Leviathan', starGate: 14, completionCoins: 500,
    blurb: 'It swims below. Kill it fast for the time-stars.',
    enemyKinds: {
      fodder: FODDER, striker: STRIKER, swarm: SWARM,
      tank: TANK, blocker: BLOCKER, boss: BOSS,
    },
    events: [
      { atTimelineTick: seconds(2),   kind: 'fodder',  count: 4,  spacing: 12 },
      { atTimelineTick: seconds(12),  kind: 'striker', count: 3,  spacing: 15 },
      { atTimelineTick: seconds(24),  kind: 'fodder',  count: 5,  spacing: 11 },
      { atTimelineTick: seconds(36),  kind: 'blocker', count: 1,  spacing: 0  },
      { atTimelineTick: seconds(50),  kind: 'striker', count: 4,  spacing: 14 },
      { atTimelineTick: seconds(62),  kind: 'fodder',  count: 6,  spacing: 10 },
      { atTimelineTick: seconds(76),  kind: 'swarm',   count: 10, spacing: 5  },
      { atTimelineTick: seconds(88),  kind: 'striker', count: 4,  spacing: 13 },
      { atTimelineTick: seconds(102), kind: 'blocker', count: 1,  spacing: 0  },
      { atTimelineTick: seconds(116), kind: 'fodder',  count: 7,  spacing: 9  },
      { atTimelineTick: seconds(130), kind: 'swarm',   count: 12, spacing: 4  },
      { atTimelineTick: seconds(144), kind: 'striker', count: 5,  spacing: 12 },
      { atTimelineTick: seconds(158), kind: 'tank',    count: 2,  spacing: 20 },
      { atTimelineTick: seconds(172), kind: 'blocker', count: 2,  spacing: 18 },
      { atTimelineTick: seconds(188), kind: 'fodder',  count: 8,  spacing: 8  },
      { atTimelineTick: seconds(202), kind: 'striker', count: 6,  spacing: 11 },
      { atTimelineTick: seconds(216), kind: 'swarm',   count: 15, spacing: 4  },
      { atTimelineTick: seconds(230), kind: 'tank',    count: 3,  spacing: 18 },
      { atTimelineTick: seconds(244), kind: 'striker', count: 6,  spacing: 10 },
      { atTimelineTick: seconds(250), kind: 'boss',    count: 1,  spacing: 0  },
    ],
    supportCallTicks: [
      seconds(15), seconds(45), seconds(75), seconds(108),
      seconds(142), seconds(175), seconds(210), seconds(235),
    ],
    stars: [
      // Boss time-stars: absolute tick from mission start at which the boss must die.
      // Thresholds assume ~60–80 DPS at mid-game; needs sim calibration.
      { id: 'm6-boss-290', family: 'boss-time', threshold: seconds(290) },
      { id: 'm6-boss-270', family: 'boss-time', threshold: seconds(270) },
      { id: 'm6-boss-260', family: 'boss-time', threshold: seconds(260) },
      ...standardStars('m6').slice(0, 2),
      { id: 'm6-all-kills', family: 'all-kills', threshold: 0 },
      { id: 'm6-shield', family: 'shield-unbroken', threshold: 0 },
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
