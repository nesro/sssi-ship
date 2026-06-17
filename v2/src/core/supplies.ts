import { computeEffectiveStats } from './stats';
import type { CoreState } from './types';

/**
 * Fires a reserve supply by slot index (a boost tap, §3.7). Consumes one charge and
 * records the tap for the replay. Throws on an invalid slot or an empty supply —
 * the view disables buttons, so a bad call is a programming error.
 */
export function applyBoost(state: CoreState, slot: number): void {
  const supply = state.supplies[slot];
  if (supply === undefined) {
    throw new Error(`No supply in slot ${String(slot)}`);
  }
  if (supply.chargesLeft <= 0) {
    throw new Error(`Supply "${supply.spec.id}" has no charges left`);
  }
  if (state.status !== 'running') {
    throw new Error(`Cannot use supplies while mission status is "${state.status}"`);
  }
  supply.chargesLeft -= 1;
  state.boostTaps.push({ tick: state.tick, slot });

  const stats = computeEffectiveStats(state.loadout, state.modifiers);
  const { spec } = supply;
  switch (spec.kind) {
    case 'shield-restore':
      state.ship.shield = Math.min(stats.shieldCapacity, state.ship.shield + spec.magnitude);
      break;
    case 'energy-refill':
      state.ship.energy = stats.generatorCapacity;
      break;
    case 'damage-boost':
      state.activeEffects.push({
        kind: 'damage-mult',
        multiplier: spec.magnitude,
        expiresAtTick: state.tick + spec.durationTicks,
      });
      break;
  }
}

/** Drops expired timed effects so the active list stays tiny. */
export function pruneExpiredEffects(state: CoreState): void {
  state.activeEffects = state.activeEffects.filter(
    (effect) => effect.expiresAtTick > state.tick,
  );
}
