# Plan: Ship slot

## What this changes and why

Adds a fifth equipment slot — **ship** — to the shop and save data. Each ship has a fixed hull capacity and one unique passive ability that changes playstyle. The passive is the identity of the build; hull is just the survival tradeoff. A new SHIP tab appears first in the shop sidebar. Ship sprites are unique per ship but share identical anchor points for weapon/shield overlay graphics so the combat view never needs to recompute attachment positions.

## Ships (confirmed 2026-06-19)

| ID | Name | Hull | Passive |
|----|------|------|---------|
| `ship-interceptor` | Interceptor | 80 | Enemies have +10% miss chance |
| `ship-tanker` | Tanker | 150 | Collision damage −50% |
| `ship-salvager` | Salvager | 100 | Coins from kills +50% |
| `ship-reactor` | Reactor | 90 | Generator capacity +50% |
| `ship-warship` | Warship | 110 | Player crits deal ×3 instead of ×2 |

Default/starter: `ship-interceptor` (matches current SHIP_MAX_HULL = 80).

## Design decisions confirmed

- Hull-only was too flat. Unique passive per ship (option C) confirmed.
- Starter ship is Interceptor so new-player experience is unchanged.
- Anchor points for weapon/shield overlays must stay at the same canvas coords regardless of ship skin — all ships rendered in a fixed bounding box, sprite centred on the same `SHIP_CENTER_X / SHIP_Y`.
- Can't-afford row: greyed/non-interactive (same as weapon kind switch).
- No ship levels — ships are flat items, switchItem works as-is.
- Shop tab order: SHIP first, then WEAPON / SHIELD / GENERATOR / MOTOR / SUPPLIES.

## Files to change

| File | Change |
|------|--------|
| `src/core/types.ts` | Add `ShipSpec`, `ShipPassiveKind`, extend `LoadoutSnapshot` with `ship: ShipSpec`, extend `EffectiveStats` with `shipPassive` |
| `src/core/constants.ts` | Remove `SHIP_MAX_HULL` constant (hull now comes from ShipSpec) |
| `src/core/state.ts` | Init `ship.hull` and `ship.maxHull` from `loadout.ship.hull` |
| `src/core/stats.ts` | Pass `shipPassive` through `EffectiveStats`; apply reactor +50% generator capacity |
| `src/core/combat.ts` | Apply ship enemy-miss offset in `rollShotOutcome`; apply warship critMult override |
| `src/core/conveyor.ts` | Apply tanker 50% collision damage reduction |
| `src/core/timeline.ts` | Apply salvager +50% coin multiplier on enemy death |
| `src/data/items.ts` | Add `SHIPS` record, `shipById`, `defaultShipId` |
| `src/save/SaveManager.ts` | Add `ship` to `SaveData.equipped`; version bump + migration; `buildLoadout` reads ship |
| `src/view/textures.ts` | Add baked textures for all 5 ships (unique silhouettes, same bounding box) |
| `src/view/HubScene.ts` | Add SHIP tab first in `SHOP_TABS`; `buildShipRows()` method |
| `src/view/CombatScene.ts` | Use `loadout.ship.id` to pick ship texture key |
| `src/view/ShopScene.ts` | Add SHIP tab + rows (ShopScene is a standalone scene, kept in sync) |
| `src/core/fixtures.ts` | Add `FIXTURE_SHIP` to all fixture specs |
| `src/save/SaveManager.test.ts` | Add switchItem tests for ship slot |

## Complexity analysis

- O(1) everywhere — ship is one item per loadout, no loops.
- Salvager multiplier: applied once per enemy death, O(enemies killed) total.
- EffectiveStats already computed once per tick and passed down — ship passive fields ride along for free.

## Visual spec (anchor points)

All ship textures are 64×64 logical px, centred at `(SHIP_CENTER_X, SHIP_Y)`. The gun overlay and shield ring are drawn at hardcoded offsets from that centre — they must not change. Ship silhouettes must fit within the 64×64 box.

| Ship | Visual idea |
|------|------------|
| Interceptor | Current triangle ship (baseline) |
| Tanker | Wide, flat, armoured look — two lateral hull plates |
| Salvager | Asymmetric with a claw/arm attachment |
| Reactor | Tall with a large glowing core ring |
| Warship | Aggressive forward-swept wings, larger gun mount |

All drawn via `generateTexture` multi-pass like the current ship, ADD blend, neon palette.

## Test plan

- [x] `switchShip` deducts net cost and equips it
- [x] `buildLoadout` returns correct `ship` spec
- [x] `createCoreState` sets `ship.hull = ship.maxHull = spec.hull`
- [x] Interceptor: enemy shots miss ~10% more (rollShotOutcome with +0.1 offset)
- [x] Tanker: collision damage halved (conveyor.ts)
- [x] Salvager: coin reward +50% on kill (×1.5 multiplier)
- [x] Reactor: generator capacity is spec.capacity × 1.5 in EffectiveStats
- [x] Warship: player crit mult = 3.0 regardless of weapon spec's critMult
- [x] Default save migrates to `equipped.ship = 'ship-interceptor'`
- [ ] Shop row greyed when can't afford (visual — no unit test)

## Checklist

**Design decisions**
- [x] Design decisions confirmed by user (2026-06-19)
- [ ] Test plan approved by user

**Guardrails**
- [ ] Every opt-out guard uses `=== false`, not `!value`
- [ ] No swallowed exceptions
- [ ] Blast radius: if ship spec missing, `buildLoadout` throws with item id context

**Performance**
- [ ] All ship effects O(1) — verified

**File hygiene**
- [ ] Remove `SHIP_MAX_HULL` from constants.ts after migration
