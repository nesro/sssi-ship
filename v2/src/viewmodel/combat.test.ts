import { describe, expect, it } from 'vitest';
import { TICKS_PER_SECOND } from '../core/constants';
import { FIXTURE_LOADOUT, FIXTURE_MISSION, makeFixtureEnemy } from '../core/fixtures';
import { createCoreState } from '../core/state';
import { computeCardOverlayViewModel, computeCombatHudViewModel, computeSupplyButtonsViewModel } from './combat';

describe('computeCombatHudViewModel', () => {
  it('bar fractions are clamped to 0–1', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, []);
    state.ship.hull = state.ship.maxHull * 2; // overheal edge case
    state.ship.shield = -5; // underflow edge case
    const vm = computeCombatHudViewModel(state, null, 0.5);
    expect(vm.hull.fraction).toBe(1);
    expect(vm.shield.fraction).toBe(0);
  });

  it('energy bar switches to the brownout color below the threshold', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, []);
    state.ship.energy = 0; // well below brownout threshold
    const vm = computeCombatHudViewModel(state, null, 0);
    expect(vm.energy.color).toBe(0xff4400);
  });

  it('mode is "boss" and reads boss.hp/boss.maxHp when a boss is present', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, []);
    const boss = makeFixtureEnemy({ isBoss: true, hp: 40, maxHp: 200 });
    const vm = computeCombatHudViewModel(state, boss, 0.9);
    expect(vm.missionOrBoss.mode).toBe('boss');
    expect(vm.missionOrBoss.name).toBe('BOSS');
    expect(vm.missionOrBoss.fraction).toBeCloseTo(0.2);
  });

  it('mode is "mission" and reads progressFrac when no boss is present', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, []);
    const vm = computeCombatHudViewModel(state, null, 0.3);
    expect(vm.missionOrBoss.mode).toBe('mission');
    expect(vm.missionOrBoss.name).toBe('MISS');
    expect(vm.missionOrBoss.fraction).toBeCloseTo(0.3);
  });

  it('supportMarkers is empty when a boss is present', () => {
    const missionWithCalls = { ...FIXTURE_MISSION, supportCallTicks: [TICKS_PER_SECOND * 5] };
    const state = createCoreState(missionWithCalls, FIXTURE_LOADOUT, 1, []);
    const boss = makeFixtureEnemy({ isBoss: true, hp: 10, maxHp: 100 });
    const vm = computeCombatHudViewModel(state, boss, 0);
    expect(vm.supportMarkers).toEqual([]);
  });

  it('supportMarkers has one entry per support-call tick when no boss is present', () => {
    const missionWithCalls = { ...FIXTURE_MISSION, supportCallTicks: [TICKS_PER_SECOND * 5, TICKS_PER_SECOND * 10] };
    const state = createCoreState(missionWithCalls, FIXTURE_LOADOUT, 1, []);
    const vm = computeCombatHudViewModel(state, null, 0);
    expect(vm.supportMarkers).toHaveLength(2);
  });

  it('dpsLine is never blank — it reads "DPS 0.0" with no weapon equipped', () => {
    const loadoutNoWeapon = { ...FIXTURE_LOADOUT, weapon: null };
    const state = createCoreState(FIXTURE_MISSION, loadoutNoWeapon, 1, []);
    const vm = computeCombatHudViewModel(state, null, 0);
    expect(vm.dpsLine).toBe('DPS 0.0  K0');
    expect(vm.damageRangeLine).toBe('');
    expect(vm.critLine).toBe('');
  });

  it('damageRangeLine and critLine are populated when a weapon is equipped', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, []);
    const vm = computeCombatHudViewModel(state, null, 0);
    expect(vm.damageRangeLine).not.toBe('');
    expect(vm.critLine).toMatch(/^CRIT \d+%$/);
  });
});

describe('computeSupplyButtonsViewModel', () => {
  it('hasSupplies is false when no supplies are equipped', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, []);
    expect(computeSupplyButtonsViewModel(state).hasSupplies).toBe(false);
  });

  it('a supply with 0 charges left is marked empty', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, []);
    state.supplies.push({ spec: { id: 'sup-x', name: 'Nano Repair', description: '', kind: 'shield-restore', magnitude: 10, durationTicks: 0, maxCharges: 2 }, chargesLeft: 0 });
    const vm = computeSupplyButtonsViewModel(state);
    expect(vm.hasSupplies).toBe(true);
    expect(vm.buttons[0]).toMatchObject({ empty: true, label: 'Nano Repair  ×0' });
  });
});

describe('computeCardOverlayViewModel', () => {
  it('showReroll is false when rerollsLeft is 0', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, []);
    state.rerollsLeft = 0;
    const offer = { abilityIds: ['meta-reroll-cache', 'quantum-energy-overdrive', 'pierce-lance'] as [string, string, string] };
    const vm = computeCardOverlayViewModel(offer, state);
    expect(vm.showReroll).toBe(false);
  });

  it('showReroll is true when rerollsLeft > 0, and cards resolve name/company', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, []);
    state.rerollsLeft = 2;
    const offer = { abilityIds: ['meta-reroll-cache', 'quantum-energy-overdrive', 'pierce-lance'] as [string, string, string] };
    const vm = computeCardOverlayViewModel(offer, state);
    expect(vm.showReroll).toBe(true);
    expect(vm.rerollsLeft).toBe(2);
    expect(vm.cards).toHaveLength(3);
    expect(vm.cards[0]).toMatchObject({ cardId: 'meta-reroll-cache', name: 'REROLL CACHE', companyChar: 'N' });
  });
});
