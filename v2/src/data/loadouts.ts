import type { ForcedLoadout, LoadoutSnapshot, SupplyLoadout } from '../core/types';
import {
  DEFAULT_SHIP_ID,
  generatorSpecById,
  motorSpecAtLevel,
  motorSpecById,
  rearWeaponSpecById,
  shieldSpecById,
  shipById,
  sideWeaponSpecById,
  supplyById,
  weaponSpecById,
} from './items';
import type { MotorKind } from './items';
import { DEFAULT_SUBSCRIPTION_CARD_IDS } from './subscriptions';

/**
 * The rig every new save starts with — built from the catalog, never duplicated.
 * Only used by `tools/simulate.ts`/`balance-sweep.ts` (the live game builds a real
 * player's loadout from their save via `SaveManager.buildLoadout`, never this
 * constant) — so this must match `buildLoadout(defaultSave())` exactly, including
 * `subscriptionCardIds`. An empty array here would silently trigger the live game's
 * "no subscription owned" fallback to the full card catalog, which no real fresh
 * player (who always owns sub-basic) ever sees.
 */
export const STARTER_LOADOUT: LoadoutSnapshot = {
  ship: shipById(DEFAULT_SHIP_ID),
  weapon: weaponSpecById('pulse-1'),
  rearWeapon: null,
  sideWeapon: null,
  shield: shieldSpecById('shield-wall-1'),
  generator: generatorSpecById('generator-torrent-1'),
  motor: motorSpecById('motor-rush-1'),
  supplies: [],
  subscriptionCardIds: DEFAULT_SUBSCRIPTION_CARD_IDS,
};

/**
 * Turns a tutorial mission's ForcedLoadout into a runnable LoadoutSnapshot, ignoring the
 * player's save. Shared by the live game (CombatScene), the simulator, and tests so all
 * three resolve tutorials identically — the resolution must not live in the view layer.
 */
export function resolveForcedLoadout(forced: ForcedLoadout): LoadoutSnapshot {
  const supplies: SupplyLoadout[] = [];
  if (forced.suppliesGifted !== undefined) {
    for (const [supplyId, count] of Object.entries(forced.suppliesGifted)) {
      if (count > 0) supplies.push({ spec: supplyById(supplyId).spec, charges: count });
    }
  }
  return {
    ship: shipById(forced.shipId ?? DEFAULT_SHIP_ID),
    weapon: forced.weaponId !== null ? weaponSpecById(forced.weaponId) : null,
    rearWeapon: (forced.rearWeaponId ?? null) !== null ? rearWeaponSpecById(forced.rearWeaponId as string) : null,
    sideWeapon: (forced.sideWeaponId ?? null) !== null ? sideWeaponSpecById(forced.sideWeaponId as string) : null,
    shield: shieldSpecById(forced.shieldId),
    generator: generatorSpecById(forced.generatorId),
    motor: motorSpecById(forced.motorId),
    supplies,
    // Deliberately empty, not DEFAULT_SUBSCRIPTION_CARD_IDS — this is what makes every
    // tutorial grant the full card catalog regardless of the player's real subscription
    // (see CombatScene.ts's abilityPoolForLoadout fallback), not a fidelity gap to fix.
    subscriptionCardIds: [],
  };
}

/** Replaces a real loadout's motor with its own kind's Lv1 spec — every motor kind's
 * Lv1 is identical (mult 1.0, draw 0.30, items.ts's MOTOR_BASE), the established
 * "free tap is always safe" baseline. Used for the Daily Mission only: motor level
 * otherwise scores *worse* the more a player invests in it (a faster motor compresses
 * the daily's flowing waves into more simultaneous incoming DPS, ending the run at an
 * earlier, lower-paying round — measured across the whole motor system, not just one
 * kind, see docs/known-issues.md's motor-tier inversion entry). Neutralizing to Lv1
 * makes motor level score-neutral on the daily instead of actively punishing
 * investment, without touching core/ or any campaign mission's tuning. */
export function neutralizeMotorForDaily(loadout: LoadoutSnapshot): LoadoutSnapshot {
  const kind = loadout.motor.id.split('-')[1] as MotorKind;
  return { ...loadout, motor: motorSpecAtLevel(kind, 1) };
}

/** Applies `MissionSpec.disableWeapon` — see that field's own doc comment for why this
 * is a separate lever from `forcedLoadout`. */
export function applyDisableWeapon(loadout: LoadoutSnapshot): LoadoutSnapshot {
  return { ...loadout, weapon: null };
}

/** Applies `MissionSpec.neutralizeGeneratorId` — see that field's own doc comment for
 * why this is a separate lever from `forcedLoadout`. */
export function applyGeneratorOverride(loadout: LoadoutSnapshot, generatorId: string): LoadoutSnapshot {
  return { ...loadout, generator: generatorSpecById(generatorId) };
}

/** Applies `MissionSpec.disableAuxWeapons` — see that field's own doc comment for why
 * this is a separate lever from `forcedLoadout`. */
export function applyDisableAuxWeapons(loadout: LoadoutSnapshot): LoadoutSnapshot {
  return { ...loadout, rearWeapon: null, sideWeapon: null };
}
