# Shop economy rebalance

## What this changes and why

Every shop system (ship, weapon, rear-weapon, shield, generator, motor) currently has
prices and star gates that are (a) not strictly increasing row-to-row — e.g. weapon
Lv1 and Lv2 both cost 0 stars — and (b) clustered close together both within a kind
(200 → 2000 coins) and across kinds (weapon kinds all start around 200-280 coins).
This makes the shop feel flat: there's no sense of "far away, expensive, aspirational"
gear. The fix is a full re-tune of every price and star-requirement table in
`items.ts` so that every row (both level-to-level within a kind, and kind-to-kind)
strictly increases, with wide multiplicative gaps, anchored to a concrete endgame
target: **at 1,000,000 coins and all 46 mission stars, a player can afford the single
most expensive item in every one of the six systems** (trade-in cost from the
starter item, which is always free, equals that item's raw price). In practice stars
run out before coins do, since several systems' top tier requires nearly all 46 stars.

This is a pure data change in `src/data/items.ts` (price/star arrays) — no changes to
`SaveManager.ts`, `shopSystems.ts`, or `hub.ts` logic. It will break many existing
tests that hardcode today's prices (e.g. `shield-wall-2` costs 300); those get
updated to the new numbers, not deleted.

## Design decisions requiring confirmation

- **Per-system coin budget** (top kind, Lv5 price), summing to exactly 1,000,000:
  ship 200,000 · weapon 200,000 · rear-weapon 150,000 · shield 150,000 ·
  generator 150,000 · motor 150,000. Ship and weapon get the larger share since
  they're the two "hero" slots (survivability + primary damage).
- **Curve shape**: each level within a kind is ~2.2× the previous level's price;
  each kind tier's top price is ~2.5× the previous tier's top price (tierRatio 0.4
  applied backwards from the top kind). This is what makes prices "far apart"
  without needing per-system special-casing.
- **Starter item stays free**: the first kind in each system's `*_KINDS` array
  (pulse, grenade, wall, torrent, rush, interceptor) keeps Lv1 at 0 coins / 0 stars,
  preserving the existing "always have something to equip" rule. Every other cell
  in the table (including that same starter kind's Lv2+) gets a strictly-increasing,
  non-zero value.
- **Star caps per system**: weapon 46 (all stars), ship 46 (all stars), motor 44,
  shield 42, generator 42, rear-weapon 40. Weapon and ship — the two hero slots —
  are the ones that genuinely require *every* star in the game at max level.

## Complexity analysis

Pure data tables, no loops over N/L/A/D. No algorithmic complexity concerns.

## Computed tables (rounded to clean numbers, strictly increasing, sums to 1,000,000)

```
weapon (budget 200,000, star cap 46)
  pulse    prices: 0, 1200, 2650, 5800, 12800     stars: 0, 1, 2, 3, 4
  scatter  prices: 1350, 3000, 6600, 14500, 32000 stars: 5, 7, 9, 12, 14
  ion      prices: 3400, 7500, 16500, 36400, 80000 stars: 16, 19, 22, 25, 28
  nova     prices: 8550, 18800, 41300, 90900, 200000 stars: 32, 35, 39, 42, 46

rear-weapon (budget 150,000, star cap 40)
  grenade  prices: 0, 360, 800, 1750, 3850        stars: 0, 1, 2, 3, 4
  cluster  prices: 410, 900, 2000, 4350, 9600      stars: 5, 6, 7, 8, 9
  flak     prices: 1000, 2250, 4950, 10900, 24000  stars: 10, 11, 13, 15, 17
  arc      prices: 2550, 5650, 12400, 27300, 60000 stars: 19, 21, 23, 25, 28
  plasma   prices: 6400, 14100, 31000, 68200, 150000 stars: 30, 32, 35, 37, 40

shield (budget 150,000, star cap 42)
  wall     prices: 0, 900, 2000, 4350, 9600        stars: 0, 1, 2, 3, 4
  reflex   prices: 1000, 2250, 4950, 10900, 24000  stars: 5, 7, 8, 11, 13
  flux     prices: 2550, 5650, 12400, 27300, 60000 stars: 15, 18, 20, 23, 26
  bulwark  prices: 6400, 14100, 31000, 68200, 150000 stars: 29, 32, 35, 39, 42

generator (budget 150,000, star cap 42)
  torrent  prices: 0, 900, 2000, 4350, 9600        stars: 0, 1, 2, 3, 4
  reserve  prices: 1000, 2250, 4950, 10900, 24000  stars: 5, 7, 8, 11, 13
  steady   prices: 2550, 5650, 12400, 27300, 60000 stars: 15, 18, 20, 23, 26
  surge    prices: 6400, 14100, 31000, 68200, 150000 stars: 29, 32, 35, 39, 42

motor (budget 150,000, star cap 44)
  rush       prices: 0, 900, 2000, 4350, 9600       stars: 0, 1, 2, 3, 4
  sentinel   prices: 1000, 2250, 4950, 10900, 24000 stars: 5, 7, 9, 11, 13
  tactical   prices: 2550, 5650, 12400, 27300, 60000 stars: 16, 18, 21, 24, 27
  overdrive  prices: 6400, 14100, 31000, 68200, 150000 stars: 30, 33, 37, 40, 44

ship (budget 200,000, star cap 46)
  interceptor prices: 0, 480, 1050, 2300, 5100      stars: 0, 1, 2, 3, 4
  salvager    prices: 550, 1200, 2650, 5800, 12800  stars: 5, 6, 7, 8, 10
  reactor     prices: 1350, 3000, 6600, 14500, 32000 stars: 11, 13, 15, 17, 19
  tanker      prices: 3400, 7500, 16500, 36400, 80000 stars: 22, 24, 26, 29, 32
  warship     prices: 8550, 18800, 41300, 90900, 200000 stars: 34, 37, 40, 43, 46
```

Every price and every star value is strictly greater than the one before it, reading
each system top-to-bottom (kind) then left-to-right (level). All values within a
system are pairwise distinct (preserves the earlier "no two costs the same" rule —
no switch can ever land on a coincidental 0-cost/net-zero unless it's a genuine
price match with whatever's currently equipped).

## Test plan

- [ ] `items.ts` price/star exports produce the tables above for all 6 systems
- [ ] `SaveManager.test.ts`: update every hardcoded price assertion (shield-wall-2,
      shield-wall-3, shield-reflex-2, shield-flux-1, ship-salvager-1, ship-warship-1,
      grenade-2/3, flak-1) to the new numbers
- [ ] `hub.test.ts`: update every hardcoded price assertion (ion-1, scatter-1,
      pulse-1/2/3, overdrive stars-required, ion-2 price-match test) to new numbers
- [ ] `rear-weapon.test.ts`: update any hardcoded rear-weapon prices
- [ ] Full suite green: `pnpm build:dry`, `pnpm lint`, `pnpm test`
- [ ] Live check: weapon tab at 0 stars/0 coins only shows pulse Lv1-2 purchasable;
      nova requires 32+ stars to even unlock the kind row

## File hygiene

No hardcoded paths/credentials in `items.ts`. No TODOs introduced.

## Checklist

**Design decisions**
- [ ] Design decisions confirmed by user
- [ ] Test plan approved by user

**Guardrails**
- [x] No opt-out guards involved (pure data)
- [x] No throttle/dedup keys involved (pure data)
- [x] Blast radius: every shop price/star gate changes; existing saves keep working
      (prices are read live from `items.ts`, not persisted) — no save migration needed
- [x] No swallowed exceptions (no new logic, just data)

**Performance**
- [x] No loops over external/DB data — plain array literals

**Readability**
- [x] No function changes; same flat-array style as today
- [x] Named constants unaffected — values are the data itself, self-describing via kind name

**Testability**
- [x] Existing tests already cover happy path + edge cases; being updated in place

**File hygiene**
- [x] No hardcoded personal paths/credentials
- [x] No TODOs
- [x] No commented-out code

**CI**
- [ ] `pnpm build:dry` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes with no new failures
