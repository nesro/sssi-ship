# Plan: PoE-style talent tree + mission map tree

## What this changes and why

The current talent tree is a tab-per-branch list of rectangular cards with a free
respec. It is functional but gives no sense of exploration or spatial satisfaction.
The current mission selector is a flat vertical card list with a strict linear gate
(need ≥N★ to unlock next). Both problems share the same root: the progression
system is a spreadsheet dressed up as a UI. This plan replaces both screens with a
shared 2D node-graph renderer — the same visual language, the same component — so
the talent tree feels like an atlas you explore and the mission map feels like a
world you're pushing into. A key design philosophy (see below) is encoded into the
architecture: the player must **never** feel stuck.

---

## Core design philosophy (canonical, write once, follow everywhere)

> **The player must never feel stuck.**
> There must always be at least one action that earns coins or advances progression.
> Every completed mission must be re-playable at any time. Replays award full coin
> rewards; star bonuses only increase if the new score beats the previous best.
> Dead ends — "I can't do anything until I get X" — are a design failure.

---

## Design decisions requiring confirmation

### 1. Respec cost formula

Proposed: **5 coins per star spent in the talent tree** (minimum 10 coins).

Example: spent 8 stars → respec costs 40 coins. Tutorial gives 20–40 coins, so a
full respec costs roughly one mission replay. This is "very cheap but not free."

Alternatives:
- Flat 25 coins regardless of spend (even cheaper, no scaling)
- 10 coins per star (pricier — one full spec wipe costs ~100 coins)

**Needs confirmation: cost formula.**

---

### 2. Node discovery — what does the player see before unlocking?

PoE's satisfaction comes from not knowing what is three nodes away until you
travel there. Proposed two-tier visibility:

| Node state | Name shown? | Description shown? |
|---|---|---|
| Beyond frontier (no adjacent purchased node) | `???` | hidden |
| Adjacent to a purchased node (can be bought next) | ✓ name | shown on tap |
| Purchased | ✓ name | ✓ full desc |

"Frontier" = any node whose `requiresNode` is currently owned, OR any node with
no `requiresNode` (root nodes).

This gives the "what's behind there?" pull that makes the PoE tree satisfying.

Alternative: always show all names (simpler, less mystery).

**Needs confirmation: fog-of-war vs always-visible.**

---

### 3. Mission re-run rewards

Completed missions (bestStars ≥ 1) always show a **REPLAY** option. Reward rules:

- Coins: full reward, every time (mission rewards scaled to difficulty already).
- Stars: only the *delta above your previous best* feeds `totalStarsEarned` and
  `spendableStars`. Re-running a 3★ mission still awards full coins but zero extra
  stars — exactly the current `awardMissionResult` logic, no change needed.

This makes grinding for coins always possible without breaking talent-tree balance.

**Needs confirmation: full-coin replay (vs reduced coin replay).**

---

### 4. Mission tree topology (existing 4 missions)

The tree branches at the tutorial so the player immediately faces a choice:

```
                        ┌─ [DAILY] (always accessible, floats above the map)
                        │
              [TUTORIAL] ──────────────────────────────────────────────┐
                  │                                                     │
         [M1: First Contact]                               [M1b: Asteroid Belt]  ← NEW
         "Combat path"                                     "Survival path"
                  │                                                     │
         [M2: Orbital Defense]                             [M2b: Nebula Run]      ← NEW
                  │                                                     │
                  └──────────────────────┬──────────────────────────────┘
                                         │
                                  [M3: The Swarm]
                                  (requires 1★ on any M2-tier mission)
```

M1b and M2b are new missions (separate plan). For Phase 1 of this plan, the
topology is built with placeholder nodes for M1b/M2b (dimmed, labelled "COMING
SOON") so the branching structure is visible immediately even before the content
exists.

**Needs confirmation: two-branch topology (combat vs survival paths).**
**Needs confirmation: "COMING SOON" placeholder nodes vs linear tree until content exists.**

---

### 5. Shared `TreeCanvas` component

Both the talent tree and mission map use one component:
`src/ui/TreeCanvas.ts`

It is responsible for:
- Rendering nodes (small circle = travel/minor, large circle = keystone/boss)
- Drawing connector lines (dim / lit / gold based on state)
- Handling tap-to-select (fires a callback)
- Panning the canvas when the tree is larger than the viewport (drag to pan)

Each consumer passes a typed `TreeNode[]` array with layout `{x, y}` and state
(`locked | available | owned | maxed`). Neither TalentScene nor MissionSelectScene
contains any drawing code — they only build the node arrays and handle actions
(unlock talent / start mission).

Alternative: separate implementations that share visual style but not code (simpler
short-term, diverges over time).

**Needs confirmation: shared component vs separate implementations.**

---

### 6. Talent tree layout — radial vs directional

Proposed: **directional fan** — origin node top-center, branches spread
downward and outward, each branch angled so they never overlap.

```
           [ORIGIN]
          /   |    \
      [WEP] [GEN] [SHD]
       / \    |    / \
      …  KS  KS  KS  …
              |
          [AUTO] [CHAIN]
```

Branches are color-coded (weapons=cyan, shields=teal, generator=yellow,
automation=orange, chain=purple). Keystones (big circles) sit at the *far end*
of each branch — the payoff you work toward.

Alternative: radial from center (looks more like PoE, needs a circle-aware
layout algorithm that we'd write from scratch).

**Needs confirmation: directional fan vs radial.**

---

## Complexity analysis

| Operation | Big-O | Variables |
|---|---|---|
| Build node arrays | O(N) | N = total nodes (≤ 50 talent + ≤ 12 mission) |
| Draw connectors | O(N) | one line per node with a `requiresNode` |
| Tap-hit detection | O(N) | linear scan; N small → fine |
| Fog-of-war frontier check | O(N) | one pass to collect owned IDs, one pass to mark adjacent |
| Pan update (per drag event) | O(1) | just offset translation |

No path O(N×M) or worse. All operations are bounded by the fixed number of nodes.

---

## Implementation phases

### Phase 0 — Anchorage (no new UI, tiny scope) ✓ DONE 2026-06-05
- [x] Change respec from free → coin cost (5 coins/star, min 10)
- [x] Make completed missions always show REPLAY (unlocked || bestStars > 0)
- [x] Write "player must never feel stuck" to `DESIGN_NOTES.md` and project memory

### Phase 1 — Shared TreeCanvas
- [ ] Define `TreeNode` and `TreeEdge` types in `src/ui/TreeCanvas.ts`
- [ ] Implement node rendering: small circle (travel), large circle (keystone)
- [ ] Implement edge rendering: dim / lit / gold state colours
- [ ] Implement pan (drag offset, clamped to tree bounding box)
- [ ] Implement tap selection → info panel callback
- [ ] Fog-of-war: `???` names for beyond-frontier nodes

### Phase 2 — Talent tree on TreeCanvas
- [ ] Add `x, y` layout positions to every `TalentNode` in `data/talents.ts`
  (replace `col, row` grid coords)
- [ ] Rewrite `TalentScene` to use `TreeCanvas` instead of the manual grid renderer
- [ ] Preserve all existing unlock / respec logic
- [ ] Add branch color coding

### Phase 3 — Mission map on TreeCanvas
- [ ] Add `mapX, mapY` to `MissionDefinition`
- [ ] Define edge list (which missions connect to which)
- [ ] Rewrite `MissionSelectScene` to use `TreeCanvas`
- [ ] Add COMING-SOON placeholder nodes for future missions
- [ ] REPLAY button on completed missions

### Phase 4 — New missions (separate plan)
- [ ] M1b "Asteroid Belt" (survival path)
- [ ] M2b "Nebula Run" (survival path)
- [ ] Wire into tree topology

---

## File hygiene

Files touched by this plan:

| File | Change |
|---|---|
| `src/ui/TreeCanvas.ts` | **new** — shared component |
| `src/data/talents.ts` | `col/row` → `x/y`; add branch color |
| `src/data/missions.ts` | add `mapX`, `mapY`, `connectsTo: string[]` |
| `src/scenes/TalentScene.ts` | rewrite renderer section |
| `src/scenes/MissionSelectScene.ts` | rewrite renderer section |
| `src/SaveManager.ts` | schema bump if new mission fields added |
| `docs/DESIGN_NOTES.md` | add philosophy section |

No hardcoded paths, credentials, or TODO comments exist in these files currently.

---

## Test plan

### Phase 0
- [ ] Respec button shows correct coin cost (starsSpent × 5)
- [ ] Respec disabled / greyed when coins < cost
- [ ] Respec disabled when nothing is spent (spent = 0)
- [ ] Completed mission shows REPLAY regardless of unlock state of later missions
- [ ] Re-running a 3★ mission awards coins but no new spendable stars

### Phase 1 — TreeCanvas unit / visual
- [ ] Node renders as small circle (travel) or large circle (keystone)
- [ ] Edge colour: 0x444444 (both locked), 0x888888 (prereq owned), 0xffcc00 (both owned)
- [ ] Fog-of-war: node beyond frontier shows `???`
- [ ] Tap fires selection callback with correct node id
- [ ] Pan: dragging moves the canvas; tree does not pan beyond its bounding box

### Phase 2 — Talent tree
- [ ] All existing nodes render at new x/y positions
- [ ] Unlock/respec logic unchanged (regression test)
- [ ] Keystones sit at branch ends; travel nodes connect inward

### Phase 3 — Mission map
- [ ] All 4 existing missions rendered as nodes
- [ ] COMING-SOON placeholders visible but not interactive
- [ ] Locked missions show lock indicator
- [ ] Completed missions show both PLAY and star count

---

## Checklist

**Design decisions**
- [x] Respec cost: 5 coins per spent star (min 10) — confirmed 2026-06-05
- [x] Node discovery: always visible (no fog-of-war) — confirmed 2026-06-05
- [x] Mission re-run: full-coin reward every time — confirmed 2026-06-05
- [x] Mission tree: two-branch topology, placeholder nodes from day one — confirmed 2026-06-05
- [x] Shared TreeCanvas component — confirmed (implied by tree-language choice)
- [x] Talent tree layout: directional fan from top — confirmed 2026-06-05

**Guardrails**
- [ ] No function exceeds 100 lines or 5 positional parameters
- [ ] No magic numbers — NODE_R, KEYSTONE_R, EDGE_COLOR_* are named constants
- [ ] No swallowed exceptions

**Performance**
- [ ] All loops are O(N) with N ≤ 62 (50 talent + 12 mission nodes) — no concern
- [ ] No repeated draws per frame; tree is static, redrawn only on state change

**Readability**
- [ ] `TreeCanvas` has a single responsibility: render and pan a node graph
- [ ] `TalentScene` and `MissionSelectScene` only handle domain logic (unlock/start)

**Testability**
- [ ] Respec cost: pure function `respecCost(starsSpent): number` — trivially testable
- [ ] Fog-of-war frontier: pure function `frontier(nodes, ownedIds): Set<string>` — testable
- [ ] Edge state: pure function `edgeState(fromOwned, toOwned): EdgeState` — testable

**File hygiene**
- [ ] No hardcoded personal paths or credentials
- [ ] No TODO/FIXME without owner

**CI**
- [ ] `pnpm build:dry` passes after each phase
- [ ] `pnpm lint` passes after each phase
- [ ] `pnpm test` passes with no new failures
