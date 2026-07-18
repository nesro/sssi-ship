← [Design docs index](../../GAME_DESIGN.md) · [← Support Calls](07-support-calls.md)

# Enemies

All enemies have `hp`, `speed`, `shotDamage`, `ticksBetweenShots`, `blocksConveyor`,
`coinReward`, plus `critChance`/`missChance`/`critMult` for damage variance.

| Kind | Character | Notes |
|------|-----------|-------|
| **fodder** | Fast filler, low HP | Basic threat |
| **striker** | Faster than fodder, slight crit | Pressure unit |
| **tank** | High HP, slow | Coin pinata; blocks DPS flow |
| **swarm** | Very fast, very low HP, often misses | Flood threat; needs AoE |
| **blocker** | Pauses the wave timeline while alive | DPS check; killing grants bonus support call |
| **turret** | Stationary, high fire rate | Blocks timeline; tap-to-target it to stop chip damage early instead of waiting for normal front-most rotation |
| **kamikaze** | Fast, primary threat is collision not shots | Shield burst-return mechanic trigger |
| **booster** | Slow, behind other enemies | Continuously feeds its own `regenPerTick` to whichever alive enemy is currently nearest-ahead of it, recomputed every tick — not a fixed spawn-order pairing, since enemies move at independent speeds and can overtake each other (`core/combat.ts`'s `regenerateEnemies`; fixed 2026-07-18, this row previously pointed to a nonexistent cross-reference in "05-shop-and-modules.md's equivalent note in the Combat doc"). If the nearest-ahead enemy is itself another booster, the buff chains rather than two boosters ever double-feeding the same target directly. A damage-buff variant was discussed but never built — only the regen-buff variant is shipped. Tap-to-target it to shut the buff off early. |
| **boss** | Very high HP, blocks timeline | `isBoss: true`; boss-time stars |
| **guardian** | Tutorial only | Some have `regenPerTick`; teaches shield and collision mechanics |

**Damage variance:** each shot rolls — miss (0 damage), crit (`critMult × damage`), or normal.
Visual feedback (✓ implemented): crit = white-tinted bolt, miss = grey/faded bolt, enemy
miss = deflection spark on ship.

**Tap-to-target (2026-07-15).** "Must be prioritized" now has a real mechanism: tap an
enemy in the game field to mark it as the front weapon's priority target (front weapon
only — soft priority, falls back to normal front-most targeting if the mark becomes
invalid). Previously this was aspirational language with no way for the player to act on
it. See [Combat](06-combat.md) for the full mechanic.

---

Next: [Mission Progression](09-mission-progression.md)
