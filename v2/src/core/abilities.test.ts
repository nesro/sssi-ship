import { describe, expect, it } from 'vitest';
import { resolveAbilityAction } from './cards';
import { activateAbility } from './combat';
import { hashCoreState } from './replay';
import { createCoreState } from './state';
import { advanceTick } from './tick';
import { FIXTURE_LOADOUT, FIXTURE_MISSION, makeFixtureEnemy } from './fixtures';
import type { AbilityDefinition } from './types';

// Minimal ability fixtures — independent of production balance numbers
const OVERLOAD: AbilityDefinition = {
  id: 'test-overload',
  name: 'Test Overload',
  description: '',
  company: 'nexus',
  kind: 'active',
  energyCost: 20,
  cooldownTicks: 10,
  activate: (state) => {
    state.activeEffects.push({ kind: 'damage-mult', multiplier: 2, expiresAtTick: state.tick + 10 });
  },
};

const BARRIER: AbilityDefinition = {
  id: 'test-barrier',
  name: 'Test Barrier',
  description: '',
  company: 'aegis',
  kind: 'active',
  energyCost: 30,
  cooldownTicks: 20,
  activate: (state) => {
    state.activeEffects.push({ kind: 'invulnerable', expiresAtTick: state.tick + 15 });
  },
};

const DPS_PASSIVE: AbilityDefinition = {
  id: 'test-dps',
  name: 'Test DPS',
  description: '',
  company: 'nexus',
  kind: 'passive',
  apply: (mods) => ({ ...mods, weaponDamageMult: mods.weaponDamageMult + 0.5 }),
};

// ── Auto-fire toggle ──────────────────────────────────────────────────────────

describe('autoFireEnabled toggle', () => {
  it('disabled: weapon does not fire and energy accumulates', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, []);
    state.autoFireEnabled = false;
    state.autoShieldEnabled = false; // prevent pulse drain from consuming energy
    state.ship.energy = 0;
    for (let i = 0; i < 50; i++) advanceTick(state);
    expect(state.stats.shotsFired).toBe(0);
    // Generator output 2/tick × 50 ticks = 100, capped at capacity 50
    expect(state.ship.energy).toBeCloseTo(FIXTURE_LOADOUT.generator.capacity, 0);
  });

  it('enabled: fires normally when enemies are present', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, []);
    state.autoFireEnabled = true;
    state.ship.energy = 50;
    state.enemies = [makeFixtureEnemy({ distance: 50, hp: 9999 })];
    for (let i = 0; i < 30; i++) advanceTick(state);
    expect(state.stats.shotsFired).toBeGreaterThan(0);
  });
});

// ── Auto-shield toggle ────────────────────────────────────────────────────────

describe('autoShieldEnabled toggle', () => {
  it('disabled: shield stays at 0 even when energy is full', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, []);
    state.autoShieldEnabled = false;
    state.autoFireEnabled = false; // no weapon drain — keeps energy at full
    state.ship.shield = 0;
    state.ship.energy = FIXTURE_LOADOUT.generator.capacity; // at full to would-be trigger
    for (let i = 0; i < 30; i++) advanceTick(state);
    expect(state.ship.shield).toBe(0);
  });

  it('enabled: shield increases when energy is full', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, []);
    state.autoShieldEnabled = true;
    state.autoFireEnabled = false; // no weapon drain — energy stays full
    state.ship.shield = 0;
    state.ship.energy = FIXTURE_LOADOUT.generator.capacity; // trigger condition
    advanceTick(state);
    // pulseShieldFraction=0.1 × shieldCapacity=30 = 3 per pulse
    expect(state.ship.shield).toBeGreaterThan(0);
  });
});

// ── activateAbility ───────────────────────────────────────────────────────────

describe('activateAbility', () => {
  it('drains exactly energyCost and sets cooldown', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, [OVERLOAD]);
    state.ship.energy = 50;
    state.equippedAbilities = [{ abilityId: 'test-overload', cooldownLeft: 0 }];
    activateAbility(state, 0);
    expect(state.ship.energy).toBe(30); // 50 − 20
    expect(state.equippedAbilities[0]?.cooldownLeft).toBe(10);
  });

  it('no-ops when energy is below cost', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, [OVERLOAD]);
    state.ship.energy = 10; // less than 20 cost
    state.equippedAbilities = [{ abilityId: 'test-overload', cooldownLeft: 0 }];
    activateAbility(state, 0);
    expect(state.ship.energy).toBe(10);
    expect(state.equippedAbilities[0]?.cooldownLeft).toBe(0);
  });

  it('no-ops when slot is on cooldown', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, [OVERLOAD]);
    state.ship.energy = 50;
    state.equippedAbilities = [{ abilityId: 'test-overload', cooldownLeft: 5 }];
    activateAbility(state, 0);
    expect(state.ship.energy).toBe(50);
    expect(state.equippedAbilities[0]?.cooldownLeft).toBe(5);
  });

  it('adds correct ActiveEffect with proper expiry tick', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, [BARRIER]);
    state.ship.energy = 50;
    state.equippedAbilities = [{ abilityId: 'test-barrier', cooldownLeft: 0 }];
    const expectedExpiry = state.tick + 15;
    activateAbility(state, 0);
    expect(state.activeEffects).toContainEqual({ kind: 'invulnerable', expiresAtTick: expectedExpiry });
  });

  it('cooldown decrements each tick via tick loop', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, [OVERLOAD]);
    state.ship.energy = 50;
    state.equippedAbilities = [{ abilityId: 'test-overload', cooldownLeft: 0 }];
    activateAbility(state, 0); // cooldownLeft = 10
    advanceTick(state);
    expect(state.equippedAbilities[0]?.cooldownLeft).toBe(9);
    advanceTick(state);
    expect(state.equippedAbilities[0]?.cooldownLeft).toBe(8);
  });
});

// ── Active ability equipping via resolveAbilityAction ────────────────────────

describe('resolveAbilityAction with active ability', () => {
  it('equips the ability into the bar instead of applying modifiers', () => {
    const beforeMult = 1; // default weaponDamageMult
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, [OVERLOAD]);
    state.pendingOffer = { abilityIds: ['test-overload', 'test-overload', 'test-overload'] };
    resolveAbilityAction(state, 0);
    expect(state.equippedAbilities).toHaveLength(1);
    expect(state.equippedAbilities[0]?.abilityId).toBe('test-overload');
    expect(state.equippedAbilities[0]?.cooldownLeft).toBe(0);
    expect(state.modifiers.weaponDamageMult).toBe(beforeMult); // modifiers untouched
    expect(state.pickedAbilityIds).toContain('test-overload'); // recorded in picks
  });

  it('passive ability still applies modifiers (regression guard)', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, [DPS_PASSIVE]);
    state.pendingOffer = { abilityIds: ['test-dps', 'test-dps', 'test-dps'] };
    resolveAbilityAction(state, 0);
    expect(state.modifiers.weaponDamageMult).toBeCloseTo(1.5);
    expect(state.equippedAbilities).toHaveLength(0); // nothing equipped
  });

  it('does not equip when the ability bar is full (3 slots)', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, [OVERLOAD]);
    state.equippedAbilities = [
      { abilityId: 'slot-a', cooldownLeft: 0 },
      { abilityId: 'slot-b', cooldownLeft: 0 },
      { abilityId: 'slot-c', cooldownLeft: 0 },
    ];
    state.pendingOffer = { abilityIds: ['test-overload', 'test-overload', 'test-overload'] };
    resolveAbilityAction(state, 0);
    expect(state.equippedAbilities).toHaveLength(3); // bar unchanged
    expect(state.pickedAbilityIds).toContain('test-overload'); // still recorded
  });
});

// ── hashCoreState covers new fields ──────────────────────────────────────────

describe('hashCoreState includes ability system fields', () => {
  it('changes when autoFireEnabled toggles', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, []);
    const h1 = hashCoreState(state);
    state.autoFireEnabled = false;
    expect(hashCoreState(state)).not.toBe(h1);
  });

  it('changes when autoShieldEnabled toggles', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, []);
    const h1 = hashCoreState(state);
    state.autoShieldEnabled = false;
    expect(hashCoreState(state)).not.toBe(h1);
  });

  it('changes when equippedAbilities changes', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, [OVERLOAD]);
    const h1 = hashCoreState(state);
    state.equippedAbilities.push({ abilityId: 'test-overload', cooldownLeft: 0 });
    expect(hashCoreState(state)).not.toBe(h1);
  });

  it('changes when an equipped ability cooldown changes', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, [OVERLOAD]);
    state.equippedAbilities = [{ abilityId: 'test-overload', cooldownLeft: 0 }];
    const h1 = hashCoreState(state);
    const slot = state.equippedAbilities[0];
    if (slot === undefined) throw new Error('expected equipped slot');
    slot.cooldownLeft = 5;
    expect(hashCoreState(state)).not.toBe(h1);
  });
});
