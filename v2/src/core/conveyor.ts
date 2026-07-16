import { BOSS_APPROACH_TICKS, BOSS_STALL_TICKS, COLLISION_DAMAGE_MULTIPLIER, SHIELD_BURST_RETURN } from './constants';
import { damageShip } from './combat';
import type { EffectiveStats } from './stats';
import type { CoreState, EnemyState } from './types';

/**
 * A boss alternates APPROACH (moves at its normal `speed`) and STALL (speed 0) in a
 * repeating cycle keyed off `aliveTicks` — see the BOSS_APPROACH_TICKS/BOSS_STALL_TICKS
 * comment in constants.ts for why (F3: stops the boss from just walking into the player
 * and winning via collision before weapon DPS gets a real shot at it). Every other
 * enemy kind moves at its own `speed`, unchanged.
 */
function effectiveSpeed(enemy: EnemyState): number {
  if (enemy.kind !== 'boss') return enemy.speed;
  const cycleLength = BOSS_APPROACH_TICKS + BOSS_STALL_TICKS;
  const cyclePosition = enemy.aliveTicks % cycleLength;
  return cyclePosition < BOSS_APPROACH_TICKS ? enemy.speed : 0;
}

/**
 * Moves every enemy down the lane. An enemy reaching distance 0 collides: it dies and
 * deals chunky damage (~3× its shot) — shield first, remainder to hull (V2_HANDOFF.md §3.1).
 * If the shield absorbs any of the collision damage it bursts back, dealing a fraction of
 * the absorbed amount to all remaining live enemies.
 */
export function advanceEnemies(state: CoreState, stats: EffectiveStats): void {
  const survivors = [];
  let totalBurst = 0;
  for (const enemy of state.enemies) {
    enemy.aliveTicks += 1;
    enemy.distance -= effectiveSpeed(enemy);
    if (enemy.distance > 0) {
      survivors.push(enemy);
      continue;
    }
    const collisionDamage = enemy.shotDamage * COLLISION_DAMAGE_MULTIPLIER * stats.shipCollisionDamageMult;
    const shieldBefore = state.ship.shield;
    damageShip(state, collisionDamage);
    totalBurst += (shieldBefore - state.ship.shield) * SHIELD_BURST_RETURN;
    state.stats.collisions += 1;
  }
  if (totalBurst > 0) {
    for (const s of survivors) s.hp -= totalBurst;
  }
  state.enemies = survivors;
}
