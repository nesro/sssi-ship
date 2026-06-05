// data/daily.ts
// Daily mission wave generation.
// Waves are deterministic given the seed so all players face the same layout.

import { mulberry32, utcDateInt, utcDateString } from '../utils/rng.js';

// Re-export for consumers that need the date string.
export { utcDateString };

export const DAILY_MISSION_ID = 'daily';

// How long between wave spawns (ms).
export const DAILY_WAVE_INTERVAL_MS = 30_000;

// Maximum pre-generated waves — far more than any player will reach.
const DAILY_WAVE_COUNT = 50;

// Enemy count growth cap to prevent screen clutter.
const MAX_ENEMIES_PER_WAVE = 12;

export interface DailyWaveSpec {
  waveIndex:  number;   // 0-based; shown to player as waveIndex + 1
  count:      number;   // number of star enemies (ignored if isBossWave)
  enemyHp:    number;   // HP for regular enemies; mini-boss gets 3×
  shootMs:    number;   // base fire interval (ms); game adds ±20% jitter
  isBossWave: boolean;  // spawn one War Circle instead of stars
}

/**
 * Generates the full wave schedule for a given seed.
 * Currently fully deterministic; the rng parameter is reserved for future
 * procedural variation (e.g. mixed enemy types, random modifiers).
 */
export function generateDailyWaves(seed: number): DailyWaveSpec[] {
  void mulberry32(seed); // seed consumed; reserved for future variation

  const waves: DailyWaveSpec[] = [];
  for (let i = 0; i < DAILY_WAVE_COUNT; i++) {
    waves.push({
      waveIndex:  i,
      count:      Math.min(3 + Math.floor(i * 0.35), MAX_ENEMIES_PER_WAVE),
      enemyHp:    Math.round(10 * (1 + i * 0.18)),
      shootMs:    Math.max(800, 3000 - i * 45),
      isBossWave: i > 0 && i % 5 === 0,
    });
  }
  return waves;
}

/**
 * Coin reward for a daily run.
 * Scales quadratically: 5 waves → 112 ◈, 10 waves → 300 ◈, 20 waves → 900 ◈.
 */
export function dailyCoins(wavesCleared: number): number {
  return Math.floor(15 * wavesCleared * (1 + wavesCleared * 0.1));
}

/** Returns today's seed for the daily mission. */
export function todayDailySeed(): number {
  return utcDateInt();
}
