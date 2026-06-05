# Plan: Shop Item Preview

## What this changes and why

The ShopScene currently shows only text descriptions. The player has no visual sense of
what a weapon looks or feels like before buying it. This plan adds a live animated
preview panel that appears at the bottom of the ShopScene when the player taps any item
card. The panel draws the item's visual representation using Phaser Graphics (no shared
texture cache needed — shapes are drawn inline) and animates projectiles to match what
the weapon looks like in gameplay. Generator and shield previews show bar animations
instead of projectiles.

---

## Design decisions requiring confirmation

| # | Decision | Chosen |
|---|----------|--------|
| 1 | Trigger | Tapping anywhere on an item card toggles the preview for that item |
| 2 | Preview location | Bottom drawer — a 200 px panel that slides up over the NavBar area |
| 3 | Canvas size | Full card width (444 px), 180 px tall inside the drawer |
| 4 | Weapon preview | Animated projectile(s) rising from a small ship silhouette |
| 5 | Generator preview | Energy bar draining and refilling loop (6 s cycle) |
| 6 | Shield preview | Shield arc, hit flash, regen fill loop |
| 7 | Close | Tapping the active card again, or tapping elsewhere, collapses the drawer |
| 8 | Stat diff | Shows current equipped stats → new stats as coloured delta text |
| 9 | Scene restart | Preview state is reset on `scene.restart()` (after buy/sell/equip) — acceptable |

---

## Preview content per item

| Item | Visual |
|------|--------|
| laser_mk1 | Cyan zigzag bolt (6×26) rising; fire rate matches `frontFireMs` stat |
| spread_shot | 5 orange circles fanning upward at −40°/−20°/0°/20°/40° |
| heavy_beam | Thick white + blue rect (8×24) rising fast |
| generator_mk1 | Blue bar draining left→right to 20%, then filling back over 3 s |
| shield_mk1 | Cyan arc, flash white on "hit", dims then fills back |

---

## Layout of preview drawer

```
┌──────────────────────────────────────────────────┐  ← y = H - NavBar.HEIGHT - 200
│  [item name]             [stat delta]            │
│                                                  │
│          ▲  ▲  (animated projectiles)            │
│           △   (mini ship silhouette)             │
│                                                  │
│  DMG  +2  │  FIRE  −50ms  │  COST  +1           │
└──────────────────────────────────────────────────┘  ← y = H - NavBar.HEIGHT
```

---

## Implementation approach

`ItemPreviewPanel` — a class (~90 lines) inside `ShopScene.ts`:

```typescript
class ItemPreviewPanel {
  private gfx: Phaser.GameObjects.Graphics;
  private timer: Phaser.Time.TimerEvent | null = null;
  private visible = false;

  show(item: ItemDefinition, level: number, scene: Phaser.Scene, W: number, H: number): void
  hide(): void
  destroy(): void
}
```

- `show()` clears previous timer, draws static chrome, starts animation timer.
- Animation loop runs at item-appropriate interval using `scene.time.addEvent`.
- No new scene, no texture cache dependency — all drawn with `Graphics`.

Card hit areas call `previewPanel.show(item, ownedLvl, this, W, H)` or `previewPanel.hide()`
depending on toggle state.

---

## Complexity analysis

- `show()` and `hide()` are O(1). The animation loop fires at most every 350 ms (laser
  fire rate) — one Graphics clear + redraw per tick. No loops over external data.
- `scene.restart()` destroys all scene objects including the timer; no leak risk.

---

## Files touched

| File | Change |
|------|--------|
| `src/scenes/ShopScene.ts` | Add `ItemPreviewPanel` class; wire card tap to toggle panel; shrink list scroll area by 200 px when panel open |

No new files. No type changes.

---

## Test plan

- [ ] Tapping a weapon card shows the preview drawer with animated projectile(s)
- [ ] Tapping the same card again collapses the drawer
- [ ] Laser preview fires at roughly the correct rate (frontFireMs)
- [ ] Spread shot shows 5 diverging projectiles
- [ ] Heavy beam shows wide white bolt
- [ ] Generator preview shows energy bar drain/fill loop
- [ ] Shield preview shows arc + flash + regen
- [ ] Stat delta line shows correct values (owned level vs next level)
- [ ] Buying / selling / equipping resets preview (acceptable — scene restarts)
- [ ] NavBar remains fully interactive with drawer open
- [ ] `typecheck` passes

---

## Checklist

**Design decisions**
- [ ] Design decisions confirmed by user
- [ ] Test plan approved by user

**Readability**
- [ ] `ItemPreviewPanel` ≤ 100 lines; single responsibility (draw + animate one item)
- [ ] Animation interval stored as named constant, not magic number

**Testability**
- [ ] Manual test checklist above covers all 5 item types + toggle behaviour

**File hygiene**
- [ ] No timer leaks — `timer?.remove()` called in `hide()` and `destroy()`

**CI**
- [ ] `typecheck` passes
