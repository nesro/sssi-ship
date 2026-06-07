import { describe, it, expect } from 'vitest';
import {
  SHOT_DAMAGE, ENEMY_COLLISION_DAMAGE, ASTEROID_DAMAGE, HULL_MAX_HP,
  XP_THRESHOLDS, XP_PER_KILL, COINS_PER_KILL,
  pointsForEnemyType, isReadyToLevelUp,
} from '../game/GameRules.js';
import { GameSession } from '../game/GameSession.js';
import type { RunState } from '../game/CardManager.js';
import { EnergyManager } from '../game/EnergyManager.js';
import { ShieldSystem  } from '../game/ShieldSystem.js';
import { computeStats  } from '../game/computeStats.js';
import type { SaveData } from '../SaveManager.js';

function makeRun(): RunState {
  return {
    pickedCardIds: new Set(), rerollsLeft: 5, xp: 0, level: 1,
    explosiveRounds: false, chainLightning: false, overcharge: false,
    shotsSinceOvercharge: 0, overchargeEvery: 0,
  };
}

function baseSave(): SaveData {
  return {
    version: 2, coins: 0, totalStarsEarned: 0, spendableStars: 0,
    welcomeSeen: true, debugEnabled: false,
    ship: { frontWeapon: null, leftWeapon: null, rightWeapon: null, generator: null, shields: null },
    inventory: {}, talents: {}, missions: {}, daily: null, runHistory: [],
  };
}

function makeStats() {
  return computeStats(baseSave());
}

// ─── GameRules constants ──────────────────────────────────────────────────────

describe('GameRules constants', () => {
  it('SHOT_DAMAGE matches SimEngine expectation', () => {
    expect(SHOT_DAMAGE).toBe(5);
  });

  it('XP_THRESHOLDS has 5 levels', () => {
    expect(XP_THRESHOLDS).toHaveLength(5);
    expect(XP_THRESHOLDS[0]).toBe(50);
  });

  it('XP_PER_KILL returns correct values', () => {
    expect(XP_PER_KILL['star']).toBe(15);
    expect(XP_PER_KILL['circle']).toBe(40);
    expect(XP_PER_KILL['boss']).toBe(300);
  });

  it('COINS_PER_KILL: star earns coins, boss does not', () => {
    expect(COINS_PER_KILL['star']).toBeGreaterThan(0);
    expect(COINS_PER_KILL['boss']).toBe(0);
  });
});

// ─── isReadyToLevelUp ─────────────────────────────────────────────────────────

describe('isReadyToLevelUp', () => {
  it('is false below threshold', () => {
    expect(isReadyToLevelUp(49, 1)).toBe(false);
  });

  it('is true at exact threshold', () => {
    expect(isReadyToLevelUp(50, 1)).toBe(true);
  });

  it('is false when level exceeds max', () => {
    expect(isReadyToLevelUp(99999, 6)).toBe(false);
  });
});

// ─── pointsForEnemyType ───────────────────────────────────────────────────────

describe('pointsForEnemyType', () => {
  it('boss > circle > star', () => {
    expect(pointsForEnemyType('boss')).toBeGreaterThan(pointsForEnemyType('circle'));
    expect(pointsForEnemyType('circle')).toBeGreaterThan(pointsForEnemyType('star'));
  });

  it('unknown type returns star score', () => {
    expect(pointsForEnemyType('unknown')).toBe(pointsForEnemyType('star'));
  });
});

// ─── GameSession ──────────────────────────────────────────────────────────────

describe('GameSession.recordKill', () => {
  it('increments score and enemiesKilled', () => {
    const s = new GameSession(makeRun());
    s.recordKill('star');
    expect(s.score).toBe(pointsForEnemyType('star'));
    expect(s.enemiesKilled).toBe(1);
  });

  it('adds XP from kill', () => {
    const s = new GameSession(makeRun());
    s.recordKill('circle');
    expect(s.run.xp).toBe(XP_PER_KILL['circle']);
  });

  it('returns coins earned', () => {
    const s = new GameSession(makeRun());
    expect(s.recordKill('boss')).toBe(COINS_PER_KILL['boss']);
    expect(s.recordKill('star')).toBe(COINS_PER_KILL['star']);
  });
});

describe('GameSession.checkLevelUp', () => {
  it('returns false when XP is below threshold', () => {
    const s = new GameSession(makeRun());
    s.run.xp = 49;
    expect(s.checkLevelUp()).toBe(false);
    expect(s.run.level).toBe(1);
  });

  it('returns true and increments level when XP crosses threshold', () => {
    const s = new GameSession(makeRun());
    s.run.xp = 50;
    expect(s.checkLevelUp()).toBe(true);
    expect(s.run.level).toBe(2);
  });

  it('returns false on repeated call without more XP', () => {
    const s = new GameSession(makeRun());
    s.run.xp = 50;
    s.checkLevelUp();
    expect(s.checkLevelUp()).toBe(false);
  });
});

describe('GameSession damage resolution', () => {
  function makeEnergy() {
    const stats = makeStats();
    const e = new EnergyManager(stats);
    e['energy'] = e['capacity']; // fill energy
    return e;
  }
  function makeShields() {
    return new ShieldSystem(makeStats());
  }

  it('resolveShot: absorbed=true when shields are full', () => {
    const s      = new GameSession(makeRun());
    const energy = makeEnergy();
    const shields = makeShields();
    shields['shieldHp'] = 30;
    const result = s.resolveShot(shields, energy);
    expect(result.absorbed).toBe(true);
    expect(s.hullHp).toBe(HULL_MAX_HP);
  });

  it('resolveAsteroid: reduces hull by ASTEROID_DAMAGE', () => {
    const s = new GameSession(makeRun());
    s.resolveAsteroid();
    expect(s.hullHp).toBe(HULL_MAX_HP - ASTEROID_DAMAGE);
  });

  it('resolveEnemyCollision: uses ENEMY_COLLISION_DAMAGE', () => {
    const s      = new GameSession(makeRun());
    const energy = makeEnergy();
    const shields = makeShields();
    shields['shieldHp'] = 0; // no shield
    const result = s.resolveEnemyCollision(shields, energy);
    expect(result.absorbed).toBe(false);
    expect(s.hullHp).toBe(HULL_MAX_HP - ENEMY_COLLISION_DAMAGE);
  });
});

describe('GameSession.isAlive', () => {
  it('true when hull > 0', () => {
    expect(new GameSession(makeRun()).isAlive()).toBe(true);
  });

  it('false when hull <= 0', () => {
    const s = new GameSession(makeRun());
    s.hullHp = 0;
    expect(s.isAlive()).toBe(false);
  });
});
