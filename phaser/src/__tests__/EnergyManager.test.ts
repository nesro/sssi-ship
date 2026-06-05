import { describe, it, expect } from 'vitest';
import { EnergyManager } from '../game/EnergyManager.js';
import type { ComputedStats } from '../game/computeStats.js';

function makeStats(capacity: number, regenSec: number): ComputedStats {
  return {
    energyCapacity: capacity,
    energyRegenSec: regenSec,
    hasFrontWeapon: false, frontDamage: 10, frontEnergyCost: 5, frontFireMs: 350,
    hasShield: false, shieldCapacity: 0, shieldRegenSec: 0,
    dodgeCost: 10, dodgeLookaheadMs: 350,
    leftWeapon: null, rightWeapon: null,
    spreadShotCost: 20, heavyBeamCost: 30, sideWeaponCooldownMs: 5000,
  };
}

describe('EnergyManager', () => {
  it('starts at full capacity', () => {
    const mgr = new EnergyManager(makeStats(100, 10));
    expect(mgr.energy).toBe(100);
    expect(mgr.capacity).toBe(100);
    expect(mgr.ratio).toBe(1);
  });

  it('trySpend returns false and does not spend when insufficient', () => {
    const mgr = new EnergyManager(makeStats(100, 0));
    expect(mgr.trySpend(101)).toBe(false);
    expect(mgr.energy).toBe(100);
  });

  it('trySpend deducts energy on success', () => {
    const mgr = new EnergyManager(makeStats(100, 0));
    expect(mgr.trySpend(30)).toBe(true);
    expect(mgr.energy).toBe(70);
  });

  it('update() regenerates energy up to capacity', () => {
    const mgr = new EnergyManager(makeStats(100, 10)); // 10 energy/sec → 10/ms
    mgr.trySpend(50);  // drain to 50
    mgr.update(5000);  // 5 s → +50 energy
    expect(mgr.energy).toBe(100);
  });

  it('update() does not exceed capacity', () => {
    const mgr = new EnergyManager(makeStats(100, 100));
    mgr.update(10000);  // massive delta
    expect(mgr.energy).toBe(100);
  });

  it('ratio reflects current energy level', () => {
    const mgr = new EnergyManager(makeStats(200, 0));
    mgr.trySpend(100);
    expect(mgr.ratio).toBeCloseTo(0.5, 5);
  });
});
