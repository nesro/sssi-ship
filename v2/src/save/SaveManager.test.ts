// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DAILY_COIN_MULT,
  acceptOnboarding,
  applyDailyResult,
  applyMissionResult,
  buildLoadout,
  buySupplyCharge,
  dailyBestScore,
  defaultSave,
  hasCompletedCampaign,
  isDailyAvailable,
  isMissionUnlocked,
  loadSave,
  persistSave,
  reserveDailyAttempt,
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
import { DAILY_MISSION_ID } from '../data/dailyMission';

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

  it('sets t2FailedOnce on a t2 defeat, not on a t2 victory or any other mission', () => {
    const afterM1Loss = applyMissionResult(defaultSave(), victoryResult({ missionId: 'm1', status: 'defeat' })).save;
    expect(afterM1Loss.t2FailedOnce).toBeUndefined();

    const afterT2Win = applyMissionResult(defaultSave(), victoryResult({ missionId: 't2', status: 'victory' })).save;
    expect(afterT2Win.t2FailedOnce).toBeUndefined();

    const afterT2Loss = applyMissionResult(defaultSave(), victoryResult({ missionId: 't2', status: 'defeat' })).save;
    expect(afterT2Loss.t2FailedOnce).toBe(true);
  });
});

describe('mission gating', () => {
  it('t1 is unlocked from the start; m1 stays locked until the whole tutorial chain clears', () => {
    const save = defaultSave();
    expect(isMissionUnlocked(save, 't1')).toBe(true);
    expect(isMissionUnlocked(save, 'm1')).toBe(false);

    const { save: afterT1 } = applyMissionResult(save, victoryResult({ missionId: 't1', earnedStarIds: [] }));
    expect(isMissionUnlocked(afterT1, 't2')).toBe(true);
    expect(isMissionUnlocked(afterT1, 'm1')).toBe(false);

    const { save: afterT4 } = applyMissionResult(
      { ...afterT1, completedMissionIds: ['t1', 't2', 't3'] },
      victoryResult({ missionId: 't4', earnedStarIds: [] }),
    );
    expect(isMissionUnlocked(afterT4, 'm1')).toBe(true);
    expect(isMissionUnlocked(afterT4, 'm2')).toBe(false);
  });

  it('a loss does not unlock the next mission (non-tutorial — t1-t4 are the deliberate exception, see below)', () => {
    const { save: afterLoss } = applyMissionResult(
      defaultSave(),
      victoryResult({ missionId: 'm1', status: 'defeat', earnedStarIds: [] }),
    );
    expect(isMissionUnlocked(afterLoss, 'm2')).toBe(false);
  });

  it('a tutorial loss still unlocks the next mission and pays full completion coins (completesOnDefeat)', () => {
    const before = defaultSave();
    const { save: afterLoss } = applyMissionResult(
      before,
      victoryResult({ missionId: 't1', status: 'defeat', earnedStarIds: [], coins: 30 }),
    );
    expect(isMissionUnlocked(afterLoss, 't2')).toBe(true);
    expect(afterLoss.coins).toBe(before.coins + 30);
  });

  it('a non-tutorial mission never unlocks the next one on defeat, even repeatedly (regression guard)', () => {
    const { save: afterLoss } = applyMissionResult(
      defaultSave(),
      victoryResult({ missionId: 'm1', status: 'defeat', earnedStarIds: [] }),
    );
    const { save: afterSecondLoss } = applyMissionResult(
      afterLoss,
      victoryResult({ missionId: 'm1', status: 'defeat', earnedStarIds: [] }),
    );
    expect(isMissionUnlocked(afterSecondLoss, 'm2')).toBe(false);
  });

  it('unlock chains through the main missions regardless of stars earned (§9)', () => {
    let save = defaultSave();
    for (const missionId of ['t1', 'm1', 'm2']) {
      ({ save } = applyMissionResult(save, victoryResult({ missionId, earnedStarIds: [] })));
    }
    expect(isMissionUnlocked(save, 'm3')).toBe(true);
    expect(isMissionUnlocked(save, 'm4')).toBe(false);
  });
});

describe('onboarding', () => {
  it('a fresh save has not seen onboarding', () => {
    expect(defaultSave().onboardingSeen).toBeUndefined();
  });

  it('acceptOnboarding only sets the seen flag — no other mutation, tutorials stay playable', () => {
    const save = defaultSave();
    const after = acceptOnboarding(save);
    expect(after.onboardingSeen).toBe(true);
    expect(after.completedMissionIds).toEqual([]);
    expect(after.coins).toBe(save.coins);
    expect(isMissionUnlocked(after, 'm1')).toBe(false);
  });

});

describe('hasCompletedCampaign', () => {
  it('false on a fresh save', () => {
    expect(hasCompletedCampaign(defaultSave())).toBe(false);
  });

  it('false after beating an earlier mission, only true once m6 is in completedMissionIds', () => {
    const { save: afterM1 } = applyMissionResult(defaultSave(), victoryResult({ missionId: 'm1', earnedStarIds: [] }));
    expect(hasCompletedCampaign(afterM1)).toBe(false);
    const { save: afterM6 } = applyMissionResult(afterM1, victoryResult({ missionId: 'm6', earnedStarIds: [] }));
    expect(hasCompletedCampaign(afterM6)).toBe(true);
  });
});

describe('shop transactions', () => {
  it('switchItem to pricier item deducts net cost and equips it', () => {
    let save = { ...defaultSave(), coins: 1000 };
    save = switchItem(save, 'shield-wall-2');
    expect(save.equipped.shield).toBe('shield-wall-2');
    expect(buildLoadout(save).shield?.id).toBe('shield-wall-2');
    // net cost = shield-wall-2.price - shield-wall-1.price (shield-wall-1 is the starter)
    const shield1Price = 80; // starters are priced low, never 0 (0 is reserved for NONE)
    const shield2Price = 780;
    expect(save.coins).toBe(1000 - (shield2Price - shield1Price));
  });

  it('switchItem downgrade refunds the difference and replaces the previous item', () => {
    let save = { ...defaultSave(), coins: 3000 };
    save = switchItem(save, 'shield-wall-3'); // net cost 1700-80=1620 (wall-1 starter costs 80)
    const coinsAfterUp = save.coins; // 3000 - 1620 = 1380
    save = switchItem(save, 'shield-wall-2'); // downgrade: refund = 1700-780=920
    expect(save.equipped.shield).toBe('shield-wall-2');
    expect(save.coins).toBe(coinsAfterUp + (1700 - 780));
  });

  it('switching to a new kind always pays the full trade-in cost — there is no owned-kind discount', () => {
    let save = { ...defaultSave(), coins: 5000 };
    save = switchItem(save, 'shield-reflex-2'); // cost 780-80=700 (wall-1 starter costs 80; kinds share one price ladder)
    const coinsAfterReflex = save.coins;
    save = switchItem(save, 'shield-wall-1'); // back to the starter: refund 780-80=700
    expect(save.equipped.shield).toBe('shield-wall-1');
    expect(save.coins).toBe(coinsAfterReflex + 700);
    // Switching back to reflex-2 pays the full 780 again — there is no memory of
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
    // ship-salvager-3 costs 930; interceptor-1 (starter) costs 0 → net 930
    save = switchShip(save, 'ship-salvager-3');
    expect(save.equipped.ship).toBe('ship-salvager-3');
    expect(save.coins).toBe(570);
    expect(buildLoadout(save).ship.id).toBe('ship-salvager-3');
  });

  it('switchShip is a no-op when already equipped', () => {
    const save = defaultSave();
    const after = switchShip(save, save.equipped.ship);
    expect(after).toBe(save);
  });

  it('switchShip refuses without enough coins', () => {
    expect(() => switchShip(defaultSave(), 'ship-warship-5')).toThrow(/Not enough coins/);
  });

  it('buildLoadout returns the ship spec matching equipped.ship', () => {
    const save = defaultSave();
    const loadout = buildLoadout(save);
    expect(loadout.ship.id).toBe('ship-interceptor-1');
    expect(loadout.ship.hull).toBe(80);
  });

  it('an old-version save (v3, pre-dates the current shape) resets to defaultSave rather than migrating', () => {
    const v3Save = {
      version: 3,
      coins: 500,
      equipped: { weapon: 'pulse-1', shield: 'shield-1', generator: 'generator-1', motor: 'motor-1' },
      missionStars: {},
      ownedSupplyCharges: {},
    };
    localStorage.setItem('nesro-nova-v2-save', JSON.stringify(v3Save));
    const save = loadSave();
    expect(save).toEqual(defaultSave());
    expect(save.coins).toBe(0);
  });

  it('an old-version save (v8, pre-dates the current shape) resets to defaultSave rather than migrating', () => {
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
    expect(save).toEqual(defaultSave());
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
    save = switchItem(save, 'shield-wall-2'); // cost 780-80=700 (wall-1 starter costs 80), coins now 1300
    save = unequipShield(save);
    expect(save.equipped.shield).toBeNull();
    // unequip always refunds the equipped item's full price (780), not the net cost paid to
    // reach it (700) — so this nets +80 (wall-1's price) over the starting 2000.
    expect(save.coins).toBe(2080);
  });

  it('unequipping then re-equipping the same item pays the trade-in cost again — nothing is remembered as owned', () => {
    let save = { ...defaultSave(), coins: 2000 };
    save = switchItem(save, 'shield-wall-2'); // cost 780-80=700 (wall-1 starter costs 80)
    save = unequipShield(save); // refunds 700
    const coinsAfterUnequip = save.coins;
    save = switchItem(save, 'shield-wall-2'); // nothing equipped now, so pays the full 780 again
    expect(save.equipped.shield).toBe('shield-wall-2');
    expect(save.coins).toBe(coinsAfterUnequip - 780);
  });

  it('switching to a different kind always uses the trade-in formula against whatever is currently equipped', () => {
    let save = { ...defaultSave(), coins: 5000 };
    save = switchItem(save, 'shield-reflex-3'); // cost 1700-80=1620 (wall-1 starter costs 80)
    const coinsAfterReflex = save.coins;
    save = switchItem(save, 'shield-wall-2'); // cheaper (780) → refund 920
    expect(save.equipped.shield).toBe('shield-wall-2');
    expect(save.coins).toBe(coinsAfterReflex + (1700 - 780));
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
    save = switchRearWeapon(save, 'flak-1'); // cost 30-1500=-1470 → refund 1470 (kinds share one price ladder)
    expect(save.equipped.rearWeapon).toBe('flak-1');
    expect(save.coins).toBe(coinsAfterGrenade + 1470);
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
    save = switchSideWeapon(save, 'flechette-1'); // cost 80-3750=-3670 → refund 3670 (kinds share one price ladder)
    expect(save.equipped.sideWeapon).toBe('flechette-1');
    expect(save.coins).toBe(coinsAfterFocus + 3670);
  });

  it('refuses to equip an unaffordable side weapon', () => {
    const save = { ...defaultSave(), coins: 100 };
    expect(() => switchSideWeapon(save, 'orbital-5')).toThrow(/Not enough coins/);
  });
});

describe('daily mission', () => {
  function dailyResult(overrides: Partial<MissionResult> = {}): MissionResult {
    return {
      missionId: DAILY_MISSION_ID,
      status: 'defeat',
      durationTicks: 6000,
      earnedStarIds: [],
      coins: 400,
      hullFraction: 0,
      weaponKills: 80,
      spawned: 90,
      collisions: 10,
      ...overrides,
    };
  }

  it('is available on a fresh save', () => {
    expect(isDailyAvailable(defaultSave(), '2026-07-14')).toBe(true);
    expect(dailyBestScore(defaultSave())).toBe(0);
  });

  describe('reserveDailyAttempt', () => {
    it('marks today unavailable immediately, before any result is applied', () => {
      const save = defaultSave();
      const reserved = reserveDailyAttempt(save, '2026-07-14');
      expect(isDailyAvailable(reserved, '2026-07-14')).toBe(false);
      // Closes the force-quit exploit found in design review: reserving alone (no
      // payout yet) still consumes the day — a crash mid-run costs the attempt.
      expect(reserved.coins).toBe(save.coins);
    });

    it('carries the previous bestScore forward unchanged', () => {
      const save = { ...defaultSave(), daily: { lastPlayedDate: '2026-07-10', bestScore: 900, paid: true } };
      const reserved = reserveDailyAttempt(save, '2026-07-14');
      expect(dailyBestScore(reserved)).toBe(900);
    });
  });

  it('pays out DAILY_COIN_MULT × the run score and records the day as played', () => {
    const save = { ...defaultSave(), coins: 1000 };
    const reserved = reserveDailyAttempt(save, '2026-07-14');
    const { save: next, coinsAwarded, isNewBest } = applyDailyResult(reserved, dailyResult({ coins: 400 }), '2026-07-14');
    expect(coinsAwarded).toBe(Math.round(400 * DAILY_COIN_MULT));
    expect(next.coins).toBe(1000 + coinsAwarded);
    expect(isNewBest).toBe(true);
    expect(dailyBestScore(next)).toBe(400);
    expect(isDailyAvailable(next, '2026-07-14')).toBe(false);
  });

  it('never touches completedMissionIds or missionStars — not part of the campaign graph', () => {
    const save = defaultSave();
    const reserved = reserveDailyAttempt(save, '2026-07-14');
    const { save: next } = applyDailyResult(reserved, dailyResult(), '2026-07-14');
    expect(next.completedMissionIds).toEqual(save.completedMissionIds);
    expect(next.missionStars).toEqual(save.missionStars);
  });

  it('is available again on a new calendar day', () => {
    const save = defaultSave();
    const reserved = reserveDailyAttempt(save, '2026-07-14');
    const { save: afterDay1 } = applyDailyResult(reserved, dailyResult(), '2026-07-14');
    expect(isDailyAvailable(afterDay1, '2026-07-15')).toBe(true);
  });

  it('refuses to double-award for the same day even if called again (defense in depth)', () => {
    const save = defaultSave();
    const reserved = reserveDailyAttempt(save, '2026-07-14');
    const { save: afterFirst } = applyDailyResult(reserved, dailyResult({ coins: 400 }), '2026-07-14');
    const { save: afterSecond, coinsAwarded, isNewBest } = applyDailyResult(afterFirst, dailyResult({ coins: 900 }), '2026-07-14');
    expect(coinsAwarded).toBe(0);
    expect(isNewBest).toBe(false);
    expect(afterSecond.coins).toBe(afterFirst.coins);
    expect(dailyBestScore(afterSecond)).toBe(400);
  });

  it('refuses to pay out for a day that was never reserved (no result without a reservation)', () => {
    const save = defaultSave();
    const { save: next, coinsAwarded } = applyDailyResult(save, dailyResult({ coins: 400 }), '2026-07-14');
    expect(coinsAwarded).toBe(0);
    expect(next.coins).toBe(save.coins);
  });

  it('bestScore tracks the raw run score, never decreasing', () => {
    const save = defaultSave();
    const reservedDay1 = reserveDailyAttempt(save, '2026-07-14');
    const { save: afterHigh } = applyDailyResult(reservedDay1, dailyResult({ coins: 900 }), '2026-07-14');
    const reservedDay2 = reserveDailyAttempt(afterHigh, '2026-07-15');
    const { save: afterLow } = applyDailyResult(reservedDay2, dailyResult({ coins: 100 }), '2026-07-15');
    expect(dailyBestScore(afterLow)).toBe(900);
  });

  it('throws if given a non-daily result', () => {
    const save = reserveDailyAttempt(defaultSave(), '2026-07-14');
    expect(() => applyDailyResult(save, victoryResult({ missionId: 'm1' }), '2026-07-14')).toThrow(/non-daily/);
  });
});
