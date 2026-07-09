import { describe, expect, it } from 'vitest';
import { missionById } from '../data/missions';
import { resolveForcedLoadout } from '../data/loadouts';
import { createCoreState } from './state';
import { advanceTick } from './tick';
import { FIXTURE_MISSION } from './fixtures';
import type { LoadoutSnapshot } from './types';

// Controlled loadout for exact pulse accounting — zero motor draw, zero weapon drain.
const PULSE_SHIELD = { id: 'fix-shield', capacity: 30, pulseShieldFraction: 0.1 };
const PULSE_LOADOUT: LoadoutSnapshot = {
  ship: { id: 'fix-ship', kind: 'interceptor', level: 1, name: 'Test', hull: 100, price: 0, passiveKind: 'enemy-miss-bonus', passiveValue: 0, passiveDescription: '', blurb: '' },
  weapon: null, // no weapon — isolates energy to generator + pulse only
  rearWeapon: null,
  sideWeapon: null,
  generator: { id: 'fix-gen', outputPerTick: 2, capacity: 50, pulseDrainFraction: 0.5 },
  shield: PULSE_SHIELD,
  motor: { id: 'fix-motor', timelineMultiplier: 1, powerDrawPerTick: 0 },
  supplies: [],
  subscriptionCardIds: [],
};

// ── Pulse trigger threshold ───────────────────────────────────────────────────

describe('pulse trigger threshold', () => {
  it('pulse does NOT fire when energy is below generatorCapacity', () => {
    const state = createCoreState(FIXTURE_MISSION, PULSE_LOADOUT, 1, []);
    state.ship.energy = PULSE_LOADOUT.generator.capacity - 3; // 47 — two gen ticks needed
    state.ship.shield = 0;

    advanceTick(state); // energy → 49 (still below 50)

    expect(state.ship.shield).toBe(0); // no pulse
    expect(state.ship.energy).toBe(49);
  });

  it('pulse fires on the exact tick energy reaches generatorCapacity', () => {
    const state = createCoreState(FIXTURE_MISSION, PULSE_LOADOUT, 1, []);
    state.ship.energy = PULSE_LOADOUT.generator.capacity - 2; // 48 — one gen tick fills it
    state.ship.shield = 0;

    advanceTick(state); // energy → 50 → pulse fires

    expect(state.ship.shield).toBeGreaterThan(0); // pulse fired
  });
});

// ── pulseDrainFraction ────────────────────────────────────────────────────────

describe('pulseDrainFraction', () => {
  it('drains generatorCapacity × pulseDrainFraction from energy on pulse', () => {
    const state = createCoreState(FIXTURE_MISSION, PULSE_LOADOUT, 1, []);
    // Start at capacity so pulse fires on tick 1 (regenerate first, then pulse check)
    state.ship.energy = PULSE_LOADOUT.generator.capacity;
    state.ship.shield = 0;

    advanceTick(state);

    // regenerateEnergy: 50 → 50 (capped); pulseShield fires; energy = 50 − 25 = 25
    expect(state.ship.energy).toBe(25);
  });

  it('pulseShieldFraction adds correct shield amount', () => {
    const state = createCoreState(FIXTURE_MISSION, PULSE_LOADOUT, 1, []);
    state.ship.energy = PULSE_LOADOUT.generator.capacity;
    state.ship.shield = 0;

    advanceTick(state);

    // gain = 0.1 × 30 = 3
    expect(state.ship.shield).toBe(3);
  });
});

// ── Shield already at capacity ────────────────────────────────────────────────

describe('pulse when shield is full', () => {
  it('pulse does NOT fire when shield is already at capacity', () => {
    const state = createCoreState(FIXTURE_MISSION, PULSE_LOADOUT, 1, []);
    state.ship.energy = PULSE_LOADOUT.generator.capacity;
    state.ship.shield = PULSE_SHIELD.capacity; // already full

    advanceTick(state);

    // Pulse check: shield >= shieldCapacity → skip. No energy drained by pulse.
    expect(state.ship.shield).toBe(PULSE_SHIELD.capacity);
    // Generator adds 2, but capacity cap means energy stays at 50
    expect(state.ship.energy).toBe(PULSE_LOADOUT.generator.capacity);
  });
});

// ── pulseShieldFraction clamp ─────────────────────────────────────────────────

describe('pulse clamping', () => {
  it('shield never exceeds capacity even when fraction would overshoot', () => {
    const state = createCoreState(FIXTURE_MISSION, PULSE_LOADOUT, 1, []);
    state.ship.energy = PULSE_LOADOUT.generator.capacity;
    // 1 below capacity: fraction × capacity = 3, but only 1 space left
    state.ship.shield = PULSE_SHIELD.capacity - 1; // 29

    advanceTick(state);

    expect(state.ship.shield).toBe(PULSE_SHIELD.capacity); // clamped at 30
  });
});

// ── Nova Wave: maxTargets = Infinity, falloffPerTarget = 1.0 ─────────────────

const NOVA_LOADOUT: LoadoutSnapshot = {
  ...PULSE_LOADOUT,
  weapon: {
    id: 'nova-test',
    kind: 'nova',
    damagePerShot: 10,
    ticksBetweenShots: 5,
    energyPerShot: 0,
    maxTargets: Infinity,
    falloffPerTarget: 1.0,
    critChance: 0,
    missChance: 0,
    critMult: 2.0,
  },
  generator: { id: 'fix-gen', outputPerTick: 0, capacity: 9999, pulseDrainFraction: 0 },
};

const UNKILLABLE_ENEMY = (id: number, distance: number) => ({
  id,
  kind: 'fodder' as const,
  hp: 9999,
  maxHp: 9999,
  distance,
  speed: 0,
  shootTimer: 999,
  ticksBetweenShots: 999,
  blocksConveyor: false,
  coinReward: 0,
  isBoss: false,
  regenPerTick: 0,
  shotDamage: 0,
  critChance: 0,
  missChance: 0,
  critMult: 1,
});

describe('Nova Wave weapon', () => {
  it('hits ALL live enemies when maxTargets = Infinity', () => {
    const state = createCoreState(FIXTURE_MISSION, NOVA_LOADOUT, 1, []);
    state.autoShieldEnabled = false;
    state.ship.energy = 9999;
    state.enemies = [
      UNKILLABLE_ENEMY(1, 50),
      UNKILLABLE_ENEMY(2, 40),
      UNKILLABLE_ENEMY(3, 30),
      UNKILLABLE_ENEMY(4, 20),
    ];

    // Run exactly ticksBetweenShots ticks so weapon fires once
    for (let i = 0; i < 5; i++) advanceTick(state);

    expect(state.stats.damageDealt).toBe(40); // 4 × 10
    expect(state.enemies.every((e) => e.hp === 9999 - 10)).toBe(true);
  });

  it('falloffPerTarget = 1.0: all targets take equal damage regardless of hit order', () => {
    const state = createCoreState(FIXTURE_MISSION, NOVA_LOADOUT, 1, []);
    state.autoShieldEnabled = false;
    state.ship.energy = 9999;
    state.enemies = [
      UNKILLABLE_ENEMY(1, 50),
      UNKILLABLE_ENEMY(2, 25),
    ];

    for (let i = 0; i < 5; i++) advanceTick(state);

    // falloff = 1.0^0 = 1.0 for first; 1.0^1 = 1.0 for second — identical damage
    expect(state.enemies[0]?.hp).toBe(9999 - 10);
    expect(state.enemies[1]?.hp).toBe(9999 - 10);
  });
});

// ── t1 forced loadout: null weapon ───────────────────────────────────────────

describe('tutorial t1 forced loadout', () => {
  it('resolves to null weapon and fireShipWeapon skips without error', () => {
    const mission = missionById('t1');
    if (mission.forcedLoadout === undefined) throw new Error('t1 must have forcedLoadout');
    const loadout = resolveForcedLoadout(mission.forcedLoadout);
    expect(loadout.weapon).toBeNull();

    const state = createCoreState(mission, loadout, 1, []);
    for (let i = 0; i < 50; i++) advanceTick(state); // must not throw

    expect(state.stats.shotsFired).toBe(0);
  });
});
