import { describe, expect, it } from 'vitest';
import { COLLISION_DAMAGE_MULTIPLIER } from './constants';
import { advanceEnemies } from './conveyor';
import { FIXTURE_LOADOUT, FIXTURE_MISSION, makeFixtureEnemy } from './fixtures';
import { createCoreState } from './state';
import type { CoreState } from './types';

function freshState(): CoreState {
  return createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1);
}

describe('advanceEnemies', () => {
  it('moves enemies toward the ship by their speed', () => {
    const state = freshState();
    state.enemies = [makeFixtureEnemy({ distance: 50, speed: 2 })];
    advanceEnemies(state);
    expect(state.enemies[0]?.distance).toBe(48);
  });

  it('collides at distance 0: enemy dies, ship takes 3× shot damage through the shield', () => {
    const state = freshState();
    state.ship.shield = 0;
    state.enemies = [makeFixtureEnemy({ distance: 1, speed: 2, shotDamage: 4 })];
    advanceEnemies(state);
    expect(state.enemies).toHaveLength(0);
    expect(state.stats.collisions).toBe(1);
    expect(state.ship.hull).toBe(state.ship.maxHull - 4 * COLLISION_DAMAGE_MULTIPLIER);
  });

  it('a collision is not a kill and pays no coins', () => {
    const state = freshState();
    state.enemies = [makeFixtureEnemy({ distance: 1, speed: 2, coinReward: 50 })];
    advanceEnemies(state);
    expect(state.stats.kills).toBe(0);
    expect(state.stats.coinsEarned).toBe(0);
  });

  it('shield absorbs collision damage first', () => {
    const state = freshState();
    state.ship.shield = 30;
    state.enemies = [makeFixtureEnemy({ distance: 1, speed: 2, shotDamage: 4 })];
    advanceEnemies(state);
    expect(state.ship.shield).toBe(30 - 4 * COLLISION_DAMAGE_MULTIPLIER);
    expect(state.ship.hull).toBe(state.ship.maxHull);
  });

  it('handles an empty conveyor', () => {
    const state = freshState();
    advanceEnemies(state);
    expect(state.enemies).toHaveLength(0);
  });
});
