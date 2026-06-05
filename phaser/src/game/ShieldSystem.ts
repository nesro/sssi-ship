import type { ComputedStats } from './computeStats.js';
import type { EnergyManager } from './EnergyManager.js';

export class ShieldSystem {
  shieldHp: number;
  readonly maxShieldHp: number;
  private regenPerMs: number;
  broken: boolean = false;

  constructor(stats: ComputedStats) {
    this.maxShieldHp = stats.shieldCapacity;
    this.shieldHp    = stats.shieldCapacity;
    this.regenPerMs  = stats.shieldRegenSec / 1000;
  }

  update(deltaMs: number, energy: EnergyManager): void {
    if (this.shieldHp >= this.maxShieldHp) return;

    const wanted      = this.regenPerMs * deltaMs;
    const energyAvail = energy.energy;
    const actual      = Math.min(wanted, energyAvail);
    if (actual <= 0) return;

    energy.trySpend(actual);
    this.shieldHp = Math.min(this.maxShieldHp, this.shieldHp + actual);
  }

  absorbHit(damage: number, energy: EnergyManager): number {
    if (this.shieldHp <= 0) return damage;

    const absorbed  = Math.min(this.shieldHp, damage);
    this.shieldHp  -= absorbed;
    energy.trySpend(absorbed * 2);

    if (this.shieldHp <= 0) this.broken = true;

    return damage - absorbed;
  }

  get ratio(): number {
    return this.shieldHp / this.maxShieldHp;
  }
}
