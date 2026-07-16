import { describe, expect, it } from 'vitest';
import { setPriorityTarget } from '../src/core/combat';
import { FIXTURE_LOADOUT, FIXTURE_MISSION, FIXTURE_REAR_WEAPON, makeFixtureEnemy } from '../src/core/fixtures';
import { runMission } from '../src/core/replay';
import { createCoreState } from '../src/core/state';
import { advanceTick } from '../src/core/tick';
import type { LoadoutSnapshot } from '../src/core/types';
import { abilityPoolForLoadout } from '../src/data/cards';
import { missionById } from '../src/data/missions';
import { intendedLoadoutForMission } from './loadoutPresets';
import {
  alwaysBurnBlockers, alwaysHoldBlockersUnderPressure, alwaysMarkFarthestEnemy, alwaysOnToggles,
  brownoutAwareToggles, greedyPick, holdBlockersWithJudgment, prioritizeHighValueTargets,
} from './policies';

// Rear weapon + front weapon together outdrain the fixture generator's 2/tick output
// (front: 6 energy/5 ticks, rear: 8 energy/10 ticks, motor draw 0.3/tick — net negative
// while both fire), so a run reliably enters brownout territory without needing a
// mission with heavier enemy pressure.
const LOADOUT_WITH_REAR: LoadoutSnapshot = { ...FIXTURE_LOADOUT, rearWeapon: FIXTURE_REAR_WEAPON };
const RUN_TICKS = 300; // 30s simulated — long enough to see both a cutoff and a recovery

describe('alwaysOnToggles', () => {
  it('never flips rearWeaponEnabled off, no matter how low energy gets', () => {
    const state = createCoreState(FIXTURE_MISSION, LOADOUT_WITH_REAR, 1);
    for (let i = 0; i < RUN_TICKS && state.status === 'running'; i++) {
      alwaysOnToggles(state);
      advanceTick(state);
      expect(state.rearWeaponEnabled).toBe(true);
    }
  });
});

describe('brownoutAwareToggles', () => {
  it('cuts the rear weapon once energy drops into brownout, and restores it once energy recovers', () => {
    const state = createCoreState(FIXTURE_MISSION, LOADOUT_WITH_REAR, 1);
    let sawOff = false;
    let sawRestoredAfterOff = false;
    for (let i = 0; i < RUN_TICKS && state.status === 'running'; i++) {
      brownoutAwareToggles(state);
      if (!state.rearWeaponEnabled) sawOff = true;
      if (sawOff && state.rearWeaponEnabled) sawRestoredAfterOff = true;
      advanceTick(state);
    }
    expect(sawOff).toBe(true);
    expect(sawRestoredAfterOff).toBe(true);
  });

  it('never touches front weapon or shield toggles — only the rear weapon', () => {
    const state = createCoreState(FIXTURE_MISSION, LOADOUT_WITH_REAR, 1);
    for (let i = 0; i < RUN_TICKS && state.status === 'running'; i++) {
      brownoutAwareToggles(state);
      advanceTick(state);
      expect(state.autoFireEnabled).toBe(true);
      expect(state.autoShieldEnabled).toBe(true);
    }
  });
});

describe('alwaysBurnBlockers', () => {
  it('is the alwaysOnToggles no-op — never touches any toggle', () => {
    expect(alwaysBurnBlockers).toBe(alwaysOnToggles);
  });
});

describe('alwaysHoldBlockersUnderPressure', () => {
  it('cuts the front weapon when a blocker shares the lane with another enemy', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1);
    state.enemies = [
      makeFixtureEnemy({ id: 1, kind: 'blocker', blocksConveyor: true, distance: 40 }),
      makeFixtureEnemy({ id: 2, kind: 'fodder', distance: 60 }),
    ];
    expect(state.autoFireEnabled).toBe(true);
    alwaysHoldBlockersUnderPressure(state);
    expect(state.autoFireEnabled).toBe(false);
  });

  it('restores the front weapon once the lane clears down to just the blocker', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1);
    state.autoFireEnabled = false; // was holding
    state.enemies = [makeFixtureEnemy({ id: 1, kind: 'blocker', blocksConveyor: true, distance: 40 })];
    alwaysHoldBlockersUnderPressure(state);
    expect(state.autoFireEnabled).toBe(true);
  });

  it('leaves the front weapon on when there is no blocker at all', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1);
    state.enemies = [
      makeFixtureEnemy({ id: 1, kind: 'fodder', distance: 40 }),
      makeFixtureEnemy({ id: 2, kind: 'fodder', distance: 60 }),
    ];
    alwaysHoldBlockersUnderPressure(state);
    expect(state.autoFireEnabled).toBe(true);
  });
});

describe('holdBlockersWithJudgment', () => {
  it('holds like alwaysHoldBlockersUnderPressure while hull is healthy', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1);
    state.ship.hull = state.ship.maxHull; // full hull
    state.enemies = [
      makeFixtureEnemy({ id: 1, kind: 'blocker', blocksConveyor: true, distance: 40 }),
      makeFixtureEnemy({ id: 2, kind: 'fodder', distance: 60 }),
    ];
    holdBlockersWithJudgment(state);
    expect(state.autoFireEnabled).toBe(false);
  });

  it('bails early and keeps burning once hull drops below the safety margin, even with real pressure present', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1);
    state.ship.hull = state.ship.maxHull * 0.1; // well below the safety fraction
    state.enemies = [
      makeFixtureEnemy({ id: 1, kind: 'blocker', blocksConveyor: true, distance: 40 }),
      makeFixtureEnemy({ id: 2, kind: 'fodder', distance: 60 }),
    ];
    holdBlockersWithJudgment(state);
    expect(state.autoFireEnabled).toBe(true);
  });
});

describe('manageToggles policy seam (runMission)', () => {
  it('is deterministic: same seed + same toggle policy produces an identical resultHash', () => {
    const a = runMission(FIXTURE_MISSION, LOADOUT_WITH_REAR, 7, { manageToggles: brownoutAwareToggles });
    const b = runMission(FIXTURE_MISSION, LOADOUT_WITH_REAR, 7, { manageToggles: brownoutAwareToggles });
    expect(a.replay.resultHash).toBe(b.replay.resultHash);
  });

  it('omitting manageToggles reproduces the always-on baseline exactly', () => {
    const withDefault = runMission(FIXTURE_MISSION, LOADOUT_WITH_REAR, 7);
    const withExplicitAlwaysOn = runMission(FIXTURE_MISSION, LOADOUT_WITH_REAR, 7, {
      manageToggles: alwaysOnToggles,
    });
    expect(withDefault.replay.resultHash).toBe(withExplicitAlwaysOn.replay.resultHash);
  });
});

describe('prioritizeHighValueTargets', () => {
  it('marks a present high-value enemy (turret/booster/boss)', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1);
    state.enemies = [
      makeFixtureEnemy({ id: 1, kind: 'fodder', distance: 10 }),
      makeFixtureEnemy({ id: 2, kind: 'turret', distance: 80 }),
    ];
    expect(prioritizeHighValueTargets(state)).toBe(2);
  });

  it('returns undefined (no change) when the current mark is still a valid high-value target', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1);
    state.enemies = [makeFixtureEnemy({ id: 2, kind: 'boss', distance: 80 })];
    setPriorityTarget(state, 2);
    expect(prioritizeHighValueTargets(state)).toBeUndefined();
  });

  it('returns null (clears) when no high-value target is present', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1);
    state.enemies = [makeFixtureEnemy({ id: 1, kind: 'fodder', distance: 10 })];
    expect(prioritizeHighValueTargets(state)).toBeNull();
  });
});

describe('alwaysMarkFarthestEnemy', () => {
  it('always marks whichever enemy has the largest distance, regardless of kind', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1);
    state.enemies = [
      makeFixtureEnemy({ id: 1, kind: 'fodder', distance: 10 }),
      makeFixtureEnemy({ id: 2, kind: 'fodder', distance: 90 }),
      makeFixtureEnemy({ id: 3, kind: 'fodder', distance: 50 }),
    ];
    expect(alwaysMarkFarthestEnemy(state)).toBe(2);
  });

  it('returns null when no enemies are present', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1);
    state.enemies = [];
    expect(alwaysMarkFarthestEnemy(state)).toBeNull();
  });
});

describe('naive targeting can lose to no-targeting-at-all', () => {
  // The verification the plan called for: a zero-cost mechanic that strictly helps in
  // every case is a reflex tax, not a real decision. Confirmed on real missions (not a
  // hand-built fixture — a synthetic single-wave scenario turned out too fragile to
  // isolate the effect cleanly, since the fixture weapon/enemy numbers don't match any
  // real mission's actual pressure): across 500 seeds each, m1/intended shows 591
  // collisions with alwaysMarkFarthestEnemy vs. 0 with no targeting at all;
  // m5/intended shows 9,577 vs. 167. Ignoring the front-most enemies to chase whatever
  // is deepest in the queue reliably lets front-most enemies reach collision range —
  // this is the real cost side of "free and instant" targeting.
  it('marking the farthest enemy causes measurably more collisions than not targeting, on m1', () => {
    const mission = missionById('m1');
    const loadout = intendedLoadoutForMission('m1');
    const abilityPool = abilityPoolForLoadout(loadout);
    let withTargetingCollisions = 0;
    let withoutTargetingCollisions = 0;
    const runs = 200;
    for (let seed = 1; seed <= runs; seed++) {
      const a = runMission(mission, loadout, seed, { abilityPool, pickAbility: greedyPick, chooseTarget: alwaysMarkFarthestEnemy });
      const b = runMission(mission, loadout, seed, { abilityPool, pickAbility: greedyPick });
      withTargetingCollisions += a.state.stats.collisions;
      withoutTargetingCollisions += b.state.stats.collisions;
    }
    expect(withTargetingCollisions).toBeGreaterThan(withoutTargetingCollisions);
    expect(withoutTargetingCollisions).toBe(0); // m1/intended is collision-free under normal targeting
  });
});
