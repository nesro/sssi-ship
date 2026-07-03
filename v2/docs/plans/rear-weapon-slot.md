# Rear Weapon Slot

## What this changes and why

Adds a second weapon slot (rear weapon) to the game — an independent AoE weapon that fires
sideways at mid-queue enemies, managed through its own toggle. The rear-weapon shop tab already
exists as a "coming soon" stub in HubScene. This plan wires it end-to-end: 5 weapon types × 5
upgrade levels, new item catalog entries, save model (v6→v7 migration), tick-loop firing logic,
shop UI, and combat HUD toggle.

---

## Design decisions requiring confirmation

### 1. Five rear weapon types — 5 levels each

Each type uses the existing `WeaponSpec` structure. Only the target-selection logic differs from
front weapons: rear weapons pick a **centered slice around `enemies[floor(N/2)]`** instead of
the front-most enemy.

| Kind | Role | Base dmg | Base ticks | Base energy | maxTargets | falloff |
|------|------|----------|------------|-------------|-----------|---------|
| `grenade` | Balanced burst | 12 | 10 | 10 | 3 | 0.80 |
| `flak`    | Anti-swarm spread | 5 | 8 | 12 | 5 | 0.70 |
| `plasma`  | Anti-elite burst | 25 | 14 | 18 | 2 | 0.60 |
| `arc`     | Reliable 2-chain | 15 | 9 | 11 | 2 | 0.85 |
| `cluster` | Max-spread trash clear | 3 | 7 | 11 | 6 | 0.65 |

Level scaling: damage ×1.22/level, ticks ×0.91/level (floor 2), energy ×1.15/level (same formula as front weapons). maxTargets: grenade and cluster each gain +1 at Lv3 and Lv5.

Prices:

| Kind | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|------|-----|-----|-----|-----|-----|
| grenade | 200 | 400 | 800 | 1600 | 3200 |
| flak    | 160 | 320 | 640 | 1280 | 2560 |
| plasma  | 280 | 560 | 1100 | 2200 | 4400 |
| arc     | 220 | 440 | 880 | 1760 | 3520 |
| cluster | 150 | 300 | 600 | 1200 | 2400 |

Star gates (index = level − 1): `[0, 0, 10, 18, 28]` for all types.

No rear weapon is equipped by default (slot starts `null`). All Lv1 have a non-zero price.

**Needs confirmation:** Stat values are tunable — confirm the shape is right.

### 2. Visual approach

Each rear weapon kind needs its own icon texture. The existing `buildGameTextures()` generates
glow textures for front weapons via `generateRearWeaponTextures(scene)` (new function). Each kind
gets a distinct color and shape:

| Kind | Color | Shape hint |
|------|-------|-----------|
| grenade | Amber `0xffaa22` | Round with impact ring |
| flak    | Yellow `0xffee44` | Wide spread burst |
| plasma  | Magenta `0xff44cc` | Plasma blob |
| arc     | Cyan `0x44ffee` | Forked arc |
| cluster | Green `0x44ff88` | Scatter hexagon |

Texture key format: `rear-<kind>-<level>` (e.g. `rear-grenade-2`).

### 3. Save migration v6 → v7

Add `rearWeapon: string | null` to `SaveData.equipped`. Default for new saves and v6 migration: `null`.

### 4. `SystemKind` — add `'rear-weapon'`

`SystemKind` in `items.ts` expands from `'weapon' | 'shield' | 'generator' | 'motor'` to include
`'rear-weapon'`. `CatalogItem` gets a new variant with `system: 'rear-weapon'`. This lets `itemById`
and `switchItem` stay generic rather than requiring a bespoke function.

### 5. `ForcedLoadout` — tutorial missions

Add optional `rearWeaponId?: string | null`. Absent = `null` (tutorials start with no rear weapon).

---

## Complexity analysis

- `fireRearWeapon`: one pass over `enemies` to find mid-index + slice ≤ `maxTargets`: **O(E)**, E ≤ 15 in practice.
- `buildRearWeaponRows`: 5 static rows — O(1).
- `generateRearWeaponTextures`: 5 × 5 = 25 small canvas draws at boot — O(1) per texture, negligible.

---

## Test plan

- [ ] `fireRearWeapon` targets mid-queue enemies, not front-most
- [ ] `fireRearWeapon` skips when `state.rearWeaponEnabled === false`
- [ ] `fireRearWeapon` skips when `loadout.rearWeapon === null`
- [ ] `fireRearWeapon` hits `min(maxTargets, enemies.length)` enemies
- [ ] `fireRearWeapon` drains energy correctly; energy cannot go below 0
- [ ] `toggleRearWeapon` flips `rearWeaponEnabled`; field appears in `hashCoreState`
- [ ] Save migration v6 → v7: `equipped.rearWeapon` defaults to `null`
- [ ] `buildLoadout` with `rearWeapon: null` → `LoadoutSnapshot.rearWeapon === null`
- [ ] `buildLoadout` with `rearWeapon: 'grenade-1'` → correct `WeaponSpec` in snapshot

---

## File changes

| File | Change |
|------|--------|
| `src/core/types.ts` | `LoadoutSnapshot.rearWeapon: WeaponSpec \| null`; `ShipState.rearFireTimer: number`; `CoreState.rearWeaponEnabled: boolean`; `ForcedLoadout.rearWeaponId?: string \| null` |
| `src/core/combat.ts` | Add `fireRearWeapon(state, stats)`, `toggleRearWeapon(state)` |
| `src/core/stats.ts` | Add `rearWeaponEquipped`, `rearWeaponDamage`, `rearWeaponInterval`, `rearWeaponEnergyPerShot`, `rearWeaponMaxTargets` to `EffectiveStats`; expand `computeEffectiveStats` |
| `src/core/tick.ts` | Call `fireRearWeapon` after `fireShipWeapon`; update import |
| `src/core/state.ts` | Init `rearWeaponEnabled: true`, `ship.rearFireTimer` from stats |
| `src/core/replay.ts` | Add `rearWeaponEnabled` to `hashCoreState` snapshot |
| `src/data/items.ts` | Add `RearWeaponKind`, `REAR_WEAPON_ITEMS`, `rearWeaponSpecById()`, extend `SystemKind` and `CatalogItem` |
| `src/data/loadouts.ts` | Add `rearWeapon: null` to `STARTER_LOADOUT`; handle in `resolveForcedLoadout` |
| `src/save/SaveManager.ts` | v6→v7 migration; `equipped.rearWeapon`; extend `buildLoadout`; new `switchRearWeapon()` |
| `src/view/textures.ts` | Add `generateRearWeaponTextures(scene)` called from `buildGameTextures` |
| `src/view/CombatScene.ts` | Add rear weapon toggle button; update `updateAbilityBar()` |
| `src/view/HubScene.ts` | Replace `buildComingSoon()` with `buildRearWeaponRows()` + actions; extend `prospectiveItemLoadout` |

---

## File hygiene

No hardcoded paths, credentials, or TODO/FIXME in touched files.

---

## Checklist

**Design decisions**
- [ ] Design decisions confirmed by user
- [ ] Test plan approved by user

**Guardrails**
- [ ] `fireRearWeapon` guard: `rearWeaponEnabled && stats.rearWeaponEquipped` before any state mutation
- [ ] Blast-radius: if `fireRearWeapon` throws mid-tick, the mission crashes — guard must be exhaustive
- [ ] No swallowed exceptions

**Performance**
- [ ] `fireRearWeapon` is O(E), E ≤ 15 — acceptable

**Readability**
- [ ] No function exceeds 100 lines or 5 positional parameters

**Testability**
- [ ] All 9 test cases listed above

**CI**
- [ ] `pnpm build:dry` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes with no new failures
