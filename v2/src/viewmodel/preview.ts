// Pure viewmodel for ShopPreviewPanel. The panel has two genuinely different halves:
// a static half (ship texture, motor tier/color, DPS label, prospective-vs-current
// resolution) and a live per-frame simulation that mirrors the discrete energy-pulse
// mechanic from src/core/energy.ts. Both are computed here; only the bolt/flash/
// thruster-flicker animation stays imperative in ShopPreviewPanel itself.

import { computeLoadoutReport } from '../core/report';
import { computeEffectiveStats, defaultModifiers } from '../core/stats';
import type { EffectiveStats } from '../core/stats';
import type { LoadoutSnapshot, RearWeaponKind, SideWeaponKind, WeaponKind } from '../core/types';
import {
  generatorSpecAtLevel, motorSpecAtLevel, rearWeaponSpecAtLevel, shieldSpecAtLevel, shipById,
  sideWeaponSpecAtLevel, weaponSpecAtLevel,
} from '../data/items';
import type { GeneratorKind, MotorKind, ShieldKind } from '../data/items';
import type { SaveData } from '../save/SaveManager';
import { motorKindColorFromId, motorLevelFromId, textureForShipId } from '../view/textureKeys';
import type { ShopTab } from './shopSystems';

export interface PreviewStaticViewModel {
  shipTextureId: string;
  motorLevel: 1 | 2 | 3;
  motorKindColor: number;
  dpsLabel: string; // "DPS  12.3" or "NO WEAPON"
  weaponId: string | null;
  rearWeaponId: string | null;
  // Exposed so the caller can seed/step the live sim (initPreviewSim/stepPreviewSim)
  // without recomputing computeEffectiveStats a second time on the same loadout.
  stats: EffectiveStats;
}

/** activeLoadout = prospective ?? current — resolved once, here, not in the scene. */
export function computePreviewStatic(current: LoadoutSnapshot, prospective: LoadoutSnapshot | null): PreviewStaticViewModel {
  const activeLoadout = prospective ?? current;
  const stats = computeEffectiveStats(activeLoadout, defaultModifiers());
  const report = computeLoadoutReport(activeLoadout);
  return {
    shipTextureId: textureForShipId(activeLoadout.ship.id),
    motorLevel: motorLevelFromId(activeLoadout.motor.id),
    motorKindColor: motorKindColorFromId(activeLoadout.motor.id),
    dpsLabel: stats.weaponEquipped ? `DPS  ${report.dpsSingleTarget.toFixed(1)}` : 'NO WEAPON',
    weaponId: activeLoadout.weapon?.id ?? null,
    rearWeaponId: activeLoadout.rearWeapon?.id ?? null,
    stats,
  };
}

/** Resolves the prospective (not-yet-purchased) loadout for the currently selected shop
 * kind. Returns null when there's nothing to preview (unknown tab, or the previewed
 * kind/level is already what's equipped). */
export function applyProspectiveKind(
  tab: ShopTab, kind: string, previewLevel: number, current: LoadoutSnapshot, save: SaveData,
): LoadoutSnapshot | null {
  if (tab === 'ship') {
    const previewId = `ship-${kind}-${String(previewLevel)}`;
    if (save.equipped.ship === previewId) return null;
    return { ...current, ship: shipById(previewId) };
  }
  if (tab === 'weapon') {
    const spec = weaponSpecAtLevel(kind as WeaponKind, previewLevel);
    if (current.weapon?.id === spec.id) return null;
    return { ...current, weapon: spec };
  }
  if (tab === 'rear-weapon') {
    const spec = rearWeaponSpecAtLevel(kind as RearWeaponKind, previewLevel);
    if (current.rearWeapon?.id === spec.id) return null;
    return { ...current, rearWeapon: spec };
  }
  if (tab === 'side-weapon') {
    const spec = sideWeaponSpecAtLevel(kind as SideWeaponKind, previewLevel);
    if (current.sideWeapon?.id === spec.id) return null;
    return { ...current, sideWeapon: spec };
  }
  if (tab === 'shield') {
    const spec = shieldSpecAtLevel(kind as ShieldKind, previewLevel);
    if (save.equipped.shield === spec.id) return null;
    return { ...current, shield: spec };
  }
  if (tab === 'generator') {
    const spec = generatorSpecAtLevel(kind as GeneratorKind, previewLevel);
    if (save.equipped.generator === spec.id) return null;
    return { ...current, generator: spec };
  }
  if (tab === 'motor') {
    const spec = motorSpecAtLevel(kind as MotorKind, previewLevel);
    if (save.equipped.motor === spec.id) return null;
    return { ...current, motor: spec };
  }
  return null;
}

// ── Pure simulation stepper — replaces the hand-rolled logic in ShopPreviewPanel ──────

export interface PreviewSimState {
  energy: number;
  shield: number;
}

export interface PreviewSimStep {
  next: PreviewSimState;
  energyFraction: number;
  shieldFraction: number;
  energyLabel: string; // "40 / 80"
  shieldLabel: string; // "20 / 65"
  pulsedThisStep: boolean; // true the step a shield pulse fires — renderer can flash on this
}

/** Shield starts at 50% so the ring is immediately visible, matching existing behavior. */
export function initPreviewSim(stats: EffectiveStats): PreviewSimState {
  return { energy: 0, shield: stats.shieldCapacity * 0.5 };
}

/**
 * Mirrors the discrete generator→shield pulse mechanic from src/core/energy.ts
 * (regenerateEnergy + pulseShield): the generator fills toward capacity, and exactly
 * when it hits full it fires a pulse into the shield and drops by pulseDrainFraction.
 * `dt` is in core ticks — the caller (the view) converts real animation time to ticks.
 *
 * One deliberate divergence from the real core: `regenerateEnergy` clamps
 * `energy + output − motorDraw` to capacity in one combined step, so a high-draw
 * loadout can go a very long time without ever reading exactly at capacity. Here the
 * charge is clamped to capacity BEFORE motor draw is subtracted, so "hit cap" (and
 * therefore a visible pulse) is detected independent of draw — the preview's whole
 * purpose is to show the pulse cycle, so it must never silently stop happening.
 * The pulse formula itself (gain/drain) is identical; see preview.test.ts's
 * cross-check against pulseShield.
 */
export function stepPreviewSim(state: PreviewSimState, stats: EffectiveStats, dt: number): PreviewSimStep {
  const recharged = Math.min(stats.generatorCapacity, state.energy + stats.generatorOutput * dt);
  const hitCap = recharged >= stats.generatorCapacity;
  let energy = Math.max(0, recharged - stats.motorDraw * dt);
  let shield = state.shield;
  let pulsedThisStep = false;

  if (hitCap && stats.shieldCapacity > 0 && shield < stats.shieldCapacity) {
    const gain = Math.min(stats.shieldPulseFraction * stats.shieldCapacity, stats.shieldCapacity - shield);
    shield += gain;
    energy = Math.max(0, energy - stats.generatorPulseDrain);
    pulsedThisStep = true;
  }

  shield = Math.min(shield, stats.shieldCapacity);
  // Loop: restart the charge cycle so the ring keeps pulsing, matching existing behavior.
  if (stats.shieldCapacity > 0 && shield >= stats.shieldCapacity) {
    energy = 0;
    shield = 0;
  }

  return {
    next: { energy, shield },
    energyFraction: stats.generatorCapacity > 0 ? energy / stats.generatorCapacity : 0,
    shieldFraction: stats.shieldCapacity > 0 ? shield / stats.shieldCapacity : 0,
    energyLabel: `${String(Math.ceil(energy))} / ${String(Math.ceil(stats.generatorCapacity))}`,
    shieldLabel: `${String(Math.ceil(shield))} / ${String(Math.ceil(stats.shieldCapacity))}`,
    pulsedThisStep,
  };
}
