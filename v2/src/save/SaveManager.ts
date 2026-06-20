import type { LoadoutSnapshot } from '../core/types';
import type { MissionResult } from '../core/result';
import {
  DEFAULT_SHIP_ID,
  generatorSpecById,
  itemById,
  motorSpecById,
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
  /** missionId → star ids earned across all runs (best benchmarks; never decreases). */
  missionStars: Record<string, string[]>;
  /** Absent or true = dev border visible; explicit false = hidden. */
  devMode?: boolean;
  /** Set after completing the welcome mission (w0); gates the hub from redirecting again. */
  w0Completed?: boolean;
  /** Player's branch pick at the end of w0; used to open the right hub section on first load. */
  firstBranchChoice?: 'tutorial' | 'missions';
}

const SAVE_VERSION = 4;
const STORAGE_KEY = 'nesro-nova-v2-save';

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
    missionStars: {},
  };
}

/** Loads the save; migrates v2/v3 (keeping coins/equipped/stars/supplies), resets anything older. */
export function loadSave(): SaveData {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return defaultSave();
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed['version'] === SAVE_VERSION) return parsed as unknown as SaveData;
    if (parsed['version'] === 3 || parsed['version'] === 2) {
      const oldEquipped = (parsed['equipped'] as Omit<SaveData['equipped'], 'ship'> | undefined) ?? defaultSave().equipped;
      const migrated: SaveData = {
        ...defaultSave(),
        coins: typeof parsed['coins'] === 'number' ? parsed['coins'] : 0,
        equipped: { ship: DEFAULT_SHIP_ID, ...oldEquipped },
        missionStars: (parsed['missionStars'] as SaveData['missionStars'] | undefined) ?? {},
        ownedSupplyCharges: (parsed['ownedSupplyCharges'] as SaveData['ownedSupplyCharges'] | undefined) ?? {},
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
 * Replaces the currently equipped item in a slot with a new one, charging (or refunding)
 * the price difference (Model A). Any item can replace any other in the same system — no gates.
 * Net cost is negative when switching to a cheaper item; coins increase accordingly.
 */
export function switchItem(save: SaveData, itemId: string): SaveData {
  const item = itemById(itemId);
  const currentId = save.equipped[item.system];
  if (currentId === itemId) return save;
  const currentItem = itemById(currentId);
  const netCost = item.price - currentItem.price;
  if (save.coins < netCost) {
    throw new Error(`Not enough coins to switch to "${itemId}" (need ${String(netCost)}, have ${String(save.coins)})`);
  }
  const next: SaveData = {
    ...save,
    coins: save.coins - netCost,
    equipped: { ...save.equipped, [item.system]: itemId },
  };
  persistSave(next);
  return next;
}

/**
 * Replaces the equipped ship, charging (or refunding) the price difference.
 * Ships live in a separate catalog (SHIPS) so they get their own switch function.
 */
export function switchShip(save: SaveData, shipId: string): SaveData {
  const ship = shipById(shipId);
  if (save.equipped.ship === shipId) return save;
  const currentShip = shipById(save.equipped.ship);
  const netCost = ship.price - currentShip.price;
  if (save.coins < netCost) {
    throw new Error(`Not enough coins to switch to "${shipId}" (need ${String(netCost)}, have ${String(save.coins)})`);
  }
  const next: SaveData = {
    ...save,
    coins: save.coins - netCost,
    equipped: { ...save.equipped, ship: shipId },
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
