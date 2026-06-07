import type { CardDefinition, StatDelta } from '../data/cards.js';
import type { ComputedStats } from './computeStats.js';
import { ALL_CARDS } from '../data/cards.js';

// In-mission run state — transient, reset at mission start, never persisted.
export interface RunState {
  pickedCardIds:        Set<string>;
  rerollsLeft:          number;
  xp:                   number;
  level:                number;
  // Mechanic flags set by enabler cards
  explosiveRounds:      boolean;
  chainLightning:       boolean;
  overcharge:           boolean;
  // Overcharge tracking (relevant only when overcharge === true)
  shotsSinceOvercharge: number;
  overchargeEvery:      number;
}

const PAYOFF_SUPPRESSED_WEIGHT = 0.15;

export class CardManager {
  private pool: CardDefinition[];
  private rng:  () => number;

  // chainLevel: 0 = no chain investment, 1 = chain_pool_1, 2 = chain_pool_2
  // rng: seeded PRNG for reproducible draws; defaults to Math.random for non-seeded use
  constructor(chainLevel: number = 0, rng: () => number = Math.random) {
    this.rng  = rng;
    this.pool = ALL_CARDS.filter(c => (c.requiresChain ?? 0) <= chainLevel);
    // Fisher-Yates shuffle — deterministic when rng is seeded
    for (let i = this.pool.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [this.pool[i], this.pool[j]] = [this.pool[j]!, this.pool[i]!];
    }
  }

  draw(run: RunState): CardDefinition[] {
    const available = this.pool.filter(c => !run.pickedCardIds.has(c.id));
    if (available.length === 0) return [];

    const weighted = available.map(c => ({
      card:   c,
      weight: this.cardWeight(c, run),
    }));

    const drawn: CardDefinition[] = [];
    const used = new Set<string>();

    for (let attempt = 0; attempt < 3 && drawn.length < 3; attempt++) {
      const pick = this.weightedRandom(weighted.filter(w => !used.has(w.card.id)));
      if (!pick) break;
      drawn.push(pick);
      used.add(pick.id);
    }

    return drawn;
  }

  pick(card: CardDefinition, stats: ComputedStats, run: RunState): void {
    run.pickedCardIds.add(card.id);

    if (card.statDelta) {
      applyDelta(stats, card.statDelta);
    }

    if (card.enables) {
      (run as unknown as Record<string, unknown>)[card.enables] = true;
      if (card.enables === 'overcharge') {
        run.overchargeEvery      = 8;
        run.shotsSinceOvercharge = 0;
      }
    }

    this.pool = this.pool.filter(c => c.id !== card.id);
  }

  reroll(run: RunState): CardDefinition[] | null {
    if (run.rerollsLeft <= 0) return null;
    run.rerollsLeft--;
    return this.draw(run);
  }

  private cardWeight(card: CardDefinition, run: RunState): number {
    if (!card.requiresId) return 1;
    return run.pickedCardIds.has(card.requiresId) ? 1 : PAYOFF_SUPPRESSED_WEIGHT;
  }

  private weightedRandom(weighted: { card: CardDefinition; weight: number }[]): CardDefinition | null {
    const total = weighted.reduce((sum, w) => sum + w.weight, 0);
    if (total === 0) return null;
    let r = this.rng() * total;
    for (const w of weighted) {
      r -= w.weight;
      if (r <= 0) return w.card;
    }
    return weighted[weighted.length - 1]?.card ?? null;
  }
}

function applyDelta(stats: ComputedStats, delta: StatDelta): void {
  if (delta.energyCapacity       !== undefined) stats.energyCapacity       += delta.energyCapacity;
  if (delta.energyRegenSec       !== undefined) stats.energyRegenSec       += delta.energyRegenSec;
  if (delta.frontDamage          !== undefined) stats.frontDamage          += delta.frontDamage;
  if (delta.frontEnergyCost      !== undefined) stats.frontEnergyCost      += delta.frontEnergyCost;
  if (delta.frontFireMs          !== undefined) stats.frontFireMs          += delta.frontFireMs;
  if (delta.shieldCapacity       !== undefined) stats.shieldCapacity       += delta.shieldCapacity;
  if (delta.shieldRegenSec       !== undefined) stats.shieldRegenSec       += delta.shieldRegenSec;
  if (delta.dodgeCost            !== undefined) stats.dodgeCost            += delta.dodgeCost;
  if (delta.spreadShotCost       !== undefined) stats.spreadShotCost       += delta.spreadShotCost;
  if (delta.heavyBeamCost        !== undefined) stats.heavyBeamCost        += delta.heavyBeamCost;
  if (delta.sideWeaponCooldownMs !== undefined) stats.sideWeaponCooldownMs += delta.sideWeaponCooldownMs;
}
