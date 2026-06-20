import { describe, expect, it } from 'vitest';
import { COLLISION_DAMAGE_MULTIPLIER } from './constants';
import { advanceEnemies } from './conveyor';
import { FIXTURE_LOADOUT, FIXTURE_MISSION, FIXTURE_SHIP, makeFixtureEnemy } from './fixtures';
import { computeEffectiveStats } from './stats';
import { createCoreState } from './state';
import type { CoreState, LoadoutSnapshot } from './types';

function freshState(): CoreState {
  return createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1);
}

function statsOf(state: CoreState) {
  return computeEffectiveStats(state.loadout, state.modifiers);
}

describe('advanceEnemies', () => {
  it('moves enemies toward the ship by their speed', () => {
    const state = freshState();
    state.enemies = [makeFixtureEnemy({ distance: 50, speed: 2 })];
    advanceEnemies(state, statsOf(state));
    expect(state.enemies[0]?.distance).toBe(48);
  });

  it('collides at distance 0: enemy dies, ship takes 3× shot damage through the shield', () => {
    const state = freshState();
    state.ship.shield = 0;
    state.enemies = [makeFixtureEnemy({ distance: 1, speed: 2, shotDamage: 4 })];
    advanceEnemies(state, statsOf(state));
    expect(state.enemies).toHaveLength(0);
    expect(state.stats.collisions).toBe(1);
    expect(state.ship.hull).toBe(state.ship.maxHull - 4 * COLLISION_DAMAGE_MULTIPLIER);
  });

  it('a collision is not a kill and pays no coins', () => {
    const state = freshState();
    state.enemies = [makeFixtureEnemy({ distance: 1, speed: 2, coinReward: 50 })];
    advanceEnemies(state, statsOf(state));
    expect(state.stats.kills).toBe(0);
    expect(state.stats.coinsEarned).toBe(0);
  });

  it('shield absorbs collision damage first', () => {
    const state = freshState();
    state.ship.shield = 30;
    state.enemies = [makeFixtureEnemy({ distance: 1, speed: 2, shotDamage: 4 })];
    advanceEnemies(state, statsOf(state));
    expect(state.ship.shield).toBe(30 - 4 * COLLISION_DAMAGE_MULTIPLIER);
    expect(state.ship.hull).toBe(state.ship.maxHull);
  });

  it('handles an empty conveyor', () => {
    const state = freshState();
    advanceEnemies(state, statsOf(state));
    expect(state.enemies).toHaveLength(0);
  });

  it('Tanker: collision damage is halved by shipCollisionDamageMult = 0.5', () => {
    const loadout: LoadoutSnapshot = {
      ...FIXTURE_LOADOUT,
      ship: { ...FIXTURE_SHIP, passiveKind: 'collision-reduction', passiveValue: 0.5 },
    };
    const state = createCoreState(FIXTURE_MISSION, loadout, 1);
    state.ship.shield = 0;
    const shotDamage = 4;
    state.enemies = [makeFixtureEnemy({ distance: 1, speed: 2, shotDamage })];
    advanceEnemies(state, computeEffectiveStats(loadout, state.modifiers));
    expect(state.ship.hull).toBe(state.ship.maxHull - shotDamage * COLLISION_DAMAGE_MULTIPLIER * 0.5);
  });
});
