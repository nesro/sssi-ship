import { describe, expect, it } from 'vitest';
import type { MissionResult } from '../core/result';
import { DAILY_MISSION_ID, generateDailyMission } from '../data/dailyMission';
import { setDailyMission } from '../data/missions';
import { computeResultViewModel } from './result';

setDailyMission(generateDailyMission(1));

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

describe('computeResultViewModel', () => {
  it('marks a star in newStarIds as "new"', () => {
    const result = victoryResult({ earnedStarIds: ['m1-hull-50'] });
    const vm = computeResultViewModel(result, ['m1-hull-50']);
    expect(vm.stars.find((s) => s.id === 'm1-hull-50')?.state).toBe('new');
  });

  it('marks a star earned this run but not new as "earned"', () => {
    const result = victoryResult({ earnedStarIds: ['m1-hull-50'] });
    const vm = computeResultViewModel(result, []); // no NEW this run — a replay
    expect(vm.stars.find((s) => s.id === 'm1-hull-50')?.state).toBe('earned');
  });

  it('marks a star not earned this run as "unearned", even if in save history', () => {
    // earnedStarIds does NOT include m1-shield this run — regardless of save.missionStars
    const result = victoryResult({ earnedStarIds: ['m1-hull-50'] });
    const vm = computeResultViewModel(result, []);
    expect(vm.stars.find((s) => s.id === 'm1-shield')?.state).toBe('unearned');
  });

  it('isTutorial true means stars is empty (t1 has forcedLoadout)', () => {
    const result = victoryResult({ missionId: 't1', earnedStarIds: [] });
    const vm = computeResultViewModel(result, []);
    expect(vm.isTutorial).toBe(true);
    expect(vm.stars).toEqual([]);
  });

  it('coinsEarned reflects result.coins directly', () => {
    const vm = computeResultViewModel(victoryResult({ coins: 250 }), []);
    expect(vm.coinsEarned).toBe(250);
  });

  it('buttons is w0-branch iff missionId is w0 and status is victory', () => {
    expect(computeResultViewModel(victoryResult({ missionId: 'w0', earnedStarIds: [] }), []).buttons).toEqual({ kind: 'w0-branch' });
    expect(computeResultViewModel(victoryResult({ missionId: 'w0', status: 'defeat', earnedStarIds: [] }), []).buttons).toEqual({ kind: 'standard' });
    expect(computeResultViewModel(victoryResult({ missionId: 'm1' }), []).buttons).toEqual({ kind: 'standard' });
  });

  it('killsLine includes the collided clause iff collisions > 0', () => {
    const noCollisions = computeResultViewModel(victoryResult({ collisions: 0 }), []);
    const withCollisions = computeResultViewModel(victoryResult({ collisions: 3 }), []);
    expect(noCollisions.killsLine).toBe('10/10');
    expect(withCollisions.killsLine).toBe('10/10   (3 collided)');
  });

  it('hullPercent rounds the fraction to a whole percent', () => {
    const vm = computeResultViewModel(victoryResult({ hullFraction: 0.834 }), []);
    expect(vm.hullPercent).toBe(83);
  });

  it('throws if the mission is still running (fail-fast, not a possible real state)', () => {
    expect(() => computeResultViewModel(victoryResult({ status: 'running' }), [])).toThrow(/still running/);
  });

  it('outcome mirrors status for a real victory (wasAbandoned has no effect)', () => {
    const vm = computeResultViewModel(victoryResult(), [], undefined, true);
    expect(vm.outcome).toBe('victory');
  });

  it('outcome mirrors status for a real defeat when wasAbandoned is not set', () => {
    const vm = computeResultViewModel(victoryResult({ status: 'defeat' }), []);
    expect(vm.outcome).toBe('defeat');
  });

  it('outcome mirrors status for a real defeat even when wasAbandoned is explicitly false', () => {
    const vm = computeResultViewModel(victoryResult({ status: 'defeat' }), [], undefined, false);
    expect(vm.outcome).toBe('defeat');
  });

  it('shortName describes the star\'s real requirement, not its raw id', () => {
    const result = victoryResult({ earnedStarIds: [] });
    const vm = computeResultViewModel(result, []);
    const byId = (id: string): string | undefined => vm.stars.find((s) => s.id === id)?.shortName;
    expect(byId('m1-hull-50')).toBe('HULL 50%+');
    expect(byId('m1-hull-90')).toBe('HULL 90%+');
    expect(byId('m1-all-kills')).toBe('ALL KILLS');
    expect(byId('m1-shield')).toBe('SHIELD UNBROKEN');
    expect(byId('m1-time-t1')).toMatch(/^UNDER \d+S$/);
  });
});

describe('computeResultViewModel — nextMissionId (Phase C, moved out of ResultScene.ts)', () => {
  it('m1 victory resolves to m2 via MISSION_UNLOCK_EDGES', () => {
    const vm = computeResultViewModel(victoryResult({ missionId: 'm1' }), []);
    expect(vm.nextMissionId).toBe('m2');
  });

  it('m1 defeat (not completesOnDefeat) resolves to null — no next mission on a real loss', () => {
    const vm = computeResultViewModel(victoryResult({ missionId: 'm1', status: 'defeat' }), []);
    expect(vm.nextMissionId).toBeNull();
  });

  it('t1 has two outgoing edges (t2 and m1) — resolves to t2, the first match, not m1', () => {
    const vm = computeResultViewModel(victoryResult({ missionId: 't1', earnedStarIds: [] }), []);
    expect(vm.nextMissionId).toBe('t2');
  });

  it('t1 defeat still resolves to t2 — tutorials complete on defeat too (completesOnDefeat)', () => {
    const vm = computeResultViewModel(victoryResult({ missionId: 't1', status: 'defeat', earnedStarIds: [] }), []);
    expect(vm.nextMissionId).toBe('t2');
  });

  it('m6 (the last main mission, no outgoing edge) resolves to null even on victory', () => {
    const vm = computeResultViewModel(victoryResult({ missionId: 'm6', earnedStarIds: [] }), []);
    expect(vm.nextMissionId).toBeNull();
  });
});

describe('computeResultViewModel — daily mission', () => {
  function dailyResult(overrides: Partial<MissionResult> = {}): MissionResult {
    return victoryResult({
      missionId: DAILY_MISSION_ID, status: 'defeat', earnedStarIds: [], coins: 400, ...overrides,
    });
  }

  it('shows no stars — the daily mission spec always has an empty star list', () => {
    const vm = computeResultViewModel(dailyResult(), []);
    expect(vm.stars).toEqual([]);
  });

  it('uses buttons: daily (no RETRY), never w0-branch or standard', () => {
    const vm = computeResultViewModel(dailyResult(), []);
    expect(vm.buttons).toEqual({ kind: 'daily' });
  });

  it('without a dailyBonus, coinsEarned falls back to the raw result.coins', () => {
    const vm = computeResultViewModel(dailyResult({ coins: 400 }), []);
    expect(vm.coinsEarned).toBe(400);
    expect(vm.daily).toBeUndefined();
  });

  it('with a dailyBonus, coinsEarned is the actual wallet deposit, not the raw score', () => {
    const vm = computeResultViewModel(dailyResult({ coins: 400 }), [], { coinsAwarded: 600, isNewBest: true });
    expect(vm.coinsEarned).toBe(600);
    expect(vm.daily).toEqual({ isNewBest: true });
  });

  it('isNewBest false is preserved (not coerced to undefined/truthy)', () => {
    const vm = computeResultViewModel(dailyResult(), [], { coinsAwarded: 100, isNewBest: false });
    expect(vm.daily).toEqual({ isNewBest: false });
  });

  it('outcome is "abandoned" for a voluntary quit — status stays "defeat" (scoring truth unchanged)', () => {
    const vm = computeResultViewModel(dailyResult(), [], undefined, true);
    expect(vm.status).toBe('defeat');
    expect(vm.outcome).toBe('abandoned');
  });

  it('outcome is "defeat" (not "abandoned") for a real hull-zero daily defeat', () => {
    const vm = computeResultViewModel(dailyResult(), [], undefined, false);
    expect(vm.outcome).toBe('defeat');
  });

  it('outcome is "defeat" when wasAbandoned is omitted entirely, same as a real defeat', () => {
    const vm = computeResultViewModel(dailyResult(), []);
    expect(vm.outcome).toBe('defeat');
  });
});
