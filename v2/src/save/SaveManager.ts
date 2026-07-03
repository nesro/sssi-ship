import type { LoadoutSnapshot } from '../core/types';
import type { MissionResult } from '../core/result';
import {
  DEFAULT_SHIP_ID,
  REAR_WEAPON_ITEMS,
  generatorSpecById,
  itemById,
  motorSpecById,
  rearWeaponSpecById,
  requiresAncestors,
  shieldSpecById,
  shipById,
  supplyById,
  weaponSpecById,
} from '../data/items';
import { missionById } from '../data/missions';
import { cardIdsAtLevel, subscriptionById } from '../data/subscriptions';

export interface SaveData {
  version: number;
  coins: number;
  /** supplyId → owned charges (auto-refill every mission; never consumed permanently). */
  ownedSupplyCharges: Record<string, number>;
  equipped: { ship: string; weapon: string | null; rearWeapon: string | null; shield: string | null; generator: string; motor: string };
  /** Item IDs permanently owned — once bought, free to re-equip at any time. */
  ownedItems: string[];
  /** missionId → star ids earned across all runs (best benchmarks; never decreases). */
  missionStars: Record<string, string[]>;
  /** subscriptionId → owned level (1–3). Basic is always 1. */
  ownedSubscriptions: Record<string, number>;
  /** Absent or true = dev border visible; explicit false = hidden. */
  devMode?: boolean;
  /** Set after completing the welcome mission (w0); gates the hub from redirecting again. */
  w0Completed?: boolean;
  /** Player's branch pick at the end of w0; used to open the right hub section on first load. */
  firstBranchChoice?: 'tutorial' | 'missions';
}

const SAVE_VERSION = 10;
const STORAGE_KEY = 'nesro-nova-v2-save';

const DEFAULT_EQUIPPED_ITEMS = [DEFAULT_SHIP_ID, 'pulse-1', 'shield-wall-1', 'generator-torrent-1', 'motor-rush-1'];

/** Maps v9-and-earlier item IDs to their v10 equivalents. */
const LEGACY_ID_MAP: Record<string, string> = {
  'shield-1': 'shield-wall-1', 'shield-2': 'shield-wall-2', 'shield-3': 'shield-wall-3',
  'shield-reflex-2': 'shield-reflex-2', 'shield-reflex-3': 'shield-reflex-3',
  'generator-1': 'generator-torrent-1', 'generator-2': 'generator-torrent-2', 'generator-3': 'generator-torrent-3',
  'generator-reserve-2': 'generator-reserve-2', 'generator-reserve-3': 'generator-reserve-3',
  'motor-1': 'motor-rush-1', 'motor-2': 'motor-rush-2', 'motor-3': 'motor-rush-3',
  'motor-tactical-2': 'motor-tactical-2', 'motor-tactical-3': 'motor-tactical-3',
};

const renameId = (id: string): string => LEGACY_ID_MAP[id] ?? id;

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    coins: 0,
    ownedSupplyCharges: {},
    equipped: {
      ship: DEFAULT_SHIP_ID,
      weapon: 'pulse-1',
      rearWeapon: null,
      shield: 'shield-wall-1',
      generator: 'generator-torrent-1',
      motor: 'motor-rush-1',
    },
    ownedItems: [...DEFAULT_EQUIPPED_ITEMS],
    missionStars: {},
    ownedSubscriptions: { 'sub-basic': 1 },
  };
}

/** True when the given item or ship id has been permanently purchased. */
export function isOwned(save: SaveData, id: string): boolean {
  return save.ownedItems.includes(id);
}

/** Loads the save; migrates v2–v6 (keeping coins/equipped/stars/supplies/owned), resets anything older. */
export function loadSave(): SaveData {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return defaultSave();
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed['version'] === SAVE_VERSION) return parsed as unknown as SaveData;
    // v9 → v10: shield/generator/motor IDs gain kind prefixes
    if (parsed['version'] === 9) {
      const v9 = parsed as unknown as SaveData;
      const oldShip = v9.equipped.ship;
      const newShip = /-\d+$/.test(oldShip) ? oldShip : `${oldShip}-1`;
      const renamedEquipped: SaveData['equipped'] = {
        ...v9.equipped,
        ship: newShip,
        shield: v9.equipped.shield !== null ? renameId(v9.equipped.shield) : null,
        generator: renameId(v9.equipped.generator),
        motor: renameId(v9.equipped.motor),
      };
      const renamedOwned = v9.ownedItems
        .map((id) => (id.startsWith('ship-') && !/-\d+$/.test(id) ? `${id}-1` : renameId(id)));
      const migrated: SaveData = { ...v9, version: SAVE_VERSION, equipped: renamedEquipped, ownedItems: renamedOwned };
      persistSave(migrated);
      return migrated;
    }
    // v8 → v9 (now v10): ship IDs gain level suffix, shield/generator/motor get kind prefixes
    if (parsed['version'] === 8) {
      const v8 = parsed as unknown as SaveData;
      const oldShip = v8.equipped.ship;
      const newShip = /-\d+$/.test(oldShip) ? oldShip : `${oldShip}-1`;
      const renamedEquipped: SaveData['equipped'] = {
        ...v8.equipped,
        ship: newShip,
        shield: v8.equipped.shield !== null ? renameId(v8.equipped.shield) : null,
        generator: renameId(v8.equipped.generator),
        motor: renameId(v8.equipped.motor),
      };
      const renamedOwned = v8.ownedItems
        .map((id) => (id.startsWith('ship-') && !/-\d+$/.test(id) ? `${id}-1` : renameId(id)));
      const migrated: SaveData = { ...v8, version: SAVE_VERSION, equipped: renamedEquipped, ownedItems: renamedOwned };
      persistSave(migrated);
      return migrated;
    }
    // v7 → v8: weapon and shield became nullable in SaveData (no data change, just version bump)
    if (parsed['version'] === 7) {
      const migrated: SaveData = { ...(parsed as unknown as SaveData), version: SAVE_VERSION };
      persistSave(migrated);
      return migrated;
    }
    // v6 → v7: add rearWeapon: null to equipped
    if (parsed['version'] === 6) {
      const v6 = parsed as unknown as Omit<SaveData, 'version' | 'equipped'> & { equipped: Omit<SaveData['equipped'], 'rearWeapon'> };
      const migrated: SaveData = {
        ...v6,
        version: SAVE_VERSION,
        equipped: { ...v6.equipped, rearWeapon: null },
      };
      persistSave(migrated);
      return migrated;
    }
    // v5 → v6: add ownedSubscriptions with Basic at Lv1
    if (parsed['version'] === 5) {
      const migrated: SaveData = {
        ...(parsed as unknown as Omit<SaveData, 'version' | 'ownedSubscriptions' | 'equipped'> & { equipped: Omit<SaveData['equipped'], 'rearWeapon'> }),
        version: SAVE_VERSION,
        equipped: { ...(parsed['equipped'] as Omit<SaveData['equipped'], 'rearWeapon'>), rearWeapon: null },
        ownedSubscriptions: { 'sub-basic': 1 },
      };
      persistSave(migrated);
      return migrated;
    }
    if (parsed['version'] === 4 || parsed['version'] === 3 || parsed['version'] === 2) {
      const rawEquipped = (parsed['equipped'] as Omit<SaveData['equipped'], 'rearWeapon' | 'ship'> | undefined) ?? defaultSave().equipped;
      const baseEquipped: Omit<SaveData['equipped'], 'rearWeapon'> = parsed['version'] === 4
        ? { ...(parsed['equipped'] as Omit<SaveData['equipped'], 'rearWeapon'> | undefined) ?? defaultSave().equipped }
        : { ship: DEFAULT_SHIP_ID, ...rawEquipped };
      const oldEquipped: SaveData['equipped'] = {
        ...baseEquipped,
        rearWeapon: null,
        shield: baseEquipped.shield !== null ? renameId(baseEquipped.shield) || null : null,
        generator: renameId(baseEquipped.generator),
        motor: renameId(baseEquipped.motor),
      };
      const equippedIds = [oldEquipped.ship, oldEquipped.weapon, oldEquipped.shield, oldEquipped.generator, oldEquipped.motor]
        .filter((id): id is string => id !== null);
      const withAncestors = equippedIds.flatMap((id) => [id, ...requiresAncestors(id)]);
      const migrated: SaveData = {
        ...defaultSave(),
        coins: typeof parsed['coins'] === 'number' ? parsed['coins'] : 0,
        equipped: oldEquipped,
        missionStars: (parsed['missionStars'] as SaveData['missionStars'] | undefined) ?? {},
        ownedSupplyCharges: (parsed['ownedSupplyCharges'] as SaveData['ownedSupplyCharges'] | undefined) ?? {},
        ownedItems: [...new Set([...DEFAULT_EQUIPPED_ITEMS, ...withAncestors])],
      };
      persistSave(migrated);
      return migrated;
    }
    return defaultSave();
  } catch {
    return defaultSave();
  }
}

export function persistSave(save: SaveData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
}

export function resetSave(): SaveData {
  localStorage.removeItem(STORAGE_KEY);
  return defaultSave();
}

/** Total stars across all missions — the only currency that gates the tree (§3.5). */
export function totalStars(save: SaveData): number {
  return Object.values(save.missionStars).reduce((sum, ids) => sum + ids.length, 0);
}

export function isMissionUnlocked(save: SaveData, missionId: string): boolean {
  return totalStars(save) >= missionById(missionId).starGate;
}

/** Builds the mission-start loadout snapshot from equipped items + owned supplies + subscription card pools. */
export function buildLoadout(save: SaveData): LoadoutSnapshot {
  const subscriptionCardIds = Object.entries(save.ownedSubscriptions).flatMap(([subId, level]) => {
    const spec = subscriptionById(subId);
    return cardIdsAtLevel(spec, level);
  });
  return {
    ship: shipById(save.equipped.ship),
    weapon: save.equipped.weapon !== null ? weaponSpecById(save.equipped.weapon) : null,
    rearWeapon: save.equipped.rearWeapon !== null ? rearWeaponSpecById(save.equipped.rearWeapon) : null,
    shield: save.equipped.shield !== null ? shieldSpecById(save.equipped.shield) : null,
    generator: generatorSpecById(save.equipped.generator),
    motor: motorSpecById(save.equipped.motor),
    supplies: Object.entries(save.ownedSupplyCharges)
      .filter(([, charges]) => charges > 0)
      .map(([supplyId, charges]) => ({ spec: supplyById(supplyId).spec, charges })),
    subscriptionCardIds,
  };
}

/**
 * Equip or unequip a rear weapon. Pass `null` to unequip (free). Buying costs
 * max(0, newPrice − 0) since there's no trade-in — rear weapons are permanent once bought.
 */
export function switchRearWeapon(save: SaveData, rearWeaponId: string | null): SaveData {
  if (rearWeaponId === null) {
    const next: SaveData = { ...save, equipped: { ...save.equipped, rearWeapon: null } };
    persistSave(next);
    return next;
  }
  rearWeaponSpecById(rearWeaponId); // throws if unknown id
  const currentRWId = save.equipped.rearWeapon;
  const currentRWPrice = currentRWId !== null ? (REAR_WEAPON_ITEMS[currentRWId]?.price ?? 0) : 0;
  const newRWPrice = REAR_WEAPON_ITEMS[rearWeaponId]?.price ?? 0;
  const cost = newRWPrice - currentRWPrice;
  if (cost > 0 && save.coins < cost) {
    throw new Error(`Not enough coins to buy rear weapon "${rearWeaponId}" (need ${String(cost)}, have ${String(save.coins)})`);
  }
  const newOwned = new Set(save.ownedItems);
  if (cost < 0 && currentRWId !== null) newOwned.delete(currentRWId);
  newOwned.add(rearWeaponId);
  const next: SaveData = {
    ...save,
    coins: save.coins - cost,
    equipped: { ...save.equipped, rearWeapon: rearWeaponId },
    ownedItems: [...newOwned],
  };
  persistSave(next);
  return next;
}

/** Buy a new subscription at Lv1. Throws if already owned or unaffordable. */
export function buySubscription(save: SaveData, subId: string): SaveData {
  const sub = subscriptionById(subId);
  if (sub.permanent) throw new Error(`Subscription "${subId}" is always owned and cannot be re-bought`);
  const owned = save.ownedSubscriptions[subId] ?? 0;
  if (owned > 0) throw new Error(`Subscription "${subId}" is already owned at Lv${String(owned)}`);
  const price = sub.levels[0].price;
  if (save.coins < price) throw new Error(`Not enough coins for "${subId}" (need ${String(price)}, have ${String(save.coins)})`);
  const next: SaveData = {
    ...save,
    coins: save.coins - price,
    ownedSubscriptions: { ...save.ownedSubscriptions, [subId]: 1 },
  };
  persistSave(next);
  return next;
}

/** Upgrade an owned subscription by one level. Throws if at max or unaffordable. */
export function upgradeSubscription(save: SaveData, subId: string): SaveData {
  const sub = subscriptionById(subId);
  const currentLevel = save.ownedSubscriptions[subId] ?? 0;
  if (currentLevel === 0) throw new Error(`Subscription "${subId}" is not owned; buy it first`);
  if (currentLevel >= sub.levels.length) throw new Error(`Subscription "${subId}" is already at max level`);
  const levelSpec = sub.levels[currentLevel];
  if (levelSpec === undefined) throw new Error(`Subscription "${subId}" has no Lv${String(currentLevel + 1)} data`);
  if (save.coins < levelSpec.price) throw new Error(`Not enough coins to upgrade "${subId}" (need ${String(levelSpec.price)}, have ${String(save.coins)})`);
  const next: SaveData = {
    ...save,
    coins: save.coins - levelSpec.price,
    ownedSubscriptions: { ...save.ownedSubscriptions, [subId]: currentLevel + 1 },
  };
  persistSave(next);
  return next;
}

/**
 * Downgrade an owned subscription by one level. Refunds that level's price.
 * If dropping from Lv1 (non-permanent), removes the subscription entirely.
 * Throws for the Basic subscription at Lv1 (permanent, free — cannot be downgraded).
 */
export function downgradeSubscription(save: SaveData, subId: string): SaveData {
  const sub = subscriptionById(subId);
  const currentLevel = save.ownedSubscriptions[subId] ?? 0;
  if (currentLevel === 0) throw new Error(`Subscription "${subId}" is not owned`);
  if (sub.permanent && currentLevel === 1) throw new Error(`Subscription "${subId}" is permanent at Lv1 and cannot be downgraded`);
  const refund = sub.levels[currentLevel - 1]?.price ?? 0;
  const newLevel = currentLevel - 1;
  const newOwned: Record<string, number> = newLevel === 0
    ? Object.fromEntries(Object.entries(save.ownedSubscriptions).filter(([k]) => k !== subId))
    : { ...save.ownedSubscriptions, [subId]: newLevel };
  const next: SaveData = { ...save, coins: save.coins + refund, ownedSubscriptions: newOwned };
  persistSave(next);
  return next;
}

export interface AppliedResult {
  save: SaveData;
  newStarIds: string[];
}

/** Folds a finished run into the save: coins always, stars only for non-tutorial missions. */
export function applyMissionResult(save: SaveData, result: MissionResult): AppliedResult {
  if (result.missionId === 'w0') {
    const next: SaveData = { ...save, coins: save.coins + result.coins, w0Completed: true };
    persistSave(next);
    return { save: next, newStarIds: [] };
  }
  const isTutorial = missionById(result.missionId).forcedLoadout !== undefined;
  if (isTutorial) {
    const next: SaveData = { ...save, coins: save.coins + result.coins };
    persistSave(next);
    return { save: next, newStarIds: [] };
  }
  const previous = save.missionStars[result.missionId] ?? [];
  const newStarIds = result.earnedStarIds.filter((id) => !previous.includes(id));
  const next: SaveData = {
    ...save,
    coins: save.coins + result.coins,
    missionStars: {
      ...save.missionStars,
      [result.missionId]: [...previous, ...newStarIds],
    },
  };
  persistSave(next);
  return { save: next, newStarIds };
}

/**
 * Equips an item. Cost = newPrice − currentPrice (trade-in model).
 * Positive cost = upgrade; negative cost = downgrade refund.
 * The previously equipped item is removed from ownedItems on downgrade so it
 * cannot be re-equipped for free after a refund.
 */
export function switchItem(save: SaveData, itemId: string): SaveData {
  const item = itemById(itemId);
  const currentId = save.equipped[item.system];
  if (currentId === itemId) return save;
  if (item.requires !== undefined && !save.ownedItems.includes(item.requires)) {
    throw new Error(`Cannot buy "${itemId}": must own "${item.requires}" first`);
  }
  const currentPrice = currentId !== null ? itemById(currentId).price : 0;
  const cost = item.price - currentPrice;
  if (cost > 0 && save.coins < cost) {
    throw new Error(`Not enough coins to buy "${itemId}" (need ${String(cost)}, have ${String(save.coins)})`);
  }
  const newOwned = new Set(save.ownedItems);
  if (cost < 0 && currentId !== null) newOwned.delete(currentId);
  newOwned.add(itemId);
  const next: SaveData = {
    ...save,
    coins: save.coins - cost,
    equipped: { ...save.equipped, [item.system]: itemId },
    ownedItems: [...newOwned],
  };
  persistSave(next);
  return next;
}

/** Unequip the front weapon (sets weapon to null, no refund). */
export function unequipWeapon(save: SaveData): SaveData {
  if (save.equipped.weapon === null) return save;
  const next: SaveData = { ...save, equipped: { ...save.equipped, weapon: null } };
  persistSave(next);
  return next;
}

/** Unequip the shield (sets shield to null, no refund). */
export function unequipShield(save: SaveData): SaveData {
  if (save.equipped.shield === null) return save;
  const next: SaveData = { ...save, equipped: { ...save.equipped, shield: null } };
  persistSave(next);
  return next;
}

/** Equips a ship. Trade-in model: cost = newPrice − currentPrice (negative = refund). */
export function switchShip(save: SaveData, shipId: string): SaveData {
  const ship = shipById(shipId);
  if (save.equipped.ship === shipId) return save;
  const cost = ship.price - shipById(save.equipped.ship).price;
  if (cost > 0 && save.coins < cost) {
    throw new Error(`Not enough coins to buy "${shipId}" (need ${String(cost)}, have ${String(save.coins)})`);
  }
  const currentShipId = save.equipped.ship;
  const newOwned = new Set(save.ownedItems);
  if (cost < 0) newOwned.delete(currentShipId);
  newOwned.add(shipId);
  const next: SaveData = {
    ...save,
    coins: save.coins - cost,
    equipped: { ...save.equipped, ship: shipId },
    ownedItems: [...newOwned],
  };
  persistSave(next);
  return next;
}

export function buySupplyCharge(save: SaveData, supplyId: string): SaveData {
  const entry = supplyById(supplyId);
  const owned = save.ownedSupplyCharges[supplyId] ?? 0;
  if (owned >= entry.spec.maxCharges) {
    throw new Error(`Supply "${supplyId}" is already at max charges`);
  }
  if (save.coins < entry.pricePerCharge) {
    throw new Error(`Not enough coins for a "${supplyId}" charge`);
  }
  const next = {
    ...save,
    coins: save.coins - entry.pricePerCharge,
    ownedSupplyCharges: { ...save.ownedSupplyCharges, [supplyId]: owned + 1 },
  };
  persistSave(next);
  return next;
}

/** Sell one charge back at full price. The player can freely adjust their supply loadout. */
export function sellSupplyCharge(save: SaveData, supplyId: string): SaveData {
  const entry = supplyById(supplyId);
  const owned = save.ownedSupplyCharges[supplyId] ?? 0;
  if (owned <= 0) throw new Error(`No charges of "${supplyId}" to sell`);
  const next = {
    ...save,
    coins: save.coins + entry.pricePerCharge,
    ownedSupplyCharges: { ...save.ownedSupplyCharges, [supplyId]: owned - 1 },
  };
  persistSave(next);
  return next;
}
