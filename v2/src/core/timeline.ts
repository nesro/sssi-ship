import { LANE_LENGTH, SPAWN_JITTER } from './constants';
import { createAbilityOffer } from './cards';
import type { EffectiveStats } from './stats';
import type { CoreState, EnemySpec, SpawnEvent } from './types';

/**
 * Advances the motor-scaled wave timeline, spawns due events, and triggers scheduled
 * support calls. A living blocker stalls the timeline (not enemy movement) — the DPS
 * check that stops pure-speed builds from skipping content (V2_HANDOFF.md §3.1).
 */
export function advanceTimeline(state: CoreState, stats: EffectiveStats): void {
  const blocked = state.enemies.some((enemy) => enemy.blocksConveyor);
  if (!blocked) {
    state.timelineTick += stats.motorTimelineMultiplier;
  }
  const events = state.mission.events;
  while (state.nextEventIndex < events.length) {
    const event = events[state.nextEventIndex];
    if (event === undefined || event.atTimelineTick > state.timelineTick) break;
    spawnEvent(state, event);
    state.nextEventIndex += 1;
  }
  maybeTriggerSupportCall(state);
}

/** The helper ship flies by at designed timeline points and offers cards (§3.6). */
function maybeTriggerSupportCall(state: CoreState): void {
  if (state.pendingOffer !== null || state.abilityPool.length === 0) return;
  const calls = state.mission.supportCallTicks;
  const next = calls[state.supportCallsDone];
  if (next !== undefined && state.timelineTick >= next) {
    state.supportCallsDone += 1;
    state.pendingOffer = createAbilityOffer(state);
    // Tactical motor: each scheduled call queues N extra bonus offers
    const bonus = state.loadout.motor.bonusCardsPerSupportCall ?? 0;
    if (bonus > 0) state.bonusCallsPending += bonus;
  }
}

function spawnEvent(state: CoreState, event: SpawnEvent): void {
  const spec = state.mission.enemyKinds[event.kind];
  if (spec === undefined) {
    throw new Error(`Mission ${state.mission.id}: unknown enemy kind "${event.kind}"`);
  }
  // Jitter is drawn ONCE per event and applied only to the shared LANE_LENGTH spawn
  // point — nudges the whole wave's entry point (so repeated events/seeds don't
  // render pixel-identical) without touching the exact `spacing` between enemies
  // within this event. It used to multiply each enemy's own full cumulative
  // distance (LANE_LENGTH + i*spacing) individually, so its absolute size grew with
  // index i — for a count-8+ wave that easily swamped a small `spacing`, letting
  // enemies spawn overlapping or even out of order (docs/known-issues.md).
  const jitter = 1 + (state.rng() * 2 - 1) * SPAWN_JITTER;
  for (let i = 0; i < event.count; i++) {
    spawnEnemy(state, spec, LANE_LENGTH * jitter + i * event.spacing);
  }
}

function spawnEnemy(state: CoreState, spec: EnemySpec, distance: number): void {
  state.spawnedCount += 1;
  state.enemies.push({
    id: state.nextEnemyId++,
    kind: spec.kind,
    distance,
    hp: spec.hp,
    maxHp: spec.hp,
    shootTimer: spec.ticksBetweenShots,
    speed: spec.speed,
    shotDamage: spec.shotDamage,
    ticksBetweenShots: spec.ticksBetweenShots,
    blocksConveyor: spec.blocksConveyor,
    coinReward: spec.coinReward,
    isBoss: spec.isBoss ?? false,
    regenPerTick: spec.regenPerTick ?? 0,
    critChance: spec.critChance,
    missChance: spec.missChance,
    critMult: spec.critMult,
    holdChargeTicks: 0,
    aliveTicks: 0,
  });
}
