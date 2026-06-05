import type { CardDefinition } from '../../../src/data/cards.js';
import type { ComputedStats } from '../../../src/game/computeStats.js';
import type { RunState } from '../../../src/game/CardManager.js';
import type { CardStrategy } from './CardStrategy.js';

export class RandomStrategy implements CardStrategy {
  pick(cards: CardDefinition[], _stats: ComputedStats, _run: RunState): CardDefinition {
    const idx = Math.floor(Math.random() * cards.length);
    return cards[idx];
  }
}
