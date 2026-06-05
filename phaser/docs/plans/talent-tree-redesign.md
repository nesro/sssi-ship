# Plan: Talent Tree Redesign

## What this changes and why

The current TalentScene shows a flat list of nodes per branch — every node is equally
accessible and costs the same star type. This removes any sense of traversal or strategy.
The redesign turns each branch into a genuine tree: cheap travel nodes (+3–5% bonus, 1 star)
form paths between expensive keystones (+10–15% or special mechanic, 3–4 stars). To unlock
a node you must first unlock its predecessor, which creates meaningful route decisions.

---

## Design decisions requiring confirmation

| # | Decision | Chosen |
|---|----------|--------|
| 1 | Layout unit | Each column = 90 px. Main path at row 0, fork at row 1 |
| 2 | Node sizes | Travel node ○ = 18 px radius; Keystone ◎ = 26 px radius |
| 3 | Unlock gate | You must unlock the predecessor node at level ≥ 1 before this node is accessible |
| 4 | Node levels | Travel nodes: 1 level only. Keystones: 1–2 levels |
| 5 | Selected node | Tapping a node selects it; a bottom info panel shows name, effect, cost, UNLOCK button |
| 6 | Tab bar | Keeps existing 4-char tab style, one tab per branch |
| 7 | Respec | Respec refunds ALL stars and resets the entire tree (existing behaviour) |

---

## Proposed tree structure (all 5 branches)

### WEAPONS  (6 nodes)
```
col:    0          1              2
row 0:  dmg_1 ─── dmg_2 ──────── dmg_mastery  ◎
                    └── rate_1 ── rate_mastery ◎
```
| id | name | type | col | row | req | levels | effect |
|---|---|---|---|---|---|---|---|
| dmg_1 | Targeting I | travel | 0 | 0 | — | 1 | +5% front damage |
| dmg_2 | Targeting II | travel | 1 | 0 | dmg_1 | 1 | +5% front damage |
| dmg_mastery | Combat Mastery | keystone | 2 | 0 | dmg_2 | 2 | +8% / +14% dmg |
| rate_1 | Rapid Cycle | travel | 1 | 1 | dmg_1 | 1 | −5% fire interval |
| rate_mastery | Burst Protocol | keystone | 2 | 1 | rate_1 | 2 | −8% / −14% fire interval |
| weap_eff | Efficient Coils | travel | 0 | 1 | — | 1 | −4% front energy cost |

### SHIELDS  (5 nodes)
```
col:    0          1              2
row 0:  shd_1 ─── shd_cap ─────── shd_mastery ◎
                    └── shd_regen  shd_regen_m ◎
```
| id | name | type | col | row | req | levels | effect |
|---|---|---|---|---|---|---|---|
| shd_1 | Hardening I | travel | 0 | 0 | — | 1 | +10% shield capacity |
| shd_cap | Hardening II | travel | 1 | 0 | shd_1 | 1 | +10% shield capacity |
| shd_mastery | Aegis Core | keystone | 2 | 0 | shd_cap | 1 | +20% shield cap |
| shd_regen | Quick Charge | travel | 1 | 1 | shd_1 | 1 | +15% shield regen |
| shd_regen_m | Regen Surge | keystone | 2 | 1 | shd_regen | 1 | +25% shield regen |

### GENERATOR  (5 nodes)
| id | name | type | col | row | req | levels | effect |
|---|---|---|---|---|---|---|---|
| gen_1 | Capacitor I | travel | 0 | 0 | — | 1 | +10% energy capacity |
| battery | Capacitor II | travel | 1 | 0 | gen_1 | 1 | +10% energy capacity |
| gen_mastery | Power Core | keystone | 2 | 0 | battery | 1 | +20% energy capacity |
| efficiency | Flow State | travel | 1 | 1 | gen_1 | 1 | −4% all energy costs |
| gen_eff_m | Overclocked | keystone | 2 | 1 | efficiency | 1 | −8% all energy costs |

### AUTOMATION  (4 nodes)
| id | name | type | col | row | req | levels | effect |
|---|---|---|---|---|---|---|---|
| dodge_eff | Evasion I | travel | 0 | 0 | — | 1 | −2 dodge cost |
| dodge_m | Ghost Protocol | keystone | 1 | 0 | dodge_eff | 1 | −4 dodge cost |
| side_eff | Sidearm Tune | travel | 0 | 1 | — | 1 | −8% side weapon cost |
| side_m | Weapons Sync | keystone | 1 | 1 | side_eff | 1 | −15% side weapon cost |

### CHAIN  (4 nodes — chain unlocks additional card pools)
| id | name | type | col | row | req | levels | effect |
|---|---|---|---|---|---|---|---|
| chain_1 | Resonance I | travel | 0 | 0 | — | 1 | Unlocks chain card pool (rare cards) |
| chain_pool_1 | Arc Conduit | keystone | 1 | 0 | chain_1 | 1 | Unlocks explosive chain cards |
| chain_2 | Resonance II | travel | 0 | 1 | chain_1 | 1 | +5% chain bonus |
| chain_pool_2 | Storm Core | keystone | 1 | 1 | chain_2 | 1 | Unlocks lightning storm cards |

---

## Data model changes

Add to `TalentNode` in `types/index.ts`:
```typescript
export interface TalentNode {
  id:           string;
  name:         string;
  description:  string;
  isKeystone:   boolean;
  col:          number;
  row:          number;
  requiresNode?: string;   // id of prerequisite node
  levels:       TalentLevel[];
}
```

`talentLevel()` helper in `talents.ts` — unchanged API.

`computeStats.ts` — node ids are the same where possible; new ones added. No breaking change to computed output.

---

## TalentScene rendering

```
┌──────────────────────────────────────┐
│  [WEAP] [SHLD] [GEN] [AUTO] [CHAIN] │  ← tab row
├──────────────────────────────────────┤
│                                      │
│   ○───○──────◎                       │  ← row 0 (main path)
│         └──○──◎                      │  ← row 1 (fork)
│                                      │
├──────────────────────────────────────┤
│  [Selected node info + UNLOCK btn]   │  ← bottom info panel
└──────────────────────────────────────┘
```

- Lines drawn first (grey for locked path, dim-color for unlocked path)
- Node circles drawn on top; travel = 18r, keystone = 26r
- Colour: locked = 0x333333, unlocked = accent per branch, maxed = bright
- Star count in node circle (e.g. "★1") or locked "·"
- Bottom info panel (~110 px) shows: name, description, cost to unlock, UNLOCK button
- Tapping a locked-gate node shows "Requires [predecessor]" instead

---

## Complexity analysis

All operations are O(N nodes per branch) — at most 6 nodes in the Weapons branch.
No loops over external data. All O(1) from the player's perspective.

---

## Files touched

| File | Change |
|------|--------|
| `src/types/index.ts` | Add `isKeystone`, `col`, `row`, `requiresNode` to `TalentNode` |
| `src/data/talents.ts` | Full rewrite of TALENT_TREE with new node definitions |
| `src/scenes/TalentScene.ts` | Full rewrite of rendering (tree layout + bottom info panel) |
| `src/game/computeStats.ts` | Map new node IDs → stat effects (mostly same, add new ones) |

---

## Test plan

- [ ] All 5 branches render nodes in correct positions with connecting lines
- [ ] Locked predecessor correctly blocks a node (button disabled, "Requires X" shown)
- [ ] Unlocking a travel node enables the next node in the path
- [ ] Star cost deducted correctly; `spendableStars` updates on screen immediately
- [ ] RESPEC refunds full cost and resets all nodes to 0
- [ ] computeStats reads new node IDs correctly (dmg_mastery → front damage bonus)
- [ ] Chain branch keystones unlock correct card pools in GameScene
- [ ] `typecheck` passes

---

## Checklist

**Design decisions**
- [ ] Design decisions confirmed by user
- [ ] Test plan approved by user

**Guardrails**
- [ ] Gate check uses `talentLevel(talents, requiresNode) >= 1`, not `!= 0`
- [ ] Respec refund is exact sum of star costs paid (no rounding)

**Performance**
- [ ] O(N nodes) per branch render — max 6 nodes, acceptable

**Readability**
- [ ] Node positions computed from `col * COL_STRIDE + ORIGIN_X` — no magic pixel values
- [ ] `buildBranchGraph()` ≤ 80 lines

**CI**
- [ ] `typecheck` passes
