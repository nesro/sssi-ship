import { createCardOffer } from './cards';
import { fireEnemyWeapons, fireShipWeapon, regenerateEnemies } from './combat';
import { advanceEnemies } from './conveyor';
import { pulseShield, regenerateEnergy } from './energy';
import { activeDamageMult, computeEffectiveStats } from './stats';
import { pruneExpiredEffects } from './supplies';
import { advanceTimeline } from './timeline';
import type { CoreState } from './types';

/**
 * Advances the simulation by exactly one fixed tick (100 ms). The phase order below is
 * part of the determinism contract — replays break if it changes. It must match the call
 * order in the body exactly:
 * energy → timeline/spawns → enemy regen → ship fire → enemy fire → movement →
 * shield pulse → prune effects → bonus calls → outcome.
 *
 * While a card offer is pending the sim is paused: this function returns without
 * advancing. Resolve the offer (resolveCardAction) to resume.
 */
export function advanceTick(state: CoreState): void {
  if (state.status !== 'running' || state.pendingOffer !== null) return;
  state.tick += 1;

  // Effective stats fold loadout + cards + timed boosts once per tick — phases share it.
  const stats = computeEffectiveStats(state.loadout, state.modifiers, activeDamageMult(state));

  regenerateEnergy(state, stats);
  advanceTimeline(state, stats);
  regenerateEnemies(state);
  fireShipWeapon(state, stats);
  fireEnemyWeapons(state);
  advanceEnemies(state);
  pulseShield(state, stats);
  pruneExpiredEffects(state);
  maybeTriggerBonusCall(state);

  resolveOutcome(state);
}

/** Blocker deaths queue bonus support calls; fire one as soon as no offer is pending. */
function maybeTriggerBonusCall(state: CoreState): void {
  if (state.bonusCallsPending <= 0 || state.pendingOffer !== null) return;
  if (state.cardPool.length === 0) {
    state.bonusCallsPending = 0;
    return;
  }
  state.bonusCallsPending -= 1;
  state.pendingOffer = createCardOffer(state);
}

function resolveOutcome(state: CoreState): void {
  if (state.ship.hull <= 0) {
    state.ship.hull = 0;
    state.status = 'defeat';
    return;
  }
  const timelineDone = state.nextEventIndex >= state.mission.events.length;
  if (timelineDone && state.enemies.length === 0) {
    state.status = 'victory';
  }
}
