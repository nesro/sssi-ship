import type { CardDefinition } from '../../../src/data/cards.js';
import type { ComputedStats } from '../../../src/game/computeStats.js';
import type { RunState } from '../../../src/game/CardManager.js';
import type { CardStrategy } from './CardStrategy.js';
import { GreedyStrategy } from './GreedyStrategy.js';

// Pick fast_regen up to this threshold — ensures energy sustain before damage.
const REGEN_SUSTAIN_THRESHOLD = 48;

// Minimum run level to prioritise overcharge enabler.
const MIN_LEVEL_OVERCHARGE = 3;

const greedy = new GreedyStrategy();

function findCard(cards: CardDefinition[], pred: (c: CardDefinition) => boolean): CardDefinition | undefined {
  return cards.find(pred);
}

export class OptimalStrategy implements CardStrategy {
  pick(cards: CardDefinition[], stats: ComputedStats, run: RunState): CardDefinition {
    // 1. Energy regen up to sustain threshold — take before damage cards.
    if (stats.energyRegenSec < REGEN_SUSTAIN_THRESHOLD) {
      const card = findCard(cards, c => (c.statDelta?.energyRegenSec ?? 0) > 0);
      if (card) return card;
    }

    // 2. Overcharge enabler at level ≥ 3, if not yet picked — burst damage synergy.
    if (run.level >= MIN_LEVEL_OVERCHARGE) {
      const card = findCard(
        cards,
        c => c.enables === 'overcharge' && !run.pickedCardIds.has(c.id),
      );
      if (card) return card;
    }

    // 3. Fallback: greedy scoring.
    return greedy.pick(cards, stats, run);
  }
}
