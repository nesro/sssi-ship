import type { LoadoutSnapshot } from '../core/types';
import type { MissionResult } from '../core/result';
import {
  DEFAULT_SHIP_ID,
  REAR_WEAPON_ITEMS,
  SIDE_WEAPON_ITEMS,
  generatorSpecById,
  itemById,
  motorSpecById,
  rearWeaponSpecById,
  shieldSpecById,
  shipById,
  sideWeaponSpecById,
  supplyById,
  weaponSpecById,
} from '../data/items';
import { MISSION_UNLOCK_EDGES, missionById } from '../data/missions';
import { cardIdsAtLevel, subscriptionById } from '../data/subscriptions';

export interface SaveData {
  version: number;
  coins: number;
  /** supplyId → owned charges (auto-refill every mission; never consumed permanently). */
  ownedSupplyCharges: Record<string, number>;
  /**
   * Per-system ownership IS equip state — there is no persisted list of past
   * purchases. Switching to a different item pays/refunds the price difference and
   * the previous item is gone; there is no "owned but not equipped" limbo state.
   */
  equipped: { ship: string; weapon: string | null; rearWeapon: string | null; sideWeapon: string | null; shield: string | null; generator: string; motor: string };
  /** missionId → star ids earned across all runs (best benchmarks; never decreases). */
  missionStars: Record<string, string[]>;
  /**
   * Mission ids ever won at least once. Drives unlock via `MISSION_UNLOCK_EDGES`
   * (§9 — "stars are never required to progress"). Losses never add to this list.
   */
  completedMissionIds: string[];
  /** subscriptionId → owned level (1–3). Basic is always 1. */
  ownedSubscriptions: Record<string, number>;
  /** Absent or true = dev border visible; explicit false = hidden. */
  devMode?: boolean;
  /** Set after completing the welcome mission (w0); gates the hub from redirecting again. */
  w0Completed?: boolean;
  /** Player's branch pick at the end of w0; used to open the right hub section on first load. */
  firstBranchChoice?: 'tutorial' | 'missions';
  /** Set the moment OnboardingScene's tutorials-or-skip choice is made (either button) —
   * absent/undefined on every pre-existing save means "hasn't seen it yet", the correct
   * default with no migration needed. Deliberately distinct from a "fresh save" check
   * (completedMissionIds.length === 0 && ...): "Start with tutorials" doesn't mutate
   * anything else, so without this field the onboarding prompt and tour would reappear
   * on every launch until the player finished a mission or earned a coin. */
  onboardingSeen?: boolean;
}

const SAVE_VERSION = 13;
const STORAGE_KEY = 'nesro-nova-v2-save';

/** Maps v9-and-earlier item IDs to their v10+ equivalents. */
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
      sideWeapon: null,
      shield: 'shield-wall-1',
      generator: 'generator-torrent-1',
      motor: 'motor-rush-1',
    },
    missionStars: {},
    completedMissionIds: [],
    ownedSubscriptions: { 'sub-basic': 1 },
  };
}

type ParsedSave = Record<string, unknown>;

/** v11 → current: add sideWeapon: null to equipped (§5, side weapons) and completedMissionIds. */
function migrateV11(parsed: ParsedSave): SaveData {
  const v11 = parsed as unknown as Omit<SaveData, 'version' | 'equipped' | 'completedMissionIds'> & { equipped: Omit<SaveData['equipped'], 'sideWeapon'> };
  return { ...v11, version: SAVE_VERSION, equipped: { ...v11.equipped, sideWeapon: null }, completedMissionIds: [] };
}

/** v10 → current: no data shape change beyond dropping ownedItems (handled by the caller); still needs sideWeapon and completedMissionIds added. */
function migrateV10(parsed: ParsedSave): SaveData {
  const v10 = parsed as unknown as Omit<SaveData, 'version' | 'equipped' | 'completedMissionIds'> & { equipped: Omit<SaveData['equipped'], 'sideWeapon'> };
  return { ...v10, version: SAVE_VERSION, equipped: { ...v10.equipped, sideWeapon: null }, completedMissionIds: [] };
}

/** v9 → current: shield/generator/motor IDs gain kind prefixes; still needs sideWeapon and completedMissionIds added. */
function migrateV9(parsed: ParsedSave): SaveData {
  const v9 = parsed as unknown as Omit<SaveData, 'equipped' | 'completedMissionIds'> & { equipped: Omit<SaveData['equipped'], 'sideWeapon'> };
  const oldShip = v9.equipped.ship;
  const newShip = /-\d+$/.test(oldShip) ? oldShip : `${oldShip}-1`;
  const renamedEquipped: SaveData['equipped'] = {
    ...v9.equipped,
    ship: newShip,
    shield: v9.equipped.shield !== null ? renameId(v9.equipped.shield) : null,
    generator: renameId(v9.equipped.generator),
    motor: renameId(v9.equipped.motor),
    sideWeapon: null,
  };
  return { ...v9, version: SAVE_VERSION, equipped: renamedEquipped, completedMissionIds: [] };
}

/** v8 → current: ship IDs gain level suffix, shield/generator/motor get kind prefixes; still needs sideWeapon and completedMissionIds added. */
function migrateV8(parsed: ParsedSave): SaveData {
  const v8 = parsed as unknown as Omit<SaveData, 'equipped' | 'completedMissionIds'> & { equipped: Omit<SaveData['equipped'], 'sideWeapon'> };
  const oldShip = v8.equipped.ship;
  const newShip = /-\d+$/.test(oldShip) ? oldShip : `${oldShip}-1`;
  const renamedEquipped: SaveData['equipped'] = {
    ...v8.equipped,
    ship: newShip,
    shield: v8.equipped.shield !== null ? renameId(v8.equipped.shield) : null,
    generator: renameId(v8.equipped.generator),
    motor: renameId(v8.equipped.motor),
    sideWeapon: null,
  };
  return { ...v8, version: SAVE_VERSION, equipped: renamedEquipped, completedMissionIds: [] };
}

/** v7 → current: weapon and shield became nullable in SaveData; still needs sideWeapon and completedMissionIds added. */
function migrateV7(parsed: ParsedSave): SaveData {
  const v7 = parsed as unknown as Omit<SaveData, 'version' | 'equipped' | 'completedMissionIds'> & { equipped: Omit<SaveData['equipped'], 'sideWeapon'> };
  return { ...v7, version: SAVE_VERSION, equipped: { ...v7.equipped, sideWeapon: null }, completedMissionIds: [] };
}

/** v6 → current: add rearWeapon: null and sideWeapon: null to equipped, plus completedMissionIds. */
function migrateV6(parsed: ParsedSave): SaveData {
  const v6 = parsed as unknown as Omit<SaveData, 'version' | 'equipped' | 'completedMissionIds'> & { equipped: Omit<SaveData['equipped'], 'rearWeapon' | 'sideWeapon'> };
  return { ...v6, version: SAVE_VERSION, equipped: { ...v6.equipped, rearWeapon: null, sideWeapon: null }, completedMissionIds: [] };
}

/** v5 → current: add ownedSubscriptions with Basic at Lv1, rearWeapon: null, sideWeapon: null, completedMissionIds. */
function migrateV5(parsed: ParsedSave): SaveData {
  const v5 = parsed as unknown as Omit<SaveData, 'version' | 'ownedSubscriptions' | 'equipped' | 'completedMissionIds'> & { equipped: Omit<SaveData['equipped'], 'rearWeapon' | 'sideWeapon'> };
  return {
    ...v5,
    version: SAVE_VERSION,
    equipped: { ...v5.equipped, rearWeapon: null, sideWeapon: null },
    ownedSubscriptions: { 'sub-basic': 1 },
    completedMissionIds: [],
  };
}

/** v2/v3/v4 → current: earliest supported shape — only coins/equipped/stars/supplies survive (already gets completedMissionIds: [] via the defaultSave() spread below). */
function migrateLegacy(parsed: ParsedSave): SaveData {
  const rawEquipped = (parsed['equipped'] as Omit<SaveData['equipped'], 'rearWeapon' | 'sideWeapon' | 'ship'> | undefined) ?? defaultSave().equipped;
  const baseEquipped: Omit<SaveData['equipped'], 'rearWeapon' | 'sideWeapon'> = parsed['version'] === 4
    ? { ...(parsed['equipped'] as Omit<SaveData['equipped'], 'rearWeapon' | 'sideWeapon'> | undefined) ?? defaultSave().equipped }
    : { ship: DEFAULT_SHIP_ID, ...rawEquipped };
  const oldEquipped: SaveData['equipped'] = {
    ...baseEquipped,
    rearWeapon: null,
    sideWeapon: null,
    shield: baseEquipped.shield !== null ? renameId(baseEquipped.shield) || null : null,
    generator: renameId(baseEquipped.generator),
    motor: renameId(baseEquipped.motor),
  };
  return {
    ...defaultSave(),
    coins: typeof parsed['coins'] === 'number' ? parsed['coins'] : 0,
    equipped: oldEquipped,
    missionStars: (parsed['missionStars'] as SaveData['missionStars'] | undefined) ?? {},
    ownedSupplyCharges: (parsed['ownedSupplyCharges'] as SaveData['ownedSupplyCharges'] | undefined) ?? {},
  };
}

/** Picks the right migration for a parsed save's version; null for anything unsupported. */
function migrateSave(parsed: ParsedSave): SaveData | null {
  switch (parsed['version']) {
    case 11: return migrateV11(parsed);
    case 10: return migrateV10(parsed);
    case 9: return migrateV9(parsed);
    case 8: return migrateV8(parsed);
    case 7: return migrateV7(parsed);
    case 6: return migrateV6(parsed);
    case 5: return migrateV5(parsed);
    case 4: case 3: case 2: return migrateLegacy(parsed);
    default: return null;
  }
}

/** Loads the save; migrates v2–v11 (keeping coins/equipped/stars/supplies), resets anything older. */
export function loadSave(): SaveData {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return defaultSave();
  try {
    const parsed = JSON.parse(raw) as ParsedSave;
    // ownedItems (multi-ownership tracking, v10 and earlier) is gone: a system's only
    // owned item is whatever is equipped, so there is nothing left to carry over.
    delete parsed['ownedItems'];
    if (parsed['version'] === SAVE_VERSION) return parsed as unknown as SaveData;
    const migrated = migrateSave(parsed);
    if (migrated === null) return defaultSave();
    persistSave(migrated);
    return migrated;
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

/** Has the player beaten the campaign (m6, the final mission)? Gates the secret y2010
 * Easter-egg weapon (WEAPON_SYSTEM.isKindVisible, viewmodel/shopSystems.ts) — a reward
 * for finishing the story, not a stars/coins purchase. */
export function hasCompletedCampaign(save: SaveData): boolean {
  return save.completedMissionIds.includes('m6');
}

/**
 * Completing a mission unlocks whatever it points to in `MISSION_UNLOCK_EDGES` — stars
 * are never required to progress (§9). A mission with no incoming edge (t1) is always
 * unlocked; w0 isn't in the graph at all and is unlocked from the very start.
 */
export function isMissionUnlocked(save: SaveData, missionId: string): boolean {
  missionById(missionId); // fail fast on an unknown id, same contract as before
  const incoming = MISSION_UNLOCK_EDGES.filter(([, toId]) => toId === missionId);
  if (incoming.length === 0) return true;
  return incoming.some(([fromId]) => save.completedMissionIds.includes(fromId));
}

const TUTORIAL_MISSION_IDS = ['t1', 't2', 't3', 't4'];

/** OnboardingScene's "Start with tutorials" choice: just marks the prompt seen, no
 * other mutation — tutorials remain fully playable and rewarded normally. */
export function acceptOnboarding(save: SaveData): SaveData {
  return { ...save, onboardingSeen: true };
}

/** OnboardingScene's "Skip tutorials" choice: marks t1-t4 completed (so m1 unlocks via
 * MISSION_UNLOCK_EDGES and t2-t4 don't sit around as unclaimed locked nodes) without
 * granting their coin rewards — the player chose not to play them. */
export function skipTutorials(save: SaveData): SaveData {
  const completedMissionIds = [...new Set([...save.completedMissionIds, ...TUTORIAL_MISSION_IDS])];
  return { ...save, completedMissionIds, onboardingSeen: true };
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
    sideWeapon: save.equipped.sideWeapon !== null ? sideWeaponSpecById(save.equipped.sideWeapon) : null,
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
 * Equip or unequip a rear weapon. Pass `null` to unequip — same trade-in model as
 * switching to any other kind, refunding the equipped item's full price. Switching
 * to a different kind/level pays the price difference and discards whatever was
 * equipped before — only one rear weapon can ever be owned at a time.
 */
export function switchRearWeapon(save: SaveData, rearWeaponId: string | null): SaveData {
  if (rearWeaponId === null) {
    const currentId = save.equipped.rearWeapon;
    if (currentId === null) return save;
    const refund = REAR_WEAPON_ITEMS[currentId]?.price ?? 0;
    const next: SaveData = { ...save, coins: save.coins + refund, equipped: { ...save.equipped, rearWeapon: null } };
    persistSave(next);
    return next;
  }
  rearWeaponSpecById(rearWeaponId);
  const currentId = save.equipped.rearWeapon;
  if (currentId === rearWeaponId) return save;
  const newItem = REAR_WEAPON_ITEMS[rearWeaponId];
  if (!newItem) throw new Error(`Unknown rear weapon "${rearWeaponId}"`);
  const currentPrice = currentId !== null ? (REAR_WEAPON_ITEMS[currentId]?.price ?? 0) : 0;
  const cost = newItem.price - currentPrice;
  if (cost > 0 && save.coins < cost) {
    throw new Error(`Not enough coins to buy rear weapon "${rearWeaponId}" (need ${String(cost)}, have ${String(save.coins)})`);
  }
  const next: SaveData = {
    ...save,
    coins: save.coins - cost,
    equipped: { ...save.equipped, rearWeapon: rearWeaponId },
  };
  persistSave(next);
  return next;
}

/**
 * Equip or unequip a side weapon. Pass `null` to unequip — same trade-in model as
 * switching to any other kind, refunding the equipped item's full price. Switching
 * to a different kind/level pays the price difference and discards whatever was
 * equipped before — only one side weapon can ever be owned at a time. Charges are
 * a combat-only concept (ShipState.sideWeaponCharges); the save only tracks which
 * item is equipped, not remaining charges.
 */
export function switchSideWeapon(save: SaveData, sideWeaponId: string | null): SaveData {
  if (sideWeaponId === null) {
    const currentId = save.equipped.sideWeapon;
    if (currentId === null) return save;
    const refund = SIDE_WEAPON_ITEMS[currentId]?.price ?? 0;
    const next: SaveData = { ...save, coins: save.coins + refund, equipped: { ...save.equipped, sideWeapon: null } };
    persistSave(next);
    return next;
  }
  sideWeaponSpecById(sideWeaponId);
  const currentId = save.equipped.sideWeapon;
  if (currentId === sideWeaponId) return save;
  const newItem = SIDE_WEAPON_ITEMS[sideWeaponId];
  if (!newItem) throw new Error(`Unknown side weapon "${sideWeaponId}"`);
  const currentPrice = currentId !== null ? (SIDE_WEAPON_ITEMS[currentId]?.price ?? 0) : 0;
  const cost = newItem.price - currentPrice;
  if (cost > 0 && save.coins < cost) {
    throw new Error(`Not enough coins to buy side weapon "${sideWeaponId}" (need ${String(cost)}, have ${String(save.coins)})`);
  }
  const next: SaveData = {
    ...save,
    coins: save.coins - cost,
    equipped: { ...save.equipped, sideWeapon: sideWeaponId },
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

/**
 * Adds missionId to completedMissionIds on victory (or on defeat for a mission whose
 * `completesOnDefeat` is set, e.g. t1-t4 — the teaching moment is seeing the mechanic
 * once, not surviving it), idempotently. No-op on any other defeat or replay.
 */
function markCompleted(save: SaveData, missionId: string, status: MissionResult['status'], completesOnDefeat: boolean): string[] {
  const completes = status === 'victory' || (status === 'defeat' && completesOnDefeat);
  if (!completes || save.completedMissionIds.includes(missionId)) return save.completedMissionIds;
  return [...save.completedMissionIds, missionId];
}

/**
 * Folds a finished run into the save: coins always, stars only for non-tutorial
 * missions, mission completion (which unlocks the next mission, §9) on victory — or on
 * defeat for t1-t4 specifically (`completesOnDefeat`).
 */
export function applyMissionResult(save: SaveData, result: MissionResult): AppliedResult {
  const mission = missionById(result.missionId);
  const completedMissionIds = markCompleted(save, result.missionId, result.status, mission.completesOnDefeat === true);
  if (result.missionId === 'w0') {
    const next: SaveData = { ...save, coins: save.coins + result.coins, w0Completed: true, completedMissionIds };
    persistSave(next);
    return { save: next, newStarIds: [] };
  }
  const isTutorial = mission.forcedLoadout !== undefined;
  if (isTutorial) {
    const next: SaveData = { ...save, coins: save.coins + result.coins, completedMissionIds };
    persistSave(next);
    return { save: next, newStarIds: [] };
  }
  const previous = save.missionStars[result.missionId] ?? [];
  const newStarIds = result.earnedStarIds.filter((id) => !previous.includes(id));
  const next: SaveData = {
    ...save,
    coins: save.coins + result.coins,
    completedMissionIds,
    missionStars: {
      ...save.missionStars,
      [result.missionId]: [...previous, ...newStarIds],
    },
  };
  persistSave(next);
  return { save: next, newStarIds };
}

/** cost = newPrice − currentPrice (trade-in model). Negative = refund. */
export function switchCost(itemPrice: number, currentPrice: number): number {
  return itemPrice - currentPrice;
}

/** Equips an item. Trade-in model (see `switchCost`) — the previously equipped item is gone either way. */
export function switchItem(save: SaveData, itemId: string): SaveData {
  const item = itemById(itemId);
  const currentId = save.equipped[item.system];
  if (currentId === itemId) return save;
  const currentPrice = currentId !== null ? itemById(currentId).price : 0;
  const cost = switchCost(item.price, currentPrice);
  if (cost > 0 && save.coins < cost) {
    throw new Error(`Not enough coins to buy "${itemId}" (need ${String(cost)}, have ${String(save.coins)})`);
  }
  const next: SaveData = {
    ...save,
    coins: save.coins - cost,
    equipped: { ...save.equipped, [item.system]: itemId },
  };
  persistSave(next);
  return next;
}

/** Unequip the front weapon. Same trade-in model as switchItem — refunds the equipped item's full price. */
export function unequipWeapon(save: SaveData): SaveData {
  if (save.equipped.weapon === null) return save;
  const refund = itemById(save.equipped.weapon).price;
  const next: SaveData = { ...save, coins: save.coins + refund, equipped: { ...save.equipped, weapon: null } };
  persistSave(next);
  return next;
}

/** Unequip the shield. Same trade-in model as switchItem — refunds the equipped item's full price. */
export function unequipShield(save: SaveData): SaveData {
  if (save.equipped.shield === null) return save;
  const refund = itemById(save.equipped.shield).price;
  const next: SaveData = { ...save, coins: save.coins + refund, equipped: { ...save.equipped, shield: null } };
  persistSave(next);
  return next;
}

/** Equips a ship. Trade-in model (see `switchCost`) — the previously equipped ship is gone either way. */
export function switchShip(save: SaveData, shipId: string): SaveData {
  const ship = shipById(shipId);
  const currentShipId = save.equipped.ship;
  if (currentShipId === shipId) return save;
  const cost = switchCost(ship.price, shipById(currentShipId).price);
  if (cost > 0 && save.coins < cost) {
    throw new Error(`Not enough coins to buy "${shipId}" (need ${String(cost)}, have ${String(save.coins)})`);
  }
  const next: SaveData = {
    ...save,
    coins: save.coins - cost,
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
