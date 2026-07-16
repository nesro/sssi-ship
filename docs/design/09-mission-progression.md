← [Design docs index](../../GAME_DESIGN.md) · [← Enemies](08-enemies.md)

# Mission Progression

## Galaxy map

Missions are shown as nodes on a **galaxy map** — a star-backdrop screen with named nodes
connected by lines. Tapping a node opens a mission detail panel (name, description, star
benchmarks, completion status). Completed nodes show earned stars. Locked nodes are dimmed.

Current node layout (implemented in `HubScene.ts`):

```
        [t1]
           [t2]
        [t3]
              [t4]
                    [m1]  [m3]
                       [m2]
                          [m4]  [m6]
                             [m5]
```

## Unlock model

**Completing a mission unlocks the next.** Stars are never required to progress — a player
who barely clears a mission still moves forward. Stars are optional benchmarks.

**Shop items are gated by mission completion**, not stars. Higher-tier modules become available
as the player progresses. Exact mapping of mission → unlocked items: TBD during balance.

## Welcome mission

`w0` Calibration Run — forced loadout, no stars. Introduces the conveyor and brownout mechanic
via narrator bar. Branches to tutorials or straight to sector.

## Tutorial missions

**Forced loadouts** — player's own gear is ignored. The tutorial provides exactly the modules
needed to teach the mechanic. Coins earned are kept.

**Live-seeded, not fixed (corrected 2026-07-14).** Tutorials are seeded the same way as
every other mission — `CombatScene.ts` calls `randomSeed()` unconditionally; no seed
field exists on `MissionSpec`. An earlier version of this doc claimed tutorials use a
hardcoded RNG seed and play identically every time; that was never implemented. Whether
to actually implement fixed seeds, or leave tutorials live-seeded permanently, is an
open design question — see `docs/plans/tutorial-balance-and-doc-cleanup.md`.

**Defeat also completes, for t1-t4 only (`completesOnDefeat`, shipped 2026-07-11).** A
tutorial ending in defeat pays the same completion bonus and unlocks the next mission
exactly as a victory would — a destroyed ship mid-tutorial is a valid teaching moment
(e.g. t1's whole point is "the shield tanks hits for you, but it isn't infinite"), not a
failure state to protect the player from. `w0` is explicitly excluded — it still
requires a real victory. Implemented in `src/core/types.ts`'s `MissionSpec.completesOnDefeat`,
wired through `src/core/result.ts`'s `buildMissionResult` and
`src/save/SaveManager.ts`'s `markCompleted`.

| ID | Name | Forced loadout | Teaches |
|----|------|----------------|---------|
| t1 | Shield Basics | none | Collision burst-return; shield is a weapon |
| t2 | Weapon Systems | pulse-1 | Energy brownout; support cards fix DPS |
| t3 | Support Cards | pulse-1 | Scripted first offer; unkillable regen guardian |
| t4 | Battle Supplies | pulse-1 + gifted supplies | Reserve supply usage |

## Main missions

| ID | Name | Unlocks after | Introduces |
|----|------|--------------|------------|
| m1 | First Contact | w0 | Fodder → striker final push |
| m2 | Picket Line | m1 | Strikers, 1 blocker, tank final push |
| m3 | The Wall | m2 | Dense fodder walls, 3 blockers |
| m4 | Blockade | m3 | Blocker gauntlet |
| m5 | Asteroid Run | m4 | Swarm floods |
| m6 | Leviathan | m5 | Full mix: turrets, kamikazes, boss |

## Stars

Each main mission has 8 earnable stars:

1–4. Finish within time thresholds T1/T2/T3/T4 (faster = higher tier)
5. Finish with > 50% hull remaining
6. Finish with > 90% hull remaining
7. No enemy reached distance 0 (all-kills)
8. Shield never broke

m6 uses 4 boss-time thresholds instead of finish-time, plus hull-above and all-kills (6 total).

Stars pay a **coin bonus on first earn**. Stars are also a **secondary currency** — some
high-tier shop items cost stars in addition to coins. Selling those items always returns the
full star cost. Stars never decrease.

---

Next: [Coins & Economy](10-economy.md)
