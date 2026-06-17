import { BROWNOUT_MAX_STRETCH, BROWNOUT_THRESHOLD } from './constants';
import type { EffectiveStats } from './stats';
import type { CoreState } from './types';

/** Generator produces, motor draws its constant cost. Energy never goes negative. */
export function regenerateEnergy(state: CoreState, stats: EffectiveStats): void {
  const mods = state.modifiers;
  let output = stats.generatorOutput;
  const hullFrac = state.ship.hull / state.ship.maxHull;
  if (mods.highHullGenBonus > 0 && hullFrac > 0.8) output *= 1 + mods.highHullGenBonus;
  if (mods.bossAliveGenBonus > 0 && state.enemies.some((e) => e.isBoss)) {
    output *= 1 + mods.bossAliveGenBonus;
  }
  const next = state.ship.energy + output - stats.motorDraw;
  state.ship.energy = clamp(next, 0, stats.generatorCapacity);
}

/**
 * Brownout rule (V2_HANDOFF.md §3.2): below the threshold fraction the fire interval
 * stretches smoothly toward BROWNOUT_MAX_STRETCH as energy approaches zero. A slope,
 * never a cliff — the weapon never fully stops (v1's death-spiral lesson, §8.1).
 */
export function brownoutFactor(energy: number, capacity: number): number {
  const fraction = capacity > 0 ? energy / capacity : 0;
  if (fraction >= BROWNOUT_THRESHOLD) return 1;
  const depth = 1 - fraction / BROWNOUT_THRESHOLD;
  return 1 + depth * (BROWNOUT_MAX_STRETCH - 1);
}

/**
 * Discrete shield pulse (runs last in the tick order, after all energy drains).
 * When the generator is at full capacity it fires once: the shield gains
 * shieldPulseFraction × shieldCapacity HP, and the generator drops by generatorPulseDrain.
 * This runs last so the player can observe the generator fill, then the shield step up.
 */
export function pulseShield(state: CoreState, stats: EffectiveStats): void {
  if (stats.shieldCapacity <= 0) return;
  if (state.ship.shield >= stats.shieldCapacity) return;
  if (state.ship.energy < stats.generatorCapacity) return;
  const gain = Math.min(
    stats.shieldPulseFraction * stats.shieldCapacity,
    stats.shieldCapacity - state.ship.shield,
  );
  state.ship.shield += gain;
  state.ship.energy = Math.max(0, state.ship.energy - stats.generatorPulseDrain);

  // PULSE NOVA: each pulse restores a flat amount of energy
  const mods = state.modifiers;
  if (mods.energyPerPulse > 0) {
    state.ship.energy = Math.min(stats.generatorCapacity, state.ship.energy + mods.energyPerPulse);
  }
  // VOLATILE CORE: small chance the generator vents all stored energy
  if (mods.volatileCoreLosePct > 0 && state.rng() < mods.volatileCoreLosePct) {
    state.ship.energy = 0;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
