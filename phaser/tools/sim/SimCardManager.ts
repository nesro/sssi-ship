import { CardManager } from '../../src/game/CardManager.js';
import type { RunState } from '../../src/game/CardManager.js';
import type { ComputedStats } from '../../src/game/computeStats.js';
import type { CardDefinition } from '../../src/data/cards.js';

export class SimCardManager {
  private inner: CardManager;

  constructor(chainLevel = 0) {
    this.inner = new CardManager(chainLevel);
  }

  draw(run: RunState): CardDefinition[] {
    return this.inner.draw(run);
  }

  pick(card: CardDefinition, stats: ComputedStats, run: RunState): void {
    this.inner.pick(card, stats, run);
  }
}
