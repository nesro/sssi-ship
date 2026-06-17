import { COLLISION_DAMAGE_MULTIPLIER, SHIELD_BURST_RETURN } from './constants';
import { damageShip } from './combat';
import type { CoreState } from './types';

/**
 * Moves every enemy down the lane. An enemy reaching distance 0 collides: it dies and
 * deals chunky damage (~3× its shot) — shield first, remainder to hull (V2_HANDOFF.md §3.1).
 * If the shield absorbs any of the collision damage it bursts back, dealing a fraction of
 * the absorbed amount to all remaining live enemies.
 */
export function advanceEnemies(state: CoreState): void {
  const survivors = [];
  let totalBurst = 0;
  for (const enemy of state.enemies) {
    enemy.distance -= enemy.speed;
    if (enemy.distance > 0) {
      survivors.push(enemy);
      continue;
    }
    const shieldBefore = state.ship.shield;
    damageShip(state, enemy.shotDamage * COLLISION_DAMAGE_MULTIPLIER);
    totalBurst += (shieldBefore - state.ship.shield) * SHIELD_BURST_RETURN;
    state.stats.collisions += 1;
  }
  if (totalBurst > 0) {
    for (const s of survivors) s.hp -= totalBurst;
  }
  state.enemies = survivors;
}
