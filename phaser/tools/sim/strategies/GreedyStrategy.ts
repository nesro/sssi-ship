import type { CardDefinition } from '../../../src/data/cards.js';
import type { ComputedStats } from '../../../src/game/computeStats.js';
import type { RunState } from '../../../src/game/CardManager.js';
import type { CardStrategy } from './CardStrategy.js';

// Score weights for each stat delta field.
const FRONT_DAMAGE_WEIGHT    = 10;
const FRONT_FIRE_MS_WEIGHT   = 0.05;
const ENERGY_CAPACITY_WEIGHT = 0.1;
const ENERGY_REGEN_WEIGHT    = 1;
const SHIELD_CAPACITY_WEIGHT = 0.05;
const SHIELD_REGEN_WEIGHT    = 0.5;

// Flat scores for enablers and payoffs with synergy.
const ENABLER_SCORE  = 25;
const SYNERGY_SCORE  = 40;

function scoreCard(card: CardDefinition, run: RunState): number {
  // Payoff card whose enabler is already active — strong synergy.
  if (card.requiresId && run.pickedCardIds.has(card.requiresId)) {
    return SYNERGY_SCORE;
  }

  // Enabler card — generically valuable.
  if (card.enables) {
    return ENABLER_SCORE;
  }

  const delta = card.statDelta;
  if (!delta) return 0;

  let score = 0;
  if (delta.frontDamage    !== undefined) score += delta.frontDamage    * FRONT_DAMAGE_WEIGHT;
  if (delta.frontFireMs    !== undefined) score += Math.abs(delta.frontFireMs) * FRONT_FIRE_MS_WEIGHT;
  if (delta.energyCapacity !== undefined) score += delta.energyCapacity * ENERGY_CAPACITY_WEIGHT;
  if (delta.energyRegenSec !== undefined) score += delta.energyRegenSec * ENERGY_REGEN_WEIGHT;
  if (delta.shieldCapacity !== undefined) score += delta.shieldCapacity * SHIELD_CAPACITY_WEIGHT;
  if (delta.shieldRegenSec !== undefined) score += delta.shieldRegenSec * SHIELD_REGEN_WEIGHT;
  return score;
}

export class GreedyStrategy implements CardStrategy {
  pick(cards: CardDefinition[], _stats: ComputedStats, run: RunState): CardDefinition {
    let best     = cards[0];
    let bestScore = scoreCard(best, run);

    for (let i = 1; i < cards.length; i++) {
      const s = scoreCard(cards[i], run);
      // Tiebreak: random flip to avoid always picking first card on ties.
      if (s > bestScore || (s === bestScore && Math.random() < 0.5)) {
        best      = cards[i];
        bestScore = s;
      }
    }

    return best;
  }
}
