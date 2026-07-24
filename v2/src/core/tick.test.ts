import { describe, expect, it } from 'vitest';
import { ALL_ABILITIES } from '../data/cards';
import { bonusCallsForHoldCharge } from './combat';
import { HOLD_CHARGE_TIER_2_TICKS, HOLD_CHARGE_TIER_3_TICKS } from './constants';
import { FIXTURE_LOADOUT, FIXTURE_MISSION, makeFixtureEnemy } from './fixtures';
import { createCoreState } from './state';
import { abandonRun, advanceTick } from './tick';

// accrueHoldCharge (Item 6) is internal to tick.ts — exercised only via advanceTick.
// autoFireEnabled is turned off throughout so combat outcomes (kills, HP changes)
// never interfere with isolating the accrual behavior itself.

function freshState() {
  const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, []);
  state.autoFireEnabled = false;
  return state;
}

describe('blocker hold-charge accrual (Item 6)', () => {
  it('increments a blocker\'s holdChargeTicks while another enemy is also alive', () => {
    const state = freshState();
    const blocker = makeFixtureEnemy({ id: 1, kind: 'blocker', blocksConveyor: true, hp: 9999, maxHp: 9999, distance: 90 });
    const fodder = makeFixtureEnemy({ id: 2, kind: 'fodder', blocksConveyor: false, hp: 9999, maxHp: 9999, distance: 50 });
    state.enemies = [blocker, fodder];
    for (let i = 0; i < 5; i++) advanceTick(state);
    expect(state.enemies.find((e) => e.id === 1)?.holdChargeTicks).toBe(5);
  });

  it('does not increment when the blocker is the only enemy left', () => {
    const state = freshState();
    const blocker = makeFixtureEnemy({ id: 1, kind: 'blocker', blocksConveyor: true, hp: 9999, maxHp: 9999, distance: 90 });
    state.enemies = [blocker];
    for (let i = 0; i < 5; i++) advanceTick(state);
    expect(state.enemies.find((e) => e.id === 1)?.holdChargeTicks).toBe(0);
  });

  it('freezes once the lane clears down to just the blocker and never resumes', () => {
    const state = freshState();
    const blocker = makeFixtureEnemy({ id: 1, kind: 'blocker', blocksConveyor: true, hp: 9999, maxHp: 9999, distance: 90 });
    const fodder = makeFixtureEnemy({ id: 2, kind: 'fodder', blocksConveyor: false, hp: 9999, maxHp: 9999, distance: 50 });
    state.enemies = [blocker, fodder];
    for (let i = 0; i < 3; i++) advanceTick(state);
    expect(state.enemies.find((e) => e.id === 1)?.holdChargeTicks).toBe(3);

    // Lane clears to just the blocker — simulates the fodder having been killed.
    state.enemies = state.enemies.filter((e) => e.id !== 2);
    for (let i = 0; i < 10; i++) advanceTick(state);
    expect(state.enemies.find((e) => e.id === 1)?.holdChargeTicks).toBe(3);
  });

  it('accrues independently per blocker — two blockers under pressure both charge, not double-counted or shared', () => {
    const state = freshState();
    const blockerA = makeFixtureEnemy({ id: 1, kind: 'blocker', blocksConveyor: true, hp: 9999, maxHp: 9999, distance: 90 });
    const blockerB = makeFixtureEnemy({ id: 2, kind: 'blocker', blocksConveyor: true, hp: 9999, maxHp: 9999, distance: 80 });
    const fodder = makeFixtureEnemy({ id: 3, kind: 'fodder', blocksConveyor: false, hp: 9999, maxHp: 9999, distance: 50 });
    state.enemies = [blockerA, blockerB, fodder];
    for (let i = 0; i < 4; i++) advanceTick(state);
    expect(state.enemies.find((e) => e.id === 1)?.holdChargeTicks).toBe(4);
    expect(state.enemies.find((e) => e.id === 2)?.holdChargeTicks).toBe(4);

    // Only blocker A remains alongside the fodder — B stops (removed, simulating its
    // own death), A keeps accruing on its own independent counter.
    state.enemies = state.enemies.filter((e) => e.id !== 2);
    for (let i = 0; i < 3; i++) advanceTick(state);
    expect(state.enemies.find((e) => e.id === 1)?.holdChargeTicks).toBe(7);
  });

  it('defaults to 0 for a newly spawned enemy', () => {
    const blocker = makeFixtureEnemy({ id: 1, kind: 'blocker', blocksConveyor: true, hp: 9999, maxHp: 9999, distance: 90 });
    expect(blocker.holdChargeTicks).toBe(0);
  });
});

describe('bonusCallsForHoldCharge (Item 6)', () => {
  it('returns 1 for no sustained pressure', () => {
    expect(bonusCallsForHoldCharge(0)).toBe(1);
    expect(bonusCallsForHoldCharge(HOLD_CHARGE_TIER_2_TICKS - 1)).toBe(1);
  });

  it('returns 2 once tier 2 is reached', () => {
    expect(bonusCallsForHoldCharge(HOLD_CHARGE_TIER_2_TICKS)).toBe(2);
    expect(bonusCallsForHoldCharge(HOLD_CHARGE_TIER_3_TICKS - 1)).toBe(2);
  });

  it('returns 3 once tier 3 is reached, and stays capped there beyond it', () => {
    expect(bonusCallsForHoldCharge(HOLD_CHARGE_TIER_3_TICKS)).toBe(3);
    expect(bonusCallsForHoldCharge(HOLD_CHARGE_TIER_3_TICKS * 10)).toBe(3);
  });
});

describe('blocker kill banks hold-charge into bonus-call payout', () => {
  it('a blocker killed with tier-3 charge queues 3 bonus calls, not the old flat 1', () => {
    // Needs a real ability pool — maybeTriggerBonusCall zeroes bonusCallsPending
    // outright when the pool is empty (no offer can ever be built from it), which
    // would mask the very effect this test verifies.
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, ALL_ABILITIES);
    state.autoFireEnabled = true;
    state.ship.energy = 9999;
    const blocker = makeFixtureEnemy({
      id: 1, kind: 'blocker', blocksConveyor: true, hp: 1, maxHp: 9999, distance: 90,
      holdChargeTicks: HOLD_CHARGE_TIER_3_TICKS, holdBonusTiered: true,
    });
    const fodder = makeFixtureEnemy({ id: 2, kind: 'fodder', blocksConveyor: false, hp: 9999, maxHp: 9999, distance: 50 });
    state.enemies = [blocker, fodder];
    expect(state.bonusCallsPending).toBe(0);
    // Front weapon targets front-most (lowest distance) by default — fodder is closer,
    // so mark the blocker as priority target to guarantee it's the one that dies.
    state.priorityTargetId = 1;
    for (let i = 0; i < 5; i++) advanceTick(state);
    expect(state.enemies.some((e) => e.id === 1)).toBe(false); // blocker died
    const totalBonusQueuedOrFired = state.bonusCallsPending + (state.pendingOffer !== null ? 1 : 0);
    expect(totalBonusQueuedOrFired).toBe(3);
  });

  it('a turret (blocksConveyor, not a blocker) still queues a flat 1 regardless of accrued charge', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, ALL_ABILITIES);
    state.autoFireEnabled = true;
    state.ship.energy = 9999;
    const turret = makeFixtureEnemy({
      id: 1, kind: 'turret', blocksConveyor: true, hp: 1, maxHp: 9999, distance: 90,
      holdChargeTicks: HOLD_CHARGE_TIER_3_TICKS,
    });
    state.enemies = [turret];
    for (let i = 0; i < 5; i++) advanceTick(state);
    expect(state.enemies.some((e) => e.id === 1)).toBe(false); // turret died
    const totalBonusQueuedOrFired = state.bonusCallsPending + (state.pendingOffer !== null ? 1 : 0);
    expect(totalBonusQueuedOrFired).toBe(1);
  });
});

describe('abandonRun', () => {
  it('force-ends a running mission as a defeat', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, ALL_ABILITIES);
    expect(state.status).toBe('running');
    abandonRun(state);
    expect(state.status).toBe('defeat');
  });

  it('is a no-op if the mission already ended on its own', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, ALL_ABILITIES);
    state.status = 'victory';
    abandonRun(state);
    expect(state.status).toBe('victory'); // not overwritten to 'defeat'
  });
});
