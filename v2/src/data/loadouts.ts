import type { ForcedLoadout, LoadoutSnapshot, SupplyLoadout } from '../core/types';
import {
  DEFAULT_SHIP_ID,
  generatorSpecById,
  motorSpecById,
  rearWeaponSpecById,
  shieldSpecById,
  shipById,
  sideWeaponSpecById,
  supplyById,
  weaponSpecById,
} from './items';

/** The rig every new save starts with — built from the catalog, never duplicated. */
export const STARTER_LOADOUT: LoadoutSnapshot = {
  ship: shipById(DEFAULT_SHIP_ID),
  weapon: weaponSpecById('pulse-1'),
  rearWeapon: null,
  sideWeapon: null,
  shield: shieldSpecById('shield-wall-1'),
  generator: generatorSpecById('generator-torrent-1'),
  motor: motorSpecById('motor-rush-1'),
  supplies: [],
  subscriptionCardIds: [],
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
    subscriptionCardIds: [],
  };
}
