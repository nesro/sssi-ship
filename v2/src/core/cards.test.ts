import { describe, expect, it } from 'vitest';
import { createAbilityOffer, resolveAbilityAction } from './cards';
import { CARD_ACTION_REROLL, CARD_ACTION_SKIP, REROLLS_PER_MISSION } from './constants';
import { FIXTURE_LOADOUT, FIXTURE_MISSION } from './fixtures';
import { createCoreState } from './state';
import type { AbilityDefinition, CoreState, RunModifiers } from './types';

const dmg = (amount: number) => (m: RunModifiers): RunModifiers => ({
  ...m,
  weaponDamageMult: m.weaponDamageMult + amount,
});

const TEST_POOL: AbilityDefinition[] = [
  { id: 'a', company: 'nexus', kind: 'passive', name: 'A', description: '', apply: dmg(0.1) },
  { id: 'b', company: 'nexus', kind: 'passive', name: 'B', description: '', apply: dmg(0.2) },
  { id: 'c', company: 'nexus', kind: 'passive', name: 'C', description: '', apply: dmg(0.3) },
  { id: 'd', company: 'nexus', kind: 'passive', name: 'D', description: '', apply: dmg(0.4) },
  {
    id: 'enabler', company: 'nexus', kind: 'passive', name: 'EN', description: '',
    enablerFor: 'chain', unique: true, apply: (m) => ({ ...m, extraPierce: m.extraPierce + 1 }),
  },
  {
    id: 'payoff', company: 'nexus', kind: 'passive', name: 'PAY', description: '',
    requiresChain: 'chain', unique: true, apply: (m) => ({ ...m, energyPerHit: 2 }),
  },
];

function stateWithPool(pool: AbilityDefinition[] = TEST_POOL): CoreState {
  return createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, pool);
}

describe('createAbilityOffer', () => {
  it('offers three distinct abilities', () => {
    const state = stateWithPool();
    const offer = createAbilityOffer(state);
    expect(new Set(offer.abilityIds).size).toBe(3);
  });

  it('never offers a picked unique ability again', () => {
    const state = stateWithPool();
    state.pickedAbilityIds.push('enabler');
    for (let i = 0; i < 50; i++) {
      expect(createAbilityOffer(state).abilityIds).not.toContain('enabler');
    }
  });

  it('suppresses payoffs heavily until the enabler is picked', () => {
    const state = stateWithPool();
    let suppressed = 0;
    const DRAWS = 200;
    for (let i = 0; i < DRAWS; i++) {
      if (createAbilityOffer(state).abilityIds.includes('payoff')) suppressed += 1;
    }
    state.pickedAbilityIds.push('enabler');
    let enabled = 0;
    for (let i = 0; i < DRAWS; i++) {
      if (createAbilityOffer(state).abilityIds.includes('payoff')) enabled += 1;
    }
    expect(suppressed).toBeLessThan(enabled);
  });

  it('throws when the pool cannot fill an offer', () => {
    const state = stateWithPool(TEST_POOL.slice(0, 2));
    expect(() => createAbilityOffer(state)).toThrow(/pool too small/i);
  });
});

describe('resolveAbilityAction', () => {
  it('picking a passive ability applies its effect and records the action', () => {
    const state = stateWithPool();
    state.pendingOffer = { abilityIds: ['a', 'b', 'c'] };
    resolveAbilityAction(state, 1);
    expect(state.modifiers.weaponDamageMult).toBeCloseTo(1.2);
    expect(state.pickedAbilityIds).toEqual(['b']);
    expect(state.abilityActions).toEqual([1]);
    expect(state.pendingOffer).toBeNull();
  });

  it('skip clears the offer without applying anything', () => {
    const state = stateWithPool();
    state.pendingOffer = { abilityIds: ['a', 'b', 'c'] };
    resolveAbilityAction(state, CARD_ACTION_SKIP);
    expect(state.modifiers.weaponDamageMult).toBe(1);
    expect(state.abilityActions).toEqual([CARD_ACTION_SKIP]);
    expect(state.pendingOffer).toBeNull();
  });

  it('reroll replaces the offer and is budgeted per mission', () => {
    const state = stateWithPool();
    state.pendingOffer = { abilityIds: ['a', 'b', 'c'] };
    for (let i = 0; i < REROLLS_PER_MISSION; i++) {
      resolveAbilityAction(state, CARD_ACTION_REROLL);
      expect(state.pendingOffer).not.toBeNull();
    }
    expect(() => { resolveAbilityAction(state, CARD_ACTION_REROLL); }).toThrow(/No rerolls left/);
  });

  it('throws on an action with no pending offer', () => {
    const state = stateWithPool();
    expect(() => { resolveAbilityAction(state, 0); }).toThrow(/No pending/);
  });

  it('reroll draws are seeded — identical across same-seed states', () => {
    const a = stateWithPool();
    const b = stateWithPool();
    a.pendingOffer = createAbilityOffer(a);
    b.pendingOffer = createAbilityOffer(b);
    resolveAbilityAction(a, CARD_ACTION_REROLL);
    resolveAbilityAction(b, CARD_ACTION_REROLL);
    expect(a.pendingOffer).toEqual(b.pendingOffer);
  });
});
