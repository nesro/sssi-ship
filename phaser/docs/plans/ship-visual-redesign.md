# Plan: Ship Visual Redesign

## What this changes and why

The current player ship is a plain white-outlined triangle with a 2×2 px cockpit square
and a single engine rectangle. It reads as "placeholder". This plan replaces
`drawShipShape()` with a procedurally drawn ship that has swept wings, a canopy, dual
engine pods with glow, and hull panel lines — all without any external image files.
The ally ship reuses the same function with different colours, so it benefits
automatically. Texture size grows from 48×56 to 64×88.

---

## Design decisions requiring confirmation

| # | Decision | Chosen |
|---|----------|--------|
| 1 | Texture size | 64 × 88 px |
| 2 | Shape family | Delta-wing — wide swept wings, narrow nose |
| 3 | Engine count | 2 pods (left & right) + central exhaust slot |
| 4 | Cockpit style | Elongated hexagon, filled with tinted cockpit colour |
| 5 | Hull detail | 2 diagonal panel-line strokes per wing |
| 6 | Ally ship | Same function, palette swap (green scheme) |
| 7 | Exhaust glow | Small soft-alpha filled ellipse behind each engine pod |

---

## Proposed shape (64 × 88 canvas, origin top-left)

```
         ╱╲          ← nose tip at (32, 2)
        ╱  ╲
      ╱  []  ╲       ← cockpit hex (22–42 x, 14–30 y)
    ╱──────────╲
   ╱  [L] [] [R]╲    ← wing shoulders with engine pods
  ╱_______________╲   ← base line at y=82
   □             □   ← engine nozzles at (10,82) and (54,82)
```

Key vertices (player ship):
- Nose: (32, 2)
- Wing tips: (2, 78) and (62, 78)
- Wing shoulders: (8, 56) and (56, 56)
- Hull width narrows to (22, 78) and (42, 78) between the engine pods

Panel lines:
- Left wing: stroke from (8,56) to (16,78)
- Right wing: stroke from (56,56) to (48,78)

Engine pods (filled rects, per side):
- Left:  x=6–18,  y=72–84, fill=engine colour
- Right: x=46–58, y=72–84, fill=engine colour

Engine glow (soft ellipse, alpha 0.4):
- Left:  cx=12, cy=86, rx=6, ry=3
- Right: cx=52, cy=86, rx=6, ry=3

---

## Complexity analysis

`drawShipShape()` is called twice (player + ally) at scene create — O(1). No loops
over external data. No impact on frame rate.

---

## Files touched

| File | Change |
|------|--------|
| `src/scenes/GameScene.ts` | Replace `drawShipShape()` body; update `makeTexture` calls to use 64×88; adjust laser spawn offset from `-30` to `-44` to match new nose height |

No type changes. No new files.

---

## Test plan

- [ ] Ship renders visibly above the HUD panel (no clipping)
- [ ] Wings, cockpit, and engine pods are all distinct and visible
- [ ] Ally ship appears in green palette (correct colour params)
- [ ] Laser fires from roughly the nose of the ship (not from the centre)
- [ ] Ship texture dimensions match the hitbox (no invisible collision area)
- [ ] `typecheck` passes

---

## Checklist

**Design decisions**
- [ ] Design decisions confirmed by user
- [ ] Test plan approved by user

**Readability**
- [ ] All vertex coordinates stored as named constants or grouped comments (no silent magic numbers)

**File hygiene**
- [ ] No TODO/FIXME comments introduced

**CI**
- [ ] `typecheck` passes
