import { describe, expect, it } from 'vitest';
import { damageShip, fireEnemyWeapons, fireShipWeapon, regenerateEnemies, setPriorityTarget } from './combat';
import { advanceEnemies } from './conveyor';
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

  it('Tanker: collision damage is halved by collision-reduction passive', () => {
    const baseLoadout: LoadoutSnapshot = {
      ...FIXTURE_LOADOUT,
      ship: { ...FIXTURE_SHIP, passiveKind: 'enemy-miss-bonus', passiveValue: 0 },
    };
    const tankerLoadout: LoadoutSnapshot = {
      ...FIXTURE_LOADOUT,
      ship: { ...FIXTURE_SHIP, passiveKind: 'collision-reduction', passiveValue: 0.5 },
    };
    const baseState = createCoreState(FIXTURE_MISSION, baseLoadout, 1);
    const tankerState = createCoreState(FIXTURE_MISSION, tankerLoadout, 1);
    // Use shield=0 so all damage routes to hull
    baseState.ship.shield = 0;
    tankerState.ship.shield = 0;
    const collidingEnemy = makeFixtureEnemy({ distance: 0, speed: 0, shotDamage: 10 });
    baseState.enemies = [collidingEnemy];
    tankerState.enemies = [{ ...collidingEnemy }];
    advanceEnemies(baseState, statsOf(baseState));
    advanceEnemies(tankerState, statsOf(tankerState));
    // base: hull -= 10 * 3 * 1 = 30; tanker: hull -= 10 * 3 * 0.5 = 15
    expect(baseState.ship.hull).toBe(baseState.ship.maxHull - 30);
    expect(tankerState.ship.hull).toBe(tankerState.ship.maxHull - 15);
  });
});

// Helper for one-shot damage tests — avoids repeating boilerplate.
function oneShotDmg(
  mods: Partial<ReturnType<typeof freshState>['modifiers']>,
  setup?: (s: ReturnType<typeof freshState>) => void,
): number {
  const state = freshState();
  state.modifiers = { ...state.modifiers, ...mods };
  state.enemies = [makeFixtureEnemy({ hp: 9999, coinReward: 0, distance: 50 })];
  state.ship.fireTimer = 1;
  if (setup !== undefined) setup(state);
  fireShipWeapon(state, statsOf(state));
  return state.stats.damageDealt;
}

describe('fireShipWeapon state-based damage bonuses', () => {
  it('fullEnergyDmgBonus: bonus applies at capacity, no bonus below', () => {
    const base = oneShotDmg({}, (s) => { s.ship.energy = FIXTURE_LOADOUT.generator.capacity - 1; });
    const boosted = oneShotDmg({ fullEnergyDmgBonus: 0.5 }, (s) => { s.ship.energy = FIXTURE_LOADOUT.generator.capacity; });
    const notBoosted = oneShotDmg({ fullEnergyDmgBonus: 0.5 }, (s) => { s.ship.energy = FIXTURE_LOADOUT.generator.capacity - 1; });
    expect(boosted).toBeCloseTo(base * 1.5);
    expect(notBoosted).toBeCloseTo(base);
  });

  it('lowHullDmgMult: bonus at <30% hull, none at >=30%', () => {
    const base = oneShotDmg({});
    const boosted = oneShotDmg({ lowHullDmgMult: 2 }, (s) => { s.ship.hull = Math.floor(s.ship.maxHull * 0.2); });
    const same = oneShotDmg({ lowHullDmgMult: 2 }, (s) => { s.ship.hull = Math.ceil(s.ship.maxHull * 0.5); });
    expect(boosted).toBeCloseTo(base * 2);
    expect(same).toBeCloseTo(base);
  });

  it('singleEnemyDmgBonus: bonus with 1 enemy, none with 2', () => {
    const base = oneShotDmg({});
    const boosted = oneShotDmg({ singleEnemyDmgBonus: 0.5 });
    expect(boosted).toBeCloseTo(base * 1.5);

    const state = freshState();
    state.modifiers = { ...state.modifiers, singleEnemyDmgBonus: 0.5 };
    state.enemies = [makeFixtureEnemy({ id: 1, hp: 9999 }), makeFixtureEnemy({ id: 2, hp: 9999 })];
    state.ship.fireTimer = 1;
    fireShipWeapon(state, statsOf(state));
    expect(state.stats.damageDealt).toBeCloseTo(FIXTURE_WEAPON.damagePerShot);
  });

  it('shieldActiveDmgBonus: bonus when shield > 0, none when shield = 0', () => {
    const base = oneShotDmg({}, (s) => { s.ship.shield = 0; });
    const boosted = oneShotDmg({ shieldActiveDmgBonus: 0.5 }, (s) => { s.ship.shield = 1; });
    const same = oneShotDmg({ shieldActiveDmgBonus: 0.5 }, (s) => { s.ship.shield = 0; });
    expect(boosted).toBeCloseTo(base * 1.5);
    expect(same).toBeCloseTo(base);
  });

  // ZERO BARRIER's real modifier — regression for the 2026-07-18 fix (card used to
  // wire into lowHullDmgMult, so it silently fired on low hull instead of zero shield).
  it('shieldZeroDmgMult: bonus at shield <= 0, none while any shield remains', () => {
    const base = oneShotDmg({}, (s) => { s.ship.shield = 1; });
    const boosted = oneShotDmg({ shieldZeroDmgMult: 1.4 }, (s) => { s.ship.shield = 0; });
    const same = oneShotDmg({ shieldZeroDmgMult: 1.4 }, (s) => { s.ship.shield = 1; });
    expect(boosted).toBeCloseTo(base * 1.4);
    expect(same).toBeCloseTo(base);
  });

  // PEAK CONDITION's real modifier — regression for the 2026-07-18 fix (card used to
  // wire into shieldActiveDmgBonus, so it silently fired at ANY nonzero shield, not
  // only a full one).
  it('shieldFullDmgBonus: bonus only at shield >= capacity, not merely shield > 0', () => {
    const capacity = FIXTURE_LOADOUT.shield?.capacity ?? 0;
    const base = oneShotDmg({}, (s) => { s.ship.shield = capacity - 1; });
    const boosted = oneShotDmg({ shieldFullDmgBonus: 0.35 }, (s) => { s.ship.shield = capacity; });
    const partial = oneShotDmg({ shieldFullDmgBonus: 0.35 }, (s) => { s.ship.shield = capacity - 1; });
    expect(boosted).toBeCloseTo(base * 1.35);
    expect(partial).toBeCloseTo(base);
  });

  it('shieldFullDmgBonus: never applies with no shield equipped (capacity 0 must not read as "full")', () => {
    const state = freshState();
    state.loadout = { ...FIXTURE_LOADOUT, shield: null };
    state.modifiers = { ...state.modifiers, shieldFullDmgBonus: 0.35 };
    state.enemies = [makeFixtureEnemy({ hp: 9999, coinReward: 0, distance: 50 })];
    state.ship.fireTimer = 1;
    state.ship.shield = 0;
    fireShipWeapon(state, statsOf(state));
    expect(state.stats.damageDealt).toBeCloseTo(FIXTURE_WEAPON.damagePerShot);
  });

  // Missing Phase A test plan item (fable-review-fixes-2026-07-18.md): "no
  // double-stacking with lowHullDmgMult family" — ZERO BARRIER (shieldZeroDmgMult) and
  // a low-hull card (lowHullDmgMult) are independent modifiers gated on unrelated state
  // (shield vs. hull), so a run carrying both can genuinely have both trigger at once
  // (low hull AND zero shield simultaneously) — verify they compose multiplicatively,
  // each applying exactly once, not double-counted or interfering with each other.
  it('shieldZeroDmgMult and lowHullDmgMult apply independently and exactly once when both trigger conditions hold at once', () => {
    const base = oneShotDmg({}, (s) => { s.ship.hull = Math.ceil(s.ship.maxHull * 0.5); s.ship.shield = 1; });
    const bothActive = oneShotDmg(
      { shieldZeroDmgMult: 1.4, lowHullDmgMult: 2 },
      (s) => { s.ship.hull = Math.floor(s.ship.maxHull * 0.2); s.ship.shield = 0; },
    );
    // Each factor's own isolated effect, confirmed separately elsewhere in this file —
    // composed here checks they multiply together (1.4 × 2 = 2.8×), not stack additively
    // (3.4×) or have one silently override the other (1.4× or 2× alone).
    expect(bothActive).toBeCloseTo(base * 1.4 * 2);
  });

  it('shieldZeroDmgMult does not apply when only the hull condition holds (shield still up)', () => {
    const base = oneShotDmg({}, (s) => { s.ship.hull = Math.floor(s.ship.maxHull * 0.2); s.ship.shield = 1; });
    const onlyLowHull = oneShotDmg(
      { shieldZeroDmgMult: 1.4, lowHullDmgMult: 2 },
      (s) => { s.ship.hull = Math.floor(s.ship.maxHull * 0.2); s.ship.shield = 1; },
    );
    expect(onlyLowHull).toBeCloseTo(base * 2);
  });

  it('lowHullDmgMult does not apply when only the shield condition holds (hull still healthy)', () => {
    const base = oneShotDmg({}, (s) => { s.ship.hull = Math.ceil(s.ship.maxHull * 0.5); s.ship.shield = 0; });
    const onlyZeroShield = oneShotDmg(
      { shieldZeroDmgMult: 1.4, lowHullDmgMult: 2 },
      (s) => { s.ship.hull = Math.ceil(s.ship.maxHull * 0.5); s.ship.shield = 0; },
    );
    expect(onlyZeroShield).toBeCloseTo(base * 1.4);
  });
});

describe('fireShipWeapon situational and targeting modifiers', () => {
  it('blockerDamageMult: bonus vs enemies with blocksConveyor', () => {
    const state = freshState();
    state.modifiers = { ...state.modifiers, blockerDamageMult: 2 };
    state.enemies = [makeFixtureEnemy({ hp: 9999, blocksConveyor: true })];
    state.ship.fireTimer = 1;
    fireShipWeapon(state, statsOf(state));
    expect(state.stats.damageDealt).toBeCloseTo(FIXTURE_WEAPON.damagePerShot * 2);
  });

  it('bossDamageMult: bonus vs boss enemies', () => {
    const state = freshState();
    state.modifiers = { ...state.modifiers, bossDamageMult: 3 };
    state.enemies = [makeFixtureEnemy({ hp: 9999, isBoss: true })];
    state.ship.fireTimer = 1;
    fireShipWeapon(state, statsOf(state));
    expect(state.stats.damageDealt).toBeCloseTo(FIXTURE_WEAPON.damagePerShot * 3);
  });

  it('highHpEnemyDamageMult: bonus when enemy > 50% HP, none at exactly 50%', () => {
    const stateHigh = freshState();
    stateHigh.modifiers = { ...stateHigh.modifiers, highHpEnemyDamageMult: 1.5 };
    stateHigh.enemies = [makeFixtureEnemy({ hp: 100, maxHp: 100 })];
    stateHigh.ship.fireTimer = 1;
    fireShipWeapon(stateHigh, statsOf(stateHigh));
    expect(stateHigh.stats.damageDealt).toBeCloseTo(FIXTURE_WEAPON.damagePerShot * 1.5);

    const stateLow = freshState();
    stateLow.modifiers = { ...stateLow.modifiers, highHpEnemyDamageMult: 1.5 };
    stateLow.enemies = [makeFixtureEnemy({ hp: 50, maxHp: 100 })]; // exactly 50% — not above
    stateLow.ship.fireTimer = 1;
    fireShipWeapon(stateLow, statsOf(stateLow));
    expect(stateLow.stats.damageDealt).toBeCloseTo(FIXTURE_WEAPON.damagePerShot);
  });

  it('noShieldPierceAll: hits all enemies when shield is 0', () => {
    const state = freshState();
    state.modifiers = { ...state.modifiers, noShieldPierceAll: true };
    state.ship.shield = 0;
    state.enemies = [
      makeFixtureEnemy({ id: 1, hp: 9999 }),
      makeFixtureEnemy({ id: 2, hp: 9999 }),
      makeFixtureEnemy({ id: 3, hp: 9999 }),
    ];
    state.ship.fireTimer = 1;
    fireShipWeapon(state, statsOf(state));
    expect(state.stats.damageDealt).toBeCloseTo(FIXTURE_WEAPON.damagePerShot * 3);
  });
});

describe('fireShipWeapon kill and shot effect modifiers', () => {
  it('killExplosionDamage: surviving enemies take explosion damage on kill', () => {
    const state = freshState();
    state.modifiers = { ...state.modifiers, killExplosionDamage: 5 };
    state.enemies = [
      makeFixtureEnemy({ id: 1, hp: 5, distance: 10 }),
      makeFixtureEnemy({ id: 2, hp: 100, distance: 50 }),
    ];
    state.ship.fireTimer = 1;
    fireShipWeapon(state, statsOf(state));
    expect(state.enemies.find((e) => e.id === 2)?.hp).toBe(95);
  });

  it('hullPerKill: hull is restored on each kill', () => {
    const state = freshState();
    state.modifiers = { ...state.modifiers, hullPerKill: 10 };
    state.ship.hull = 50;
    state.enemies = [makeFixtureEnemy({ hp: 5 })];
    state.ship.fireTimer = 1;
    fireShipWeapon(state, statsOf(state));
    expect(state.ship.hull).toBe(60);
  });

  it('nthKillShieldInterval: shield restored on every Nth kill, not before', () => {
    const state = freshState();
    state.modifiers = { ...state.modifiers, nthKillShieldInterval: 2, nthKillShieldAmount: 8 };
    state.ship.shield = 0;
    state.enemies = [makeFixtureEnemy({ hp: 1 })];
    state.ship.fireTimer = 1;
    fireShipWeapon(state, statsOf(state)); // kill #1 — no restore
    expect(state.ship.shield).toBe(0);
    state.enemies = [makeFixtureEnemy({ hp: 1 })];
    state.ship.fireTimer = 1;
    fireShipWeapon(state, statsOf(state)); // kill #2 — restore
    expect(state.ship.shield).toBe(8);
  });

  it('freeEveryNthShot: Nth shot costs 0 energy', () => {
    const state = freshState();
    state.modifiers = { ...state.modifiers, freeEveryNthShot: 3 };
    state.ship.energy = 50;
    const stats = statsOf(state);
    state.enemies = [makeFixtureEnemy({ hp: 9999 })];
    state.ship.fireTimer = 1; fireShipWeapon(state, stats);
    const afterShot1 = state.ship.energy;
    state.ship.fireTimer = 1; fireShipWeapon(state, stats);
    const afterShot2 = state.ship.energy;
    state.ship.fireTimer = 1; fireShipWeapon(state, stats); // free
    expect(state.ship.energy).toBeCloseTo(afterShot2);
    expect(afterShot1).toBeLessThan(50);
  });

  it('nthShotShieldInterval: shield restored every N shots', () => {
    const state = freshState();
    state.modifiers = { ...state.modifiers, nthShotShieldInterval: 2, nthShotShieldAmount: 6 };
    state.ship.shield = 0;
    const stats = statsOf(state);
    state.enemies = [makeFixtureEnemy({ hp: 9999 })];
    state.ship.fireTimer = 1; fireShipWeapon(state, stats); // shot 1 — no restore
    expect(state.ship.shield).toBe(0);
    state.ship.fireTimer = 1; fireShipWeapon(state, stats); // shot 2 — restore
    expect(state.ship.shield).toBe(6);
  });

  it('lowHullFireRateMult: fire interval halves at low hull', () => {
    const state = freshState();
    state.modifiers = { ...state.modifiers, lowHullFireRateMult: 2 };
    state.ship.hull = Math.floor(state.ship.maxHull * 0.2);
    state.ship.energy = 50;
    state.enemies = [makeFixtureEnemy({ hp: 9999 })];
    const stats = statsOf(state);
    state.ship.fireTimer = 1;
    fireShipWeapon(state, stats);
    expect(state.ship.fireTimer).toBeCloseTo(FIXTURE_WEAPON.ticksBetweenShots / 2);
  });
});

describe('fireShipWeapon time-progress and count modifiers', () => {
  it('earlyBirdDmgBonus: bonus in first 25% of mission timeline', () => {
    // FIXTURE_MISSION last event at seconds(24)=240 ticks; <25% → timelineTick < 60
    const state = freshState();
    state.modifiers = { ...state.modifiers, earlyBirdDmgBonus: 0.5 };
    state.timelineTick = 10; // 10/240 ≈ 4% → early
    state.enemies = [makeFixtureEnemy({ hp: 9999 })];
    state.ship.fireTimer = 1;
    fireShipWeapon(state, statsOf(state));
    expect(state.stats.damageDealt).toBeCloseTo(FIXTURE_WEAPON.damagePerShot * 1.5);
  });

  it('earlyBirdDmgBonus: no bonus in middle of mission', () => {
    const state = freshState();
    state.modifiers = { ...state.modifiers, earlyBirdDmgBonus: 0.5 };
    state.timelineTick = 120; // 50% → not early
    state.enemies = [makeFixtureEnemy({ hp: 9999 })];
    state.ship.fireTimer = 1;
    fireShipWeapon(state, statsOf(state));
    expect(state.stats.damageDealt).toBeCloseTo(FIXTURE_WEAPON.damagePerShot);
  });

  it('finalPushDmgBonus: bonus in last 25% of mission timeline', () => {
    const state = freshState();
    state.modifiers = { ...state.modifiers, finalPushDmgBonus: 0.5 };
    state.timelineTick = 230; // 230/240 ≈ 96% → final push
    state.enemies = [makeFixtureEnemy({ hp: 9999 })];
    state.ship.fireTimer = 1;
    fireShipWeapon(state, statsOf(state));
    expect(state.stats.damageDealt).toBeCloseTo(FIXTURE_WEAPON.damagePerShot * 1.5);
  });

  it('manyEnemiesExtraTargets: extra targets hit when 6+ enemies present', () => {
    const state = freshState();
    state.modifiers = { ...state.modifiers, manyEnemiesExtraTargets: 2 }; // +2 targets
    // 6 enemies: normally maxTargets=1, with bonus=2 → 3 targets hit
    state.enemies = Array.from({ length: 6 }, (_, i) => makeFixtureEnemy({ id: i + 1, hp: 9999, distance: 50 + i * 5 }));
    state.loadout = { ...FIXTURE_LOADOUT, weapon: { ...FIXTURE_WEAPON, falloffPerTarget: 1.0 } };
    state.ship.fireTimer = 1;
    fireShipWeapon(state, statsOf(state));
    expect(state.stats.damageDealt).toBeCloseTo(FIXTURE_WEAPON.damagePerShot * 3); // 1 + 2 = 3 targets
  });

  it('nthWaveClearRefillInterval: energy refills to capacity on every Nth wave clear', () => {
    const state = freshState();
    state.modifiers = { ...state.modifiers, nthWaveClearRefillInterval: 1 }; // every 1 wave
    state.ship.energy = 0;
    state.enemies = [makeFixtureEnemy({ hp: 5 })];
    state.ship.fireTimer = 1;
    fireShipWeapon(state, statsOf(state)); // kills last enemy → wave cleared
    expect(state.ship.energy).toBe(statsOf(state).generatorCapacity); // refilled
  });
});

describe('fireShipWeapon haywireTargeting', () => {
  it('haywireTargeting: always hits exactly 1 enemy (random pick, not front-most)', () => {
    const state = freshState();
    state.modifiers = { ...state.modifiers, haywireTargeting: true };
    state.enemies = [
      makeFixtureEnemy({ id: 1, hp: 9999, distance: 10 }),
      makeFixtureEnemy({ id: 2, hp: 9999, distance: 50 }),
      makeFixtureEnemy({ id: 3, hp: 9999, distance: 90 }),
    ];
    state.ship.fireTimer = 1;
    fireShipWeapon(state, statsOf(state));
    // Exactly 1 enemy takes damage regardless of which one was picked
    const damagedCount = state.enemies.filter((e) => e.hp < 9999).length;
    expect(damagedCount).toBe(1);
    expect(state.stats.damageDealt).toBeCloseTo(FIXTURE_WEAPON.damagePerShot);
  });
});

describe('setPriorityTarget', () => {
  it('sets priorityTargetId and records a tap with the current tick', () => {
    const state = freshState();
    state.tick = 42;
    setPriorityTarget(state, 7);
    expect(state.priorityTargetId).toBe(7);
    expect(state.priorityTargetTaps).toContainEqual({ tick: 42, enemyId: 7 });
  });

  it('null clears the mark and is recorded the same way', () => {
    const state = freshState();
    setPriorityTarget(state, 7);
    setPriorityTarget(state, null);
    expect(state.priorityTargetId).toBeNull();
    expect(state.priorityTargetTaps).toHaveLength(2);
    expect(state.priorityTargetTaps[1]).toEqual({ tick: state.tick, enemyId: null });
  });
});

describe('fireShipWeapon priority targeting', () => {
  it('hits the marked enemy even when it is not front-most', () => {
    const state = freshState();
    state.enemies = [
      makeFixtureEnemy({ id: 1, hp: 9999, distance: 10 }), // front-most
      makeFixtureEnemy({ id: 2, hp: 9999, distance: 90 }), // marked, deep in the queue
    ];
    setPriorityTarget(state, 2);
    state.ship.fireTimer = 1;
    fireShipWeapon(state, statsOf(state));
    const marked = state.enemies.find((e) => e.id === 2);
    const frontMost = state.enemies.find((e) => e.id === 1);
    expect(marked?.hp).toBeLessThan(9999);
    expect(frontMost?.hp).toBe(9999); // single-target weapon: only the marked enemy is hit
  });

  it('falls back to front-most when the marked enemy is no longer present (soft priority)', () => {
    const state = freshState();
    state.enemies = [
      makeFixtureEnemy({ id: 1, hp: 9999, distance: 10 }),
    ];
    setPriorityTarget(state, 999); // marked enemy doesn't exist / already dead
    state.ship.fireTimer = 1;
    fireShipWeapon(state, statsOf(state));
    expect(state.enemies.find((e) => e.id === 1)?.hp).toBeLessThan(9999); // never wastes the shot
  });

  it('marked target takes slot 0 (full damage, no falloff) when multiple targets are hit', () => {
    const state = freshState();
    state.loadout = { ...state.loadout, weapon: { ...FIXTURE_WEAPON, maxTargets: 2, falloffPerTarget: 0.5 } };
    state.enemies = [
      makeFixtureEnemy({ id: 1, hp: 9999, distance: 10 }), // front-most
      makeFixtureEnemy({ id: 2, hp: 9999, distance: 20 }), // 2nd front-most
      makeFixtureEnemy({ id: 3, hp: 9999, distance: 90 }), // marked, deepest
    ];
    setPriorityTarget(state, 3);
    state.ship.fireTimer = 1;
    fireShipWeapon(state, statsOf(state));
    const marked = state.enemies.find((e) => e.id === 3); // slot 0: the priority target
    const frontMost = state.enemies.find((e) => e.id === 1); // fills the 1 remaining slot
    const secondClosest = state.enemies.find((e) => e.id === 2); // squeezed out — only 1 slot left
    // Marked enemy (slot 0) takes full, un-falloff'd damage.
    expect(9999 - (marked?.hp ?? 9999)).toBeCloseTo(FIXTURE_WEAPON.damagePerShot);
    // The single remaining slot fills from front-most (id 1), excluding the marked enemy.
    expect(frontMost?.hp).toBeLessThan(9999);
    expect(secondClosest?.hp).toBe(9999); // maxTargets=2 total: marked + 1 front-most, no room left
  });
});

describe('regenerateEnemies: booster buff-ahead mechanic', () => {
  it('booster grants its regenPerTick to the nearest enemy ahead, not to itself', () => {
    const state = freshState();
    state.enemies = [
      makeFixtureEnemy({ id: 1, kind: 'fodder', hp: 50, maxHp: 100, distance: 10 }), // ahead
      makeFixtureEnemy({ id: 2, kind: 'booster', hp: 50, maxHp: 100, distance: 50, regenPerTick: 5 }),
    ];
    regenerateEnemies(state);
    const target = state.enemies.find((e) => e.id === 1);
    const booster = state.enemies.find((e) => e.id === 2);
    expect(target?.hp).toBe(55); // healed
    expect(booster?.hp).toBe(50); // unchanged — booster never heals itself
  });

  it('does nothing when the booster is already the closest enemy on the lane (nothing ahead of it)', () => {
    const state = freshState();
    state.enemies = [
      makeFixtureEnemy({ id: 1, kind: 'booster', hp: 50, maxHp: 100, distance: 10, regenPerTick: 5 }),
      makeFixtureEnemy({ id: 2, kind: 'fodder', hp: 50, maxHp: 100, distance: 50 }), // behind, not ahead
    ];
    regenerateEnemies(state);
    expect(state.enemies.find((e) => e.id === 1)?.hp).toBe(50);
    expect(state.enemies.find((e) => e.id === 2)?.hp).toBe(50);
  });

  it('no stacking: two boosters targeting the same nearest-ahead enemy chain instead of double-feeding it directly', () => {
    // A (dist 90) and B (dist 92) both sit behind target C (dist 50), with nothing
    // between them. B's nearest-ahead is A (dist 90 < 92), not C — so C is only ever
    // buffed once, directly, by A; B's regen chains into A instead of stacking onto C.
    const state = freshState();
    state.enemies = [
      makeFixtureEnemy({ id: 1, kind: 'fodder', hp: 50, maxHp: 100, distance: 50 }), // C
      makeFixtureEnemy({ id: 2, kind: 'booster', hp: 50, maxHp: 100, distance: 90, regenPerTick: 5 }), // A
      makeFixtureEnemy({ id: 3, kind: 'booster', hp: 50, maxHp: 100, distance: 92, regenPerTick: 7 }), // B
    ];
    regenerateEnemies(state);
    expect(state.enemies.find((e) => e.id === 1)?.hp).toBe(55); // C: +5 from A only, once
    expect(state.enemies.find((e) => e.id === 2)?.hp).toBe(57); // A: +7 from B (booster-buffs-booster)
    expect(state.enemies.find((e) => e.id === 3)?.hp).toBe(50); // B: nothing ahead of it, unchanged
  });

  it('overtake case: buff target updates live as a faster enemy passes the booster', () => {
    const state = freshState();
    state.enemies = [
      // Distance is measured from the ship — smaller is closer/"ahead". Enemy 1 starts
      // BEHIND the booster (distance 80 > booster's 70), so it starts out of range.
      makeFixtureEnemy({ id: 1, kind: 'fodder', hp: 50, maxHp: 100, distance: 80 }),
      makeFixtureEnemy({ id: 2, kind: 'booster', hp: 50, maxHp: 100, distance: 70, regenPerTick: 5 }),
    ];
    regenerateEnemies(state);
    // Not yet ahead (80 > 70) — booster has nothing to buff.
    expect(state.enemies.find((e) => e.id === 1)?.hp).toBe(50);

    // The fast enemy overtakes the (stationary in this test) booster, moving to a
    // smaller distance — now closer to the ship than the booster.
    const overtaking = state.enemies.find((e) => e.id === 1);
    if (overtaking !== undefined) overtaking.distance = 40;
    regenerateEnemies(state);
    // Now ahead (40 < 70) — the booster's target picks it up live, no re-spawn or
    // re-pairing needed, exactly the recomputed-every-tick guarantee decision #14 requires.
    expect(state.enemies.find((e) => e.id === 1)?.hp).toBe(55);
  });
});

describe('fireShipWeapon coin and energy on-kill modifiers', () => {
  it('blockerCoinMult: coins from blocker kill are multiplied', () => {
    const state = freshState();
    state.modifiers = { ...state.modifiers, blockerCoinMult: 2 };
    state.enemies = [makeFixtureEnemy({ hp: 5, blocksConveyor: true, coinReward: 10 })];
    state.ship.fireTimer = 1;
    fireShipWeapon(state, statsOf(state));
    expect(state.stats.coinsEarned).toBe(20); // 10 × 2
  });

  it('coinsEnergyRestore: energy is restored proportional to coins earned on kill', () => {
    const state = freshState();
    state.modifiers = { ...state.modifiers, coinsEnergyRestore: 1 }; // 1 energy per coin
    state.ship.energy = 0;
    state.enemies = [makeFixtureEnemy({ hp: 5, coinReward: 8 })];
    state.ship.fireTimer = 1;
    fireShipWeapon(state, statsOf(state));
    // Weapon cost clamps energy to 0 (can't go negative), then on-kill restores 8 × 1 = 8
    expect(state.ship.energy).toBeCloseTo(8);
  });

  it('extraEnergyOnBlockerKill: flat energy burst on blocker death', () => {
    const state = freshState();
    state.modifiers = { ...state.modifiers, extraEnergyOnBlockerKill: 15 };
    state.ship.energy = 0;
    state.enemies = [makeFixtureEnemy({ hp: 5, blocksConveyor: true, coinReward: 0 })];
    state.ship.fireTimer = 1;
    fireShipWeapon(state, statsOf(state));
    // Weapon cost clamps to 0, then on-kill blocker gives +15 energy
    expect(state.ship.energy).toBeCloseTo(15);
  });

  it('hullDamagePerShot: hull decreases by flat amount each shot', () => {
    const state = freshState();
    state.modifiers = { ...state.modifiers, hullDamagePerShot: 3 };
    state.enemies = [makeFixtureEnemy({ hp: 9999 })];
    state.ship.fireTimer = 1;
    fireShipWeapon(state, statsOf(state));
    expect(state.ship.hull).toBe(state.ship.maxHull - 3);
  });

  it('killDmgPerKillPct: damage scales with total kill count', () => {
    const state = freshState();
    state.modifiers = { ...state.modifiers, killDmgPerKillPct: 100 }; // +100% per kill
    state.stats.kills = 2; // 2 prior kills → mult = 1 + 2×1.0 = 3
    state.enemies = [makeFixtureEnemy({ hp: 9999 })];
    state.ship.fireTimer = 1;
    fireShipWeapon(state, statsOf(state));
    expect(state.stats.damageDealt).toBeCloseTo(FIXTURE_WEAPON.damagePerShot * 3);
  });

  it('momentumDmgPerKillPct: damage scales with consecutive kill streak', () => {
    const state = freshState();
    state.modifiers = { ...state.modifiers, momentumDmgPerKillPct: 100 }; // +100% per streak
    state.consecutiveKills = 1; // 1 streak kill → mult = 1 + 1×1.0 = 2
    state.enemies = [makeFixtureEnemy({ hp: 9999 })];
    state.ship.fireTimer = 1;
    fireShipWeapon(state, statsOf(state));
    expect(state.stats.damageDealt).toBeCloseTo(FIXTURE_WEAPON.damagePerShot * 2);
  });

  // Regression for the 2026-07-18 fix: the view's coin popup used to read an enemy's
  // raw spec coinReward on ANY death, including collision self-deaths that never
  // credit coins. It now reads this event instead.
  it('a real weapon kill emits an enemy-killed visual event carrying the actual credited coins', () => {
    const state = freshState();
    state.modifiers = { ...state.modifiers, blockerCoinMult: 2 };
    state.enemies = [makeFixtureEnemy({ id: 7, hp: 5, blocksConveyor: true, coinReward: 10 })];
    state.ship.fireTimer = 1;
    fireShipWeapon(state, statsOf(state));
    const event = state.pendingVisualEvents.find((e) => e.kind === 'enemy-killed');
    expect(event).toEqual({ kind: 'enemy-killed', enemyId: 7, coins: 20 }); // 10 × blockerCoinMult 2
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
