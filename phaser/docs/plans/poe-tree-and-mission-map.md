# Plan: PoE-style talent tree + mission map tree

## What this changes and why

The current talent tree is a tab-per-branch list. The current mission selector is a flat
vertical card list. Both problems share the same root: the progression system is a spreadsheet
dressed up as a UI. This plan replaces both screens with a shared 2D node-graph renderer so
the talent tree feels like a physical atlas and the mission map feels like a world you are
pushing into. Core design rule: **the player must never feel stuck.**

---

## Design decisions (all confirmed 2026-06-05)

| # | Decision | Chosen |
|---|----------|--------|
| 1 | Respec cost | 5 coins per star spent (min 10) |
| 2 | NavBar gates | SHOP unlocks after tutorial ≥1★; TALENTS after M1 ≥1★ |
| 3 | Talent layout | Directional fan from top-center; branch color coded |
| 4 | Node visibility | All nodes always visible — no fog of war |
| 5 | Mission topology | Two-branch (combat / survival), placeholder nodes until content exists |
| 6 | Shared component | `src/ui/TreeCanvas.ts` used by both talent tree and mission map |
| 7 | Mission replays | Full coin reward every time; extra stars only when beating previous best |
| 8 | `maxStars` | Field in node data type; multi-tier scoring logic is a future phase |

---

## Implementation phases

### Phase 0 — Anchorage ✅ DONE 2026-06-05

- [x] Respec from free → 5 coins/star (min 10)
- [x] Completed missions always show REPLAY (`bestStars > 0`)
- [x] NavBar SHOP dimmed + lock icon until `tutorial.bestStars >= 1`
- [x] NavBar TALENTS dimmed + lock icon until `mission_1.bestStars >= 1`
- [x] "Player must never feel stuck" principle in `DESIGN_NOTES.md`

### Phase 1 — Shared TreeCanvas

- [ ] `src/ui/TreeCanvas.ts` — `TreeNode`, `NodeState`, `TreeEdge` types
- [ ] Node rendering: small circle (travel), large circle (keystone)
- [ ] Edge rendering: dim / lit / gold based on ownership state
- [ ] Pan support: pointerdown + pointermove, clamped to bounding box
- [ ] Tap fires `onSelect(nodeId)` callback

### Phase 2 — Talent tree on TreeCanvas

- [ ] Add `x, y` layout positions to `TalentNode` in `src/data/talents.ts`; remove `col/row`
- [ ] Rewrite `TalentScene` renderer to use `TreeCanvas`
- [ ] Four branches with color coding; keystones at branch ends

### Phase 3 — Mission map on TreeCanvas

- [ ] Add `mapX, mapY, connectsTo: string[]` to `MissionDefinition`
- [ ] Rewrite `MissionSelectScene` renderer to use `TreeCanvas`
- [ ] COMING SOON placeholder nodes for M1b/M2b
- [ ] Locked missions dimmed with requirement label

### Phase 4 — Content expansion

- [ ] M1b "Asteroid Belt" and M2b "Nebula Run" missions
- [ ] Multi-tier star scoring (5–7 stars) per mission

---

## Complexity analysis

All operations O(N), N ≤ 62 nodes. No per-frame work — tree redraws only on state change.

---

## Files touched

| File | Change |
|------|--------|
| `src/ui/TreeCanvas.ts` | **new** — shared renderer |
| `src/data/talents.ts` | `col/row` → `x/y`; add branch color |
| `src/data/missions.ts` | add `mapX`, `mapY`, `connectsTo`, `maxStars` |
| `src/scenes/TalentScene.ts` | renderer rewrite |
| `src/scenes/MissionSelectScene.ts` | renderer rewrite |
| `src/ui/NavBar.ts` | lock logic (Phase 0 done) |
