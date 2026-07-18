import { describe, expect, it } from 'vitest';
import { BOSS_APPROACH_TICKS, BOSS_STALL_TICKS, COLLISION_DAMAGE_MULTIPLIER } from './constants';
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

  // Regression for the 2026-07-18 A4 fix: the view's coin popup must never show for a
  // collision self-death, since no coins are actually credited for it.
  it('a collision self-death never emits an enemy-killed visual event', () => {
    const state = freshState();
    state.enemies = [makeFixtureEnemy({ id: 3, distance: 1, speed: 2, coinReward: 50 })];
    advanceEnemies(state, statsOf(state));
    expect(state.pendingVisualEvents.some((e) => e.kind === 'enemy-killed')).toBe(false);
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

describe('advanceEnemies: shield-burst kills a survivor (2026-07-18 fix)', () => {
  // Shield 20, collision damage 4*3=12 (fully absorbed) -> shield 8, burst = (20-8)*0.6 = 7.2.
  it('a burst-killed survivor is removed the same tick and counted as a real kill (coins paid, collision itself still not a kill)', () => {
    const state = freshState();
    state.ship.shield = 20;
    state.enemies = [
      makeFixtureEnemy({ id: 1, distance: 1, speed: 2, shotDamage: 4, coinReward: 999 }),
      makeFixtureEnemy({ id: 2, distance: 50, hp: 5, maxHp: 100, coinReward: 50 }),
    ];
    advanceEnemies(state, statsOf(state));
    expect(state.enemies).toHaveLength(0);
    expect(state.stats.kills).toBe(1); // only enemy 2 (burst-killed), not the collision itself
    expect(state.stats.coinsEarned).toBe(50); // enemy 2's reward only, not enemy 1's
    // A4: the burst-killed enemy (routed through removeDeadEnemies) must show a real
    // coin popup; the collision itself (enemy 1) must not.
    expect(state.pendingVisualEvents).toContainEqual({ kind: 'enemy-killed', enemyId: 2, coins: 50 });
    expect(state.pendingVisualEvents.some((e) => e.kind === 'enemy-killed' && e.enemyId === 1)).toBe(false);
  });

  it('a burst-killed blocker still grants its bonus support call', () => {
    const state = freshState();
    state.ship.shield = 20;
    state.enemies = [
      makeFixtureEnemy({ id: 1, distance: 1, speed: 2, shotDamage: 4 }),
      makeFixtureEnemy({
        id: 2, kind: 'blocker', distance: 50, hp: 5, maxHp: 100, blocksConveyor: true, holdChargeTicks: 0,
      }),
    ];
    advanceEnemies(state, statsOf(state));
    expect(state.enemies).toHaveLength(0);
    expect(state.bonusCallsPending).toBe(1);
  });

  it('a non-lethal burst damages a survivor but leaves it on the lane, uncredited', () => {
    const state = freshState();
    state.ship.shield = 20;
    state.enemies = [
      makeFixtureEnemy({ id: 1, distance: 1, speed: 2, shotDamage: 4 }),
      makeFixtureEnemy({ id: 2, distance: 50, hp: 100, maxHp: 100, coinReward: 50 }),
    ];
    advanceEnemies(state, statsOf(state));
    expect(state.enemies).toHaveLength(1);
    expect(state.enemies[0]?.id).toBe(2);
    expect(state.enemies[0]?.hp).toBeCloseTo(100 - 7.2);
    expect(state.stats.kills).toBe(0);
    expect(state.stats.coinsEarned).toBe(0);
  });
});

describe('advanceEnemies: boss stall-and-bombard cycle (F3)', () => {
  it('a boss moves normally during the approach phase', () => {
    const state = freshState();
    state.enemies = [makeFixtureEnemy({ kind: 'boss', distance: 50, speed: 2, aliveTicks: 0 })];
    advanceEnemies(state, statsOf(state));
    expect(state.enemies[0]?.distance).toBe(48); // full speed, same as any other enemy
  });

  it('a boss does not move at all during the stall phase', () => {
    const state = freshState();
    // aliveTicks lands inside the stall window (just past the approach ticks).
    state.enemies = [makeFixtureEnemy({
      kind: 'boss', distance: 50, speed: 2, aliveTicks: BOSS_APPROACH_TICKS,
    })];
    advanceEnemies(state, statsOf(state));
    expect(state.enemies[0]?.distance).toBe(50); // unchanged — stalled
  });

  it('a boss resumes moving once the stall phase ends and the cycle repeats', () => {
    const state = freshState();
    state.enemies = [makeFixtureEnemy({
      kind: 'boss', distance: 50, speed: 2, aliveTicks: BOSS_APPROACH_TICKS + BOSS_STALL_TICKS,
    })];
    advanceEnemies(state, statsOf(state));
    expect(state.enemies[0]?.distance).toBe(48); // back in the approach phase of cycle 2
  });

  it('a non-boss enemy with the same speed ignores the cycle entirely, even mid-stall-window', () => {
    const state = freshState();
    state.enemies = [makeFixtureEnemy({
      kind: 'tank', distance: 50, speed: 2, aliveTicks: BOSS_APPROACH_TICKS,
    })];
    advanceEnemies(state, statsOf(state));
    expect(state.enemies[0]?.distance).toBe(48); // moves normally — the cycle is boss-only
  });

  it('aliveTicks increments every tick for every enemy, unconditionally', () => {
    const state = freshState();
    state.enemies = [
      makeFixtureEnemy({ id: 1, kind: 'fodder', distance: 50, aliveTicks: 5 }),
      makeFixtureEnemy({ id: 2, kind: 'boss', distance: 50, aliveTicks: 5 }),
    ];
    advanceEnemies(state, statsOf(state));
    expect(state.enemies.find((e) => e.id === 1)?.aliveTicks).toBe(6);
    expect(state.enemies.find((e) => e.id === 2)?.aliveTicks).toBe(6);
  });
});
