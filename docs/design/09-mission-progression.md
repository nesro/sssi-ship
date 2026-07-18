← [Design docs index](../../GAME_DESIGN.md) · [← Enemies](08-enemies.md)

# Mission Progression

## Galaxy map

Missions are shown as nodes on a **galaxy map** — a star-backdrop screen with named nodes
connected by lines. Tapping a node opens a mission detail panel (name, description, star
benchmarks, completion status). Completed nodes show earned stars. Locked nodes are dimmed.

Current node layout (positions in `viewmodel/hub.ts`'s `GALAXY_NODES`, corrected
2026-07-18 — this doc previously attributed them to `HubScene.ts`, which only renders
what the viewmodel computes):

```
        [t1]
           [t2]
        [t3]
              [t4]
                    [m1]  [m3]
                       [m2]  [m3b]     [Daily]
                          [m4]     [m6]
                             [m5]
```

**Daily** sits deliberately off to the side with no connecting line — it has no
`MISSION_UNLOCK_EDGES` entry, so it isn't part of the campaign's unlock graph (see
Daily Mission below). Locked/dimmed until `m1` is completed (2026-07-18, B2 of
`docs/plans/fable-review-fixes-2026-07-18.md`) — on a fresh save it had been the
brightest, most salient node on the whole map, more prominent than `t1` itself.

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

**Corrected 2026-07-18:** m1's real unlock source is `t1` (`MISSION_UNLOCK_EDGES`), not
`w0` — `w0` has zero unlock edges at all (it's currently unreachable, see
`docs/known-issues.md`'s `w0`/`firstBranchChoice` entry) and was never actually wired
into this table's "unlocks after" chain. Also adds `m3b` (added 2026-07-15,
`fable-fun-review-followup.md` Item 7), which sits between m3 and m4 in the real unlock
graph — m4 now unlocks after m3b, not m3 directly.

| ID | Name | Unlocks after | Introduces |
|----|------|--------------|------------|
| m1 | First Contact | t1 | Fodder → striker final push |
| m2 | Picket Line | m1 | Strikers, 1 blocker, tank final push |
| m3 | The Wall | m2 | Dense fodder walls, 3 blockers |
| m3b | Supply Column | m3 | Booster — cut the source, or grind through double HP |
| m4 | Blockade | m3b | Blocker gauntlet |
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

Stars pay a **coin bonus on first earn**. **Corrected 2026-07-18** (found alongside the
same wording error in `02-glossary.md`/`03-principles.md`/`05-shop-and-modules.md`/
`10-economy.md`, all fixed the same day — see those docs' own changelog lines): stars
are an **earned-total threshold gate**, not a spendable currency — some high-tier shop
items require having earned N stars lifetime, but nothing ever spends or refunds a star
(`SaveManager.ts`'s purchase paths touch coins only). Stars never decrease.

## Daily Mission

**One attempt per day, own gear, endless.** A separate galaxy-map node (deliberately off to
the side, no connecting line — it isn't part of the campaign's unlock graph) that generates a
fresh, escalating mission every calendar day, seeded from the date so every player sees the
same "today." Uses whatever the player currently has equipped — a stronger loadout survives
longer and clears more of the escalation, by design (see [Coins & Economy](10-economy.md)).

**Score, not clear.** The mission always ends in defeat — the goal is banking as many coins as
possible before the ship falls, not finishing. No stars are awarded; a personal best (raw run
score) is tracked and flagged with **NEW BEST!** on the result screen. Abandoning mid-run still
banks whatever was earned and ends the day's attempt (the same "one shot" contract as dying)
— there is no way to abandon for a free reroll.

**Structurally an ordinary mission.** Escalation is two-layered: gentle, ever-flowing waves for
pressure, plus a periodic gate enemy (`blocksConveyor`) whose HP grows steeply — since a
blocking enemy freezes the mission timeline outright, a gate's real-time cost is
`HP ÷ weapon DPS`, independent of motor speed. This is what makes "stronger gear survives
longer and earns more" hold in practice rather than motor tier alone deciding the outcome (an
inversion found and fixed via `pnpm sim -- --daily-seed`, see
[Balance & Tuning](13-balance-and-tuning.md)).

---

Next: [Coins & Economy](10-economy.md)
