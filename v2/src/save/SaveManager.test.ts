// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyMissionResult,
  buildLoadout,
  buySupplyCharge,
  defaultSave,
  isMissionUnlocked,
  loadSave,
  persistSave,
  resetSave,
  switchItem,
  switchShip,
  totalStars,
} from './SaveManager';
import type { MissionResult } from '../core/result';

function victoryResult(overrides: Partial<MissionResult> = {}): MissionResult {
  return {
    missionId: 'm1',
    status: 'victory',
    durationTicks: 300,
    earnedStarIds: ['m1-hull-50', 'm1-shield'],
    coins: 100,
    hullFraction: 0.8,
    weaponKills: 10,
    spawned: 10,
    collisions: 0,
    ...overrides,
  };
}

beforeEach(() => {
  resetSave();
});

describe('loadSave', () => {
  it('returns defaults when nothing is stored', () => {
    const save = loadSave();
    expect(save.coins).toBe(0);
    expect(save.equipped.weapon).toBe('pulse-1');
  });

  it('round-trips through localStorage', () => {
    const save = { ...defaultSave(), coins: 123 };
    persistSave(save);
    expect(loadSave().coins).toBe(123);
  });

  it('falls back to defaults on corrupt data', () => {
    localStorage.setItem('nesro-nova-v2-save', '{not json');
    expect(loadSave().coins).toBe(0);
  });

  it('falls back to defaults on a version mismatch', () => {
    localStorage.setItem('nesro-nova-v2-save', JSON.stringify({ version: 99, coins: 5000 }));
    expect(loadSave().coins).toBe(0);
  });
});

describe('applyMissionResult', () => {
  it('adds coins and new stars', () => {
    const { save, newStarIds } = applyMissionResult(defaultSave(), victoryResult());
    expect(save.coins).toBe(100);
    expect(newStarIds).toEqual(['m1-hull-50', 'm1-shield']);
    expect(totalStars(save)).toBe(2);
  });

  it('w0 sets w0Completed and adds coins, no stars', () => {
    const result = victoryResult({ missionId: 'w0', earnedStarIds: [] });
    const { save, newStarIds } = applyMissionResult(defaultSave(), result);
    expect(save.w0Completed).toBe(true);
    expect(save.coins).toBe(100);
    expect(newStarIds).toEqual([]);
  });

  it('replays pay full coins but only newly earned stars count', () => {
    const first = applyMissionResult(defaultSave(), victoryResult()).save;
    const { save, newStarIds } = applyMissionResult(first, victoryResult());
    expect(save.coins).toBe(200);
    expect(newStarIds).toEqual([]);
    expect(totalStars(save)).toBe(2);
  });
});

describe('mission gating', () => {
  it('m1 is open from the start; m3 needs stars', () => {
    const save = defaultSave();
    expect(isMissionUnlocked(save, 'm1')).toBe(true);
    expect(isMissionUnlocked(save, 'm3')).toBe(false);
  });
});

describe('shop transactions', () => {
  it('switchItem to pricier item deducts net cost and equips it', () => {
    let save = { ...defaultSave(), coins: 500 };
    save = switchItem(save, 'shield-2');
    expect(save.equipped.shield).toBe('shield-2');
    expect(buildLoadout(save).shield.id).toBe('shield-2');
    // net cost = shield-2.price - shield-1.price (shield-1 is the starter)
    const shield1Price = 0; // pulse-1 / shield-1 starters are free
    const shield2Price = 250;
    expect(save.coins).toBe(500 - (shield2Price - shield1Price));
  });

  it('switchItem to cheaper item refunds the difference', () => {
    let save = { ...defaultSave(), coins: 1000 };
    save = switchItem(save, 'shield-3'); // buy up
    const coinsAfterUp = save.coins;
    save = switchItem(save, 'shield-2'); // downgrade
    expect(save.equipped.shield).toBe('shield-2');
    expect(save.coins).toBeGreaterThan(coinsAfterUp); // got a refund
  });

  it('switchItem is a no-op when already equipped', () => {
    const save = defaultSave();
    const after = switchItem(save, save.equipped.shield);
    expect(after).toBe(save);
  });

  it('refuses switchItem without enough coins', () => {
    expect(() => switchItem(defaultSave(), 'shield-3')).toThrow(/Not enough coins/);
  });

  it('switchShip deducts net cost and equips it', () => {
    let save = { ...defaultSave(), coins: 1500 };
    // ship-salvager costs 900; interceptor (starter) costs 0 → net 900
    save = switchShip(save, 'ship-salvager');
    expect(save.equipped.ship).toBe('ship-salvager');
    expect(save.coins).toBe(600);
    expect(buildLoadout(save).ship.id).toBe('ship-salvager');
  });

  it('switchShip is a no-op when already equipped', () => {
    const save = defaultSave();
    const after = switchShip(save, save.equipped.ship);
    expect(after).toBe(save);
  });

  it('switchShip refuses without enough coins', () => {
    expect(() => switchShip(defaultSave(), 'ship-warship')).toThrow(/Not enough coins/);
  });

  it('buildLoadout returns the ship spec matching equipped.ship', () => {
    const save = defaultSave();
    const loadout = buildLoadout(save);
    expect(loadout.ship.id).toBe('ship-interceptor');
    expect(loadout.ship.hull).toBe(80);
  });

  it('migrates a v3 save to add ship = ship-interceptor', () => {
    const v3Save = {
      version: 3,
      coins: 500,
      equipped: { weapon: 'pulse-1', shield: 'shield-1', generator: 'generator-1', motor: 'motor-1' },
      missionStars: {},
      ownedSupplyCharges: {},
    };
    localStorage.setItem('nesro-nova-v2-save', JSON.stringify(v3Save));
    const save = loadSave();
    expect(save.equipped.ship).toBe('ship-interceptor');
    expect(save.coins).toBe(500);
  });

  it('supply charges cap at maxCharges and appear in the loadout', () => {
    let save = { ...defaultSave(), coins: 10000 };
    save = buySupplyCharge(save, 'sup-shield');
    save = buySupplyCharge(save, 'sup-shield');
    save = buySupplyCharge(save, 'sup-shield');
    expect(() => buySupplyCharge(save, 'sup-shield')).toThrow(/max charges/);
    const loadout = buildLoadout(save);
    expect(loadout.supplies).toEqual([
      expect.objectContaining({ charges: 3 }),
    ]);
  });
});
