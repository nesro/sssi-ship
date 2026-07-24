import { createAbilityOffer } from './cards';
import { fireEnemyRearWeapons, fireEnemyWeapons, fireRearWeapon, fireShipWeapon, regenerateEnemies } from './combat';
import { advanceEnemies } from './conveyor';
import { pulseShield, regenerateEnergy } from './energy';
import { activeDamageMult, activeFireRateMult, activeGeneratorMult, computeEffectiveStats } from './stats';
import { pruneExpiredEffects } from './supplies';
import { advanceTimeline } from './timeline';
import type { CoreState } from './types';

/**
 * Advances the simulation by exactly one fixed tick (100 ms). The phase order below is
 * part of the determinism contract — replays break if it changes. It must match the call
 * order in the body exactly:
 * energy → timeline/spawns → enemy regen → ship fire → enemy fire (front, then rear)
 * → movement → shield pulse → prune effects → hold-charge accrual → bonus calls →
 * outcome.
 *
 * While an ability offer is pending the sim is paused: this function returns without
 * advancing. Resolve the offer (resolveAbilityAction) to resume.
 */
export function advanceTick(state: CoreState): void {
  if (state.status !== 'running' || state.pendingOffer !== null || state.pendingNarrator !== null) return;
  state.pendingVisualEvents = [];
  state.tick += 1;

  // Effective stats fold loadout + cards + timed boosts once per tick — phases share it.
  const stats = computeEffectiveStats(state.loadout, state.modifiers, activeDamageMult(state), activeFireRateMult(state), activeGeneratorMult(state));

  regenerateEnergy(state, stats);
  for (const slot of state.equippedAbilities) {
    if (slot.cooldownLeft > 0) slot.cooldownLeft -= 1;
  }
  advanceTimeline(state, stats);
  regenerateEnemies(state);
  fireShipWeapon(state, stats);
  fireRearWeapon(state, stats);
  fireEnemyWeapons(state, stats);
  fireEnemyRearWeapons(state, stats);
  advanceEnemies(state, stats);
  pulseShield(state, stats);
  pruneExpiredEffects(state);
  accrueHoldCharge(state);
  maybeTriggerBonusCall(state);

  resolveOutcome(state);
  checkNarratorEvents(state);
}

/**
 * A blocking enemy's hold-charge accrues only while at least one other enemy is also
 * alive on the conveyor — the instant the lane clears to just the blocker, charge
 * freezes and can't resume on its own, since the blocker itself keeps blocking new
 * spawns (Item 6: "charge accrues only under pressure", not a risk-free wait).
 */
function accrueHoldCharge(state: CoreState): void {
  if (state.enemies.length <= 1) return;
  for (const enemy of state.enemies) {
    if (enemy.blocksConveyor) enemy.holdChargeTicks += 1;
  }
}

function checkNarratorEvents(state: CoreState): void {
  const events = state.mission.narratorEvents;
  if (events === undefined || state.status !== 'running') return;
  for (const event of events) {
    if (state.timelineTick >= event.atTimelineTick && !state.firedNarratorTicks.includes(event.atTimelineTick)) {
      state.pendingNarrator = [...event.lines];
      state.firedNarratorTicks.push(event.atTimelineTick);
      return;
    }
  }
}

/** Blocker deaths queue bonus support calls; fire one as soon as no offer is pending. */
function maybeTriggerBonusCall(state: CoreState): void {
  if (state.bonusCallsPending <= 0 || state.pendingOffer !== null) return;
  if (state.abilityPool.length === 0) {
    state.bonusCallsPending = 0;
    return;
  }
  state.bonusCallsPending -= 1;
  state.pendingOffer = createAbilityOffer(state);
}

/**
 * Force-ends a still-running mission as a defeat — the player quit mid-run, not a real
 * hull-zero/timeline-exhausted outcome. Used by the daily mission's "abandon consumes
 * the attempt" design (CombatScene.ts): buildMissionResult (result.ts) throws on a
 * 'running' status, so a partial daily run needs its status settled before it can be
 * scored and its earned-so-far coins banked. Campaign missions never call this —
 * abandoning them intentionally forfeits all progress (CombatScene never builds a
 * result for them at all), unchanged by this addition. A no-op if the mission has
 * already ended on its own.
 */
export function abandonRun(state: CoreState): void {
  if (state.status !== 'running') return;
  state.status = 'defeat';
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
