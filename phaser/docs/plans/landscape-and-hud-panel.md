# Landscape conversion + side HUD panel

## What this changes and why

The game is being rotated from 480×800 portrait to 800×480 landscape. The extra horizontal
space is used for a permanent 240px HUD panel on the right side of the play field, giving the
player a clear view of all ship systems and active card effects without cluttering the action.
The bottom NavBar in non-game scenes is kept (now 800px wide). The combat HUD strip at the
bottom of the play field is **removed** — everything moves into the side panel.

---

## Layout

### Game canvas
| Before | After |
|--------|-------|
| 480 × 800 (portrait) | 800 × 480 (landscape) |

### GameScene split
```
┌────────────────────────────┬──────────────┐
│                            │  SCORE       │
│                            │  ─────────   │
│       PLAY FIELD           │  HULL  ████  │
│        560 × 480           │  GEN   ████  │
│                            │  SHD   ████  │
│                            │  ─────────   │
│                            │  ACTIVE CARDS│
│                            │  • Rapid Fire│
│                            │  • Regen+    │
│          ┌──┐              │  ─────────   │
│          │ ▲│ (player)     │  [L] [R]     │
│          └──┘              │  side wpns   │
└────────────────────────────┴──────────────┘
  560 px wide                  240 px wide
```

### Non-game scenes
Full 800×480 canvas. NavBar is a bottom strip spanning 800px.

### HUD panel constants (`src/hud/CombatHUD.ts`)
```typescript
const HUD_W       = 240;   // right panel width
const PLAY_W      = 560;   // play field width (800 - HUD_W)
const DIVIDER_X   = 560;   // panel left edge
```

---

## Mechanical adjustments

| Constant | Portrait value | Landscape value | Reason |
|----------|---------------|-----------------|--------|
| Player spawn Y | ~640 | ~400 | Shorter vertical play area |
| Player spawn X | 240 (centre) | 280 (centre of play field) | |
| Enemy spawn X range | 40..440 | 40..520 | Wider play field |
| Star enemy speed | 220 px/s | 160 px/s | Enemies cross 480px in 3s vs 740px in 3.4s — keep similar time |
| Circle enemy targetY | 90..160 | 90..160 | Unchanged |
| Boss position | (240, 80) | (280, 80) | Centre of play field |
| AutoDodge clamp | ±120 px from centre | ±120 px from centre | Unchanged (dodge is relative) |
| Asteroid spawn X | full width | 0..560 (play field only) | Don't spawn in HUD column |

---

## File-by-file changes

### `src/main.ts`
- `width: 480 → 800`
- `height: 800 → 480`

### `src/ui/NavBar.ts`
- Recalculate tab X positions for 800px wide bar
- Tab width spreads to 200px each (4 tabs × 200px = 800px)

### `src/scenes/GameScene.ts`
- Player spawn: `(PLAY_W / 2, H - 80)` → `(280, 400)`
- Enemy X spawn: `Phaser.Math.Between(40, PLAY_W - 40)`
- Enemy speeds: define `BASE_STAR_SPEED = 160`, `BASE_CIRCLE_SPEED = 120`
- Clamp player X: `0..PLAY_W` instead of `0..W`
- Pass `PLAY_W` to `CombatHUD`, `ShieldVisual`, `EnemyHpBars`
- Remove the bottom CombatHUD strip → replaced by side panel
- `playerShipFx` position unchanged (still follows player sprite)

### `src/hud/CombatHUD.ts`
- Full rewrite as vertical side panel (240px wide)
- Sections: score/XP, status bars (HP/GEN/SHD), active cards list, side weapon buttons
- Active cards: new `showCard(label)` / `hideCard(label)` API called from GameScene on card pick

### `src/hud/ShieldVisual.ts`
- No change (follows player, clamped to play field)

### `src/hud/EnemyHpBars.ts`
- No change (drawn in play field coordinates)

### `src/scenes/MenuScene.ts`
- Mostly %-based, minor Y adjustments for 480px height
- Asteroid configs use fractional positions, no hardcoded values

### `src/scenes/MissionSelectScene.ts`
- Card width: ~740px (full usable width)
- LIST_Y: adjusted for 480px height (shorter scroll area)

### `src/scenes/ShopScene.ts`
- CARD_W: 444 → 700
- Cards may need to be 80px tall instead of 100px (height now only 420px usable)

### `src/scenes/TalentScene.ts`
- Tab headers: recalculate for 800px width
- Node grid: more horizontal space; can spread columns wider

### `src/scenes/ResultScene.ts`
- Layout uses W/H from scale; minor Y% adjustments

### `src/scenes/WelcomeScene.ts`
- Layout uses W/H from scale; minor Y% adjustments

### `src/ui/ShipPreviewPanel.ts`
- PANEL_H: 220 → 180 (shorter screen, less vertical space)
- SHIP_CX, SHIP_CY: unchanged (ship still in left 220px of panel)
- STATS_X: 230 → 220 (panel is now wider so stats can breathe)

### `src/ui/SideWeaponButton.ts`
- Move from bottom-centre to inside CombatHUD side panel
- Remove `x / y` constructor params; panel handles positioning

### `CLAUDE.md`
- Update canvas dimensions in the layout table

---

## CombatHUD side panel design

```
y=0    ┌─ SCORE ──────────────┐
y=30   │  12,400              │
y=50   │  XP ▓▓▓▓▓▓░░░░ L4   │
y=70   ├──────────────────────┤
y=90   │  HULL ████████░░  80 │
y=110  │  GEN  ██████░░░░  60 │
y=130  │  SHD  ███░░░░░░░  30 │
y=150  ├──────────────────────┤
y=170  │ ACTIVE CARDS         │
y=190  │ • Rapid Fire         │
y=210  │ • Regen Boost        │
y=230  │ • (empty slot)       │
y=280  ├──────────────────────┤
y=300  │  [SPREAD]  [BEAM]    │
y=360  │  (side weapon btns)  │
y=420  └──────────────────────┘
```

Active cards list: shows last 3 picked cards with their effect name.
Cleared on mission start. Added to by `onCardPicked()` in GameScene.

---

## Test plan

- [ ] Canvas is 800×480 in all scenes — no letterboxing on standard 16:9 viewport
- [ ] NavBar 4 tabs equally spaced at 200px each across 800px
- [ ] MenuScene: title, PLAY, star count all readable at 480px height
- [ ] ShopScene: cards fill 700px width; preview panel slides up correctly
- [ ] TalentScene: nodes render without clipping
- [ ] MissionSelectScene: cards readable at new dimensions
- [ ] GameScene: player spawns at (280, 400); enemies spawn across full 560px play field
- [ ] Star enemies cross the play field in ~3s (speed 160 px/s, distance ~480px)
- [ ] CombatHUD side panel shows HP/GEN/SHD bars in real time
- [ ] Active cards list updates on each card pick
- [ ] Side weapon buttons work inside the side panel
- [ ] Shield visual follows player within play field (0..560)
- [ ] Enemy HP bars appear only in play field (not over HUD)
- [ ] Auto-dodge clamps player within play field bounds
- [ ] All 71 tests still pass (computeStats, EnergyManager, ShieldSystem are pure logic)

---

## Checklist

**Design decisions**
- [x] Vertical shooter, enemies from top
- [x] 560px play field + 240px HUD panel
- [x] Enemy speed reduced to 160px/s (star) to keep ~3s crossing time
- [x] No NavBar inside GameScene — navigation only in non-game scenes

**Guardrails**
- [ ] Every scene uses `this.scale.width` / `this.scale.height`, not hardcoded 480/800
- [ ] Play field clamp applied to player X (0..PLAY_W) and enemy spawns
- [ ] Asteroid spawns clamped to play field X (0..PLAY_W)

**Performance**
- [ ] CombatHUD redraws bars only when values change (delta check)
- [ ] Active card list is text-only (no per-frame redraw)

**Readability**
- [ ] `HUD_W = 240` and `PLAY_W = 560` named constants, used everywhere
- [ ] CombatHUD side panel under 100 lines

**CI**
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes with no new failures
