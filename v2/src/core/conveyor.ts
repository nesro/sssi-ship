import { BOSS_APPROACH_TICKS, BOSS_STALL_TICKS, COLLISION_DAMAGE_MULTIPLIER, LANE_LENGTH, SHIELD_BURST_RETURN } from './constants';
import { damageEnemy, damageShip, removeDeadEnemies } from './combat';
import type { EffectiveStats } from './stats';
import type { CoreState, EnemyState } from './types';

/**
 * A `motorKind: 'stall-cycle'` enemy (the boss, and any future modular enemy that
 * opts into the same MOTOR kind) alternates APPROACH (moves at its normal `speed`)
 * and STALL (speed 0) in a repeating cycle keyed off `aliveTicks` — see the
 * BOSS_APPROACH_TICKS/BOSS_STALL_TICKS comment in constants.ts for why (F3: stops it
 * from just walking into the player and winning via collision before weapon DPS gets
 * a real shot at it). Every other motor kind moves at its own `speed`, unchanged.
 */
function effectiveSpeed(enemy: EnemyState): number {
  if (enemy.motorKind !== 'stall-cycle') return enemy.speed;
  const cycleLength = BOSS_APPROACH_TICKS + BOSS_STALL_TICKS;
  const cyclePosition = enemy.aliveTicks % cycleLength;
  return cyclePosition < BOSS_APPROACH_TICKS ? enemy.speed : 0;
}

/** The on-screen survivor (distance <= LANE_LENGTH) closest to the ship — burst mode
 * 'single''s target. A plain min-distance scan, distinct from combat.ts's
 * nearestEnemyAhead (a max *below a ceiling*, built for the booster-buff mechanic's
 * different relationship): the enemy that just collided is already at distance <= 0,
 * the lane's minimum, so nothing is ever "ahead of" it under that rule — it would
 * always return null here. */
function nearestOnScreenSurvivor(survivors: EnemyState[]): EnemyState | null {
  let nearest: EnemyState | null = null;
  for (const e of survivors) {
    if (e.distance > LANE_LENGTH) continue;
    if (nearest === null || e.distance < nearest.distance) nearest = e;
  }
  return nearest;
}

/**
 * Moves every enemy down the lane. An enemy reaching distance 0 collides: it dies and
 * deals chunky damage (~3× its shot) — shield first, remainder to hull (V2_HANDOFF.md §3.1).
 * If the shield absorbs any of the collision damage it bursts back, dealing a fraction of
 * the absorbed amount onward — how far depends on the equipped shield's own `burstMode`
 * (data/items.ts's SHIELD_BASE): 'single' hits only the nearest on-screen survivor, 'all'
 * hits every one of them, 'none' skips the splash entirely. Always restricted to enemies
 * already on screen (distance <= LANE_LENGTH) regardless of mode — a straggler still
 * queued up off-screen hasn't "arrived" yet from the player's perspective, so it
 * shouldn't take a hit for a collision it wasn't there to see.
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
  if (totalBurst > 0 && stats.shieldBurstMode !== 'none') {
    const targets = stats.shieldBurstMode === 'single'
      ? [nearestOnScreenSurvivor(survivors)].filter((e): e is EnemyState => e !== null)
      : survivors.filter((s) => s.distance <= LANE_LENGTH);
    for (const s of targets) {
      // Routed through damageEnemy like every other damage source — an enemy's own
      // SHIELD module (if any) absorbs burst splash the same as weapon fire, no
      // special-cased exception for this source specifically.
      damageEnemy(s, totalBurst);
      // Lets the view tell this apart from weapon damage (CombatScene.ts's detectHits) —
      // a plain hp-before/after comparison can't distinguish the two on its own.
      state.pendingVisualEvents.push({ kind: 'shield-burst', enemyId: s.id });
    }
  }
  state.enemies = survivors;
  // A burst-killed enemy (hp driven <= 0 above) must go through the same death
  // pipeline as a weapon kill — kill credit, coins, blocker bonus calls, on-kill
  // chains — not just vanish. Without this call, a burst-killed enemy would stay in
  // state.enemies until some later weapon shot happened to prune it, meanwhile still
  // shooting the player, regenerating, and blocking victory.
  if (totalBurst > 0) removeDeadEnemies(state, stats);
}
