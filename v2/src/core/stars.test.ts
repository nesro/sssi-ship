import { describe, expect, it } from 'vitest';
import { FIXTURE_LOADOUT, FIXTURE_MISSION } from './fixtures';
import { buildMissionResult } from './result';
import { createCoreState } from './state';
import { evaluateStars } from './stars';
import { totalStarsAvailable } from '../data/missions';
import type { CoreState, MissionSpec } from './types';

const BOSS_MISSION: MissionSpec = {
  ...FIXTURE_MISSION,
  id: 'boss-fixture',
  stars: [
    { id: 'boss-90', family: 'boss-time', threshold: 900 },
    { id: 'boss-55', family: 'boss-time', threshold: 550 },
    { id: 'hull-50', family: 'hull-above', threshold: 0.5 },
    { id: 'hull-90', family: 'hull-above', threshold: 0.9 },
    { id: 'all-kills', family: 'all-kills', threshold: 0 },
    { id: 'shield', family: 'shield-unbroken', threshold: 0 },
  ],
};

function finishedState(): CoreState {
  const state = createCoreState(BOSS_MISSION, FIXTURE_LOADOUT, 1);
  state.status = 'victory';
  state.tick = 600;
  state.spawnedCount = 10;
  state.stats.kills = 10;
  state.bossKillTick = 600;
  return state;
}

describe('evaluateStars', () => {
  it('a defeat earns nothing', () => {
    const state = finishedState();
    state.status = 'defeat';
    expect(evaluateStars(state)).toEqual([]);
  });

  it('one run can earn several stars at once', () => {
    const state = finishedState();
    expect(evaluateStars(state)).toEqual(['boss-90', 'hull-50', 'hull-90', 'all-kills', 'shield']);
  });

  it('boss-time tiers stack when the kill is fast enough', () => {
    const state = finishedState();
    state.bossKillTick = 500;
    expect(evaluateStars(state)).toContain('boss-55');
    expect(evaluateStars(state)).toContain('boss-90');
  });

  it('no boss-time stars without a weapon boss kill', () => {
    const state = finishedState();
    state.bossKillTick = null;
    const earned = evaluateStars(state);
    expect(earned).not.toContain('boss-90');
    expect(earned).not.toContain('boss-55');
  });

  it('a collision forfeits all-kills', () => {
    const state = finishedState();
    state.stats.kills = 9;
    state.stats.collisions = 1;
    expect(evaluateStars(state)).not.toContain('all-kills');
  });

  it('a broken shield forfeits shield-unbroken', () => {
    const state = finishedState();
    state.shieldBroke = true;
    expect(evaluateStars(state)).not.toContain('shield');
  });

  it('hull tiers respect their thresholds', () => {
    const state = finishedState();
    state.ship.hull = state.ship.maxHull * 0.6;
    const earned = evaluateStars(state);
    expect(earned).toContain('hull-50');
    expect(earned).not.toContain('hull-90');
  });
});

describe('finish-time stars', () => {
  const FINISH_MISSION: MissionSpec = {
    ...FIXTURE_MISSION,
    id: 'finish-fixture',
    stars: [
      { id: 'ft-300', family: 'finish-time', threshold: 3000 },
      { id: 'ft-200', family: 'finish-time', threshold: 2000 },
    ],
  };

  function finishState(tick: number): CoreState {
    const state = createCoreState(FINISH_MISSION, FIXTURE_LOADOUT, 1);
    state.status = 'victory';
    state.tick = tick;
    return state;
  }

  it('earns finish-time star when tick is at the threshold', () => {
    expect(evaluateStars(finishState(3000))).toContain('ft-300');
  });

  it('earns finish-time star when tick is below the threshold', () => {
    expect(evaluateStars(finishState(2500))).toContain('ft-300');
  });

  it('does not earn finish-time star when tick exceeds the threshold', () => {
    expect(evaluateStars(finishState(3001))).not.toContain('ft-300');
  });

  it('tighter threshold requires a faster run', () => {
    const earned = evaluateStars(finishState(2100));
    expect(earned).toContain('ft-300');
    expect(earned).not.toContain('ft-200');
  });

  it('defeat earns no finish-time stars', () => {
    const state = finishState(1000);
    state.status = 'defeat';
    expect(evaluateStars(state)).toEqual([]);
  });
});

describe('totalStarsAvailable', () => {
  it('returns 44 stars across the 6 main missions', () => {
    // m3 and m6 each omit hull-90/shield (attritional DPS-check missions where
    // near-zero-damage completion is structurally near-unreachable) — 4 missions ×
    // 8 stars + 2 missions × 6 stars.
    expect(totalStarsAvailable()).toBe(44);
  });
});

describe('buildMissionResult', () => {
  it('throws while the mission is still running', () => {
    const state = createCoreState(BOSS_MISSION, FIXTURE_LOADOUT, 1);
    expect(() => buildMissionResult(state)).toThrow(/still running/);
  });

  it('pays kill coins plus the completion bonus on victory', () => {
    const state = finishedState();
    state.stats.coinsEarned = 40;
    const result = buildMissionResult(state);
    expect(result.coins).toBe(40 + BOSS_MISSION.completionCoins);
    expect(result.earnedStarIds.length).toBeGreaterThan(0);
  });

  it('pays kill coins only on defeat', () => {
    const state = finishedState();
    state.status = 'defeat';
    state.stats.coinsEarned = 40;
    const result = buildMissionResult(state);
    expect(result.coins).toBe(40);
    expect(result.earnedStarIds).toEqual([]);
  });
});
