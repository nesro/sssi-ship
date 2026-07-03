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
    save = switchItem(save, 'shield-wall-2');
    expect(save.equipped.shield).toBe('shield-wall-2');
    expect(buildLoadout(save).shield?.id).toBe('shield-wall-2');
    // net cost = shield-wall-2.price - shield-wall-1.price (shield-wall-1 is the starter)
    const shield1Price = 0; // starters are free
    const shield2Price = 300;
    expect(save.coins).toBe(500 - (shield2Price - shield1Price));
  });

  it('switchItem downgrade refunds the difference and removes the traded-in item', () => {
    let save = { ...defaultSave(), coins: 2000 };
    save = switchItem(save, 'shield-wall-2'); // buy wall-2 (net cost 300)
    save = switchItem(save, 'shield-wall-3'); // upgrade to wall-3 (net cost 450)
    const coinsAfterUp = save.coins; // 2000 - 300 - 450 = 1250
    save = switchItem(save, 'shield-wall-2'); // downgrade: refund = wall-3.price - wall-2.price = 450
    expect(save.equipped.shield).toBe('shield-wall-2');
    expect(save.coins).toBe(coinsAfterUp + (750 - 300));
    expect(save.ownedItems).not.toContain('shield-wall-3');
  });

  it('switchItem is a no-op when already equipped', () => {
    const save = defaultSave();
    const shieldId = save.equipped.shield;
    if (shieldId === null) throw new Error('default save must have a shield equipped');
    const after = switchItem(save, shieldId);
    expect(after).toBe(save);
  });

  it('refuses switchItem without enough coins', () => {
    // wall-3 net cost is 750-300=450; give coins enough for wall-2 but not wall-3
    const save = { ...defaultSave(), coins: 400, ownedItems: [...defaultSave().ownedItems, 'shield-wall-2'] };
    expect(() => switchItem(save, 'shield-wall-3')).toThrow(/Not enough coins/);
  });

  it('switchShip deducts net cost and equips it', () => {
    let save = { ...defaultSave(), coins: 1500 };
    // ship-salvager-1 costs 900; interceptor-1 (starter) costs 0 → net 900
    save = switchShip(save, 'ship-salvager-1');
    expect(save.equipped.ship).toBe('ship-salvager-1');
    expect(save.coins).toBe(600);
    expect(buildLoadout(save).ship.id).toBe('ship-salvager-1');
  });

  it('switchShip is a no-op when already equipped', () => {
    const save = defaultSave();
    const after = switchShip(save, save.equipped.ship);
    expect(after).toBe(save);
  });

  it('switchShip refuses without enough coins', () => {
    expect(() => switchShip(defaultSave(), 'ship-warship-1')).toThrow(/Not enough coins/);
  });

  it('buildLoadout returns the ship spec matching equipped.ship', () => {
    const save = defaultSave();
    const loadout = buildLoadout(save);
    expect(loadout.ship.id).toBe('ship-interceptor-1');
    expect(loadout.ship.hull).toBe(80);
  });

  it('migrates a v3 save to add ship = ship-interceptor-1', () => {
    const v3Save = {
      version: 3,
      coins: 500,
      equipped: { weapon: 'pulse-1', shield: 'shield-1', generator: 'generator-1', motor: 'motor-1' },
      missionStars: {},
      ownedSupplyCharges: {},
    };
    localStorage.setItem('nesro-nova-v2-save', JSON.stringify(v3Save));
    const save = loadSave();
    expect(save.equipped.ship).toBe('ship-interceptor-1');
    expect(save.coins).toBe(500);
  });

  it('migrates a v8 save by appending level suffix to ship IDs', () => {
    const v8Save = {
      version: 8,
      coins: 300,
      equipped: { ship: 'ship-interceptor', weapon: 'pulse-1', rearWeapon: null, shield: 'shield-1', generator: 'generator-1', motor: 'motor-1' },
      missionStars: {},
      ownedItems: ['ship-interceptor', 'ship-salvager', 'pulse-1', 'shield-1', 'generator-1', 'motor-1'],
      ownedSupplyCharges: {},
      ownedSubscriptions: {},
      w0Completed: false,
    };
    localStorage.setItem('nesro-nova-v2-save', JSON.stringify(v8Save));
    const save = loadSave();
    expect(save.equipped.ship).toBe('ship-interceptor-1');
    expect(save.ownedItems).toContain('ship-interceptor-1');
    expect(save.ownedItems).toContain('ship-salvager-1');
    expect(save.ownedItems).not.toContain('ship-interceptor');
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
