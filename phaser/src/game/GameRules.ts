// GameRules.ts
// Pure game constants and formulas — no Phaser, no side effects.
// Both GameScene and SimEngine import from here; changing a value here
// propagates to both the live game and the balance simulator.

// ─── combat constants ─────────────────────────────────────────────────────────

export const SHOT_DAMAGE             = 5;
export const ENEMY_COLLISION_DAMAGE  = 20;
export const ASTEROID_DAMAGE         = 5;
export const ASTEROID_INTERVAL_MS    = 2500;
export const HULL_MAX_HP             = 100;

// ─── XP economy ───────────────────────────────────────────────────────────────

// Cumulative XP to reach level 2, 3, 4, 5, 6 (index = target level − 2).
export const XP_THRESHOLDS: readonly number[] = [50, 130, 250, 400, 600] as const;

export const XP_PER_KILL: Readonly<Record<string, number>> = {
  star:   15,
  circle: 40,
  boss:   300,
};

// ─── coin economy ─────────────────────────────────────────────────────────────

export const COINS_PER_KILL: Readonly<Record<string, number>> = {
  star:   3,
  circle: 8,
  boss:   0,
};

// ─── score ────────────────────────────────────────────────────────────────────

export function pointsForEnemyType(type: string): number {
  if (type === 'boss')   return 5000;
  if (type === 'circle') return 500;
  return 50;
}

// ─── level-up check ───────────────────────────────────────────────────────────

// Returns true if the player should level up now.
// Caller is responsible for incrementing run.level after drawing cards.
export function isReadyToLevelUp(xp: number, level: number): boolean {
  if (level > XP_THRESHOLDS.length) return false;
  const threshold = XP_THRESHOLDS[level - 1];
  return threshold !== undefined && xp >= threshold;
}
