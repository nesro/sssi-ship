import type { ComputedStats } from '../../src/game/computeStats.js';
import type { RunState } from '../../src/game/CardManager.js';

export interface SimEnemy {
  hp:         number;
  maxHp:      number;
  shootMs:    number;   // base interval between shots
  nextShotMs: number;   // absolute time of next shot
}

export interface EnemySpec {
  hp:       number;
  shootMs:  number;
  xp:       number;
}

export interface WaveSpec {
  atMs:      number;
  count:     number;
  enemySpec: EnemySpec;
}

export interface MissionSpec {
  id:           string;
  waves:        WaveSpec[];
  bossSpec?:    EnemySpec;   // absent for missions that auto-win (e.g. tutorial)
  autoWinAtMs?: number;      // if set, mission auto-wins when time reaches this value
}

export interface SimConfig {
  missionSpec: MissionSpec;
  stats:       ComputedStats;
}

export interface SimResult {
  won:          boolean;
  hullHpLeft:   number;
  hullMaxHp:    number;
  secondsTaken: number;
  cardsPickedN: number;
  shieldBroken: boolean;
}

// Re-export RunState so SimEngine doesn't need to import from src/types directly.
export type { RunState, ComputedStats };
