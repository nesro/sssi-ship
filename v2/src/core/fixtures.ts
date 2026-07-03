// Test fixtures — small, stable specs that core tests control completely.
// Production data lives in src/data/; tests must not depend on demo balance numbers.

import { TICKS_PER_SECOND } from './constants';
import type {
  EnemySpec,
  EnemyState,
  LoadoutSnapshot,
  MissionSpec,
  ShipSpec,
} from './types';

const seconds = (n: number): number => n * TICKS_PER_SECOND;

export const FIXTURE_SHIP: ShipSpec = {
  id: 'fix-ship',
  kind: 'interceptor',
  level: 1,
  name: 'Test Ship',
  hull: 100,
  price: 0,
  passiveKind: 'enemy-miss-bonus',
  passiveValue: 0,
  passiveDescription: 'No passive',
};

export const FIXTURE_WEAPON: NonNullable<LoadoutSnapshot['weapon']> = {
  id: 'fix-laser',
  kind: 'pulse',
  damagePerShot: 10,
  ticksBetweenShots: 5,
  energyPerShot: 6,
  maxTargets: 1,
  falloffPerTarget: 1,
  critChance: 0,
  missChance: 0,
  critMult: 2.0,
};

export const FIXTURE_REAR_WEAPON: NonNullable<LoadoutSnapshot['rearWeapon']> = {
  id: 'fix-rear',
  kind: 'grenade',
  damagePerShot: 8,
  ticksBetweenShots: 10,
  energyPerShot: 8,
  maxTargets: 3,
  falloffPerTarget: 0.8,
  critChance: 0,
  missChance: 0,
  critMult: 2.0,
};

export const FIXTURE_LOADOUT: LoadoutSnapshot = {
  ship: FIXTURE_SHIP,
  weapon: FIXTURE_WEAPON,
  rearWeapon: null,
  shield: { id: 'fix-shield', capacity: 30, pulseShieldFraction: 0.1 },
  generator: { id: 'fix-generator', outputPerTick: 2, capacity: 50, pulseDrainFraction: 0.5 },
  motor: { id: 'fix-motor', timelineMultiplier: 1, powerDrawPerTick: 0.3 },
  supplies: [],
  subscriptionCardIds: [],
};

export const FIXTURE_FODDER: EnemySpec = {
  kind: 'fodder',
  hp: 20,
  speed: 1.2,
  shotDamage: 2,
  ticksBetweenShots: seconds(2),
  blocksConveyor: false,
  coinReward: 5,
  critChance: 0,
  missChance: 0,
  critMult: 2.0,
};

export const FIXTURE_BLOCKER: EnemySpec = {
  kind: 'blocker',
  hp: 120,
  speed: 0.5,
  shotDamage: 4,
  ticksBetweenShots: seconds(1.5),
  blocksConveyor: true,
  coinReward: 25,
  critChance: 0,
  missChance: 0,
  critMult: 2.0,
};

export const FIXTURE_MISSION: MissionSpec = {
  id: 'fixture-1',
  name: 'Fixture Mission',
  blurb: 'Test conveyor with a blocker.',
  enemyKinds: { fodder: FIXTURE_FODDER, blocker: FIXTURE_BLOCKER },
  events: [
    { atTimelineTick: seconds(2), kind: 'fodder', count: 3, spacing: 15 },
    { atTimelineTick: seconds(10), kind: 'fodder', count: 4, spacing: 12 },
    { atTimelineTick: seconds(18), kind: 'blocker', count: 1, spacing: 0 },
    { atTimelineTick: seconds(24), kind: 'fodder', count: 5, spacing: 10 },
  ],
  supportCallTicks: [],
  stars: [
    { id: 'fix-hull-50', family: 'hull-above', threshold: 0.5 },
    { id: 'fix-hull-90', family: 'hull-above', threshold: 0.9 },
    { id: 'fix-all-kills', family: 'all-kills', threshold: 0 },
    { id: 'fix-shield', family: 'shield-unbroken', threshold: 0 },
  ],
  completionCoins: 50,
  starGate: 0,
};

export function makeFixtureEnemy(overrides: Partial<EnemyState>): EnemyState {
  return {
    id: 1,
    kind: 'fodder',
    distance: 50,
    hp: 100,
    maxHp: 100,
    shootTimer: 10,
    speed: 1,
    shotDamage: 2,
    ticksBetweenShots: 10,
    blocksConveyor: false,
    coinReward: 5,
    isBoss: false,
    regenPerTick: 0,
    critChance: 0,
    missChance: 0,
    critMult: 2.0,
    ...overrides,
  };
}
