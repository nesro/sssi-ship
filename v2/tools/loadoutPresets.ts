// Shared preset-loadout builders for the simulator and balance-sweep CLIs. Presets
// are derived from the current catalog structure (KINDS[index] + specAtLevel) rather
// than hardcoded item ids, so a shop rebalance in src/data/items.ts can never again
// silently break these tools the way it broke `pnpm sim` after the branching-path
// rebalance — the whole point of "the simulator is the truth" is that it has to run.

import type { LoadoutSnapshot } from '../src/core/types';
import {
  DEFAULT_SHIP_ID,
  GENERATOR_KINDS, generatorSpecAtLevel,
  MOTOR_KINDS, motorSpecAtLevel,
  SHIELD_KINDS, shieldSpecAtLevel,
  shipById,
  WEAPON_KINDS, weaponSpecAtLevel,
} from '../src/data/items';

/** The kind at `index` in a *_KINDS array — fails fast if the catalog shrinks below it. */
function kindAt<T>(kinds: readonly T[], index: number): T {
  const kind = kinds[index];
  if (kind === undefined) throw new Error(`Expected a kind at index ${String(index)} in the catalog`);
  return kind;
}

/** A loadout using the starter (index 0) kind of every system, all at the same level. */
export function starterKindLoadoutAtLevel(level: number): LoadoutSnapshot {
  return {
    ship: shipById(DEFAULT_SHIP_ID),
    weapon: weaponSpecAtLevel(kindAt(WEAPON_KINDS, 0), level),
    rearWeapon: null,
    // Side weapon is manual-fire, limited-ammo — not part of these auto-fire presets.
    sideWeapon: null,
    shield: shieldSpecAtLevel(kindAt(SHIELD_KINDS, 0), level),
    generator: generatorSpecAtLevel(kindAt(GENERATOR_KINDS, 0), level),
    motor: motorSpecAtLevel(kindAt(MOTOR_KINDS, 0), level),
    supplies: [],
    subscriptionCardIds: [],
  };
}

/** weaponSpecAtLevel for the kind at `kindIndex`, for presets that branch into a non-starter weapon. */
export function weaponAtKindIndex(kindIndex: number, level: number): LoadoutSnapshot['weapon'] {
  return weaponSpecAtLevel(kindAt(WEAPON_KINDS, kindIndex), level);
}
