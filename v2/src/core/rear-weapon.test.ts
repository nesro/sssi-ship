// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { createCoreState } from './state';
import { fireRearWeapon, toggleRearWeapon } from './combat';
import { computeEffectiveStats, defaultModifiers } from './stats';
import { hashCoreState } from './replay';
import { buildLoadout, defaultSave, loadSave, persistSave, resetSave, switchRearWeapon } from '../save/SaveManager';
import {
  FIXTURE_LOADOUT,
  FIXTURE_MISSION,
  FIXTURE_REAR_WEAPON,
  makeFixtureEnemy,
} from './fixtures';
import type { LoadoutSnapshot } from './types';

// Loadout with a rear weapon equipped.
const REAR_LOADOUT: LoadoutSnapshot = {
  ...FIXTURE_LOADOUT,
  rearWeapon: FIXTURE_REAR_WEAPON,
  // Energy-rich generator so shots don't stall on empty energy.
  generator: { id: 'fix-gen', outputPerTick: 5, capacity: 999, pulseDrainFraction: 0.5 },
};

function makeEnemies(count: number): ReturnType<typeof makeFixtureEnemy>[] {
  return Array.from({ length: count }, (_, i) =>
    makeFixtureEnemy({ id: i + 1, distance: 50 + i * 5 }),
  );
}

// ── fireRearWeapon: targets mid-queue, not front ──────────────────────────────

describe('fireRearWeapon targets mid-queue enemies', () => {
  it('hits the middle enemy in a 5-enemy queue with maxTargets=3', () => {
    const state = createCoreState(FIXTURE_MISSION, REAR_LOADOUT, 1);
    state.enemies = makeEnemies(5);
    state.ship.energy = 999;
    state.ship.rearFireTimer = 1; // ready to fire on this tick

    const stats = computeEffectiveStats(REAR_LOADOUT, defaultModifiers());
    const midIndex = Math.floor(5 / 2); // 2 (0-based)
    const midState = state.enemies[midIndex];
    if (midState === undefined) throw new Error('expected enemy at midIndex');
    const midHpBefore = midState.hp;

    fireRearWeapon(state, stats);

    expect(midState.hp).toBeLessThan(midHpBefore);
  });

  it('does NOT damage the first (front) enemy when queue is long enough', () => {
    const state = createCoreState(FIXTURE_MISSION, REAR_LOADOUT, 1);
    state.enemies = makeEnemies(5); // maxTargets=3 → slice [1..3], skips index 0
    state.ship.energy = 999;
    state.ship.rearFireTimer = 1;

    const stats = computeEffectiveStats(REAR_LOADOUT, defaultModifiers());
    const front = state.enemies[0];
    if (front === undefined) throw new Error('expected enemies');
    const frontHpBefore = front.hp;

    fireRearWeapon(state, stats);

    expect(front.hp).toBe(frontHpBefore);
  });
});

// ── fireRearWeapon: disabled guard ────────────────────────────────────────────

describe('fireRearWeapon respects rearWeaponEnabled', () => {
  it('skips when rearWeaponEnabled is false', () => {
    const state = createCoreState(FIXTURE_MISSION, REAR_LOADOUT, 1);
    state.rearWeaponEnabled = false;
    state.enemies = makeEnemies(3);
    state.ship.energy = 999;
    state.ship.rearFireTimer = 1;

    const stats = computeEffectiveStats(REAR_LOADOUT, defaultModifiers());
    const hpsBefore = state.enemies.map((e) => e.hp);

    fireRearWeapon(state, stats);

    state.enemies.forEach((e, i) => {
      expect(e.hp).toBe(hpsBefore[i]);
    });
  });
});

// ── fireRearWeapon: no rear weapon equipped ───────────────────────────────────

describe('fireRearWeapon respects loadout.rearWeapon === null', () => {
  it('skips when no rear weapon is in the loadout (stats.rearWeaponEquipped = false)', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1);
    state.enemies = makeEnemies(3);
    state.ship.energy = 999;
    state.ship.rearFireTimer = 1;

    const stats = computeEffectiveStats(FIXTURE_LOADOUT, defaultModifiers());
    expect(stats.rearWeaponEquipped).toBe(false);

    const hpsBefore = state.enemies.map((e) => e.hp);

    fireRearWeapon(state, stats);

    state.enemies.forEach((e, i) => {
      expect(e.hp).toBe(hpsBefore[i]);
    });
  });
});

// ── fireRearWeapon: target count ──────────────────────────────────────────────

describe('fireRearWeapon hits at most maxTargets enemies', () => {
  it('hits min(maxTargets, enemies.length) enemies on a single fire', () => {
    const state = createCoreState(FIXTURE_MISSION, REAR_LOADOUT, 1);
    // 2 enemies — fewer than maxTargets (3), so all should be hit
    state.enemies = makeEnemies(2);
    state.ship.energy = 999;
    state.ship.rearFireTimer = 1;

    const stats = computeEffectiveStats(REAR_LOADOUT, defaultModifiers());
    const hpsBefore = state.enemies.map((e) => e.hp);

    fireRearWeapon(state, stats);

    const damaged = state.enemies.filter((e, i) => e.hp < (hpsBefore[i] ?? Infinity)).length;
    expect(damaged).toBe(Math.min(stats.rearWeaponMaxTargets, 2));
  });
});

// ── fireRearWeapon: energy drain ──────────────────────────────────────────────

describe('fireRearWeapon energy drain', () => {
  it('drains energyPerShot on a successful fire', () => {
    const state = createCoreState(FIXTURE_MISSION, REAR_LOADOUT, 1);
    state.enemies = makeEnemies(3);
    state.ship.energy = 50;
    state.ship.rearFireTimer = 1;

    const stats = computeEffectiveStats(REAR_LOADOUT, defaultModifiers());
    fireRearWeapon(state, stats);

    expect(state.ship.energy).toBe(50 - stats.rearWeaponEnergyPerShot);
  });

  it('energy cannot drop below 0 from a rear weapon shot', () => {
    const state = createCoreState(FIXTURE_MISSION, REAR_LOADOUT, 1);
    state.enemies = makeEnemies(3);
    state.ship.energy = 1; // less than energyPerShot
    state.ship.rearFireTimer = 1;

    const stats = computeEffectiveStats(REAR_LOADOUT, defaultModifiers());
    fireRearWeapon(state, stats);

    expect(state.ship.energy).toBeGreaterThanOrEqual(0);
  });
});

// ── toggleRearWeapon + hashCoreState ──────────────────────────────────────────

describe('toggleRearWeapon and hashCoreState', () => {
  it('toggleRearWeapon flips rearWeaponEnabled', () => {
    const state = createCoreState(FIXTURE_MISSION, REAR_LOADOUT, 1);
    expect(state.rearWeaponEnabled).toBe(true);

    toggleRearWeapon(state);
    expect(state.rearWeaponEnabled).toBe(false);

    toggleRearWeapon(state);
    expect(state.rearWeaponEnabled).toBe(true);
  });

  it('hashCoreState changes when rearWeaponEnabled changes', () => {
    const state = createCoreState(FIXTURE_MISSION, REAR_LOADOUT, 1);
    const h1 = hashCoreState(state);

    toggleRearWeapon(state);

    expect(hashCoreState(state)).not.toBe(h1);
  });
});

// ── Save migration v6 → v7 ────────────────────────────────────────────────────

describe('SaveManager migration v6 → v8', () => {
  beforeEach(() => {
    resetSave();
  });

  it('adds rearWeapon: null when migrating from v6', () => {
    const v6: Record<string, unknown> = {
      version: 6,
      coins: 42,
      ownedSupplyCharges: {},
      equipped: { ship: 'ship-1', weapon: 'pulse-1', shield: 'shield-1', generator: 'generator-1', motor: 'motor-1' },
      ownedItems: ['ship-1', 'pulse-1', 'shield-1', 'generator-1', 'motor-1'],
      missionStars: {},
      ownedSubscriptions: { 'sub-basic': 1 },
    };
    localStorage.setItem('nesro-nova-v2-save', JSON.stringify(v6));

    const migrated = loadSave();
    expect(migrated.version).toBe(13);
    expect(migrated.equipped.rearWeapon).toBeNull();
  });
});

// ── buildLoadout: rearWeapon field ────────────────────────────────────────────

describe('buildLoadout rearWeapon', () => {
  beforeEach(() => {
    resetSave();
  });

  it('produces rearWeapon: null when equipped.rearWeapon is null', () => {
    const save = defaultSave();
    const loadout = buildLoadout(save);
    expect(loadout.rearWeapon).toBeNull();
  });

  it('produces correct WeaponSpec when equipped.rearWeapon is "grenade-1"', () => {
    let save = defaultSave();
    save = { ...save, coins: 999 };
    persistSave(save);
    save = switchRearWeapon(save, 'grenade-1');

    const loadout = buildLoadout(save);
    expect(loadout.rearWeapon).not.toBeNull();
    expect(loadout.rearWeapon?.kind).toBe('grenade');
    expect(typeof loadout.rearWeapon?.damagePerShot).toBe('number');
    expect((loadout.rearWeapon?.damagePerShot ?? 0)).toBeGreaterThan(0);
  });
});
