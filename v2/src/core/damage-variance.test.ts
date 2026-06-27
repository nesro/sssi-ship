import { describe, expect, it } from 'vitest';
import { COLLISION_DAMAGE_MULTIPLIER, TICKS_PER_SECOND } from './constants';
import { hashCoreState } from './replay';
import { createCoreState } from './state';
import { advanceTick } from './tick';
import { FIXTURE_LOADOUT, FIXTURE_MISSION, FIXTURE_WEAPON, makeFixtureEnemy } from './fixtures';
import type { LoadoutSnapshot } from './types';

const seconds = (n: number): number => n * TICKS_PER_SECOND;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Isolated loadout: zero generator output + zero energy cost so tests measure only damage. */
function isolatedLoadout(overrides: Partial<NonNullable<LoadoutSnapshot['weapon']>>): LoadoutSnapshot {
  return {
    ...FIXTURE_LOADOUT,
    generator: { id: 'fix-zero-gen', outputPerTick: 0, capacity: 9999, pulseDrainFraction: 0 },
    shield: { id: 'fix-no-shield', capacity: 0, pulseShieldFraction: 0 },
    motor: { id: 'fix-zero-motor', timelineMultiplier: 1, powerDrawPerTick: 0 },
    weapon: {
      ...FIXTURE_WEAPON,
      energyPerShot: 0,
      ticksBetweenShots: 5,
      ...overrides,
    },
  };
}

/** Advance exactly one weapon shot cycle (ticksBetweenShots ticks). */
function fireOnce(state: ReturnType<typeof createCoreState>): void {
  for (let i = 0; i < 5; i++) advanceTick(state);
}

// ── Player weapon — crit ──────────────────────────────────────────────────────

describe('player weapon: crit', () => {
  it('always-crit weapon deals critMult × baseDamage', () => {
    const state = createCoreState(FIXTURE_MISSION, isolatedLoadout({
      damagePerShot: 10,
      critChance: 1.0,
      critMult: 3.0,
      missChance: 0,
    }), 1, []);
    state.autoShieldEnabled = false;
    state.ship.energy = 9999;
    state.enemies = [makeFixtureEnemy({ hp: 9999, maxHp: 9999, distance: 50, speed: 0 })];

    fireOnce(state);

    expect(state.stats.shotsFired).toBe(1);
    expect(state.stats.damageDealt).toBeCloseTo(30); // 10 × 3.0
    expect(state.enemies[0]?.hp).toBeCloseTo(9999 - 30);
  });

  it('crit event appears in pendingVisualEvents after the shot', () => {
    const state = createCoreState(FIXTURE_MISSION, isolatedLoadout({
      critChance: 1.0,
      critMult: 2.0,
      missChance: 0,
    }), 1, []);
    state.autoShieldEnabled = false;
    state.ship.energy = 9999;
    state.enemies = [makeFixtureEnemy({ hp: 9999, maxHp: 9999, distance: 50, speed: 0 })];

    fireOnce(state); // events cleared at start of tick 1..4; shot fires at tick 5

    expect(state.pendingVisualEvents.some((e) => e.kind === 'player-crit')).toBe(true);
  });

  it('crit: on-hit energy IS credited (hitCount > 0)', () => {
    const state = createCoreState(FIXTURE_MISSION, isolatedLoadout({
      damagePerShot: 10, critChance: 1.0, critMult: 2.0, missChance: 0,
    }), 1, []);
    state.autoShieldEnabled = false;
    state.ship.energy = 100;
    state.modifiers = { ...state.modifiers, energyPerHit: 5 };
    state.enemies = [makeFixtureEnemy({ hp: 9999, maxHp: 9999, distance: 50, speed: 0 })];

    fireOnce(state);

    expect(state.ship.energy).toBe(105); // 100 − 0 cost + 5 per hit
  });
});

// ── Player weapon — miss ──────────────────────────────────────────────────────

describe('player weapon: miss', () => {
  it('always-miss weapon deals 0 damage', () => {
    const state = createCoreState(FIXTURE_MISSION, isolatedLoadout({
      damagePerShot: 10, missChance: 1.0, critChance: 0,
    }), 1, []);
    state.autoShieldEnabled = false;
    state.ship.energy = 9999;
    state.enemies = [makeFixtureEnemy({ hp: 100, maxHp: 100, distance: 50, speed: 0 })];

    fireOnce(state);

    expect(state.stats.damageDealt).toBe(0);
    expect(state.enemies[0]?.hp).toBe(100);
  });

  it('miss event appears in pendingVisualEvents', () => {
    const state = createCoreState(FIXTURE_MISSION, isolatedLoadout({
      missChance: 1.0, critChance: 0,
    }), 1, []);
    state.autoShieldEnabled = false;
    state.ship.energy = 9999;
    state.enemies = [makeFixtureEnemy({ hp: 100, maxHp: 100, distance: 50, speed: 0 })];

    fireOnce(state);

    expect(state.pendingVisualEvents.some((e) => e.kind === 'player-miss')).toBe(true);
  });

  it('miss: on-hit energy is NOT credited (hitCount stays 0)', () => {
    const state = createCoreState(FIXTURE_MISSION, isolatedLoadout({
      missChance: 1.0, critChance: 0,
    }), 1, []);
    state.autoShieldEnabled = false;
    state.ship.energy = 100;
    state.modifiers = { ...state.modifiers, energyPerHit: 5 };
    state.enemies = [makeFixtureEnemy({ hp: 100, maxHp: 100, distance: 50, speed: 0 })];

    fireOnce(state);

    expect(state.ship.energy).toBe(100); // unchanged — 0 cost, 0 energyBack
  });

  it('GAMBLER shotRandomnessFraction is NOT applied after a miss (damage stays 0)', () => {
    const state = createCoreState(FIXTURE_MISSION, isolatedLoadout({
      damagePerShot: 10, missChance: 1.0, critChance: 0,
    }), 1, []);
    state.autoShieldEnabled = false;
    state.ship.energy = 9999;
    state.modifiers = { ...state.modifiers, shotRandomnessFraction: 1.0 };
    state.enemies = [makeFixtureEnemy({ hp: 100, maxHp: 100, distance: 50, speed: 0 })];

    fireOnce(state);

    expect(state.stats.damageDealt).toBe(0); // no randomness applied — miss short-circuits
  });
});

// ── Normal hit ────────────────────────────────────────────────────────────────

describe('player weapon: normal hit (no crit/miss)', () => {
  it('deals exactly baseDamage with zero shotRandomnessFraction', () => {
    const state = createCoreState(FIXTURE_MISSION, isolatedLoadout({
      damagePerShot: 10, critChance: 0, missChance: 0,
    }), 1, []);
    state.autoShieldEnabled = false;
    state.ship.energy = 9999;
    state.modifiers = { ...state.modifiers, shotRandomnessFraction: 0 };
    state.enemies = [makeFixtureEnemy({ hp: 9999, maxHp: 9999, distance: 50, speed: 0 })];

    fireOnce(state);

    expect(state.stats.damageDealt).toBe(10);
  });

  it('GAMBLER shotRandomnessFraction produces damage within expected bounds', () => {
    // shotRandomnessFraction=0.5 means damage in [baseDamage×0.5, baseDamage×1.5]
    const state = createCoreState(FIXTURE_MISSION, isolatedLoadout({
      damagePerShot: 10, critChance: 0, missChance: 0,
    }), 42, []);
    state.autoShieldEnabled = false;
    state.ship.energy = 9999;
    state.modifiers = { ...state.modifiers, shotRandomnessFraction: 0.5 };
    state.enemies = [makeFixtureEnemy({ hp: 9999, maxHp: 9999, distance: 50, speed: 0 })];

    fireOnce(state);

    expect(state.stats.damageDealt).toBeGreaterThanOrEqual(5);
    expect(state.stats.damageDealt).toBeLessThanOrEqual(15);
  });

  it('crit kill triggers kill effects (coins earned, kills incremented)', () => {
    const state = createCoreState(FIXTURE_MISSION, isolatedLoadout({
      damagePerShot: 50, critChance: 1.0, critMult: 2.0, missChance: 0,
    }), 1, []);
    state.autoShieldEnabled = false;
    state.ship.energy = 9999;
    state.enemies = [makeFixtureEnemy({ hp: 30, maxHp: 30, distance: 50, speed: 0, coinReward: 7 })];

    fireOnce(state); // crit deals 100 → kills the 30hp enemy

    expect(state.stats.kills).toBe(1);
    expect(state.stats.coinsEarned).toBe(7);
  });

  it('per-target: multi-target weapon applies independent roll to each enemy', () => {
    // critChance=1.0 → every target crits; total damage = maxTargets × critMult × baseDamage
    const baseLoadout = isolatedLoadout({ damagePerShot: 10, critChance: 1.0, critMult: 2.0, missChance: 0 });
    const baseWeapon = baseLoadout.weapon;
    if (baseWeapon === null) throw new Error('weapon required');
    const state = createCoreState(FIXTURE_MISSION, {
      ...baseLoadout,
      weapon: { ...baseWeapon, maxTargets: 3, falloffPerTarget: 1 },
    }, 1, []);
    state.autoShieldEnabled = false;
    state.ship.energy = 9999;
    state.enemies = [
      makeFixtureEnemy({ id: 1, hp: 9999, maxHp: 9999, distance: 50, speed: 0 }),
      makeFixtureEnemy({ id: 2, hp: 9999, maxHp: 9999, distance: 40, speed: 0 }),
      makeFixtureEnemy({ id: 3, hp: 9999, maxHp: 9999, distance: 30, speed: 0 }),
    ];

    fireOnce(state);

    // 3 targets × crit(2.0) × base(10) = 60
    expect(state.stats.damageDealt).toBeCloseTo(60);
  });
});

// ── Enemy weapons ─────────────────────────────────────────────────────────────

describe('enemy weapon: crit and miss', () => {
  it('enemy always-crit deals critMult × shotDamage', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, []);
    state.autoShieldEnabled = false;
    state.ship.shield = 0;
    state.ship.energy = 9999;
    const hullBefore = state.ship.hull;
    state.enemies = [makeFixtureEnemy({
      hp: 9999, maxHp: 9999, distance: 50, speed: 0,
      shotDamage: 5, ticksBetweenShots: 5, shootTimer: 5,
      critChance: 1.0, missChance: 0, critMult: 3.0,
    })];

    for (let i = 0; i < 5; i++) advanceTick(state); // one enemy shot

    expect(state.ship.hull).toBeCloseTo(hullBefore - 15); // 5 × 3.0
  });

  it('enemy always-miss deals 0 damage', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, []);
    state.autoShieldEnabled = false;
    state.ship.shield = 0;
    state.ship.energy = 9999;
    const hullBefore = state.ship.hull;
    state.enemies = [makeFixtureEnemy({
      hp: 9999, maxHp: 9999, distance: 50, speed: 0,
      shotDamage: 5, ticksBetweenShots: 5, shootTimer: 5,
      critChance: 0, missChance: 1.0, critMult: 2.0,
    })];

    for (let i = 0; i < 5; i++) advanceTick(state);

    expect(state.ship.hull).toBe(hullBefore); // enemy miss → no damage
  });
});

// ── Collision ─────────────────────────────────────────────────────────────────

describe('collision damage', () => {
  it('collision deals shotDamage × COLLISION_DAMAGE_MULTIPLIER ignoring crit/miss', () => {
    // Even with critChance=1.0, collision bypasses rollShotOutcome entirely.
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, []);
    state.autoFireEnabled = false;
    state.autoShieldEnabled = false;
    state.ship.shield = 0;
    const hullBefore = state.ship.hull;
    const shotDamage = 10;
    state.enemies = [makeFixtureEnemy({
      hp: 9999, maxHp: 9999,
      distance: 1, speed: 2, // will reach 0 next tick
      shotDamage,
      critChance: 1.0, critMult: 99.0, // crit mult irrelevant for collision
      missChance: 0,
    })];

    advanceTick(state);

    const expectedDamage = shotDamage * COLLISION_DAMAGE_MULTIPLIER;
    expect(state.ship.hull).toBeCloseTo(hullBefore - expectedDamage); // exactly 3×, not crit mult
    expect(state.enemies).toHaveLength(0); // enemy consumed on collision
  });
});

// ── pendingVisualEvents ───────────────────────────────────────────────────────

describe('pendingVisualEvents', () => {
  it('is cleared at the start of each tick', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, []);
    // Manually push a stale event
    state.pendingVisualEvents.push({ kind: 'player-crit', enemyId: 42 });

    advanceTick(state);

    // The stale event is gone; only events from this tick remain
    expect(state.pendingVisualEvents.every((e) => e.enemyId !== 42)).toBe(true);
  });

  it('is NOT included in hashCoreState — hash is invariant to events', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, []);
    const h1 = hashCoreState(state);
    state.pendingVisualEvents.push({ kind: 'player-crit', enemyId: 42 });
    expect(hashCoreState(state)).toBe(h1); // hash unchanged
  });
});

// ── Turret enemy archetype ────────────────────────────────────────────────────

describe('turret enemy archetype', () => {
  const TURRET_SPEC = {
    hp: 80, maxHp: 80,
    kind: 'turret' as const,
    distance: 50,
    speed: 0, // stationary
    shotDamage: 6,
    ticksBetweenShots: seconds(0.8),
    shootTimer: seconds(0.8),
    blocksConveyor: true,
    coinReward: 30,
    critChance: 0.10,
    missChance: 0.05,
    critMult: 2.0,
    isBoss: false,
    regenPerTick: 0,
  };

  it('never advances down the lane (speed: 0)', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, []);
    state.enemies = [makeFixtureEnemy({ ...TURRET_SPEC, id: 99 })];

    const distanceBefore = state.enemies[0]?.distance ?? 0;
    for (let i = 0; i < 30; i++) advanceTick(state);
    const turret = state.enemies.find((e) => e.id === 99);

    expect(turret).toBeDefined();
    expect(turret?.distance).toBe(distanceBefore); // stationary
  });

  it('blocksConveyor=true pauses the mission timeline while alive', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, []);
    state.autoFireEnabled = false; // keep turret alive
    state.enemies = [makeFixtureEnemy({ ...TURRET_SPEC, id: 99 })];

    const ticksBefore = state.timelineTick;
    for (let i = 0; i < 10; i++) advanceTick(state);

    expect(state.timelineTick).toBe(ticksBefore); // timeline frozen while turret blocks
  });

  it('fires at the player (ship hull reduces after shootTimer elapses)', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, []);
    state.autoFireEnabled = false; // don't kill the turret
    state.autoShieldEnabled = false;
    state.ship.shield = 0;
    const hullBefore = state.ship.hull;
    const turretSpec = { ...TURRET_SPEC, critChance: 0, missChance: 0, shootTimer: 5, ticksBetweenShots: 5 };
    state.enemies = [makeFixtureEnemy(turretSpec)];

    for (let i = 0; i < 5; i++) advanceTick(state);

    expect(state.ship.hull).toBeLessThan(hullBefore); // turret shot landed
  });
});

// ── Kamikaze enemy archetype ──────────────────────────────────────────────────

describe('kamikaze enemy archetype', () => {
  const KAMIKAZE_SPEC = {
    hp: 25, maxHp: 25,
    kind: 'kamikaze' as const,
    speed: 2.8,
    shotDamage: 12,
    ticksBetweenShots: seconds(3),
    shootTimer: seconds(3),
    blocksConveyor: false,
    coinReward: 15,
    critChance: 0,
    missChance: 0,
    critMult: 2.0,
    isBoss: false,
    regenPerTick: 0,
  };

  it('reaches distance 0 within expected ticks given speed 2.8', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, []);
    state.autoFireEnabled = false; // do not kill it prematurely
    const startDistance = 56; // 56 / 2.8 = 20 ticks to reach 0
    state.enemies = [makeFixtureEnemy({ ...KAMIKAZE_SPEC, id: 77, distance: startDistance })];

    // Kamikazes should collide within ceil(56 / 2.8) = 20 ticks
    for (let i = 0; i < 22; i++) {
      if (state.enemies.find((e) => e.id === 77) === undefined) break;
      advanceTick(state);
    }

    // Enemy consumed on collision
    expect(state.enemies.find((e) => e.id === 77)).toBeUndefined();
    expect(state.stats.collisions).toBeGreaterThan(0);
  });

  it('deals collision damage (not ranged shotDamage × 1)', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, []);
    state.autoFireEnabled = false;
    state.autoShieldEnabled = false;
    state.ship.shield = 0;
    const hullBefore = state.ship.hull;
    state.enemies = [makeFixtureEnemy({ ...KAMIKAZE_SPEC, distance: 2, speed: 3 })];

    advanceTick(state); // crosses distance 0

    const expectedCollisionDmg = KAMIKAZE_SPEC.shotDamage * COLLISION_DAMAGE_MULTIPLIER; // 12 × 3 = 36
    expect(state.ship.hull).toBeCloseTo(hullBefore - expectedCollisionDmg);
  });
});

// ── Determinism ───────────────────────────────────────────────────────────────

describe('determinism: crit/miss uses seeded PRNG', () => {
  it('same seed produces identical damage sequence', () => {
    const loadout = isolatedLoadout({ damagePerShot: 10, critChance: 0.3, missChance: 0.2, critMult: 2 });

    function runAndCollect(seed: number): number[] {
      const state = createCoreState(FIXTURE_MISSION, loadout, seed, []);
      state.autoShieldEnabled = false;
      state.ship.energy = 9999;
      state.enemies = [makeFixtureEnemy({ hp: 9999, maxHp: 9999, distance: 50, speed: 0 })];
      const dmg: number[] = [];
      for (let shot = 0; shot < 10; shot++) {
        const before = state.stats.damageDealt;
        fireOnce(state);
        dmg.push(state.stats.damageDealt - before);
      }
      return dmg;
    }

    expect(runAndCollect(42)).toEqual(runAndCollect(42));
    expect(runAndCollect(42)).not.toEqual(runAndCollect(43));
  });
});
