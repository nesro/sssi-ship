import type { ComputedStats } from '../../src/game/computeStats.js';
import type { RunState } from '../../src/game/CardManager.js';
import type { MissionWaveSpec } from '../../src/game/WaveSpec.js';

export interface SimEnemy {
  hp:          number;
  maxHp:       number;
  shootMs:     number;
  nextShotMs:  number;
  kind:        'star' | 'circle' | 'boss';
  spawnTimeMs: number;
  speed:       number;
}

export interface SimConfig {
  missionSpec: MissionWaveSpec;
  stats:       ComputedStats;
  /** 0 = no chain cards, 1 = explosive_rounds pool, 2 = overcharge/chain_lightning pool */
  chainLevel?: number;
}

export interface SimResult {
  won:          boolean;
  hullHpLeft:   number;
  hullMaxHp:    number;
  secondsTaken: number;
  cardsPickedN: number;
  shieldBroken: boolean;
}

export type { RunState, ComputedStats, MissionWaveSpec };
