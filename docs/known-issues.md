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

### m2/m3/m4 mid-campaign tension experiment — implemented, sim-verified, UNVALIDATED by real playtest, awaiting Tomáš
Added 2026-07-18 as E-3 of `docs/plans/fable-review-fixes-2026-07-18.md`. The finding
(`docs/design/13-balance-and-tuning.md`'s tuning log, point 5): `pnpm campaign` showed
median hull 100%, near-miss ≈0%, retries ≈1.0 through m1-m5 for both simulated
archetypes — the energy-triage skill loop (toggling front/rear weapon or shield
recharge off to conserve energy) is never actually *required* to clear a main mission
before m6. The plan's own recommendation was a scoped experiment "after a real playtest
session confirms or refutes the concern" — Tomáš was asked whether to wait for that or
have it designed now from sim data alone, and explicitly said: "Make it as best as
possible, I will get to it sooner or later." This entry is that experiment, landed
without a playtest per that explicit instruction — **treat every number below as
provisional, not settled design.**

**What changed:** one new short enemy wave per mission (m2/m3/m4 — using each
mission's own already-tuned `striker` spec, not a new enemy or new stats), each landing
in an existing timeline gap a few seconds before that mission's next scheduled support
call. Planned with a Fable pre-implementation review first (per this repo's own
convention for anything touching `missions.ts`'s balance data) — see each mission's own
inline `E-3 experiment` comment in `missions.ts` for the exact placement/sizing
reasoning and why `striker` was the chosen lever (blocker/tank counts are documented
difficulty cliffs in these same missions; striker isn't).

**A real, honest caveat the review surfaced and this entry preserves:** the sim cannot
actually verify the "toggle now required" premise. `intendedLoadoutForMission` (the
reference loadout `pnpm sim`/`pnpm balance` score against) equips no rear or side
weapon, and the sim's only energy-triage policy (`brownoutAwareToggles`,
`tools/policies.ts`) only ever flips the rear weapon — so at the intended loadout, this
policy is a structural no-op. What the sim CAN and does verify: the change doesn't
break any mission's documented clear-rate floor, and (via `pnpm campaign`, which runs
richer archetypes that do own gear and do use the toggle policy) that it visibly moves
the margin-at-clear metrics the original finding was about.

**Sizing needed real iteration, not just the review's estimate:** m4's insert (3
strikers) and m3's (2 strikers, deliberately the smallest of the three — m3 had by far
the thinnest floor headroom, 68.8% vs. a 65% floor) landed fine on the first try. m2's
did not: a 3-striker insert (matching the review's own recommendation) measured 68.5%
at 2000 runs against m2's 75% floor — a real, larger-than-predicted drop, most likely
because the insertion point sits sandwiched between m2's own existing seconds(124) and
seconds(152) striker waves, tripling up pressure in one window rather than adding one
isolated burst. Reduced to 2 strikers (74.4% — still just under floor), then to a single
enemy (79.3% — a real 4.3pp margin). This is recorded in `missions.ts`'s own comment on
that event, not just here.

**Verification run this round (`pnpm sim --mission {m2,m3,m4} --runs 2000` each, then
the full sweep):**
- `pnpm sim` per-mission clear rates, all above floor: m2 79.3% (floor 75%), m3 70.0%
  (floor 65%), m4 72.2% (floor 55%).
- `pnpm balance` (500 runs/combo, 98 combos): zero UNREACHABLE/TRIVIAL flags; m2/m4's
  shield stars (the two closest to any edge) sit at 13.6%/13.0%, both comfortably clear
  of the 5% floor.
- `pnpm campaign` (500 campaigns/archetype) — **this is the result the whole experiment
  was aimed at:** `average` archetype's m2 margin-at-clear moved from the pre-existing
  100%-median-hull/0%-near-miss pattern to **59% median hull, 7.0% near-miss** — a real,
  measured tension moment where none existed before. m3/m3b stayed close to unchanged
  (m3's insert was deliberately the smallest, per its thin headroom). `expert`
  archetype (strong/well-built gear) stayed at 100% median hull / 0% near-miss on all
  three missions, completely unaffected — the tension is felt by weaker builds, not
  imposed on strong ones, matching the intended shape. Both archetypes' completion rate
  held at 100%/100%, the core safety invariant.
- `pnpm pacing`: still exactly the 3 pre-existing accepted flags (w0/t1 SLOW_START, m1
  MONOTONY) — no new MONOTONY/IDLE_STRETCH signal on m2/m3/m4.
- Added a new permanent regression test (`missions.test.ts`, found missing during the
  Fable pre-implementation review): `events` arrays must stay sorted by
  `atTimelineTick` — `advanceTimeline` (`core/timeline.ts`) assumes this and silently
  fires an out-of-order event LATE, bundled into whatever earlier event the walk was
  still stuck on, rather than erroring. Nothing previously checked this cross-event
  invariant (only per-event spacing was tested).

**Not done, deliberately:** no time-star re-anchoring (T1's 75th-percentile anchor is
now slightly stale on all three missions since runs got a little longer/harder, but
re-anchoring an unvalidated experiment risks churn if it gets reverted — re-anchor only
once this becomes settled design). No UI/screenshot changes needed (pure `missions.ts`
data, no view-layer touch).

**What Tomáš needs to actually evaluate:** does the m2 moment (and the smaller m3/m4
ones) feel like real tension or like an unfair spike? Does it read as intended given
the visual crowding at that point in each mission (worth a live playthrough, not just
numbers)? If it reads wrong, each insert is a single, clearly-commented event line —
delete the one line (or the three) to fully revert, no other coupled changes.

### Screenshots taken well into a mission (via `combat.fastForward`/`advanceUntil`) show the mission-title text still fully visible and overlapping enemy HP labels/reticles/damage numbers — a harness artifact, not a live bug
Found 2026-07-18 during this round's screenshot sweep (delegated review agents flagged
`combat-m1-tap-target`, `combat-m3-blocker`, `combat-m4-blocker-pressure`,
`combat-m4-turret`, and `combat-m6-boss` as a "common thread": the mission-title row at
the top of the game field visually collides with whatever's spawning there). Traced to
the root cause, and it's structural, not a data/layout bug: `CombatScene.ts`'s mission
title fades via a Phaser tween (`delay: 1800, duration: 700` — real wall-clock
milliseconds, driven by the scene's Clock/rAF loop) scheduled once at `create()`.
`cheat.combat.fastForward(ticks)` (`cheatFastForward`) advances the deterministic core
in a single synchronous `while` loop with **no intervening real animation frame** — so
however many simulated game-seconds a screenshot's `TIME` readout shows (e.g.
`combat-m3-blocker`'s 68.2s, `combat-m4-blocker-pressure`'s 98.3s), the ACTUAL real
wall-clock time elapsed inside the browser since the scene's tween was scheduled is
whatever a handful of `page.evaluate()`/`advanceUntil` round-trips take — reliably well
under the tween's own 2500ms real-time fade window. The title is therefore captured
mid-fade or pre-fade in essentially every screenshot whose setup fast-forwards past the
first couple of ticks, regardless of how much simulated mission time has "passed."

This cannot happen to a real player: a real player's mission `TIME` and real wall-clock
time advance together (fixed 100ms tick, driven by real frame `deltaMs`), so by the real
2.5s mark the title is genuinely gone and the simulated mission time is also only ~2.5s
in — there is no way for a real player to ever see a mission at 68s/98s with the title
still up. Same underlying tooling/real-time mismatch class already documented for
`combat-m6-boss`'s reticle/title overlap (`MIN_BOSS_HP_OVERLAY_TOP_Y`'s own comment
already called this out for the boss case specifically; this generalizes it to every
enemy kind's HP label/reticle/floating damage number, not just the boss). The one
partial exception: `combat-m1-tap-target` (`TIME` 2.1s) captures a state a real player
COULD plausibly see, since it's within the title's own real fade window — but the
overlap there is brief (a reticle corner-bracket + enemy sprite edge lightly touching 1-2
title letters, title fully gone ~0.4s later) and lines up with the same "brief, low-
severity, not text spilling out of a box" bar the m6 reticle issue was already accepted
against. Not fixed — nothing in the actual game is broken; flagging so a future
screenshot-fidelity pass (e.g. an `advanceTicksWithFrames` alternative to
`fastForward` that lets real frames/tweens run between simulated ticks) knows why these
particular frames look the way they do, and so nobody "fixes" the title-fade tween
itself chasing a bug that only exists in the harness.

### `combat-w0`'s screenshot intermittently captured a stale "NOVAK COMMAND" narrator-bar line from an earlier tutorial mission — real but not reliably reproducible
Found 2026-07-18 during a `/polish-loop` general-sweep round, reading `combat-w0.png`
after a full `pnpm screenshot` batch: the bottom-left passive `NarratorBar` showed
"NOVAK COMMAND: Supp" (a partial-reveal fragment of t2/t3/t4's shared
"NOVAK COMMAND: Support window open..." line prefix — `story.ts`) during w0's own
combat, even though `w0` has no `STORY_LINES` entry at all (`getStoryLine('w0', ...)`
always returns `undefined`, confirmed by reading the code) and `combat-w0`'s own setup
(`tools/screenshot.ts`) calls `cheat(page, 'reset')` — the most aggressive teardown
available — immediately before `startMission('w0')`. Investigated at length: an isolated
probe (fresh page, straight to w0, no prior tutorial) never showed the text; a targeted
re-run of the exact real shot sequence from `combat-t4` (the shot that legitimately
triggers and reveals this exact bar text) through `combat-w0` did not reproduce it; two
full 75-shot `pnpm screenshot` re-runs afterward also came back clean. Only the original
occurrence (a real, freshly-generated PNG, confirmed via file mtime — not stale disk
state) showed it. This is the same class of bug as the `combat-m4-turret` card-overlay
race directly below: a genuine, intermittent Playwright/Phaser timing race (most likely a
`NarratorBar` Text object from a still-shutting-down previous `CombatScene` instance
rendering into one frame before Phaser's async scene teardown finishes destroying it),
not a deterministic logic bug — the code path that would need to be wrong for this to be
a real gameplay bug (`syncNarrator()`'s `missionId = this.core.mission.id` lookup) is
correct and was directly verified. Not fixed here: not reliably reproducible enough to
build a fix against, and lower real-player impact than it looks — no real player ever
transitions between two missions in under ~150ms the way this harness's synthetic
`reset()`+`startMission()` cheat sequence does, so this is very unlikely to be something an
actual player could ever see. Worth a look if `combat-w0`'s screenshot is ever seen
showing this again, or if `NarratorBar`/`CombatScene`'s scene-teardown ordering is
touched for an unrelated reason.

### `combat-m4-turret`'s card-overlay race is real and intermittent — `flushPendingOffer` doesn't fully close the window
Found 2026-07-17/18 during the `advanceUntil` fix round below (Fable's review). A support
call can open a real, non-auto-resolving `CardOverlay` in the gap between
`flushPendingOffer`'s own check (`tools/screenshot.ts`) and the actual
`page.screenshot()` call — the exact race class `flushPendingOffer`'s own comment already
describes as previously found/fixed once (`playwrightHarness.ts:114-121`), recurring
here. Confirmed genuinely intermittent, not something the `advanceUntil` fix caused or
fixes: one run of `pnpm screenshot -- combat-m4-turret` captured the
DISPATCH REINFORCEMENTS overlay instead of the intended turret combat frame; a
subsequent run captured the turret correctly. Not fixed here — a deterministic fix means
either polling for offer-settled state with a real timeout/retry (not a single
timing-based flush) or restructuring how support-call scheduling interacts with the
harness's real-frame waits, a bigger change than this round's scope (found via a
downstream review of an unrelated fix, not this round's actual focus).

### The same silent-timeout disease also affects `fastForwardToOffer`/`fastForwardToNarrator`, not just `advanceUntil`
Found 2026-07-17/18 (Fable's review of the `advanceUntil` fix below) — `advanceUntil`
was fixed to throw instead of silently returning on failure, but the same *shape* of bug
exists in a handful of shots (`tools/screenshot.ts`) built on
`fastForwardToOffer`/`fastForwardToNarrator` instead: those cheats already stop
(non-erroring) the instant their target condition is met or the tick budget runs out,
and most call sites don't check which actually happened. `combat-card-overlay` already
has a manual post-check guard (added in an earlier round, `screenshot.ts:573-578`) — the
remaining unguarded sites are `combat-card-reroll-exhausted` (calls `rerollCard` twice
after `fastForwardToOffer(300)` with no check that an offer actually opened first), the
four `combat-t*-narrator-modal` shots (30-tick budgets, would screenshot plain combat
mislabeled as a modal if the narrator never appears), and `combat-narrator-modal`
itself. Not fixed here — each site needs the same per-site "does this call actually want
hard failure, or does it have a legitimate reason to tolerate a miss" analysis
`advanceUntil`'s fix required, not a blanket change to the two cheats' own behavior
(some real callers may depend on the current stop-without-erroring semantics elsewhere;
not audited).

### No permanent regression test for "a coach-mark tour's targets stay clickable after it ends"
Flagged by Fable's review of the HubTour multi-target fix (see Resolved, same date). The
fix's key correctness property — `clearStep()` only re-enabling input on targets that
were actually enabled beforehand, so a label Text never gets silently made
clickable-with-no-handler and starts swallowing taps — was verified with a one-off
Playwright probe (click a shop tab's label text after ending its tour, confirm the tab
still switches) that was run and discarded, not checked into `tools/tap-target-audit.ts`
or anywhere else repeatable. If a future change to `HubTour.ts` reintroduces the blind
`setInteractive()` pattern, nothing in the harness would catch it. Worth promoting into a
permanent state/check if `HubTour.ts` gets touched again.

### m6's boss-time T2/T3 use conservative intra-distribution steps — a reference-tier re-anchor remains an open design alternative
Added 2026-07-18, while fixing the duplicate time-star thresholds (B1,
`docs/plans/fable-review-fixes-2026-07-18.md`). m6's `m6-boss-t1/t2/t3` were all
literally 317s; the fix stepped T2/T3 evenly through the intended loadout's own
measured boss-kill-tick spread (317 → 312.7 → 308.3 → 304, from a 2000-run probe of
`state.bossKillTick` percentiles). This deliberately does NOT mirror m1-m4's
`timeStarT2Loadout` reference-tier anchoring: the same probe measured the t2/t3
reference tiers killing the boss at ~204s/~189s median — anchoring m6's T2/T3 there
would roughly HALVE the finale's boss-time requirements, a real difficulty redesign of
the campaign's one intended test, not a de-dup fix. That stronger re-anchor (four
genuinely gear-gated boss-time tiers, matching the finish-time stars' philosophy) is a
legitimate design direction if Tomáš wants it — it just needs a deliberate decision,
because it changes what the finale's stars mean.

### Daily Mission — a faster motor scores WORSE than a slower one at the same weapon/shield/generator tier — now CONFIRMED and quantified, not fixed
Found 2026-07-17 (Fable's design review), residual after the gate-based fix (see
[Balance & Tuning](design/13-balance-and-tuning.md)'s tuning log) closed the main
motor-vs-gear inversion. Two smaller channels still couple motor tier to score in the
wrong direction: (1) the flowing waves between gates are still motor-timed, so a faster
motor still reaches later-round waves sooner in real time; (2) motor energy draw
continues during a gate fight even though the timeline is frozen and gains nothing from
it, pushing a fast/heavy motor toward brownout exactly when DPS matters most.

**Confirmed 2026-07-18 (E-4, `docs/plans/fable-review-fixes-2026-07-18.md`)** — the
motor-only sweep proposed but never run is now done: same weapon/shield/generator
(pulse/wall/torrent, all Lv2), only motor level (`rush` 1/2/3) varied, 500 runs each
against today's real daily seed (throwaway script, run then deleted per this repo's own
convention). Result is not a small residual — it's a large, monotonic inversion:

| Motor | Avg raw coins | Avg survival |
|---|---|---|
| rush-1 (slowest) | 454.9 | 404.9s |
| rush-2 | 277.6 | 160.0s |
| rush-3 (fastest) | 232.5 | 101.3s |

The slowest motor nets **~2× the fastest motor's coins** at identical weapon/shield/
generator investment — a player who spent coins upgrading their motor tier would
score *worse* on the Daily than one who never touched it. This is the single largest
un-reconciled economy inversion found in this project's balance history and is
**squarely owner-gated**: fixing it means picking one of at least two real designs —
decouple the daily's flowing-wave timing from motor speed entirely (its own escalation
curve, not `timelineMultiplier`), or freeze motor draw during gate fights (mirroring how
the timeline itself already freezes) — either is a real mechanic change to
`dailyMission.ts`/`core/timeline.ts`, not a tuning-number tweak, and needs a deliberate
call before implementation. Not fixed this round (E-4's own scope was measurement, not
a fix) — logged here with real numbers instead of the "not verified... proposed but not
run" state this entry used to describe.

### Daily Mission — replay records don't pin which day's generated mission they belong to
Found 2026-07-17 (Fable's design review). `ReplayRecord` stores `missionId: 'daily'` +
seed but nothing identifying which calendar day's generated `MissionSpec` produced it —
replaying it later resolves against whatever daily is currently registered via
`setDailyMission`, which may be a different day's mission (or throw, if none is
registered). Currently latent: the replay-playback UI doesn't exist yet
([Status](design/14-status.md): "Record exists; playback scene not built"). Worth fixing
(e.g. store the date key or seed in the record) before that UI is built.

### Coverage sweep (`docs/plans/comprehensive-coverage-sweep.md`) — deliberately deferred items
Not silently dropped — named here per the plan's own "no silent caps" principle. None
of these are known bugs, just unverified surface area, ranked by why they were skipped.
**Corrected 2026-07-17** (Fable's review of the executed round caught that
`pickCard`/`skipCard`/`activateAbility` cheats existed with zero callers, and that the
picked-ability sidebar — `rebuildCardDisplay`'s two layouts, `CombatScene.ts` — was
never actually covered despite the cheats existing to reach it, since `fastForward`/
`flushPendingOffer` resolve offers via the core function directly and never trigger a
view rebuild): a `combat-card-picked` shot now exists, using the real `pickCard` cheat
(→ `handleCardAction`, the same path a tap uses) specifically so the sidebar rebuilds —
confirmed clean, no overflow, for the ≤6-entry single-column layout. The 7+-entry grid
layout is still unverified (would need ~7 real picks in one run; not chased further).
- **Ability-bar ACTIVE/CD/READY visual states specifically** (as opposed to the picked-
  ability sidebar above, which *is* now covered). Probed extensively (30 support-call
  offers, cycling every card index 0/1/2 across them) and never landed a single
  active-kind ability — the weighted draw makes them rare enough that this isn't a
  tractable state to reach deterministically without deeper changes (e.g. a cheat that
  inspects offer contents and picks by kind rather than index). Echoes an
  already-accepted finding from earlier this session (the "empty ability slots" review).
- **Death-flash exact-frame capture, floating heal numbers, shop-preview side-weapon
  demo-fire bolt mid-flight.** All genuinely transient (tween-driven or timer-driven on
  a cadence — e.g. demo-fire is 1500ms — shorter than convenient to reliably straddle
  with a screenshot). Lower risk than the items that *were* covered this round (no text
  involved, pure motion/color effects) — a real next step if picked back up, but not
  chased further here given diminishing returns against the time spent.
- **Shop catalog exhaustiveness.** Phase B's original text-length-outlier idea (scan
  every kind/level's display strings) was superseded by Phase 4's save-state matrix
  (which found real gaps the string-length approach would have missed — Fable's review
  of the pre-execution plan), but a literal every-kind-every-level sweep (100+
  combinations) was never done either way; the shared row/chip template is verified,
  individual items are not exhaustively re-checked.
- **NarratorBar reveal-timing waits are a wall-clock patch, not a root-cause fix.**
  `combat-t1`/`t2`/`t3`/`t4`'s fixed `waitForTimeout(5500)` (sized off the longest
  current `story.ts` line, 128 chars at ~25 chars/s) will silently under-shoot again if a
  future line exceeds that, and could over-shoot into the bar's own 5000ms auto-hide
  window for a *short* line (capturing nothing instead of truncated text — lower
  severity, but still not what the shot claims to show). The real fix (matching the
  harness's own "read state back, don't guess a fixed number" principle used everywhere
  else) is a `combat.inspect()`-style extension exposing `NarratorBar`'s reveal progress
  to poll against instead of sleeping a fixed duration. Not implemented this round.

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
nothing). Not fixed here — `first-open-and-tutorial-tour.md` built an independent
tutorials-or-skip path (originally a separate `OnboardingScene`, since redesigned
2026-07-17 onto the galaxy screen itself — see [Status](design/14-status.md)) that asks
a similar question without touching `w0`, since `w0`/`WelcomeScene` stay blocked on
content. **When
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

**Phase E-2 (2026-07-18, `docs/plans/fable-review-fixes-2026-07-18.md`) — sweep artifact
built, decision on rebalancing still deliberately deferred.** `pnpm tune` now has a
cross-mission summary table + a non-zero exit on any dominant-kind flag (matching
`pnpm balance`/`pnpm pacing`'s own convention) — see
[Balance & Tuning](design/13-balance-and-tuning.md)'s point 6 for the full write-up.
Building it found and fixed a real bug in the tool itself (the campaign-completion-gated
`y2010` Easter egg was in the weapon tournament, winning m3/m6 and silently feeding a
mechanically-impossible-for-a-first-playthrough recommendation into
`RECOMMENDED_KIND_PER_MISSION`, which `expert`'s own campaign sim then acts on). Fresh,
y2010-excluded data supersedes this entry's 2026-07-11-era "pulse worst on m1/m2"
framing (both missions now show pulse recommended, non-dominant spread — consistent
with the nova-trap and Reserve-generator fixes that landed after that original finding,
never re-checked until now) while confirming the broader pattern is still real: m3
(ion), m3b (nova), m4 (ion), m5 (scatter), m6 (ion) each show a genuine dominant kind.
Still no rebalancing — that remains an owner-gated design decision, now with
trustworthy, current data to decide from rather than a stale 2026-07-11 snapshot.

### Manual playtest of m1/m3/m5's reshaped pacing — needs a human, not simulation
`docs/plans/mission-design-and-testing.md`'s "Open item 1." The simulator is structurally
blind to feel; needs a human with a controller. **Needs dev server / Preview, not
actionable headlessly.**

### F6 (minor) — t2/t4 may be one beat too short; §13 tutorial-length table may be stale
`docs/plans/mission-fun-review.md` §F6. Playtest call only, unchanged since 2026-07-11.

### `pnpm pacing`'s MONOTONY flag permanently flags m1 (fodder ×7) — expected, not a bug, not new
Noticed 2026-07-18 during a `/polish-loop` verification round, but the flag itself isn't
new — `MONOTONY_STREAK_THRESHOLD = 6` (`tools/pacing-report.ts`) is unchanged by any diff
this session, and m1's same-kind streak has been exactly 7 since the 2026-07-15 F2 shape
fix landed (`missions.ts`'s own comment on m1: "confirms the shape fix (14 → 7)") — it was
simply never run through `pnpm pacing` and checked against this specific threshold before
now, not something that started firing due to recent work. The threshold's own comment
explains its origin: "m2's longest same-kind streak is 3... m1's *pre-fix* streak is 14. 6
sits cleanly between the two" — calibrated against the old, broken m1, without accounting
for where the successfully-fixed m1 (7) would land relative to it. Re-verified the F2
fix's own difficulty-cliff finding still holds at m1's current (post `MIN_VISUAL_SPACING`)
spacing: `pnpm sim --mission m1 --runs 2000 --strategy greedy --loadout intended` measures
88.0% clear-rate, matching the documented 87.6-88.1% band — going any lower than a 7-streak
reopens the same cliff the F2 fix's own comment already measured (count 9→10 on the dense
waves alone swung clear-rate from 90% to 77.5%, under the 85% floor). Not fixed — the
threshold stays at 6 rather than being raised to 7 specifically to accommodate m1,
following the same precedent as the w0/t1 SLOW_START entry below: a real, permanent,
accepted residual is logged here rather than the tool's own bar quietly moved to stop
complaining about it.

### `pnpm pacing`'s SLOW_START flag permanently flags t1 and w0 — expected, not a bug
Added 2026-07-17 (playtest feedback: "if nothing is happening for more than 2-3 seconds,
it's bad"). Measures first tick with a shot fired or a collision, flags mission averages
over 3s. After t1's guardian-speed fix (`missions.ts`'s `GUARDIAN_SLOW`, speed 0.55→2.2),
t1 lands at ~5.5s post-modal-dismissal — a large improvement over the pre-fix ~15-19s,
but still over the 3s threshold. `missions.ts`'s own comment on t1 already documents why:
a literal 2-3s approach speed would outrun every enemy in the game (including kamikaze at
2.8) and read as an unreadable blink rather than a legible "shield absorbs a hit" beat.
w0 (never touched by this fix — out of scope, no playtest complaint was raised about it)
independently flags at ~5.0s for a different reason: its first wave doesn't spawn until
`seconds(5)` (`missions.ts`'s w0 `events[0]`), never tuned against this new metric. Both
are known, accepted, non-blocking residuals, not regressions — `pnpm pacing`'s non-zero
exit on a clean run is expected until/unless someone decides to invest further design
effort in either mission's approach-phase pacing specifically.

## Resolved

### Daily Mission — y2010's secret weapon can guarantee a full clear, a very large repeatable payout — accepted as intended, 2026-07-18
Closed as E-1 of `docs/plans/fable-review-fixes-2026-07-18.md`. Decision (Tomáš): accept
as-is — a post-campaign reward, not a bug. `y2010` is already gated behind actually
beating the campaign (or dev mode), so the "exploit" is only reachable by a player who
has already finished the game's real content; a very large, repeatable Daily payout at
that point is being read as the intended shape of a post-campaign perk, not something
requiring a payout cap or a special-case exclusion. No code change. If this is ever
revisited, the three options this entry originally raised (cap the payout via a named
`DAILY_MAX_PAYOUT`, exclude y2010 from the daily, or keep accepting it as-is) are still
the live menu — this entry just records that "keep accepting it" was the deliberate call
made this round, not a default arrived at by inaction.

### `hub-dispatch-reinforcements` screenshot captured the first-visit dispatch coach-mark tour instead of the clean cards grid — fixed 2026-07-18
Found while visually verifying Phase C's chip-grid de-duplication (B5 leftover,
`docs/plans/fable-review-fixes-2026-07-18.md`) — not caused by that change, a
pre-existing gap in the same class already fixed for `hub-shop-weapon`/
`hub-shop-ship-star-gated` earlier the same day. Root cause: this shot's setup calls
`__cheat.selectSubscription('sub-offensive')`, which internally calls `setNav('dispatch-
reinforcements')` with no `skipScreenTour`, and `dispatchTourSeen` is still false at
this point in the batch — the two earlier `hub-dispatch-tour-step-1/2` shots force the
tour via `showDispatchTour()`, which deliberately passes `skipScreenTour: true` and so
never sets the seen-flag (see `HubScene.ts`'s `cheatShowDispatchTour` comment). The real
first-visit tour therefore auto-fires here too, covering the cards grid this shot exists
to demonstrate. Fixed the same way as the earlier two: added `cheat(page,
'hub.tourSkip')` right after `selectSubscription` in `tools/screenshot.ts`. Re-verified
the regenerated screenshot shows the intended clean state (10 subscription cards, page
1/4, the sub-level chip row visible at the bottom-left).

### `SaveManager.ts`'s migration switch had no `migrateV12` case — closed by removing the whole migration switch, 2026-07-18
Fixed as D8 of `docs/plans/fable-review-fixes-2026-07-18.md`, applying this project's
own stated early-dev save-data policy for real (`docs/design/12-architecture-and-
tooling.md`: "bumping SAVE_VERSION and falling back to defaultSave() is sufficient
until closer to release") rather than continuing to add one-off migration functions.
Deleted `migrateV5`-`migrateV11`, `migrateLegacy`, `migrateSave`, `LEGACY_ID_MAP`, and
`renameId` entirely — `loadSave()` now just checks `parsed.version === SAVE_VERSION`
and falls back to `defaultSave()` on anything else, matching what the `default:`
branch of the old switch already did for any *unhandled* version. This makes the
specific gap this entry flagged (v12 falling through by accident, not decision)
impossible by construction: there is no longer a switch with cases to have a gap in.
Also fixed the two stale comments on `SaveData.w0Completed`/`firstBranchChoice`
(`SaveManager.ts`) that asserted behavior ("gates the hub from redirecting again",
"used to open the right hub section on first load") neither field actually has —
confirmed via grep that nothing anywhere reads either field — now pointing at the
`w0`/`firstBranchChoice` known-issues entry below instead of asserting the fiction.
Replaced the three tests that exercised the deleted migrations (`SaveManager.test.ts`'s
v3/v8 migration tests, `side-weapon.test.ts`'s v11→v12 test) with tests asserting the
same old-version saves now reset to `defaultSave()`. Verified via `CI=true pnpm test`
(689 tests, same count — one-for-one test replacement), `lint`, `build:dry`.

### `docs/design/04-screens-and-layout.md`'s "Scenes" table and "First launch & story" section described an architecture the code doesn't have — fixed 2026-07-18
Fixed as D6 of `docs/plans/fable-review-fixes-2026-07-18.md`. Rewrote the Scenes table
to the real 5-scene graph (`BootScene`, `AlphaNoticeScene`, `HubScene` — with shop/
Dispatch/Settings/Credits as nav panels inside it, not separate scenes — `CombatScene`,
`ResultScene`), marked "Left-handed mode" as planned-not-shipped (confirmed: no
`leftHand`-style flag exists anywhere in the save model or view layer), and rewrote
"First launch & story" to describe the real flow (`BootScene` → `AlphaNoticeScene` every
launch, no first-run gate → `HubScene`, with the tutorials-or-skip choice living on the
galaxy screen itself, not a separate prompt scene) while moving the still-intended
`WelcomeScene`/Captain-Nesro material into a clearly-marked "planned, blocked on
content" subsection that points at the `w0`/`firstBranchChoice` entry below for why it's
not live yet. Verified each claim against the current code before writing
(`BootScene.ts`'s own comment already documented the real flow precisely;
`main.ts`'s scene list; `HubScene.ts`'s `buildSettingsContent`/`buildCreditsContent`/
`buildShopContent`/`renderDRLeftPanel` nav-panel functions; grepped for any
`leftHand`-style flag and found none).

### ResultScene's SHOP button didn't actually open the shop — fixed 2026-07-18
Found 2026-07-17 (see the removed Open entry): the SHOP button called
`this.scene.start('HubScene')`, identical to the neighboring MISSIONS button, always
landing on the main menu. Left unfixed at the time because it meant touching
`HubScene`'s documented-fragile `init()`/`create()` data-retention semantics (the
`showTour` flag's own comment: Phaser only overwrites `scene.sys.settings.data` on a
data-carrying `start()` call, so an unconsumed flag gets silently re-delivered to every
later BARE `scene.start('HubScene')` — CombatScene's exit-confirm, the settings panel's
dev-tools restarts — for the rest of the session).

Fixed by extending the exact same consume-once pattern `showTour` already uses:
`HubScene.init(data)` now also accepts `initialNav?: HubNav`, stores it in a new
`initialNavOnCreate` field, and immediately clears `data.initialNav = null` so the
retained object can't leak the nav choice into a later unrelated bare start. `create()`
uses `this.initialNavOnCreate` (instead of always `null`) when `showTourOnCreate` is
false; `ResultScene.ts`'s SHOP button now calls
`this.scene.start('HubScene', { initialNav: 'shop' })`. `setNav('shop')` already runs
the real first-visit shop-tour logic (`maybeShowScreenTour`) unconditionally, so this
also correctly triggers that tour the first time a player reaches shop this way.

Planned with a Fable pre-implementation review (confirmed the fix correct against
Phaser's actual source, not just this codebase's own comments describing it — verified
`Systems.js`/`SceneManager.js`/`ScenePlugin.js`'s real data-retention behavior directly)
that caught one real edge case a first draft missed: if `showTourOnCreate` and
`initialNavOnCreate` were both set at once, the original ordering (`setNav(initialNav)`
then `showTour()`) would call `setNav('shop')` first — persisting `shopTourSeen: true`
and creating the shop coach-mark — then `showTour()`'s own `setNav(null)` would tear
that tour down before a single frame ever rendered it, burning the one-time coach-mark
with nothing shown. Unreachable today (`showTour` only follows BootScene's first-ever-
launch flag; `initialNav` only follows the SHOP button, which a first-launch player
can't press yet) but cheap to make impossible outright: `create()` now branches
`if (showTourOnCreate) this.showTour(); else this.setNav(initialNavOnCreate);` instead
of calling both unconditionally.

Verified live (not just `pnpm test`, though that stayed clean at 686 tests): a
throwaway Playwright probe (`tools/probe_tmp.ts`, run then deleted per convention) reset
to a fresh save, won a mission, found `ResultScene`'s actual `SHOP` `Text` object among
the scene's children and emitted a real `pointerdown` on it (exercising the exact same
`onClick` a tap does, no hardcoded coordinates) — landed on the shop tab with the
first-visit "MY LOADOUT" coach-mark correctly showing (`shopTourSeen` flipped to
`true`), then started and abandoned a second mission (`combat.confirmExit`, a bare
`scene.start('HubScene')` on a non-daily mission) and confirmed THAT correctly landed on
the plain main menu, not shop again — the exact "retained data re-delivered forever"
regression class this fix's own comment warns about. `pnpm lint`/`build:dry` clean.

Also found by the same Fable review, not fixed (out of scope, noted for whoever next
touches scene-data flow): `AlphaNoticeScene.ts`'s `create(data)` reads its data but
never consumes/clears it — latent, not currently reachable (every real caller passes a
fresh object; `BootScene` always constructs one), the same class of bug this whole fix
exists to prevent, just not yet armed. Worth a warning comment on that file's `create()`
if it's ever touched for an unrelated reason.

### `combat-m5-swarm`'s screenshot showed a near-empty field, not the dense swarm cluster it exists to demonstrate — fixed 2026-07-18
Found during this round's screenshot sweep: the shot's stop condition
(`hasKind(s, 'swarm')`, `tools/screenshot.ts`) is satisfied by a SINGLE swarm-kind enemy
existing anywhere in state, not the actual multi-enemy cluster m5's own wave data
(`missions.ts`: 8-12 swarm enemies per event) produces once a wave has actually spawned
in. Fixed by requiring `s.enemies.filter((e) => e.kind === 'swarm').length >= 5` before
capturing. Re-verified: the regenerated screenshot now shows a real cluster of 5+ swarm
enemies bunched near the top, distinguishable and non-overlapping (`MIN_VISUAL_SPACING`
holds), which is what a reference "dense swarm" shot should actually show.

### `hub-shop-weapon`/`hub-shop-ship-star-gated` screenshots captured the first-visit shop coach-mark tour instead of the clean panel state they exist to show — fixed 2026-07-18
Found during this round's screenshot sweep (delegated review agent): both shots are the
first REAL (non-forced) visit to the shop tab in their respective runs — `hub-shop-weapon`
is the first plain `navShop()` call in the whole batch (the earlier `hub-shop-tour-step-*`
shots deliberately bypass the persist-on-visit path via `skipScreenTour`, so
`shopTourSeen` is still false by the time this shot runs), and `hub-shop-ship-star-gated`
resets to a fresh save first. Both therefore auto-triggered the real shop tour, whose
dialog box covered exactly the content each shot exists to demonstrate (the front-weapon
panel; the star-locked Lv2-Lv5 chip row). Fixed by adding `cheat(page, 'hub.tourSkip')`
right after each shot's `navShop()` call. Re-verified both regenerated screenshots show
the intended clean state.

### Duplicate T1/T2 time-star thresholds on every main mission (incl. `m3b-time-t2` borderline-unreachable and m6's triple T1=T2=T3 tie) — fixed 2026-07-18
Fixed as B1 of `docs/plans/fable-review-fixes-2026-07-18.md` (which has the full
analysis). T1 and T2 were literally identical on m1/m2/m3/m4 (and near-identical on
m3b: 234.0s vs 233.9s — the "borderline-unreachable" razor-thin star a previous entry
here flagged for an owner decision), m5's T1=T2 tied at 160.2s, and m6's boss-time
family had T1=T2=T3 all at 317s — the victory screen listed the same "UNDER Ns" star
text twice (m6: three times), and the duplicated stars were always earned or missed
together. Root cause: T1 and T2 were both percentiles (75th/50th) of the SAME
intended-loadout run, whose duration has near-zero variance under greedy play — the
same mechanism F4 (2026-07-15) already diagnosed and fixed for T3/T4. Fix mirrors F4:
a new fixed `timeStarT2Loadout` reference tier (weapon3/shield3/gen4/motor2 —
`tools/loadoutPresets.ts`), swept at 2000 runs/mission, anchors T2 on m1/m2/m3/m3b/m4;
m5 (whose intended loadout already runs motor-2, so the t2 tier ties T1 exactly) uses
the T1↔T3 midpoint instead; m6's boss-time family steps T2/T3 through the intended
loadout's own measured `bossKillTick` spread (a bespoke probe — `--percentiles`
measures mission duration, a different metric). Wired the `t2` tier into
`tools/simulate.ts` (`--loadout t2`) and `tools/balance-sweep.ts`
(`baselineLoadoutKeyForStar`), and added a permanent regression test
(`missions.test.ts`: no two time-star thresholds within 1s of each other on any
mission). Verified: full `pnpm balance` (98 combos × 500 runs) — zero
UNREACHABLE/TRIVIAL flags, all 7 missions' intended clear rates in band; the m6
reference-tier re-anchor alternative is deliberately NOT taken and logged as its own
Open entry above.

### First real DPR=2 rendering pass (`DPR_SCALE_FACTOR=2`) — clean, no DPR-specific defects found — verified 2026-07-18
`tools/playwrightHarness.ts`'s own comment on `DEVICE_SCALE_FACTOR` had flagged, since
that env var was added, that every `pnpm audit-taps`/`pnpm screenshot` run in this
project's history had only ever exercised `deviceScaleFactor=1` — meaning the whole
dpr-sharp canvas-sizing scheme this game is built around (`layout.ts`'s `px()`/
`fontPx()`, `zoom: 1/DPR`) and `tap-target-audit.ts`'s `world-px / DPR` conversion were
"algebraically correct" by inspection but never actually run at a real non-1 scale.
Closed that gap: ran `DPR_SCALE_FACTOR=2 pnpm audit-taps` (all 22 states, 0 failures —
every tap target's real-pixel math holds at 2x) and `DPR_SCALE_FACTOR=2
SCREENSHOT_OUT_DIR=screenshots-dpr2 pnpm screenshot` (all 75 shots, 0 failures; output
dir already covered by `.gitignore`'s `screenshots-dpr*/` pattern from whenever this env
var was first added). Read a representative sample by eye (hub main menu, a shop tab and
its tour modal, a combat HUD frame, a full-screen narrator modal, dispatch reinforcements
with its coach-mark arrow, the alpha notice, a boss fight, the densest tutorial coach-mark
overlay, the mission-detail star grid) at the resulting 1920×1080 canvas — text stayed
crisp with no blur/misalignment, every button/coach-mark box/arrow scaled proportionally
with its target, no new overflow or truncation anywhere the DPR=1 baseline didn't already
have. One visual artifact spotted in `combat-m6-boss` (the boss's priority-target reticle
overlapping the "LEVIATHAN" mission-title row) turned out to be present identically at
DPR=1 too, not a DPR=2 regression — and it's already fully explained by the existing
`MIN_BOSS_HP_OVERLAY_TOP_Y` comment (`CombatScene.ts`): that fix's own scope was the HP
bar/label only, explicitly not the reticle, and explicitly a synthetic-tooling-only
concern (a real player never sees m6's boss before its title has long faded). Net result:
this project's dpr-sharp rendering approach holds up under real verification, not just
algebraic inspection — closes `docs/plans/comprehensive-coverage-sweep.md`'s Phase 0 item.

### Voluntarily abandoning the Daily Mission with a live ship showed a red "SHIP DESTROYED" over "HULL 100%", plus a full death-explosion animation and a dead, still-interactive exit-confirm modal for 600ms — fixed 2026-07-18
Found during a `/polish-loop` general-sweep round: regenerated the full screenshot suite
and read `result-scene-daily.png` — title "SHIP DESTROYED" in red, directly over "COINS
EARNED +80", "NEW BEST!", "KILLS 5/5", "HULL 100%". That shot's own setup
(`tools/screenshot.ts`) calls `combat.confirmExit` (the ABANDON button) mid-mission, not a
real defeat. Root cause: `core/tick.ts`'s `abandonRun()` (called only by the Daily
Mission's voluntary-quit path — campaign missions never call it, they just leave silently
with no ResultScene) unconditionally sets `state.status = 'defeat'`, by design, so
`buildMissionResult` (which throws on `'running'`) can score and bank the partial run's
coins — sound and unchanged. The bug was entirely downstream, in the view layer:
`viewmodel/result.ts`'s `ResultViewModel.status` was `result.status` verbatim, so an
abandon was indistinguishable from a real hull-zero death by the time it reached
`ResultScene.ts`, which rendered any non-victory as red "SHIP DESTROYED" — and
`CombatScene.ts`'s `maybeFinish()` played the full `playDeathAnimation()` (red edge
vignette, camera shake, 3 explosion-particle rings, ship-sprite fade) for the same case.

Fixed view-layer only, `state.status` itself untouched: `CombatScene.ts` gained a
`wasAbandoned` field (reset alongside `finished` in the per-run reset block — Phaser
reuses the scene instance across `scene.start()` calls, so an unreset flag would mislabel
a LATER real defeat), set only in `confirmAbandon()`'s daily branch, threaded through
`ResultSceneData` to `computeResultViewModel`, which now derives a new `outcome: 'victory'
| 'defeat' | 'abandoned'` field defensively (`status === 'defeat' && wasAbandoned === true
? 'abandoned' : status`, so a stray flag can never relabel a victory) — `status` stays the
untouched scoring source of truth for stars/coins/buttons, `outcome` exists purely for
`ResultScene`'s title/color. `ResultScene.ts` now looks up title/color from
`Record<Outcome, …>` tables: abandoned gets amber "MISSION ABANDONED" (matching this
scene's existing advisory-amber use, e.g. the w0-branch prompt), a real defeat keeps red
"SHIP DESTROYED". `maybeFinish()` skips `playDeathAnimation()` for the abandoned case.

Two issues surfaced by Fable's post-implementation review, both fixed in the same pass:
(1) a doc comment claimed "hull-zero/timeline-exhausted defeat" as the two sources of a
`'defeat'` status — false, `resolveOutcome` (`core/tick.ts`) never resolves timeline
exhaustion to defeat, only hull-zero and `abandonRun()` do; corrected. (2) a real
regression this fix introduced: `confirmAbandon()` cleared `this.exitConfirmObjects` with
a bare `= []` instead of calling `hideExitConfirm()` (which destroys the objects) — safe
at HEAD because the only path immediately called `scene.start('HubScene')`, but the new
daily-abandon branch instead stays in the scene for `maybeFinish()`'s 600ms delayedCall
first, during which the "ABANDON MISSION?" backdrop and both buttons stayed fully
rendered AND interactive; tapping CANCEL in that window was a silent no-op (the array was
already emptied). Fixed by calling `hideExitConfirm()` in both branches. Verified live via
a throwaway Playwright probe (checked at 150ms into the window that zero exit-confirm text
objects remain in the scene) since no screenshot's settle-wait is short enough to have
ever caught this — script written to `tools/probe_tmp.ts`, run, deleted per convention.

Verified via `pnpm lint`/`build:dry`/`test` (657 tests, 6 new — `viewmodel/result.test.ts`
covers the `outcome` derivation matrix: victory+flag-true stays victory, defeat+omitted/
false stays defeat, defeat+true becomes abandoned, `status` itself never changes), the
full `audit-taps`/`screenshot` sweep (22 states / 75 shots, 0 failures), and visually
re-read `result-scene-daily.png` (now amber "MISSION ABANDONED"), `result-scene-defeat.png`
(a real m6 hull-zero defeat — unchanged red "SHIP DESTROYED", confirming no regression),
and `result-scene.png` (a real victory — unchanged).

### A player who quit/crashed on the alpha notice screen before tapping CONTINUE would permanently lose the one-time hub button tour — fixed 2026-07-18
Found via Fable's review of a `/polish-loop` round verifying the earlier AlphaNoticeScene
work. `BootScene.ts`'s `create()` was persisting `onboardingSeen: true`
(`acceptOnboarding`) immediately on every boot where the save was still fresh —
*before* `AlphaNoticeScene` (an unconditional, every-launch, no-skip screen the player
must actively tap CONTINUE on) had even rendered. A first-launch player who closed the
tab/app or crashed while looking at the alpha notice, then relaunched, would find
`onboardingSeen` already `true` from the aborted attempt — so `isFirstLaunch` computes
`false` on the real, completed launch, `{ showTour: false }` gets forwarded to
`HubScene`, and the one-time coach-mark tour never fires, despite the player never
having actually reached the hub before. Fixed by moving the persist call out of
`BootScene.create()` and into `AlphaNoticeScene.continueToHub()`, gated on the same
`showTour` flag `BootScene` already computes — so `onboardingSeen` only flips to `true`
once the player actually taps CONTINUE and is on their way to `HubScene`, not just from
reaching the notice screen. Verified with a live Playwright probe: reset to a fresh
save, land on `AlphaNoticeScene`, reload without continuing (simulating the crash/quit),
confirm still on `AlphaNoticeScene` on the next load (not skipped past it), then actually
tap CONTINUE and confirm the hub tour's "SKIP TOUR" text renders in `HubScene` — probe
script written to `tools/probe_tmp.ts`, run, and deleted per convention. Also re-ran
`pnpm lint`/`build:dry`/`test` (651 tests) and the full `audit-taps`/`screenshot` sweep
(22 states / 75 shots, 0 failures) since this touched two `src/view/` files.

### Two tutorial narrator lines overclaimed a mechanic the player's own gear doesn't actually have — fixed 2026-07-17/18
Found via a `/polish-loop` round specifically dedicated to tracing every tutorial
narrator line's factual claims to the actual implementing code, not just re-reading them
for plausibility (`missions.ts`'s `T1`-`T4_NARRATOR_EVENTS`). Two real inaccuracies:
(1) t2's GENERATOR line claimed a better module "raises that capacity and refill rate"
— refill rate (output) does scale up universally across all 4 generator kinds
(`items.ts`'s `GENERATOR_BASE`), but capacity does NOT: torrent (the exact generator
`TUTORIAL_LOADOUT_BASE` gives every tutorial, including t2 itself) has `caps`
`[50,45,40,38,35]`, DECREASING with level — its own "high output, small buffer"
identity, a deliberate design tradeoff, not a data bug. A player following this advice
literally on their own starting gear would see capacity shrink, the opposite of the
claim. (2) t2's DISPATCH REINFORCEMENTS line claimed "which cards show up depends on
your... choice" while the player is about to see t2's own (and only) support call,
which is scripted via `firstOfferIds` (`createAbilityOffer`, `core/cards.ts`, checks
`supportCallsDone === 1` first and returns the scripted ids unconditionally,
completely bypassing the subscription-derived pool) — the claim was false for the exact
call it was describing. A separate residual (caught by Fable's post-implementation
review, fixed in the same pass): the first fix's rewording ("after it, which cards show
up depends on...") still overclaimed, since EVERY tutorial's `resolveForcedLoadout`
deliberately sets `subscriptionCardIds: []` (`loadouts.ts`, "not a fidelity gap to
fix"), so even a later, non-scripted call within a tutorial falls back to the full card
catalog, never the real subscription — the claim is only ever literally true on real,
non-forced missions. Final wording: "on real missions, which cards show up depends on
your DISPATCH REINFORCEMENTS choice back at base." Also fixed the same round: w0's third
narrator event said "Three paths open from this station" but only ever described two
(matching `ResultScene.ts`'s actual two-button w0-branch, TUTORIAL/EXPLORE) — a plain
internal miscount, not a code-drift issue; low real impact since w0 is currently
unreachable (see the open `w0`/`firstBranchChoice` entry below) but fixed for whenever
`WelcomeScene` ships. All other tutorial lines (t1, t3, t4, and w0's remaining events)
were traced to their implementing code and confirmed accurate — including t1's
shield-first collision routing and burst-return targeting only OTHER surviving enemies
(`conveyor.ts`/`combat.ts`), t3's regen-exceeds-DPS numeric claim (matches
`GUARDIAN_REGEN`'s own comment: 22 HP/s regen vs. 20 DPS base), and t4's gifted-supplies
kinds/effects. Also confirmed `CombatScene.ts`'s `NARRATOR_ARROW_TARGETS` still
correctly matches every tutorial's current line indices/count (edits were in-place text
changes only, no reordering, so no drift). Verified via `pnpm lint`/`build:dry`/`test`
(651 tests) plus a live Playwright probe paging to each edited line and screenshotting
it — all three render cleanly, no text overflow, arrow positioning unaffected.

### Boss HP overlay (bar + numeric label) rendered off-canvas for the first several seconds of every boss fight — fixed 2026-07-17/18
Found via a `/polish-loop` round focused on combat HUD legibility ("boss HP bar at
various fractions"), checking a fraction never verified before: near-full/just-spawned.
`CombatScene.ts`'s `drawEnemyHpBar`/`updateEnemyHpLabel` position an enemy's overhead HP
bar/label at `sy - (isBoss ? 58 : 34)` (sprite screen-Y minus a fixed offset). Every
enemy's `sy` equals exactly `GAME_TOP_Y` (30 logical px — `laneToY`'s
`distance/LANE_LENGTH` term hits 1 at spawn, cancelling the radius-dependent term) the
instant it spawns. For ordinary enemies (offset 34) that's a ~4px overshoot, gone within
a tick of normal movement — imperceptible. For the boss specifically (offset 58, speed
0.25, plus its own deliberate APPROACH/STALL cycle — `conveyor.ts`'s F3 anticlimax fix,
untouched here) it's a real, multi-second window (~3-4s, confirmed via live probe: at
boss spawn the computed label Y was negative, ~-29) where the bar AND the numeric label
(added earlier the same session — playtest feedback: "I want to see number of max hp and
current hp") are both clipped off the top of the canvas, genuinely invisible, while the
boss's own (much larger) sprite stays visible. Also affects the daily mission's
`isBoss: true` mini-boss (`dailyMission.ts`), confirmed via the same live probe. Planned
with a Fable pre-implementation review (which caught that a shared floor across ALL
enemies — my first draft's instinct — would cause two closely-spawned regular enemies to
render their bars/labels exactly coincident, overprinting conflicting numbers; corrected
to a boss-only clamp) and verified with a Fable post-implementation review plus live
probes confirming both `isBoss` consumers (m6's Leviathan, the daily mini-boss) now
render a real, populated, legible label. Fixed by extracting the duplicated bar-top
formula into one shared `hpOverlayBarTop(sy, isBoss)` helper (previously copy-pasted in
both functions) and clamping it to `MIN_BOSS_HP_OVERLAY_TOP_Y = GAME_TOP_Y + 16`, boss-
only. `pnpm lint`/`build:dry`/`test` (651 tests) clean; `pnpm audit-taps` unaffected (this
only moves a render position, no interactive elements changed). This fix's own permanent
regression coverage turned out to be broken (see the `advanceUntil` fix immediately
below, found investigating why `combat-m6-boss.png` didn't actually show a boss) —
fixed together, same round.

### `advanceUntil` silently returned on timeout/early-mission-end instead of failing — `combat-m6-boss`/`combat-m3b-booster` had been capturing the wrong state, unnoticed, reported as "0 failures" — fixed 2026-07-17/18
Found via Fable's review of the boss-HP-label fix above, while checking why
`combat-m6-boss.png` (the fix's own regression coverage) didn't actually show a boss.
`tools/playwrightHarness.ts`'s `advanceUntil` polls `combat.inspect()` between
`fastForward` batches and used to silently `return` the current snapshot in THREE cases
— predicate satisfied, mission status left `'running'` (defeat/victory before the
predicate ever fired), or the tick budget exhausted — with no way for a caller to tell
success from failure short of manually re-checking the returned snapshot against its own
predicate. Grepped all 17 real call sites (`tools/screenshot.ts`): zero of them did that
check. Concretely proven wrong for two: `combat-m6-boss`'s `advanceUntil(page, s =>
hasKind(s, 'boss'))` (default `maxTicks=3000`) silently returned a boss-less frame,
because m6's boss doesn't spawn until timeline tick 2540 and the starter loadout (no
`equip()` in this shot) reliably loses to m6 well before then — `blocksConveyor`
enemies freezing `timelineTick` (`conveyor.ts`) meant even a stronger loadout would need
well over 2540 *attempted* ticks to actually reach the boss's spawn point.
`combat-m3b-booster` had the same disease (starter loadout dies to m3b's strikers before
a booster ever spawns) — both had presumably been silently wrong for a while, with `pnpm
screenshot` reporting a clean "0 failures" the entire time. Fixed by making
`advanceUntil` throw a descriptive error (mission id, tick, `timelineTick` — a NEW
`CombatSnapshot`/`cheatInspect` field added alongside this fix, since `tick` alone can't
distinguish "still early" from "stuck behind a conveyor freeze" — status, hull, energy,
enemy kinds present) whenever it's about to return without the predicate satisfied,
instead of ever falling through silently. Planned with a Fable pre-implementation review
that caught two real risks a naive implementation would have introduced: (1)
`combat-low-hull-vignette`'s own setup *relies* on the old fall-through behavior at
hull=0 (its own comment said so) — fixed by checking the predicate before the
mission-ended guard, so a hull=0 defeat snapshot still succeeds via the predicate
(`hull/maxHull < 0.15` is still true at 0), never needing to fall through at all; (2) a
setup throw would skip `shot.cleanup` entirely (previously only ran in the success
path's tail), which for `cleanup: restoreBaseline` shots would leave the save on a
broken/mid-mission state that every LATER shot in the batch would then silently render
against while still reporting ✓ — the exact same disease this fix exists to catch, just
relocated and made worse by this fix increasing how often setup throws. Fixed by moving
`shot.cleanup` into a `finally` block (with its own inner try/catch so a cleanup failure
is reported, not swallowed, and doesn't crash the batch). Re-running the full batch
after the throw-behavior change alone correctly surfaced exactly the two failures
predicted above (verified via the new error message text, not assumed); fixed both
(`combat-m3b-booster` needed `equip('pulse-3')`, matching an identical precedent already
used by `combat-m2-tank`/`combat-m3-blocker` for the same reason; `combat-m6-boss`
needed `equip('pulse-4')` + `equip('shield-wall-3')` AND `maxTicks` raised to 5000) and
re-verified the full batch: 75/75 shots succeed for real, `pnpm audit-taps` 22/22 states
pass, `pnpm lint`/`build:dry`/`test` (651 tests) all clean. Note (not itself a bug,
flagged by Fable's review): `combat-m6-boss`'s new `equip('shield-wall-3')` leaks
forward into every later shot that doesn't re-equip its own shield (no `cleanup` touches
equipped items, matching identical pre-existing behavior from `combat-m2-tank`/`m3-blocker`/
`result-scene`'s own equips) — full-batch and selective (`pnpm screenshot -- <name>`)
runs of a later shot can therefore render a different shield tier depending on which
other shots ran first in the same batch. Not new, not fixed here, but worth knowing.

### Shop/dispatch coach-mark tours highlighted an empty box — the target's own label text was hidden behind the dim backdrop — fixed 2026-07-17/18
Found via a `/polish-loop` round's screenshot sweep (`hub-shop-tour-step-1.png`,
`hub-shop-tour-step-3.png`, `hub-dispatch-tour-step-2.png`): every step of the shop tab
tour and dispatch reinforcements tour highlighted a visibly EMPTY box — no label text
inside it — while un-highlighted sibling rows/tabs elsewhere on screen still showed their
(correctly dimmed) labels. Root cause: `HubTour.ts`'s coach-mark highlight works by
raising ONE tagged GameObject's depth above the tour's dim full-screen backdrop. That's
correct for the main-menu tour, whose targets are `addTextButton` results — a single
Text object with its background baked into the same object's style. It's wrong for the
shop tab tour and dispatch tour: those targets (`buildShopContent`'s `SHOP_TABS` loop,
`renderDRLeftPanel`'s subscription rows, both `HubScene.ts`) are built from MULTIPLE
separate sibling GameObjects — one background `rectangle` plus one-or-more `text` labels
(dispatch rows have three: name, dots, statusText) — and only the background rectangle
had ever been tagged with `.setData('tourId', ...)`. The untagged label(s) stayed at
their original (lower) depth and rendered hidden behind the backdrop, exactly the
opposite of what a coach-mark tour should show. Fixed by changing `HubTour`'s
one-tourId-to-one-object model to one-tourId-to-ALL-matching-objects: `findTargets`
(renamed from `findTarget`) returns every GameObject sharing a tourId via `.filter`, each
gets its depth raised and interactivity disabled, and the highlight ring's bounds are the
`Phaser.Geom.Rectangle.Union` of all of them. Tagged the previously-untagged label Text
objects at both call sites with the same tourId as their row/tab's background. The
restore step (`clearStep()`) only re-enables input on objects that were actually
*enabled* beforehand (tracked per-target as `wasEnabled`, captured before
`disableInteractive()` runs) — not just "had an `InteractiveObject` at all" — so a label
Text (never interactive) doesn't get accidentally made clickable-with-no-handler after
the tour ends, which would silently swallow taps meant for the row underneath it (Phaser
input is `topOnly`). Planned with a Fable pre-implementation review (confirmed root
cause/scope, caught the interactivity-restoration subtlety and the exact Phaser 3.90
`disableInteractive()`/`setInteractive()` semantics needed to implement it correctly) and
verified with a Fable post-implementation review plus a live Playwright check: after
ending the shop tour, clicking directly on a tab's *label text* (not its background)
still correctly switches tabs — the exact regression a naive blind-restore would have
caused. Re-verified all 4 main-menu tour steps render pixel-unchanged (single-object case
untouched by the data-model change), and added a previously-missing `hub-shop-tour-step-2`
screenshot (steps 1/3 alone had left the middle step — and this exact bug class — unverified).

### `combat-low-hull-vignette` screenshot barely showed the vignette effect it was meant to demonstrate — fixed 2026-07-17/18
Found via the same `/polish-loop` screenshot sweep. The shot's `advanceUntil` stop
condition (`hull/maxHull < 0.3`) sat just barely under `CombatScene.ts`'s
`VIGNETTE_THRESHOLD` (0.35), so the captured frame showed the red edge vignette at only
~14% of its own max intensity — a ~4px-wide, ~5%-alpha sliver, functionally invisible in
the actual PNG despite the shot's whole purpose being to demonstrate this effect. Tightened
the stop condition to `< 0.15` (intensity ≈0.57, clearly visible edge glow) — not lowered
further: m6's boss deals ~37.5% of the starter ship's max hull per collision, and
`advanceUntil` only checks its predicate between 20-tick batches, so a much lower target
risked the run reaching defeat before ever satisfying it (an accepted, non-fatal outcome
either way — `advanceUntil` falls through to the final snapshot, and hull=0 there is an
even stronger vignette — but not worth chasing purely for a marginally stronger effect).
Re-verified the regenerated screenshot shows a clear, unambiguous red glow at 10/80 hull.

### t3 (Support Cards)'s scheduled support call could never fire — the mission's entire premise was silently dead — fixed 2026-07-17
Found while re-checking tutorial timing/narration after a live playthrough
("is there anything delayed?"). `t3`'s single guardian (`GUARDIAN_REGEN`) has
`blocksConveyor: true`, and `timeline.ts`'s `advanceTimeline()` freezes
`state.timelineTick` **entirely** while any `blocksConveyor` enemy is alive (the same
mechanic that makes a blocker a DPS check). `supportCallTicks` are checked against that
same `timelineTick` — so a call scheduled for any tick after the guardian's own spawn
tick (`seconds(3)`) can never be reached while the guardian lives, and the guardian
can't be killed *without* the very card that call was supposed to offer. The original
`supportCallTicks: [seconds(6)]` was therefore unreachable, not occasionally slow —
confirmed via a live probe (`fastForwardToOffer`, which stops the instant an offer
opens rather than auto-resolving it like `fastForward` does): the mission ran to
victory at tick 372 with `hasPendingOffer` never once true. The guardian died to base
weapon damage alone, directly contradicting the mission's own blurb ("You need the
right card to break through") and meaning the `first-support-call` narrator line
(rewritten the same day — see the entry below) could never display either. Fixed by
moving the call to `seconds(2)` — before the guardian's spawn tick, so it's checked
before the freeze takes effect. Re-verified live (`fastForwardToOffer` now returns
`hasPendingOffer: true` at tick 20, with the correct `firstOfferIds` cards showing) and
via `pnpm sim --mission t3 --loadout forced --runs 1000`: 100% clear rate, and average
duration actually *dropped* (35s+ before the fix → 14.0s after) since the player now
gets the damage card in time to use it, instead of grinding the guardian down with base
DPS alone. A useful methodology note for next time: `combat.fastForward` auto-resolves
any pending offer (picks card 0) as part of advancing, so polling `combat.inspect()`
between `fastForward` batches cannot detect whether an offer opened and closed inside
one batch — `fastForwardToOffer` (which stops instead of resolving) is the only reliable
way to check.

### Daily Mission — force-quit/crash mid-run left the attempt unconsumed, allowing unlimited reroll retries — fixed 2026-07-17
Found via Fable's design review of the feature's first implementation. The daily's
"one attempt per day" save state (`save.daily.lastPlayedDate`) was only written at
*payout* (`applyDailyResult`, called from `CombatScene.maybeFinish()`), never at run
start. Since `abandonRun`/`confirmAbandon` only cover the polite in-game EXIT button,
force-quitting the app, closing the tab, or reloading mid-run built no result and left
`save.daily` untouched — the daily stayed "available," and since each attempt gets a
fresh `randomSeed()` (crit/miss rolls, spawn jitter, card offers), a player could retry
indefinitely until a good roll. On a Capacitor Android app this is a two-swipe gesture,
not a theoretical edge case. Fixed by reserving the attempt the moment a run **starts**
(`reserveDailyAttempt`, called from `CombatScene.create()` before the first tick) rather
than when it ends — `save.daily.paid` distinguishes "reserved" from "actually paid out,"
and `isDailyAvailable` deliberately checks only `lastPlayedDate` (not `paid`), so a
reservation with no payout still counts as the day being used. A crash now costs the
day's attempt with zero payout — harsh, but it's the only way "one shot" can actually
hold. Also fixed a related date-skew risk the same review flagged: the date key is now
captured once at reservation time and reused at payout (`CombatScene.dailyTodayStr`)
instead of being recomputed from a fresh `new Date()`, which could otherwise pay out
against the wrong calendar day on a run long enough to cross local midnight. Verified via
a live end-to-end Playwright check (start → simulate crash via page reload → confirm
`save.daily` still shows the reservation with `paid: false` and `coins` unchanged → retry
blocked, redirected to hub → separately, a real completed run still pays out correctly).

### Mission info panel's START button wasn't gated on `canStart` — fixed 2026-07-16
Found 2026-07-16 (Fable's review of a `/polish-loop` round that added the
`selectMission` cheat). `renderMissionInfoPanel` (`HubScene.ts`) always rendered a
functional START button for whatever `selectedMissionId` was set, regardless of lock
state; `MissionDetailViewModel.canStart` was computed (`viewmodel/hub.ts`) but never
read. Real players couldn't reach this — galaxy-node taps are gated at the
pointer-handler level, locked nodes aren't interactive — so it was never a live bug, but
`__cheat.selectMission('m5')` on a save that hadn't unlocked m5 showed a working START
that launched it anyway (confirmed via `hub-mission-detail-locked` screenshot, added
this round alongside the cheat). Fixed as defense-in-depth, matching every other shop
system's real-gating pattern: the button now renders "LOCKED" (dimmed, no-op onClick)
when `!detail.canStart`. Re-verified the unlocked case (m1) still shows a real,
clickable START and the audit state still passes (14 interactive elements, unchanged).
**Follow-up (2026-07-17, Fable's review of the comprehensive-coverage-sweep round):**
the first fix only gated the button — the same screenshot that closed this issue also
showed the panel printing the real mission name, duration, and full star list for the
locked mission, the exact information the galaxy map's "???" label exists to hide. Same
root cause, same defense-in-depth reasoning; fixed by returning a plain "LOCKED" label
for the whole panel (name/stars included) before any of that content renders, not just
gating the button at the bottom.

### Mission detail panel's star list overflowed off the bottom of the screen — fixed 2026-07-16
Found via `/polish-loop` — no `__cheat` hook reached the galaxy-map mission info panel
(`HubScene.ts`'s `renderMissionInfoPanel`) before this round, so it had never been
screenshot-tested. Added `__cheat.selectMission(id)`. First real screenshot
(`hub-mission-detail-main`) showed exactly the bug the math predicted: main missions
render 8 stars at 18px/row starting `topY+22` inside a 152px-tall panel — the last 2 of 8
lines rendered past both the panel's own bottom edge and the 540px screen edge entirely,
invisible to any player. Fixed with a two-column layout (4 rows/column, derived from
named `STAR_ROWS_PER_COL`/`STAR_COL_GAP`/`STAR_ROW_H` constants) — re-verified for both
the 8-star main-mission case (m1) and the 6-star boss-mission case (m6, which also
visibly confirms the already-tracked collapsed-threshold duplicate-star-label issue
below "ResultScene star labels...").

### Narrator-modal view desync: dismissing one scripted narrator event could leave the *next* one's content stuck showing the previous one's text forever — fixed 2026-07-16
Found via `/polish-loop` while adding coverage for `CombatScene.ts`'s narrator modal
(`showNarratorLine`/`syncNarratorModal` — the blocking popup with its own CONTINUE/NEXT
button, driven by `MissionSpec.narratorEvents`; not the passive bottom `NarratorBar`
strip, which is unaffected). `syncNarratorModal()`'s guard only detected "a new event
should render" via `narratorModalObjects.length === 0` — true only while nothing is
currently displayed. If `pendingNarrator` transitions directly from one non-null event
to a *different* non-null event without a real rendered frame observing the intervening
`null` (confirmed reproducible: two `__cheat.combat.dismissNarrator()` +
`fastForwardToNarrator()` calls issued back-to-back with no wait between them — verified
via direct `this.core` state dumps that the *core* was correctly on event 2 while the
*view* kept showing event 1, indefinitely, with no error), the modal never refreshed.
**Correction (Fable's review of this round caught the original version of this
paragraph reasoning wrong):** it is not frame timing that protects real players —
`CombatScene.update()`'s tick-catch-up loop can cross a tick boundary and fire the next
narrator event *within the same frame* that just resolved the previous one, before
`syncNarratorModal()` runs later in that same `update()` call; a real click is not
inherently safe. What actually protects players today is `W0_NARRATOR_EVENTS`' spacing
(0s / 7s / 17s apart, `missions.ts`) — the next event's `atTimelineTick` is never the
tick immediately after the previous one resolves. Two narrator events scheduled ~1 tick
apart would have made this reachable by an ordinary player click, no cheats involved.
The fix covers that case regardless (it's not spacing-dependent), but don't rely on
spacing as the safety net when scheduling future `narratorEvents`. The standard
`combat.fastForward` cheat also can't surface this specific symptom, but for a different
reason: it resolves narrators inside one synchronous loop with no real frame in between
at all, so the modal never partially renders either way — this needed the specific
stop-and-inspect pattern `fastForwardToNarrator` introduces to observe.
(Separately noticed while verifying, pre-existing and unrelated: `checkNarratorEvents`
dedupes by exact `atTimelineTick` value (`tick.ts`) — two events sharing a tick would
silently drop the second. Not a problem for any current mission's data.)

Currently zero real-player impact since only `w0` defines `narratorEvents`
and `w0` is unreachable (see the `w0`/`firstBranchChoice` entry above) — but a real,
reproducible correctness bug in code that ships today, and exactly the kind of thing
that would have silently bitten whoever eventually builds `WelcomeScene` and makes `w0`
live. Fixed by comparing the actual `lines` array reference (`state.pendingNarrator`,
freshly allocated per event by `tick.ts`) instead of the object-count proxy — new
`displayedNarratorLines` field, reset alongside `narratorModalObjects` on mission
restart. Re-verified via screenshots of all of `w0`'s narrator events in sequence.

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
