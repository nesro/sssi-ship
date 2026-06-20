# Damage Variance System

Status: **designed, not yet implemented** — see `../plans/damage-variance-enemies.md`.

## Current state (deterministic)

All weapon shots deal exact damage. The only randomness is GAMBLER's
`shotRandomnessFraction` (`±N` multiplier via `applyRandomness()` in
`combat.ts`).

## New system: crit / miss per spec

Both `WeaponSpec` and `EnemySpec` get three new fields:

```typescript
critChance: number;  // 0–1 probability of a critical hit
missChance: number;  // 0–1 probability of a complete miss
critMult: number;    // damage multiplier on a crit (e.g. 2.0)
```

The roll happens **per target** inside the `targets.forEach` loop in
`fireShipWeapon`, and **per shot** in `fireEnemyWeapons`. One `rng()` call
determines the outcome:

```
r = rng()
if r < missChance → miss (0 damage, no on-hit procs)
else if r < missChance + critChance → crit (critMult × damage)
else → normal
```

## Decision log (all confirmed 2026-06-19)

| Decision | Choice made |
|----------|-------------|
| Where do critChance/missChance live? | Per spec (`WeaponSpec` + `EnemySpec`) — not per card |
| Is critMult configurable per spec? | Yes — configurable, not fixed |
| Miss behavior | 0 damage, bolt still fires visually (grey) |
| Symmetric crit/miss for enemies? | Yes — enemies can crit and miss too |
| On-hit effects on miss? | None (miss = no procs, no `energyPerHit`) |
| On-hit effects on crit? | Normal procs — no extra procs on crit |
| Kill effects on crit kill? | Yes — crit kills trigger all normal kill effects |
| Collision damage: crit/miss? | Flat — no variance |
| GAMBLER card interaction | Independent — `applyRandomness()` runs after crit/miss, only if not a miss |
| Visual feedback | Bolt color only (no floating numbers): normal=weapon color, crit=yellow/white, miss=grey |
| Enemy miss visual | Deflection spark on the ship HUD |
| Roll granularity | Per target — nova wave hitting 3 enemies rolls 3 times independently |

## Roll order

For a single target:
1. Roll `rng()` once → miss / crit / normal
2. If not a miss: apply GAMBLER's `applyRandomness()` to the surviving damage
3. Emit visual event (crit / miss) for the view to render

## GAMBLER independence

GAMBLER's `shotRandomnessFraction` applies ±N to the already-resolved damage.
On a crit: GAMBLER might make it slightly less or more than `critMult × base`.
On a miss: GAMBLER does not apply (there is no damage to modify).

## Visual event delivery

The view needs to know about misses and crits to spawn the bolt color and
deflection spark. This will be delivered via a `pendingVisualEvents` array
on `CoreState`, cleared at the start of each tick and populated during combat.
Not included in `hashCoreState`.
