import { describe, expect, it } from 'vitest';
import { FIXTURE_MISSION } from '../src/core/fixtures';
import { computeStaticProfile, tierForSpeed, timeToImpactSeconds } from './pacing-report';

describe('tierForSpeed', () => {
  it('classifies a stationary enemy (speed 0) as stationary, not patient', () => {
    expect(tierForSpeed(0)).toBe('stationary');
  });

  it('classifies a slow enemy (≥8s time-to-impact) as patient', () => {
    expect(tierForSpeed(0.5)).toBe('patient'); // 100/0.5/10 = 20s
  });

  it('classifies a mid-speed enemy (4-8s) as escalating', () => {
    expect(tierForSpeed(1.6)).toBe('escalating'); // 100/1.6/10 = 6.25s
  });

  it('classifies a fast enemy (<4s) as aggressive', () => {
    expect(tierForSpeed(2.8)).toBe('aggressive'); // 100/2.8/10 ≈ 3.6s
  });

  it('matches timeToImpactSeconds at the exact tier boundaries', () => {
    expect(timeToImpactSeconds(1.25)).toBeCloseTo(8, 5); // boundary: patient/escalating
    expect(tierForSpeed(1.25)).toBe('patient'); // >= threshold is inclusive
  });
});

describe('computeStaticProfile', () => {
  it('finds the longest same-kind consecutive streak, not just the most frequent kind', () => {
    // FIXTURE_MISSION: fodder, fodder, blocker, fodder — two fodder events are
    // consecutive (streak 2), the third fodder is separated by the blocker event.
    const profile = computeStaticProfile(FIXTURE_MISSION);
    expect(profile.longestSameKindStreak).toEqual({ kind: 'fodder', streak: 2 });
  });

  it('assigns a tier to every event from its EnemySpec.speed', () => {
    const profile = computeStaticProfile(FIXTURE_MISSION);
    expect(profile.eventTiers).toHaveLength(FIXTURE_MISSION.events.length);
    expect(profile.eventTiers.every((e) => e.tier.length > 0)).toBe(true);
  });

  it('throws with mission context when an event references an unknown enemy kind', () => {
    const badMission = {
      ...FIXTURE_MISSION,
      events: [{ atTimelineTick: 10, kind: 'nonexistent', count: 1, spacing: 0 }],
    };
    expect(() => computeStaticProfile(badMission)).toThrow(/nonexistent/);
  });
});
