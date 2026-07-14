import { describe, expect, it } from 'vitest';
import { MOTOR_KINDS, generatorSpecAtLevel, motorSpecAtLevel } from './items';

// docs/plans/overdrive-and-reserve-trap-fixes.md — regression tests for the
// 2026-07-11 overdrive trap fix: Overdrive Lv1 used to draw more energy than any
// generator could produce at any level, permanently locking the ship into max
// brownout with a shield that never pulses (energy.ts's pulseShield only fires at
// full capacity). `pnpm tune`'s dominant-kind check caught it (100pp clear-rate spread
// on m1-m5). These tests lock in the fix's two invariants so this exact trap class
// can't silently return.

describe('motor kinds — no free-tap trap (items.test.ts)', () => {
  it('every kind shares rush-1\'s safe Lv1 stats (mult 1.0, draw 0.30) — the established pattern', () => {
    for (const kind of MOTOR_KINDS) {
      const spec = motorSpecAtLevel(kind, 1);
      expect(spec.timelineMultiplier).toBe(1.0);
      expect(spec.powerDrawPerTick).toBe(0.30);
    }
  });

  it('no motor kind at any level can starve the starter generator (torrent) by itself', () => {
    for (const kind of MOTOR_KINDS) {
      for (let level = 1; level <= 5; level++) {
        const motor = motorSpecAtLevel(kind, level);
        const torrent = generatorSpecAtLevel('torrent', level);
        expect(motor.powerDrawPerTick).toBeLessThan(torrent.outputPerTick);
      }
    }
  });
});
