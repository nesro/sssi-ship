// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { createCoreState } from './state';
import { fireSideWeapon } from './combat';
import { HIT_ALL_TARGETS } from './constants';
import { hashCoreState } from './replay';
import { buildLoadout, defaultSave, loadSave, persistSave, resetSave, switchSideWeapon } from '../save/SaveManager';
import {
  FIXTURE_LOADOUT,
  FIXTURE_MISSION,
  FIXTURE_SIDE_WEAPON,
  makeFixtureEnemy,
} from './fixtures';
import type { LoadoutSnapshot } from './types';

// Loadout with a single-target side weapon equipped (maxTargets: 1, maxCharges: 3).
const SIDE_LOADOUT: LoadoutSnapshot = {
  ...FIXTURE_LOADOUT,
  sideWeapon: FIXTURE_SIDE_WEAPON,
};

const MULTI_SIDE_WEAPON: NonNullable<LoadoutSnapshot['sideWeapon']> = {
  ...FIXTURE_SIDE_WEAPON,
  id: 'fix-side-multi',
  maxTargets: 3,
  falloffPerTarget: 0.8,
};

const AOE_SIDE_WEAPON: NonNullable<LoadoutSnapshot['sideWeapon']> = {
  ...FIXTURE_SIDE_WEAPON,
  id: 'fix-side-aoe',
  maxTargets: HIT_ALL_TARGETS,
  falloffPerTarget: 1,
};

function makeEnemies(count: number): ReturnType<typeof makeFixtureEnemy>[] {
  return Array.from({ length: count }, (_, i) =>
    makeFixtureEnemy({ id: i + 1, distance: 50 + i * 5 }),
  );
}

// ── fireSideWeapon: targets front-most enemies, not mid-queue like the rear weapon ──

describe('fireSideWeapon targets front-most enemies', () => {
  it('hits only the front-most enemy for a single-target weapon (maxTargets: 1)', () => {
    const state = createCoreState(FIXTURE_MISSION, SIDE_LOADOUT, 1);
    state.enemies = makeEnemies(3);
    const [front, second, third] = state.enemies;
    if (front === undefined || second === undefined || third === undefined) throw new Error('expected 3 enemies');
    const hpBefore = { front: front.hp, second: second.hp, third: third.hp };

    fireSideWeapon(state);

    expect(front.hp).toBeLessThan(hpBefore.front);
    expect(second.hp).toBe(hpBefore.second);
    expect(third.hp).toBe(hpBefore.third);
  });

  it('hits min(maxTargets, enemies.length) front enemies for a multi-target weapon', () => {
    const state = createCoreState(FIXTURE_MISSION, { ...SIDE_LOADOUT, sideWeapon: MULTI_SIDE_WEAPON }, 1);
    state.enemies = makeEnemies(5); // maxTargets=3 → hits the 3 front-most
    const hpsBefore = state.enemies.map((e) => e.hp);

    fireSideWeapon(state);

    const damaged = state.enemies.filter((e, i) => e.hp < (hpsBefore[i] ?? Infinity));
    expect(damaged.length).toBe(3);
    expect(damaged.map((e) => e.id)).toEqual([1, 2, 3]);
  });

  it('hits every enemy for an AOE weapon (maxTargets: Infinity)', () => {
    const state = createCoreState(FIXTURE_MISSION, { ...SIDE_LOADOUT, sideWeapon: AOE_SIDE_WEAPON }, 1);
    state.enemies = makeEnemies(6);
    const hpsBefore = state.enemies.map((e) => e.hp);

    fireSideWeapon(state);

    state.enemies.forEach((e, i) => {
      expect(e.hp).toBeLessThan(hpsBefore[i] ?? Infinity);
    });
  });
});

// ── fireSideWeapon: active timed boosts (2026-07-18 fix) ────────────────────────
// This call used to compute stats with no boost args at all (defaulting to 1×) and
// read raw `sideWeapon.damagePerShot` instead of the boosted `stats.sideWeaponDamage`
// — a Rage-Protocol-style damage-mult effect silently never applied to a side-weapon
// shot even though it does apply to the auto-firing front/rear weapons.

describe('fireSideWeapon applies active damage-mult boosts', () => {
  it('multiplies damage by a live damage-mult effect', () => {
    const state = createCoreState(FIXTURE_MISSION, SIDE_LOADOUT, 1);
    state.enemies = makeEnemies(1);
    state.activeEffects = [{ kind: 'damage-mult', multiplier: 2, expiresAtTick: state.tick + 10 }];

    fireSideWeapon(state);

    expect(state.stats.damageDealt).toBeCloseTo(FIXTURE_SIDE_WEAPON.damagePerShot * 2);
  });

  it('deals unboosted damage once the effect has expired', () => {
    const state = createCoreState(FIXTURE_MISSION, SIDE_LOADOUT, 1);
    state.enemies = makeEnemies(1);
    state.tick = 20;
    state.activeEffects = [{ kind: 'damage-mult', multiplier: 2, expiresAtTick: 10 }];

    fireSideWeapon(state);

    expect(state.stats.damageDealt).toBeCloseTo(FIXTURE_SIDE_WEAPON.damagePerShot);
  });
});

// ── fireSideWeapon: charge consumption and fail-fast guards ─────────────────────

describe('fireSideWeapon charge consumption', () => {
  it('consumes exactly 1 charge per fire', () => {
    const state = createCoreState(FIXTURE_MISSION, SIDE_LOADOUT, 1);
    state.enemies = makeEnemies(1);
    expect(state.ship.sideWeaponCharges).toBe(3);

    fireSideWeapon(state);

    expect(state.ship.sideWeaponCharges).toBe(2);
  });

  it('throws when charges are exhausted', () => {
    const state = createCoreState(FIXTURE_MISSION, SIDE_LOADOUT, 1);
    state.enemies = makeEnemies(1);
    state.ship.sideWeaponCharges = 0;

    expect(() => { fireSideWeapon(state); }).toThrow(/no charges left/);
  });

  it('throws when no side weapon is equipped', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1);
    state.enemies = makeEnemies(1);

    expect(() => { fireSideWeapon(state); }).toThrow(/No side weapon equipped/);
  });

  it('throws when the mission is not running', () => {
    const state = createCoreState(FIXTURE_MISSION, SIDE_LOADOUT, 1);
    state.enemies = makeEnemies(1);
    state.status = 'victory';

    expect(() => { fireSideWeapon(state); }).toThrow(/mission status/);
  });
});

// ── fireSideWeapon: replay recording ─────────────────────────────────────────────

describe('fireSideWeapon records the tap for replay', () => {
  it('pushes the current tick onto sideWeaponTaps', () => {
    const state = createCoreState(FIXTURE_MISSION, SIDE_LOADOUT, 1);
    state.enemies = makeEnemies(1);
    state.tick = 7;

    fireSideWeapon(state);

    expect(state.sideWeaponTaps).toEqual([7]);
  });

  it('increments stats.sideShotsFired', () => {
    const state = createCoreState(FIXTURE_MISSION, SIDE_LOADOUT, 1);
    state.enemies = makeEnemies(1);

    fireSideWeapon(state);

    expect(state.stats.sideShotsFired).toBe(1);
  });
});

// ── createCoreState: charges initialize from the equipped spec ──────────────────

describe('createCoreState initializes side weapon charges', () => {
  it('sets ship.sideWeaponCharges to the equipped spec\'s maxCharges', () => {
    const state = createCoreState(FIXTURE_MISSION, SIDE_LOADOUT, 1);
    expect(state.ship.sideWeaponCharges).toBe(3);
  });

  it('sets ship.sideWeaponCharges to 0 when no side weapon is equipped', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1);
    expect(state.ship.sideWeaponCharges).toBe(0);
  });
});

// ── hashCoreState: determinism contract ──────────────────────────────────────────

describe('hashCoreState changes after a side weapon shot', () => {
  it('produces a different hash once a shot damages an enemy', () => {
    const state = createCoreState(FIXTURE_MISSION, SIDE_LOADOUT, 1);
    state.enemies = makeEnemies(1);
    const h1 = hashCoreState(state);

    fireSideWeapon(state);

    expect(hashCoreState(state)).not.toBe(h1);
  });
});

// ── Save version handling — no migration, old versions reset ─────────────────────

describe('SaveManager: pre-v13 saves reset to defaultSave (no migration)', () => {
  beforeEach(() => {
    resetSave();
  });

  it('a v11 save (side weapons did not exist yet) resets to defaultSave rather than migrating', () => {
    const v11: Record<string, unknown> = {
      version: 11,
      coins: 42,
      ownedSupplyCharges: {},
      equipped: { ship: 'ship-interceptor-1', weapon: 'pulse-1', rearWeapon: null, shield: 'shield-wall-1', generator: 'generator-torrent-1', motor: 'motor-rush-1' },
      missionStars: {},
      ownedSubscriptions: { 'sub-basic': 1 },
    };
    localStorage.setItem('nesro-nova-v2-save', JSON.stringify(v11));

    const reset = loadSave();
    expect(reset).toEqual(defaultSave());
    expect(reset.coins).toBe(0);
    expect(reset.equipped.sideWeapon).toBeNull();
  });
});

// ── buildLoadout: sideWeapon field ────────────────────────────────────────────────

describe('buildLoadout sideWeapon', () => {
  beforeEach(() => {
    resetSave();
  });

  it('produces sideWeapon: null when equipped.sideWeapon is null', () => {
    const save = defaultSave();
    const loadout = buildLoadout(save);
    expect(loadout.sideWeapon).toBeNull();
  });

  it('produces correct WeaponSpec when equipped.sideWeapon is "focus-1"', () => {
    let save = defaultSave();
    save = { ...save, coins: 999 };
    persistSave(save);
    save = switchSideWeapon(save, 'focus-1');

    const loadout = buildLoadout(save);
    expect(loadout.sideWeapon).not.toBeNull();
    expect(loadout.sideWeapon?.kind).toBe('focus');
    expect(typeof loadout.sideWeapon?.damagePerShot).toBe('number');
    expect(loadout.sideWeapon?.maxCharges).toBeGreaterThan(0);
  });
});
