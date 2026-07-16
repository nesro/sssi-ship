import { describe, expect, it } from 'vitest';
import { TICKS_PER_SECOND } from '../core/constants';
import { FIXTURE_LOADOUT, FIXTURE_MISSION, makeFixtureEnemy } from '../core/fixtures';
import { createCoreState } from '../core/state';
import { advanceTick } from '../core/tick';
import type { MissionSpec } from '../core/types';
import {
  computeCardOverlayViewModel, computeCombatHudViewModel, computeSupplyButtonsViewModel,
  liveStarProgress, nearestUnmissedTimeThreshold,
} from './combat';

// FIXTURE_MISSION's own stars are hull-above ×2 / all-kills / shield-unbroken — no
// finish-time star, so liveStarProgress's ticksRemaining path needs its own fixture.
const MISSION_WITH_TIME_STAR: MissionSpec = {
  ...FIXTURE_MISSION,
  id: 'fixture-time-star',
  stars: [
    ...FIXTURE_MISSION.stars,
    { id: 'fix-time-t1', family: 'finish-time', threshold: 50 },
  ],
};

describe('computeCombatHudViewModel', () => {
  it('bar fractions are clamped to 0–1', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, []);
    state.ship.hull = state.ship.maxHull * 2; // overheal edge case
    state.ship.shield = -5; // underflow edge case
    const vm = computeCombatHudViewModel(state, null, 0.5, []);
    expect(vm.hull.fraction).toBe(1);
    expect(vm.shield.fraction).toBe(0);
  });

  it('energy bar switches to the brownout color below the threshold', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, []);
    state.ship.energy = 0; // well below brownout threshold
    const vm = computeCombatHudViewModel(state, null, 0, []);
    expect(vm.energy.color).toBe(0xff4400);
  });

  it('mode is "boss" and reads boss.hp/boss.maxHp when a boss is present', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, []);
    const boss = makeFixtureEnemy({ isBoss: true, hp: 40, maxHp: 200 });
    const vm = computeCombatHudViewModel(state, boss, 0.9, []);
    expect(vm.missionOrBoss.mode).toBe('boss');
    expect(vm.missionOrBoss.name).toBe('BOSS');
    expect(vm.missionOrBoss.fraction).toBeCloseTo(0.2);
  });

  it('mode is "mission" and reads progressFrac when no boss is present', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, []);
    const vm = computeCombatHudViewModel(state, null, 0.3, []);
    expect(vm.missionOrBoss.mode).toBe('mission');
    expect(vm.missionOrBoss.name).toBe('PROG');
    expect(vm.missionOrBoss.fraction).toBeCloseTo(0.3);
  });

  it('supportMarkers is empty when a boss is present', () => {
    const missionWithCalls = { ...FIXTURE_MISSION, supportCallTicks: [TICKS_PER_SECOND * 5] };
    const state = createCoreState(missionWithCalls, FIXTURE_LOADOUT, 1, []);
    const boss = makeFixtureEnemy({ isBoss: true, hp: 10, maxHp: 100 });
    const vm = computeCombatHudViewModel(state, boss, 0, []);
    expect(vm.supportMarkers).toEqual([]);
  });

  it('supportMarkers has one entry per support-call tick when no boss is present', () => {
    const missionWithCalls = { ...FIXTURE_MISSION, supportCallTicks: [TICKS_PER_SECOND * 5, TICKS_PER_SECOND * 10] };
    const state = createCoreState(missionWithCalls, FIXTURE_LOADOUT, 1, []);
    const vm = computeCombatHudViewModel(state, null, 0, []);
    expect(vm.supportMarkers).toHaveLength(2);
  });

  it('dpsLine is never blank — it reads "DPS 0.0" with no weapon equipped', () => {
    const loadoutNoWeapon = { ...FIXTURE_LOADOUT, weapon: null };
    const state = createCoreState(FIXTURE_MISSION, loadoutNoWeapon, 1, []);
    const vm = computeCombatHudViewModel(state, null, 0, []);
    expect(vm.dpsLine).toBe('DPS 0.0  KILLS 0');
    expect(vm.damageRangeLine).toBe('');
    expect(vm.critLine).toBe('');
  });

  it('damageRangeLine and critLine are populated when a weapon is equipped', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, []);
    const vm = computeCombatHudViewModel(state, null, 0, []);
    expect(vm.damageRangeLine).not.toBe('');
    expect(vm.critLine).toMatch(/^CRIT \d+%$/);
  });
});

describe('computeSupplyButtonsViewModel', () => {
  it('hasSupplies is false when no supplies are equipped', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, []);
    expect(computeSupplyButtonsViewModel(state).hasSupplies).toBe(false);
  });

  it('a supply with 0 charges left is marked empty', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, []);
    state.supplies.push({ spec: { id: 'sup-x', name: 'Nano Repair', description: '', kind: 'shield-restore', magnitude: 10, durationTicks: 0, maxCharges: 2 }, chargesLeft: 0 });
    const vm = computeSupplyButtonsViewModel(state);
    expect(vm.hasSupplies).toBe(true);
    expect(vm.buttons[0]).toMatchObject({ empty: true, label: 'Nano Repair  ×0' });
  });
});

describe('computeCardOverlayViewModel', () => {
  it('showReroll is false when rerollsLeft is 0', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, []);
    state.rerollsLeft = 0;
    const offer = { abilityIds: ['meta-reroll-cache', 'quantum-energy-overdrive', 'pierce-lance'] as [string, string, string] };
    const vm = computeCardOverlayViewModel(offer, state);
    expect(vm.showReroll).toBe(false);
  });

  it('showReroll is true when rerollsLeft > 0, and cards resolve name/company', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, []);
    state.rerollsLeft = 2;
    const offer = { abilityIds: ['meta-reroll-cache', 'quantum-energy-overdrive', 'pierce-lance'] as [string, string, string] };
    const vm = computeCardOverlayViewModel(offer, state);
    expect(vm.showReroll).toBe(true);
    expect(vm.rerollsLeft).toBe(2);
    expect(vm.cards).toHaveLength(3);
    expect(vm.cards[0]).toMatchObject({ cardId: 'meta-reroll-cache', name: 'REROLL CACHE', companyChar: 'N' });
  });
});

describe('liveStarProgress', () => {
  it('returns one status per mission star, all on-track and unearned at mission start', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, []);
    const progress = liveStarProgress(state, []);
    expect(progress).toHaveLength(FIXTURE_MISSION.stars.length);
    expect(progress.every((p) => p.onTrack)).toBe(true);
    expect(progress.every((p) => !p.earned)).toBe(true);
  });

  it('marks a star earned=true and onTrack=true when it was already earned on a prior clear, regardless of current state', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, []);
    state.shieldBroke = true; // would normally fail shield-unbroken live
    const progress = liveStarProgress(state, ['fix-shield']);
    const shieldStatus = progress.find((p) => p.starId === 'fix-shield');
    expect(shieldStatus).toMatchObject({ earned: true, onTrack: true });
  });

  it('shield-unbroken flips to off-track the instant shieldBroke is set, and stays off-track', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, []);
    expect(liveStarProgress(state, []).find((p) => p.starId === 'fix-shield')?.onTrack).toBe(true);
    state.shieldBroke = true;
    expect(liveStarProgress(state, []).find((p) => p.starId === 'fix-shield')?.onTrack).toBe(false);
  });

  it('all-kills goes off-track the instant a single collision happens (collisions are never kills)', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, []);
    expect(liveStarProgress(state, []).find((p) => p.starId === 'fix-all-kills')?.onTrack).toBe(true);
    state.stats.collisions = 1;
    expect(liveStarProgress(state, []).find((p) => p.starId === 'fix-all-kills')?.onTrack).toBe(false);
  });

  it('hull-above tracks the current instant and can recover (not sticky, unlike shield/all-kills)', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, []);
    state.ship.hull = state.ship.maxHull * 0.3; // below the 0.5 threshold star
    expect(liveStarProgress(state, []).find((p) => p.starId === 'fix-hull-50')?.onTrack).toBe(false);
    state.ship.hull = state.ship.maxHull * 0.8; // recovered above it
    expect(liveStarProgress(state, []).find((p) => p.starId === 'fix-hull-50')?.onTrack).toBe(true);
  });

  it('finish-time star reports decreasing ticksRemaining and flips off-track once the tick passes threshold', () => {
    const state = createCoreState(MISSION_WITH_TIME_STAR, FIXTURE_LOADOUT, 1, []);
    const before = liveStarProgress(state, []).find((p) => p.starId === 'fix-time-t1');
    expect(before).toMatchObject({ onTrack: true, ticksRemaining: 50 });

    for (let i = 0; i < 60 && state.status === 'running'; i++) advanceTick(state);

    const after = liveStarProgress(state, []).find((p) => p.starId === 'fix-time-t1');
    expect(after?.onTrack).toBe(false);
    expect(after?.ticksRemaining).toBe(0); // clamped, never negative
  });
});

describe('nearestUnmissedTimeThreshold', () => {
  it('returns null when there are no time-based stars at all', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, []);
    expect(nearestUnmissedTimeThreshold(liveStarProgress(state, []))).toBeNull();
  });

  it('returns the tightest still-reachable threshold among several', () => {
    const missionWithTwoTimeStars: MissionSpec = {
      ...FIXTURE_MISSION,
      id: 'fixture-two-time-stars',
      stars: [
        { id: 'loose', family: 'finish-time', threshold: 200 },
        { id: 'tight', family: 'finish-time', threshold: 50 },
      ],
    };
    const state = createCoreState(missionWithTwoTimeStars, FIXTURE_LOADOUT, 1, []);
    expect(nearestUnmissedTimeThreshold(liveStarProgress(state, []))).toBe(50);
  });

  it('excludes already-earned and already-missed thresholds from consideration', () => {
    const missionWithTwoTimeStars: MissionSpec = {
      ...FIXTURE_MISSION,
      id: 'fixture-two-time-stars-2',
      stars: [
        { id: 'loose', family: 'finish-time', threshold: 200 },
        { id: 'tight', family: 'finish-time', threshold: 50 },
      ],
    };
    const state = createCoreState(missionWithTwoTimeStars, FIXTURE_LOADOUT, 1, []);
    // "tight" already earned on a prior clear — should be excluded even though it's the
    // numerically smallest threshold, leaving "loose" as the nearest unmissed one.
    expect(nearestUnmissedTimeThreshold(liveStarProgress(state, ['tight']))).toBe(200);
  });
});
