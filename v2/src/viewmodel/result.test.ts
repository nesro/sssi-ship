import { describe, expect, it } from 'vitest';
import type { MissionResult } from '../core/result';
import { computeResultViewModel } from './result';

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

  it('shortName strips the mission-id prefix and uppercases the rest', () => {
    const result = victoryResult({ earnedStarIds: [] });
    const vm = computeResultViewModel(result, []);
    const hullStar = vm.stars.find((s) => s.id === 'm1-hull-50');
    expect(hullStar?.shortName).toBe('HULL-50');
  });
});
