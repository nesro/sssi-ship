// Shared simulation policies — side-weapon-fire and supply-usage rules reused across
// tools/simulate.ts, tools/campaign-simulate.ts, and tools/tune-loadouts.ts. Extracted
// here instead of duplicated (docs/plans/expert-average-campaign-tuning.md) since two+
// real call sites now need identical logic.

import type { BoostPolicy, PickPolicy, SideWeaponPolicy } from '../src/core/replay';
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
