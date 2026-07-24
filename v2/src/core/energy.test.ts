import { describe, expect, it } from 'vitest';
import { BROWNOUT_MAX_STRETCH, BROWNOUT_THRESHOLD } from './constants';
import { brownoutFactor, pulseShield, regenerateEnergy } from './energy';
import { FIXTURE_LOADOUT, FIXTURE_MISSION, makeFixtureEnemy } from './fixtures';
import { computeEffectiveStats, defaultModifiers } from './stats';
import { createCoreState } from './state';
import type { CoreState, LoadoutSnapshot } from './types';

function freshState(): CoreState {
  return createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1);
}

function statsFor(loadout: LoadoutSnapshot = FIXTURE_LOADOUT) {
  return computeEffectiveStats(loadout, defaultModifiers());
}

describe('regenerateEnergy', () => {
  it('adds generator output minus motor draw, clamped at capacity', () => {
    const state = freshState();
    state.ship.energy = 10;
    regenerateEnergy(state, statsFor());
    const { generator, motor } = FIXTURE_LOADOUT;
    expect(state.ship.energy).toBeCloseTo(10 + generator.outputPerTick - motor.powerDrawPerTick);
  });

  it('never exceeds generator capacity', () => {
    const state = freshState();
    state.ship.energy = FIXTURE_LOADOUT.generator.capacity;
    regenerateEnergy(state, statsFor());
    expect(state.ship.energy).toBe(FIXTURE_LOADOUT.generator.capacity);
  });

  it('never goes below zero even when motor draw exceeds output', () => {
    const state = freshState();
    const heavyMotor: LoadoutSnapshot = {
      ...FIXTURE_LOADOUT,
      motor: { ...FIXTURE_LOADOUT.motor, powerDrawPerTick: 99 },
    };
    state.ship.energy = 1;
    regenerateEnergy(state, statsFor(heavyMotor));
    expect(state.ship.energy).toBe(0);
  });
});

describe('regenerateEnergy: conditional output bonuses', () => {
  it('highHullGenBonus: extra output when hull is above 80%', () => {
    const state = freshState();
    state.modifiers = { ...state.modifiers, highHullGenBonus: 0.5 };
    state.ship.hull = state.ship.maxHull; // 100% — above 80%
    state.ship.energy = 0;
    const stats = statsFor();
    regenerateEnergy(state, stats);
    // output = generatorOutput × (1 + 0.5) = 2 × 1.5 = 3, minus motor draw 0.3 = 2.7
    expect(state.ship.energy).toBeCloseTo(stats.generatorOutput * 1.5 - stats.motorDraw);
  });

  it('highHullGenBonus: no bonus when hull is at or below 80%', () => {
    const state = freshState();
    state.modifiers = { ...state.modifiers, highHullGenBonus: 0.5 };
    state.ship.hull = Math.floor(state.ship.maxHull * 0.8); // exactly 80% — no bonus
    state.ship.energy = 0;
    const stats = statsFor();
    regenerateEnergy(state, stats);
    expect(state.ship.energy).toBeCloseTo(stats.generatorOutput - stats.motorDraw);
  });

  it('bossAliveGenBonus: extra output when a boss is present', () => {
    const state = freshState();
    state.modifiers = { ...state.modifiers, bossAliveGenBonus: 0.5 };
    state.enemies = [makeFixtureEnemy({ id: 1, kind: 'boss', hp: 100, maxHp: 100, distance: 50, speed: 0,
      shootTimer: 10, ticksBetweenShots: 10, blocksConveyor: true, coinReward: 50,
      isBoss: true, regenPerTick: 0, shotDamage: 5, critChance: 0, missChance: 0, critMult: 2 })];
    state.ship.energy = 0;
    const stats = statsFor();
    regenerateEnergy(state, stats);
    expect(state.ship.energy).toBeCloseTo(stats.generatorOutput * 1.5 - stats.motorDraw);
  });

  it('bossAliveGenBonus: no bonus when no boss is present', () => {
    const state = freshState();
    state.modifiers = { ...state.modifiers, bossAliveGenBonus: 0.5 };
    state.enemies = []; // no boss
    state.ship.energy = 0;
    const stats = statsFor();
    regenerateEnergy(state, stats);
    expect(state.ship.energy).toBeCloseTo(stats.generatorOutput - stats.motorDraw);
  });
});

describe('brownoutFactor', () => {
  const capacity = 100;

  it('is 1 at or above the threshold', () => {
    expect(brownoutFactor(capacity * BROWNOUT_THRESHOLD, capacity)).toBe(1);
    expect(brownoutFactor(capacity, capacity)).toBe(1);
  });

  it('reaches max stretch at zero energy — but never infinity (never stops firing)', () => {
    expect(brownoutFactor(0, capacity)).toBe(BROWNOUT_MAX_STRETCH);
    expect(Number.isFinite(brownoutFactor(0, capacity))).toBe(true);
  });

  it('stretches smoothly and monotonically below the threshold', () => {
    const half = brownoutFactor((capacity * BROWNOUT_THRESHOLD) / 2, capacity);
    expect(half).toBeGreaterThan(1);
    expect(half).toBeLessThan(BROWNOUT_MAX_STRETCH);
    const lower = brownoutFactor(capacity * 0.05, capacity);
    expect(lower).toBeGreaterThan(half);
  });
});

describe('pulseShield', () => {
  it('fires when generator is at full capacity and restores a fraction of shield capacity', () => {
    const state = freshState();
    state.ship.shield = 0;
    const stats = statsFor();
    state.ship.energy = stats.generatorCapacity; // full
    pulseShield(state, stats);
    expect(state.ship.shield).toBeCloseTo(stats.shieldPulseFraction * stats.shieldCapacity);
  });

  it('drains the generator by pulseDrainFraction after firing', () => {
    const state = freshState();
    state.ship.shield = 0;
    const stats = statsFor();
    state.ship.energy = stats.generatorCapacity;
    pulseShield(state, stats);
    expect(state.ship.energy).toBeCloseTo(stats.generatorCapacity - stats.generatorPulseDrain);
  });

  it('does not fire when generator is below full capacity', () => {
    const state = freshState();
    state.ship.shield = 0;
    const stats = statsFor();
    state.ship.energy = stats.generatorCapacity - 1;
    pulseShield(state, stats);
    expect(state.ship.shield).toBe(0);
  });

  it('does not fire when shield is already at full capacity', () => {
    const state = freshState();
    const stats = statsFor();
    state.ship.energy = stats.generatorCapacity;
    state.ship.shield = stats.shieldCapacity; // already full
    const energyBefore = state.ship.energy;
    pulseShield(state, stats);
    expect(state.ship.shield).toBe(stats.shieldCapacity);
    expect(state.ship.energy).toBe(energyBefore);
  });

  it('clamps shield gain so it never exceeds capacity', () => {
    const state = freshState();
    const stats = statsFor();
    // Set shield so one pulse would overflow
    state.ship.shield = stats.shieldCapacity * 0.99;
    state.ship.energy = stats.generatorCapacity;
    pulseShield(state, stats);
    expect(state.ship.shield).toBeLessThanOrEqual(stats.shieldCapacity);
  });

  it('energy never goes below zero after pulse drain', () => {
    const state = freshState();
    const stats = statsFor();
    state.ship.shield = 0;
    state.ship.energy = stats.generatorCapacity; // full but pulseDrain might exceed energy
    pulseShield(state, stats);
    expect(state.ship.energy).toBeGreaterThanOrEqual(0);
  });

  it('energyPerPulse: energy is restored by flat amount after each pulse', () => {
    const state = freshState();
    state.modifiers = { ...state.modifiers, energyPerPulse: 5 };
    state.ship.shield = 0;
    const stats = statsFor();
    state.ship.energy = stats.generatorCapacity;
    pulseShield(state, stats);
    // After pulse: energy = capacity - pulseDrain + energyPerPulse
    const expected = Math.min(stats.generatorCapacity, stats.generatorCapacity - stats.generatorPulseDrain + 5);
    expect(state.ship.energy).toBeCloseTo(expected);
  });

  it('volatileCoreLosePct = 1.0: energy drops to 0 after every pulse', () => {
    const state = freshState();
    state.modifiers = { ...state.modifiers, volatileCoreLosePct: 1.0 }; // always vents
    state.ship.shield = 0;
    const stats = statsFor();
    state.ship.energy = stats.generatorCapacity;
    pulseShield(state, stats);
    expect(state.ship.energy).toBe(0);
  });

  it('volatileCoreLosePct = 0: energy is unaffected by the vent check', () => {
    const state = freshState();
    state.modifiers = { ...state.modifiers, volatileCoreLosePct: 0 };
    state.ship.shield = 0;
    const stats = statsFor();
    state.ship.energy = stats.generatorCapacity;
    pulseShield(state, stats);
    // Energy should be capacity - pulseDrain (no venting)
    expect(state.ship.energy).toBeCloseTo(stats.generatorCapacity - stats.generatorPulseDrain);
  });
});
