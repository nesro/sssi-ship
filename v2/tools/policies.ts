// Shared simulation policies — side-weapon-fire and supply-usage rules reused across
// tools/simulate.ts, tools/campaign-simulate.ts, and tools/tune-loadouts.ts. Extracted
// here instead of duplicated (docs/plans/expert-average-campaign-tuning.md) since two+
// real call sites now need identical logic.

import { toggleAutoFire, toggleRearWeapon } from '../src/core/combat';
import type { BoostPolicy, PickPolicy, SideWeaponPolicy, TargetPolicy, TogglePolicy } from '../src/core/replay';
import { computeEffectiveStats } from '../src/core/stats';
import { abilityById } from '../src/data/cards';

// ── Card-pick policy ───────────────────────────────────────────────────────────

/** Casual-player card-pick heuristic: prefer weapon cards, then generator, never
 * reroll. Shared across every simulation tool that needs a "realistic player" pick
 * policy (tools/simulate.ts, tools/campaign-simulate.ts, tools/tune-loadouts.ts). */
export const greedyPick: PickPolicy = (_state, offer) => {
  const priorities: Record<string, number> = { nexus: 0, quantum: 1, aegis: 2, comet: 3 };
  let best = 0;
  let bestRank = Number.POSITIVE_INFINITY;
  offer.abilityIds.forEach((cardId, index) => {
    const rank = priorities[abilityById(cardId).company] ?? 9;
    if (rank < bestRank) { bestRank = rank; best = index; }
  });
  return best;
};

// ── Supply (reserve boost) usage ──────────────────────────────────────────────

/** Taps the first supply slot with charges left, one per tick — models a player who
 * actually uses gifted/purchased supplies instead of ignoring them. */
export const tapFirstChargedSupply: BoostPolicy = (state) => {
  const slot = state.supplies.findIndex((supply) => supply.chargesLeft > 0);
  return slot === -1 ? null : slot;
};

const REACTIVE_SHIELD_RESTORE_THRESHOLD = 0.6; // use shield-restore below 60% shield capacity
const REACTIVE_DAMAGE_BOOST_MIN_ENEMIES = 2; // use damage-boost only when a wave is actually on screen

/** Uses each supply kind with basic judgment instead of the instant the charge appears:
 * shield-restore only when shield is actually low (using it at full shield wastes the
 * restore), damage-boost only when several enemies are on screen (its short duration is
 * wasted on a lull between waves). */
export const tapSuppliesReactively: BoostPolicy = (state) => {
  const stats = computeEffectiveStats(state.loadout, state.modifiers);
  const shieldSlot = state.supplies.findIndex(
    (supply) => supply.spec.kind === 'shield-restore' && supply.chargesLeft > 0,
  );
  if (shieldSlot !== -1 && state.ship.shield / stats.shieldCapacity < REACTIVE_SHIELD_RESTORE_THRESHOLD) {
    return shieldSlot;
  }
  const damageSlot = state.supplies.findIndex(
    (supply) => supply.spec.kind === 'damage-boost' && supply.chargesLeft > 0,
  );
  if (damageSlot !== -1 && state.enemies.length >= REACTIVE_DAMAGE_BOOST_MIN_ENEMIES) {
    return damageSlot;
  }
  return null;
};

// ── Side weapon usage ─────────────────────────────────────────────────────────
// `useSideWeapon` is checked every tick (src/core/replay.ts), so any trigger without a
// cooldown fires on every qualifying tick — draining every charge into the first
// lingering target/wave instead of saving them (found during the 2026-07-11
// expert/average design review, docs/plans/expert-average-campaign-tuning.md). Both
// policies below are cooldown-gated for exactly this reason.

const SIDE_WEAPON_COOLDOWN_TICKS = 30; // ~3s between taps — never drain all charges into one encounter
const HIGH_VALUE_ENEMY_KINDS = new Set(['blocker', 'tank', 'boss']);
const CROWD_MIN_ENEMIES = 3;

/** Saves charges for high-value targets only (blocker/tank/boss) — models a player who
 * reserves manual-fire ammo for the moments it matters, per each side weapon's own
 * "save it for a blocker or boss" design intent (GAME_DESIGN.md §5). */
export function highValueTargetSideWeaponPolicy(): SideWeaponPolicy {
  let cooldownUntilTick = 0;
  return (state) => {
    if (state.ship.sideWeaponCharges <= 0) return false;
    if (state.tick < cooldownUntilTick) return false;
    const hasHighValueTarget = state.enemies.some((enemy) => HIGH_VALUE_ENEMY_KINDS.has(enemy.kind));
    if (!hasHighValueTarget) return false;
    cooldownUntilTick = state.tick + SIDE_WEAPON_COOLDOWN_TICKS;
    return true;
  };
}

/** Fires whenever a real wave (3+ enemies) is on screen — a simpler, less selective
 * trigger than the high-value-target policy, but still cooldown-gated so it doesn't
 * dump every charge into the opening fodder wave. */
export function crowdSideWeaponPolicy(): SideWeaponPolicy {
  let cooldownUntilTick = 0;
  return (state) => {
    if (state.ship.sideWeaponCharges <= 0) return false;
    if (state.tick < cooldownUntilTick) return false;
    if (state.enemies.length < CROWD_MIN_ENEMIES) return false;
    cooldownUntilTick = state.tick + SIDE_WEAPON_COOLDOWN_TICKS;
    return true;
  };
}

// ── Energy management (weapon/shield toggles) ─────────────────────────────────
// Every prior simulation policy left autoFireEnabled/rearWeaponEnabled/autoShieldEnabled
// permanently on — the sim never modeled the "read the situation, deprioritize the
// right thing" skill loop GAME_DESIGN.md §6 names as core, even though the brownout
// mechanic (energy.ts's BROWNOUT_THRESHOLD) exists specifically to reward it.

// Cut the rear weapon (the lower-priority DPS source, per §6) once energy drops
// meaningfully below brownout threshold (0.3); restore it only once energy has
// recovered well past that mark. The gap between the two thresholds is deliberate
// hysteresis — without it a policy sitting right at one threshold would flip the
// toggle every tick instead of committing to a recovery window.
const BROWNOUT_TOGGLE_OFF_FRACTION = 0.2;
const BROWNOUT_TOGGLE_ON_FRACTION = 0.45;

/** Models a player with no energy-management skill: never touches any toggle. This is
 * the baseline every simulation used implicitly before `manageToggles` existed — named
 * here so it can be selected and compared explicitly instead of just being "no policy
 * passed." */
export const alwaysOnToggles: TogglePolicy = () => {};

/** Models a player who reads the energy bar and cuts the rear weapon to recover from
 * brownout, then turns it back on — the simplest real instance of §6's skill loop.
 * Front weapon and shield recharge are left untouched (out of scope for this policy;
 * see docs/plans's simulator-improvement plan for why rear weapon is the one lever
 * modeled first). */
export const brownoutAwareToggles: TogglePolicy = (state) => {
  const stats = computeEffectiveStats(state.loadout, state.modifiers);
  if (stats.generatorCapacity <= 0) return;
  const energyFraction = state.ship.energy / stats.generatorCapacity;
  if (state.rearWeaponEnabled && energyFraction < BROWNOUT_TOGGLE_OFF_FRACTION) {
    toggleRearWeapon(state);
  } else if (!state.rearWeaponEnabled && energyFraction > BROWNOUT_TOGGLE_ON_FRACTION) {
    toggleRearWeapon(state);
  }
};

// ── Front-weapon priority targeting (fable-fun-review-followup.md Item 4) ────────
// No prior sim policy ever touched targeting at all — the front weapon always just
// hit whatever was front-most. Two policies here, deliberately opposite in judgment,
// to actually measure whether the mechanic is a real decision (see the two-sided
// verification note on each).

const TARGET_PRIORITY_KINDS = new Set(['turret', 'booster', 'boss']);

/** Marks a deep-queue high-value target (turret/booster/boss) when one is present,
 * keeping the existing mark if it's still valid rather than re-marking every tick.
 * This is the "can targeting help" half of the verification pair — pnpm sim/balance
 * with this policy on vs. off should show a measurable improvement on missions
 * containing these kinds, since none of them are ever the front-most enemy by design
 * (turret has speed 0, boss/booster sit behind everything else in normal play). */
export const prioritizeHighValueTargets: TargetPolicy = (state) => {
  const current = state.priorityTargetId;
  if (current !== null && state.enemies.some((e) => e.id === current && TARGET_PRIORITY_KINDS.has(e.kind))) {
    return undefined; // still valid — no change needed this tick
  }
  const target = state.enemies.find((e) => TARGET_PRIORITY_KINDS.has(e.kind));
  return target !== undefined ? target.id : null;
};

/** Always marks whichever enemy is currently farthest from the ship — no judgment
 * about whether now is a good time, just "the scariest-looking thing is deepest in
 * the queue, snipe it." This is the "can targeting hurt" half of the verification
 * pair: on swarm-heavy waves, ignoring the front-most enemies to chase something deep
 * should sometimes cost more (front-most enemies reaching collision range) than it
 * gains — if it never does, "free and instant" targeting is a reflex tax with no real
 * decision in it, and that's a real finding worth re-checking before Phase B ships. */
export const alwaysMarkFarthestEnemy: TargetPolicy = (state) => {
  if (state.enemies.length === 0) return null;
  const farthest = state.enemies.reduce((a, b) => (b.distance > a.distance ? b : a));
  return farthest.id !== state.priorityTargetId ? farthest.id : undefined;
};

// ── Blocker hold-charge (fable-fun-review-followup.md Item 6) ────────────────────
// "Holding" reuses the existing front-weapon toggle (no new input): cutting the front
// weapon while a blocker and at least one other enemy coexist lets holdChargeTicks
// keep accruing (tick.ts's accrueHoldCharge) instead of the front weapon just killing
// the blocker on its next volley. Three policies, deliberately spanning the two ends
// plus a judgment call, so pnpm sim/balance can show whether holding is a real,
// worthwhile trade-off and not just a strictly-dominant or strictly-losing move.

/** Never holds — kills whatever's front-most the instant the weapon can, blocker
 * included. This is `alwaysOnToggles` under a name that documents its role in the
 * three-way comparison: the "always burn immediately" baseline this item's plan asks
 * for, not a new behavior. */
export const alwaysBurnBlockers: TogglePolicy = alwaysOnToggles;

/** Cuts the front weapon the moment a blocker shares the lane with at least one other
 * enemy (charge is accruing — holding is "buying" something) and restores it the
 * moment that stops being true (either the blocker is now alone, so holding buys
 * nothing further, or there's no blocker at all). Models a player who holds for the
 * entire window the mechanic rewards, taking on every tick of extra incoming fire
 * that a burned-early player would have avoided — the genuine risk side of the
 * trade-off (decision #12: hold-charge accrues only under real pressure, not a
 * risk-free wait). */
export const alwaysHoldBlockersUnderPressure: TogglePolicy = (state) => {
  const blockerUnderPressure = state.enemies.some((e) => e.kind === 'blocker')
    && state.enemies.length > 1;
  if (blockerUnderPressure && state.autoFireEnabled) toggleAutoFire(state);
  else if (!blockerUnderPressure && !state.autoFireEnabled) toggleAutoFire(state);
};

/** Holds like `alwaysHoldBlockersUnderPressure`, but bails early — burns immediately
 * instead — once hull drops below the safety margin, so accumulating a bigger bonus
 * never outweighs survival. Models "holds with judgment," not perfect optimal play,
 * matching this project's existing reactive-supply-usage convention. */
const HOLD_CHARGE_HULL_SAFETY_FRACTION = 0.35;
export const holdBlockersWithJudgment: TogglePolicy = (state) => {
  const hullFraction = state.ship.hull / state.ship.maxHull;
  const blockerUnderPressure = state.enemies.some((e) => e.kind === 'blocker')
    && state.enemies.length > 1
    && hullFraction >= HOLD_CHARGE_HULL_SAFETY_FRACTION;
  if (blockerUnderPressure && state.autoFireEnabled) toggleAutoFire(state);
  else if (!blockerUnderPressure && !state.autoFireEnabled) toggleAutoFire(state);
};
