// Pure viewmodel for HubScene: every panel (shop tabs, loadout, galaxy map, mission
// detail, dispatch reinforcements, settings, supplies) is computed here as plain data.
// HubScene reads these objects and renders them — it never re-derives a decision the
// viewmodel already made. Zero Phaser import (ESLint-enforced); only src/view/palette
// and src/view/textureKeys (both verified zero-Phaser) may be imported from src/view/**.

import { TICKS_PER_SECOND } from '../core/constants';
import type { MissionSpec, StarFamily, StarSpec } from '../core/types';
import { abilityById } from '../data/cards';
import { itemById, REAR_WEAPON_ITEMS, shipById, SIDE_WEAPON_ITEMS, SUPPLIES } from '../data/items';
import { ALL_MISSIONS } from '../data/missions';
import { SUBSCRIPTIONS } from '../data/subscriptions';
import type { SubscriptionSpec } from '../data/subscriptions';
import { isMissionUnlocked, switchCost } from '../save/SaveManager';
import type { SaveData } from '../save/SaveManager';
import { ABILITY_COMPANY_COLORS } from './companyColors';
import { shopSystemFor, type ShopSystemConfig, type ShopTab } from './shopSystems';

// ── Shop kind rows (weapon / rear-weapon / shield / generator / motor / ship) ──────

// There is no 'owned-not-equipped' state: a system owns exactly whatever is currently
// equipped, nothing else persists. Picking any other kind trades it in immediately.
// Confirmed by user: equip/own/select are one concept — no owned array anywhere.
export type KindRowState = 'equipped' | 'purchasable' | 'unaffordable' | 'locked';

// No 'free' variant — a zero-cost switch (a genuine price match between the entry
// level and whatever is equipped) is just 'cost' with coins: 0 ("switching costs 0
// coins"). One phrasing for every coin amount means the label can never lie by omission.
export type KindRowBadge =
  | { kind: 'stars'; label: string; stars: number }
  | { kind: 'cost'; label: string; coins: number; affordable: boolean }
  | { kind: 'refund'; label: string; coins: number }
  | null;

// Tapping a row ALWAYS updates selection; OPTIONALLY mutates save (a trade-in switch,
// which may cost 0 coins if the entry price happens to match the equipped price).
export interface KindRowTap {
  selectKind: string | null; // null = select the NONE row
  mutation:
    | { type: 'switch-item'; itemId: string }
    | { type: 'unequip' }
    | null;
}

export interface KindRowViewModel {
  kind: string | null; // null = NONE row
  isNoneRow: boolean;
  displayName: string;
  displayLevel: number; // for icon; always >= 1
  iconKey: string;
  iconScale: number;
  rowState: KindRowState;
  isSelected: boolean;
  badge: KindRowBadge;
  tap: KindRowTap;
  detailLines: string[];
  /** Compact "Lv1 <stat>" line, plus a second "LvN <stat>" line if the currently equipped
   * level differs from 1 — lets the player compare kinds without opening level chips. */
  statLines: string[];
}

export interface LevelChipViewModel {
  itemId: string;
  label: string; // "Lv1", "Lv2", …
  subLabel: string; // "FREE" (equipped face value only), "300⬤", "★10", "▶", "+80⬤", "0⬤"
  // A zero-or-negative trade-in cost naturally lands in 'refund' with subLabel "0⬤" or
  // "+N⬤" — no special "owned" case needed. 'refund' colors blue, distinct from the
  // amber 'purchasable' cost color.
  state: 'equipped' | 'refund' | 'purchasable' | 'unaffordable' | 'locked';
  mutation: { type: 'switch-item'; itemId: string } | null;
}

export interface DetailHintViewModel {
  text: string; // "Tap a shield type." — "" once a kind is selected
}

// ── Loadout ────────────────────────────────────────────────────────────────

export interface LoadoutRowViewModel {
  slotLabel: string; // "SHIP", "FRONT WEAPON", …
  itemName: string; // "Pulse Laser Lv1" or "None"
  price: number;
  systemKey: ShopTab;
  empty: boolean;
  iconKey: string; // '' when empty — nothing to draw
  iconScale: number;
}

export interface LoadoutViewModel {
  rows: LoadoutRowViewModel[];
  totalShipValue: number; // 0 renders as "FREE"
}

// ── Galaxy map ─────────────────────────────────────────────────────────────

export interface GalaxyMissionViewModel {
  id: string;
  x: number;
  y: number;
  label: string; // name, or "???" if locked
  unlocked: boolean;
  isTutorial: boolean;
  isSelected: boolean;
  starsEarned: number;
  starsTotal: number;
  showStarCount: boolean;
}

export interface GalaxyConnectionViewModel {
  fromId: string;
  toId: string;
  bothUnlocked: boolean;
}

export interface GalaxyMapViewModel {
  missions: GalaxyMissionViewModel[];
  connections: GalaxyConnectionViewModel[];
}

// ── Mission detail ─────────────────────────────────────────────────────────

export interface MissionDetailViewModel {
  name: string;
  duration: string; // "" if not in the duration table
  isTutorial: boolean;
  stars: Array<{ id: string; description: string; earned: boolean }>; // [] for tutorials
  canStart: boolean;
}

// ── Dispatch reinforcements (subscription-centric) ──────────────────────────

export interface SubscriptionRowViewModel {
  id: string;
  name: string;
  color: number;
  ownedLevel: number; // 0 = not subscribed
  maxLevel: number;
  dots: string; // "●●○" — deterministic function of (ownedLevel, maxLevel)
  statusText: string; // "Lv2 / 3" or "not subscribed"
  isSelected: boolean;
}

export interface SubLevelChipViewModel {
  level: number;
  label: string; // "Lv1"
  subLabel: string; // "▶", "★10", "120⬤", "+80⬤", "FREE"
  state: 'current' | 'locked' | 'purchasable' | 'unaffordable';
  mutation: { type: 'set-subscription-level'; subId: string; targetLevel: number } | null;
}

export interface DispatchCardViewModel {
  cardId: string;
  name: string;
  description: string;
  kindLabel: 'ACTIVE' | 'PASSIVE';
  companyColor: number;
  levelRequired: number;
  accessible: boolean;
}

export interface DispatchViewModel {
  subscriptions: SubscriptionRowViewModel[];
  selectedSubscriptionId: string | null;
  subLevelChips: SubLevelChipViewModel[]; // [] if no subscription selected
  tagline: string; // "" if not owned or none selected
  cards: DispatchCardViewModel[]; // current page only
  page: number;
  totalPages: number;
}

// ── Supplies ───────────────────────────────────────────────────────────────

export interface SupplyRowViewModel {
  id: string;
  name: string;
  description: string;
  charges: number;
  maxCharges: number;
  pricePerCharge: number;
  canBuy: boolean;
  canSell: boolean;
}

// ── Settings ───────────────────────────────────────────────────────────────

export interface SettingsViewModel {
  musicMuted: boolean;
  sfxMuted: boolean;
  devMode: boolean; // drives dev-only button visibility + layout Y-offset
}

// ── Top-level Hub ──────────────────────────────────────────────────────────

export type HubNav = 'missions' | 'shop' | 'dispatch-reinforcements' | 'settings' | null;

// ── UI state (ephemeral, not persisted to SaveData) ─────────────────────────

// Tri-state per tab: undefined = apply default, null = NONE row, string = kind selected.
// Absent ≠ disabled — documented explicitly to avoid the common opt-out trap.
export interface HubUIState {
  nav: HubNav;
  tab: ShopTab;
  selectedKindByTab: Partial<Record<ShopTab, string | null>>;
  selectedMissionId: string | null;
  selectedSubscriptionId: string | null;
  dispatchPage: number;
}

export const DEFAULT_HUB_UI_STATE: HubUIState = {
  nav: null,
  tab: 'loadout',
  selectedKindByTab: {},
  selectedMissionId: null,
  selectedSubscriptionId: null,
  dispatchPage: 1,
};

// ── resolveUiState ───────────────────────────────────────────────────────────

function defaultSelectedKind(config: ShopSystemConfig, save: SaveData): string | null {
  for (const kind of config.kinds) {
    if (config.equippedLevelForKind(save, kind) > 0) return kind;
  }
  return config.hasNoneOption ? null : (config.kinds[0] ?? null);
}

/** Fills in the active tab's selected kind on first visit; leaves an existing choice alone. */
export function resolveUiState(save: SaveData, raw: HubUIState): HubUIState {
  const config = shopSystemFor(raw.tab);
  if (config === null) return raw;
  if (raw.selectedKindByTab[raw.tab] !== undefined) return raw;
  const defaultKind = defaultSelectedKind(config, save);
  return { ...raw, selectedKindByTab: { ...raw.selectedKindByTab, [raw.tab]: defaultKind } };
}

// ── Kind rows ────────────────────────────────────────────────────────────────

interface KindRowsCtx {
  config: ShopSystemConfig;
  save: SaveData;
  playerStars: number;
}

export function computeKindRows(ctx: KindRowsCtx, selectedKind: string | null): KindRowViewModel[] {
  const rows: KindRowViewModel[] = [];
  if (ctx.config.hasNoneOption) rows.push(computeNoneRow(ctx.config, ctx.save, selectedKind));
  for (const kind of ctx.config.kinds) {
    rows.push(computeKindRow({ config: ctx.config, save: ctx.save, kind, playerStars: ctx.playerStars }, selectedKind));
  }
  return rows;
}

function isAnyKindEquipped(config: ShopSystemConfig, save: SaveData): boolean {
  return config.kinds.some((k) => config.equippedLevelForKind(save, k) > 0);
}

// Unequipping refunds the equipped item's full price (same trade-in model as any
// other switch — see SaveManager's unequipWeapon/unequipShield/switchRearWeapon).
// The badge always reflects that real refund; there is no free-forfeit special case.
function computeNoneBadge(isCurrentlyNone: boolean, equippedPriceValue: number): KindRowBadge {
  if (isCurrentlyNone) return null;
  if (equippedPriceValue === 0) return { kind: 'cost', label: '0⬤', coins: 0, affordable: true };
  return { kind: 'refund', label: `+${String(equippedPriceValue)}⬤`, coins: equippedPriceValue };
}

function computeNoneRow(config: ShopSystemConfig, save: SaveData, selectedKind: string | null): KindRowViewModel {
  const isCurrentlyNone = !isAnyKindEquipped(config, save);
  return {
    kind: null,
    isNoneRow: true,
    displayName: 'None',
    displayLevel: 1,
    iconKey: '',
    iconScale: 1,
    rowState: isCurrentlyNone ? 'equipped' : 'purchasable',
    isSelected: selectedKind === null,
    badge: computeNoneBadge(isCurrentlyNone, config.equippedPrice(save)),
    tap: { selectKind: null, mutation: isCurrentlyNone ? null : { type: 'unequip' } },
    detailLines: [],
    statLines: [],
  };
}

/** "Lv1 <stat>" always, plus "LvN <stat>" too when a different level is currently equipped. */
function computeRowStatLines(config: ShopSystemConfig, kind: string, equippedLevel: number): string[] {
  const lines = [`Lv1 ${config.rowStat(kind, 1)}`];
  if (equippedLevel > 1) lines.push(`Lv${String(equippedLevel)} ${config.rowStat(kind, equippedLevel)}`);
  return lines;
}

export interface KindRowCtx {
  config: ShopSystemConfig;
  save: SaveData;
  kind: string;
  playerStars: number;
}

/**
 * Every intermediate value behind a kind row's final state, exposed for the dev-mode
 * DEBUG button — computeKindRow() builds the row from exactly this trace, so the
 * debug dump and the real render can never disagree about how a number was derived.
 */
export interface KindRowTrace {
  kind: string;
  equippedLevel: number;
  equipped: boolean;
  starsNeeded: number;
  locked: boolean;
  targetLevel: number;
  entryPrice: number;
  equippedPriceValue: number;
  netCost: number;
  affordable: boolean;
  displayLevel: number;
}

export function computeKindRowTrace(ctx: KindRowCtx): KindRowTrace {
  const { config, save, kind, playerStars } = ctx;
  const equippedLevel = config.equippedLevelForKind(save, kind);
  const equipped = equippedLevel > 0;
  const starsNeeded = config.itemStarsRequired(kind, 1);
  const locked = !equipped && starsNeeded > playerStars;
  const targetLevel = 1; // entering a kind you don't currently own always starts at Lv1
  const entryPrice = config.itemPrice(kind, targetLevel);
  const equippedPriceValue = config.equippedPrice(save);
  const netCost = entryPrice - equippedPriceValue;
  const affordable = netCost <= 0 || save.coins >= netCost;
  const displayLevel = equipped ? equippedLevel : 1;
  return { kind, equippedLevel, equipped, starsNeeded, locked, targetLevel, entryPrice, equippedPriceValue, netCost, affordable, displayLevel };
}

function computeKindRow(ctx: KindRowCtx, selectedKind: string | null): KindRowViewModel {
  const { config, kind } = ctx;
  const t = computeKindRowTrace(ctx);
  return {
    kind,
    isNoneRow: false,
    displayName: config.kindDisplayName(kind),
    displayLevel: t.displayLevel,
    iconKey: config.iconKey(kind, t.displayLevel),
    iconScale: config.iconScale(t.displayLevel),
    rowState: classifyKindRowState(t.equipped, t.locked, t.affordable),
    isSelected: selectedKind === kind,
    badge: computeKindBadge(t),
    tap: {
      selectKind: kind,
      mutation: t.equipped ? null : { type: 'switch-item', itemId: config.itemId(kind, t.targetLevel) },
    },
    detailLines: config.detailLines(kind, t.equippedLevel),
    statLines: computeRowStatLines(config, kind, t.equippedLevel),
  };
}

function classifyKindRowState(equipped: boolean, locked: boolean, affordable: boolean): KindRowState {
  if (equipped) return 'equipped';
  if (locked) return 'locked';
  return affordable ? 'purchasable' : 'unaffordable';
}

function computeKindBadge(opts: KindRowTrace): KindRowBadge {
  if (opts.equipped) return null;
  if (opts.locked) return { kind: 'stars', label: `★${String(opts.starsNeeded)}`, stars: opts.starsNeeded };
  if (opts.netCost > 0) {
    return { kind: 'cost', label: `-${String(opts.netCost)}⬤`, coins: opts.netCost, affordable: opts.affordable };
  }
  if (opts.netCost === 0) return { kind: 'cost', label: '0⬤', coins: 0, affordable: true };
  return { kind: 'refund', label: `+${String(-opts.netCost)}⬤`, coins: -opts.netCost };
}

// ── Level chips ──────────────────────────────────────────────────────────────

interface LevelChipsCtx {
  config: ShopSystemConfig;
  save: SaveData;
  kind: string;
  playerStars: number;
}

export function computeLevelChips(ctx: LevelChipsCtx): LevelChipViewModel[] {
  const equippedLevel = ctx.config.equippedLevelForKind(ctx.save, ctx.kind);
  const equippedPriceValue = ctx.config.equippedPrice(ctx.save);
  return Array.from({ length: ctx.config.maxLevel }, (_, i) => computeLevelChip(ctx, i + 1, equippedLevel, equippedPriceValue));
}

function computeLevelChip(ctx: LevelChipsCtx, level: number, equippedLevel: number, equippedPriceValue: number): LevelChipViewModel {
  const { config, save, kind, playerStars } = ctx;
  const itemId = config.itemId(kind, level);
  const label = `Lv${String(level)}`;
  const isCurrent = equippedLevel === level;
  if (isCurrent) {
    const itemPrice = config.itemPrice(kind, level);
    return { itemId, label, subLabel: itemPrice > 0 ? `${String(itemPrice)}⬤` : 'FREE', state: 'equipped', mutation: null };
  }
  const starsRequired = config.itemStarsRequired(kind, level);
  if (starsRequired > playerStars) {
    return { itemId, label, subLabel: `★${String(starsRequired)}`, state: 'locked', mutation: null };
  }
  const mutation = { type: 'switch-item' as const, itemId };
  const cost = switchCost(config.itemPrice(kind, level), equippedPriceValue);
  if (cost <= 0) {
    const subLabel = cost === 0 ? '0⬤' : `+${String(-cost)}⬤`;
    return { itemId, label, subLabel, state: 'refund', mutation };
  }
  const affordable = save.coins >= cost;
  return { itemId, label, subLabel: `${String(cost)}⬤`, state: affordable ? 'purchasable' : 'unaffordable', mutation };
}

// ── Detail hint ──────────────────────────────────────────────────────────────

const SYSTEM_NOUN: Partial<Record<ShopTab, string>> = {
  weapon: 'weapon', 'rear-weapon': 'rear weapon', 'side-weapon': 'side weapon',
  shield: 'shield', generator: 'generator', motor: 'motor', ship: 'ship',
};

export function computeDetailHint(config: ShopSystemConfig, selectedKind: string | null): DetailHintViewModel {
  if (selectedKind !== null) return { text: '' };
  return { text: `Tap a ${SYSTEM_NOUN[config.systemKey] ?? config.systemKey} type.` };
}

// ── Loadout ────────────────────────────────────────────────────────────────

/** The equipped kind's icon for a shop system; a blank icon when nothing is equipped. */
function equippedIcon(tab: ShopTab, save: SaveData): { iconKey: string; iconScale: number } {
  const config = shopSystemFor(tab);
  if (config === null) throw new Error(`No shop system config for tab "${tab}"`);
  for (const kind of config.kinds) {
    const level = config.equippedLevelForKind(save, kind);
    if (level > 0) return { iconKey: config.iconKey(kind, level), iconScale: config.iconScale(level) };
  }
  return { iconKey: '', iconScale: 1 };
}

export function computeLoadoutRows(save: SaveData): LoadoutViewModel {
  const eq = save.equipped;
  const weaponItem = eq.weapon !== null ? itemById(eq.weapon) : null;
  const shieldItem = eq.shield !== null ? itemById(eq.shield) : null;
  const genItem = itemById(eq.generator);
  const motorItem = itemById(eq.motor);
  const shipSpec = shipById(eq.ship);
  const rearItem = eq.rearWeapon !== null ? REAR_WEAPON_ITEMS[eq.rearWeapon] : undefined;
  const sideItem = eq.sideWeapon !== null ? SIDE_WEAPON_ITEMS[eq.sideWeapon] : undefined;

  const rows: LoadoutRowViewModel[] = [
    { slotLabel: 'SHIP', itemName: `${shipSpec.name} Lv${String(shipSpec.level)}`, price: shipSpec.price, systemKey: 'ship', empty: false, ...equippedIcon('ship', save) },
    { slotLabel: 'FRONT WEAPON', itemName: weaponItem !== null ? weaponItem.name : 'None', price: weaponItem?.price ?? 0, systemKey: 'weapon', empty: weaponItem === null, ...equippedIcon('weapon', save) },
    { slotLabel: 'REAR WEAPON', itemName: rearItem !== undefined ? rearItem.name : 'None', price: rearItem?.price ?? 0, systemKey: 'rear-weapon', empty: rearItem === undefined, ...equippedIcon('rear-weapon', save) },
    { slotLabel: 'SIDE WEAPON', itemName: sideItem !== undefined ? sideItem.name : 'None', price: sideItem?.price ?? 0, systemKey: 'side-weapon', empty: sideItem === undefined, ...equippedIcon('side-weapon', save) },
    { slotLabel: 'SHIELD', itemName: shieldItem !== null ? shieldItem.name : 'None', price: shieldItem?.price ?? 0, systemKey: 'shield', empty: shieldItem === null, ...equippedIcon('shield', save) },
    { slotLabel: 'GENERATOR', itemName: genItem.name, price: genItem.price, systemKey: 'generator', empty: false, ...equippedIcon('generator', save) },
    { slotLabel: 'MOTOR', itemName: motorItem.name, price: motorItem.price, systemKey: 'motor', empty: false, ...equippedIcon('motor', save) },
  ];
  return { rows, totalShipValue: rows.reduce((sum, r) => sum + r.price, 0) };
}

// ── Galaxy map ─────────────────────────────────────────────────────────────

const GALAXY_CONNECTIONS: [string, string][] = [
  ['t1', 't2'], ['t2', 't3'], ['t3', 't4'],
  ['t1', 'm1'],
  ['m1', 'm2'], ['m2', 'm3'], ['m3', 'm4'], ['m4', 'm5'], ['m5', 'm6'],
];

const GALAXY_NODES: Record<string, { x: number; y: number }> = {
  t1: { x: 62, y: 130 }, t2: { x: 133, y: 200 }, t3: { x: 87, y: 285 }, t4: { x: 172, y: 330 },
  m1: { x: 253, y: 100 }, m2: { x: 315, y: 185 }, m3: { x: 369, y: 115 },
  m4: { x: 408, y: 240 }, m5: { x: 450, y: 315 }, m6: { x: 494, y: 185 },
};

const MISSION_DURATION: Record<string, string> = {
  t1: '~30s', t2: '~1min', t3: '~1min', t4: '~2min',
  m1: '~3min', m2: '~5min', m3: '~8min', m4: '~8min',
  m5: '~12min', m6: '~15min',
};

export function computeGalaxyMap(save: SaveData, selectedMissionId: string | null): GalaxyMapViewModel {
  const missions: GalaxyMissionViewModel[] = [];
  for (const mission of ALL_MISSIONS) {
    const pos = GALAXY_NODES[mission.id];
    if (pos === undefined) continue;
    missions.push(computeGalaxyMission(save, mission, pos, selectedMissionId));
  }
  const connections = GALAXY_CONNECTIONS
    .filter(([a, b]) => GALAXY_NODES[a] !== undefined && GALAXY_NODES[b] !== undefined)
    .map(([fromId, toId]) => ({ fromId, toId, bothUnlocked: isMissionUnlocked(save, fromId) && isMissionUnlocked(save, toId) }));
  return { missions, connections };
}

function computeGalaxyMission(
  save: SaveData, mission: MissionSpec, pos: { x: number; y: number }, selectedMissionId: string | null,
): GalaxyMissionViewModel {
  const isTutorial = mission.forcedLoadout !== undefined;
  const unlocked = isMissionUnlocked(save, mission.id);
  const earned = save.missionStars[mission.id]?.length ?? 0;
  return {
    id: mission.id, x: pos.x, y: pos.y,
    label: unlocked ? mission.name : '???',
    unlocked, isTutorial,
    isSelected: mission.id === selectedMissionId,
    starsEarned: earned, starsTotal: mission.stars.length,
    showStarCount: !isTutorial && unlocked && mission.stars.length > 0,
  };
}

// ── Mission detail ─────────────────────────────────────────────────────────

export function computeMissionDetail(save: SaveData, selectedMissionId: string | null): MissionDetailViewModel | null {
  if (selectedMissionId === null) return null;
  const mission = ALL_MISSIONS.find((m) => m.id === selectedMissionId);
  if (mission === undefined) return null;
  const isTutorial = mission.forcedLoadout !== undefined;
  const earned = save.missionStars[mission.id] ?? [];
  return {
    name: mission.name,
    duration: MISSION_DURATION[mission.id] ?? '',
    isTutorial,
    stars: isTutorial ? [] : mission.stars.map((star) => ({ id: star.id, description: starDescription(star), earned: earned.includes(star.id) })),
    canStart: isMissionUnlocked(save, mission.id),
  };
}

function starDescription(star: StarSpec): string {
  const DESCRIPTIONS: Record<StarFamily, (threshold: number) => string> = {
    'finish-time': (t) => `Finish in ${String(Math.round(t / TICKS_PER_SECOND))}s`,
    'hull-above': (t) => `Finish hull > ${String(Math.round(t * 100))}%`,
    'all-kills': () => 'No enemy reaches your ship',
    'shield-unbroken': () => 'Shield never breaks',
    'boss-time': (t) => `Boss in ${String(Math.round(t / TICKS_PER_SECOND))}s`,
  };
  return DESCRIPTIONS[star.family](star.threshold);
}

// ── Dispatch reinforcements ──────────────────────────────────────────────────

const DR_CARDS_PER_PAGE = 10; // 5 cols × 2 rows in the real grid

/** Coin delta to move a subscription from `fromLevel` to `toLevel` (0 = never owned). Negative = refund. */
export function computeCumulativeCost(sub: SubscriptionSpec, fromLevel: number, toLevel: number): number {
  let cost = 0;
  if (toLevel > fromLevel) {
    for (let step = fromLevel; step < toLevel; step++) cost += sub.levels[step]?.price ?? 0;
  } else if (toLevel < fromLevel) {
    for (let step = toLevel; step < fromLevel; step++) cost -= sub.levels[step]?.price ?? 0;
  }
  return cost;
}

export function computeDispatch(save: SaveData, uiState: HubUIState, playerStars: number): DispatchViewModel {
  const subscriptions = Object.values(SUBSCRIPTIONS).map((sub) => computeSubscriptionRow(save, sub, uiState.selectedSubscriptionId));
  const sub = uiState.selectedSubscriptionId !== null ? SUBSCRIPTIONS[uiState.selectedSubscriptionId] : undefined;
  if (sub === undefined) {
    return { subscriptions, selectedSubscriptionId: null, subLevelChips: [], tagline: '', cards: [], page: 1, totalPages: 1 };
  }
  const ownedLevel = save.ownedSubscriptions[sub.id] ?? 0;
  const subLevelChips = computeSubLevelChips(sub, ownedLevel, save.coins, playerStars);
  const tagline = ownedLevel > 0 ? (sub.levels[ownedLevel - 1]?.tagline ?? '') : '';
  const { cards, page, totalPages } = computeDispatchCardsPage(sub, ownedLevel, uiState.dispatchPage);
  return { subscriptions, selectedSubscriptionId: sub.id, subLevelChips, tagline, cards, page, totalPages };
}

function computeSubscriptionRow(save: SaveData, sub: SubscriptionSpec, selectedId: string | null): SubscriptionRowViewModel {
  const ownedLevel = save.ownedSubscriptions[sub.id] ?? 0;
  const dots = Array.from({ length: sub.levels.length }, (_, j) => (j < ownedLevel ? '●' : '○')).join('');
  return {
    id: sub.id, name: sub.name, color: sub.color, ownedLevel, maxLevel: sub.levels.length, dots,
    statusText: ownedLevel > 0 ? `Lv${String(ownedLevel)} / ${String(sub.levels.length)}` : 'not subscribed',
    isSelected: sub.id === selectedId,
  };
}

function computeSubLevelChips(sub: SubscriptionSpec, ownedLevel: number, coins: number, playerStars: number): SubLevelChipViewModel[] {
  return sub.levels.map((lvlSpec, i) => {
    const level = i + 1;
    const label = `Lv${String(level)}`;
    if (ownedLevel === level) return { level, label, subLabel: '▶', state: 'current', mutation: null };
    const starsRequired = lvlSpec.starsRequired ?? 0;
    if (starsRequired > playerStars) return { level, label, subLabel: `★${String(starsRequired)}`, state: 'locked', mutation: null };
    const cost = computeCumulativeCost(sub, ownedLevel, level);
    const mutation = { type: 'set-subscription-level' as const, subId: sub.id, targetLevel: level };
    const isRefund = cost < 0;
    const affordable = isRefund || coins >= cost;
    const subLabel = isRefund ? `+${String(-cost)}⬤` : cost === 0 ? 'FREE' : `${String(cost)}⬤`;
    return { level, label, subLabel, state: affordable ? 'purchasable' : 'unaffordable', mutation };
  });
}

function computeDispatchCardsPage(
  sub: SubscriptionSpec, ownedLevel: number, requestedPage: number,
): { cards: DispatchCardViewModel[]; page: number; totalPages: number } {
  const allCards: Array<{ cardId: string; levelRequired: number }> = [];
  sub.levels.forEach((lvlData, i) => {
    lvlData.cardIds.forEach((cardId) => { allCards.push({ cardId, levelRequired: i + 1 }); });
  });
  const totalPages = Math.max(1, Math.ceil(allCards.length / DR_CARDS_PER_PAGE));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const startIdx = (page - 1) * DR_CARDS_PER_PAGE;
  const pageCards = allCards.slice(startIdx, startIdx + DR_CARDS_PER_PAGE);
  const cards = pageCards.map(({ cardId, levelRequired }) => computeDispatchCard(cardId, levelRequired, ownedLevel, sub.color));
  return { cards, page, totalPages };
}

function computeDispatchCard(cardId: string, levelRequired: number, ownedLevel: number, fallbackColor: number): DispatchCardViewModel {
  const ability = abilityById(cardId);
  return {
    cardId, name: ability.name, description: ability.description,
    kindLabel: ability.kind === 'active' ? 'ACTIVE' : 'PASSIVE',
    companyColor: ABILITY_COMPANY_COLORS[ability.company] ?? fallbackColor,
    levelRequired, accessible: levelRequired <= ownedLevel,
  };
}

// ── Supplies ───────────────────────────────────────────────────────────────

export function computeSupplies(save: SaveData): SupplyRowViewModel[] {
  return Object.entries(SUPPLIES).map(([id, entry]) => {
    const charges = save.ownedSupplyCharges[id] ?? 0;
    return {
      id, name: entry.spec.name, description: entry.spec.description,
      charges, maxCharges: entry.spec.maxCharges, pricePerCharge: entry.pricePerCharge,
      canBuy: charges < entry.spec.maxCharges && save.coins >= entry.pricePerCharge,
      canSell: charges > 0,
    };
  });
}

// ── Settings ───────────────────────────────────────────────────────────────

// musicMuted/sfxMuted come from the Sound singleton (src/audio/SoundManager.ts), which
// imports Phaser — so they're passed in rather than read here, same pattern as
// ResultViewModel's `newStarIds` input.
export function computeSettings(save: SaveData, musicMuted: boolean, sfxMuted: boolean): SettingsViewModel {
  return { musicMuted, sfxMuted, devMode: save.devMode !== false };
}
