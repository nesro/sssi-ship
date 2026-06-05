// data/missions.ts
// Mission definitions: wave configs live in EnemyManager, but star thresholds,
// rewards, unlock requirements, and ally event timings are all declared here.

import type { MissionRecord } from '../SaveManager.js';

export interface StarThreshold {
  type:   string;
  value?: number;
}

export interface MissionRewards {
  baseCoins:         number;
  coinsPerExtraStar: number;
}

export interface MissionDefinition {
  id:             string;
  name:           string;
  description:    string;
  unlockRequires: Record<string, number> | null;
  allyEventTimes: number[];   // ms into the mission when ally ships appear
  rewards:        MissionRewards;
  starThresholds: {
    one:   StarThreshold;
    two:   StarThreshold;
    three: StarThreshold;
  };
}

export interface MissionResult {
  missionId:       string;
  bossBeaten:      boolean;
  hullPercent:     number;   // 0–100
  hullHpRemaining: number;
  secondsTaken:    number;
  enemiesKilled:   number;
  shieldBroken:    boolean;
  sideWeaponsUsed: boolean;
  wavesCleared?:   number;   // daily mission only — last wave index completed
}

export const MISSIONS: Record<string, MissionDefinition> = {
  tutorial: {
    id:             'tutorial',
    name:           'Tutorial',
    description:    'Shields absorb hits and recharge from energy. Survive 60 seconds.',
    unlockRequires: null,
    allyEventTimes: [],
    rewards: {
      baseCoins:          20,
      coinsPerExtraStar:  10,
    },
    starThresholds: {
      one:   { type: 'beat_boss' },                              // triggered by endMission(true)
      two:   { type: 'beat_boss_hull_percent_min', value: 60 },  // survive with ≥60% hull
      three: { type: 'shields_never_broken' },                   // shield never collapsed
    },
  },

  mission_1: {
    id:          'mission_1',
    name:        'First Contact',
    description: 'A scouting force approaches. Take them down.',
    unlockRequires: null,            // available from the start
    allyEventTimes: [25000, 60000],  // ms into the mission when ally ships appear
    rewards: {
      baseCoins:           80,
      coinsPerExtraStar:   40,       // earned for each star above the first
    },
    starThresholds: {
      one:   { type: 'beat_boss' },
      two:   { type: 'beat_boss_hull_percent_min', value: 50 },
      three: { type: 'beat_boss_within_seconds',   value: 75 },
    },
  },

  mission_2: {
    id:          'mission_2',
    name:        'Orbital Defense',
    description: 'Survive the asteroid field, then destroy the command circle.',
    unlockRequires: { mission_1: 1 },
    allyEventTimes: [40000, 90000],
    rewards: {
      baseCoins:          150,
      coinsPerExtraStar:   60,
    },
    starThresholds: {
      one:   { type: 'beat_boss' },
      two:   { type: 'shields_never_broken' },
      three: { type: 'enemies_killed_min', value: 60 },
    },
  },

  mission_3: {
    id:          'mission_3',
    name:        'The Swarm',
    description: 'An overwhelming force, accelerated by the nebula. Survive.',
    unlockRequires: { mission_1: 2, mission_2: 2 },
    allyEventTimes: [20000, 55000, 100000],
    rewards: {
      baseCoins:          250,
      coinsPerExtraStar:  100,
    },
    starThresholds: {
      one:   { type: 'beat_boss' },
      two:   { type: 'beat_boss_hull_hp_min', value: 10 },
      three: { type: 'no_side_weapons_used' },
    },
  },
};

// Checks whether a mission is unlocked based on current mission save records.
export function isMissionUnlocked(missionId: string, missionRecords: Record<string, MissionRecord>): boolean {
  const requirements = MISSIONS[missionId].unlockRequires;
  if (!requirements) return true;

  return Object.entries(requirements).every(([requiredId, requiredStars]) => {
    const record = missionRecords[requiredId];
    return record && record.bestStars >= requiredStars;
  });
}

// Returns 0–3 stars given the mission result.
// result shape: { bossBeaten, hullPercent, secondsTaken, shieldBroken, enemiesKilled, sideWeaponsUsed }
export function calculateStars(missionId: string, result: MissionResult): number {
  if (!result.bossBeaten) return 0;

  const { starThresholds } = MISSIONS[missionId];

  const metTwo   = checkThreshold(starThresholds.two,   result);
  const metThree = checkThreshold(starThresholds.three, result);

  if (metTwo && metThree) return 3;
  if (metTwo)             return 2;
  return 1;
}

function checkThreshold(threshold: { type: string; value?: number }, result: MissionResult): boolean {
  switch (threshold.type) {
    case 'beat_boss':                    return result.bossBeaten;
    case 'beat_boss_hull_percent_min':   return result.hullPercent >= (threshold.value ?? 0);
    case 'beat_boss_within_seconds':     return result.secondsTaken <= (threshold.value ?? Infinity);
    case 'shields_never_broken':         return !result.shieldBroken;
    case 'enemies_killed_min':           return result.enemiesKilled >= (threshold.value ?? 0);
    case 'beat_boss_hull_hp_min':        return (result.hullHpRemaining ?? 0) >= (threshold.value ?? 0);
    case 'no_side_weapons_used':         return !result.sideWeaponsUsed;
    default:                             return false;
  }
}

// Calculates coins earned from a completed mission.
export function calculateCoins(missionId: string, starsEarned: number): number {
  const { baseCoins, coinsPerExtraStar } = MISSIONS[missionId].rewards;
  const extraStars = Math.max(0, starsEarned - 1);
  return baseCoins + extraStars * coinsPerExtraStar;
}
