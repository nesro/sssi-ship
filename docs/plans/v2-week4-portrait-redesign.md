# v2 Week 4 — Portrait layout, left panel, starfield, animated ship, tab menu

## What this changes and why

The current landscape layout (960×540) was a scaffold convenience, but the target device
is a portrait phone and the game feel — enemies approaching the ship, the ship shooting
"forward" — reads much better as a vertical shooter. This change rotates the canvas to
540×960 (portrait), splits the screen into a 150-logical-px left control panel (HUD stats
+ supply tap buttons) and a 390×960 right game field where the ship sits at the bottom and
enemies scroll in from the top. The MenuScene gets a tab bar (MISSIONS / SHOP) so both
panels live in one screen without a scene-switch flash. A scrolling starfield and an
animated ship sprite (upward-pointing body + additive-blend thruster flame) are added for
visual polish. The deterministic core is untouched — this is entirely a view-layer change.

## Design decisions requiring confirmation

| # | Decision | Proposal |
|---|---|---|
| 1 | **Portrait canvas** | `LOGICAL_WIDTH = 540`, `LOGICAL_HEIGHT = 960`. `SCREEN_*` and `px()` derive automatically. |
| 2 | **Left panel width** | 150 logical px. Leaves 390 px for the game field. |
| 3 | **HUD layout in panel** | 5 stat rows (HULL/SHLD/ENRG/WEAP/MOTR) in the left panel as compact ~15px text, stacked from y=60. |
| 4 | **Supply buttons in panel** | Below HUD rows, stacked vertically, full panel width (130 px × 44 px each). Max 3 buttons. |
| 5 | **Ship position** | Bottom-center of game field: x = 150+195 = 345, y = 880 logical. |
| 6 | **Enemy lane-to-Y mapping** | `laneToY(d) = SHIP_Y - (d / LANE_LENGTH) * (SHIP_Y - GAME_TOP)`. Core distance axis unchanged. |
| 7 | **Starfield** | ~80 white dot sprites at seeded random positions; slow downward tween loop (parallax feel). Static dots (no particles) to keep Android GPU cost zero. |
| 8 | **Ship sprite** | Upward-pointing equilateral triangle body + small wing stubs. Additive blend. A looping tween pulses scale 0.96↔1.04 (thruster heartbeat). Thruster flame: small Phaser particle emitter below the ship, ~12 particles/sec, downward, short lifespan (200 ms), amber color, ADD blend. |
| 9 | **Tab menu** | MenuScene gains a MISSIONS / SHOP tab bar at the top. Clicking SHOP navigates to ShopScene (existing, unchanged). Both scenes show the same tab bar with the active tab highlighted. A shared `TabBar` widget handles this. No full merge needed — ShopScene is already complete and well-tested. |
| 10 | **NarratorBar** | Full width at very bottom (y = LOGICAL_HEIGHT - 42), height 42, spans both panel and game area. Unchanged logic. |
| 11 | **CardOverlay** | Already uses `SCREEN_WIDTH/2` centering — works in portrait without changes. Cards may need to be laid out vertically (portrait stack) rather than horizontal — 3 cards × 220 px width fits `540 px` only if reduced to ~150 px each. Decision: reduce card width to 150 px, stack them horizontally (they still fit at 150×3 + 2×15 gap = 480 px ≤ 540 px). |

## Complexity analysis

All changes are O(1) per frame or O(S) where S ≤ 80 static star sprites. The core tick loop is untouched. No new loops over missions, enemies, or devices.

## Test plan

The core unit tests are unchanged (distance-based conveyor, energy, cards — all orientation-agnostic). New view smoke test expectations:

- [ ] `LOGICAL_WIDTH === 540`, `LOGICAL_HEIGHT === 960` after layout change
- [ ] `px(150)` returns `150 * DPR` (layout.ts sanity)
- [ ] No existing core test broken by layout constant change (core does not import layout)
- [ ] Ship renders at x=345, y=880 in CombatScene (manual browser check)
- [ ] Enemy at distance=100 renders near game top; distance=0 near ship (manual browser check)
- [ ] NarratorBar appears at bottom of portrait screen (manual browser check)
- [ ] MISSIONS tab and SHOP tab switch correctly (manual browser check)
- [ ] Card overlay fits within 540 px width (manual browser check)

## File hygiene

No hardcoded paths or credentials in any file to be touched. One item to fix: `SupplyButtons.ts` currently uses `SCREEN_WIDTH` and `SCREEN_HEIGHT` for positioning — these will be replaced with panel-relative logical constants. Same for `CardOverlay.ts`.

## Files to change

| File | Change |
|---|---|
| `src/view/layout.ts` | Swap to 540×960, add `PANEL_WIDTH`, `GAME_X`, `GAME_WIDTH` constants |
| `src/view/textures.ts` | Ship texture: upward triangle + wings; enemy textures resized |
| `src/view/CombatScene.ts` | Portrait layout constants; `laneToY()`; starfield; thruster emitter |
| `src/view/CombatHud.ts` | Reposition to left panel |
| `src/view/SupplyButtons.ts` | Move to left panel, vertical stack, remove SCREEN_* imports |
| `src/view/NarratorBar.ts` | Y position uses LOGICAL_HEIGHT (already correct after swap) |
| `src/view/CardOverlay.ts` | Reduce card width to 150 px, verify centering |
| `src/view/MenuScene.ts` | Tab bar (MISSIONS / SHOP), tab-aware layout |
| `src/view/ShopScene.ts` | Add same tab bar, highlight SHOP tab |
| `src/view/widgets.ts` | Add `addTabBar()` helper |

## Checklist

**Design decisions**
- [ ] Design decisions confirmed by user
- [ ] Test plan approved by user

**Guardrails**
- [ ] No opt-out guards affected (view-only change)
- [ ] No swallowed exceptions

**Performance**
- [ ] Starfield: O(S) one-time create, O(1) per frame tween — negligible
- [ ] Thruster particles: ~12/sec, short-lived, ADD blend — safe on Android (v1 lesson: baked glow + ADD is fine, PostFX is not)
- [ ] No new loops over core data

**Readability**
- [ ] `PANEL_WIDTH`, `GAME_X`, `GAME_WIDTH` as named constants — no magic numbers
- [ ] `laneToY()` mirrors existing `laneToX()` naming convention

**Testability**
- [ ] Core tests unaffected (zero layout imports in core)
- [ ] View changes verified in browser (portrait, Android WebView)

**File hygiene**
- [ ] No `SCREEN_WIDTH`/`SCREEN_HEIGHT` in scene files after change (replaced with logical constants)
- [ ] No TODO/FIXME left without owner

**CI**
- [ ] `pnpm build:dry` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes with no new failures (core tests unchanged)
