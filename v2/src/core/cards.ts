import {
  CARD_ACTION_REROLL,
  CARD_ACTION_SKIP,
  CARDS_PER_OFFER,
  PAYOFF_SUPPRESSED_WEIGHT,
} from './constants';
import type { AbilityDefinition, AbilityOffer, CoreState } from './types';

/**
 * Draws a 3-card offer from the pool via the seeded PRNG. Weighted sampling without
 * replacement: payoffs are suppressed until their chain's enabler is picked; unique
 * cards already picked are excluded entirely.
 *
 * Tutorial missions may set firstOfferIds on the mission spec to guarantee specific cards
 * on the very first support call (supportCallsDone === 1 after the counter is incremented
 * in maybeTriggerSupportCall before this is called).
 */
export function createAbilityOffer(state: CoreState): AbilityOffer {
  const firstOffer = state.mission.firstOfferIds;
  // pendingOffer is null only on the initial trigger; a reroll has pendingOffer still set.
  if (firstOffer !== undefined && state.supportCallsDone === 1 && state.pendingOffer === null) {
    return { abilityIds: firstOffer };
  }
  const candidates = state.abilityPool.filter(
    (card) => !(card.unique === true && state.pickedAbilityIds.includes(card.id)),
  );
  if (candidates.length < CARDS_PER_OFFER) {
    throw new Error(
      `Card pool too small: ${String(candidates.length)} candidates, need ${String(CARDS_PER_OFFER)}`,
    );
  }
  const enabledChains = new Set(
    state.abilityPool
      .filter((card) => card.enablerFor !== undefined && state.pickedAbilityIds.includes(card.id))
      .map((card) => card.enablerFor),
  );
  const drawn: AbilityDefinition[] = [];
  const remaining = [...candidates];
  while (drawn.length < CARDS_PER_OFFER) {
    const card = weightedDraw(remaining, enabledChains, state.rng);
    drawn.push(card);
    remaining.splice(remaining.indexOf(card), 1);
  }
  const [a, b, c] = drawn;
  if (a === undefined || b === undefined || c === undefined) {
    throw new Error('Card draw failed to produce a full offer');
  }
  return { abilityIds: [a.id, b.id, c.id] };
}

/**
 * Resolves one player action on the pending offer. Actions are recorded in order —
 * the replay's cardPicks stream (-2 reroll, -1 skip, 0..2 pick).
 */
export function resolveAbilityAction(state: CoreState, action: number): void {
  const offer = state.pendingOffer;
  if (offer === null) {
    throw new Error(`No pending card offer to resolve (action ${String(action)})`);
  }
  if (action === CARD_ACTION_REROLL) {
    if (state.rerollsLeft <= 0) {
      throw new Error('No rerolls left this mission');
    }
    state.rerollsLeft -= 1;
    state.abilityActions.push(action);
    state.pendingOffer = createAbilityOffer(state);
    return;
  }
  if (action === CARD_ACTION_SKIP) {
    state.abilityActions.push(action);
    state.pendingOffer = null;
    return;
  }
  const cardId = offer.abilityIds[action];
  if (cardId === undefined) {
    throw new Error(`Invalid card action ${String(action)}; expected -2, -1, or 0..2`);
  }
  const card = state.abilityPool.find((c) => c.id === cardId);
  if (card === undefined) {
    throw new Error(`Offered card "${cardId}" missing from the pool`);
  }
  if (card.kind === 'active') {
    if (state.equippedAbilities.length < 3) {
      state.equippedAbilities.push({ abilityId: card.id, cooldownLeft: 0 });
    }
  } else {
    state.modifiers = card.apply !== undefined ? card.apply(state.modifiers) : state.modifiers;
  }
  if (card.onPick !== undefined) card.onPick(state);
  state.pickedAbilityIds.push(card.id);
  state.abilityActions.push(action);
  state.pendingOffer = null;
}

function weightedDraw(
  cards: AbilityDefinition[],
  enabledChains: Set<string | undefined>,
  rng: () => number,
): AbilityDefinition {
  const weights = cards.map((card) =>
    card.requiresChain !== undefined && !enabledChains.has(card.requiresChain)
      ? PAYOFF_SUPPRESSED_WEIGHT
      : 1,
  );
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = rng() * total;
  for (let i = 0; i < cards.length; i++) {
    roll -= weights[i] ?? 0;
    if (roll <= 0) {
      const card = cards[i];
      if (card !== undefined) return card;
    }
  }
  const last = cards[cards.length - 1];
  if (last === undefined) throw new Error('weightedDraw called with an empty card list');
  return last;
}
