// WaveSpec.ts
// Single source of truth for per-mission wave configs.
// No Phaser — consumed by both GameScene (live) and SimEngine (headless).

export type EnemyKind = 'star' | 'circle';

export interface WaveEvent {
  atMs:        number;
  kind:        EnemyKind;
  count:       number;
  hp:          number;
  shootMsMin:  number;
  shootMsMax:  number;
  /** Override default descent speed (star=85, circle=60 px/s). */
  speed?:      number;
  /** Wave label shown in the HUD ("WAVE 1", "⚠ BOSS", …). */
  label?:      string;
}

export interface MissionWaveSpec {
  waves:                 WaveEvent[];
  bossAtMs?:             number;
  bossHp?:               number;
  bossShootMs?:          number;
  /** Tutorial: auto-win when timer reaches this ms value. */
  autoWinAtMs?:          number;
  /** Mission 2: asteroid field runs until this ms value. */
  asteroidFieldUntilMs?: number;
  /** Mission 3: nebula speed multiplier applied to enemies spawning before nebulaUntilMs. */
  nebulaMul?:            number;
  nebulaUntilMs?:        number;
}

// Default descent speeds (px/s) per enemy kind.
export const DEFAULT_SPEED: Record<EnemyKind, number> = { star: 85, circle: 60 };

// SimEngine uses the midpoint of the shoot range as a deterministic approximation.
export function midShootMs(wave: Pick<WaveEvent, 'shootMsMin' | 'shootMsMax'>): number {
  return (wave.shootMsMin + wave.shootMsMax) / 2;
}

export const WAVE_SPECS: Record<string, MissionWaveSpec> = {
  tutorial: {
    waves: [
      { atMs:  3000, kind: 'star', count: 2, hp: 5, speed: 55, shootMsMin: 3000, shootMsMax: 5000, label: 'WAVE 1' },
      { atMs: 12000, kind: 'star', count: 2, hp: 5, speed: 55, shootMsMin: 3000, shootMsMax: 5000, label: 'WAVE 2' },
      { atMs: 25000, kind: 'star', count: 3, hp: 5, speed: 55, shootMsMin: 3000, shootMsMax: 5000, label: 'WAVE 3' },
      { atMs: 40000, kind: 'star', count: 3, hp: 5, speed: 55, shootMsMin: 3000, shootMsMax: 5000, label: 'WAVE 4' },
    ],
    autoWinAtMs: 60000,
  },

  mission_1: {
    waves: [
      { atMs:  2000, kind: 'star', count: 5,  hp: 10, shootMsMin: 1800, shootMsMax: 3500, label: 'WAVE 1' },
      { atMs: 12000, kind: 'star', count: 6,  hp: 10, shootMsMin: 1800, shootMsMax: 3500, label: 'WAVE 2' },
      { atMs: 22000, kind: 'star', count: 7,  hp: 10, shootMsMin: 1800, shootMsMax: 3500, label: 'WAVE 3' },
      { atMs: 32000, kind: 'star', count: 8,  hp: 10, shootMsMin: 1800, shootMsMax: 3500, label: 'WAVE 4' },
      { atMs: 44000, kind: 'star', count: 10, hp: 10, shootMsMin: 1800, shootMsMax: 3500, label: 'WAVE 5' },
    ],
    bossAtMs: 55000, bossHp: 450, bossShootMs: 320,
  },

  mission_2: {
    waves: [
      { atMs:  5000, kind: 'star',   count: 4, hp: 20, shootMsMin: 1800, shootMsMax: 3500, label: 'WAVE 1' },
      { atMs: 18000, kind: 'star',   count: 3, hp: 20, shootMsMin: 1800, shootMsMax: 3500, label: 'WAVE 2' },
      { atMs: 18000, kind: 'circle', count: 2, hp: 30, shootMsMin: 2000, shootMsMax: 3000 },
      { atMs: 35000, kind: 'star',   count: 5, hp: 20, shootMsMin: 1800, shootMsMax: 3500, label: 'WAVE 3' },
      { atMs: 50000, kind: 'star',   count: 2, hp: 20, shootMsMin: 1800, shootMsMax: 3500, label: 'WAVE 4' },
      { atMs: 50000, kind: 'circle', count: 3, hp: 30, shootMsMin: 2000, shootMsMax: 3000 },
      { atMs: 68000, kind: 'star',   count: 6, hp: 20, shootMsMin: 1800, shootMsMax: 3500, label: 'WAVE 5' },
      { atMs: 68000, kind: 'circle', count: 2, hp: 30, shootMsMin: 2000, shootMsMax: 3000 },
    ],
    bossAtMs: 90000, bossHp: 175, bossShootMs: 500,
    asteroidFieldUntilMs: 90000,
  },

  mission_3: {
    waves: [
      { atMs:  3000, kind: 'star',   count: 8,  hp: 30, shootMsMin: 1800, shootMsMax: 3500, label: 'WAVE 1' },
      { atMs: 14000, kind: 'circle', count: 4,  hp: 30, shootMsMin: 2000, shootMsMax: 3000, label: 'WAVE 2' },
      { atMs: 26000, kind: 'star',   count: 10, hp: 30, shootMsMin: 1800, shootMsMax: 3500, label: 'WAVE 3' },
      { atMs: 40000, kind: 'circle', count: 5,  hp: 30, shootMsMin: 2000, shootMsMax: 3000, label: 'WAVE 4' },
      { atMs: 55000, kind: 'star',   count: 12, hp: 30, shootMsMin: 1800, shootMsMax: 3500, label: 'WAVE 5' },
      { atMs: 73000, kind: 'star',   count: 4,  hp: 30, shootMsMin: 1800, shootMsMax: 3500, label: 'WAVE 6' },
      { atMs: 73000, kind: 'circle', count: 6,  hp: 30, shootMsMin: 2000, shootMsMax: 3000 },
    ],
    bossAtMs: 95000, bossHp: 1400, bossShootMs: 510,
    nebulaMul: 1.6, nebulaUntilMs: 60000,
  },
};
