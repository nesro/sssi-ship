import type { ComputedStats } from './computeStats.js';

export class EnergyManager {
  energy: number;
  readonly capacity: number;
  private regenPerMs: number;

  constructor(stats: ComputedStats) {
    this.capacity   = stats.energyCapacity;
    this.energy     = stats.energyCapacity;
    this.regenPerMs = stats.energyRegenSec / 1000;
  }

  update(deltaMs: number): void {
    this.energy = Math.min(this.capacity, this.energy + this.regenPerMs * deltaMs);
  }

  trySpend(amount: number): boolean {
    if (this.energy < amount) return false;
    this.energy -= amount;
    return true;
  }

  get ratio(): number {
    return this.energy / this.capacity;
  }
}
