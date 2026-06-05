# Plan: Bottom HUD Panel

## What this changes and why

The current HP / shield / energy display is three tiny 104×12 bars stacked in the
bottom-right corner, labelled with two-letter abbreviations. This is hard to read at
a glance and gives no numeric feedback. This plan replaces those bars with a full-width
72 px strip at the very bottom of the game canvas. Each of the three resources gets
a labelled, colour-coded bar and a `current / max` counter rendered next to it.
The panel overlays the game area (no canvas shrink), so it matches how mobile games
commonly handle HUDs. Side-weapon buttons are moved 80 px higher so they sit
above the panel rather than behind it.

---

## Design decisions requiring confirmation

| # | Decision | Chosen |
|---|----------|--------|
| 1 | Generator info displayed | Current / max energy only (e.g. `62/100`) |
| 2 | Panel position | Bottom strip overlay (H-72 → H) |
| 3 | Side-weapon buttons | Moved to `btnY = H - 72 - 44` (centred above panel) |
| 4 | Canvas size | Unchanged (480 × 800) |
| 5 | Existing top-right bars | Removed entirely; `barTopY()` helper deleted |

---

## Layout spec (480 × 800 canvas)

```
y = H-72 ──────────────────────────── panel top (dark bg, alpha 0.85)
y = H-55  ♥ HP   [████████░░] 80/100
y = H-37  ⚡ GEN  [██████████] 62/100
y = H-19  🛡 SHD  [███░░░░░░░] 30/50
y = H     ─────────────────────────── bottom of canvas
```

Each row:
- Label icon + tag: 36 px wide (left edge x=8)
- Bar: x=46 to x=360 (314 px wide, 12 px tall, vertically centred on row)
- Value text: right-aligned at x=472 (10 px monospace)

Colour coding:
- HP bar: green → yellow → red based on ratio (>50% / 25–50% / <25%)
- Energy bar: `0x0077ff`
- Shield bar: `0x00cccc` (grey background when shield is down / broken)

---

## Complexity analysis

- `updateHUD()` is called every frame. The new version draws 3 bars + 3 text updates.
  All operations are O(1); no loops over external data.
- `buildHUD()` is called once at scene create. Also O(1).

---

## Files touched

| File | Change |
|------|--------|
| `src/scenes/GameScene.ts` | Remove `barTopY()`, rewrite `buildHUD()` + `updateHUD()`, move `btnY` in `buildSideButtons()` |

No new files. No type changes.

---

## Test plan

- [ ] HP bar fills correctly (buy no shield, take direct hit — hull turns yellow/red)
- [ ] Energy bar drains visibly when front weapon fires, refills between shots
- [ ] Shield bar drains when hit (with shield equipped), disappears/grey when unequipped
- [ ] Numeric values update every frame (`62/100` counts up/down live)
- [ ] Side-weapon buttons (if equipped) sit above the panel and are tappable
- [ ] No overlap between panel text and game objects at the bottom of the play field
- [ ] `typecheck` passes

---

## File hygiene

No hardcoded paths or credentials in `GameScene.ts`. One TODO in this plan will be
removed once HP max stat moves to `ComputedStats` (currently hardcoded as `hullMaxHp`).

---

## Checklist

**Design decisions**
- [ ] Design decisions confirmed by user
- [ ] Test plan approved by user

**Guardrails**
- [ ] No swallowed exceptions; bars clamp via `Math.max(0, ratio)` already

**Performance**
- [ ] All operations in `updateHUD()` are O(1)

**Readability**
- [ ] `barTopY()` helper removed (was 3 branches — replaced by inline constants)
- [ ] Panel constants (`PANEL_H`, `PANEL_Y`, etc.) extracted as named module-level consts

**Testability**
- [ ] Manual test checklist above covers happy path + edge cases (broken shield, full energy)

**File hygiene**
- [ ] No new hardcoded magic numbers — all sizes are named constants

**CI**
- [ ] `pnpm typecheck` passes
