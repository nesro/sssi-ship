# Progression

## ~1 hour goal

A fresh player should see the credits in roughly 1 hour of play. That means:
- ~20 missions total in the tree
- Each mission ~30–90 seconds of combat
- Some backtracking expected (replay for coins/stars), but never grinding

Tutorial missions (t1–t4) are gated-loadout teaching moments. Main missions
use the player's real loadout. The boss mission closes the arc.

## Mission tree

Missions are unlocked by total star count (`starGate`). Currently defined:

| Mission | Star gate | Notes |
|---------|-----------|-------|
| t1 (Tutorial: Basics) | 0 | Forced loadout, no weapon — teaches conveyor |
| t2 (Tutorial: Weapons) | 0 | Forced loadout with pulse weapon |
| t3 (Tutorial: Shields) | 2 | Teaches shield/generator interplay |
| t4 (Tutorial: Support) | 4 | Teaches card system |
| m1–m4 | 0–8 | Normal missions, escalating difficulty |
| boss | TBD | Final mission |

## Stars

Each mission has 4 benchmarks (`StarSpec`):
- `hull-above 0.5` — finish with >50% hull
- `hull-above 0.9` — finish with >90% hull
- `all-kills` — no enemies reach distance 0 (all killed, none collided)
- `shield-unbroken` — shield never broke during the run

Stars are mission-level achievements (not run-level). Replaying earns coins
but not duplicate stars. Total star count gates the mission tree.

Boss missions use `boss-time` family instead of `hull-above`.

## Tutorial design

Tutorial missions have `forcedLoadout` — the player's save is ignored for
that run. Forced loadouts can gift supply charges. The first support call in
tutorials uses `firstOfferIds` to guarantee a specific card offer (teaching
moment). After completing tutorials, the player keeps any coins earned.

## Balance target

The simulator (`pnpm sim`) is the mission editor. See `HANDOFF_TO_HUMAN.md`
for sweep commands. Balance owner: Tomáš. Do not adjust numbers without
running `--sweep` first.
