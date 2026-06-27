import type { LoadoutSnapshot } from '../core/types';
import type { MissionResult } from '../core/result';
import {
  DEFAULT_SHIP_ID,
  generatorSpecById,
  itemById,
  motorSpecById,
  requiresAncestors,
  shieldSpecById,
  shipById,
  supplyById,
  weaponSpecById,
} from '../data/items';
import { missionById } from '../data/missions';

export interface SaveData {
  version: number;
  coins: number;
  /** supplyId → owned charges (auto-refill every mission; never consumed permanently). */
  ownedSupplyCharges: Record<string, number>;
  equipped: { ship: string; weapon: string; shield: string; generator: string; motor: string };
  /** Item IDs permanently owned — once bought, free to re-equip at any time. */
  ownedItems: string[];
  /** missionId → star ids earned across all runs (best benchmarks; never decreases). */
  missionStars: Record<string, string[]>;
  /** Absent or true = dev border visible; explicit false = hidden. */
  devMode?: boolean;
  /** Set after completing the welcome mission (w0); gates the hub from redirecting again. */
  w0Completed?: boolean;
  /** Player's branch pick at the end of w0; used to open the right hub section on first load. */
  firstBranchChoice?: 'tutorial' | 'missions';
}

const SAVE_VERSION = 5;
const STORAGE_KEY = 'nesro-nova-v2-save';

const DEFAULT_EQUIPPED_ITEMS = [DEFAULT_SHIP_ID, 'pulse-1', 'shield-1', 'generator-1', 'motor-1'];

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    coins: 0,
    ownedSupplyCharges: {},
    equipped: {
      ship: DEFAULT_SHIP_ID,
      weapon: 'pulse-1',
      shield: 'shield-1',
      generator: 'generator-1',
      motor: 'motor-1',
    },
    ownedItems: [...DEFAULT_EQUIPPED_ITEMS],
    missionStars: {},
  };
}

/** True when the given item or ship id has been permanently purchased. */
export function isOwned(save: SaveData, id: string): boolean {
  return save.ownedItems.includes(id);
}

/** Loads the save; migrates v2–v4 (keeping coins/equipped/stars/supplies/owned), resets anything older. */
export function loadSave(): SaveData {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return defaultSave();
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed['version'] === SAVE_VERSION) return parsed as unknown as SaveData;
    if (parsed['version'] === 4 || parsed['version'] === 3 || parsed['version'] === 2) {
      const oldEquipped: SaveData['equipped'] = parsed['version'] === 4
        ? ((parsed['equipped'] as SaveData['equipped'] | undefined) ?? defaultSave().equipped)
        : { ship: DEFAULT_SHIP_ID, ...((parsed['equipped'] as Omit<SaveData['equipped'], 'ship'> | undefined) ?? defaultSave().equipped) };
      const equippedIds = [oldEquipped.ship, oldEquipped.weapon, oldEquipped.shield, oldEquipped.generator, oldEquipped.motor];
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

/** Builds the mission-start loadout snapshot from equipped items + owned supplies. */
export function buildLoadout(save: SaveData): LoadoutSnapshot {
  return {
    ship: shipById(save.equipped.ship),
    weapon: weaponSpecById(save.equipped.weapon),
    shield: shieldSpecById(save.equipped.shield),
    generator: generatorSpecById(save.equipped.generator),
    motor: motorSpecById(save.equipped.motor),
    supplies: Object.entries(save.ownedSupplyCharges)
      .filter(([, charges]) => charges > 0)
      .map(([supplyId, charges]) => ({ spec: supplyById(supplyId).spec, charges })),
  };
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
 * Equips an item, buying it if not already owned.
 * Cost = max(0, newPrice − currentPrice): upgrading costs the difference; re-equipping
 * an owned item or switching to a cheaper tier is always free. No refunds — items are
 * permanent once bought.
 */
export function switchItem(save: SaveData, itemId: string): SaveData {
  const item = itemById(itemId);
  const currentId = save.equipped[item.system];
  if (currentId === itemId) return save;
  if (item.requires !== undefined && !save.ownedItems.includes(item.requires)) {
    throw new Error(`Cannot buy "${itemId}": must own "${item.requires}" first`);
  }
  const alreadyOwned = save.ownedItems.includes(itemId);
  const cost = alreadyOwned ? 0 : Math.max(0, item.price - itemById(currentId).price);
  if (save.coins < cost) {
    throw new Error(`Not enough coins to buy "${itemId}" (need ${String(cost)}, have ${String(save.coins)})`);
  }
  const next: SaveData = {
    ...save,
    coins: save.coins - cost,
    equipped: { ...save.equipped, [item.system]: itemId },
    ownedItems: alreadyOwned ? save.ownedItems : [...save.ownedItems, itemId],
  };
  persistSave(next);
  return next;
}

/**
 * Equips a ship, buying it if not already owned.
 * Same ownership model as switchItem: cost = max(0, newPrice − currentPrice), no refunds.
 */
export function switchShip(save: SaveData, shipId: string): SaveData {
  const ship = shipById(shipId);
  if (save.equipped.ship === shipId) return save;
  const alreadyOwned = save.ownedItems.includes(shipId);
  const cost = alreadyOwned ? 0 : Math.max(0, ship.price - shipById(save.equipped.ship).price);
  if (save.coins < cost) {
    throw new Error(`Not enough coins to buy "${shipId}" (need ${String(cost)}, have ${String(save.coins)})`);
  }
  const next: SaveData = {
    ...save,
    coins: save.coins - cost,
    equipped: { ...save.equipped, ship: shipId },
    ownedItems: alreadyOwned ? save.ownedItems : [...save.ownedItems, shipId],
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
