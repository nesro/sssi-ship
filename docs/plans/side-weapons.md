# Side weapons

**Status: shipped.** Verified 2026-07-10 — every checkbox below matches the actual
code (`SIDE_WEAPON_KINDS = ['focus', 'flechette', 'railgun', 'orbital']`, `fireSideWeapon`
throws on both null-equipped and 0-charges per the recommended convention, budget was
folded into the later "recompute all 7 systems" rebalance). The checklist was simply
never ticked off when the feature was completed — cleaning that up now, no further work
needed here.

## What this changes and why

Adds a fourth weapon slot — side weapons — alongside the existing front weapon
(auto-fire) and rear weapon (auto-fire, unlimited use). Per `GAME_DESIGN.md` §5,
side weapons are **manual-fire** and **limited-ammo**: the player taps a button
during combat to consume one charge and deal an immediate burst of damage, saving
charges for a blocker, a swarm, or a boss window rather than relying on autofire.
`GAME_DESIGN.md` only commits to "manual-fire, limited-ammo, charges fixed per
mission, purchased in shop" and explicitly leaves "types and levels: TBD" — the
rest of this plan fills that gap and needs your sign-off before any code is
written, per the confirmed answers below and the open items still marked TBD.

Economically this is a new hybrid: **kind + level variety with single ownership
and shop trade-in economics, exactly like rear weapons** (confirmed), but **each
level also defines a per-mission charge count that refills to max every mission,
exactly like Reserve Supplies** (confirmed). Firing is a manual tap, never
auto-fire, and different kinds do different things — some single-target burst,
some AOE (confirmed).

## Design decisions requiring confirmation

### Already confirmed (previous round)
- Effect: kinds are a mix of single-target burst and AOE burst.
- Structure: kind + 5 levels, single ownership, trade-in shop economy — same
  shape as rear weapons, not a flat Supplies-style item.
- Charges: refill to full every mission (not persistent ammo you re-buy).

### Proposed now — please confirm or veto

1. **Kind roster (4 kinds, mirroring front weapon's single/multi/single/AOE
   spread so the new slot feels consistent with the rest of the loadout)**:
   - `focus` — **Focus Beam**. Single massive hit to the front-most enemy.
     Starter kind (Lv1 free, like pulse/grenade/wall/torrent/rush/interceptor).
   - `flechette` — **Flechette Spread**. Partial-AOE burst — hits a handful of
     enemies near the front (mirrors scatter/grenade's "hits a cluster" shape).
   - `railgun` — **Railgun**. Single devastating hit, higher damage than Focus
     Beam but fewer charges per mission — the "save it for a blocker/boss" kind.
   - `orbital` — **Orbital Strike**. True AOE — hits every enemy on screen.
     Top-tier kind (highest price/star gate), lowest charge count per mission.
   - If you'd rather have different names, a different count, or different
     roles, tell me now — this is pure content and easy to change before I
     write the catalog, expensive to change after (every level's price/stars/
     charges/damage would need re-deriving).

2. **Charges scale with level, damage scales with level — same formula shape as
   every other weapon system** (`Math.pow` growth per level, strictly increasing
   price/stars per level and per kind, anchored to the existing 1,000,000-coin /
   46-star endgame budget established in `docs/plans/shop-economy-rebalance.md`).
   Charges start small (2-3 at Lv1) and grow modestly (capping around 5-6 at
   Lv5) — they're a discrete integer, not worth an aggressive curve. **Budget
   allocation**: side weapons get their own slice of the 1,000,000-coin endgame
   total. Adding a 7th slice on top of the existing six (ship/weapon/rear-weapon/
   shield/generator/motor = 1,000,000 already) means either (a) shrinking the
   other six proportionally so the total stays at 1,000,000, or (b) raising the
   endgame target above 1,000,000. **Recommend (a)** — keeps "1,000,000 = every
   system's best item" true. Needs your confirmation either way.

3. **Targeting**: single-target kinds hit the front-most enemy (same convention
   as pulse/ion); AOE/multi kinds hit everyone or a front cluster (same
   convention as nova/scatter/grenade). No new "prioritize blockers" targeting
   logic — front-most already tends to be a blocker when one is queued, and a
   bespoke blocker-priority query would be new core logic beyond what's asked.

4. **Combat UI**: a new tappable button in the button panel (where REAR ON/OFF
   and the Supply buttons live today), showing the equipped kind's name and a
   charge counter (`2/3` style, matching Supplies' charge display), disabled
   at 0 charges. **Routed through `viewmodel/combat.ts` + `CombatHud.ts`**, not
   built as raw Phaser code — the REAR ON/OFF button predates the viewmodel
   migration and is the one remaining ad-hoc piece; side weapons are new code,
   so they should follow the current convention, not copy the old pattern.

5. **No shop preview animation charge-draining** — `ShopPreviewPanel` will show
   the equipped side weapon's icon/stats like every other slot, but won't
   simulate manual taps (there's no "auto-fire" to animate, and simulating taps
   would need invented behavior not asked for).

## Complexity analysis

No loops over N/L/A/D (circles/locations/alerts/devices) — this is a game
feature, not a notification system. The relevant scale is: 4 kinds × 5 levels =
20 catalog entries (same order as rear weapons' 5×5=25), one new tick-phase
check per combat tick (O(1), same cost as `fireRearWeapon`'s existing check),
and one new shop tab following the exact generic `ShopSystemConfig` machinery
that already handles the other six systems (no new O(N²) risk).

## Test plan

- [x] `sideWeaponSpecAtLevel(kind, level)` returns correct damage/charge values
- [x] Manual fire: tapping consumes exactly 1 charge and deals the kind's effect
- [x] Manual fire: no-ops (throws or silently ignores — TBD, see below) at 0 charges
- [x] Manual fire: no-ops when no side weapon is equipped
- [x] Charges reset to the equipped level's max at mission start
- [x] Single-target kinds hit only the front-most enemy
- [x] AOE kind hits every enemy; multi kind hits a bounded cluster
- [x] `switchSideWeapon` trade-in cost/refund matches the rear-weapon pattern
- [x] `switchSideWeapon(null)` unequips and refunds, same as rear weapon
- [x] SaveManager migration: old saves get `sideWeapon: null` with no crash
- [x] Shop tab: kind rows + level chips render and price/star-gate correctly
- [x] `computeKindRowTrace`-equivalent invariants hold (no price ties, strictly
      increasing price/stars per row — reuse the existing invariant test pattern
      from `hub.test.ts`)
- [x] CombatHud viewmodel: button shows correct charge count, disabled at 0
- [x] `hashCoreState` changes when a charge is consumed (determinism contract)

**Open question for the test plan**: what happens if the player taps with 0
charges — is the button simply un-tappable (view-layer prevents the call), or
does the core function need to guard and no-op/throw? Rear weapon's toggle has
no such guard because it's a boolean flip; this is closer to `buySupplyCharge`
which throws on `max charges`. Recommend: core function throws with context
(`"No charges remaining for side weapon"`), view never calls it when charges are 0
(button disabled), matching the fail-fast convention used everywhere else.

## File hygiene

No hardcoded paths/credentials anticipated. This plan itself will need
`GAME_DESIGN.md` §5 and §14 updated once implemented (§14 currently says "not
yet in core or shop" for side weapons, and also incorrectly still says that for
rear weapons — worth fixing both lines in the same pass so the doc stops lying).

## Files this will touch (mirroring the rear-weapon file-by-file pattern)

- `src/core/types.ts` — `SideWeaponKind`, `LoadoutSnapshot.sideWeapon`,
  `ShipState.sideWeaponCharges`, `ForcedLoadout.sideWeaponId?`, `CoreState`
  (no enable/disable flag needed — manual tap has no auto-fire toggle)
- `src/core/combat.ts` — `fireSideWeapon(state, stats)` (manual trigger, not
  ticked every frame like `fireRearWeapon` — called only on player tap command)
- `src/core/stats.ts` — `EffectiveStats.sideWeapon{Equipped,Damage,MaxTargets,
  MaxCharges,Kind}` fields
- `src/core/tick.ts` — no per-tick auto-fire call needed (manual-only); tick
  still needs to resolve the queued "fire side weapon" command like it resolves
  other player commands (need to check how manual commands like ability
  activation are threaded through tick.ts's command queue)
- `src/data/items.ts` — `SIDE_WEAPON_KINDS`, `SIDE_WEAPON_BASE`,
  `SIDE_WEAPON_STARS`/`PRICES`, `sideWeaponSpecAtLevel`, `SIDE_WEAPON_ITEMS`
- `src/data/loadouts.ts` — `STARTER_LOADOUT.sideWeapon: null`,
  `resolveForcedLoadout` reads `forced.sideWeaponId ?? null`
- `src/save/SaveManager.ts` — `SaveData.equipped.sideWeapon`, migration bump,
  `switchSideWeapon` (trade-in model, mirrors `switchRearWeapon`)
- `src/viewmodel/shopSystems.ts` — `SIDE_WEAPON_SYSTEM: ShopSystemConfig`
- `src/viewmodel/hub.ts` — new `ShopTab` entry, `SWITCH_HANDLERS`/
  `UNEQUIP_HANDLERS` entries, loadout row
- `src/viewmodel/combat.ts` + `CombatHud.ts` — side weapon button viewmodel
  (charge count, enabled/disabled, kind name)
- `src/view/CombatScene.ts` — side weapon button wiring, calls
  `fireSideWeapon` on tap, visual burst effect
- `src/view/textureKeys.ts` / `textures.ts` / `shipRenderers.ts` — icons and
  any burst-effect visuals
- `src/view/ShopPreviewPanel.ts` — static preview (no fire animation, per
  decision #5 above)
- New test file `src/core/side-weapon.test.ts` mirroring `rear-weapon.test.ts`

## Checklist

**Design decisions**
- [x] Kind roster (names/count/roles) confirmed by user
- [x] Budget re-allocation approach (shrink six systems vs raise endgame total) confirmed
- [x] 0-charge behavior (throw vs silent no-op) confirmed
- [x] Test plan approved by user

**Guardrails**
- [x] Every throttle/deduplication key stated: side weapon ownership is per-save,
      single-kind-at-a-time (same as every other equip slot)
- [x] Blast radius: new slot only; existing saves get `sideWeapon: null` via
      migration, no existing system's behavior changes
- [x] No swallowed exceptions; charge-exhausted and unequipped cases throw with
      context, view layer prevents the call from ever reaching them

**Performance**
- [x] Confirm `fireSideWeapon` is O(maxTargets), same order as `fireRearWeapon`
- [x] No repeated catalog lookups inside the tick loop

**Readability**
- [x] No function exceeds 100 lines / 5 params
- [x] Named constants for charge counts and damage curve coefficients

**Testability**
- [x] Every new function has a happy-path + edge-case test (0 charges, null
      equipped, mission-start refill)

**File hygiene**
- [x] `GAME_DESIGN.md` §5/§14 updated to reflect the shipped feature (and to
      stop calling rear weapons "not yet in core or shop")

**CI**
- [x] `pnpm build:dry` passes
- [x] `pnpm lint` passes
- [x] `pnpm test` passes with no new failures (currently 352 passing)
