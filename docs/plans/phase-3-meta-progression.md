# Phase 3 — Meta-progression plan

## What this changes and why

Phase 3 wires the between-mission economy into the game. It adds two fully functional screens (Shop and Talent Tree), a data-driven items and talents catalogue, and a `computeStats()` pipeline that replaces the hardcoded `BASE_STATS` constant in GameScene with real numbers derived from the player's loadout and talent purchases. After this phase, playing missions earns coins that buy real upgrades, stars that unlock talents that change in-game behaviour, and the player's ship actually improves between runs.

---

## Design decisions requiring confirmation

### 1 — Items catalogue (Shop inventory)

Proposed minimal set for v1 (can expand in Phase 4):

| Id | Name | Slots | Levels | Base cost |
|---|---|---|---|---|
| `laser_mk1` | Laser MkI | front | 3 | 50/80/130 coins |
| `spread_shot` | Spread Shot | left / right | 1 | 60 coins |
| `heavy_beam` | Heavy Beam | left / right | 1 | 80 coins |
| `generator_mk1` | Generator MkI | generator | 3 | 40/70/120 coins |
| `shield_mk1` | Shield MkI | shields | 3 | 50/90/150 coins |

Front laser levels:

| Level | Damage | Energy/shot | Fire rate |
|---|---|---|---|
| 1 | 10 | 5 | 350 ms |
| 2 | 18 | 12 | 300 ms |
| 3 | 28 | 22 | 260 ms |

Generator levels (starting at base values without generator equipped):

| Level | Energy capacity | Energy regen/sec |
|---|---|---|
| none | 80 | 10 |
| 1 | 100 | 15 |
| 2 | 130 | 22 |
| 3 | 170 | 32 |

Shield levels (starting at 0 HP without shields equipped):

| Level | Shield HP | Shield regen/sec |
|---|---|---|
| none | 0 | 0 |
| 1 | 50 | 5 |
| 2 | 90 | 10 |
| 3 | 140 | 18 |

**Decision needed:** Is this the right starting item set? Should the player start with any item already equipped (e.g. a base laser), or does a fresh save have no equipment and use fallback stats?

### 2 — SaveData: starting loadout

Proposed: fresh save starts with `null` in all loadout slots. If no front weapon is equipped, the ship uses fallback stats (20 dmg, 8 energy/shot, 400 ms fire rate) so the game is still playable before buying anything. This avoids gifting the player a free item but ensures they aren't stuck on the WelcomeScene with a non-functional ship.

**Alternative:** give the player a free Laser MkI level 1 at save creation.

### 3 — Talent tree: layout and scope

Design doc: 5 branches, 3–5 nodes each, 3–5 levels per node.

Proposed minimal tree (Phase 3, expandable):

| Branch | Nodes | Levels | Star cost per level |
|---|---|---|---|
| **Weapons** | `damage` (+8% damage), `fire_rate` (+5% fire rate), `weapon_eff` (−4% energy/shot) | 3 each | 1 / 2 / 3 |
| **Shields** | `shield_cap` (+25 HP), `shield_regen` (+2 HP/sec) | 3 each | 1 / 2 / 3 |
| **Generator** | `battery` (+15 energy cap), `efficiency` (+3 energy/sec) | 3 each | 1 / 2 / 3 |
| **Automation** | `dodge_eff` (−1 dodge cost), `dodge_sense` (+0.2 sensitivity) | 3 each | 1 / 2 / 4 |
| **Chain** | `chain_1` (adds explosive_rounds + payoffs to pool), `chain_2` (adds overcharge cards) | 1 each | 2 / 3 |

**Decision needed:** Is the Chain branch unlocking cards in-pool confirmed as the mechanism? (Alternative: Chain just boosts existing card weight.)

### 4 — Talent tree: UI style

The screen is 480 × 800 px. Two approaches:

**A — Tab-per-branch:** 5 tabs at the top, each shows a vertical scrollable list of nodes with +/− buttons and star cost. Simple to build, easy to read on mobile.

**B — Node graph:** Visual tree with connecting lines, nodes as circles/boxes. Looks great but complex to build with Phaser primitives; harder to hit-test on mobile.

**Recommendation:** Tab-per-branch (A). The game's visual language is minimalist anyway.

### 5 — Shop UI: equip vs auto-equip

When the player buys an item, does it auto-equip into the appropriate slot if the slot is empty, or does it go to inventory first and require a separate equip action?

**Recommendation:** Auto-equip into the first empty compatible slot on purchase. If the slot is full, the item goes to inventory and the player must tap "Equip" to swap.

### 6 — Sell confirmation

The design doc says 100% refund on sell. Should there be a confirmation dialog ("Sell Laser MkI for 50 coins?") or is instant sell fine for a prototype?

**Recommendation:** Instant sell with no dialog in Phase 3. Easy to add later.

---

## Files to create / modify

### New files

| File | Purpose |
|---|---|
| `phaser/src/data/items.ts` | `ITEMS: Record<ItemId, ItemDefinition>` — per-level stats and costs |
| `phaser/src/data/talents.ts` | `TALENT_TREE: TalentBranch[]` — branch/node/level definitions |
| `phaser/src/game/computeStats.ts` | `computeStats(save: SaveData): ComputedStats` |

### Modified files

| File | Change |
|---|---|
| `phaser/src/types/index.ts` | Add `ItemDefinition`, `TalentNode`, `TalentBranch` types; update `SaveData` |
| `phaser/src/SaveManager.ts` | Default save uses empty loadout; add `inventory`, `talents` to schema |
| `phaser/src/scenes/GameScene.ts` | Replace `BASE_STATS` with `computeStats(SaveManager.load())` |
| `phaser/src/scenes/ShopScene.ts` | Full implementation replacing stub |
| `phaser/src/scenes/TalentScene.ts` | Full implementation replacing stub |

---

## Complexity analysis

| Loop | Variables | Big-O | Risk |
|---|---|---|---|
| `computeStats()` | T total talent levels | O(T) | Negligible. Runs once at mission start. T ≤ 50. |
| Shop item list render | I items in catalogue | O(I) | Negligible. I ≤ 10 in Phase 3. |
| Talent node render | N nodes across all branches | O(N) | Negligible. N ≤ 20 in Phase 3. |

No O(N×M) paths.

---

## Test plan

- [ ] `computeStats()` with no equipment returns fallback values
- [ ] `computeStats()` with Laser MkI L2 returns correct damage/energyCost
- [ ] `computeStats()` with Generator MkI L3 returns correct energyCapacity/regen
- [ ] `computeStats()` with `talent(damage)` L2 returns `frontDamage × 1.16`
- [ ] Shop: buying item deducts coins; cannot buy when coins < cost
- [ ] Shop: buying auto-equips to empty slot; goes to inventory if slot full
- [ ] Shop: sell returns 100% of all coins paid across all owned levels
- [ ] Shop: equipped item shows "EQUIPPED" badge; cannot sell equipped item without unequipping
- [ ] Talents: spending a star decrements `spendableStars`, does NOT change `totalStarsEarned`
- [ ] Talents: cannot exceed max level for a node
- [ ] Talents: respec restores all `spendableStars` and resets all levels to 0
- [ ] GameScene: mission run uses stats from loadout, not hardcoded BASE_STATS
- [ ] Mission 1: chain talent `chain_1` adds `explosive_rounds` card to the pool when active

---

## Checklist

**Design decisions**
- [ ] Design decisions confirmed by user
- [ ] Test plan approved by user

**Guardrails**
- [ ] `totalStarsEarned` never decreases — guard stays in `SaveManager`
- [ ] Selling an equipped item removes it from loadout before refunding
- [ ] `computeStats()` is pure — no side effects, always returns a fresh object

**Performance**
- [ ] `computeStats()` called once at mission start and result cached on GameScene
- [ ] Shop and Talent renders happen only on scene create/refresh, not per frame

**Readability**
- [ ] No function exceeds 100 lines
- [ ] Item stat formulas in `data/items.ts`, not inline in computeStats

**Testability**
- [ ] `computeStats()` is a pure function — no scene or Phaser dependencies
- [ ] Tests cover: no equipment, partial equipment, max equipment, all talent branches

**CI**
- [ ] `npm run typecheck` passes after each file change
- [ ] `npm run build` passes before marking Phase 3 complete
