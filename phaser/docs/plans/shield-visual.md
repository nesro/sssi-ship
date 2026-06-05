# Plan: Shield Visual

## What this changes and why

The shield is a core mechanic but currently invisible. Players can only infer it exists
from the SHD bar in the HUD. This plan adds a semi-transparent glow ring around the
player ship that reflects shield state live: bright cyan at 100%, fading toward invisible
at 0%, and flashing white for ~300 ms each time a hit is absorbed. The visual makes the
shield feel real and communicates to the player exactly when their shield is protecting them.

---

## Design decisions requiring confirmation

| # | Decision | Chosen |
|---|----------|--------|
| 1 | Shape | Full circle centred on ship, radius 44 px |
| 2 | Fill | Semi-transparent filled disc (alpha = ratio × 0.22) |
| 3 | Rim | Stroked circle (alpha = ratio × 0.75, lineWidth = 2) |
| 4 | Hit flash | `shieldFlash` scalar 0→1 on hit; decays by 1.8/s each frame; color lerps cyan→white |
| 5 | Broken shield | Circle hidden entirely when `shields.ratio === 0` |
| 6 | Depth | 4 (below ship at depth 5, above stars at depth −1) |
| 7 | No tween | Decay is frame-by-frame math — no Phaser tween needed |

---

## Color math

```
shieldFlash decays:  shieldFlash = Math.max(0, shieldFlash − delta * 0.0018)

rim alpha   = shields.ratio * 0.75 + shieldFlash * 0.5
fill alpha  = shields.ratio * 0.22 + shieldFlash * 0.3

// lerp rim colour from cyan (0x00ccff) to white (0xffffff) based on flash:
rimColor = lerpColor(0x00ccff, 0xffffff, shieldFlash)
```

`lerpColor(a, b, t)` implemented as bitwise channel lerp — ~5 lines.

---

## Complexity analysis

`updateShieldGfx()` is called every frame: 1 Graphics clear + 2 draw calls. O(1).
`shieldFlash` decay: 1 subtraction + 1 clamp. O(1).

---

## Files touched

| File | Change |
|------|--------|
| `src/scenes/GameScene.ts` | Add `shieldGfx`, `shieldFlash` fields; `buildShieldGfx()` in `create()`; `updateShieldGfx()` in `update()`; set `shieldFlash = 1` in `onShotHitsPlayer()` |

No new files. No type changes.

---

## Test plan

- [ ] Full shield (100%): bright cyan ring clearly visible around ship
- [ ] Partial shield (50%): dimmer ring, same radius
- [ ] Shield nearly empty (<10%): ring barely visible
- [ ] Shield broken (0%): ring invisible
- [ ] Taking a hit while shielded: ring flashes bright white then fades back over ~300 ms
- [ ] Taking a hit through broken shield: no flash (hull damage, not shield)
- [ ] Shield recharging: ring visibly brightens as ratio rises
- [ ] Ring follows ship during auto-dodge movement every frame
- [ ] `typecheck` passes

---

## Checklist

**Design decisions**
- [ ] Design decisions confirmed by user
- [ ] Test plan approved by user

**Readability**
- [ ] `lerpColor` is a named helper function, not inline bitwise soup
- [ ] All magic radius / alpha constants extracted as named module-level consts

**Performance**
- [ ] O(1) per frame — no allocation in hot path

**CI**
- [ ] `typecheck` passes
