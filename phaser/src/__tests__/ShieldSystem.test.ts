import { describe, it, expect } from 'vitest';
import { ShieldSystem } from '../game/ShieldSystem.js';
import { EnergyManager } from '../game/EnergyManager.js';
import type { ComputedStats } from '../game/computeStats.js';

function makeStats(shieldCap: number, shieldRegen: number, energyCap = 100): ComputedStats {
  return {
    energyCapacity: energyCap,
    energyRegenSec: 0,
    hasFrontWeapon: false, frontDamage: 10, frontEnergyCost: 5, frontFireMs: 350,
    hasShield: shieldCap > 0, shieldCapacity: shieldCap,
    shieldRegenSec: shieldRegen,
    dodgeCost: 10, dodgeLookaheadMs: 350,
    leftWeapon: null, rightWeapon: null,
    spreadShotCost: 20, heavyBeamCost: 30, sideWeaponCooldownMs: 5000,
  };
}

describe('ShieldSystem', () => {
  it('starts at full capacity', () => {
    const shields = new ShieldSystem(makeStats(50, 5));
    expect(shields.shieldHp).toBe(50);
    expect(shields.maxShieldHp).toBe(50);
    expect(shields.ratio).toBe(1);
    expect(shields.broken).toBe(false);
  });

  describe('absorbHit', () => {
    it('full absorption when shield HP >= damage', () => {
      const shields = new ShieldSystem(makeStats(50, 0));
      const energy  = new EnergyManager(makeStats(50, 0, 100));
      const hullDmg = shields.absorbHit(5, energy);
      expect(hullDmg).toBe(0);
      expect(shields.shieldHp).toBe(45);
    });

    it('passes overflow damage to hull when shield is depleted', () => {
      const shields = new ShieldSystem(makeStats(3, 0));
      const energy  = new EnergyManager(makeStats(3, 0, 100));
      const hullDmg = shields.absorbHit(10, energy);
      expect(hullDmg).toBe(7);
      expect(shields.shieldHp).toBe(0);
    });

    it('marks shield as broken when HP reaches 0', () => {
      const shields = new ShieldSystem(makeStats(5, 0));
      const energy  = new EnergyManager(makeStats(5, 0, 100));
      shields.absorbHit(5, energy);
      expect(shields.broken).toBe(true);
    });

    it('passes all damage to hull when shield is empty', () => {
      const shields = new ShieldSystem(makeStats(0, 0));
      const energy  = new EnergyManager(makeStats(0, 0, 100));
      const hullDmg = shields.absorbHit(10, energy);
      expect(hullDmg).toBe(10);
    });

    it('consumes 2 energy per shield HP absorbed', () => {
      const shields = new ShieldSystem(makeStats(50, 0));
      const energy  = new EnergyManager(makeStats(50, 0, 100));
      const before  = energy.energy;
      shields.absorbHit(5, energy);
      expect(energy.energy).toBeCloseTo(before - 5 * 2, 5);
    });
  });

  describe('update (regen)', () => {
    it('does not regenerate when at full HP', () => {
      const shields = new ShieldSystem(makeStats(50, 10));
      const energy  = new EnergyManager(makeStats(50, 0, 100));
      const before  = shields.shieldHp;
      shields.update(1000, energy);
      expect(shields.shieldHp).toBe(before);
    });

    it('regenerates shield HP over time, spending energy', () => {
      const shields = new ShieldSystem(makeStats(50, 10));
      const energy  = new EnergyManager(makeStats(50, 0, 100));
      shields.absorbHit(20, energy);       // drain shield to 30, spend 40 energy → 60 remaining
      const energyBefore = energy.energy;
      shields.update(1000, energy);        // 1 s → regen 10 HP
      expect(shields.shieldHp).toBeGreaterThan(30);
      expect(energy.energy).toBeLessThan(energyBefore);
    });
  });
});
