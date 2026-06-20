# Enemies

## Shared enemy fields

All enemies share: `hp`, `speed` (distance/tick), `shotDamage`,
`ticksBetweenShots`, `blocksConveyor`, `coinReward`, optional `isBoss`,
optional `regenPerTick`.

Damage variance fields (coming with the variance feature):
`critChance`, `missChance`, `critMult` — see [damage.md](damage.md).

## Current archetypes (in missions.ts)

| Kind | HP | Speed | Shot | Fires | Blocks | Coins | Notes |
|------|----|-------|------|-------|--------|-------|-------|
| fodder | 20 | 1.2 | 2 | 2 s | no | 5 | Cheap, fast filler |
| striker | 35 | 1.6 | 3 | 1.5 s | no | 8 | Faster fodder |
| tank | 90 | 0.6 | 5 | 2 s | no | 15 | High HP, slow |
| swarm | 8 | 2.4 | 1 | 1 s | no | 3 | Fragile, very fast |
| blocker | 140 | 0.5 | 4 | 1.5 s | **yes** | 25 | DPS check, pauses timeline |
| boss | 700 | 0.25 | 8 | 1 s | **yes** | 100 | `isBoss: true`, boss-time star |
| guardian | varies | slow | varies | varies | no | — | Tutorial only; has `regenPerTick` |

## Planned: turret (not yet implemented)

A stationary emplacement that holds position and shoots the player.

| Field | Value |
|-------|-------|
| speed | 0 |
| blocksConveyor | **true** |
| hp | high (TBD by balance) |
| shotDamage | medium (TBD) |
| ticksBetweenShots | fast (TBD) |

Key mechanic: `speed: 0` means the turret never moves — the conveyor still
stops because `blocksConveyor: true`. The timeline is frozen until it's
destroyed. Pairs well with DEMOLISHER card.

## Planned: kamikaze (not yet implemented)

A fast enemy that does enormous collision damage.

| Field | Value |
|-------|-------|
| speed | high (TBD) |
| blocksConveyor | false |
| shotDamage | high (collision = `shotDamage × COLLISION_DAMAGE_MULTIPLIER`) |
| hp | low-medium |

Key mechanic: primary threat is reaching distance 0. The shield burst-return
on collision damage (if shield absorbs any) can chain-damage other enemies —
valuable synergy with GLASS CANNON or high-shield builds.

## Collision damage note

Collision damage routes shield-first (see `conveyor.ts`). The shield absorbs
first; remainder hits hull. `SHIELD_BURST_RETURN` fraction of absorbed damage
bounces to surviving enemies.

## Enemy visual conventions

All enemies use `ADD` blend mode over a near-black background. Colour by role:
- Standard enemies: red/orange (`PALETTE.enemyRed`, `PALETTE.enemyOrange`)
- Boss: distinct bright variant
- Future: turret might use grey/dark tone; kamikaze a hot magenta
