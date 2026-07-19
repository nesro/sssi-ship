// Campaign playthrough simulator.
//
// Answers a different question than `pnpm sim`/`pnpm balance`: not "is mission X
// winnable at a hand-picked loadout" (already covered) but "does a simulated new
// player's own money and choices actually get them through the whole campaign, or do
// they arrive undergeared and get stuck?" Reuses the real shop/save logic
// (`src/save/SaveManager.ts`) directly — never reimplements shop math.
//
// Usage: pnpm campaign                       # 500 campaigns/archetype (quick default)
//        pnpm campaign -- --runs 5000         # thorough pass (run via run_in_background)
//        pnpm campaign -- --seed 7
//
// Design decisions:
//   1. Two archetypes: `expert`, `average` — NOT a smart-vs-dumb split, both are
//      genuinely competent players differing only in optimization depth. `expert`
//      rebuilds the best affordable build for every mission from a tuned per-mission
//      kind table (`tools/recommendedKinds.generated.ts`, produced by `pnpm tune`),
//      exploiting §5's "100% sell-back, always" rule via a per-slot diff-to-target
//      (same net cost as literal liquidation). `average` commits to the free starter
//      kind (pulse/wall/torrent/rush) for weapon/shield/generator/motor for the whole
//      campaign and never switches — a completely normal way to play, not a mistake —
//      making only incremental level-up purchases.
//   2. Card-picks fixed to `greedy` (this project's realistic-player proxy).
//   3. No farming in v1 (reported stuck-rate is an upper bound, not the real rate).
//      Tutorials cleared before m1.
//   4. Patience cap: 8 consecutive losses on one mission = stuck.
//   5. Both archetypes actually use every slot they buy: `expert` uses a
//      high-value-target-only side-weapon trigger and a reactive supply policy;
//      `average` uses a simpler "enemies on screen" trigger and a naive "use it the
//      instant it's charged" supply policy — both cooldown-gated (`tools/policies.ts`)
//      so neither dumps every charge into the first wave.
//   6. Seven report metrics (completion rate, retry distribution, churn histogram,
//      playtime vs. the ~50min combat-only subtotal, coin/star trajectory, margin at
//      clear). Margin (median hull% at clear + near-miss rate) exists because retry
//      count can't show a gradual m1-m5 ramp — it's a threshold metric (reads ~1.00
//      until per-attempt clear drops below ~90%, then jumps) — and GAME_DESIGN.md
//      §3/§1 ("never stuck", "no single best build") argue against forcing real
//      retries as the m1-m5 tension currency anyway.
//   7. Default N = 500/archetype quick, 5000/archetype thorough.

import './localStorageShim';

import { TICKS_PER_SECOND } from '../src/core/constants';
import { runMission } from '../src/core/replay';
import type { BoostPolicy, SideWeaponPolicy, TargetPolicy, TogglePolicy } from '../src/core/replay';
import { buildMissionResult } from '../src/core/result';
import type { MissionResult } from '../src/core/result';
import type { LoadoutSnapshot } from '../src/core/types';
import { abilityPoolForLoadout } from '../src/data/cards';
import {
  GENERATOR_KINDS, MAX_GENERATOR_LEVEL, MAX_MOTOR_LEVEL, MAX_SHIELD_LEVEL, MAX_WEAPON_LEVEL,
  MOTOR_KINDS, REAR_WEAPON_ITEMS, SHIELD_KINDS, SHIPS, SIDE_WEAPON_ITEMS, SUPPLIES,
  WEAPON_KINDS, generatorSpecAtLevel, itemById, motorSpecAtLevel, shieldSpecAtLevel,
  weaponSpecAtLevel,
} from '../src/data/items';
import type { CatalogItem } from '../src/data/items';
import { ALL_MISSIONS, missionById } from '../src/data/missions';
import { resolveForcedLoadout } from '../src/data/loadouts';
import { SUBSCRIPTIONS } from '../src/data/subscriptions';
import {
  type SaveData, applyMissionResult, buildLoadout, buySubscription, buySupplyCharge,
  defaultSave, switchItem, switchRearWeapon, switchShip, switchSideWeapon,
  totalStars, upgradeSubscription,
} from '../src/save/SaveManager';
import { INTENDED_LOADOUT_LEVELS } from './loadoutPresets';
import {
  alwaysOnToggles, brownoutAwareToggles, crowdSideWeaponPolicy, greedyPick,
  highValueTargetSideWeaponPolicy, prioritizeHighValueTargets, tapFirstChargedSupply, tapSuppliesReactively,
} from './policies';
import { RECOMMENDED_KIND_PER_MISSION } from './recommendedKinds.generated';

// ── Constants ────────────────────────────────────────────────────────────────

const PATIENCE_CAP = 8;
const DEFAULT_QUICK_N = 500;
const DEFAULT_THOROUGH_N = 5000;
// Below this hull fraction at the moment of victory, a clear counts as a "near-miss" —
// see the file header's decision 5 (margin metric) for why this exists.
const NEAR_MISS_HULL_THRESHOLD = 0.2;
const COMBAT_MINUTES_TARGET = 50; // GAME_DESIGN.md §13: ~50min combat + ~20min shop/planning

// ── "One hour of fun" score ─────────────────────────────────────────────────────
// Three sub-scores (completion, time-fit, pacing-shape) combined via geometric mean —
// one weak dimension tanks the total, since "one hour of FUN" is a compound goal, not
// an average of parts. Reuses data summarizeArchetype already collects; runs no extra
// simulations. Failing individual missions is explicitly NOT penalized (the player
// still nets coins and keeps progressing, per §3's "never stuck" principle) — only
// permanently getting stuck (patience-cap exhaustion) counts against the completion
// sub-score.

// Aspirational full-experience target (combat + shop/planning), not the combat-only
// COMBAT_MINUTES_TARGET above — deliberately scores against the real ~60-75min goal
// now rather than the current honest ~30min baseline, so the score visibly improves as
// real content lands.
const TARGET_TOTAL_MINUTES_MIN = 60;
const TARGET_TOTAL_MINUTES_MAX = 75;
// Estimated shop/planning time per mission — no live UI to measure, so this is a
// labeled estimate, not a measurement. Derived from GAME_DESIGN §13's own breakdown
// table (tutorials ~2min / early ~4min / mid ~6min / late ~8min ≈ 20min total across
// 10 missions), not an arbitrary new guess.
const SHOP_MINUTES_PER_MISSION_ESTIMATE = 2;
// Points lost per minute outside the target band, either direction.
const TIME_FIT_PENALTY_PER_MINUTE = 1.5;
// Percentage-point spread in median-hull-at-clear across main missions needed for
// full "real tension curve" credit — a flat campaign (spread near 0) scores low here
// regardless of how easy or hard it is in aggregate.
const PACING_SPREAD_TARGET_PP = 40;
const PACING_SPREAD_WEIGHT = 70; // of pacing-shape's 100 points
const PACING_FINALE_HARDEST_WEIGHT = 30; // of pacing-shape's 100 points, the rest

// Tutorials cleared before m1 (confirmed route policy) — hardcoded, not derived from
// MISSION_UNLOCK_EDGES, because the graph is agnostic to route order (m1 unlocks
// immediately after t1 regardless); this array *is* the confirmed policy choice, not
// something the graph shape alone determines.
const MISSION_ROUTE = ['t1', 't2', 't3', 't4', 'm1', 'm2', 'm3', 'm3b', 'm4', 'm5', 'm6'];
const MISSIONS_WITH_INTENDED_TARGET = new Set(['m1', 'm2', 'm3', 'm3b', 'm4', 'm5', 'm6']);

type Archetype = 'expert' | 'average';
const ARCHETYPES: Archetype[] = ['expert', 'average'];

// ── Star-gate replication ────────────────────────────────────────────────────
// `starsRequired` on catalog items/subscription levels is enforced only in the
// viewmodel layer (src/viewmodel/hub.ts), never inside a SaveManager mutator —
// calling switchItem/upgradeSubscription/etc. directly bypasses it entirely. Every
// purchase candidate built below must be checked against this before being applied.

function isStarLocked(starsRequired: number | undefined, save: SaveData): boolean {
  return (starsRequired ?? 0) > totalStars(save);
}

// ── Purchase candidates ──────────────────────────────────────────────────────
// One candidate = the single cheapest not-yet-owned upgrade available right now for
// one of the 9 purchasable systems (7 equip slots + supplies + subscriptions).
// `cost` is the real coin cost from the player's current state (trade-in price
// difference for equip slots, flat price for supplies/subscriptions) — always > 0.

interface PurchaseCandidate {
  system: string;
  cost: number;
  starsRequired: number;
  apply: (save: SaveData) => SaveData;
}

type EquipSlotSystem = 'weapon' | 'shield' | 'generator' | 'motor';

/** Reconstructs one system's full kind×level catalog from the exported KINDS array +
 * specAtLevel function + itemById — items.ts itself is never modified or duplicated,
 * this only walks the same building blocks tools/loadoutPresets.ts already uses. */
const CATALOG_SYSTEMS: Record<EquipSlotSystem, { kinds: readonly string[]; maxLevel: number; idAt: (kind: string, level: number) => string }> = {
  weapon: { kinds: WEAPON_KINDS, maxLevel: MAX_WEAPON_LEVEL, idAt: (k, l) => weaponSpecAtLevel(k as never, l).id },
  shield: { kinds: SHIELD_KINDS, maxLevel: MAX_SHIELD_LEVEL, idAt: (k, l) => shieldSpecAtLevel(k as never, l).id },
  generator: { kinds: GENERATOR_KINDS, maxLevel: MAX_GENERATOR_LEVEL, idAt: (k, l) => generatorSpecAtLevel(k as never, l).id },
  motor: { kinds: MOTOR_KINDS, maxLevel: MAX_MOTOR_LEVEL, idAt: (k, l) => motorSpecAtLevel(k as never, l).id },
};

function itemsForKind(system: EquipSlotSystem, kind: string): CatalogItem[] {
  const config = CATALOG_SYSTEMS[system];
  return Array.from({ length: config.maxLevel }, (_, i) => itemById(config.idAt(kind, i + 1)));
}

/** Cheapest item strictly more expensive than `currentPrice` — items in every
 * system are priced in strictly increasing kind-then-level order (src/data/
 * items.ts), so "next pricier item" is always the correct next rung on that ladder. */
function cheapestPricierThan<T extends { price: number }>(items: T[], currentPrice: number): T | null {
  const upgrades = items.filter((item) => item.price > currentPrice);
  if (upgrades.length === 0) return null;
  return upgrades.reduce((min, item) => (item.price < min.price ? item : min));
}

/** `average`'s upgrade path: stays within the currently-equipped kind (the next level
 * up) *forever* — never switches kind, even once the current kind is maxed. `average`
 * always starts on the free starter kind (`defaultSave()`'s `pulse-1`/`shield-wall-1`/
 * `generator-torrent-1`/`motor-rush-1`), so in practice this only ever climbs that
 * kind's own ladder. Must return null once maxed rather than falling back to a
 * different kind's Lv1 — that fallback is exactly the behavior `average` must not
 * have. */
function nextCatalogUpgradeSameKindOnly(save: SaveData, system: EquipSlotSystem): PurchaseCandidate | null {
  const config = CATALOG_SYSTEMS[system];
  const currentId = save.equipped[system];
  const currentPrice = currentId !== null ? itemById(currentId).price : 0;
  const currentKind = config.kinds.find((kind) => itemsForKind(system, kind).some((item) => item.spec.id === currentId));
  if (currentKind === undefined) return null;
  const next = cheapestPricierThan(itemsForKind(system, currentKind), currentPrice);
  if (next === null) return null;
  return {
    system, cost: next.price - currentPrice, starsRequired: next.starsRequired ?? 0,
    apply: (s) => switchItem(s, next.spec.id),
  };
}

/** `expert`'s upgrade path: a candidate that jumps straight to a specific kind+level —
 * `tools/recommendedKinds.generated.ts`'s tuned recommendation, not the currently-
 * equipped kind. Net-cost trade-in (via `switchItem`) makes this economically identical
 * to selling everything and rebuilding from scratch, implemented as a diff rather than
 * a literal liquidation. */
function targetCandidateForKind(save: SaveData, system: EquipSlotSystem, kind: string, level: number): PurchaseCandidate | null {
  const config = CATALOG_SYSTEMS[system];
  const targetId = config.idAt(kind, level);
  if (save.equipped[system] === targetId) return null;
  const target = itemById(targetId);
  const currentId = save.equipped[system];
  const currentPrice = currentId !== null ? itemById(currentId).price : 0;
  return {
    system, cost: target.price - currentPrice, starsRequired: target.starsRequired ?? 0,
    apply: (s) => switchItem(s, targetId),
  };
}

function nextRearWeaponUpgrade(save: SaveData): PurchaseCandidate | null {
  const currentId = save.equipped.rearWeapon;
  const currentPrice = currentId !== null ? (REAR_WEAPON_ITEMS[currentId]?.price ?? 0) : 0;
  const next = cheapestPricierThan(Object.values(REAR_WEAPON_ITEMS), currentPrice);
  if (next === null) return null;
  return {
    system: 'rearWeapon', cost: next.price - currentPrice, starsRequired: next.starsRequired ?? 0,
    apply: (s) => switchRearWeapon(s, next.spec.id),
  };
}

function nextSideWeaponUpgrade(save: SaveData): PurchaseCandidate | null {
  const currentId = save.equipped.sideWeapon;
  const currentPrice = currentId !== null ? (SIDE_WEAPON_ITEMS[currentId]?.price ?? 0) : 0;
  const next = cheapestPricierThan(Object.values(SIDE_WEAPON_ITEMS), currentPrice);
  if (next === null) return null;
  return {
    system: 'sideWeapon', cost: next.price - currentPrice, starsRequired: next.starsRequired ?? 0,
    apply: (s) => switchSideWeapon(s, next.spec.id),
  };
}

function nextShipUpgrade(save: SaveData): PurchaseCandidate | null {
  const currentPrice = SHIPS[save.equipped.ship]?.price ?? 0;
  const next = cheapestPricierThan(Object.values(SHIPS), currentPrice);
  if (next === null) return null;
  return {
    system: 'ship', cost: next.price - currentPrice, starsRequired: next.starsRequired ?? 0,
    apply: (s) => switchShip(s, next.id),
  };
}

/** Supplies have no star gate at all (SupplyCatalogEntry carries no starsRequired). */
function nextSupplyUpgrade(save: SaveData): PurchaseCandidate | null {
  const buyable = Object.entries(SUPPLIES).filter(
    ([id, entry]) => (save.ownedSupplyCharges[id] ?? 0) < entry.spec.maxCharges,
  );
  if (buyable.length === 0) return null;
  const [supplyId, entry] = buyable.reduce((min, cur) => (cur[1].pricePerCharge < min[1].pricePerCharge ? cur : min));
  return {
    system: 'supplies', cost: entry.pricePerCharge, starsRequired: 0,
    apply: (s) => buySupplyCharge(s, supplyId),
  };
}

/** Cheapest across every subscription line's next step (buy Lv1 if unowned, upgrade
 * one level if owned and not maxed) — sub-basic is free/owned by default, so it only
 * ever offers its Lv2/Lv3 upgrade steps here, never a "buy" step. */
function nextSubscriptionUpgrade(save: SaveData): PurchaseCandidate | null {
  const candidates: { subId: string; cost: number; starsRequired: number; buy: boolean }[] = [];
  for (const [subId, sub] of Object.entries(SUBSCRIPTIONS)) {
    const owned = save.ownedSubscriptions[subId] ?? 0;
    if (owned === 0) {
      if (sub.permanent) continue; // always owned from defaultSave(); never a "buy" candidate
      candidates.push({ subId, cost: sub.levels[0].price, starsRequired: sub.levels[0].starsRequired ?? 0, buy: true });
    } else if (owned < sub.levels.length) {
      const level = sub.levels[owned];
      if (level === undefined) continue;
      candidates.push({ subId, cost: level.price, starsRequired: level.starsRequired ?? 0, buy: false });
    }
  }
  if (candidates.length === 0) return null;
  const next = candidates.reduce((min, cur) => (cur.cost < min.cost ? cur : min));
  return {
    system: 'subscription', cost: next.cost, starsRequired: next.starsRequired,
    apply: (s) => (next.buy ? buySubscription(s, next.subId) : upgradeSubscription(s, next.subId)),
  };
}

/** `average`'s whole-catalog-cheapest optional-slot fill (no kind commitment — that
 * framing is specifically about the primary weapon/shield/generator/motor identity).
 * Also `expert`'s tutorial-phase fallback, when no tuning table entry exists yet. */
function opportunisticCandidates(save: SaveData): PurchaseCandidate[] {
  return [
    nextRearWeaponUpgrade(save), nextSideWeaponUpgrade(save), nextShipUpgrade(save),
    nextSupplyUpgrade(save), nextSubscriptionUpgrade(save),
  ].filter((c): c is PurchaseCandidate => c !== null);
}

function affordableAndUnlocked(save: SaveData, candidates: (PurchaseCandidate | null)[]): PurchaseCandidate[] {
  return candidates
    .filter((c): c is PurchaseCandidate => c !== null)
    // >= 0, not > 0: a same-level kind switch costs exactly 0 (every kind within a
    // system shares one price ladder) — `expert`'s whole premise is taking those free
    // sidegrades, so they must not be filtered out as "no-ops".
    .filter((c) => c.cost >= 0 && c.cost <= save.coins && !isStarLocked(c.starsRequired, save));
}

function cheapestOf(candidates: PurchaseCandidate[]): PurchaseCandidate | null {
  return candidates.length === 0 ? null : candidates.reduce((min, c) => (c.cost < min.cost ? c : min));
}

// ── expert: recommended-kind targeting for the 4 core systems ────────────────
// `expert`'s 4 target-driven candidates — whichever of weapon/shield/generator/motor
// isn't yet at the upcoming mission's tuned target (recommended kind ×
// GAME_DESIGN.md §13's intended level). Empty once all 4 are already met.

function buildExpertTargetedCandidates(save: SaveData, nextMissionId: string): PurchaseCandidate[] {
  const levels = INTENDED_LOADOUT_LEVELS[nextMissionId];
  const recommended = RECOMMENDED_KIND_PER_MISSION[nextMissionId];
  if (levels === undefined || recommended === undefined) return [];
  return [
    targetCandidateForKind(save, 'weapon', recommended.weapon, levels.weaponLevel),
    targetCandidateForKind(save, 'shield', recommended.shield, levels.shieldLevel),
    targetCandidateForKind(save, 'generator', recommended.generator, levels.generatorLevel),
    targetCandidateForKind(save, 'motor', recommended.motor, levels.motorLevel),
  ].filter((c): c is PurchaseCandidate => c !== null);
}

// ── expert: recommended-kind climbing for the 3 optional-slot systems ────────
// No GAME_DESIGN.md-defined "intended level" exists for rear weapon/side weapon/ship,
// so `expert` climbs the recommended kind's own ladder one affordable level at a time
// — same behavior as `average`'s core-system climb, just aimed at the tuned kind
// instead of whatever's currently equipped. If currently on a *different* kind than
// recommended, the same-price rung (free sidegrade) is offered before climbing higher.

function nextRearWeaponUpgradeForKind(save: SaveData, kind: string): PurchaseCandidate | null {
  const items = Object.values(REAR_WEAPON_ITEMS).filter((item) => item.spec.kind === kind);
  const currentId = save.equipped.rearWeapon;
  const currentPrice = currentId !== null ? (REAR_WEAPON_ITEMS[currentId]?.price ?? 0) : 0;
  const alreadyOnKind = currentId !== null && REAR_WEAPON_ITEMS[currentId]?.spec.kind === kind;
  const next = alreadyOnKind
    ? cheapestPricierThan(items, currentPrice)
    : (items.find((item) => item.price === currentPrice) ?? cheapestPricierThan(items, currentPrice));
  if (next === null) return null;
  return {
    system: 'rearWeapon', cost: next.price - currentPrice, starsRequired: next.starsRequired ?? 0,
    apply: (s) => switchRearWeapon(s, next.spec.id),
  };
}

function nextSideWeaponUpgradeForKind(save: SaveData, kind: string): PurchaseCandidate | null {
  const items = Object.values(SIDE_WEAPON_ITEMS).filter((item) => item.spec.kind === kind);
  const currentId = save.equipped.sideWeapon;
  const currentPrice = currentId !== null ? (SIDE_WEAPON_ITEMS[currentId]?.price ?? 0) : 0;
  const alreadyOnKind = currentId !== null && SIDE_WEAPON_ITEMS[currentId]?.spec.kind === kind;
  const next = alreadyOnKind
    ? cheapestPricierThan(items, currentPrice)
    : (items.find((item) => item.price === currentPrice) ?? cheapestPricierThan(items, currentPrice));
  if (next === null) return null;
  return {
    system: 'sideWeapon', cost: next.price - currentPrice, starsRequired: next.starsRequired ?? 0,
    apply: (s) => switchSideWeapon(s, next.spec.id),
  };
}

function nextShipUpgradeForKind(save: SaveData, kind: string): PurchaseCandidate | null {
  const items = Object.values(SHIPS).filter((ship) => ship.kind === kind);
  const currentPrice = SHIPS[save.equipped.ship]?.price ?? 0;
  const alreadyOnKind = SHIPS[save.equipped.ship]?.kind === kind;
  const next = alreadyOnKind
    ? cheapestPricierThan(items, currentPrice)
    : (items.find((ship) => ship.price === currentPrice) ?? cheapestPricierThan(items, currentPrice));
  if (next === null) return null;
  return {
    system: 'ship', cost: next.price - currentPrice, starsRequired: next.starsRequired ?? 0,
    apply: (s) => switchShip(s, next.id),
  };
}

/** `expert`'s optional-slot fill, once the core 4 are at target — climbs rear/side
 * weapon/ship toward the tuned recommended kind, plus supplies and whichever
 * subscription best complements the build (sub-offensive, the direct damage-synergy
 * pick, prioritized first; cheapest-next thereafter). Falls back to the plain
 * whole-catalog-cheapest versions (same as `average`) when no tuning table entry
 * exists yet (tutorials) — matching how `informed-saver` handled the tutorial phase. */
function expertOpportunisticCandidates(save: SaveData, nextMissionId: string | null): PurchaseCandidate[] {
  const recommended = nextMissionId !== null ? RECOMMENDED_KIND_PER_MISSION[nextMissionId] : undefined;
  const rearWeapon = recommended !== undefined ? nextRearWeaponUpgradeForKind(save, recommended.rearWeapon) : nextRearWeaponUpgrade(save);
  const sideWeapon = recommended !== undefined ? nextSideWeaponUpgradeForKind(save, recommended.sideWeapon) : nextSideWeaponUpgrade(save);
  const ship = recommended !== undefined ? nextShipUpgradeForKind(save, recommended.ship) : nextShipUpgrade(save);
  return [rearWeapon, sideWeapon, ship, nextSupplyUpgrade(save), nextExpertSubscriptionUpgrade(save)]
    .filter((c): c is PurchaseCandidate => c !== null);
}

/** `expert`'s subscription pick: sub-offensive first (a direct damage-synergy fit for
 * whatever weapon build the tuning table already chose), cheapest-next thereafter —
 * simple and defensible without a full fit-scoring system. */
function nextExpertSubscriptionUpgrade(save: SaveData): PurchaseCandidate | null {
  const offensive = SUBSCRIPTIONS['sub-offensive'];
  const owned = save.ownedSubscriptions['sub-offensive'] ?? 0;
  if (offensive !== undefined && owned < offensive.levels.length) {
    const level = owned === 0 ? offensive.levels[0] : offensive.levels[owned];
    if (level !== undefined) {
      return {
        system: 'subscription', cost: level.price, starsRequired: level.starsRequired ?? 0,
        apply: (s) => (owned === 0 ? buySubscription(s, 'sub-offensive') : upgradeSubscription(s, 'sub-offensive')),
      };
    }
  }
  return nextSubscriptionUpgrade(save);
}

/** Buys the single cheapest affordable, star-unlocked candidate this cycle — or does
 * nothing if none qualify.
 *
 * `expert` prioritizes its 4 targeted candidates *exclusively* while any are still
 * missing — a 30-coin rear-weapon buy must never outbid a 950-coin weapon upgrade, or
 * the plan would never actually execute. Once the target loadout is fully met (or
 * there is no target yet, e.g. still in the tutorial phase), it fills the 3 optional
 * equip slots + supplies + subscription toward the tuned recommendation.
 *
 * `average` never has a specific target — it commits to the free starter kind for the
 * core 4 forever and just climbs levels within it (`nextCatalogUpgradeSameKindOnly`).
 * "Always buy globally cheapest" was found to be a degenerate model for this archetype
 * too: the optional-slot systems start so much cheaper (rear-weapon Lv1 = 30 coins)
 * than the core 4's *second* tier (pulse-2 = 950) that a literal reading never once
 * touches weapon/shield/generator/motor across an entire campaign — no real player,
 * however casual, does that. Soft preference for the core 4: buy the cheapest
 * affordable core upgrade if one exists; only fall back to the optional-slot systems
 * (whole-catalog-cheapest, no kind commitment — that framing was specifically about
 * the primary loadout identity) when none of the 4 core systems currently have an
 * affordable, unlocked next level. */
function applyPurchasePolicy(save: SaveData, archetype: Archetype, nextMissionId: string | null): SaveData {
  if (archetype === 'expert') {
    const hasTarget = nextMissionId !== null && MISSIONS_WITH_INTENDED_TARGET.has(nextMissionId);
    const targeted = hasTarget ? buildExpertTargetedCandidates(save, nextMissionId) : [];
    if (targeted.length > 0) {
      const cheapest = cheapestOf(affordableAndUnlocked(save, targeted));
      return cheapest === null ? save : cheapest.apply(save);
    }
    const cheapest = cheapestOf(affordableAndUnlocked(save, expertOpportunisticCandidates(save, nextMissionId)));
    return cheapest === null ? save : cheapest.apply(save);
  }

  const coreCandidates = affordableAndUnlocked(save, [
    nextCatalogUpgradeSameKindOnly(save, 'weapon'), nextCatalogUpgradeSameKindOnly(save, 'shield'),
    nextCatalogUpgradeSameKindOnly(save, 'generator'), nextCatalogUpgradeSameKindOnly(save, 'motor'),
  ]);
  const cheapestCore = cheapestOf(coreCandidates);
  if (cheapestCore !== null) return cheapestCore.apply(save);
  const cheapestOpportunistic = cheapestOf(affordableAndUnlocked(save, opportunisticCandidates(save)));
  return cheapestOpportunistic === null ? save : cheapestOpportunistic.apply(save);
}

// ── Campaign loop ─────────────────────────────────────────────────────────────

interface MissionAttemptRecord {
  missionId: string;
  attempts: number;
  cleared: boolean;
  /** Hull fraction at the moment of victory — undefined if never cleared. Existing
   * `MissionResult.hullFraction` data, just also kept per-mission here for the margin
   * report below (see the file header's decision 5 for why this metric exists). */
  hullFractionAtClear?: number;
}

interface CampaignRecord {
  archetype: Archetype;
  missionLog: MissionAttemptRecord[];
  stuckAt: string | null;
  combatTicks: number;
  finalCoins: number;
  finalStars: number;
  /** coins/stars snapshot right after clearing each mission — for the dead-zone check. */
  trajectory: { missionId: string; coins: number; stars: number }[];
}

/** One deterministic per-(campaign, mission, attempt) seed — large enough to never
 * collide across the realistic N/mission-count/patience-cap ranges this tool runs at. */
function attemptSeed(campaignSeed: number, missionIndex: number, attempt: number): number {
  return campaignSeed * 1_000_000 + missionIndex * 1000 + attempt;
}

/** Fresh per-attempt (not per-campaign) — the cooldown state inside these policies is
 * relative to `state.tick`, which resets every mission. */
function sideWeaponPolicyFor(archetype: Archetype): SideWeaponPolicy {
  return archetype === 'expert' ? highValueTargetSideWeaponPolicy() : crowdSideWeaponPolicy();
}

function boostPolicyFor(archetype: Archetype): BoostPolicy {
  return archetype === 'expert' ? tapSuppliesReactively : tapFirstChargedSupply;
}

/** `expert` reads the energy bar and cuts the rear weapon to recover from brownout;
 * `average` leaves every toggle on for the whole mission, same as every archetype did
 * before `manageToggles` existed — a real, unremarkable way to play, not a mistake
 * (mirrors the "average commits, never switches" reasoning used for kind selection). */
function manageTogglesPolicyFor(archetype: Archetype): TogglePolicy {
  return archetype === 'expert' ? brownoutAwareToggles : alwaysOnToggles;
}

/** `expert` taps enemies the game flags "must be prioritized" (turret/booster/boss);
 * `average` fires on default front-most targeting, same as every archetype did before
 * tap-to-target existed. */
function chooseTargetPolicyFor(archetype: Archetype): TargetPolicy | undefined {
  return archetype === 'expert' ? prioritizeHighValueTargets : undefined;
}

function runOneCampaign(archetype: Archetype, campaignSeed: number): CampaignRecord {
  let save = defaultSave();
  const missionLog: MissionAttemptRecord[] = [];
  const trajectory: CampaignRecord['trajectory'] = [];
  let combatTicks = 0;
  let stuckAt: string | null = null;

  for (let missionIndex = 0; missionIndex < MISSION_ROUTE.length; missionIndex++) {
    const missionId = MISSION_ROUTE[missionIndex];
    if (missionId === undefined) break; // unreachable given the loop bound; satisfies noUncheckedIndexedAccess
    const mission = missionById(missionId);
    let attempts = 0;
    let cleared = false;
    let hullFractionAtClear: number | undefined;

    while (attempts < PATIENCE_CAP && !cleared) {
      attempts++;
      const loadout: LoadoutSnapshot = mission.forcedLoadout !== undefined
        ? resolveForcedLoadout(mission.forcedLoadout)
        : buildLoadout(save);
      const abilityPool = abilityPoolForLoadout(loadout);
      const seed = attemptSeed(campaignSeed, missionIndex, attempts);
      const chooseTarget = chooseTargetPolicyFor(archetype);
      const { state } = runMission(mission, loadout, seed, {
        abilityPool, pickAbility: greedyPick,
        useSideWeapon: sideWeaponPolicyFor(archetype), useBoost: boostPolicyFor(archetype),
        manageToggles: manageTogglesPolicyFor(archetype),
        ...(chooseTarget !== undefined ? { chooseTarget } : {}),
      });
      const result: MissionResult = buildMissionResult(state);
      combatTicks += result.durationTicks;
      cleared = result.status === 'victory';
      if (cleared) hullFractionAtClear = result.hullFraction;
      save = applyMissionResult(save, result).save;

      const nextMissionId = cleared ? (MISSION_ROUTE[missionIndex + 1] ?? null) : missionId;
      save = applyPurchasePolicy(save, archetype, nextMissionId);
    }

    missionLog.push(
      hullFractionAtClear === undefined
        ? { missionId, attempts, cleared }
        : { missionId, attempts, cleared, hullFractionAtClear },
    );
    if (!cleared) { stuckAt = missionId; break; }
    trajectory.push({ missionId, coins: save.coins, stars: totalStars(save) });
  }

  return { archetype, missionLog, stuckAt, combatTicks, finalCoins: save.coins, finalStars: totalStars(save), trajectory };
}

// ── Reporting ─────────────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[index] ?? 0;
}

interface FunScore {
  completion: number;
  timeFit: number;
  pacingShape: number;
  overall: number;
}

function clamp0to100(n: number): number {
  return Math.min(100, Math.max(0, n));
}

/** 100 at the target band, decaying linearly outside it in either direction. */
function timeFitScore(totalMinutes: number): number {
  if (totalMinutes >= TARGET_TOTAL_MINUTES_MIN && totalMinutes <= TARGET_TOTAL_MINUTES_MAX) return 100;
  const distance = totalMinutes < TARGET_TOTAL_MINUTES_MIN
    ? TARGET_TOTAL_MINUTES_MIN - totalMinutes
    : totalMinutes - TARGET_TOTAL_MINUTES_MAX;
  return clamp0to100(100 - distance * TIME_FIT_PENALTY_PER_MINUTE);
}

/** Median hull-at-clear per main mission (m-prefixed only — tutorials are forced-
 * loadout/defeat-completes and aren't part of the tension question), in route order.
 * Missions with zero recorded clears are dropped entirely, not defaulted to 0% —
 * "no data" and "everyone dies at 0 hull" are very different things, and letting a
 * no-data mission silently read as 0 would fake a huge, meaningless spread. */
function medianHullByMainMission(campaigns: CampaignRecord[]): { missionId: string; medianHullPct: number }[] {
  const mainMissionIds = MISSION_ROUTE.filter((id) => id.startsWith('m'));
  const result: { missionId: string; medianHullPct: number }[] = [];
  for (const missionId of mainMissionIds) {
    const hullFractions = campaigns
      .flatMap((c) => c.missionLog)
      .filter((m) => m.missionId === missionId && m.cleared)
      .map((m) => m.hullFractionAtClear)
      .filter((h): h is number => h !== undefined)
      .sort((a, b) => a - b);
    if (hullFractions.length === 0) continue;
    result.push({ missionId, medianHullPct: percentile(hullFractions, 0.5) * 100 });
  }
  return result;
}

/** Rewards a real tension curve (spread across missions) instead of flat-then-cliff,
 * and requires the campaign's actual final main mission to be at or near the hardest
 * point — a mid-campaign spike that leaves the finale comparatively easy doesn't fully
 * solve "flat". */
function pacingShapeScore(campaigns: CampaignRecord[]): number {
  const byMission = medianHullByMainMission(campaigns);
  if (byMission.length < 2) return 0; // not enough data to have a shape at all

  const hulls = byMission.map((m) => m.medianHullPct);
  const spread = Math.max(...hulls) - Math.min(...hulls);
  const spreadScore = clamp0to100((spread / PACING_SPREAD_TARGET_PP) * 100) * (PACING_SPREAD_WEIGHT / 100);

  const minHull = Math.min(...hulls);
  const finaleHull = hulls[hulls.length - 1] ?? minHull;
  // Full credit if the finale IS the hardest point; scaled down by how much easier
  // the finale is than the hardest mission elsewhere in the campaign.
  const finaleScore = clamp0to100(100 - (finaleHull - minHull)) * (PACING_FINALE_HARDEST_WEIGHT / 100);

  return spreadScore + finaleScore;
}

function computeFunScore(campaigns: CampaignRecord[]): FunScore {
  const completed = campaigns.filter((c) => c.stuckAt === null);
  const completion = (completed.length / campaigns.length) * 100;

  const combatMinutesMedian = completed.length > 0
    ? percentile(completed.map((c) => c.combatTicks / TICKS_PER_SECOND / 60).sort((a, b) => a - b), 0.5)
    : 0;
  // Estimate total playtime from combat time + a per-mission shop-time estimate,
  // scaled by how many missions were actually reached (stuck campaigns still shopped
  // for the missions they did reach).
  const missionsReachedMedian = completed.length > 0
    ? percentile(completed.map((c) => c.missionLog.length).sort((a, b) => a - b), 0.5)
    : MISSION_ROUTE.length;
  const estimatedTotalMinutes = combatMinutesMedian + missionsReachedMedian * SHOP_MINUTES_PER_MISSION_ESTIMATE;
  const timeFit = completed.length > 0 ? timeFitScore(estimatedTotalMinutes) : 0;

  const pacingShape = pacingShapeScore(campaigns);

  // Geometric mean — deliberately not an average. A campaign that's fast and
  // never-stuck but completely flat should not score well just because nothing
  // technically went wrong; "one hour of FUN" is a compound goal.
  const overall = Math.cbrt(Math.max(0, completion) * Math.max(0, timeFit) * Math.max(0, pacingShape));

  return { completion, timeFit, pacingShape, overall };
}

function summarizeArchetype(archetype: Archetype, campaigns: CampaignRecord[]): void {
  const completed = campaigns.filter((c) => c.stuckAt === null);
  const completionRate = (completed.length / campaigns.length) * 100;

  console.log(`\n=== ${archetype} (${String(campaigns.length)} campaigns) ===`);
  console.log(`Completion rate: ${completionRate.toFixed(1)}% (${String(completed.length)}/${String(campaigns.length)} cleared m6 within the patience cap)`);

  const fun = computeFunScore(campaigns);
  console.log(`"One hour of fun" score: ${fun.overall.toFixed(1)}/100 ` +
    `(completion=${fun.completion.toFixed(1)} time-fit=${fun.timeFit.toFixed(1)} pacing-shape=${fun.pacingShape.toFixed(1)}, geometric mean)`);

  console.log('Retry-count distribution per mission (among attempts that reached it):');
  for (const missionId of MISSION_ROUTE) {
    const attemptCounts = campaigns
      .flatMap((c) => c.missionLog)
      .filter((m) => m.missionId === missionId && m.cleared)
      .map((m) => m.attempts);
    if (attemptCounts.length === 0) continue;
    const sorted = [...attemptCounts].sort((a, b) => a - b);
    const mean = attemptCounts.reduce((sum, n) => sum + n, 0) / attemptCounts.length;
    const median = percentile(sorted, 0.5);
    const p90 = percentile(sorted, 0.9);
    console.log(`  ${missionId.padEnd(4)} mean=${mean.toFixed(2)} median=${String(median)} p90=${String(p90)} (n=${String(attemptCounts.length)})`);
  }

  console.log(`Margin at clear (median hull% + near-miss rate, hull<${String(NEAR_MISS_HULL_THRESHOLD * 100)}%):`);
  for (const missionId of MISSION_ROUTE) {
    const hullFractions = campaigns
      .flatMap((c) => c.missionLog)
      .filter((m) => m.missionId === missionId && m.cleared)
      .map((m) => m.hullFractionAtClear)
      .filter((h): h is number => h !== undefined);
    if (hullFractions.length === 0) continue;
    const sorted = [...hullFractions].sort((a, b) => a - b);
    const medianHullPct = percentile(sorted, 0.5) * 100;
    const nearMissRate = (hullFractions.filter((h) => h < NEAR_MISS_HULL_THRESHOLD).length / hullFractions.length) * 100;
    console.log(`  ${missionId.padEnd(4)} median hull=${medianHullPct.toFixed(0)}% near-miss=${nearMissRate.toFixed(1)}% (n=${String(hullFractions.length)})`);
  }

  const stuck = campaigns.filter((c) => c.stuckAt !== null);
  if (stuck.length > 0) {
    console.log(`Churn-point histogram (${String(stuck.length)} stuck campaigns):`);
    for (const missionId of MISSION_ROUTE) {
      const count = stuck.filter((c) => c.stuckAt === missionId).length;
      if (count > 0) console.log(`  ${missionId.padEnd(4)} ${String(count)} (${((count / stuck.length) * 100).toFixed(1)}%)`);
    }
  }

  if (completed.length > 0) {
    const combatMinutes = completed.map((c) => c.combatTicks / TICKS_PER_SECOND / 60).sort((a, b) => a - b);
    console.log(`Combat-time-to-clear-m6 (compare against the ~${String(COMBAT_MINUTES_TARGET)}min combat-only subtotal, not the full 60-75min headline which includes shop time):`);
    console.log(`  median=${percentile(combatMinutes, 0.5).toFixed(1)}min p90=${percentile(combatMinutes, 0.9).toFixed(1)}min`);

    console.log('Coin/star trajectory (median coins right after clearing each mission):');
    for (const missionId of MISSION_ROUTE) {
      const coinsAtMission = completed
        .map((c) => c.trajectory.find((t) => t.missionId === missionId)?.coins)
        .filter((coins): coins is number => coins !== undefined)
        .sort((a, b) => a - b);
      if (coinsAtMission.length === 0) continue;
      console.log(`  ${missionId.padEnd(4)} median coins=${String(Math.round(percentile(coinsAtMission, 0.5)))}`);
    }
  }

  if (stuck.length > 0) {
    console.log(`⚠️  No farming modeled in v1 — this ${completionRate.toFixed(1)}% completion rate is an upper bound on real churn, not the true rate (real players can farm an easier mission for coins instead of retrying blindly).`);
  }
}

// ── CLI ───────────────────────────────────────────────────────────────────────

interface CliOptions {
  runs: number;
  baseSeed: number;
}

function parseArgs(rawArgv: string[]): CliOptions {
  const argv = rawArgv.filter((arg) => arg !== '--');
  const options: CliOptions = { runs: DEFAULT_QUICK_N, baseSeed: 1 };
  let i = 0;
  while (i < argv.length) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === undefined || value === undefined) break;
    if (flag === '--runs') options.runs = parsePositiveInt(value, flag);
    else if (flag === '--seed') options.baseSeed = parsePositiveInt(value, flag);
    else throw new Error(`Unknown flag "${flag}". Known: --runs --seed (default --runs ${String(DEFAULT_QUICK_N)}, thorough pass ${String(DEFAULT_THOROUGH_N)})`);
    i += 2;
  }
  return options;
}

function parsePositiveInt(value: string, flag: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${flag} expects a positive integer, got "${value}"`);
  return parsed;
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  console.log(`Simulating ${String(options.runs)} campaigns per archetype (${String(ARCHETYPES.length)} archetypes, ${String(options.runs * ARCHETYPES.length)} total)…`);
  console.log(`Missions in this build: ${ALL_MISSIONS.map((m) => m.id).join(', ')}`);

  for (const archetype of ARCHETYPES) {
    // Each archetype gets its own non-overlapping seed range — generalized from a
    // 2-archetype hardcoded ternary so a 3rd archetype never needs a new branch here.
    const archetypeSeedOffset = ARCHETYPES.indexOf(archetype) * 10_000_000;
    const campaigns: CampaignRecord[] = [];
    for (let i = 0; i < options.runs; i++) {
      campaigns.push(runOneCampaign(archetype, options.baseSeed + archetypeSeedOffset + i));
    }
    summarizeArchetype(archetype, campaigns);
  }
}

// Runs only when invoked directly (`pnpm campaign`), not when imported by tests —
// ESM has no `require.main === module`, so compare against the actual invoked script.
if (process.argv[1] !== undefined && import.meta.url === new URL(process.argv[1], 'file://').href) {
  main();
}

export {
  MISSION_ROUTE, PATIENCE_CAP, applyPurchasePolicy, computeFunScore, isStarLocked,
  pacingShapeScore, runOneCampaign, timeFitScore,
};
export type { Archetype, CampaignRecord, FunScore };
