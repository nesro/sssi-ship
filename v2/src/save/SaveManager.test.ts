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
  switchCost,
  switchItem,
  switchRearWeapon,
  switchShip,
  switchSideWeapon,
  totalStars,
  unequipShield,
} from './SaveManager';
import type { SaveData } from './SaveManager';
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
    let save = { ...defaultSave(), coins: 1000 };
    save = switchItem(save, 'shield-wall-2');
    expect(save.equipped.shield).toBe('shield-wall-2');
    expect(buildLoadout(save).shield?.id).toBe('shield-wall-2');
    // net cost = shield-wall-2.price - shield-wall-1.price (shield-wall-1 is the starter)
    const shield1Price = 0; // starters are free
    const shield2Price = 780;
    expect(save.coins).toBe(1000 - (shield2Price - shield1Price));
  });

  it('switchItem downgrade refunds the difference and replaces the previous item', () => {
    let save = { ...defaultSave(), coins: 3000 };
    save = switchItem(save, 'shield-wall-3'); // net cost 1700 (wall-1 starter is free)
    const coinsAfterUp = save.coins; // 3000 - 1700 = 1300
    save = switchItem(save, 'shield-wall-2'); // downgrade: refund = 1700-780=920
    expect(save.equipped.shield).toBe('shield-wall-2');
    expect(save.coins).toBe(coinsAfterUp + (1700 - 780));
  });

  it('switching to a new kind always pays the full trade-in cost — there is no owned-kind discount', () => {
    let save = { ...defaultSave(), coins: 5000 };
    save = switchItem(save, 'shield-reflex-2'); // cost 1950-0=1950
    const coinsAfterReflex = save.coins;
    save = switchItem(save, 'shield-wall-1'); // back to the starter: refund 1950
    expect(save.equipped.shield).toBe('shield-wall-1');
    expect(save.coins).toBe(coinsAfterReflex + 1950);
    // Switching back to reflex-2 pays the full 1950 again — there is no memory of
    // ever having owned it; only one shield can ever be owned at a time.
    save = switchItem(save, 'shield-reflex-2');
    expect(save.equipped.shield).toBe('shield-reflex-2');
    expect(save.coins).toBe(coinsAfterReflex);
  });

  it('switchItem is a no-op when already equipped', () => {
    const save = defaultSave();
    const shieldId = save.equipped.shield;
    if (shieldId === null) throw new Error('default save must have a shield equipped');
    const after = switchItem(save, shieldId);
    expect(after).toBe(save);
  });

  it('refuses switchItem without enough coins', () => {
    // wall-3 net cost is 1700-780=920; give coins enough for wall-2 but not wall-3
    const save = { ...defaultSave(), coins: 400, equipped: { ...defaultSave().equipped, shield: 'shield-wall-2' } };
    expect(() => switchItem(save, 'shield-wall-3')).toThrow(/Not enough coins/);
  });
});

describe('shop transactions — ships, migrations, supplies', () => {
  it('switchShip deducts net cost and equips it', () => {
    let save = { ...defaultSave(), coins: 1500 };
    // ship-salvager-1 costs 480; interceptor-1 (starter) costs 0 → net 480
    save = switchShip(save, 'ship-salvager-1');
    expect(save.equipped.ship).toBe('ship-salvager-1');
    expect(save.coins).toBe(1020);
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

  it('migrates a v8 save by appending level suffix to ship IDs and dropping ownedItems', () => {
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
    const save = loadSave() as SaveData & { ownedItems?: string[] };
    expect(save.equipped.ship).toBe('ship-interceptor-1');
    expect(save.ownedItems).toBeUndefined();
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

describe('switchCost', () => {
  it('upgrade', () => {
    expect(switchCost(200, 100)).toBe(100);
  });

  it('downgrade', () => {
    expect(switchCost(100, 200)).toBe(-100);
  });

  it('equal price switch is free', () => {
    expect(switchCost(200, 200)).toBe(0);
  });
});

describe('single-ownership model — a system only ever owns whatever is equipped', () => {
  it('unequipShield refunds the equipped item\'s full price — same trade-in model as any other switch', () => {
    let save = { ...defaultSave(), coins: 2000 };
    save = switchItem(save, 'shield-wall-2'); // cost 780-0=780, coins now 1220
    save = unequipShield(save);
    expect(save.equipped.shield).toBeNull();
    expect(save.coins).toBe(2000); // full 780 refunded
  });

  it('unequipping then re-equipping the same item pays the trade-in cost again — nothing is remembered as owned', () => {
    let save = { ...defaultSave(), coins: 2000 };
    save = switchItem(save, 'shield-wall-2'); // cost 780-0=780
    save = unequipShield(save); // refunds 780
    const coinsAfterUnequip = save.coins;
    save = switchItem(save, 'shield-wall-2'); // pays the full 780 again, not free
    expect(save.equipped.shield).toBe('shield-wall-2');
    expect(save.coins).toBe(coinsAfterUnequip - 780);
  });

  it('switching to a different kind always uses the trade-in formula against whatever is currently equipped', () => {
    let save = { ...defaultSave(), coins: 5000 };
    save = switchItem(save, 'shield-reflex-2'); // cost 1950-0=1950
    const coinsAfterReflex = save.coins;
    save = switchItem(save, 'shield-wall-2'); // cheaper (780) → refund 1170
    expect(save.equipped.shield).toBe('shield-wall-2');
    expect(save.coins).toBe(coinsAfterReflex + (1950 - 780));
  });
});

describe('switchRearWeapon — destructive switch, single ownership', () => {
  it('unequipping (null) refunds the equipped rear weapon\'s full price', () => {
    let save = { ...defaultSave(), coins: 5000 };
    save = switchRearWeapon(save, 'grenade-3'); // cost 690, coins now 4310
    save = switchRearWeapon(save, null);
    expect(save.equipped.rearWeapon).toBeNull();
    expect(save.coins).toBe(5000); // full 690 refunded
  });

  it('unequipping then re-equipping the same kind/level pays the trade-in cost again', () => {
    let save = { ...defaultSave(), coins: 5000 };
    save = switchRearWeapon(save, 'grenade-3'); // cost 690 (rearWeapon starts unequipped)
    save = switchRearWeapon(save, null); // unequip (NONE), refunds 690
    const coinsBefore = save.coins;
    save = switchRearWeapon(save, 'grenade-3'); // pays the full 690 again
    expect(save.equipped.rearWeapon).toBe('grenade-3');
    expect(save.coins).toBe(coinsBefore - 690);
  });

  it('switching to a different kind discards the previous one and trades in against it', () => {
    let save = { ...defaultSave(), coins: 5000 };
    save = switchRearWeapon(save, 'grenade-4'); // cost 1500
    const coinsAfterGrenade = save.coins;
    save = switchRearWeapon(save, 'flak-1'); // cost 890-1500=-610 → refund 610
    expect(save.equipped.rearWeapon).toBe('flak-1');
    expect(save.coins).toBe(coinsAfterGrenade + 610);
  });
});

describe('switchSideWeapon — destructive switch, single ownership', () => {
  it('unequipping (null) refunds the equipped side weapon\'s full price', () => {
    let save = { ...defaultSave(), coins: 5000 };
    save = switchSideWeapon(save, 'focus-3'); // cost 1700, coins now 3300
    save = switchSideWeapon(save, null);
    expect(save.equipped.sideWeapon).toBeNull();
    expect(save.coins).toBe(5000); // full 1700 refunded
  });

  it('unequipping then re-equipping the same kind/level pays the trade-in cost again', () => {
    let save = { ...defaultSave(), coins: 5000 };
    save = switchSideWeapon(save, 'focus-3'); // cost 1700 (sideWeapon starts unequipped)
    save = switchSideWeapon(save, null); // unequip (NONE), refunds 1700
    const coinsBefore = save.coins;
    save = switchSideWeapon(save, 'focus-3'); // pays the full 1700 again
    expect(save.equipped.sideWeapon).toBe('focus-3');
    expect(save.coins).toBe(coinsBefore - 1700);
  });

  it('switching to a different kind discards the previous one and trades in against it', () => {
    let save = { ...defaultSave(), coins: 5000 };
    save = switchSideWeapon(save, 'focus-4'); // cost 3750
    const coinsAfterFocus = save.coins;
    save = switchSideWeapon(save, 'flechette-1'); // cost 890-3750=-2860 → refund 2860
    expect(save.equipped.sideWeapon).toBe('flechette-1');
    expect(save.coins).toBe(coinsAfterFocus + 2860);
  });

  it('refuses to equip an unaffordable side weapon', () => {
    const save = { ...defaultSave(), coins: 100 };
    expect(() => switchSideWeapon(save, 'orbital-5')).toThrow(/Not enough coins/);
  });
});
