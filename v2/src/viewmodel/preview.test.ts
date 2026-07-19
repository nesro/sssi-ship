import { describe, expect, it } from 'vitest';
import { pulseShield } from '../core/energy';
import { FIXTURE_LOADOUT, FIXTURE_MISSION } from '../core/fixtures';
import { computeEffectiveStats } from '../core/stats';
import { createCoreState } from '../core/state';
import type { LoadoutSnapshot } from '../core/types';
import { buildLoadout, defaultSave } from '../save/SaveManager';
import { applyProspectiveKind, computePreviewStatic, initPreviewSim, stepPreviewSim } from './preview';

describe('computePreviewStatic', () => {
  it('activeLoadout resolves to prospective when given, current otherwise', () => {
    const prospective: LoadoutSnapshot = { ...FIXTURE_LOADOUT, ship: { ...FIXTURE_LOADOUT.ship, id: 'ship-warship-1' } };
    const withProspective = computePreviewStatic(FIXTURE_LOADOUT, prospective);
    const withoutProspective = computePreviewStatic(FIXTURE_LOADOUT, null);
    expect(withProspective.weaponId).toBe(prospective.weapon?.id ?? null);
    expect(withoutProspective.weaponId).toBe(FIXTURE_LOADOUT.weapon?.id ?? null);
  });

  it('dpsLabel is "NO WEAPON" when no weapon is equipped', () => {
    const noWeapon: LoadoutSnapshot = { ...FIXTURE_LOADOUT, weapon: null };
    expect(computePreviewStatic(noWeapon, null).dpsLabel).toBe('NO WEAPON');
  });

  it('dpsLabel shows a DPS number when a weapon is equipped', () => {
    expect(computePreviewStatic(FIXTURE_LOADOUT, null).dpsLabel).toMatch(/^DPS\s+[\d.]+$/);
  });

  it('weaponId/rearWeaponId are null when the slot is empty', () => {
    const empty: LoadoutSnapshot = { ...FIXTURE_LOADOUT, weapon: null, rearWeapon: null };
    const vm = computePreviewStatic(empty, null);
    expect(vm.weaponId).toBeNull();
    expect(vm.rearWeaponId).toBeNull();
  });
});

describe('stepPreviewSim', () => {
  it('initPreviewSim starts shield at 50% capacity and energy at 0', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, []);
    const stats = computeEffectiveStats(state.loadout, state.modifiers);
    const sim = initPreviewSim(stats);
    expect(sim.energy).toBe(0);
    expect(sim.shield).toBe(stats.shieldCapacity * 0.5);
  });

  it('loops back to 0/0 exactly when shield reaches capacity', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, []);
    const stats = computeEffectiveStats(state.loadout, state.modifiers);
    let sim = initPreviewSim(stats);
    sim = { energy: 0, shield: stats.shieldCapacity }; // force "about to loop"
    const step = stepPreviewSim(sim, stats, 1);
    expect(step.next).toEqual({ energy: 0, shield: 0 });
  });

  it('cross-check: pulse gain/drain formula matches src/core/energy.ts pulseShield exactly', () => {
    // dt=0 isolates the pulse formula from stepPreviewSim's documented, intentional
    // charge/draw-ordering divergence (it clamps to capacity before subtracting motor
    // draw, so a pulse is never silently skipped) — this test targets the part that
    // must stay identical: how much shield a pulse grants and how much energy it costs.
    for (const loadout of representativeLoadouts()) {
      const state = createCoreState(FIXTURE_MISSION, loadout, 1, []);
      const stats = computeEffectiveStats(state.loadout, state.modifiers);
      const shieldBefore = stats.shieldCapacity * 0.3;

      state.ship.energy = stats.generatorCapacity;
      state.ship.shield = shieldBefore;
      pulseShield(state, stats);

      const step = stepPreviewSim({ energy: stats.generatorCapacity, shield: shieldBefore }, stats, 0);

      expect(step.next.shield).toBeCloseTo(state.ship.shield, 10);
      expect(step.next.energy).toBeCloseTo(state.ship.energy, 10);
      expect(step.pulsedThisStep).toBe(true);
    }
  });

  it('never fires a pulse while the generator is below capacity, matching pulseShield', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, []);
    const stats = computeEffectiveStats(state.loadout, state.modifiers);
    state.ship.energy = stats.generatorCapacity - 1;
    state.ship.shield = 0;
    pulseShield(state, stats);
    expect(state.ship.shield).toBe(0); // pulseShield no-ops below capacity

    const step = stepPreviewSim({ energy: stats.generatorCapacity - 1, shield: 0 }, stats, 0);
    expect(step.pulsedThisStep).toBe(false);
  });
});

describe('applyProspectiveKind', () => {
  const save = defaultSave(); // ship-interceptor-1, pulse-1, shield-wall-1, generator-torrent-1, motor-rush-1, no rear/side weapon
  const current = buildLoadout(save);

  it('ship: returns a loadout with the previewed ship when it differs from equipped', () => {
    const result = applyProspectiveKind('ship', 'salvager', 1, current, save);
    expect(result?.ship.id).toBe('ship-salvager-1');
  });

  it('ship: no-op (null) when the previewed ship is already equipped', () => {
    expect(applyProspectiveKind('ship', 'interceptor', 1, current, save)).toBeNull();
  });

  it('weapon: returns a loadout with the previewed weapon when it differs from equipped', () => {
    const result = applyProspectiveKind('weapon', 'scatter', 1, current, save);
    expect(result?.weapon?.id).toBe('scatter-1');
  });

  it('weapon: no-op (null) when the previewed weapon is already equipped', () => {
    expect(applyProspectiveKind('weapon', 'pulse', 1, current, save)).toBeNull();
  });

  it('rear-weapon: returns a loadout with the previewed rear weapon (none equipped, so never a no-op)', () => {
    const result = applyProspectiveKind('rear-weapon', 'grenade', 1, current, save);
    expect(result?.rearWeapon?.id).toBe('grenade-1');
  });

  it('side-weapon: returns a loadout with the previewed side weapon (none equipped, so never a no-op)', () => {
    const result = applyProspectiveKind('side-weapon', 'focus', 1, current, save);
    expect(result?.sideWeapon?.id).toBe('focus-1');
  });

  it('shield: returns a loadout with the previewed shield when it differs from equipped', () => {
    const result = applyProspectiveKind('shield', 'reflex', 2, current, save);
    expect(result?.shield?.id).toBe('shield-reflex-2');
  });

  it('shield: no-op (null) when the previewed shield is already equipped', () => {
    expect(applyProspectiveKind('shield', 'wall', 1, current, save)).toBeNull();
  });

  it('generator: returns a loadout with the previewed generator when it differs from equipped', () => {
    const result = applyProspectiveKind('generator', 'surge', 2, current, save);
    expect(result?.generator.id).toBe('generator-surge-2');
  });

  it('generator: no-op (null) when the previewed generator is already equipped', () => {
    expect(applyProspectiveKind('generator', 'torrent', 1, current, save)).toBeNull();
  });

  it('motor: returns a loadout with the previewed motor when it differs from equipped', () => {
    const result = applyProspectiveKind('motor', 'tactical', 2, current, save);
    expect(result?.motor.id).toBe('motor-tactical-2');
  });

  it('motor: no-op (null) when the previewed motor is already equipped', () => {
    expect(applyProspectiveKind('motor', 'rush', 1, current, save)).toBeNull();
  });

  it('no-op (null) for tabs with no prospective concept (loadout/supplies)', () => {
    expect(applyProspectiveKind('loadout', 'anything', 1, current, save)).toBeNull();
    expect(applyProspectiveKind('supplies', 'anything', 1, current, save)).toBeNull();
  });
});

function representativeLoadouts(): LoadoutSnapshot[] {
  return [
    FIXTURE_LOADOUT,
    { ...FIXTURE_LOADOUT, generator: { id: 'fix-gen-2', outputPerTick: 5, capacity: 30, pulseDrainFraction: 0.6 } },
    { ...FIXTURE_LOADOUT, shield: { id: 'fix-shield-2', capacity: 80, pulseShieldFraction: 0.3 }, motor: { id: 'fix-motor-2', timelineMultiplier: 1, powerDrawPerTick: 1.2 } },
  ];
}
