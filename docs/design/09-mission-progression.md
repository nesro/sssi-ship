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

**A single forced chain, no shortcuts (2026-07-20).** t1→t2→t3→t4→m1→…→m6 — every
tutorial must be completed before act1 opens. There used to be a `t1→m1` shortcut edge
plus a "skip tutorials" link on the galaxy screen; both are gone. Every mission also
carries a `campaign: 'tutorial' | 'act1'` tag (`MissionSpec.campaign`) — t1-t4 are
'tutorial', m1-m6 are 'act1' — rendered as section labels on the galaxy map. `w0` and
the daily mission are outside both groupings (`campaign` left `undefined`).

**Shop items are gated by mission completion**, not stars. Higher-tier modules become available
as the player progresses. Exact mapping of mission → unlocked items: TBD during balance.

## Welcome mission

`w0` Calibration Run — forced loadout, no stars. Introduces the conveyor and brownout
mechanic via narrator bar. Unreachable in the current build (no launcher, no unlock
edge — see `docs/known-issues.md`); its own TUTORIAL/EXPLORE branch-choice screen was
removed along with the tutorial-skip mechanism (2026-07-20), since there is no longer
any branch to choose between.

## Tutorial missions

**The full first-playthrough narrative — what a new player actually sees and does,
beat by beat across all four tutorials — lives in [New Player
Experience](15-new-player-experience.md).** This section stays the terse reference
table; read that doc for the story.

**Forced loadouts, only for t3/t4** — t1 and t2 run on the player's own real, equipped
gear instead (see each mission's own row below); t3/t4 still replace it entirely with
exactly the modules needed to teach their mechanic. Coins earned are kept regardless.

**Live-seeded, not fixed (corrected 2026-07-14).** Tutorials are seeded the same way as
every other mission — `CombatScene.ts` calls `randomSeed()` unconditionally; no seed
field exists on `MissionSpec`. An earlier version of this doc claimed tutorials use a
hardcoded RNG seed and play identically every time; that was never implemented. Whether
to actually implement fixed seeds, or leave tutorials live-seeded permanently, is an
open design question — see `docs/plans/tutorial-balance-and-doc-cleanup.md`.

**Defeat also completes, but only for the one tutorial with no decision to hold the
player accountable for (`completesOnDefeat`, shipped 2026-07-11, split by decision
2026-07-20, t1 moved to the "no" side 2026-07-20/21).** Only t4 (use the preloaded
supplies or don't, a spectrum rather than a right/wrong pick) completes on defeat — a
destroyed ship there is a valid teaching moment, not a failure state to protect the
player from. t1, t2, and t3 do NOT — each now presents a real decision or a real
gear-vs-wave mismatch (t1: does the equipped generator keep the shield charged; t2: does
the equipped weapon break the wall; t3: pick the support card that solves the mission),
and a "tutorial" with no way to fail teaches nothing — a wrong starting point or pick
there is a genuine, intended failure requiring a retry, same as any main mission. `w0`
is separately excluded — it still requires a real victory. Implemented in
`src/core/types.ts`'s `MissionSpec.completesOnDefeat`, wired through
`src/core/result.ts`'s `buildMissionResult` and `src/save/SaveManager.ts`'s
`markCompleted`.

| ID | Name | Forced loadout | Teaches | Completes on defeat |
|----|------|----------------|---------|----------------------|
| t1 | Shield Basics | none (real gear, weapon stripped) | The shield only recharges as fast as the generator refills — a mismatched generator kind loses to the wave; the shop's free same-level kind switch is the fix | no |
| t2 | Weapon Systems | none (real gear) | Energy brownout; a dense wall beats single-target fire — the shop's free same-level kind switch is the fix | no |
| t3 | Support Cards | pulse-1 | Scripted first offer; the regen guardian is genuinely unkillable without the right card | no |
| t4 | Battle Supplies | pulse-1 + gifted supplies | Reserve supply usage | yes |

**t1 and t2 are both fail-first by design, via real gear rather than a forced preset**
(t1: 2026-07-20/21; t2: 2026-07-20). Neither uses `forcedLoadout` — each runs on the
player's real, equipped gear, which under the forced chain above is always exactly the
starter loadout on a first attempt (t1 has no earlier mission to shop from; t2 follows
t1, whose 30-coin reward can't afford any tier change). Each mission's own wave is tuned
to lose against the real starter default and win after one specific same-level kind
switch — see [New Player Experience](15-new-player-experience.md) for the exact
clear-rate/margin numbers and `docs/known-issues.md` for the full tuning history
(including t2's one known caveat: a player who buys a cheap rear weapon before ever
attempting t2 can trivialize the wall on real gear alone). Both defeat screens skip the
usual RETRY/MISSIONS/SHOP button row and hard-navigate straight to the shop instead
(`MissionSpec.defeatHint`, `ResultViewModel.buttons.kind === 'defeat-shop-redirect'`).

**Retry narration.** t1/t2/t3 each show a shorter, retry-aware narrator script on any
attempt after a real defeat (`SaveData.t1FailedOnce`/`t2FailedOnce`/`t3FailedOnce`,
`narratorEventsForAttempt` in `src/data/missions.ts`) — acknowledging the previous
attempt instead of repeating the full first-time introduction.

## Main missions

m1's unlock source is `t4` (`MISSION_UNLOCK_EDGES`) — the last step of the forced
tutorial chain above, not `t1` or `w0`. `w0` has zero unlock edges at all (it's
currently unreachable, see `docs/known-issues.md`'s `w0` entry). Also note `m3b`, which
sits between m3 and m4 in the real unlock graph — m4 unlocks after m3b, not m3 directly.

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
Motor is the one exception: it's neutralized to the equipped kind's Lv1 spec for this
mission only (`neutralizeMotorForDaily`, see below), so motor tier is inert here rather than
part of "stronger gear does better."

**Score, not clear.** The mission always ends in defeat — the goal is banking as many coins as
possible before the ship falls, not finishing. No stars are awarded; a personal best (raw run
score) is tracked and flagged with **NEW BEST!** on the result screen. Abandoning mid-run still
banks whatever was earned and ends the day's attempt (the same "one shot" contract as dying)
— there is no way to abandon for a free reroll.

**Structurally an ordinary mission.** Escalation is two-layered: gentle, ever-flowing waves for
pressure, plus a periodic gate enemy (`blocksConveyor`) whose HP grows steeply — since a
blocking enemy freezes the mission timeline outright, a gate's real-time cost is
`HP ÷ weapon DPS`, independent of motor speed. Even so, a faster motor still compresses the
flowing-wave schedule between gates into less real time — measured via `pnpm sim --
daily-seed` to be a real, large inversion (a slower motor scoring higher), not a small
residual (see [Balance & Tuning](13-balance-and-tuning.md)). Rather than change wave timing
itself, the daily neutralizes motor tier to the equipped kind's Lv1 spec, so motor investment
is inert here instead of counterproductive — weapon/shield/generator remain the levers that
make "stronger gear survives longer and earns more" hold.

---

Next: [Coins & Economy](10-economy.md)
