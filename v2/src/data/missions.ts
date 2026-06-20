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
  kind: 'boss', hp: 700, speed: 0.25, shotDamage: 8,
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
  id: 'w0', name: 'Calibration Run', starGate: 0, completionCoins: 50,
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
  forcedLoadout: { shieldId: 'shield-1', generatorId: 'generator-1', motorId: 'motor-1', weaponId: 'pulse-1' },
  narratorEvents: W0_NARRATOR_EVENTS,
};

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
// hp=25 so the 7th guardian dies from accumulated burst damage before reaching the ship,
// demonstrating the mechanic. missChance=0.9 reduces shot pressure to non-lethal.
const GUARDIAN_SLOW: EnemySpec = {
  kind: 'guardian', hp: 25, speed: 0.15, shotDamage: 3,
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
  {
    id: 't1', name: 'Shield Basics', starGate: 0, completionCoins: 30,
    blurb: 'No weapon. Your shield is the only weapon. Let them reach you.',
    enemyKinds: { guardian: GUARDIAN_SLOW },
    events: [
      { atTimelineTick: seconds(3),  kind: 'guardian', count: 2, spacing: 28 },
      { atTimelineTick: seconds(14), kind: 'guardian', count: 2, spacing: 25 },
      { atTimelineTick: seconds(25), kind: 'guardian', count: 3, spacing: 22 },
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
      { atTimelineTick: seconds(14), kind: 'fodder', count: 8, spacing: 10 },
      { atTimelineTick: seconds(24), kind: 'fodder', count: 8, spacing: 10 },
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
  WELCOME_MISSION,
  ...TUTORIAL_MISSIONS,

  // ── m1: First Contact ────────────────────────────────────────────────────
  // 14 escalating fodder waves (10s apart — no dead gaps) → striker final push.
  {
    id: 'm1', name: 'First Contact', starGate: 0, completionCoins: 120,
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
      { atTimelineTick: seconds(72),  kind: 'fodder',  count: 8,  spacing: 9  },
      { atTimelineTick: seconds(82),  kind: 'fodder',  count: 8,  spacing: 8  },
      { atTimelineTick: seconds(92),  kind: 'fodder',  count: 9,  spacing: 8  },
      { atTimelineTick: seconds(102), kind: 'fodder',  count: 9,  spacing: 7  },
      { atTimelineTick: seconds(112), kind: 'fodder',  count: 10, spacing: 7  },
      { atTimelineTick: seconds(122), kind: 'fodder',  count: 10, spacing: 6  },
      { atTimelineTick: seconds(132), kind: 'fodder',  count: 11, spacing: 6  },
      // Final push — strikers introduced, no more support calls
      { atTimelineTick: seconds(148), kind: 'striker', count: 4,  spacing: 14 },
      { atTimelineTick: seconds(164), kind: 'striker', count: 5,  spacing: 12 },
      { atTimelineTick: seconds(180), kind: 'striker', count: 6,  spacing: 10 },
    ],
    supportCallTicks: [
      seconds(20), seconds(48), seconds(76), seconds(104),
      seconds(132), seconds(158),
    ],
    stars: missionStars('m1', 240, 210, 185, 160),
  },

  // ── m2: Picket Line ──────────────────────────────────────────────────────
  // Fodder + strikers alternating, 1 blocker mid-mission → tank final push.
  {
    id: 'm2', name: 'Picket Line', starGate: 5, completionCoins: 180,
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
      { atTimelineTick: seconds(210), kind: 'striker', count: 3,  spacing: 14 },
      { atTimelineTick: seconds(220), kind: 'fodder',  count: 5,  spacing: 9  },
      // Final push — tanks introduced
      { atTimelineTick: seconds(232), kind: 'tank',    count: 2,  spacing: 22 },
      { atTimelineTick: seconds(252), kind: 'tank',    count: 2,  spacing: 20 },
      { atTimelineTick: seconds(268), kind: 'tank',    count: 3,  spacing: 18 },
    ],
    supportCallTicks: [
      seconds(22), seconds(52), seconds(82), seconds(116),
      seconds(148), seconds(188), seconds(218),
    ],
    stars: missionStars('m2', 320, 285, 255, 225),
  },

  // ── m3: The Wall ─────────────────────────────────────────────────────────
  // Dense fodder walls + tanks + 2 mid-mission blockers → blocker final push.
  {
    id: 'm3', name: 'The Wall', starGate: 12, completionCoins: 200,
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
      { atTimelineTick: seconds(208), kind: 'tank',    count: 2,  spacing: 20 },
      { atTimelineTick: seconds(218), kind: 'fodder',  count: 10, spacing: 5  },
      // Final push — blocker pressure escalates beyond mid-mission checks
      { atTimelineTick: seconds(230), kind: 'blocker', count: 1,  spacing: 0  },
      { atTimelineTick: seconds(250), kind: 'blocker', count: 2,  spacing: 18 },
      { atTimelineTick: seconds(270), kind: 'blocker', count: 2,  spacing: 16 },
    ],
    supportCallTicks: [
      seconds(20), seconds(50), seconds(80), seconds(115),
      seconds(148), seconds(180), seconds(215),
    ],
    stars: missionStars('m3', 325, 290, 260, 230),
  },

  // ── m4: Blockade ─────────────────────────────────────────────────────────
  // Blocker gauntlet with escalating pairs → rapid triple-blocker final push.
  {
    id: 'm4', name: 'Blockade', starGate: 20, completionCoins: 260,
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
      { atTimelineTick: seconds(208), kind: 'fodder',  count: 6,  spacing: 9  },
      { atTimelineTick: seconds(218), kind: 'striker', count: 4,  spacing: 12 },
      // Final push — three blockers back-to-back, no breathing room
      { atTimelineTick: seconds(230), kind: 'blocker', count: 1,  spacing: 0  },
      { atTimelineTick: seconds(246), kind: 'blocker', count: 1,  spacing: 0  },
      { atTimelineTick: seconds(262), kind: 'blocker', count: 1,  spacing: 0  },
    ],
    supportCallTicks: [
      seconds(20), seconds(50), seconds(80), seconds(115),
      seconds(148), seconds(188), seconds(218),
    ],
    stars: missionStars('m4', 315, 280, 255, 225),
  },

  // ── m5: Asteroid Run ─────────────────────────────────────────────────────
  // Swarm floods + strikers → blocker final push (pierce builds meet their limit).
  {
    id: 'm5', name: 'Asteroid Run', starGate: 28, completionCoins: 300,
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
      { atTimelineTick: seconds(216), kind: 'striker', count: 4,  spacing: 12 },
      { atTimelineTick: seconds(224), kind: 'swarm',   count: 20, spacing: 3  },
      // Final push — blockers introduced, forcing a DPS check on a swarm-tuned build
      { atTimelineTick: seconds(234), kind: 'blocker', count: 2,  spacing: 18 },
      { atTimelineTick: seconds(256), kind: 'blocker', count: 2,  spacing: 16 },
      { atTimelineTick: seconds(274), kind: 'blocker', count: 1,  spacing: 0  },
    ],
    supportCallTicks: [
      seconds(18), seconds(48), seconds(82), seconds(115),
      seconds(148), seconds(184), seconds(218),
    ],
    stars: missionStars('m5', 325, 290, 260, 230),
  },

  // ── m6: Leviathan ────────────────────────────────────────────────────────
  // Full mixed gauntlet with 3 blocker gates → boss at seconds(250).
  // Boss time-stars measure absolute tick from mission start.
  {
    id: 'm6', name: 'Leviathan', starGate: 36, completionCoins: 500,
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
      { atTimelineTick: seconds(106), kind: 'blocker',  count: 1,  spacing: 0  },
      { atTimelineTick: seconds(120), kind: 'fodder',   count: 7,  spacing: 9  },
      { atTimelineTick: seconds(134), kind: 'swarm',    count: 12, spacing: 4  },
      { atTimelineTick: seconds(148), kind: 'striker',  count: 5,  spacing: 12 },
      { atTimelineTick: seconds(162), kind: 'tank',     count: 2,  spacing: 20 },
      // Kamikaze rush through the blocker gate — high speed, high damage
      { atTimelineTick: seconds(170), kind: 'kamikaze', count: 3,  spacing: 8  },
      { atTimelineTick: seconds(178), kind: 'blocker',  count: 2,  spacing: 18 },
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
    stars: [
      // Boss time-stars: tick from mission start by which the boss must die.
      { id: 'm6-boss-320', family: 'boss-time', threshold: seconds(320) },
      { id: 'm6-boss-295', family: 'boss-time', threshold: seconds(295) },
      { id: 'm6-boss-275', family: 'boss-time', threshold: seconds(275) },
      { id: 'm6-boss-260', family: 'boss-time', threshold: seconds(260) },
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
