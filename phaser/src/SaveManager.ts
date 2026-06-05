// SaveManager.ts
// All read/write operations to localStorage go through here.
// The save is versioned so we can migrate old saves safely in the future.

import { utcDateString } from './utils/rng.js';

export interface OwnedItem {
  level: number;
}

export interface MissionRecord {
  unlocked:  boolean;
  bestStars: 0 | 1 | 2 | 3;
}

/** Persisted result of the player's most recent daily mission attempt. */
export interface DailyRecord {
  date:         string;   // UTC date "YYYY-MM-DD"
  wavesCleared: number;   // last completed wave index before death
  coinsEarned:  number;
  attempted:    boolean;  // true once ResultScene commits the result
}

export interface ShipLoadout {
  frontWeapon: string | null;
  leftWeapon:  string | null;
  rightWeapon: string | null;
  generator:   string | null;
  shields:     string | null;
}

export interface SaveData {
  version: number;
  coins: number;
  totalStarsEarned: number;  // never decreases; used for mission unlock gates
  spendableStars: number;    // spent on talent tree nodes
  welcomeSeen: boolean;
  debugEnabled: boolean;
  ship: ShipLoadout;
  inventory: Record<string, OwnedItem>;
  talents: Record<string, number>;
  missions: Record<string, MissionRecord>;
  daily: DailyRecord | null;  // null = never attempted
}

const SAVE_KEY = 'nesro-nova-save';
const SCHEMA_VERSION = 1;

// What a brand-new save looks like.
function createDefaultSave(): SaveData {
  return {
    version: SCHEMA_VERSION,
    coins: 0,
    totalStarsEarned: 0,  // never decreases — used for mission unlock gates
    spendableStars: 0,    // spent on talent tree nodes
    welcomeSeen: false,
    debugEnabled: false,
    ship: {
      frontWeapon: null,
      leftWeapon:  null,
      rightWeapon: null,
      generator:   null,
      shields:     null,
    },
    inventory: {},
    talents: {},
    missions: {
      tutorial:  { unlocked: true,  bestStars: 0 },
      mission_1: { unlocked: true,  bestStars: 0 },
      mission_2: { unlocked: false, bestStars: 0 },
      mission_3: { unlocked: false, bestStars: 0 },
    },
    daily: null,
  };
}

// Add a new case here whenever SCHEMA_VERSION increases.
function migrate(save: SaveData): SaveData {
  if (save.version === SCHEMA_VERSION) return save;
  // No migrations exist yet — schema is still version 1.
  return save;
}

export const SaveManager = {
  load(): SaveData {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return createDefaultSave();
      return migrate(JSON.parse(raw) as SaveData);
    } catch {
      // Corrupted save — start fresh rather than crash.
      console.warn('[SaveManager] Corrupted save. Starting fresh.');
      return createDefaultSave();
    }
  },

  save(data: SaveData): void {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (err) {
      console.error('[SaveManager] Write failed:', err);
      throw err;
    }
  },

  // Called from a "reset save" debug option.
  reset(): SaveData {
    localStorage.removeItem(SAVE_KEY);
    return createDefaultSave();
  },

  // Awards stars for a mission. Handles both counters correctly:
  // totalStarsEarned only increases when the player beats their previous best.
  awardMissionResult(
    save: SaveData,
    missionId: string,
    starsEarned: number,
    coinsEarned: number,
  ): { starDelta: number; newBest: number } {
    const record: MissionRecord = save.missions[missionId];
    const previousBest = record.bestStars;
    const newBest      = Math.max(previousBest, starsEarned);
    const starDelta    = newBest - previousBest;  // 0 if no improvement

    record.bestStars = newBest as 0 | 1 | 2 | 3;
    save.coins               += coinsEarned;
    save.totalStarsEarned    += starDelta;
    save.spendableStars      += starDelta;

    return { starDelta, newBest };
  },

  // Records the result of a daily mission attempt and awards coins.
  // Sets attempted = true so the daily is locked for the rest of the day.
  awardDailyResult(save: SaveData, wavesCleared: number, coinsEarned: number): void {
    save.daily  = { date: utcDateString(), wavesCleared, coinsEarned, attempted: true };
    save.coins += coinsEarned;
  },
};
