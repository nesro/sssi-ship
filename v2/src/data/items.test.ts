import { describe, expect, it } from 'vitest';
import {
  MAX_REAR_WEAPON_LEVEL,
  MAX_SIDE_WEAPON_LEVEL,
  MAX_WEAPON_LEVEL,
  MOTOR_KINDS,
  REAR_WEAPON_KINDS,
  SIDE_WEAPON_KINDS,
  WEAPON_KINDS,
  generatorSpecAtLevel,
  motorSpecAtLevel,
  rearWeaponSpecAtLevel,
  sideWeaponSpecAtLevel,
  weaponSpecAtLevel,
} from './items';

// A motor kind's Lv1 must never draw more energy than any generator can produce at
// any level — that would permanently lock the ship into max brownout with a shield
// that never pulses (energy.ts's pulseShield only fires at full capacity). These
// tests lock in that invariant so this trap class can't silently return.

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

// `ReplayRecord` embeds the full loadout spec and gets JSON-serialized;
// JSON.stringify(Infinity) === "null", which would silently break an "all targets"
// weapon (nova, y2010, orbital) the moment a replay round-trips through storage. Every
// catalog spec's maxTargets must be a real finite number (HIT_ALL_TARGETS, not
// Infinity) — swept across every kind/level, not just the three known "hits everyone"
// kinds, so a future kind can't reintroduce this trap unnoticed.
describe('weapon catalog specs are JSON-safe (no Infinity, 2026-07-18 fix)', () => {
  it('every front weapon kind/level has a finite maxTargets', () => {
    for (const kind of WEAPON_KINDS) {
      for (let level = 1; level <= MAX_WEAPON_LEVEL; level++) {
        expect(Number.isFinite(weaponSpecAtLevel(kind, level).maxTargets)).toBe(true);
      }
    }
  });

  it('every rear weapon kind/level has a finite maxTargets', () => {
    for (const kind of REAR_WEAPON_KINDS) {
      for (let level = 1; level <= MAX_REAR_WEAPON_LEVEL; level++) {
        expect(Number.isFinite(rearWeaponSpecAtLevel(kind, level).maxTargets)).toBe(true);
      }
    }
  });

  it('every side weapon kind/level has a finite maxTargets', () => {
    for (const kind of SIDE_WEAPON_KINDS) {
      for (let level = 1; level <= MAX_SIDE_WEAPON_LEVEL; level++) {
        expect(Number.isFinite(sideWeaponSpecAtLevel(kind, level).maxTargets)).toBe(true);
      }
    }
  });

  it('a finite maxTargets survives a JSON round-trip unchanged', () => {
    const nova = weaponSpecAtLevel('nova', 1);
    const roundTripped = JSON.parse(JSON.stringify(nova)) as typeof nova;
    expect(roundTripped.maxTargets).toBe(nova.maxTargets);
  });
});
