import type { CardDefinition } from '../../../src/data/cards.js';
import type { ComputedStats } from '../../../src/game/computeStats.js';
import type { RunState } from '../../../src/game/CardManager.js';

export interface CardStrategy {
  pick(cards: CardDefinition[], stats: ComputedStats, run: RunState): CardDefinition;
}
