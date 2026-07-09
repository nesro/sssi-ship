# Plan: ViewModel Layer

## Revision note

This is a rewrite of a plan that failed an adversarial review (Fable model, full
transcript available on request). The review found the type sections for Dispatch,
CombatHud, ResultScene, and ShopPreviewPanel described UIs that don't match the real
code, an unfixed rear-weapon bug where Fix 1 didn't fix its own bug, and — the most
important finding — a live economy bug in `switchItem`/`switchShip` where re-equipping
an already-owned item after unequipping charges full price and/or silently deletes a
different owned item. Every type below was re-derived from reading the actual source
files line by line (`HubScene.ts` all 1720 lines, `SaveManager.ts`, `CombatHud.ts`,
`ShopPreviewPanel.ts`, `ResultScene.ts`, `SupplyButtons.ts`, `CardOverlay.ts`,
`NarratorBar.ts`, `textures.ts`), not assumed from the previous draft.

---

## What this changes and why

Every scene in the game mixes game logic with Phaser calls in the same function. Bugs
hide because logic decisions (which level to buy, what badge to show, what a bar value
is) are untestable without running Phaser. This plan introduces `src/viewmodel/` — a
pure TypeScript layer between game state and Phaser. Every scene computes a plain data
object describing what to show; Phaser scenes read that object and render it. Logic is
tested; rendering is visually verified.

---

## Scope

| Component | Viewmodel | Reason |
|---|---|---|
| HubScene — shop kind rows (6 systems) | ✓ | Core bug class; tested per system and cross-system |
| HubScene — loadout tab | ✓ | Level display, slot names |
| HubScene — galaxy map | ✓ | Mission unlock state, star counts, tutorial styling |
| HubScene — mission detail panel | ✓ | Star descriptions, button state |
| HubScene — dispatch reinforcements | ✓ | Subscription rows, **cumulative multi-level cost**, card grid, pagination |
| HubScene — settings panel | ✓ | Mute state, dev-mode-driven layout, dev button set |
| HubScene — supplies tab | ✓ | Charge counts, prices, afford/max state |
| CombatHud | ✓ | 4 bar fractions/colors, boss-vs-progress mode, support markers, stat lines |
| SupplyButtons (in-combat) | ✓ | Empty/full dimming — thin, but same rule as everything else |
| CardOverlay (in-combat) | ✓ | Reroll-button visibility, card accessibility |
| ShopPreviewPanel — static half | ✓ | DPS label, motor level/color parsed from id, prospective-vs-current resolution |
| ShopPreviewPanel — live sim | ✓ (as a pure stepper) | `stepSim` mirrors `energy.ts`'s pulse mechanic untested — see below |
| ResultScene | ✓ | Victory/defeat, NEW! marking, tutorial branch, button set decision |
| NarratorBar | ✗ | Pure time-based character reveal; no game-state decision, nothing to test |
| CombatScene — particles, tweens, missiles | ✗ | Event-driven view-local effects; no game logic |
| ShopPreviewPanel — bolts/flashes/thruster flicker | ✗ | Pure animation driven by `phase`/timers, no decision logic |

Every view file in `src/view/` now has an explicit verdict — nothing is silently out of
scope.

---

## Directory structure

```
src/viewmodel/
  hub.ts             — shop rows, loadout, galaxy map, mission detail, dispatch,
                       settings, supplies, top-level HubViewModel + HubUIState
  combat.ts          — CombatHudViewModel, SupplyButtonsViewModel, CardOverlayViewModel
  preview.ts         — PreviewViewModel (static) + stepPreviewSim (pure sim stepper)
  result.ts          — ResultViewModel
  shopSystems.ts     — ShopSystemConfig objects for all 6 systems
  hub.test.ts
  combat.test.ts
  preview.test.ts
  result.test.ts

src/view/
  textureKeys.ts     — NEW: pure icon-key lookup functions extracted from textures.ts
                       (zero Phaser import) so shopSystems.ts can depend on them
                       without pulling Phaser into src/viewmodel/**
```

All files in `src/viewmodel/` import zero Phaser and zero `src/view/**` except
`src/view/textureKeys.ts`. Enforced by ESLint (see below).

---

## Fixes to make before or during implementation

### Fix 1 — Rear-weapon tap target ignores owned level
**Verified: HubScene.ts:524–530.** Tapping an unequipped rear-weapon kind row always
calls `switchRearWeapon(save, \`${kind}-1\`)`, never checking what level of that kind is
already owned (`ownedRearWeaponLevelForKind`, which already exists at
HubScene.ts:542–547 but isn't used here). Combined with Fix 6 below, a player who owns
`grenade-3`, unequips, then re-taps grenade currently gets charged for `grenade-1` and
loses their `grenade-3` ownership (case handled by Fix 6, but the row must also *target*
the right level so a correctly-implemented Fix 6 doesn't even need to fire on this path).

**Fix:** tap target = `ownedRearWeaponLevelForKind(kind) > 0 ? ownedLevel : 1`, matching
every other system's row-tap pattern exactly (shield/generator/motor/ship already do
this correctly — see HubScene.ts:881–888, 963–970, 1043–1050, 1262–1269).

### Fix 2 — Delete `bestAffordableLevelForKind` from weapon tab
**Verified: HubScene.ts:1382, 1388, 1506–1517.** The weapon tab is the only system that
auto-selects the *highest affordable* level when switching to a new kind, via
`bestAffordableLevelForKind`. Every other system just targets Lv1 for an unowned kind.

**Decided (per user):** switching kind always buys Lv1. Trade-in happens (coins back
per Fix 6), but the tap never auto-jumps to a higher level. Player taps the level chip
for upgrades. `bestAffordableLevelForKind` is deleted; weapon tab becomes identical in
shape to shield/generator/motor/ship: `target = ownedLevel > 0 ? ownedLevel : 1`.

### Fix 3 — Selection state feeds ShopPreviewPanel; must migrate atomically
**Verified: HubScene.ts:150–161, 1519–1590.** The six `shopSelectedXxxKind` fields feed
six `prospectiveXxxLoadout()` functions that drive `ShopPreviewPanel.show()`. Migrating
one tab at a time breaks the preview panel for other tabs mid-migration.

**Fix:** replace all six fields with `HubUIState.selectedKindByTab` in one commit,
update all six prospective functions in the same commit. This is a larger single commit
than it looks — roughly 20 read/write sites across `rebuildContent`, the tab-switch
reset handler (HubScene.ts:444–456), all six `buildXxxRows`, and all six
`prospectiveXxxLoadout` functions must move together.

### Fix 4 — `cheatNavShop` writes `this.shopTab` directly
**Verified: HubScene.ts:213–216.** Same commit as Fix 3: `cheatNavShop` must write
`this.uiState.tab`. Forgetting this breaks `__cheat.navShop('shield')`, used in every
testing session per project convention.

### Fix 5 — Dispatch subscription cumulative cost has no tests
**Verified: HubScene.ts:667–676.** The chip-cost loop sums `sub.levels[step].price` for
every level crossed when upgrading/downgrading — the single most complex money
calculation in the hub, and currently the least tested (zero tests). This becomes a
pure `computeCumulativeCost(sub, fromLevel, toLevel)` function in `hub.ts`, called by
`computeSubLevelChips` for badge labels.

### Fix 6 — Owned-item re-equip charges full price and can delete a different owned item
**The most serious finding.** `SaveData`'s own doc comment says "Item IDs permanently
owned — once bought, free to re-equip at any time" (SaveManager.ts:26). `switchItem`
and `switchShip` don't honor this:

**Verified bug A (SaveManager.ts:357–364):** `switchItem`'s cost is always
`item.price − currentEquippedPrice`, computed from what's *currently equipped*, never
checking whether `itemId` itself is already owned. Sequence: equip shield Lv1 (owned),
unequip it (`unequipShield` keeps `ownedItems`, SaveManager.ts:384–389), re-tap the same
shield kind. `currentId` is now `null`, so `currentPrice = 0`, so
`cost = item.price - 0` = **full price for an item already owned.**

**Verified bug B (SaveManager.ts:350–373):** own `wall-1`, switch (upgrade) to
`reflex-2` — since `cost > 0`, `wall-1` is *not* deleted, both are owned. Now tap the
`wall` row again: `currentId = 'reflex-2'`, `cost = wall-1.price − reflex-2.price`
(negative → refund), and because `cost < 0 && currentId !== null`,
**`reflex-2` is deleted from `ownedItems`** — even though the player never chose to
sell it, and the on-screen badge for this exact row claims "switching is free"
(HubScene.ts:1117–1121, the `ownedNotEquipped` badge branch), not "this will delete
your reflex-2 and refund you."

**This is a genuine design-decision-requiring-confirmation, not just a bug fix** — see
the Design Decisions section below. Recommended fix, to be confirmed:

> If `itemId` is already in `ownedItems`: equip it for **free**. No coin change, no
> `ownedItems` mutation at all (nothing added or removed — it was already there).
> Only when `itemId` is *not yet owned* does the existing trade-in formula
> (`cost = newPrice − currentPrice`, delete `currentId` only when `cost < 0`) apply.

This single rule, applied uniformly, fixes bug A (re-equip is now free) and bug B (no
mutation happens on a re-equip, so nothing gets deleted) without changing the existing
"upgrade keeps the old item, downgrade sells it" trade-in behavior for genuinely new
purchases. Applies to `switchItem` and `switchShip` directly.

**`switchRearWeapon` needs the same rule, not just Fix 1's tap-target correction.**
Verified: `switchRearWeapon`'s "same id → free" check (SaveManager.ts:234) only compares
against the *currently equipped* id, which is `null` after unequip. Own `grenade-3`,
unequip (NONE), re-tap grenade: even with Fix 1's corrected tap target of `grenade-3`,
`currentId` is `null` so `currentPrice = 0` and `cost = full grenade-3 price`
(SaveManager.ts:237–238) — the player is charged again for an item they already own.
Fix: add the same owned-check as an early branch, before the cost calculation:

```typescript
if (save.ownedItems.includes(rearWeaponId)) {
  const next: SaveData = { ...save, equipped: { ...save.equipped, rearWeapon: rearWeaponId } };
  persistSave(next);
  return next;
}
```

The destructive kind-sweep (delete all other rear-weapon ids, SaveManager.ts:242–246)
stays unchanged and only runs on the "not yet owned" path, preserving the
one-rear-weapon-kind-at-a-time model for genuinely new purchases.

---

## Visual unifications (confirmed as in scope, applied via the shared renderer)

| # | Current divergence | Unified target |
|---|---|---|
| 1 | Weapon name alpha 0.6/0.25 (HubScene.ts:1401); shield 1.0/0.4 (HubScene.ts:896) | Single `rowState → alpha` lookup table |
| 2 | Weapon hides cost badge when unaffordable; shield greys it | Always show badge, grey when unaffordable |
| 3 | Ship icon fixed scale 0.6 (HubScene.ts:1271); others `1.2+(lv−1)×0.07` | Ship keeps 0.6 via `iconScale` in VM — this is an intentional visual choice (ships read better smaller), not an inconsistency to remove |
| 4 | Per-tab empty hints ("Tap a shield type." etc., e.g. HubScene.ts:903, 985, 1065, 1284) | `detailHint` string in VM; one shared text object |
| 5 | Rear-weapon `canAfford` check uses a clamped `Math.max(0, entry − equipped)` (HubScene.ts:520–521) while shield/generator/motor/ship check raw `coins >= entryPrice` (e.g. HubScene.ts:877) | Both rows corrected — the rear-weapon **badge itself is already signed** (HubScene.ts:539 passes raw prices into `addKindBadge`, which already shows a proper refund message); only the redundant `canAfford` clamp is removed so all six systems compute affordability from the same signed `switchCost`-style formula |

Row 3 is downgraded from "bug" to "intentional" on inspection — the plan keeps it as a
per-system `iconScale` field, not a target for unification. Row 5 is corrected from the
first draft, which incorrectly claimed the rear-weapon badge display itself needed to
change — it doesn't; only the affordability check does.

---

## Type definitions

### `src/viewmodel/hub.ts`

```typescript
// ── Shop kind rows (weapon / rear-weapon / shield / generator / motor / ship) ──────

type KindRowState =
  | 'equipped'       // this kind is currently equipped
  | 'owned'          // owned at some level, not equipped
  | 'purchasable'    // can afford
  | 'unaffordable'   // cannot afford
  | 'locked';        // star-gated

type KindRowBadge =
  | { kind: 'stars';  label: string; stars: number }
  | { kind: 'cost';   label: string; coins: number; affordable: boolean }
  | { kind: 'free';   label: string }
  | { kind: 'refund'; label: string; coins: number }
  | null;

// Tapping a row ALWAYS updates selection; OPTIONALLY mutates save (per Fix 6, a tap on
// an owned-not-equipped row is now a zero-cost re-equip mutation, not a no-op)
interface KindRowTap {
  selectKind: string | null;   // null = select NONE row
  mutation:
    | { type: 'switch-item'; itemId: string }
    | { type: 'unequip' }
    | null;
}

interface KindRowViewModel {
  kind: string | null;         // null = NONE row
  isNoneRow: boolean;
  displayName: string;
  displayLevel: number;        // for icon; 1 if not owned
  iconKey: string;
  iconScale: number;           // ship: 0.6 (intentional); others: 1.2+(lv−1)×0.07
  rowState: KindRowState;
  isSelected: boolean;
  badge: KindRowBadge;
  tap: KindRowTap;
  detailLines: string[];       // stat block / blurb; [] if none
}

interface LevelChipViewModel {
  itemId: string;
  label: string;               // "Lv1", "Lv2", …
  subLabel: string;            // "FREE", "300⬤", "★10", "▶"
  state: 'equipped' | 'owned' | 'purchasable' | 'unaffordable' | 'locked';
  mutation: { type: 'switch-item'; itemId: string } | null;
}

interface DetailHintViewModel {
  text: string;                // "Tap a shield type." / "" when a kind is selected
}

// ── Loadout ────────────────────────────────────────────────────────────────

interface LoadoutRowViewModel {
  slotLabel: string;           // "SHIP", "FRONT WEAPON", …
  itemName: string;            // "Pulse Laser Lv1" or "None" — items already have "LvN"
                                // in item.name; the ship row builds it manually as
                                // `${shipSpec.name} Lv${shipSpec.level}` (HubScene.ts:1323)
  price: number;
  systemKey: string;           // renderer maps to accent colour via palette
  empty: boolean;
}

interface LoadoutViewModel {
  rows: LoadoutRowViewModel[];
  totalShipValue: number;      // 0 renders as "FREE"
}

// ── Galaxy map ─────────────────────────────────────────────────────────────

interface GalaxyMissionViewModel {
  id: string;
  x: number; y: number;        // logical position (from GALAXY_NODES, static per mission)
  label: string;                // name, or "???" if locked
  unlocked: boolean;
  isTutorial: boolean;          // drives node radius (6 vs 8) and amber-vs-cyan coloring
  isSelected: boolean;
  starsEarned: number;
  starsTotal: number;
  showStarCount: boolean;       // false for tutorials or missions with 0 stars
}

interface GalaxyConnectionViewModel {
  fromId: string;
  toId: string;
  bothUnlocked: boolean;        // drives line color/alpha
}

interface GalaxyMapViewModel {
  missions: GalaxyMissionViewModel[];
  connections: GalaxyConnectionViewModel[];
}

// ── Mission detail ─────────────────────────────────────────────────────────

interface MissionDetailViewModel {
  name: string;
  duration: string;             // "" if not in MISSION_DURATION table
  isTutorial: boolean;
  stars: Array<{ id: string; description: string; earned: boolean }>;  // [] for tutorials
  canStart: boolean;             // true whenever a mission is selected (all selectable missions are unlocked)
}

// ── Dispatch reinforcements (subscription-centric — NOT card-inventory-centric) ─────

interface SubscriptionRowViewModel {
  id: string;
  name: string;
  color: number;
  ownedLevel: number;            // 0 = not subscribed
  maxLevel: number;
  dots: string;                  // "●●○" precomputed — this is a display convenience,
                                 // acceptable because it's a deterministic function of
                                 // (ownedLevel, maxLevel), not a game decision
  statusText: string;            // "Lv2 / 3" or "not subscribed"
  isSelected: boolean;
}

interface SubLevelChipViewModel {
  level: number;
  label: string;                 // "Lv1"
  subLabel: string;              // "▶", "★10", "120⬤", "+80⬤", "FREE"
  state: 'current' | 'locked' | 'purchasable' | 'unaffordable';
  // multi-step: crossing from ownedLevel 0 to level 3 buys steps 0→1, 1→2, 2→3 in order
  mutation: { type: 'set-subscription-level'; subId: string; targetLevel: number } | null;
}

interface DispatchCardViewModel {
  cardId: string;
  name: string;
  description: string;
  kindLabel: string;             // "ACTIVE" / "PASSIVE"
  companyColor: number;
  levelRequired: number;
  accessible: boolean;
}

interface DispatchViewModel {
  subscriptions: SubscriptionRowViewModel[];
  selectedSubscriptionId: string | null;
  subLevelChips: SubLevelChipViewModel[];   // [] if no subscription selected
  tagline: string;                          // "" if not owned or none selected
  cards: DispatchCardViewModel[];           // current page only
  page: number;
  totalPages: number;
}

// ── Supplies ───────────────────────────────────────────────────────────────

interface SupplyRowViewModel {
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

interface SettingsViewModel {
  musicMuted: boolean;
  sfxMuted: boolean;
  devMode: boolean;              // drives dev-only button visibility + layout Y-offset
}

// ── Top-level Hub ──────────────────────────────────────────────────────────

type HubNav = 'missions' | 'shop' | 'dispatch-reinforcements' | 'settings' | null;
type ShopTab = 'loadout' | 'ship' | 'weapon' | 'rear-weapon' | 'shield' | 'generator' | 'motor' | 'supplies';

interface HubHeaderViewModel {
  starsEarned: number;
  starsTotal: number;
  coins: number;
}

interface HubShopViewModel {
  tab: ShopTab;
  kindRows: KindRowViewModel[];   // [] for 'loadout' and 'supplies' tabs
  levelChips: LevelChipViewModel[];
  detailHint: DetailHintViewModel;
  loadout: LoadoutViewModel;       // populated for 'loadout' tab
  supplies: SupplyRowViewModel[];  // populated for 'supplies' tab
}

interface HubViewModel {
  nav: HubNav;
  header: HubHeaderViewModel;      // null-equivalent omitted; renderer skips header when nav === null
  shop: HubShopViewModel;
  galaxyMap: GalaxyMapViewModel;
  missionDetail: MissionDetailViewModel | null;
  dispatch: DispatchViewModel;
  settings: SettingsViewModel;
}

// ── UI state (ephemeral, not persisted to SaveData) ─────────────────────────

// Tri-state per tab: undefined = apply default, null = NONE row, string = kind selected.
// Absent ≠ disabled — documented explicitly to avoid the common opt-out trap.
interface HubUIState {
  nav: HubNav;
  tab: ShopTab;
  selectedKindByTab: Partial<Record<ShopTab, string | null>>;
  selectedMissionId: string | null;
  selectedSubscriptionId: string | null;
  dispatchPage: number;
}
```

**Explicitly left as view-local state (not in `HubUIState`):** the settings panel's
two-tap reset-confirm boolean. It resets every `rebuildContent()` call by construction
(declared inside the build function) and is a pure interaction gesture with no
persisted or cross-render meaning — same category as CombatScene tweens.

### `src/viewmodel/combat.ts`

```typescript
interface BarViewModel {
  current: number;
  max: number;
  fraction: number;    // pre-computed: clamp(current/max, 0, 1)
  label: string;        // "15 / 30"
  color: number;
}

interface SupportMarkerViewModel {
  fraction: number;     // x-position along the mission-progress bar, 0–1
}

interface CombatHudViewModel {
  hull: BarViewModel;
  shield: BarViewModel;
  energy: BarViewModel;          // color switches to brownout-red below threshold
  missionOrBoss: BarViewModel & { mode: 'mission' | 'boss'; label: 'MISS' | 'BOSS' };
  supportMarkers: SupportMarkerViewModel[];   // [] when mode === 'boss'
  dpsLine: string;                // "DPS 20.0  K5"
  timeLine: string;               // "T 12.3s"
  damageRangeLine: string;        // "10.0–20.0" or "" when no weapon
  critLine: string;                // "CRIT 25%" or "" when no weapon
}

// Pure function — called every frame tick. Signature matches the real call site
// (CombatScene passes state, the current boss enemy or null, and mission progress).
export function computeCombatHudViewModel(
  state: CoreState,
  boss: EnemyState | null,
  progressFrac: number,
): CombatHudViewModel

// ── Supply buttons (in-combat boost buttons) ────────────────────────────────

interface SupplyButtonViewModel {
  slot: number;
  label: string;         // "Nano Repair  x2"
  empty: boolean;
}

interface SupplyButtonsViewModel {
  hasSupplies: boolean;   // false → renderer shows the "—" placeholder
  buttons: SupplyButtonViewModel[];
}

export function computeSupplyButtonsViewModel(state: CoreState): SupplyButtonsViewModel

// ── Card overlay (dispatch-reinforcements in-combat modal) ──────────────────

interface OfferCardViewModel {
  cardId: string;
  name: string;
  description: string;
  companyColor: number;
  companyChar: string;
  // no kindLabel — CardOverlay.ts renders no active/passive label on offer cards today;
  // unlike DispatchCardViewModel (hub), don't invent a field the UI doesn't show
}

interface CardOverlayViewModel {
  cards: OfferCardViewModel[];
  showReroll: boolean;
  rerollsLeft: number;
}

export function computeCardOverlayViewModel(offer: AbilityOffer, state: CoreState): CardOverlayViewModel
```

### `src/viewmodel/preview.ts`

The panel has two genuinely different halves: a **static** half (DPS label, motor
level/color parsed from the loadout id, prospective-vs-current resolution) and a
**live per-frame simulation** (`stepSim`, ShopPreviewPanel.ts:212–239) that hand-mirrors
the discrete energy-pulse mechanic from `src/core/energy.ts` — currently untested,
duplicated logic that can silently drift from the real mechanic it's supposed to
preview. Both become viewmodel-owned; only the bolt/flash/thruster-flicker animation
stays imperative.

```typescript
interface PreviewStaticViewModel {
  shipTextureId: string;
  motorLevel: 1 | 2 | 3;
  motorKindColor: number;
  dpsLabel: string;              // "DPS  12.3" or "NO WEAPON"
  weaponId: string | null;
  rearWeaponId: string | null;
}

// activeLoadout = prospective ?? current — resolved once, here, not in the scene
export function computePreviewStatic(current: LoadoutSnapshot, prospective: LoadoutSnapshot | null): PreviewStaticViewModel

// ── Pure simulation stepper — replaces the hand-rolled logic in ShopPreviewPanel ────

interface PreviewSimState {
  energy: number;
  shield: number;
}

interface PreviewSimStep {
  next: PreviewSimState;
  energyFraction: number;
  shieldFraction: number;
  energyLabel: string;           // "40 / 80"
  shieldLabel: string;           // "20 / 65"
  pulsedThisStep: boolean;       // true the tick a shield pulse fires — renderer can flash on this
}

export function initPreviewSim(stats: EffectiveStats): PreviewSimState   // shield starts at 50%, per existing behavior
export function stepPreviewSim(state: PreviewSimState, stats: EffectiveStats, dt: number): PreviewSimStep
```

`stepPreviewSim` is a pure function of `(state, stats, dt)` — directly unit-testable
against `src/core/energy.ts`'s pulse formula without touching Phaser, closing the
"untested mirror of a tested mechanic" gap.

### `src/viewmodel/result.ts`

```typescript
interface StarResultViewModel {
  id: string;
  shortName: string;             // e.g. "FINISH-TIME" — id.split('-').slice(1).join('-').toUpperCase()
  // 'earned' means earned THIS RUN (result.earnedStarIds), not ever-earned from
  // save.missionStars history — a star earned in a past run but missed this run is
  // 'unearned', matching ResultScene.ts:105-112 exactly. state = 'new' iff
  // newStarIds.includes(id); 'earned' iff earnedStarIds.includes(id) && !newStarIds.includes(id);
  // else 'unearned'.
  state: 'new' | 'earned' | 'unearned';
}

type ResultButtonSet =
  | { kind: 'w0-branch' }                          // TUTORIAL / EXPLORE, persists firstBranchChoice
  | { kind: 'standard' };                           // RETRY / MISSIONS / SHOP

interface ResultViewModel {
  status: 'victory' | 'defeat';
  missionName: string;
  durationLabel: string;         // "12.3s"
  coinsEarned: number;
  killsLine: string;              // "5/8   (2 collided)" — collided clause conditional
  hullPercentLine: string;        // "HULL   85%"
  isTutorial: boolean;
  stars: StarResultViewModel[];  // [] for tutorials — renderer shows "TRAINING MISSION / No stars awarded"
  buttons: ResultButtonSet;
}

// newStarIds is NOT derivable from `save` alone — it's the delta computed by
// applyMissionResult and must be passed through, exactly as ResultSceneData does today.
// `save` itself is a pass-through for devBorder/w0-branch persistence only — star
// states are derived entirely from `result` + `newStarIds`, never from `save.missionStars`.
export function computeResultViewModel(
  result: MissionResult,
  newStarIds: string[],
  save: SaveData,
): ResultViewModel
```

---

## Per-system config (`src/viewmodel/shopSystems.ts`)

Not in `items.ts` — configs depend on `SaveData` and icon key lookups (view-adjacent),
which would create layering violations if pulled into the data layer.

```typescript
interface ShopSystemConfig {
  systemKey: ShopTab;
  kinds: readonly string[];
  maxLevel: number;
  hasNoneOption: boolean;
  isDestructiveSwitch: boolean;    // true only for rear-weapon

  getEquippedId:     (save: SaveData) => string | null;
  itemId:            (kind: string, level: number) => string;
  kindDisplayName:   (kind: string) => string;
  itemPrice:         (kind: string, level: number) => number;
  itemStarsRequired: (kind: string, level: number) => number;
  ownedLevel:        (save: SaveData, kind: string) => number;
  iconKey:           (kind: string, level: number) => string;   // from textureKeys.ts, see below
  iconScale:         (displayLevel: number) => number;
  detailLines:       (kind: string, equippedLevel: number) => string[];
}
```

### Layering fix for icon keys

**Verified: `textures.ts:1` imports Phaser; `iconTextureForShieldKind` etc.
(textures.ts:149–210) are pure string-lookup functions with no Phaser dependency in
their bodies, but they live in a file that imports Phaser at module scope.** An
ESLint rule blocking the literal `'phaser'` import pattern does not catch
`import { iconTextureForShieldKind } from '../view/textures'` — that import is clean on
its face but pulls in the whole Phaser-importing module transitively.

**Fix:** extract these six functions (`iconTextureForRearWeaponId`,
`iconTextureForShipKind`, `iconTextureForShieldKind`, `iconTextureForGeneratorKind`,
`iconTextureForMotorKind`, `iconTextureForWeaponId`), the `TEXTURE_KEYS` constant they
depend on, **and `splitWeaponId` itself** (used by the rear-weapon and weapon
functions, textures.ts:129–134) into `src/view/textureKeys.ts`. This must be a physical
move, not a re-import — if `textureKeys.ts` imported `splitWeaponId` back from
`textures.ts`, the transitive-Phaser problem this fix exists to close would reopen.
`textures.ts`'s other pure consumers of `splitWeaponId` (e.g. `weaponKindColor`,
`laserTextureForWeaponId`) switch to importing it from `textureKeys.ts` instead.
`shopSystems.ts` imports only from `textureKeys.ts`.

---

## Shared cost function

Exported from `SaveManager.ts` (not a new file) — it's an economy invariant enforced by
SaveManager's mutations, and the viewmodel already legitimately imports `SaveData` and
read-only helpers (`isOwned`, `totalStars`) from `src/save/`. A separate
`src/viewmodel/switchCost.ts` would invert the dependency (save layer importing from
viewmodel is the wrong direction) for a 3-line function.

```typescript
// src/save/SaveManager.ts
/** cost = newPrice − currentPrice, UNLESS itemId is already owned, in which case 0 (Fix 6). */
export function switchCost(ownedItems: string[], itemId: string, itemPrice: number, currentPrice: number): number {
  if (ownedItems.includes(itemId)) return 0;
  return itemPrice - currentPrice;
}
```

Called by both the viewmodel (for badge labels) and `switchItem`/`switchShip`
internally (for the actual mutation) — one formula, one place, so a badge can never lie
about what a tap will do.

---

## `resolveUiState`

```typescript
export function resolveUiState(save: SaveData, raw: HubUIState): HubUIState
```

- `undefined` selection → default to equipped kind if any
- Nothing equipped + `hasNoneOption` (weapon, rear-weapon) → default to `null` (NONE row)
- Nothing equipped + no NONE option (shield*, generator, motor, ship) → default to first kind
- Existing `null` or string → kept as-is

\* shield currently *can* be unequipped and has a dedicated NONE row wired to
`unequipShield`, identical in shape to weapon/rear-weapon — **verified: HubScene.ts:858–863
calls `buildNoneRow` for shield**, not just `unequipShield`'s existence. Shield gets
`hasNoneOption: true`, grouped with weapon/rear-weapon, not generator/motor/ship.
Corrected from the previous draft, which grouped shield with the always-equipped
systems.

---

## Scene dispatch table (in HubScene, not viewmodel)

```typescript
const SWITCH_HANDLERS: Record<ShopTab, (save: SaveData, itemId: string) => SaveData> = {
  weapon:        (s, id) => switchItem(s, id),
  'rear-weapon': (s, id) => switchRearWeapon(s, id),
  shield:        (s, id) => switchItem(s, id),
  generator:     (s, id) => switchItem(s, id),
  motor:         (s, id) => switchItem(s, id),
  ship:          (s, id) => switchShip(s, id),
  loadout:       () => { throw new Error('loadout tab has no switch mutation'); },
  supplies:      () => { throw new Error('supplies tab has no switch mutation'); },
};
```

No six-way if-chain. Dispatch subscriptions and supplies have their own mutation types
(`set-subscription-level`, buy/sell charge) handled by separate small dispatch tables in
the same file — not shoehorned into `SWITCH_HANDLERS`.

---

## Migration order

1. **Fix SaveManager** — Fix 6 (owned re-equip is free, no mutation) applied to
   `switchItem`, `switchShip`, AND `switchRearWeapon` + Fix 1 (rear-weapon tap target)
   + extract `switchCost`. Tests for all of it. `pnpm test` clean. **Do not proceed
   past this step without the Fix 6 design decision confirmed** (see below) — it
   changes real player-facing economy behavior.

2. **Write `src/view/textureKeys.ts`** — extract the six icon-key functions +
   `TEXTURE_KEYS` from `textures.ts`. `textures.ts` re-imports from it. No behavior
   change; `pnpm test` / `pnpm build:dry` clean.

3. **Write `src/viewmodel/shopSystems.ts`** — `ShopSystemConfig` type and all six
   config objects, importing icon keys from `textureKeys.ts` only.

4. **Write `src/viewmodel/hub.ts`** — all types + `computeKindRows` + `resolveUiState`
   + `computeLevelChips` + `computeLoadoutRows` + `computeGalaxyMap` +
   `computeMissionDetail` + `computeDispatch` (including `computeCumulativeCost`) +
   `computeSettings` + `computeSupplies`. Zero Phaser. All hub tests written here,
   including the mutation-application integration tests (Fix 6 verification, see Test
   Plan).

5. **Write `src/viewmodel/combat.ts`** — `computeCombatHudViewModel(state, boss,
   progressFrac)` (correct 3-arg signature, verified against CombatHud.ts:85) +
   `computeSupplyButtonsViewModel` + `computeCardOverlayViewModel`. Tests written here.

6. **Write `src/viewmodel/preview.ts`** — `computePreviewStatic` + `initPreviewSim` +
   `stepPreviewSim`. Tests written here, including a cross-check against
   `src/core/energy.ts`'s pulse formula so the preview can never silently drift from
   the real mechanic again.

7. **Write `src/viewmodel/result.ts`** — `computeResultViewModel(result, newStarIds,
   save)`. Tests written here.

8. **Migrate selection state** (Fix 3 + Fix 4) — one commit: replace six
   `shopSelectedXxxKind` fields with `HubUIState`, update all six prospective
   functions, update `cheatNavShop`. Screenshot all 6 shop tabs.

9. **Add shared renderers to HubScene** — `renderKindRow`, `renderLevelChip`,
   `renderLoadoutRow`. Not yet called by anything.

10. **Migrate shop kind-row tabs one at a time** — for each tab: compute + render
    loop, delete `buildXxxKindRow`. Screenshot after each. Order: shield → generator →
    motor → ship → rear-weapon (Fix 1 already landed in step 1) → weapon (delete
    `bestAffordableLevelForKind` here, Fix 2).

11. **Migrate level chips** — replace `buildLevelChips` call sites with
    `computeLevelChips` + shared renderer loop.

12. **Migrate loadout, galaxy map, mission detail, supplies tabs.** Screenshot each.

13. **Migrate dispatch reinforcements** — this is its own step, not folded into 12,
    because of the cumulative-cost logic and pagination; higher risk of regression.
    Screenshot subscription rows, level chips at multiple owned levels, and both card
    grid pages.

14. **Migrate settings panel.** Screenshot both `devMode` on/off layouts.

15. **Migrate CombatHud, SupplyButtons, CardOverlay** — replace direct `CoreState`
    reads with the corresponding `compute*ViewModel` calls. Screenshot in a live
    mission with a boss present (to exercise the boss-mode bar) and with a card offer
    open.

16. **Migrate ShopPreviewPanel** — replace `stepSim`/static derivation with
    `stepPreviewSim` + `computePreviewStatic`. Screenshot with a non-default loadout.

17. **Migrate ResultScene** — replace with `computeResultViewModel`. Screenshot a
    victory, a defeat, a tutorial completion, and the w0 branch screen.

18. **Delete all dead code** — old `buildXxxKindRow`, old selection fields, old direct
    `CoreState`/`SaveData` reads in HUD/preview/result, `bestAffordableLevelForKind`.
    `pnpm lint` no unused warnings.

19. **Final CI pass** — `pnpm lint`, `pnpm build:dry`, `pnpm test`.

---

## ESLint enforcement

```js
// eslint.config.js
{
  files: ['src/viewmodel/**'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        { group: ['phaser', 'phaser3*'], message: 'viewmodel must not import Phaser' },
        { group: ['../view/*', '!../view/textureKeys'], message: 'viewmodel may only import src/view/textureKeys' },
      ],
    }],
  },
}
```

The second pattern is the one the previous draft was missing — it's what actually
catches the `textures.ts` transitive-Phaser problem, not the `'phaser'` literal alone.

---

## Complexity analysis

All compute functions: O(K × L) at most, K = kinds (≤6), L = levels (≤5), except
`computeDispatch`'s cumulative cost loop which is O(L_sub) per chip (L_sub = subscription
levels, ≤3) and the card grid which is O(C) where C = total cards across all levels of
the selected subscription (currently ≤15). All negligible, called once per
rebuild/frame-tick. No DB or HTTP calls anywhere.

---

## Design decisions requiring confirmation

- [x] **Fix 6 (owned re-equip is always free, no `ownedItems` mutation), applying to
      `switchItem`, `switchShip`, AND `switchRearWeapon`** — confirmed by user. A player
      relying on the old refund-by-cross-kind-tap behavior as an unintended "sell for
      refund" path loses that option; the fix matches the SaveData contract comment and
      the badge already shown to players.
- [x] Scope: all scenes (shop, HUD, preview, result, dispatch, settings, in-combat
      overlays) — confirmed; NarratorBar and CombatScene particle effects confirmed
      out of scope with reasons stated above.
- [x] Abstraction: semantic (decided states + final strings) — confirmed
- [x] `src/viewmodel/` as new top-level directory — confirmed
- [x] Fix 2: switching kind always buys Lv1, `bestAffordableLevelForKind` deleted — confirmed
- [x] `switchCost` exported from `SaveManager.ts`, not a separate viewmodel file — confirmed
- [x] All 5 visual unifications applied (row 3 kept as intentional per-system
      `iconScale`, not unified; row 5 corrected to "remove the redundant rear-weapon
      `canAfford` clamp", not "change the badge display", which was already correct) — confirmed
- [x] Shield gets `hasNoneOption: true` and a NONE row identical to weapon/rear-weapon
      — verified directly in code (HubScene.ts:858–863), not a decision to make
- [x] Test plan approved

---

## Test plan

### `switchCost`
- [x] Not owned, upgrade: `switchCost([], 'x-2', 200, 100)` → 100
- [x] Not owned, downgrade: `switchCost([], 'x-1', 100, 200)` → −100
- [x] Already owned: `switchCost(['x-2'], 'x-2', 200, 100)` → 0, regardless of prices

### `switchItem` / `switchShip` (Fix 6 — integration tests through real SaveManager)
- [x] Equip shield A Lv1, unequip, re-tap A: coins unchanged, `ownedItems` unchanged
- [x] Own wall-1 + reflex-2 (reflex-2 equipped), tap wall row: coins unchanged,
      `ownedItems` still contains both wall-1 and reflex-2 (bug B regression test)
- [x] Buy a genuinely new (unowned) cheaper item while a different owned item is
      equipped: refund applied, previously-equipped item removed from `ownedItems`
      (existing trade-in behavior preserved)
- [x] Buy a genuinely new (unowned) more expensive item: cost charged, previously
      equipped item stays in `ownedItems`

### `switchRearWeapon` (Fix 1 + Fix 6, extended)
- [x] Own grenade-3, unequip (NONE), re-tap grenade row: target level is 3, not 1;
      coins unchanged; `ownedItems` unchanged (fails against an untouched
      `switchRearWeapon` — this is a real regression test for the extended fix, not a
      restatement of Fix 1)
- [x] Switch to a different, unowned rear-weapon kind: all previously-owned rear
      weapons of other kinds are removed (destructive-switch model preserved)

### `resolveUiState`
- [x] Undefined selection → defaults to equipped kind
- [x] Shield, nothing equipped → defaults to `null` (NONE row) — shield now grouped
      with weapon/rear-weapon, not generator/motor/ship
- [x] Generator, nothing selected → defaults to first kind
- [x] Existing `null` or string → kept as-is

### `computeKindRows` — states
- [x] Equipped: `rowState: 'equipped'`, `badge: null`, `tap.mutation: null`
- [x] Tapping equipped kind still sets `tap.selectKind` (selection always fires)
- [x] Owned-not-equipped: `rowState: 'owned'`, `badge.kind: 'free'`,
      `tap.mutation` present and, when applied, produces zero coin change (Fix 6)
- [x] Purchasable: `badge.kind: 'cost'`, `badge.affordable: true`
- [x] Unaffordable: `badge.kind: 'cost'`, `badge.affordable: false`
- [x] Locked: `rowState: 'locked'`, `badge.kind: 'stars'`
- [x] Refund: `badge.kind: 'refund'`, correct `badge.label`
- [x] Free item + nothing equipped: `badge: null`
- [x] NONE row: `isNoneRow: true`, `kind: null`

### `computeKindRows` — tap targets
- [x] Not owned: `tap.mutation.itemId` ends with `-1` (always Lv1, all 6 systems)
- [x] Owned Lv2, not equipped: `tap.mutation.itemId` ends with `-2`

### Reachable-state matrix (corrected)

| State              | weapon | rear-weapon | shield | generator | motor | ship |
|--------------------|--------|-------------|--------|-----------|-------|------|
| equipped           | ✓      | ✓           | ✓      | ✓         | ✓     | ✓    |
| owned-not-equipped | ✓      | ✓ (via NONE, per switchRearWeapon(null) which keeps ownedItems) | ✓      | ✓         | ✓     | ✓    |
| purchasable        | ✓      | ✓           | ✓      | ✓         | ✓     | ✓    |
| unaffordable       | ✓      | ✓           | ✓      | ✓         | ✓     | ✓    |
| locked             | ✗ (min stars = 0) | ✗ (min stars = 0, all 5 kinds — items.ts:140–145) | ✓      | ✓         | ✓     | ✓    |
| NONE row           | ✓      | ✓           | ✓      | ✗         | ✗     | ✗    |

Two corrections from the previous draft: (1) rear-weapon owned-not-equipped was
marked ✗ — that cell is reachable via the NONE row and must be tested, because it's
exactly the state Fix 1 and the extended Fix 6 are fixing. (2) rear-weapon locked was
marked ✓ — verified `REAR_WEAPON_STARS` Lv1 is 0 for every kind and `buildRearWeaponRow`
hardcodes `locked: false` regardless (HubScene.ts:524, 539), so that state is
unreachable at the kind-row level today, same footnote as weapon. Level *chips* can
still lock at Lv3+ (10★) — that's `LevelChipViewModel.state`, a separate table, not
`KindRowState`.

### Cross-system consistency (golden values)
- [x] For each reachable (system, state): `badge.label` matches an exact expected string
- [x] All three systems with `hasNoneOption` (weapon, rear-weapon, shield) produce
      `kindRows[0].isNoneRow === true` — verified shield has a NONE row identical in
      shape to weapon/rear-weapon (HubScene.ts:858–863, `buildNoneRow` wired to
      `unequipShield`), not a special case
- [x] Ship `iconScale` is 0.6 for all levels; others follow `1.2 + (lv−1) × 0.07`

### `computeLoadoutRows`
- [x] All slots show `"Name LvN"` format (no space before digit)
- [x] `empty: true` for unequipped optional slots (weapon, rear-weapon, shield)
- [x] `totalShipValue` equals sum of all 6 row prices
- [x] `systemKey` present (not a color)

### `computeLevelChips`
- [x] Equipped chip: `state: 'equipped'`, `mutation: null`
- [x] Owned chip: `state: 'owned'`
- [x] Locked chip: `state: 'locked'`

### `computeDispatch` — cumulative cost (Fix 5)
- [x] Lv0 → Lv1: cost equals `sub.levels[0].price`
- [x] Lv0 → Lv3: cost equals sum of `levels[0..2].price`
- [x] Lv3 → Lv1: refund equals sum of `levels[1..2].price` (negated)
- [x] Lv2 → Lv2 (current): chip state `'current'`, no mutation
- [x] Chip locked when `starsRequired > totalStars`, even if affordable
- [x] Card `accessible` true iff `levelRequired <= ownedLevel`
- [x] Pagination: `totalPages` matches `Math.max(1, Math.ceil(cardCount / 10))`
      (HubScene.ts:744 floors at 1 page even with 0 cards); page clamps to `[1, totalPages]`

### `computeCombatHudViewModel`
- [x] All 3 non-mission bar fractions clamped to 0–1
- [x] `energy.color` switches to brownout color below `BROWNOUT_THRESHOLD`
- [x] `missionOrBoss.mode === 'boss'` and uses `boss.hp/boss.maxHp` when `boss !== null`
- [x] `missionOrBoss.mode === 'mission'` and uses `progressFrac` when `boss === null`
- [x] `supportMarkers` is `[]` when `boss !== null`
- [x] `dpsLine` is **never** `''` — it always renders `DPS 0.0  K<kills>` with no
      weapon (CombatHud.ts:173 is unconditional); only `damageRangeLine`/`critLine`
      blank out when `stats.weaponEquipped === false`

### `computeSupplyButtonsViewModel` / `computeCardOverlayViewModel`
- [x] `hasSupplies: false` when `state.supplies` is empty
- [x] Button `empty: true` when `chargesLeft <= 0`
- [x] `showReroll: false` when `rerollsLeft <= 0`
- [x] `cards` length matches `offer.abilityIds` length

### `computePreviewStatic` / `stepPreviewSim`
- [x] `activeLoadout = prospective ?? current` resolved once; matches whichever is non-null
- [x] `dpsLabel === 'NO WEAPON'` when `stats.weaponEquipped === false`
- [x] `stepPreviewSim` shield-pulse trigger matches `src/core/energy.ts`'s pulse
      formula for at least 3 representative stat sets (cross-check, not just a golden
      value against itself)
- [x] Sim loops (resets to 0/0) exactly when shield reaches capacity

### `computeResultViewModel`
- [x] `newStarIds` correctly marks `state: 'new'`; a star in `result.earnedStarIds` but
      not in `newStarIds` marks `'earned'`; a star in neither marks `'unearned'` — this
      is earned-THIS-RUN semantics (ResultScene.ts:105–112), never derived from
      `save.missionStars` history
- [x] `isTutorial: true` → `stars: []`
- [x] `coinsEarned` reflects `result.coins` directly (not recomputed)
- [x] `buttons.kind === 'w0-branch'` iff `result.missionId === 'w0' && status === 'victory'`
- [x] `killsLine` includes the collided clause iff `result.collisions > 0`

---

## File hygiene

**New files:**
- `src/viewmodel/hub.ts` + `hub.test.ts`
- `src/viewmodel/combat.ts` + `combat.test.ts`
- `src/viewmodel/preview.ts` + `preview.test.ts`
- `src/viewmodel/result.ts` + `result.test.ts`
- `src/viewmodel/shopSystems.ts`
- `src/view/textureKeys.ts`

**Modified files:**
- `src/save/SaveManager.ts` — Fix 6 applied to `switchItem`, `switchShip`, AND
  `switchRearWeapon` (owned-item early-return added to all three), `switchCost` export
- `src/view/textures.ts` — six icon functions + `TEXTURE_KEYS` moved out to
  `textureKeys.ts`, re-imported
- `src/view/HubScene.ts` — all `buildXxxKindRow`/`buildXxxRows` functions deleted, six
  selection fields → `HubUIState`, shared renderers added, `cheatNavShop` updated,
  `bestAffordableLevelForKind` deleted
- `src/view/CombatHud.ts` — reads `CombatHudViewModel` instead of computing bars/labels inline
- `src/view/SupplyButtons.ts` — reads `SupplyButtonsViewModel`
- `src/view/CardOverlay.ts` — reads `CardOverlayViewModel`
- `src/view/ShopPreviewPanel.ts` — reads `PreviewStaticViewModel` +
  `stepPreviewSim`/`initPreviewSim`; animation code (bolts, flashes, thruster flicker)
  untouched
- `src/view/ResultScene.ts` — reads `ResultViewModel`
- `eslint.config.js` — `no-restricted-imports` for `src/viewmodel/**` (both patterns)

**Not touched:** `src/core/`, `src/data/`, `CombatScene.ts` game loop (only its calls
into `CombatHud`/`SupplyButtons`/`CardOverlay` change shape, not the loop itself),
`BootScene.ts`, `NarratorBar.ts`

---

## Checklist

**Design decisions**
- [x] Fix 6 (owned re-equip always free, no `ownedItems` mutation — `switchItem`,
      `switchShip`, and `switchRearWeapon`) confirmed by user
- [x] Test plan approved

**Guardrails**
- [x] `tap.selectKind` always present — selection never silently dropped
- [x] `tap.mutation` is single source of truth for what is bought — never recomputed
      independently in the click handler (`onKindRowTap`/`onLevelChipTap` only ever
      dispatch `row.tap.mutation`/`chip.mutation`, never recompute cost)
- [x] `switchCost` called by both viewmodel (`computeKindRows`, `computeLevelChips`
      badges) and SaveManager (`switchItem`, `switchShip`) — no duplicate formula
- [x] No swallowed exceptions (`applyKindMutation`/`onLevelChipTap` throw on an
      unmapped tab rather than silently no-op)

**Performance**
- [x] All compute functions O(K × L) or better; dispatch cumulative-cost loop bounded
      by subscription level count (≤3)
- [x] No repeated save lookups inside loops
- [x] `computeCombatHudViewModel` is O(1) per frame tick

**Readability**
- [x] `rowState` exhausted via `Record<KindRowState, …>` lookup tables
      (`ROW_NAME_ALPHA`/`ROW_ICON_ALPHA`/`CHIP_SUB_COLOR`) — TypeScript enforces every
      state has an entry, the same exhaustiveness guarantee a `switch` would give
- [x] `badge.label` is final string — no per-tab formatting in renderer
- [x] `ShopSystemConfig` is single place to add a new system
- [x] Scene dispatch table (`SWITCH_HANDLERS`/`UNEQUIP_HANDLERS`) for kind-row
      mutations — no six-way if-chain; dispatch subscriptions (`onSubLevelChipTap`)
      and supplies (`buySupplyCharge`/`sellSupplyCharge`) use their own handling, not
      shoehorned into `SWITCH_HANDLERS`

**Testability**
- [x] `src/viewmodel/**` imports zero Phaser and zero `src/view/**` except
      `textureKeys.ts`/`palette.ts` (ESLint enforced — both patterns; sanity-tested by
      deliberately reintroducing a Phaser import and a blocked `src/view/*` import and
      confirming both are rejected)
- [x] Cross-system consistency uses golden `badge.label` values, not shape-only checks
- [x] Reachable-state matrix (corrected) drives tests — no fabricated impossible states
- [x] Fix 6 has integration tests that apply `tap.mutation` through real SaveManager
      functions and assert both coin delta AND `ownedItems` contents — not just badge
      label shape

**File hygiene**
- [x] No `shopSelectedXxxKind` fields remain
- [x] No `buildXxxKindRow` functions remain
- [x] `cheatNavShop` updated to write `HubUIState.tab`/`nav`
- [x] `bestAffordableLevelForKind` deleted
- [x] `TEXTURE_KEYS` and icon-key functions exist in exactly one place (`textureKeys.ts`)
      — `textureForShipId`, `motorLevelFromId`, `motorKindColorFromId`, and
      `splitWeaponId` were also consolidated there during implementation (discovered
      via the same transitive-Phaser trap the plan flagged for the icon functions)
- [x] No TODO/FIXME left without owner

**CI**
- [x] `pnpm build:dry` passes
- [x] `pnpm lint` passes (including both `no-restricted-imports` patterns — both
      sanity-checked by temporarily reintroducing a Phaser import and a `src/view/widgets`
      import into hub.ts and confirming ESLint rejects both)
- [x] `pnpm test` passes with no new failures (341 tests, 0 failures)
- [x] Screenshot for each of the 6 kind-row shop tabs
- [x] Screenshot for dispatch reinforcements: subscription list, sub level chip
      purchase (Lv0→Lv1→Lv2), both card grid pages
- [x] Screenshot for settings panel with `devMode` on and off
- [x] Screenshot for CombatHud during a live mission with a boss present (exercises
      boss-mode bar, verified via a paused-scene HUD injection) and without (exercises
      support-call markers)
- [x] Screenshot for the card-offer overlay with rerolls remaining and with 0 rerolls
- [x] Screenshot for ShopPreviewPanel with a non-default loadout, confirmed animating
      (ENRG advanced 3/50 → 6/50 over 2s)
- [x] Screenshot for ResultScene: victory, defeat, tutorial completion, w0 branch screen
- [x] ShopPreviewPanel shows correct prospective loadout after selection-state migration
      (confirmed end-to-end: tapping Ion Lance updated ship laser color, DPS 20→40,
      badges on other rows, and coin balance simultaneously)
- [x] Live 15s gameplay smoke test (t1 tutorial) — zero console errors, correct HUD
      values (HULL/SHLD/ENRG/MISS) throughout
