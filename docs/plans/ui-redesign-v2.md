# UI Redesign v2 — HubScene + Combat Panels

## What this changes and why

Full visual redesign across all non-core scenes. MenuScene + ShopScene merge into a
single `HubScene` with a persistent right-side ship preview so the player always sees
their ship. Combat gets left + right flanking panels with vertical bars, freeing the
full 780×540 area for the game field. Navigation is unified: 5 top-level items in a
compact header, back button in the top-left corner. A dev-mode setting unlocks screen
border + debug missions.

---

## Layout constants (layout.ts additions)

```
LOGICAL_WIDTH  = 960   LOGICAL_HEIGHT = 540

// Hub (menu + shop)
HUB_LEFT_W     = 480   // left content panel
HUB_RIGHT_W    = 480   // right ship preview

// Combat
LEFT_PANEL_W   = 90    // vertical bars: HULL / SHLD / ENRG
RIGHT_PANEL_W  = 90    // supplies + debug text
GAME_X         = 90    // replaces current 150
GAME_WIDTH     = 780   // replaces current 810
```

All consumers of `PANEL_WIDTH` / `GAME_X` / `GAME_WIDTH` must be updated to use the
new constants. Changing `LEFT_PANEL_W` / `RIGHT_PANEL_W` should require no layout
arithmetic changes elsewhere — callers use the constants.

---

## Design decisions confirmed

- **Merge MenuScene + ShopScene → HubScene**: yes
- **5 top-level nav items**: MISSIONS, SHOP, SETTINGS, ABOUT, MANUAL
- **Back button**: top-left corner ~36×36px tap target, hidden on MISSIONS root
- **Handedness toggle**: swaps left/right in combat (bars ↔ supplies) and optionally in hub
- **Mission detail**: inline expansion within the left panel, no bottom sheet
- **Big "NESRO NOVA" title**: removed
- **Duration labels on mission rows**: ~30s / ~2min / ~5min / ~15min (see missions table below)
- **Dev mode**: 1px white border + debug missions, off by default, not shipped
- **Right half (hub)**: always ShopPreviewPanel (ship + energy/shield bars + DPS), updates on equipment change
- **Shop categories in hub**: vertical strip ~80px on left edge of left half; item list ~400px right of it
- **Combat panels**: 90px each; left = vertical bars; right = supplies + DPS/kills debug

---

## Mission duration labels

| id  | name            | duration |
|-----|-----------------|----------|
| t1  | Shield Basics   | ~30s     |
| t2  | Weapon Systems  | ~1min    |
| t3  | Support Cards   | ~1min    |
| t4  | Battle Supplies | ~2min    |
| m1  | First Contact   | ~5min    |
| m2  | Picket Line     | ~5min    |
| m3  | The Wall        | ~8min    |
| m4  | Blockade        | ~8min    |
| m5  | Asteroid Run    | ~12min   |
| m6  | Leviathan       | ~15min   |

These are estimates; update after sim calibration.

---

## Phase 1 — Combat panels + vertical bars

**Files**: `layout.ts`, `CombatScene.ts`, `CombatHud.ts`, `SupplyButtons.ts`, `NarratorBar.ts`

### Changes
1. **layout.ts**: add `LEFT_PANEL_W = 90`, `RIGHT_PANEL_W = 90`; update `GAME_X = LEFT_PANEL_W`, `GAME_WIDTH = LOGICAL_WIDTH - LEFT_PANEL_W - RIGHT_PANEL_W`
2. **CombatHud** (new `VerticalBars`): replace 5 text rows with 3 tall vertical bars drawn via Graphics
   - Each bar: full panel height minus top/bottom margin (~480px tall, ~20px wide)
   - 3 bars centred in 90px: at x=15, x=45, x=75 (logical)
   - Fill bottom→top, colour per system (hullWhite / shieldBlue / generatorAmber)
   - Small label (4 chars) and numeric value beneath each bar
3. **SupplyButtons**: move to right panel — centre x = `LOGICAL_WIDTH - RIGHT_PANEL_W/2`; shrink buttons to fit 90px width (use ~70×46 with 10px side padding)
4. **CombatScene**: add right panel divider line at `LOGICAL_WIDTH - RIGHT_PANEL_W`; move DPS + kills + time to small text at bottom of right panel (y ≈ 480–520)
5. **NarratorBar**: ensure it spans only the game field (x = GAME_X, width = GAME_WIDTH)
6. **Dev border**: if `devMode` setting is on, draw a 1px white rectangle around the full canvas in CombatScene (and HubScene later)

### Panel swap (handedness)
- Add `panelSwapped: boolean` to `SaveData`
- `COMBAT_LEFT_X = panelSwapped ? LOGICAL_WIDTH - LEFT_PANEL_W : 0`
- `COMBAT_RIGHT_X = panelSwapped ? 0 : LOGICAL_WIDTH - RIGHT_PANEL_W`
- Pass swap flag into CombatHud + SupplyButtons constructors

---

## Phase 2 — HubScene (replaces MenuScene + ShopScene)

**Files**: delete `MenuScene.ts`, delete `ShopScene.ts`; add `HubScene.ts`; update `main.ts`

### Left half structure (480px)
```
[back ‹]  [MISSIONS] [SHOP] [SETTINGS] [ABOUT] [MANUAL]   ← nav row ~36px
─────────────────────────────────────────────────────────
content area 480×504px (switches per nav item)
```

**MISSIONS content**:
- Compact header row: `★ N/27  ⬤ NNNNN` (no big title)
- Mission rows ~50px each: `Name  duration  ★ earned/total  [need N★]`
- Locked rows dimmed
- Clicking unlocked row: expands inline detail block (stars list, hint toggle, START button)
  clicking same row or back collapses it
- Tutorial / combat divider label retained

**SHOP content**:
```
[WEAPONS ]  item list rows (name, price, equipped state)
[SHIELDS ]  ────────────────────────────────────────────
[GEN     ]  [BUY / EQUIP / SELL]  action strip at bottom
[MOTORS  ]
[SUPPLIES]
← 80px →  ←────────── ~400px ─────────────────────────→
```

**SETTINGS content**:
- MUSIC ON/OFF
- SFX ON/OFF
- HANDEDNESS  LEFT / RIGHT
- DEV MODE  OFF / ON  ← unlocks border + debug missions

**ABOUT / MANUAL**: plain text, same content as today

### Right half structure (480px)
- `ShopPreviewPanel` reused as-is, placed at x=480, full height
- Panel updates automatically when equipment changes (shop already does this)
- On MISSIONS/SETTINGS/ABOUT/MANUAL views: panel shows current loadout read-only (no interaction)
- On SHOP view: panel is interactive (shows selected item delta, same as today)

### Back button
- `addTextButton` at `(px(12), px(18))`, label `‹`, depth 30
- Visible only when active nav ≠ 'missions'
- onClick: set nav to 'missions', rebuild left content

### Nav item active state
- Active item: full alpha, underline rectangle
- Inactive: 0.45 alpha

---

## Phase 3 — Dev mode + handedness + debug missions

**Files**: `SaveManager.ts`, `missions.ts`, `HubScene.ts`, any scene with a border

1. **SaveData** additions:
   ```ts
   devMode: boolean;       // default false
   panelSwapped: boolean;  // default false
   ```
2. **Dev border**: `if (save.devMode)` draw `strokeRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT)` in white, depth 99, in every scene's `create()`
3. **Debug mission** (`missions.ts`): one entry with `id: 'debug-all'`, spawns one of every enemy kind in sequence, gated behind `devMode` check in HubScene when building the mission list
4. **Handedness** wiring in CombatScene (phase 1 adds the logic; phase 3 ensures it reads from `save.panelSwapped`)

---

## Complexity

- **HubScene content switch**: O(1) — destroy + recreate left-panel objects on nav change
- **ShopPreviewPanel reuse**: no change — already animates on `update(deltaMs)`
- **Vertical bars**: O(1) per frame — 3 `fillRect` calls in Graphics
- **Mission row inline expand**: O(1) — add/remove a fixed set of objects below the clicked row (shifts rows below it down by ~120px)

No loops over external data. No DB/HTTP calls.

---

## File hygiene

- `MenuScene.ts` → deleted (replaced by HubScene)
- `ShopScene.ts` → deleted (replaced by HubScene)
- `main.ts` → swap `MenuScene, ShopScene` for `HubScene` in scene list
- All `PANEL_WIDTH` usages replaced with `LEFT_PANEL_W` / `RIGHT_PANEL_W`

---

## Test plan

- [ ] Combat: 3 vertical bars render, fill correctly for hull/shield/energy
- [ ] Combat: supply buttons appear in right panel, tappable
- [ ] Combat: game field is 780px wide, ship centred in it
- [ ] Combat: handedness swap mirrors panels correctly
- [ ] Hub: MISSIONS view shows all 10 rows, duration labels present
- [ ] Hub: clicking unlocked row expands detail, clicking again collapses
- [ ] Hub: backdrop / escape collapses open detail
- [ ] Hub: START MISSION transitions to CombatScene correctly
- [ ] Hub: SHOP view shows vertical category tabs + item list + action strip
- [ ] Hub: equipping item updates right-side preview immediately
- [ ] Hub: back button hidden on MISSIONS, visible on other nav items
- [ ] Hub: back button returns to MISSIONS from any nav item
- [ ] Settings: MUSIC/SFX toggles persist
- [ ] Settings: DEV MODE shows screen border, adds debug mission row
- [ ] Settings: HANDEDNESS toggle persists and affects combat panel sides
- [ ] Dev border: 1px white visible in dev mode, absent in production
- [ ] Debug mission: spawns one of each enemy kind, only visible in dev mode
- [ ] pnpm lint passes
- [ ] pnpm build:dry passes

---

## Checklist

**Design decisions**
- [x] Design decisions confirmed by user
- [ ] Test plan approved by user

**Guardrails**
- [ ] Every opt-out guard uses `=== false`, not `!value`
- [ ] No swallowed exceptions
- [ ] Blast-radius: HubScene replaces 2 scenes — if it crashes on create(), player sees black screen; mitigated by keeping ResultScene/CombatScene separate

**Performance**
- [ ] Vertical bars: O(1) Graphics calls per frame ✓
- [ ] HubScene content switch: O(objects destroyed + created), bounded constant ✓

**Readability**
- [ ] Layout constants named and centralised in layout.ts
- [ ] Panel swap logic in one place, passed into constructors

**Testability**
- [ ] Each phase independently testable in the browser
- [ ] Dev mode gated behind a save flag, not a build flag

**CI**
- [ ] pnpm build:dry passes
- [ ] pnpm lint passes
- [ ] pnpm test passes
