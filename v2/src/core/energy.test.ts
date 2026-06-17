import { describe, expect, it } from 'vitest';
import { BROWNOUT_MAX_STRETCH, BROWNOUT_THRESHOLD } from './constants';
import { brownoutFactor, pulseShield, regenerateEnergy } from './energy';
import { FIXTURE_LOADOUT, FIXTURE_MISSION } from './fixtures';
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
});
