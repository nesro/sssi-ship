import { describe, expect, it } from 'vitest';
import { damageShip, fireEnemyWeapons, fireShipWeapon } from './combat';
import { FIXTURE_LOADOUT, FIXTURE_MISSION, FIXTURE_SHIP, FIXTURE_WEAPON, makeFixtureEnemy } from './fixtures';
import { computeEffectiveStats } from './stats';
import { createCoreState } from './state';
import type { CoreState, LoadoutSnapshot } from './types';

function freshState(): CoreState {
  return createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1);
}

function statsOf(state: CoreState) {
  return computeEffectiveStats(state.loadout, state.modifiers);
}

describe('fireShipWeapon', () => {
  it('hits the front-most enemy when the timer elapses', () => {
    const state = freshState();
    state.enemies = [
      makeFixtureEnemy({ id: 1, distance: 80 }),
      makeFixtureEnemy({ id: 2, distance: 20 }),
    ];
    state.ship.fireTimer = 1;
    fireShipWeapon(state, statsOf(state));
    const near = state.enemies.find((e) => e.id === 2);
    const far = state.enemies.find((e) => e.id === 1);
    expect(near?.hp).toBe(100 - FIXTURE_WEAPON.damagePerShot);
    expect(far?.hp).toBe(100);
    expect(state.stats.shotsFired).toBe(1);
  });

  it('does not fire before the timer elapses', () => {
    const state = freshState();
    state.enemies = [makeFixtureEnemy({})];
    state.ship.fireTimer = 5;
    fireShipWeapon(state, statsOf(state));
    expect(state.stats.shotsFired).toBe(0);
  });

  it('pierce hits N front-most enemies with falloff (card modifier applies)', () => {
    const state = freshState();
    state.modifiers = { ...state.modifiers, extraPierce: 1 };
    state.loadout = {
      ...FIXTURE_LOADOUT,
      weapon: { ...FIXTURE_WEAPON, falloffPerTarget: 0.5 },
    };
    state.enemies = [
      makeFixtureEnemy({ id: 1, distance: 30 }),
      makeFixtureEnemy({ id: 2, distance: 60 }),
      makeFixtureEnemy({ id: 3, distance: 90 }),
    ];
    state.ship.fireTimer = 1;
    fireShipWeapon(state, statsOf(state));
    const weapon = state.loadout.weapon;
    if (weapon === null) throw new Error('expected weapon in pierce test');
    const dmg = weapon.damagePerShot;
    expect(state.enemies.find((e) => e.id === 1)?.hp).toBe(100 - dmg);
    expect(state.enemies.find((e) => e.id === 2)?.hp).toBe(100 - dmg * 0.5);
    expect(state.enemies.find((e) => e.id === 3)?.hp).toBe(100);
  });

  it('removes killed enemies, counts the kill, and pays coins', () => {
    const state = freshState();
    state.enemies = [makeFixtureEnemy({ hp: 5, coinReward: 7 })];
    state.ship.fireTimer = 1;
    fireShipWeapon(state, statsOf(state));
    expect(state.enemies).toHaveLength(0);
    expect(state.stats.kills).toBe(1);
    expect(state.stats.coinsEarned).toBe(7);
  });

  it('records the boss kill tick when a boss dies to weapon fire', () => {
    const state = freshState();
    state.tick = 42;
    state.enemies = [makeFixtureEnemy({ hp: 5, isBoss: true })];
    state.ship.fireTimer = 1;
    fireShipWeapon(state, statsOf(state));
    expect(state.bossKillTick).toBe(42);
  });

  it('queues a bonus support call when a blocker dies', () => {
    const state = freshState();
    state.enemies = [makeFixtureEnemy({ hp: 5, blocksConveyor: true })];
    state.ship.fireTimer = 1;
    fireShipWeapon(state, statsOf(state));
    expect(state.bonusCallsPending).toBe(1);
  });

  it('still fires at zero energy, but the next interval is stretched (brownout)', () => {
    const state = freshState();
    state.enemies = [makeFixtureEnemy({})];
    state.ship.energy = 0;
    state.ship.fireTimer = 1;
    fireShipWeapon(state, statsOf(state));
    expect(state.stats.shotsFired).toBe(1);
    expect(state.ship.fireTimer).toBeGreaterThan(FIXTURE_WEAPON.ticksBetweenShots);
  });

  it('does not bank shots while the conveyor is empty', () => {
    const state = freshState();
    const IDLE_TICKS = 10;
    for (let i = 0; i < IDLE_TICKS; i++) fireShipWeapon(state, statsOf(state));
    state.enemies = [makeFixtureEnemy({ hp: 1000 })];
    const FIRING_TICKS = 5;
    for (let i = 0; i < FIRING_TICKS; i++) fireShipWeapon(state, statsOf(state));
    // One immediate shot after the lull, then the normal cadence — never a burst.
    expect(state.stats.shotsFired).toBe(1);
  });

});

describe('fireShipWeapon synergy chains', () => {
  it('overcharge multiplies every Nth shot and the refund payoff keeps the energy', () => {
    const state = freshState();
    state.modifiers = { ...state.modifiers, overchargeEvery: 2, overchargeRefund: true };
    state.enemies = [makeFixtureEnemy({ hp: 100000 })];
    const stats = statsOf(state);

    state.ship.fireTimer = 1;
    fireShipWeapon(state, stats); // shot 1: normal
    const normalDamage = state.stats.damageDealt;
    expect(normalDamage).toBe(stats.weaponDamage);

    const energyBefore = state.ship.energy;
    state.ship.fireTimer = 1;
    fireShipWeapon(state, stats); // shot 2: overcharged ×3, refunded
    expect(state.stats.damageDealt).toBe(normalDamage + stats.weaponDamage * 3);
    expect(state.ship.energy).toBe(energyBefore);
  });

  it('pierce-chain leech restores energy per enemy hit', () => {
    const state = freshState();
    state.modifiers = { ...state.modifiers, extraPierce: 2, energyPerHit: 2 };
    state.enemies = [
      makeFixtureEnemy({ id: 1, distance: 30, hp: 1000 }),
      makeFixtureEnemy({ id: 2, distance: 60, hp: 1000 }),
      makeFixtureEnemy({ id: 3, distance: 90, hp: 1000 }),
    ];
    const stats = statsOf(state);
    state.ship.energy = 20;
    state.ship.fireTimer = 1;
    fireShipWeapon(state, stats);
    // 3 enemies hit × 2 energy back, minus the shot cost.
    expect(state.ship.energy).toBeCloseTo(20 - stats.weaponEnergyPerShot + 6);
  });
});

describe('fireEnemyWeapons', () => {
  it('damages the ship when an enemy timer elapses, shield first', () => {
    const state = freshState();
    state.ship.shield = 20; // shield starts at 0 by design; set explicitly for this test
    state.enemies = [makeFixtureEnemy({ shootTimer: 1, shotDamage: 5 })];
    fireEnemyWeapons(state, statsOf(state));
    expect(state.ship.shield).toBe(15);
    expect(state.ship.hull).toBe(state.ship.maxHull);
  });
});

describe('ship hull from spec', () => {
  it('createCoreState sets hull and maxHull from the ship spec', () => {
    const loadout: LoadoutSnapshot = { ...FIXTURE_LOADOUT, ship: { ...FIXTURE_SHIP, hull: 150 } };
    const state = createCoreState(FIXTURE_MISSION, loadout, 1);
    expect(state.ship.hull).toBe(150);
    expect(state.ship.maxHull).toBe(150);
  });
});

describe('ship passives', () => {
  it('Interceptor: enemy shots always miss when missChance + shipEnemyMissBonus >= 1', () => {
    const loadout: LoadoutSnapshot = {
      ...FIXTURE_LOADOUT,
      ship: { ...FIXTURE_SHIP, passiveKind: 'enemy-miss-bonus', passiveValue: 0.1 },
    };
    const state = createCoreState(FIXTURE_MISSION, loadout, 1);
    state.enemies = [makeFixtureEnemy({ missChance: 0.9, shootTimer: 1, shotDamage: 10 })];
    const stats = statsOf(state);
    expect(stats.shipEnemyMissBonus).toBe(0.1);
    fireEnemyWeapons(state, stats);
    // effectiveMissChance = min(1, 0.9 + 0.1) = 1.0 → every shot misses
    expect(state.ship.hull).toBe(state.ship.maxHull);
    expect(state.ship.shield).toBe(0);
  });

  it('Salvager: coin reward is +50% on kill', () => {
    const loadout: LoadoutSnapshot = {
      ...FIXTURE_LOADOUT,
      ship: { ...FIXTURE_SHIP, passiveKind: 'coin-bonus', passiveValue: 1.5 },
    };
    const state = createCoreState(FIXTURE_MISSION, loadout, 1);
    state.enemies = [makeFixtureEnemy({ hp: 5, coinReward: 10 })];
    state.ship.fireTimer = 1;
    fireShipWeapon(state, statsOf(state));
    expect(state.stats.kills).toBe(1);
    expect(state.stats.coinsEarned).toBe(15); // Math.round(10 * 1.5)
  });

  it('Warship: crit deals ×3 instead of the weapon spec critMult of ×2', () => {
    const loadout: LoadoutSnapshot = {
      ...FIXTURE_LOADOUT,
      ship: { ...FIXTURE_SHIP, passiveKind: 'crit-mult-override', passiveValue: 3.0 },
      weapon: { ...FIXTURE_WEAPON, critChance: 1.0, missChance: 0 }, // always crits
    };
    const state = createCoreState(FIXTURE_MISSION, loadout, 1);
    state.enemies = [makeFixtureEnemy({ hp: 1000, distance: 50 })];
    state.ship.fireTimer = 1;
    fireShipWeapon(state, statsOf(state));
    expect(state.stats.damageDealt).toBe(FIXTURE_WEAPON.damagePerShot * 3); // 30, not 20
  });

  it('Reactor: generator capacity is base × 1.5 in EffectiveStats', () => {
    const loadout: LoadoutSnapshot = {
      ...FIXTURE_LOADOUT,
      ship: { ...FIXTURE_SHIP, passiveKind: 'generator-capacity-bonus', passiveValue: 1.5 },
    };
    const stats = computeEffectiveStats(loadout, freshState().modifiers);
    expect(stats.generatorCapacity).toBe(FIXTURE_LOADOUT.generator.capacity * 1.5);
  });
});

describe('damageShip', () => {
  it('overflows to hull when the shield breaks, and marks the break', () => {
    const state = freshState();
    state.ship.shield = 3;
    damageShip(state, 10);
    expect(state.ship.shield).toBe(0);
    expect(state.ship.hull).toBe(state.ship.maxHull - 7);
    expect(state.shieldBroke).toBe(true);
  });

  it('does not mark a break while the shield holds', () => {
    const state = freshState();
    damageShip(state, 5);
    expect(state.shieldBroke).toBe(false);
  });
});
