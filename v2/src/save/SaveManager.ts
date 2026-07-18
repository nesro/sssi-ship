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
import { DAILY_MISSION_ID } from '../data/dailyMission';
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
  /** Set after completing the welcome mission (w0). Corrected 2026-07-18: this field
   * does not actually gate anything today — nothing reads it. `w0` itself currently has
   * no unlock edge and no launcher, so it's unreachable in real play; see
   * `docs/known-issues.md`'s `w0`/`firstBranchChoice` entry for the full picture. */
  w0Completed?: boolean;
  /** Player's branch pick at the end of w0. Corrected 2026-07-18: nothing reads this
   * either, despite the field still being written by `ResultScene.ts`'s w0-branch
   * buttons — see the same `docs/known-issues.md` entry above. */
  firstBranchChoice?: 'tutorial' | 'missions';
  /** Set by BootScene the moment a save's first-ever hub visit happens — absent/
   * undefined on every pre-existing save means "hasn't launched yet", the correct
   * default with no migration needed. Deliberately distinct from a "fresh save" check
   * (completedMissionIds.length === 0 && ...): gates only the one-time hub button tour
   * now (the tutorials-or-skip choice moved onto the galaxy screen itself, 2026-07-17 —
   * see HubScene's missions-screen "skip tutorials" link), so without this field the
   * tour would replay on every launch until the player finished a mission or earned a
   * coin. */
  onboardingSeen?: boolean;
  /** Set the first time the player ever opens the Shop / Dispatch Reinforcements panel
   * — same absent-means-unset precedent as `onboardingSeen` above, no migration needed.
   * Gates HubScene's screen-specific coach-mark tours (2026-07-17, playtest feedback:
   * "the shop and dispatch needs tutorial as well") — each fires once, the first time
   * its screen is opened, independent of the main-menu button tour and of each other. */
  shopTourSeen?: boolean;
  dispatchTourSeen?: boolean;
  /**
   * Daily mission state (src/data/dailyMission.ts). Absent = never played, available
   * today — the same "optional/absent = unset" precedent as `onboardingSeen` above, so
   * this needs no SAVE_VERSION bump or migration. `lastPlayedDate` is a local
   * `YYYY-MM-DD` key (dailyDateKey), written the moment a run STARTS
   * (`reserveDailyAttempt`), not when it ends — see that function's comment for why.
   * `bestScore` is the highest raw run score (MissionResult.coins, before
   * DAILY_COIN_MULT) ever recorded, for the "NEW BEST!" self-competition hook — never
   * decreases. `paid` is false the instant a run is reserved and flips true once
   * `applyDailyResult` actually deposits coins — the guard against ever paying out twice
   * for the same reservation.
   */
  daily?: { lastPlayedDate: string; bestScore: number; paid: boolean };
}

const SAVE_VERSION = 13;
const STORAGE_KEY = 'nesro-nova-v2-save';

/**
 * The daily mission's coin payout multiplier over its raw run score
 * (MissionResult.coins, itself state.stats.coinsEarned accumulated per kill — the
 * daily's completionCoins is always 0, see dailyMission.ts).
 *
 * Tuned against `pnpm sim -- --daily-seed 1 --runs 300 --strategy greedy --loadout <X>`
 * (docs/design/13-balance-and-tuning.md). At 1.5 (first-cut), a starter-gear daily run
 * (raw score ~175) deposited only ~263 coins — LESS than a real m1 clear at starter gear
 * (`pnpm sim --mission m1 --loadout starter`, ~555 coins including its completion
 * bonus), failing the confirmed "pays more than a normal mission" requirement. 4.0
 * brings starter to ~700 (comfortably above m1's ~555) while still scaling hard at the
 * top: t4-reference gear (weapon5/shield4/gen5/motor3, `tools/loadoutPresets.ts`) nets
 * ~11,600 coins in one ~7-9min run — a real, deliberate premium for the "scale best in
 * the endgame, where campaign income has dried up" requirement, not an oversight.
 */
export const DAILY_COIN_MULT = 4.0;

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

/**
 * Loads the save; any version other than the current `SAVE_VERSION` resets to
 * `defaultSave()` — no migration path. Per the project's early-dev save-data policy
 * (docs/design/12-architecture-and-tooling.md: "bumping SAVE_VERSION and falling back
 * to defaultSave() is sufficient until closer to release"), migration functions for
 * v2–v11 (renaming legacy item ids, adding new equipped-slot fields as they shipped)
 * used to accumulate here instead — removed 2026-07-18 (D8 of
 * fable-review-fixes-2026-07-18.md) once that policy was applied for real: this also
 * closes the "no migrateV12 case" gap docs/known-issues.md had flagged (a version that
 * fell through to `defaultSave()` by accident, not decision) since there is now
 * deliberately no migration switch at all to have a gap in.
 */
export function loadSave(): SaveData {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return defaultSave();
  try {
    const parsed = JSON.parse(raw) as ParsedSave;
    if (parsed['version'] === SAVE_VERSION) return parsed as unknown as SaveData;
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

/** Exported so viewmodel/hub.ts's "show the skip-tutorials link" check (all-or-nothing,
 * same semantics as skipTutorials() below) never drifts out of sync with this list. */
export const TUTORIAL_MISSION_IDS = ['t1', 't2', 't3', 't4'];

/** BootScene's first-launch marker: just marks the (now implicit) onboarding moment
 * seen, no other mutation — tutorials remain fully playable and rewarded normally. */
export function acceptOnboarding(save: SaveData): SaveData {
  return { ...save, onboardingSeen: true };
}

/** The galaxy screen's "skip tutorials" link: marks t1-t4 completed (so m1 unlocks via
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

/** True if today's daily mission hasn't been RESERVED yet (see `reserveDailyAttempt`) —
 * the gate CombatScene checks before letting a run start. Deliberately checks
 * `lastPlayedDate` alone, not `paid`: a reservation with no payout yet still counts as
 * "today is used up," which is the entire point (see `reserveDailyAttempt`'s comment). */
export function isDailyAvailable(save: SaveData, todayStr: string): boolean {
  return save.daily === undefined || save.daily.lastPlayedDate !== todayStr;
}

/** Highest raw daily run score ever recorded (0 if never played). */
export function dailyBestScore(save: SaveData): number {
  return save.daily?.bestScore ?? 0;
}

/**
 * Consumes today's daily attempt the moment a run actually STARTS (CombatScene.create),
 * not when it ends. Fixes a real exploit found in review: paying out only at the end
 * (the first version of this feature) left `save.daily` untouched if the app was force-
 * quit or the tab closed mid-run — on mobile that's a two-swipe gesture — so a player
 * could retry indefinitely with a fresh seed until a good roll, defeating the entire
 * "one attempt" premise. Reserving up front means a crash costs the day's attempt with
 * no payout — harsh, but it's the only way this mode can actually be "one shot."
 * `bestScore` carries over unchanged (this run's outcome isn't known yet); `paid: false`
 * until `applyDailyResult` actually deposits coins.
 */
export function reserveDailyAttempt(save: SaveData, todayStr: string): SaveData {
  const next: SaveData = { ...save, daily: { lastPlayedDate: todayStr, bestScore: dailyBestScore(save), paid: false } };
  persistSave(next);
  return next;
}

export interface AppliedDailyResult {
  save: SaveData;
  /** Actual coins deposited into the wallet (result.coins × DAILY_COIN_MULT) — what
   * ResultScene should display, distinct from the raw score used for bestScore/"NEW
   * BEST!" comparisons. */
  coinsAwarded: number;
  isNewBest: boolean;
}

/**
 * Folds a finished daily-mission run into the save. Deliberately NOT built on top of
 * `applyMissionResult` — the daily must never touch `completedMissionIds` (it isn't
 * part of the campaign unlock graph, MISSION_UNLOCK_EDGES) and never awards campaign
 * stars (its MissionSpec.stars is always empty; evaluateStars would return [] anyway).
 * Pays out `DAILY_COIN_MULT × result.coins` rather than `result.coins` + a flat
 * completion bonus, since the daily's `completionCoins` is always 0 — the entire reward
 * is the per-kill score.
 *
 * Expects `reserveDailyAttempt` to have already run (CombatScene.create, before the
 * first tick) with the SAME `todayStr` — passing a fresh `new Date()` here instead would
 * risk a midnight-crossing skew on a long run (started day D, finishes after midnight,
 * pays out against day D+1's date). Defense in depth against ever paying out twice or
 * for an unreserved day: no-ops (0 coins, not a new best) unless `save.daily` matches
 * `todayStr` and hasn't been paid yet.
 */
export function applyDailyResult(save: SaveData, result: MissionResult, todayStr: string): AppliedDailyResult {
  if (result.missionId !== DAILY_MISSION_ID) {
    throw new Error(`applyDailyResult called with a non-daily result ("${result.missionId}")`);
  }
  if (save.daily === undefined || save.daily.lastPlayedDate !== todayStr || save.daily.paid) {
    return { save, coinsAwarded: 0, isNewBest: false };
  }
  const previousBest = save.daily.bestScore;
  const isNewBest = result.coins > previousBest;
  const coinsAwarded = Math.round(result.coins * DAILY_COIN_MULT);
  const next: SaveData = {
    ...save,
    coins: save.coins + coinsAwarded,
    daily: { lastPlayedDate: todayStr, bestScore: Math.max(previousBest, result.coins), paid: true },
  };
  persistSave(next);
  return { save: next, coinsAwarded, isNewBest };
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
