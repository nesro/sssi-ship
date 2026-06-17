import { describe, expect, it } from 'vitest';
import { FIXTURE_LOADOUT, FIXTURE_MISSION, FIXTURE_WEAPON, makeFixtureEnemy } from './fixtures';
import { activeDamageMult } from './stats';
import { createCoreState } from './state';
import { applyBoost, pruneExpiredEffects } from './supplies';
import { advanceTick } from './tick';
import type { CoreState, SupplyLoadout } from './types';

const SUPPLIES: SupplyLoadout[] = [
  {
    spec: {
      id: 's-shield', name: 'SHIELD BOOST', description: '+20 shield',
      kind: 'shield-restore', magnitude: 20, durationTicks: 0, maxCharges: 3,
    },
    charges: 2,
  },
  {
    spec: {
      id: 's-energy', name: 'ENERGY FLUSH', description: 'refill',
      kind: 'energy-refill', magnitude: 0, durationTicks: 0, maxCharges: 2,
    },
    charges: 1,
  },
  {
    spec: {
      id: 's-rage', name: 'RAGE', description: 'x2 dmg 5 s',
      kind: 'damage-boost', magnitude: 2, durationTicks: 50, maxCharges: 2,
    },
    charges: 1,
  },
];

function freshState(): CoreState {
  return createCoreState(
    FIXTURE_MISSION,
    { ...FIXTURE_LOADOUT, supplies: SUPPLIES },
    1,
  );
}

describe('applyBoost', () => {
  it('shield restore clamps at capacity and consumes a charge', () => {
    const state = freshState();
    state.ship.shield = 25; // capacity 30
    applyBoost(state, 0);
    expect(state.ship.shield).toBe(30);
    expect(state.supplies[0]?.chargesLeft).toBe(1);
    expect(state.boostTaps).toEqual([{ tick: 0, slot: 0 }]);
  });

  it('energy refill fills to generator capacity', () => {
    const state = freshState();
    state.ship.energy = 3;
    applyBoost(state, 1);
    expect(state.ship.energy).toBe(FIXTURE_LOADOUT.generator.capacity);
  });

  it('damage boost doubles damage and expires after its duration', () => {
    const state = freshState();
    applyBoost(state, 2);
    expect(activeDamageMult(state)).toBe(2);
    state.tick = 49;
    expect(activeDamageMult(state)).toBe(2);
    state.tick = 50;
    expect(activeDamageMult(state)).toBe(1);
    pruneExpiredEffects(state);
    expect(state.activeEffects).toHaveLength(0);
  });

  it('throws on an empty supply', () => {
    const state = freshState();
    applyBoost(state, 1);
    expect(() => { applyBoost(state, 1); }).toThrow(/no charges left/);
  });

  it('throws on an unknown slot', () => {
    const state = freshState();
    expect(() => { applyBoost(state, 9); }).toThrow(/No supply in slot 9/);
  });

  it('boosted damage applies inside the tick pipeline', () => {
    const state = freshState();
    state.enemies = [makeFixtureEnemy({ hp: 1000, distance: 90 })];
    state.ship.fireTimer = 1;
    applyBoost(state, 2);
    advanceTick(state);
    expect(state.stats.damageDealt).toBe(FIXTURE_WEAPON.damagePerShot * 2);
  });
});
