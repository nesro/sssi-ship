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
import { DEFAULT_SUBSCRIPTION_CARD_IDS } from '../src/data/subscriptions';

/** The kind at `index` in a *_KINDS array — fails fast if the catalog shrinks below it. */
function kindAt<T>(kinds: readonly T[], index: number): T {
  const kind = kinds[index];
  if (kind === undefined) throw new Error(`Expected a kind at index ${String(index)} in the catalog`);
  return kind;
}

/**
 * A loadout using the starter (index 0) kind of every system, all at the same level.
 * `subscriptionCardIds` uses the real default (sub-basic Lv1), not an empty array —
 * an empty array would silently trigger the live game's full-catalog fallback (see
 * `STARTER_LOADOUT`'s comment in `src/data/loadouts.ts` for why that matters).
 */
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
    subscriptionCardIds: DEFAULT_SUBSCRIPTION_CARD_IDS,
  };
}

/** weaponSpecAtLevel for the kind at `kindIndex`, for presets that branch into a non-starter weapon. */
export function weaponAtKindIndex(kindIndex: number, level: number): LoadoutSnapshot['weapon'] {
  return weaponSpecAtLevel(kindAt(WEAPON_KINDS, kindIndex), level);
}

export interface IntendedLoadoutLevels {
  weaponLevel: number;
  shieldLevel: number;
  generatorLevel: number;
  motorLevel: number;
}

// Each mission's specific partial-upgrade loadout from GAME_DESIGN.md §13's balance
// table — not the uniform starter/mid/full tiers above. m2's target ("Barricade or
// Reflex Shield") is an either/or in the doc; this models the Wall-path reading
// (shieldKindIndex 0) by default, since testing both isn't worth doubling the matrix
// for a mission that already clears comfortably under plain starter gear.
export const INTENDED_LOADOUT_LEVELS: Record<string, IntendedLoadoutLevels> = {
  m1: { weaponLevel: 1, shieldLevel: 1, generatorLevel: 1, motorLevel: 1 },
  m2: { weaponLevel: 1, shieldLevel: 2, generatorLevel: 1, motorLevel: 1 },
  m3: { weaponLevel: 2, shieldLevel: 1, generatorLevel: 2, motorLevel: 1 },
  m4: { weaponLevel: 2, shieldLevel: 2, generatorLevel: 2, motorLevel: 1 },
  m5: { weaponLevel: 3, shieldLevel: 2, generatorLevel: 2, motorLevel: 2 },
  m6: { weaponLevel: 4, shieldLevel: 3, generatorLevel: 3, motorLevel: 1 },
};

/**
 * The mission's own "intended loadout" per GAME_DESIGN.md §13 — throws for missions
 * without one defined (tutorials). `subscriptionCardIds` uses the real default
 * (sub-basic Lv1), same reasoning as `starterKindLoadoutAtLevel` above — the table only
 * specifies weapon/shield/generator/motor levels, never a subscription upgrade, so the
 * baseline every save always has is the right assumption, not an empty-array fallback.
 */
export function intendedLoadoutForMission(missionId: string, shieldKindIndex = 0): LoadoutSnapshot {
  const levels = INTENDED_LOADOUT_LEVELS[missionId];
  if (levels === undefined) {
    throw new Error(`No intended loadout defined for mission "${missionId}" — see GAME_DESIGN.md §13`);
  }
  return {
    ship: shipById(DEFAULT_SHIP_ID),
    weapon: weaponSpecAtLevel(kindAt(WEAPON_KINDS, 0), levels.weaponLevel),
    rearWeapon: null,
    sideWeapon: null,
    shield: shieldSpecAtLevel(kindAt(SHIELD_KINDS, shieldKindIndex), levels.shieldLevel),
    generator: generatorSpecAtLevel(kindAt(GENERATOR_KINDS, 0), levels.generatorLevel),
    motor: motorSpecAtLevel(kindAt(MOTOR_KINDS, 0), levels.motorLevel),
    supplies: [],
    subscriptionCardIds: DEFAULT_SUBSCRIPTION_CARD_IDS,
  };
}
