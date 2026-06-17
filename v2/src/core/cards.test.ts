import { describe, expect, it } from 'vitest';
import { createCardOffer, resolveCardAction } from './cards';
import { CARD_ACTION_REROLL, CARD_ACTION_SKIP, REROLLS_PER_MISSION } from './constants';
import { FIXTURE_LOADOUT, FIXTURE_MISSION } from './fixtures';
import { createCoreState } from './state';
import type { CardDefinition, CoreState, RunModifiers } from './types';

const dmg = (amount: number) => (m: RunModifiers): RunModifiers => ({
  ...m,
  weaponDamageMult: m.weaponDamageMult + amount,
});

const TEST_POOL: CardDefinition[] = [
  { id: 'a', system: 'weapon', name: 'A', description: '', apply: dmg(0.1) },
  { id: 'b', system: 'weapon', name: 'B', description: '', apply: dmg(0.2) },
  { id: 'c', system: 'weapon', name: 'C', description: '', apply: dmg(0.3) },
  { id: 'd', system: 'weapon', name: 'D', description: '', apply: dmg(0.4) },
  {
    id: 'enabler', system: 'weapon', name: 'EN', description: '',
    enablerFor: 'chain', unique: true, apply: (m) => ({ ...m, extraPierce: m.extraPierce + 1 }),
  },
  {
    id: 'payoff', system: 'weapon', name: 'PAY', description: '',
    requiresChain: 'chain', unique: true, apply: (m) => ({ ...m, energyPerHit: 2 }),
  },
];

function stateWithPool(pool: CardDefinition[] = TEST_POOL): CoreState {
  return createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, pool);
}

describe('createCardOffer', () => {
  it('offers three distinct cards', () => {
    const state = stateWithPool();
    const offer = createCardOffer(state);
    expect(new Set(offer.cardIds).size).toBe(3);
  });

  it('never offers a picked unique card again', () => {
    const state = stateWithPool();
    state.pickedCardIds.push('enabler');
    for (let i = 0; i < 50; i++) {
      expect(createCardOffer(state).cardIds).not.toContain('enabler');
    }
  });

  it('suppresses payoffs heavily until the enabler is picked', () => {
    const state = stateWithPool();
    let suppressed = 0;
    const DRAWS = 200;
    for (let i = 0; i < DRAWS; i++) {
      if (createCardOffer(state).cardIds.includes('payoff')) suppressed += 1;
    }
    state.pickedCardIds.push('enabler');
    let enabled = 0;
    for (let i = 0; i < DRAWS; i++) {
      if (createCardOffer(state).cardIds.includes('payoff')) enabled += 1;
    }
    expect(suppressed).toBeLessThan(enabled);
  });

  it('throws when the pool cannot fill an offer', () => {
    const state = stateWithPool(TEST_POOL.slice(0, 2));
    expect(() => createCardOffer(state)).toThrow(/Card pool too small/);
  });
});

describe('resolveCardAction', () => {
  it('picking a card applies its effect and records the action', () => {
    const state = stateWithPool();
    state.pendingOffer = { cardIds: ['a', 'b', 'c'] };
    resolveCardAction(state, 1);
    expect(state.modifiers.weaponDamageMult).toBeCloseTo(1.2);
    expect(state.pickedCardIds).toEqual(['b']);
    expect(state.cardActions).toEqual([1]);
    expect(state.pendingOffer).toBeNull();
  });

  it('skip clears the offer without applying anything', () => {
    const state = stateWithPool();
    state.pendingOffer = { cardIds: ['a', 'b', 'c'] };
    resolveCardAction(state, CARD_ACTION_SKIP);
    expect(state.modifiers.weaponDamageMult).toBe(1);
    expect(state.cardActions).toEqual([CARD_ACTION_SKIP]);
    expect(state.pendingOffer).toBeNull();
  });

  it('reroll replaces the offer and is budgeted per mission', () => {
    const state = stateWithPool();
    state.pendingOffer = { cardIds: ['a', 'b', 'c'] };
    for (let i = 0; i < REROLLS_PER_MISSION; i++) {
      resolveCardAction(state, CARD_ACTION_REROLL);
      expect(state.pendingOffer).not.toBeNull();
    }
    expect(() => { resolveCardAction(state, CARD_ACTION_REROLL); }).toThrow(/No rerolls left/);
  });

  it('throws on an action with no pending offer', () => {
    const state = stateWithPool();
    expect(() => { resolveCardAction(state, 0); }).toThrow(/No pending card offer/);
  });

  it('reroll draws are seeded — identical across same-seed states', () => {
    const a = stateWithPool();
    const b = stateWithPool();
    a.pendingOffer = createCardOffer(a);
    b.pendingOffer = createCardOffer(b);
    resolveCardAction(a, CARD_ACTION_REROLL);
    resolveCardAction(b, CARD_ACTION_REROLL);
    expect(a.pendingOffer).toEqual(b.pendingOffer);
  });
});
