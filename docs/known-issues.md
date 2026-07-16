← [Design docs index](../GAME_DESIGN.md)

# Known Issues & Gaps

A running index of gaps, inconsistencies, and deferred problems discovered while working
in this codebase — **the durable catch-all so nothing found mid-task gets forgotten once
the conversation that found it ends.** `v2/CLAUDE.md` (read every session) points here.

**When you find something** — a flag that shouldn't be there, a doc that's drifted from
the code, a design question with no clear answer, a "this needs its own plan" moment —
add an entry below immediately, even if it's out of scope for what you're doing right
now. Prefer linking to the relevant `docs/plans/*.md` if the issue already has a detailed
writeup there; use this file for the summary + link, not a duplicate of the full analysis.
Move resolved items to the bottom with the date and what fixed them, instead of deleting.

## Open

### `w0` (Calibration Run) is unreachable, and `firstBranchChoice` is a dead field
Found 2026-07-16 while planning `docs/plans/first-open-and-tutorial-tour.md`. `w0` has
no entry in `GALAXY_NODES` (`viewmodel/hub.ts`'s `computeGalaxyMap` silently skips it)
and nothing redirects a fresh save to it — its only intended launcher is the unbuilt
`WelcomeScene` (`docs/design/14-status.md`: "content not written yet," blocked on
Tomáš). Its victory screen still asks a real TUTORIAL/EXPLORE branch question
(`ResultScene.ts:57-76`, `viewmodel/result.ts`'s `'w0-branch'` kind) and persists
`save.firstBranchChoice` — but nothing anywhere ever *reads* that field. Two stale
comments in `SaveManager.ts:42,44` describe behavior that was never implemented:
`w0Completed` "gates the hub from redirecting again" (no such redirect exists) and
`firstBranchChoice` is "used to open the right hub section on first load" (it opens
nothing). Not fixed here — `first-open-and-tutorial-tour.md` builds an independent
`OnboardingScene`/`skipTutorials` path that asks a similar tutorials-or-skip question
without touching `w0`, since `w0`/`WelcomeScene` stay blocked on content. **When
`WelcomeScene` ships and `w0` becomes reachable, reconcile the two** — most likely
retire `w0`'s branch-choice screen (or gate it behind `onboardingSeen` already being
true so a player never sees the same choice twice) rather than keep both live.

### `expert` archetype's campaign pacing-shape score doesn't respond to mission-density tuning
`docs/plans/fable-fun-review-followup.md`'s Item 7 section, "Measured outcome" note.
`expert` always plays its `pnpm tune`-recommended gear, which for any mission whose
difficulty comes from a targeting/single-target-weapon constraint (m3b's booster being
the first example) will tend to converge on whichever weapon kind trivially counters that
constraint (`nova`, which hits every enemy on screen). This isn't fixable per-mission —
it's a property of the campaign economy's gear-choice model. `average` isn't affected
(stays on its starter kind). No fix attempted; flagged as a structural gap for whoever
next works on campaign pacing.

**Partially investigated 2026-07-15 (see the Reserve generator fix below):** dug into
`pnpm tune`'s "dominant kind" signal, which had been flagging on every mission every run
this whole session and was assumed related. Found two *separate* things tangled
together: (1) the Reserve generator was a genuine trap (fixed, see below) — unrelated to
`expert`'s pacing-shape specifically, since `intendedLoadoutForMission` never uses
Reserve. (2) Even after that fix, 5/7 missions still show 60-100pp weapon-kind spread
(`pnpm tune`'s own full grid: e.g. m3 — ion=100%, pulse=~70-79%, scatter=~49-57%,
nova=~19-21%, *with every generator held at its best*), confirming each mission genuinely
has one dominant weapon kind, which is what lets `expert` "solve" it. This appears to be
the intended "kinds are situational sidegrades" design working as built (each kind has a
real home-mission and a real weak-mission), not a bug — but it's also structurally what
keeps `expert`'s pacing-shape flat. Deliberately not touched further: rebalancing weapon
kinds' per-mission matchups is a much bigger, riskier undertaking (core weapon damage
numbers, verified across 7 missions) than this pass, and touches the game's stated
design philosophy directly — needs a real decision, not a data tweak.

### Manual playtest of m1/m3/m5's reshaped pacing — needs a human, not simulation
`docs/plans/mission-design-and-testing.md`'s "Open item 1." The simulator is structurally
blind to feel; needs a human with a controller. **Needs dev server / Preview, not
actionable headlessly.**

### F6 (minor) — t2/t4 may be one beat too short; §13 tutorial-length table may be stale
`docs/plans/mission-fun-review.md` §F6. Playtest call only, unchanged since 2026-07-11.

## Resolved

### Hub header showed an impossible "63/50" star total — fixed 2026-07-16
Found via Fable's independent screenshot review (see `docs/plans/` session notes) after
the screenshot harness produced its first clean batch. `totalStarsAvailable()`
(`data/missions.ts`) is deliberately scoped to the 7 main missions only (50 stars,
tested invariant) — tutorials (t1-t4, `forcedLoadout` set) never earn `missionStars` in
real play (`applyMissionResult`, `SaveManager.ts`, confirmed by reading the source).
Two dev-only "unlock everything" cheats didn't respect that scoping: `__cheat.unlockAll()`
(`view/main.ts`, itself a fix from earlier the same session) and the in-game Settings →
DEV TOOLS → "UNLOCK ALL STARS" button (`HubScene.ts`) both iterated *all* missions
including tutorials, so a fully-cheated save could rack up 63 recorded stars against a
50-star cap — real players could never actually hit this since normal completion never
touches tutorial `missionStars`, but it was a real, reachable dev-tooling bug (not just a
display quirk) that produced corrupted save state. Fixed both call sites to filter
`mission.forcedLoadout === undefined`, matching `applyMissionResult`'s real behavior.

### CombatScene crashed the WebGL renderer on any mission restart (retry, or two missions in a row) — fixed 2026-07-16
Found while building the Playwright screenshot harness (`v2/tools/screenshot.ts`) — driving
`__cheat.startMission` from an already-active `CombatScene` reliably crashed with
`Cannot read properties of null (reading 'glTexture')` inside `updateAbilityBar()`,
and once it fired the WebGL canvas stopped updating for the rest of the session (every
later screenshot came back byte-identical, frozen on the pre-crash frame). Confirmed this
isn't harness-specific: `ResultScene`'s "play again" button and the hub's "launch mission"
button both call `this.scene.start('CombatScene', ...)` on the same reused scene instance
— exactly the path that crashes. Root cause: `abilitySlots` (`CombatScene.ts`) is a class
field populated by `buildAbilitySlots()`, which **appends** rather than reassigns; every
other per-run collection (`enemySprites`, `cardEntries`, `exitConfirmObjects`, etc.) was
already being reset at the top of `create()`, but `abilitySlots` was missing from that
list. On a scene restart, Phaser's own `DisplayList.shutdown()` calls `.destroy(true)` on
every object from the previous run (confirmed by reading Phaser's source), so the 3 stale
slot entries left in the array pointed at already-destroyed `Text` objects — touched by
`updateAbilityBar()` on the very first frame of the new run. Fixed by extracting all the
per-run resets (now including `abilitySlots`) into a `resetPerRunState()` helper, called
before `buildAbilitySlots()` runs. Verified with a full `pnpm screenshot` batch: no page
exceptions, all 8 captured screenshots now byte-distinct (previously 3 of them were
identical frozen frames). `pnpm test`/`lint`/`build:dry` all still pass (585 tests).

### Reserve generator was a genuine trap kind — fixed 2026-07-15
Long-standing `pnpm tune` "dominant kind" warning (flagged every single run this whole
session, never chased). The 2026-07-11 pass (`docs/plans/overdrive-and-reserve-trap-fixes.md`,
now folded into this doc) only rewrote Reserve's *blurb* to stop recommending the
worst pairing; the underlying stats were never touched. Full weapon×generator grid
(400 runs/cell) confirmed a real trap, not situational flavor: pulse+Reserve cleared m1
at 13% vs. 87-100% for every other generator; scatter+Reserve cleared m3 at 0.0%.
Fixed by raising Reserve's `outputs` +30% at every level (`GENERATOR_BASE.reserve` in
`items.ts`) — caps/drains (the "vast tank, slow trickle" identity) left untouched.
Result: m1 pulse+Reserve 13%→73%, m5 scatter+Reserve 13%→87.8%. `pnpm tune`'s
dominant-kind flag cleared for m1 (87.0pp→27.0pp) and m2 (60.25pp→21.0pp) — the two
missions where Reserve was the primary driver.

Confirmed zero-impact on the `intended`-loadout gate (`INTENDED_LOADOUT_LEVELS` always
uses `torrent`, index 0, never Reserve) — `pnpm balance`'s intended/greedy numbers are
byte-identical, and it's the first time this whole effort that `pnpm balance` exits with
**zero flags total** (was already down to just `m1-shield`, now fixed too, see below).
`pnpm campaign` stays 100%/100%, pacing-shape unchanged (Reserve still isn't
competitive enough to be recommended anywhere — confirmed via `recommendedKinds.generated.ts`).

5/7 missions still show a dominant-kind signal on `pnpm tune` — that's a *separate*,
much deeper finding (weapon-kind-vs-mission situational strength, not a generator issue)
— see the Open item above.

### `pnpm balance`'s `m1-shield` UNREACHABLE flag — fixed 2026-07-15
`docs/plans/mission-fun-review.md`'s "New findings" section: a side effect of F2's added
opening density, deliberately not chased at the time. Traced properly this pass:
`sampleTick`-instrumented 2000 runs and found shield breaks clustered almost entirely
(~97%) in the 50-80s window — the scout striker (F2's addition) plus the two dense
fodder waves immediately after it. Fixed by loosening spacing (not counts, so F2's
monotony fix stays intact) across that stretch: `m1-shield` 2.6%→6.7%, clear-rate barely
moved (86.8%→87.8%, still comfortably within the 85-90% floor/ceiling band). `pnpm
balance` now exits clean with zero flags for the first time this whole effort.

### F3 — Final boss (m6) anticlimax fixed via a stall-and-bombard mechanic
`docs/plans/mission-fun-review.md` §F3. The data-only fix (raise `BOSS.shotDamage`) was
tried and reverted first — confirmed it cannot hit the ≥70% weapon-kill-share target
without breaking the `average` archetype's 100% campaign completion, because `shotDamage`
only makes collision costlier, it never changes *whether* the boss reaches collision
range before dying to weapon fire — that ratio is governed by time-to-collision vs.
time-to-kill, which `shotDamage` doesn't touch.

**Real fix:** the boss now alternates APPROACH (moves at its normal `speed`) and STALL
(speed 0 — stops advancing) in a repeating cycle (`BOSS_APPROACH_TICKS`/
`BOSS_STALL_TICKS` in `constants.ts`, `effectiveSpeed` in `conveyor.ts`, tracked via a
new `EnemyState.aliveTicks` field, hash-covered). This stretches unhindered
time-to-collision from 40s (constant walk) to
~93s (43% duty cycle) — comfortably past the ~63s a full weapon-kill already takes, so
DPS wins the race in most runs instead of losing it, while collision remains a real
fallback for genuinely under-geared runs rather than a permanent block.

**Measured result:** boss weapon-kill-share of victories 30%→100% (target ≥70%). m6's
intended/greedy clear-rate 85.2% (within the 45-90% floor/ceiling), `average` archetype
stays 100%/100% campaign completion at n=1000 (0 stuck) — neither safety invariant broke
this time. `pnpm pacing`'s ANTICLIMAX flag is clear. New tests in `conveyor.test.ts`
cover the approach/stall/resume cycle and confirm non-boss enemies ignore it entirely.

m6's own `boss-time` star thresholds were then re-anchored against this new dynamic —
see the F4 entry below.

### F4 — time-stars re-anchored to real, meaningfully different tiers (all 7 main missions)
`docs/plans/mission-fun-review.md` §F4. The original problem: T1-T4 were percentiles of
the SAME (intended) loadout's run duration, which mostly collapsed to a single value
(near-zero variance under greedy's deterministic card-pick heuristic) — a synthetic
±1-2s tie-break, not four meaningfully different skill bars. The first proposed fix
(re-anchor T3/T4 to a faster motor, everything else held at the mission's own intended
level) was tried and found to not work at all: motor level compresses the *timeline*
(2x/3x at motor-2/3), not just power draw, so under-geared missions became **completely
unwinnable** (0% even at max generator) — the real requirement is more DPS to keep pace
with a faster spawn schedule, not more energy.

**Real fix (2026-07-15):** T1/T2 stay pinned to each mission's own `intendedLoadoutForMission`
(unchanged, real 75th/50th percentile data). T3/T4 now measure an objectively faster
clear on two new fixed, mission-independent reference loadouts —
`timeStarT3Loadout`/`timeStarT4Loadout` in `tools/loadoutPresets.ts`
(weapon4/shield3/gen5/motor2 and weapon5/shield4/gen5/motor3), found by sweeping weapon
level (not just generator) until a uniform pair reliably cleared (≥98%/100%, 500
runs/mission) across all 7 main missions. `pnpm sim --loadout t3/t4 --percentiles` now
measures the actual T3/T4 threshold per mission from that gear. This also fixed the
original complaint that m5's T1-T4 were literally unearnable at motor-1.

Also required a `balance-sweep.ts` fix: star reachability was checked against
`intended`/greedy for every star, so T3/T4 (needing a much stronger loadout) read 0%
UNREACHABLE across the board once real thresholds landed. Fixed by adding `t3`/`t4` to
the sweep matrix and routing each star's reachability check to its own matching
reference loadout (`baselineLoadoutKeyForStar`), plus exempting T3/T4 from the TRIVIAL
check specifically (100% reachable *at the matching gear tier* is correct — the real
gate is affording that gear, not run-to-run variance once you have it).

m6's `boss-time` stars use a different metric (when the boss dies by weapon fire, not
overall duration) and were re-anchored separately, after F3 landed and changed the
underlying weapon-kill-share from ~30% to 100% — the pre-F3 thresholds (317-320,
`m6-boss-320` etc.) were calibrated against a dynamic that no longer existed. New data
(3000 runs): 75th/50th/25th percentile all collapse to 316.8s (same near-zero-variance
pattern as everything else here), but the 10th percentile shows real spread (304.2s) —
a genuine tighter tier, unlike the old synthetic ±1-3s spread. Star ids renamed from the
old value-encoded scheme (`m6-boss-320`) to the `t1`-`t4` tier convention used
everywhere else (`m6-boss-t1`...`t4`) — early-dev save policy, no migration needed.

### Open item 2 (`mission-design-and-testing.md`) — automated aggression metric
Superseded 2026-07-15 by `pnpm pacing` (`tools/pacing-report.ts`), which measures
monotony streaks, idle stretches, and anticlimax signal directly instead of requiring a
human to eyeball `missions.ts` prose.

### Open item 3 (`mission-design-and-testing.md`) — is `balance-report.md`/`.json` meant to be committed?
Decided 2026-07-15 (Tomáš): gitignore all three generated-report pairs
(`balance-report`, `tune-report`, `pacing-report` — `.md`/`.json`) as regeneratable
artifacts; untracked the two that were previously committed (`balance-report.*`,
`tune-report.*`).

### `pnpm pacing` idle-stretch flags on m3/m4 — root-caused and fixed 2026-07-15
Not "inherent to blocker-heavy pacing" as originally suspected — actually a mechanical
side effect of `blocksConveyor` freezing the timeline for a wave's *entire* lifetime.
Each mission's "final push" scheduled three blocker waves 20s apart on the timeline;
since the timeline never advances while any blocker from the previous wave is still
alive, none of the real combat time spent killing it is ever credited against the next
wave's threshold — the full nominal 20s gap replays as genuine dead time the instant the
wave dies. Confirmed structural (not RNG) by observing the exact same idle-stretch start
tick across 5 different seeds. This also directly contradicted both waves' own "no
breathing room" design comment. Fixed by tightening the gaps: m3 20s→15s (12s was tried
first — clean pacing fix, but dropped clear-rate from 71.2%→64.0%, under its 65% floor,
since the tighter gap also cuts recovery time between fights; 15s recovers to 68.4%),
m4 20s→12s (comfortably above its 55% floor at 72.4%, no clear-rate adjustment needed).
`pnpm pacing`/`balance`/`campaign` all reverified clean. As a side effect, this also
trimmed real mission duration (m3 320.1s→309.9s, m4 361.5s→342.7s) — see the
mission-length-range entry below, which this didn't fully resolve on its own.

### m3/m4's actual duration already exceeds `01-identity.md`'s stated 30-300s mission range
Discovered 2026-07-15 while updating that doc for Item 7's new m3b mission (m3b itself
fits fine at ~215-235s). The idle-stretch fix above trimmed both (m3 320.1s→309.9s, m4
361.5s→342.7s) but neither landed under 300s — both are deliberately long attritional
DPS-check missions, and cutting further to force an exact number under 300s would mean
either touching blocker counts (the known difficulty cliff, off-limits) or removing real
content, out of proportion for a doc-accuracy fix. **Decision (2026-07-15): widen the
documented range to 30-360s** (comfortably covers the current max, m4 at 342.7s, with
some margin for run-to-run variance) rather than force missions to fit a number that was
never actually measured against real mission content when first written.

### ResultScene star labels now expose the pre-existing collapsed-threshold tiers
`viewmodel/result.ts`'s `starShortName` used to uppercase the raw star id (e.g.
"m1-time-t1" → "TIME-T1"), which told a player nothing about what they'd actually need
to do. Replaced 2026-07-16 with a label built from the star's real `family`+`threshold`
(e.g. "UNDER 186S", "HULL 50%+") — a genuine readability fix, not a balance change.
Side effect: several missions have two-to-three star *ids* sharing the exact same
`threshold` (m6's `boss-t1`/`t2`/`t3` all `seconds(317)`; at least five other missions
have a duplicate `finish-time` pair) — already known, intentional, and documented inline
in missions.ts (near `m6-boss-t1`): percentile data collapsed to one value under the
current greedy-policy sim, a real finding, not a typo. Before this fix, those distinct
ids at least *looked* different on the result screen ("BOSS-T1" vs "BOSS-T2"); now they
render as literally identical text, stacked 2-3 times in a row. Not fixing here — the
underlying threshold re-anchoring (F4 in the old mission-fun-review.md, and referenced
again in m6's comment) is a missions.ts data change and stays owner-gated. Flagging so
whoever re-anchors those thresholds knows the result screen is a second place the
collapse is now visible, not just the sim's percentile output.
