import { TICKS_PER_SECOND } from '../core/constants';
import type {
  EnemyGeneratorKind,
  EnemyGeneratorModule,
  EnemyMotorKind,
  EnemyMotorModule,
  EnemyShieldKind,
  EnemyShieldModule,
  EnemyWeaponKind,
  EnemyWeaponModule,
} from '../core/types';

const seconds = (n: number): number => n * TICKS_PER_SECOND;

/** Named catalog entries for hand-authored modular enemies (docs/plans/
 * modular-enemies.md). Not exhaustive or load-bearing on their own — a mission can
 * still pass an ad-hoc module object to composeEnemy instead of one of these; the
 * catalog exists so combinations have readable, reusable names. */
export const ENEMY_WEAPONS: Record<EnemyWeaponKind, EnemyWeaponModule> = {
  stinger: { kind: 'stinger', shotDamage: 3, ticksBetweenShots: seconds(1.5), critChance: 0.05, missChance: 0, critMult: 2.0 },
  battery: { kind: 'battery', shotDamage: 6, ticksBetweenShots: seconds(2.2), critChance: 0.1, missChance: 0.05, critMult: 2.0 },
  lance: { kind: 'lance', shotDamage: 10, ticksBetweenShots: seconds(3), critChance: 0.15, missChance: 0, critMult: 2.2 },
};

export const ENEMY_SHIELDS: Record<EnemyShieldKind, EnemyShieldModule> = {
  aegis: { kind: 'aegis', capacity: 20 },
  barrier: { kind: 'barrier', capacity: 45 },
  ward: { kind: 'ward', capacity: 80 },
};

export const ENEMY_GENERATORS: Record<EnemyGeneratorKind, EnemyGeneratorModule> = {
  none: { kind: 'none', regenPerTick: 0 },
  'self-regen': { kind: 'self-regen', regenPerTick: 2 },
  'ally-regen': { kind: 'ally-regen', regenPerTick: 3 },
  'shield-regen': { kind: 'shield-regen', regenPerTick: 1.5 },
};

export const ENEMY_MOTORS: Record<EnemyMotorKind, EnemyMotorModule> = {
  steady: { kind: 'steady', speed: 1.2 },
  'stall-cycle': { kind: 'stall-cycle', speed: 0.25 },
  rush: { kind: 'rush', speed: 2.4 },
};
