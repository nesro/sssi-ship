import type { CardDefinition } from '../../../src/data/cards.js';
import type { ComputedStats } from '../../../src/game/computeStats.js';
import type { RunState } from '../../../src/game/CardManager.js';
import type { CardStrategy } from './CardStrategy.js';
import { GreedyStrategy } from './GreedyStrategy.js';

// Threshold below which energy capacity is considered "low" — prefer regen cards.
const LOW_ENERGY_CAPACITY_THRESHOLD = 70;

// Minimum run level to prioritise explosive rounds / overcharge enablers.
const MIN_LEVEL_EXPLOSIVE_ROUNDS = 3;
const MIN_LEVEL_OVERCHARGE       = 4;

const greedy = new GreedyStrategy();

function findCard(cards: CardDefinition[], pred: (c: CardDefinition) => boolean): CardDefinition | undefined {
  return cards.find(pred);
}

export class OptimalStrategy implements CardStrategy {
  pick(cards: CardDefinition[], stats: ComputedStats, run: RunState): CardDefinition {
    // 1. Explosive Rounds enabler at level ≥ 3, if not yet picked.
    if (run.level >= MIN_LEVEL_EXPLOSIVE_ROUNDS) {
      const card = findCard(
        cards,
        c => c.enables === 'explosiveRounds' && !run.pickedCardIds.has(c.id),
      );
      if (card) return card;
    }

    // 2. Energy regen card when capacity is low (proxy for starved energy budget).
    if (stats.energyCapacity < LOW_ENERGY_CAPACITY_THRESHOLD) {
      const card = findCard(cards, c => (c.statDelta?.energyRegenSec ?? 0) > 0);
      if (card) return card;
    }

    // 3. Any payoff card whose enabler is already active.
    const payoff = findCard(
      cards,
      c => !!c.requiresId && run.pickedCardIds.has(c.requiresId),
    );
    if (payoff) return payoff;

    // 4. Overcharge enabler at level ≥ 4, if not yet picked.
    if (run.level >= MIN_LEVEL_OVERCHARGE) {
      const card = findCard(
        cards,
        c => c.enables === 'overcharge' && !run.pickedCardIds.has(c.id),
      );
      if (card) return card;
    }

    // 5. Fallback: greedy scoring.
    return greedy.pick(cards, stats, run);
  }
}
