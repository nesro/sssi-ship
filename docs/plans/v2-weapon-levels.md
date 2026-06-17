# Weapon upgrade levels

## What this changes and why

Replaces the current flat list of 7 named weapons with a **per-type level track**: each
of the four weapon kinds (Pulse, Ion, Scatter, Nova) can be upgraded from level 1 to
level 5 by spending coins. Each level raises damage, fire rate, and for multi-target
weapons, pierce count. The visual glow intensity scales with level so the player can
read weapon strength at a glance. The motivation is a smoother upgrade curve — currently
there are two Pulse weapons and then a large gap to other types; levelling gives the
player a steady drip of purchases to work toward.

## Design decisions requiring confirmation

1. **Number of levels.** Proposed: **5 levels per type** (level 1 = starter, free;
   levels 2–5 = purchased). "0–10" was mentioned but 5 tighter levels are easier to
   balance without a simulator pass first. We can extend to 10 later.
   - **Requires confirmation:** 5 levels or more?

2. **Stat scaling per level.** Proposed formula (level = 1..5):
   | Stat | Per level |
   |---|---|
   | `damagePerShot` | base × (1 + 0.22 × (level−1)) |
   | `ticksBetweenShots` | base × (1 − 0.06 × (level−1)) (faster) |
   | `energyPerShot` | base × (1 + 0.15 × (level−1)) (hungrier) |
   | `maxTargets` (scatter only) | base + (level−1) |
   | `maxTargets` (nova only) | Infinity (unchanged) |
   - **Requires confirmation:** are these slopes reasonable, or adjust?

3. **Pricing.** Proposed: `price(level) = round(basePrice × level^1.6)` where
   `basePrice` per kind = `{ pulse: 80, ion: 180, scatter: 140, nova: 160 }`.
   Level 1 is always free (starter).
   - **Requires confirmation:** price curve direction and magnitude?

4. **Save format change.** Current save has `ownedItemIds: string[]`. Proposed:
   keep the same array but use generated IDs: `'pulse-1'`…`'pulse-5'`, `'ion-1'`…
   Level 1 for each type is added to `STARTER_ITEM_IDS`. Old saves (< version 2) reset
   to default (acceptable at this dev stage).
   - **Requires confirmation:** accept save reset on upgrade?

5. **Visual level indicator.** Proposed: each weapon row in the shop shows
   `●●●○○` filled dots for owned levels. In CombatScene/ShopPreviewPanel the glow
   radius and laser bolt scale multiply by `0.85 + level × 0.07` (level 5 = 1.2× glow).
   - **Requires confirmation:** dots OK, or prefer a numeric "Lv 3" label?

6. **Shop layout.** Currently the Weapons tab shows 7 rows. With 5 levels × 4 types:
   - Show **4 rows** (one per weapon type)
   - Selected row expands inline to show the level track: current level + next-level
     stats diff + BUY button
   - **Requires confirmation:** inline expand vs. separate detail panel at the bottom
     (current pattern)?

7. **Equipped slot.** The save stores `equipped.weapon: string`. Level-keyed IDs
   (`'pulse-3'`) work with the existing `equipped` field without change.

## Complexity analysis

- Spec generation: O(4 × 5) = O(20) at app startup (constant).
- Shop render: O(4) weapon types; expanded row is O(1).
- No impact on the core tick loop — stats are computed once per tick as today.

## Test plan

- [ ] Level 1 of each weapon type is owned by default and equippable
- [ ] Buying level N requires level N-1 to be owned (gate check)
- [ ] Stats computed by generator match hand-calculated values for levels 1 and 5
- [ ] `buildLoadout` returns correct weapon spec for equipped level
- [ ] Old save (version 1) is reset to defaultSave on load (version bump to 2)
- [ ] Shop Weapons tab shows 4 type rows, not 7 item rows
- [ ] Glow scale in preview matches level (visual smoke test in browser)

## File hygiene

- `src/data/items.ts` — weapon entries replaced by generator function; old flat entries
  removed
- `src/save/SaveManager.ts` — `SAVE_VERSION` bumped to 2; `defaultSave` adds level-1
  IDs; add `buyWeaponLevel(save, kind)` function
- `src/view/ShopScene.ts` — Weapons tab rebuild to show type rows + level track
- `src/view/ShopPreviewPanel.ts` / `src/view/CombatScene.ts` — glow scale by level
- `src/view/textures.ts` — `laserTextureForWeaponId` / `iconTextureForWeaponId` must
  handle new IDs (e.g. `'pulse-3'`)

---

### Checklist

**Design decisions**
- [ ] Level count confirmed (5 or more)
- [ ] Stat scaling confirmed
- [ ] Price curve confirmed
- [ ] Save reset accepted
- [ ] Visual level indicator style confirmed
- [ ] Shop layout (inline expand vs bottom panel) confirmed
- [ ] Test plan approved by user

**Guardrails**
- [ ] Every opt-out guard uses `=== false`, not `!value`
- [ ] No swallowed exceptions

**Performance**
- [ ] Spec generation O(constant); no per-tick allocation

**Readability**
- [ ] Generator function ≤ 100 lines
- [ ] All scaling constants in `src/core/constants.ts` or adjacent to the generator

**CI**
- [ ] `pnpm build:dry` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes with no new failures
