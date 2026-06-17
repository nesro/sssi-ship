import type { LoadoutSnapshot, WeaponKind } from '../core/types';
import type { MissionResult } from '../core/result';
import {
  generatorSpecById,
  ITEMS,
  itemById,
  MAX_WEAPON_LEVEL,
  motorSpecById,
  shieldSpecById,
  STARTER_ITEM_IDS,
  supplyById,
  weaponSpecById,
} from '../data/items';
import { missionById } from '../data/missions';

export interface SaveData {
  version: number;
  coins: number;
  ownedItemIds: string[];
  /** supplyId → owned charges (auto-refill every mission; never consumed permanently). */
  ownedSupplyCharges: Record<string, number>;
  equipped: { weapon: string; shield: string; generator: string; motor: string };
  /** missionId → star ids earned across all runs (best benchmarks; never decreases). */
  missionStars: Record<string, string[]>;
}

const SAVE_VERSION = 2;
const STORAGE_KEY = 'nesro-nova-v2-save';

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    coins: 0,
    ownedItemIds: [...STARTER_ITEM_IDS],
    ownedSupplyCharges: {},
    equipped: {
      weapon: 'pulse-1',
      shield: 'shield-1',
      generator: 'generator-1',
      motor: 'motor-1',
    },
    missionStars: {},
  };
}

/** Loads the save; a missing or corrupt record falls back to a fresh default save. */
export function loadSave(): SaveData {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return defaultSave();
  try {
    const parsed = JSON.parse(raw) as SaveData;
    if (parsed.version !== SAVE_VERSION) return defaultSave();
    return parsed;
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

export function buyItem(save: SaveData, itemId: string): SaveData {
  const item = itemById(itemId);
  if (save.ownedItemIds.includes(itemId)) {
    throw new Error(`Item "${itemId}" is already owned`);
  }
  if (save.coins < item.price) {
    throw new Error(`Not enough coins for "${itemId}" (${String(item.price)})`);
  }
  const next = { ...save, coins: save.coins - item.price, ownedItemIds: [...save.ownedItemIds, itemId] };
  persistSave(next);
  return next;
}

export function equipItem(save: SaveData, itemId: string): SaveData {
  const item = itemById(itemId);
  if (!save.ownedItemIds.includes(itemId)) {
    throw new Error(`Cannot equip unowned item "${itemId}"`);
  }
  const next = { ...save, equipped: { ...save.equipped, [item.system]: itemId } };
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

/**
 * Buys the next upgrade level for a weapon type. Level gating: you must own
 * level N−1 before buying level N. Level 1 respects the normal coin check in buyItem.
 */
export function buyWeaponLevel(save: SaveData, kind: WeaponKind, level: number): SaveData {
  if (level < 1 || level > MAX_WEAPON_LEVEL) {
    throw new Error(`Weapon level ${String(level)} is out of range`);
  }
  if (level > 1 && !save.ownedItemIds.includes(`${kind}-${String(level - 1)}`)) {
    throw new Error(`Must own ${kind} level ${String(level - 1)} before buying level ${String(level)}`);
  }
  return buyItem(save, `${kind}-${String(level)}`);
}

/**
 * Sells the highest owned level of a weapon kind, refunding its price.
 * If the sold level was equipped, automatically equips the next lower one
 * (or pulse-1 as the universal fallback).
 */
export function sellWeaponLevel(save: SaveData, kind: WeaponKind): SaveData {
  let highestOwned = 0;
  for (let lv = MAX_WEAPON_LEVEL; lv >= 1; lv--) {
    if (save.ownedItemIds.includes(`${kind}-${String(lv)}`)) { highestOwned = lv; break; }
  }
  if (highestOwned === 0) throw new Error(`No ${kind} levels owned`);
  const itemId = `${kind}-${String(highestOwned)}`;
  const refund = itemById(itemId).price;
  const ownedItemIds = save.ownedItemIds.filter((id) => id !== itemId);
  let weapon = save.equipped.weapon;
  if (weapon === itemId) {
    const nextLower = highestOwned > 1 ? `${kind}-${String(highestOwned - 1)}` : null;
    weapon = nextLower !== null && ownedItemIds.includes(nextLower) ? nextLower : 'pulse-1';
  }
  const next: SaveData = { ...save, coins: save.coins + refund, ownedItemIds, equipped: { ...save.equipped, weapon } };
  persistSave(next);
  return next;
}

/**
 * Sells a non-weapon item (shield / generator / motor) at 100% refund.
 * Automatically cascade-sells any owned children that require this item first,
 * refunding each at full price. If the equipped item is sold, auto-equips the
 * direct prerequisite (which is still owned) or the system starter as fallback.
 */
export function sellItem(save: SaveData, itemId: string): SaveData {
  if (STARTER_ITEM_IDS.includes(itemId)) {
    throw new Error(`Starter item "${itemId}" cannot be sold`);
  }
  if (!save.ownedItemIds.includes(itemId)) {
    throw new Error(`Item "${itemId}" is not owned`);
  }

  // Cascade: sell any owned items that directly require this one
  let current = save;
  for (const [childId, child] of Object.entries(ITEMS)) {
    if (child.requires === itemId && current.ownedItemIds.includes(childId)) {
      current = sellItem(current, childId);
    }
  }

  const item = itemById(itemId);
  const system = item.system;
  const ownedItemIds = current.ownedItemIds.filter((id) => id !== itemId);
  const equipped = { ...current.equipped };
  if (current.equipped[system] === itemId) {
    equipped[system] = item.requires ?? systemStarterId(system);
  }

  const next: SaveData = { ...current, coins: current.coins + item.price, ownedItemIds, equipped };
  persistSave(next);
  return next;
}

function systemStarterId(system: keyof SaveData['equipped']): string {
  const starters: Record<keyof SaveData['equipped'], string> = {
    weapon: 'pulse-1', shield: 'shield-1', generator: 'generator-1', motor: 'motor-1',
  };
  return starters[system];
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
