# Plan: Damage Variance + New Enemy Kinds

## What this changes and why

This feature adds a configurable per-shot variance system to the game: each
weapon and enemy spec carries `critChance`, `missChance`, and `critMult`. On
every shot, a single `rng()` call resolves the outcome: miss (0 damage, no
procs), crit (`critMult ×` damage, normal procs), or normal. Collision damage
stays flat. GAMBLER's `shotRandomnessFraction` runs independently afterward.
Two new enemy archetypes (turret and kamikaze) are added as pure data entries
— no new core mechanics required; both use the existing conveyor, shooting, and
collision code.

The design intent is to give experienced players meaningful variance to react
to (supply timing on enemy crits; crit builds with OVERCHARGE) without
introducing unrecoverable swings. All decisions were settled in a design
interview on 2026-06-19 — see `docs/design/damage.md`.

## Design decisions requiring confirmation

All confirmed 2026-06-19. No open questions.

## Files to change

| File | Change |
|------|--------|
| `src/core/types.ts` | Add `critChance`, `missChance`, `critMult` to `WeaponSpec` and `EnemySpec`/`EnemyState`; add `ShotEventKind`, `ShotEvent`, `pendingVisualEvents` to `CoreState` |
| `src/data/items.ts` | Add the three fields to all weapon specs (default: no variance for basic weapons; higher-level weapons may get small crit chances) |
| `src/data/missions.ts` | Add the three fields to all enemy specs; add `TURRET` and `KAMIKAZE` archetypes |
| `src/core/combat.ts` | Apply crit/miss roll per target in `fireShipWeapon`; apply per shot in `fireEnemyWeapons`; populate `pendingVisualEvents`; skip energy-per-hit on miss |
| `src/core/tick.ts` | Clear `state.pendingVisualEvents` at start of each tick |
| `src/view/CombatScene.ts` | Read `pendingVisualEvents` after each tick; set bolt color (crit=yellow, miss=grey, normal=weapon color) |
| `src/view/CombatHud.ts` | Spawn deflection spark on enemy miss event |

## Complexity analysis

- `fireShipWeapon`: +2 `rng()` calls per target. O(T) where T = targets hit per shot ≤ enemies on screen ≤ ~20.
- `fireEnemyWeapons`: +2 `rng()` calls per enemy shot. O(E) where E = enemies on screen.
- No new loops. No paths worse than O(E). Both are already O(E) before this change.

## Implementation detail: visual events

Visual effects (bolt color, deflection spark) require the view to know the
outcome. To preserve the determinism contract (`CoreState` content ≠ hash
input for ephemeral data), `pendingVisualEvents` is cleared at the **start**
of each tick. It is populated by `fireShipWeapon` and `fireEnemyWeapons`
during the tick. The view reads it **after** each tick call. It must NOT be
included in `hashCoreState`.

```typescript
type ShotEventKind = 'player-crit' | 'player-miss' | 'enemy-crit' | 'enemy-miss';

interface ShotEvent {
  kind: ShotEventKind;
  enemyId?: number;  // which enemy was targeted (for player shots)
}

// In CoreState:
pendingVisualEvents: ShotEvent[];
```

## Crit/miss roll logic

```typescript
function rollShotOutcome(
  missChance: number,
  critChance: number,
  critMult: number,
  baseDamage: number,
  rng: () => number,
): { damage: number; wasMiss: boolean; wasCrit: boolean } {
  const r = rng();
  if (r < missChance) return { damage: 0, wasMiss: true, wasCrit: false };
  if (r < missChance + critChance) return { damage: baseDamage * critMult, wasMiss: false, wasCrit: true };
  return { damage: baseDamage, wasMiss: false, wasCrit: false };
}
```

GAMBLER's `applyRandomness()` is called only when `!wasMiss`.

## New enemy archetypes

### TURRET

```typescript
const TURRET: EnemySpec = {
  kind: 'turret',
  hp: 80,          // high — must be sustained-DPS'd down
  speed: 0,        // does not advance
  shotDamage: 6,
  ticksBetweenShots: seconds(0.8),  // fires fast
  blocksConveyor: true,             // pauses timeline
  coinReward: 30,
  critChance: 0.10,
  missChance: 0.05,
  critMult: 2.0,
};
```

### KAMIKAZE

```typescript
const KAMIKAZE: EnemySpec = {
  kind: 'kamikaze',
  hp: 25,
  speed: 2.8,      // fast — reaches the ship quickly
  shotDamage: 12,  // collision = 12 × COLLISION_DAMAGE_MULTIPLIER
  ticksBetweenShots: seconds(2),
  blocksConveyor: false,
  coinReward: 12,
  critChance: 0.0,  // collision damage is flat
  missChance: 0.15, // misses often while rushing
  critMult: 2.0,
};
```

All values are initial estimates. Balance owner (Tomáš) must run `pnpm sim
--sweep` to tune them before shipping.

## Test plan

- [ ] Player weapon crit deals `critMult × baseDamage` to the target
- [ ] Player weapon miss deals 0 damage to the target
- [ ] Miss: `energyPerHit` is NOT added (no on-hit proc)
- [ ] Crit: `energyPerHit` IS added (normal on-hit proc)
- [ ] Crit kill triggers all kill effects (coins, hull-per-kill, etc.)
- [ ] Enemy crit deals `critMult × shotDamage` through shields
- [ ] Enemy miss deals 0 damage — ship state unchanged
- [ ] GAMBLER: `applyRandomness()` is called after a normal hit
- [ ] GAMBLER: `applyRandomness()` is called after a crit
- [ ] GAMBLER: `applyRandomness()` is NOT called after a miss
- [ ] Collision (distance 0) ignores crit/miss — always `shotDamage × COLLISION_DAMAGE_MULTIPLIER`
- [ ] Per-target independence: nova hitting 3 enemies, each has independent roll
- [ ] Determinism: same seed + same actions → identical crit/miss sequence every run
- [ ] `pendingVisualEvents` is cleared at the start of each tick
- [ ] `pendingVisualEvents` is NOT included in `hashCoreState`
- [ ] Turret: `speed: 0` — distance never decreases
- [ ] Turret: `blocksConveyor: true` — timeline pauses while alive
- [ ] Turret: fires at the player every `ticksBetweenShots`
- [ ] Kamikaze: reaches distance 0 within expected ticks given its speed
- [ ] Kamikaze: fires shots while descending
- [ ] All existing tests continue passing

## File hygiene

Checked files for issues to fix:
- `src/core/combat.ts` — no TODO comments, no hardcoded values. Clean.
- `src/data/missions.ts` — no personal paths or credentials. Clean.
- `src/core/types.ts` — clean.

## Checklist

**Design decisions**
- [x] Design decisions confirmed by user

**Guardrails**
- [ ] Crit/miss roll uses single `rng()` call per target (not two separate calls)
- [ ] Miss guard uses `< missChance` not `<= missChance` (consistency with other comparisons)
- [ ] `pendingVisualEvents` excluded from `hashCoreState`
- [ ] No swallowed exceptions in roll logic

**Performance**
- [x] `fireShipWeapon` change is O(T) — T ≤ enemies on screen ≤ ~20
- [x] `fireEnemyWeapons` change is O(E) — same E
- [x] No new loops over all enemies

**Readability**
- [ ] `rollShotOutcome` extracted as a named helper (not inlined)
- [ ] `ShotEvent` / `ShotEventKind` in `types.ts` with clear comments
- [ ] Turret / kamikaze constants at top of `missions.ts` like other archetypes

**Testability**
- [ ] All test plan checkboxes complete and passing
- [ ] Crit/miss tests use a known seed to get deterministic outcomes

**CI**
- [ ] `pnpm build:dry` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes with no new failures
