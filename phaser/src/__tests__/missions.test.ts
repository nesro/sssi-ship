import { describe, it, expect } from 'vitest';
import { calculateStars, calculateCoins, isMissionUnlocked } from '../data/missions.js';
import type { MissionResult } from '../data/missions.js';
import type { MissionRecord } from '../SaveManager.js';

// Minimal result for a lost mission
function defeatResult(override: Partial<MissionResult> = {}): MissionResult {
  return {
    missionId: 'mission_1', bossBeaten: false,
    hullPercent: 0, hullHpRemaining: 0,
    secondsTaken: 999, enemiesKilled: 0,
    shieldBroken: true, sideWeaponsUsed: false,
    ...override,
  };
}

// Minimal result for a won mission
function winResult(override: Partial<MissionResult> = {}): MissionResult {
  return {
    missionId: 'mission_1', bossBeaten: true,
    hullPercent: 100, hullHpRemaining: 100,
    secondsTaken: 30, enemiesKilled: 50,
    shieldBroken: false, sideWeaponsUsed: false,
    ...override,
  };
}

describe('calculateStars — mission_1', () => {
  it('returns 0 on defeat', () => {
    expect(calculateStars('mission_1', defeatResult())).toBe(0);
  });

  it('returns 1 star on bare win (low HP, too slow)', () => {
    const result = winResult({ hullPercent: 30, secondsTaken: 90 });
    expect(calculateStars('mission_1', result)).toBe(1);
  });

  it('returns 2 stars when hull ≥ 50% but too slow', () => {
    const result = winResult({ hullPercent: 60, secondsTaken: 90 });
    expect(calculateStars('mission_1', result)).toBe(2);
  });

  it('returns 3 stars when hull ≥ 50% and time ≤ 75 s', () => {
    const result = winResult({ hullPercent: 60, secondsTaken: 60 });
    expect(calculateStars('mission_1', result)).toBe(3);
  });
});

describe('calculateStars — tutorial', () => {
  it('returns 0 on defeat', () => {
    expect(calculateStars('tutorial', defeatResult({ missionId: 'tutorial' }))).toBe(0);
  });

  it('returns 1 star on bare win (low hull)', () => {
    const result = winResult({ missionId: 'tutorial', hullPercent: 40 });
    expect(calculateStars('tutorial', result)).toBe(1);
  });

  it('returns 2 stars when hull ≥ 60% but shields were broken', () => {
    // tutorial 2★: hull ≥ 60%; tutorial 3★: shields never broken
    // both conditions must fail the 3★ gate to land on 2★
    const result = winResult({ missionId: 'tutorial', hullPercent: 70, shieldBroken: true });
    expect(calculateStars('tutorial', result)).toBe(2);
  });

  it('returns 3 stars when hull ≥ 60% and shields never broken', () => {
    const result = winResult({ missionId: 'tutorial', hullPercent: 70, shieldBroken: false });
    expect(calculateStars('tutorial', result)).toBe(3);
  });
});

describe('calculateCoins', () => {
  it('returns baseCoins for 1 star (no extras)', () => {
    expect(calculateCoins('mission_1', 1)).toBe(80);
  });

  it('adds coinsPerExtraStar for each star above 1', () => {
    expect(calculateCoins('mission_1', 2)).toBe(80 + 40);
    expect(calculateCoins('mission_1', 3)).toBe(80 + 80);
  });

  it('tutorial base coins are lower', () => {
    expect(calculateCoins('tutorial', 1)).toBe(20);
  });
});

describe('calculateStars — mission_2', () => {
  it('returns 0 on defeat', () => {
    expect(calculateStars('mission_2', defeatResult({ missionId: 'mission_2' }))).toBe(0);
  });

  it('returns 1 star on bare win (shields broken)', () => {
    const result = winResult({ missionId: 'mission_2', shieldBroken: true });
    expect(calculateStars('mission_2', result)).toBe(1);
  });

  it('returns 2 stars when shields intact but kill count < 60', () => {
    const result = winResult({ missionId: 'mission_2', shieldBroken: false, enemiesKilled: 30 });
    expect(calculateStars('mission_2', result)).toBe(2);
  });

  it('returns 3 stars when shields intact and ≥60 enemies killed', () => {
    const result = winResult({ missionId: 'mission_2', shieldBroken: false, enemiesKilled: 60 });
    expect(calculateStars('mission_2', result)).toBe(3);
  });
});

describe('calculateStars — mission_3', () => {
  it('returns 0 on defeat', () => {
    expect(calculateStars('mission_3', defeatResult({ missionId: 'mission_3' }))).toBe(0);
  });

  it('returns 1 star on bare win (low hull HP remaining)', () => {
    const result = winResult({ missionId: 'mission_3', hullHpRemaining: 5 });
    expect(calculateStars('mission_3', result)).toBe(1);
  });

  it('returns 2 stars when hull HP ≥10 but side weapons were used', () => {
    const result = winResult({ missionId: 'mission_3', hullHpRemaining: 20, sideWeaponsUsed: true });
    expect(calculateStars('mission_3', result)).toBe(2);
  });

  it('returns 3 stars when hull HP ≥10 and no side weapons used', () => {
    const result = winResult({ missionId: 'mission_3', hullHpRemaining: 20, sideWeaponsUsed: false });
    expect(calculateStars('mission_3', result)).toBe(3);
  });
});

describe('isMissionUnlocked', () => {
  const noStars: Record<string, MissionRecord> = {
    tutorial:  { unlocked: true,  bestStars: 0 },
    mission_1: { unlocked: true,  bestStars: 0 },
    mission_2: { unlocked: false, bestStars: 0 },
    mission_3: { unlocked: false, bestStars: 0 },
  };

  it('tutorial is always unlocked', () => {
    expect(isMissionUnlocked('tutorial', noStars)).toBe(true);
  });

  it('mission_1 is locked without tutorial star', () => {
    expect(isMissionUnlocked('mission_1', noStars)).toBe(false);
  });

  it('mission_1 unlocks with 1 star on tutorial', () => {
    const records = { ...noStars, tutorial: { unlocked: true, bestStars: 1 as 0|1|2|3 } };
    expect(isMissionUnlocked('mission_1', records)).toBe(true);
  });

  it('mission_2 is locked without mission_1 star', () => {
    expect(isMissionUnlocked('mission_2', noStars)).toBe(false);
  });

  it('mission_2 unlocks with 1 star on mission_1', () => {
    const records = { ...noStars, mission_1: { unlocked: true, bestStars: 1 as 0|1|2|3 } };
    expect(isMissionUnlocked('mission_2', records)).toBe(true);
  });

  it('mission_3 requires 2 stars on both mission_1 and mission_2', () => {
    const one2 = {
      ...noStars,
      mission_1: { unlocked: true, bestStars: 2 as 0|1|2|3 },
      mission_2: { unlocked: true, bestStars: 1 as 0|1|2|3 },
    };
    expect(isMissionUnlocked('mission_3', one2)).toBe(false);

    const two2 = {
      ...noStars,
      mission_1: { unlocked: true, bestStars: 2 as 0|1|2|3 },
      mission_2: { unlocked: true, bestStars: 2 as 0|1|2|3 },
    };
    expect(isMissionUnlocked('mission_3', two2)).toBe(true);
  });
});
