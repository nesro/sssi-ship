import { describe, it, expect } from 'vitest';
import { computeStats } from '../game/computeStats.js';
import type { SaveData } from '../SaveManager.js';

function baseSave(override: Partial<SaveData> = {}): SaveData {
  return {
    version: 1,
    coins: 0,
    totalStarsEarned: 0,
    spendableStars: 0,
    welcomeSeen: true,
    debugEnabled: false,
    ship: { frontWeapon: null, leftWeapon: null, rightWeapon: null, generator: null, shields: null },
    inventory: {},
    talents: {},
    missions: {},
    daily: null,
    ...override,
  };
}

describe('computeStats — no gear', () => {
  const stats = computeStats(baseSave());

  it('uses fallback front damage', () => {
    expect(stats.frontDamage).toBe(8);
  });

  it('uses fallback energy capacity', () => {
    expect(stats.energyCapacity).toBe(60);
  });

  it('has no shield capacity', () => {
    expect(stats.shieldCapacity).toBe(0);
  });

  it('has no side weapons', () => {
    expect(stats.leftWeapon).toBeNull();
    expect(stats.rightWeapon).toBeNull();
  });
});

describe('computeStats — basic gear (laser_mk1 L1 + generator_mk1 L1)', () => {
  const save = baseSave({
    ship: { frontWeapon: 'laser_mk1', leftWeapon: null, rightWeapon: null, generator: 'generator_mk1', shields: null },
    inventory: { laser_mk1: { level: 1 }, generator_mk1: { level: 1 } },
  });
  const stats = computeStats(save);

  it('reads laser damage from item level', () => {
    expect(stats.frontDamage).toBe(10);
  });

  it('reads fire rate from item level', () => {
    expect(stats.frontFireMs).toBe(350);
  });

  it('reads energy capacity from generator', () => {
    expect(stats.energyCapacity).toBe(100);
  });

  it('reads energy regen from generator', () => {
    expect(stats.energyRegenSec).toBe(15);
  });
});

describe('computeStats — talent bonuses', () => {
  it('damage talent L1 increases frontDamage', () => {
    const save = baseSave({
      ship: { frontWeapon: 'laser_mk1', leftWeapon: null, rightWeapon: null, generator: null, shields: null },
      inventory: { laser_mk1: { level: 1 } },
      talents: { dmg_boost: 1, damage: 1 },
    });
    const stats = computeStats(save);
    // Base 10, dmg_boost ×1.04, damage L1 ×(1 + 0.08) = 10 * 1.04 * 1.08 ≈ 11.232
    expect(stats.frontDamage).toBeCloseTo(10 * 1.04 * 1.08, 3);
  });

  it('fire_rate talent reduces frontFireMs', () => {
    const save = baseSave({
      ship: { frontWeapon: 'laser_mk1', leftWeapon: null, rightWeapon: null, generator: null, shields: null },
      inventory: { laser_mk1: { level: 1 } },
      talents: { fire_rate: 1 },
    });
    const stats = computeStats(save);
    expect(stats.frontFireMs).toBeLessThan(350);
  });

  it('battery talent adds energy capacity', () => {
    const save = baseSave({
      ship: { frontWeapon: null, leftWeapon: null, rightWeapon: null, generator: 'generator_mk1', shields: null },
      inventory: { generator_mk1: { level: 1 } },
      talents: { bat_boost: 1 },
    });
    const stats = computeStats(save);
    // 100 base + 10 from bat_boost L1
    expect(stats.energyCapacity).toBe(110);
  });

  it('shield talent adds shield capacity', () => {
    const save = baseSave({
      ship: { frontWeapon: null, leftWeapon: null, rightWeapon: null, generator: null, shields: 'shield_mk1' },
      inventory: { shield_mk1: { level: 1 } },
      talents: { shd_boost: 1 },
    });
    const stats = computeStats(save);
    // 50 from item + 15 from shd_boost L1
    expect(stats.shieldCapacity).toBe(65);
  });
});

describe('computeStats — dodge_sense talent', () => {
  it('base dodgeLookaheadMs is 350 with no talent', () => {
    expect(computeStats(baseSave()).dodgeLookaheadMs).toBe(350);
  });

  it('dodge_sense L1 adds 50 ms to lookahead', () => {
    const save = baseSave({ talents: { dodge_sense: 1 } });
    expect(computeStats(save).dodgeLookaheadMs).toBe(400);
  });
});

describe('computeStats — side weapons', () => {
  it('recognises spread_shot in left slot', () => {
    const save = baseSave({
      ship: { frontWeapon: null, leftWeapon: 'spread_shot', rightWeapon: null, generator: null, shields: null },
      inventory: { spread_shot: { level: 1 } },
    });
    expect(computeStats(save).leftWeapon).toBe('spread');
  });

  it('recognises heavy_beam in right slot', () => {
    const save = baseSave({
      ship: { frontWeapon: null, leftWeapon: null, rightWeapon: 'heavy_beam', generator: null, shields: null },
      inventory: { heavy_beam: { level: 1 } },
    });
    expect(computeStats(save).rightWeapon).toBe('beam');
  });

  it('returns null for unequipped slots', () => {
    const stats = computeStats(baseSave());
    expect(stats.leftWeapon).toBeNull();
    expect(stats.rightWeapon).toBeNull();
  });
});
