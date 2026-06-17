import type { ForcedLoadout, LoadoutSnapshot, SupplyLoadout } from '../core/types';
import {
  generatorSpecById,
  motorSpecById,
  shieldSpecById,
  supplyById,
  weaponSpecById,
} from './items';

/** The rig every new save starts with — built from the catalog, never duplicated. */
export const STARTER_LOADOUT: LoadoutSnapshot = {
  weapon: weaponSpecById('pulse-1'),
  shield: shieldSpecById('shield-1'),
  generator: generatorSpecById('generator-1'),
  motor: motorSpecById('motor-1'),
  supplies: [],
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
    weapon: forced.weaponId !== null ? weaponSpecById(forced.weaponId) : null,
    shield: shieldSpecById(forced.shieldId),
    generator: generatorSpecById(forced.generatorId),
    motor: motorSpecById(forced.motorId),
    supplies,
  };
}
