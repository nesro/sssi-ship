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

### `pnpm onboarding`'s t1-win coin assertion is stale — pre-existing, unrelated to 2026-07-25's narrator-popup work
Found while re-running `pnpm onboarding` end to end to verify the new defeat-hint popup
didn't break the tool's t1/t2 defeat flow (it didn't — every other check passed,
including both defeat-shop-redirect checks). `tools/onboarding-audit.ts:168` asserts
`afterRetry.coins === beforeRetry.coins + 45` ("30 completion + 15 real kill") for t1's
win payout; the real payout no longer matches. Not touched by today's changes (verified:
no diff in `missions.ts`/`combat.ts`/`result.ts`) — this drifted at some earlier,
unrelated point. Needs the actual current t1 coin math re-derived and the assertion
updated, not touched here since it's out of scope for the narrator/sound fixes below.

### Reported stale main-menu tutorial copy about Settings/Credits — not reproduced
Tomáš (2026-07-24): "main menu tutorial have outdated into about settings, there are
no credits and message anymore." Investigated thoroughly — read `HubTour.ts`,
`HubScene.ts`'s `NAV_ITEMS`/`buildSettingsContent`/`buildCreditsContent`, then verified
live via Playwright screenshots of the Settings panel, Credits panel, and the tour's
own `settings` step — and found nothing stale: CREDITS is a live nav item, the "Hi, I
am Nesro..." developer's note renders under it exactly as before, and the settings
tour step's caption matches both precisely. Not fixed because nothing reproduced.
Likely either an older build/deployment (not this working tree) or a different screen
than the one investigated — needs the actual screen/flow pinned down with Tomáš before
attempting a fix.

### Shield kind is a campaign-wide balance variable that's never actually been validated — every m1-m6 mission trivializes on Reflex/Flux/Bulwark
Found 2026-07-23 verifying the shield-burst-tiers change (`docs/plans/shield-burst-tiers.md`)
— confirmed pre-existing, not caused by that change. `tools/loadoutPresets.ts`'s
`intendedLoadoutForMission(missionId, shieldKindIndex = 0)` has always defaulted every
m1-m6 star threshold to shield-kind-index 0 (Wall), with its own comment admitting kind
variation "isn't worth doubling the matrix." Sweeping all 4 indices (500 runs each,
intended-loadout/greedy) shows this default has been silently hiding a large effect:

```
m1 / wall:    88.8% (floor 85%)
m1 / reflex: 100.0% TOO_EASY — time-t1/hull-50/all-kills TRIVIAL, shield-unbroken UNREACHABLE (1.2%)
m1 / flux:   100.0% TOO_EASY — 5 stars TRIVIAL
m1 / bulwark:100.0% TOO_EASY — 2 stars TRIVIAL
m2 / wall:    77.0% (floor 75%)
m2 / reflex:  81.4% — hull-90 and shield-unbroken UNREACHABLE
m2 / flux:   100.0% TOO_EASY
m2 / bulwark: 95.8% TOO_EASY
m3 / wall:    69.6% (floor 65%)
m3 / reflex:  93.4% TOO_EASY
m3 / flux:   100.0% TOO_EASY
m3 / bulwark: 96.6% TOO_EASY
```
(m3b/m4/m5/m6 show the identical shape: Wall sits near its tuned floor as intended;
Reflex/Flux/Bulwark all land in the 90-100% range, with scattered UNREACHABLE/TRIVIAL
star flags throughout.)

Root cause: Reflex/Flux/Bulwark's own `capacity`/`pulseShieldFraction` stats
(`data/items.ts`'s `SHIELD_BASE`) are simply much stronger than Wall's at the same
level — confirmed independent of the shield-burst-tiers mechanic specifically (t1,
tested with every kind's `burstMode` forced to `'none'`, still clears trivially on
Reflex/Flux even on the starter generator). Since all four kinds share one price ladder
and a same-level kind swap costs 0 coins (`SaveManager.ts`'s `switchItem`), any player
can reach any mission on any shield kind for free — this isn't a hypothetical corner
case, it's a live, cheap path every player can take.

**Not fixed here** (Fable's explicit call when this surfaced mid-review of an unrelated
change): retuning 6 missions × 4 shield kinds' wave/star data is a distinct, much bigger
effort than the task that found it, and deserves its own dedicated pass — likely its own
`docs/plans/*.md` — rather than being folded into an unrelated PR under time pressure.

### t1's shop isn't gated before a fresh player's first attempt — any shield/generator kind is reachable for free, so the tutorial's own regression test doesn't cover every real path into it
Found 2026-07-22/23 during the shield-burst-tiers spec review
(`docs/plans/shield-burst-tiers.md`). All shield (and generator) kinds share one price
ladder, and a same-level kind swap costs `newPrice - currentPrice = 0`
(`SaveManager.ts`'s `switchItem`) — nothing stops a fresh player from swapping away from
the mandatory starter kinds before ever running t1. `src/core/regen.test.ts`'s t1
fail/fix regression test only exercises the default starter path (Wall shield, Torrent
generator); a player who swaps first isn't covered by it. **Not fixed here** (Fable's
explicit call): shop gating is an onboarding/UX feature orthogonal to the shield-burst
mechanic that surfaced it, and belongs in its own spec, not folded into that change.

### `devMode`'s default is read inconsistently between `AlphaNoticeScene` and `HubScene` — one defaults it off, the other on
Found 2026-07-22 by Fable's review of `docs/plans/tutorial-autopilot-review.md`.
`AlphaNoticeScene.ts`'s own `UNLOCK DEV MODE` toggle reads `loadSave().devMode ===
true` (defaults **off** on a fresh/reset save, where the field is `undefined`), while
`HubScene.ts`'s `devMode` getter reads `this.save.devMode !== false` (defaults **on**
for the exact same undefined field). Both are reading the same `SaveData.devMode?:
boolean` — a fresh save shows "UNLOCK DEV MODE" on the alpha screen while Settings'
own DEV TOOLS section is already unlocked underneath it, which is confusing but not
currently harmful (nothing gated behind `devMode` is destructive or hidden from a real
player who'd want it). Not fixed here — pick one default and make both reads agree
(`!== false`, matching `HubScene`'s, seems the more deliberate of the two given it's
already how the rest of the app's dev-tooling behaves) plus a regression test locking
in that a truly fresh save reads the same `devMode` value from both call sites.

### `computeKindRow`'s locked-row `mutation` is never nulled — shop kind-gating is enforced only by HubScene not wiring up the tap, not by the viewmodel or SaveManager
Found 2026-07-21 during pre-implementation review of the generator kind-unlock gate
(`GENERATOR_KIND_UNLOCK_STARS`, `src/data/items.ts`). `SaveManager.ts`'s `switchItem`
checks coins only, never `starsRequired` — by design, the same gate weapon/rear-weapon
kind-unlocking already relies on (see `campaign-simulate.ts`'s `isStarLocked` comment,
which documents this explicitly for its own sim-replication purposes). The real
enforcement is meant to live in the viewmodel: `computeLevelChip` (`src/viewmodel/
hub.ts`) correctly nulls `mutation` when a level is locked, and so does
`computeSubLevelChips` for subscriptions. But `computeKindRow` (same file) does not —
its `mutation` field (`t.equipped ? null : { type: 'switch-item', itemId }`) is built
without checking `t.locked`, so a locked kind row's own view model carries a live,
executable mutation. The lock is enforced today only by `HubScene.ts`'s `renderKindRow`
choosing not to call `.setInteractive()`/wire `pointerdown` when `row.rowState ===
'locked'` — a presentation-layer decision, not a data-layer guarantee. Any code that
invokes `onKindRowTap`/applies a locked row's `mutation` directly (a dev `__cheat.equip`
call, or a future feature that iterates catalog rows applying mutations, e.g. an
auto-buy helper) bypasses the star gate entirely. Not currently exploitable by a real
player (no in-game UI path reaches it, and `__cheat` is `import.meta.env.DEV`-gated out
of production builds), and it is not specific to generator — it affects every kind-gated
system identically (weapon ion/nova, rear-weapon arc/cluster/plasma, and now generator
reserve/steady). `hub.test.ts:227-232` asserts the ion case's mutation is populated even
though ion is locked at 0 stars, i.e. this is asserted/expected behavior today, not an
oversight caught by a failing test. Fix would be to make `computeKindRow` null
`mutation` when `t.locked`, mirroring `computeLevelChip`, plus a regression test
asserting a locked kind row's `tap.mutation` is `null`.

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

### Daily Mission — replay records don't pin which day's generated mission they belong to
`ReplayRecord` stores `missionId: 'daily'` + `seed` but nothing identifying which
calendar day's generated `MissionSpec` produced it — replaying it later resolves
against whatever daily is currently registered via `setDailyMission`, which may be a
different day's mission (or throw, if none is registered). Currently latent: nothing
in live play persists a `ReplayRecord` yet ([Status](design/14-status.md): "Record
exists; playback scene not built") — only the headless simulator's `runMission()` ever
builds one.

**2026-07-19: attempted a fix, found it was wrong, reverted before landing it.** First
attempt: a `missionForReplay(record)` helper that special-cased daily records to call
`generateDailyMission(record.seed)` instead of `missionById('daily')`. This is
incorrect — `record.seed` is `CoreState`'s own RNG seed (`randomSeed()` in
`CombatScene.ts`, a fresh `crypto.getRandomValues()` value every run) and has no
relationship to the *day*-seed (`dailySeedForDate(date)`) that actually generated the
mission spec via `generateDailyMission`. These are two conceptually separate seeds
that happen to share a field name pattern; conflating them would silently reconstruct
the WRONG mission (right shape, wrong escalation curve) instead of failing loudly.

**What a real fix needs:** either (a) a new field on `ReplayRecord` carrying the
day-seed (or date key) itself, threaded from wherever `setDailyMission` registers
today's spec through to whatever eventually persists a live replay — no such path
exists yet, since nothing persists live replays at all — or (b) embed the full
`MissionSpec` in `ReplayRecord` directly instead of resolving by `missionId`, which
sidesteps the whole "which generation" question for the daily case (and, as a bonus,
for any other mission) at the cost of a real, larger `ReplayRecord` and a
`verifyReplay` signature change. Both are genuine design decisions, not a quick data
tweak, and neither has a current caller to validate against — deferred rather than
guessed at a second time.

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

### Manual playtest of m1/m3/m5's reshaped pacing — needs a human, not simulation
`docs/plans/mission-design-and-testing.md`'s "Open item 1." The simulator is structurally
blind to feel; needs a human with a controller. **Needs dev server / Preview, not
actionable headlessly.**

### F6 (minor) — t2/t4 may be one beat too short; §13 tutorial-length table may be stale
`docs/plans/mission-fun-review.md` §F6. Playtest call only, unchanged since 2026-07-11.

## Resolved

### Narrator popup margins, redundant defeat-hint text, and a harsh shield-pulse sound — landed 2026-07-25
Tomáš, three details from actually playing the game after the round-4 + reconciliation
work:
1. "the narrator window have sometimes text too close to the edge of the popup window"
2. "when I die on the first try of t1, there is still some text in the bottom. I don't
   want that bottom text ever again, make sure it's deleted from everywhere. Just add
   another narrator popup window"
3. "the sound for shield refil is terrible. it sounds often, so make it more subtle and
   'space like'"

**1 — narrator modal margins**: `showNarratorLine`'s (`CombatScene.ts`) wordWrap width
was `panelW - 48` (24px margin each side) — a long tutorial line's wrapped text could
run right up against that margin. Widened to `panelW - 80` (40px each side). Applied
the same width to the new popup in item 2 below.

**2 — the defeat-hint text, found appearing TWICE, both removed**: root cause —
this session's own prior round-4 work added `NarratorBar.showInstant(defeatHint)`
(bottom-strip text) during the death animation, but left `ResultScene.ts`'s *own*
separate static defeat-hint text block untouched, reasoning it was "additive, not a
migration." In practice a defeated t1/t2 player saw the identical message twice — once
at the bottom during death, again at the bottom of the result screen seconds later.
Fixed by removing both and replacing them with a single real popup:
- Deleted the `narrator.showInstant(...)` call in `maybeFinish`'s defeat branch, and
  deleted `NarratorBar.showInstant()` itself (now unused — it existed only for this).
- Deleted `ResultScene.ts`'s static defeat-hint text block entirely (the GO TO SHOP
  button and `defeat-shop-redirect` button-set logic are untouched — only the redundant
  text line is gone).
- Added `CombatScene.ts`'s `showDefeatHintPopup(hint, onDismiss)` — visually mirrors
  `showNarratorLine`'s card (same panel/backdrop) but simpler: no page counter, no
  arrow pointer, a single `CONTINUE ▸` button. Shown once, `DEFEAT_HINT_POPUP_DELAY_MS`
  (500ms) into the death sequence — long enough for the initial flash/shake/shockwave
  beat to read before a modal dims the screen. The transition to ResultScene now
  happens on dismissal (`onDismiss`) instead of racing a fixed timer for any mission
  with a `defeatHint` (t1, t2 today); missions without one (t3/t4/m1-m6 defeats) are
  unaffected — still the plain `DEFEAT_EXIT_DELAY_MS` auto-transition.
- Threaded a new `__cheat.combat.dismissDefeatHintPopup()` through the same
  `CombatCheats.ts`/`main.ts` delegate pattern `dismissNarrator` uses, since the popup
  now gates a real transition every automated tool depends on: updated
  `screenshot.ts`'s `result-scene-t1/t2-shop-redirect` fixtures, `tools/
  onboarding-audit.ts`'s `playToEnd` (unconditional no-op-safe call), and
  `tutorialAutopilot.ts`'s `waitForResult` loop (real-tap-driven, matched on the
  popup's distinct `'CONTINUE ▸'` label so it's never confused with the tutorial
  modal's own bare `'CONTINUE'`/`'NEXT →'`).
- `m3b`'s first-booster-appear and `m6`'s boss-appear ambient bottom-bar lines
  (`story.ts`) were deliberately left alone — those are real, actively-used, non-
  blocking mid-combat flavor text, not the redundant defeat-text this complaint was
  about; pausing combat with a modal every time a boss appears would be a worse
  regression than the one being fixed.

**3 — shield-pulse sound reworked** (`synthVoices.ts`'s `fillShimmer`): was a rising
pure-tone sine sweep with a close second harmonic (two audible tones beating together —
read as a chirp/whistle, not "space-like"). Replaced with filtered noise (a soft
one-pole low-pass over white noise, i.e. an airy whoosh) under a much fainter high
partial, longer attack (30ms → 90ms, softening the onset), longer/gentler tail
(`decay` 5 → 3). Also throttled further and played quieter:
`SoundManager.shieldPulse()`'s volume `SFX_VOLUME × 0.22 → × 0.15`; `CombatScene.ts`'s
`SHIELD_SOUND_MIN_MS` (minimum gap between plays) `1400 → 2600`.

**Verified**: `build:dry`/`lint`/`lint:comments` clean, `pnpm test` 779/779 (untouched —
no core logic), `pnpm campaign` 100%/100%, `pnpm pacing` clean, `pnpm audit-taps` 0
failures, `pnpm dlx fallow` no new findings (same pre-existing baseline), full `pnpm
screenshot` batch (77 shots) 0 failures, a forced Playwright capture of the new
defeat-hint popup mid-death (confirms no bottom text anywhere, comfortable margins),
and a full `pnpm onboarding` re-run (found one unrelated pre-existing stale assertion,
logged separately above — every defeat-hint-popup-dependent check passed).

### Reconciled a second, independent audio-visual rework done in a parallel sandbox — landed 2026-07-25
Tomáš had a second agent session running in a separate sandbox at the same time as this
one, working on its own "audio-visual-rework" branch. Both sessions forked from the same
auto-checkpoint commit and independently reworked overlapping territory — this session's
own round 4 (above) plus this branch's earlier modular-enemies/hull-redesign work vs.
the other branch's procedural-SFX system and its own "richer procedural visuals" pass.
Fetched `origin/nesro/audio-visual-rework`, read its full `v2/docs/SESSION_HANDOFF.md`
re-apply guide, and reviewed every piece against this branch's actual current code
before touching anything (not a blind merge) — the user's own instruction was "look at
all the changes and then incorporate it into the code IF you think they are good
changes."

**Adopted, verbatim or near-verbatim:**
- **Procedural SFX synth engine** (`src/audio/synthVoices.ts`, `src/audio/synth.ts`) —
  every SFX is now synthesised into Phaser's audio cache at boot instead of played from
  a sample file, the audio counterpart to `textures.ts`'s baked-glow technique. This is
  exactly the "generate sounds via code" idea from this session's own round 4 that was
  investigated and *deliberately deferred* to a dedicated Fable consultation rather than
  built inline — the other session went ahead and built it well, so there was no need
  to redo that work.
- **`SoundManager.ts` reworked** to match — per-weapon-kind/rear-kind/side-kind
  detune+volume character, new `bossAppear()`/`collision()`/`select()`/`uiClick()`
  events, `shieldPulse()` throttled (`SHIELD_SOUND_MIN_MS`) so shield recharges don't
  drone. Preserved this session's own `pauseOnBlur = false` fix in `attach()` — the
  other branch's version of this file had reverted it, since it forked before that fix
  landed here.
- Wired the new sound events into their real call sites: weapon/rear/side fire now pass
  the actual equipped kind; `Sound.collision()` in `spawnCollisionFeedback`;
  `Sound.bossAppear()` once per mission (new `bossAppearSounded` flag, reset in
  `resetPerRunState`); `Sound.select()` on card pick (`CardOverlay.ts`); `Sound.uiClick()`
  centralized in `widgets.ts`'s `addTextButton` (every button in the game, one call site).
- **Dev soundboard + gallery** (`soundboard.html`/`dev/soundboard.ts`,
  `gallery.html`/`dev/gallery.ts`) — standalone Vite pages for auditioning/tuning SFX
  params live and eyeballing every baked texture in a grid. Dev-only (never in `vite
  build`'s input), gated behind `import.meta.env.DEV` for their in-game launch buttons
  (Settings → DEV TOOLS). Needed `tsconfig.json`'s `include` (+`"dev"`), an
  `eslint.config.js` override for `dev/**`, and `.fallowrc.json`'s `entry` (so the
  dev-only files count as reachable, not dead code).
- **`tools/provision-audio.ts`** + `predev`/`prebuild`/`provision-audio` npm scripts —
  copies the licensed music track from repo-root `sounds/` into the gitignored
  `public/audio/` on a fresh clone, so it never 404s at boot.
- **A real, pre-existing legal-compliance gap, found and fixed**: `docs/design/
  11-visuals-and-audio.md` has always said the CC BY-licensed music track's attribution
  is "required in Credits screen," but `HubScene.ts`'s `ABOUT_TEXT` never actually had
  it — the game was shipping the track unattributed in the real UI. Fixed independent of
  the audio-engine decision above.
- **Small, clean, additive visual polish**, none of it conflicting with existing work:
  `flashEnemyHit`/`flashShipHit` (brief tint-flash on hit, alongside the existing hit
  burst/camera shake), kill-burst particles reworked from flat squares into motion
  streaks + a white-hot spark (`combatEffects.ts`'s `tickBurstParticles`), damage-number
  floats now pop in at 1.5x and settle to 1x (`Back.easeOut`) instead of appearing flat,
  and a new expanding `spawnShockwave` ring on enemy kills and hull collisions (the
  player-death version of this idea was already superseded by this session's own round-4
  death-animation rework — not touched).
- **A shared `src/view/starfield.ts` module** — extracted this session's own round-4
  starfield tuning (`starTierParams`/`starTint`: tier-coherent alpha/size/speed/twinkle,
  4-way tint split) into a reusable module, then wired it into `HubScene.ts` (replacing
  its own much flatter all-white, no-twinkle starfield), `ResultScene.ts`, and
  `AlphaNoticeScene.ts` (neither had a starfield at all before). `CombatScene.ts` was
  refactored to import the same two pure helper functions instead of keeping its own
  duplicate copies (pure extraction, no behavior change) but otherwise keeps its own
  inline `addStarfield`/`updateStars` tied to its shared `thrusterPhase` clock —
  deliberately not migrated to the shared module's own tick function, to avoid any risk
  to this session's own already-verified round-4 combat starfield.

**Deliberately NOT adopted** (would have been regressions, not improvements, against
work already done in this branch):
- **Enemy/ship texture "painter" enrichments** — the other branch's fork predates this
  session's own hand-drawn 13-hull enemy redesign (`docs/plans/enemy-hull-redesign.md`)
  entirely; its enemy shapes are the old simple diamonds/rects with a few extra strokes,
  not a replacement for the current complex hulls. Confirmed via the adopted gallery
  tool itself, screenshotted against the current 102-texture set.
- **Enemy idle animation (universal spin + scale-pulse)** — would have reintroduced the
  exact "continuous spin tumbles a directional hull" bug this session's own Fable review
  already found and fixed (`addEnemyAnimTween`'s per-kind spin/wobble split). Their
  version spins tank/blocker/striker/etc., which the redesigned hulls can't tolerate.
- **Enemy bolt rework (3 stacked rectangle layers)** — inferior to this branch's own
  baked-texture, distinct-shape-per-`weaponKind` bolts (`enemyBoltStinger`/`Battery`/
  `Lance`), and a direct regression against Tomáš's own round-4 item 8 ask ("do not
  ever use just plain rectangle as something").
- **Generator core "richer" rework (bigger pulsing blob + white-hot center)** — still an
  alpha/radius sine pulse under the hood, which directly contradicts Tomáš's own
  explicit round-4 ask ("don't use pulsating circle animation, looks cheap — I like the
  rotating circle one"), already addressed this session by reworking every enemy/player
  generator core into the rotating-dot technique.

**Verified**: same full suite as round 4 —
`build:dry`/`lint`/`lint:comments` clean, `pnpm test` 779/779 (untouched — no core
logic in any of this), `pnpm campaign` 100%/100%, `pnpm balance` all 7 intended
loadouts at their documented rates (unchanged), `pnpm pacing` clean, `pnpm audit-taps`
0 failures across 21 states, `pnpm dlx fallow` no new findings (same 4 pre-existing
baseline items), full `pnpm screenshot` batch (77 shots) 0 failures, plus a standalone
Playwright check of `/soundboard.html` and `/gallery.html` (no page errors, gallery
renders all 102 current textures).

### Round 4 polish pass — landed 2026-07-24, docs/plans/round4-brief.md
Tomáš's 8-item follow-up round after the visual-language audit: "use fable again and
let fable write you what to do." Investigated each item against the real code
(`docs/plans/round4-brief.md`), handed to Fable for the concrete plan, implemented
exactly as returned, in Fable's own recommended sequencing (rotation-dot technique
first, since two other items build on it).

1. **Rotating-dot replaces pulsating-circle, 3 sites** (`CombatScene.ts`) —
   `drawEnemyGeneratorCore` (every enemy), BOSS's stall-tied ring, and
   `renderBoosterBuffs`'s shield-regen self-glow all switched from an alpha/radius
   sine pulse to ticks orbiting a fixed core/ring, mirroring GUARDIAN's own rotating
   ring dots (the one Tomáš explicitly liked — "the rotating circle one").
2. **Player ship module animation parity** (`shipRenderers.ts`) — front/rear/side gun
   indicators gained a `recoil` kick (0→1, decaying ~150ms) tied to real
   `shotsFired`/`rearShotsFired`/manual-fire deltas, the same fire-tell TURRET already
   had; `drawGeneratorCore` reworked to a fixed core + 2 orbiting dots whose rotation
   speed scales with `energyFrac` and recolors to the brownout hue below
   `BROWNOUT_THRESHOLD`; side-weapon indicator alpha now dims with charge fraction.
   Also fixed `renderGenerator`'s own capacity read (raw `loadout.generator.capacity`
   → `computeEffectiveStats().generatorCapacity`), the same class of bug as item 6's.
3. **Death animation, longer and more eventful** — `DEFEAT_EXIT_DELAY_MS` 1400→2000;
   flash/shake intensified; 3 burst waves → 4, escalating in size; new expanding
   shockwave ring; new slow ember-drift stage filling the back half of the hold
   instead of sitting idle; ship-attached fade re-timed to match.
4. **Starfield intensified further** — `COUNT` 65→110; every tier's alpha/size/speed
   boosted; twinkle extended from near-only to near+mid; tint split from 2 accent
   colors to 4 (cyan/amber/new magenta-violet/white).
5. **Tutorial SKIP button removed** — `showNarratorLine` no longer offers a second
   button that dismissed the whole remaining narrator sequence in one tap; `NEXT →`/
   `CONTINUE` (re-centered) is now the only way to progress, one line at a time.
   Confirmed the dev-only tutorial autopilot was never affected either way — it only
   ever taps `NEXT →`/`CONTINUE`.
6. **Player ship status bars: numbers + energy bar + a real capacity bug fixed** —
   `renderShipStatusBars` now shows numeric current/max labels on all three bars and
   adds a third (energy) bar; the shield bar was silently reading raw
   `loadout.shield?.capacity` instead of `computeEffectiveStats().shieldCapacity`, so
   card/ability shield-capacity bonuses showed on the side panel but not under the
   ship — fixed. `SHIP_STATUS_BAR_Y_OFFSET`/`GAP` retuned (36→30, 3→2) for the extra
   row.
7. **Enemy shield/generator mini-bar** — a small 2-segment readout
   (`drawEnemyModuleMiniBar`) under each enemy's HP bar: a shield-fraction fill bar
   (only for enemies with a real SHIELD module) and a generator-activity pip (only for
   `generatorKind !== 'none'`) — not a fabricated energy number, since `EnemyState`
   has no bounded energy pool, only a regen rate.
8. **The last plain-rectangle mount, fixed at both ends** — `GUARDIAN_REGEN` (t3, a
   hand-written spec predating the module system) got an explicit `weaponKind:
   'lance'`; `drawEnemyGunMountShape`'s `null`-fallback changed from a bare `fillRect`
   to a small filled circle + thin ring, so no legacy or future spec can render a
   plain rectangle just by omitting the field.

**Mid-turn follow-up items, same round:**
- **t1's defeat hint now also delivered by the narrator during the death
  animation**, not just as static `ResultScene` text — `NarratorBar` gained a
  `showInstant()` method (full text revealed immediately, no typewriter) since the
  hint's ~175 characters would take ~7s to type out at the normal per-character pace,
  far longer than the death hold; `updatePostFinishEffects` now calls
  `this.narrator.update(deltaMs)` so the bar actually animates during the hold.
  Verified via a forced Playwright capture of t1's death sequence: the full hint text
  and the death FX (vignette, embers) are visible together mid-hold. `ResultScene`'s
  own copy is untouched (both surfaces now show it, not a migration).
- **Stale main-menu tutorial copy about Settings/Credits** — investigated
  thoroughly (read `HubTour.ts`, `HubScene.ts`'s `NAV_ITEMS`/`buildSettingsContent`/
  `buildCreditsContent`, then verified live via Playwright screenshots of Settings,
  Credits, and the tour's own `settings` step): found nothing stale. CREDITS is still
  a live nav item, the "Hi, I am Nesro..." developer's note still renders under it,
  and the settings tour step's caption ("Audio, dev tools, and this tour again — any
  time. Credits, right next to it, has the developer's note.") matches all of it
  exactly. Flagging as unresolved, not fixed — Tomáš's report doesn't match current
  code or a live run, so either it describes an older build/deployment, or a
  different screen than the one investigated here. Needs the actual screen/flow
  identified before any fix is attempted.
- **Procedural sound generation, investigated (not built)** — feasible: Web Audio
  supports rendering a synthesized clip into a real `AudioBuffer` (`OfflineAudioContext`,
  then registered into Phaser's audio cache), which could mirror the baked-texture
  technique (`textures.ts`'s `bake()`) — generate once at load, replay many times —
  giving each `EnemyWeaponKind`/shield/generator/motor kind its own distinct
  synthesized SFX instead of today's sample-based `SoundManager.ts` (3 laser samples
  reused for every weapon). Real risk: raw-oscillator synthesis tends to sound harsh/
  chiptune unless carefully shaped (envelopes, filters), and — unlike a baked
  texture — sound quality can't be verified by screenshot, only by ear. This is a
  genuinely new subsystem (the codebase's first procedural audio), not a small tweak;
  scoping and design-quality judgment calls of this size are exactly what this
  session's Fable-consultation process exists for. Deliberately not implemented this
  round — recommend a dedicated Fable consultation before building it, given the
  scope already in flight this round.

**Verified**: `pnpm build:dry`/`lint`/`lint:comments` clean (one new lint fix along
the way: `drawSideWeaponIndicator` grew a 6th param over ESLint's `max-params` limit,
resolved by bundling `recoil`/`chargeFrac` into a `SideWeaponIndicatorOpts` object;
one `pnpm dlx fallow` regression fixed inline: `addStarfield`'s cyclomatic complexity
tripped the HIGH threshold after the 4-way tint split, resolved by extracting
`starTierParams`/`starTint` into pure module-level helpers — also removed one
unrelated stale `fallow-ignore` suppression in `tools/pacing-report.ts` found by the
same run). `pnpm test` 779/779 unchanged (pure rendering/timing/data changes, no core
logic touched). `pnpm campaign` 100%/100% completion, `pnpm balance` all 7 intended
loadouts still clear at their documented rates, `pnpm pacing` clean, `pnpm audit-taps`
0 failures across 21 states, full `pnpm screenshot` batch (77 shots) 0 failures.
Remaining `fallow` health flags (`src/data/cards.ts`, `src/core/combat.ts`,
`tools/campaign-simulate.ts`'s `runOneCampaign`) are pre-existing baseline, untouched
by this round.

### Full visual-language audit + enemy bolts now shaped by weaponKind — landed 2026-07-24, docs/plans/visual-language-audit.md
Tomáš: "can you go over all the graphics in this game again, write a docs about the
shape and then we let fable to decide what to add?" — a from-scratch catalog of
every baked texture and runtime-drawn shape in the game (player ships, enemy hulls,
all projectile tiers, all shop icon tiers, combat particles, the starfield, the hub
galaxy map), written by reading the actual drawing code, not memory. Handed to Fable
to decide priority, per the explicit instruction — not resolved into a plan myself.

**Fable's decision** (verified the doc's claims against the code first, catching one
factual error: the starfield scrolls *down*, not left — `updateStars` increments
`.y`, matching the direction enemies approach from): **enemy bolts first**, because
it's not just an untouched area but an actual contradiction this same session
created — a gun mount now visibly shaped per `weaponKind` (the immediately prior fix)
was firing a bolt that forgot what fired it. **Front weapon shop icons second** — a
real, bounded, independent gap (the one icon tier every player owns and looks at
most, yet the plainest). **Starfield last, and scoped down** — carries zero gameplay
information, and Category 6's deliberately-restrained particles/floating text mean
the starfield's flatness is partially by the same design restraint, not pure neglect.
Everything else (player ships, rear/side projectile textures, equipment icons, hub
map, combat particles) confirmed correct as-is, not worth revisiting.

**Enemy bolts, implemented**: `textures.ts` gained 3 baked bolt textures
(`enemyBoltStinger`/`Battery`/`Lance`, one per `EnemyWeaponKind`) — baked white so
`CombatScene.ts` can `setTint()` per crit/miss/normal outcome at runtime exactly like
the old plain rects were colored, only the shape underneath changed. Shape echoes
the matching gun mount: stinger a thin sharp needle diamond, battery a chunky
rounded slug, lance a long thin spike. `spawnEnemyBolt`/`spawnEnemyRearBolt` swapped
`add.rectangle()` for `add.image()` + `enemyBoltTextureForWeaponKind()`, keeping the
exact core+glow (scaled-up, dimmer copy) layering the rect version already had.
Verified via a forced-fire Playwright capture: bolts render as distinct diamond/
needle shapes with a soft halo, not rectangles.

Verified: `pnpm build:dry`/`lint`/`lint:comments`/`test` (779, unchanged — pure
rendering) clean; `pnpm dlx fallow` back to the same 2 pre-existing findings; the
full `pnpm screenshot` batch (77 shots) passes with zero failures (one transient
`combat-m6-boss` failure on the real-random-seed shot, confirmed flaky-by-design on
retry, same as previous rounds, unrelated to this change).

**Update, same day**: Tomáš — "no, everything that fable said must be addressed."
Items #2 and #3 landed too, not left deferred:

- **Front weapon shop icons** (`buildWeaponIconTextures`): all 4 real weapon kinds
  (pulse/ion/scatter/nova, both tiers each = 8 icons) redesigned to the rear/side
  icon tiers' density (6-9 primitives, up from 2-4) — pulse gained a cross-brace and
  mount plate unifying its twin barrels plus small energy-node accents; ion's icon
  changed from a beam+rect that matched neither its own kind nor its bolt into the
  actual glowing orb its projectile (`laserIon`) already is; scatter's 3-prong fan
  gained tip dots and a connecting brace; nova gained the second ring its own
  shockwave bolt (`laserNova1/2`) already has plus burst ticks. `y2010` deliberately
  untouched — the Easter egg's own "deliberately unpolished" joke, not a gap.
  Screenshot-verified in the shop weapon list.
- **Starfield** (`CombatScene.ts`'s `addStarfield`/`updateStars`): light-touch per
  Fable's own explicit scoping ("not a redesign project"). Replaced the old
  independently-randomized size/alpha/speed with 3 coherent depth tiers (near/mid/
  far moving together — bigger+brighter+faster vs. small+dim+slow), a small fraction
  per tier tinted faint cyan or amber instead of uniform white, and a subtle twinkle
  on the near tier only (`thrusterPhase`-driven, matching this file's existing
  shared-clock pattern). Also fixed a stale comment claiming the field "scrolls
  left" — it scrolls down (`.y +=`), matching the direction enemies approach from,
  exactly as Fable's own review of the audit doc caught.

Verified again after both: `pnpm build:dry`/`lint`/`lint:comments`/`test` (779,
unchanged) clean; `pnpm dlx fallow` still at the same 2 pre-existing findings; full
`pnpm screenshot` batch (77 shots) passes with zero failures.

### Enemy hull redesign: 13 hand-drawn hulls + 5 animated overlays — landed 2026-07-23, docs/plans/enemy-hull-redesign.md
Tomáš, after seeing round 2's module overlays: "you just added a circle inside of the
square... the problem is really just the enemies are a stupid square. I want ALL part
of the enemies to be complex: their 'ship' AND all the modules." Told to spend real
time on this ("I have time and a lot of claude ai limit... take your time"), asked
directly rather than guessed at: no external visual reference ("try it yourself
first"), hand-drawn per named enemy over a procedural-from-modules alternative
(explicitly chosen), and pushed past even the player ship's own texture complexity —
plus real animation, not just static detail.

**The actual bar, read from the code, not assumed**: `buildShipTextures`'s
`interceptor` hull is 10 primitives (triangle + wing struts + twin gun barrels +
cockpit + engine struts), `warship` is 13. Today's enemy hulls were nowhere close —
`fodder`/`swarm` were a single `strokeDiamond`, the literal "stupid square." Target
set at 10-13 primitives per hull, matching or exceeding the player ship, with a
deliberate named exception for `fodder`/`swarm` (this game's highest-concurrency
enemies per `pacing-report.md` — m5 peaks at 15.0, driven largely by swarm).

**Kind split, required first**: hand-drawn-per-named-enemy meant BREACHER/
BREACHER_GUNNER (previously `kind: 'fodder'`) and SENTINEL (previously `kind:
'guardian'`) could no longer silently share another enemy's texture — gave each its
own `kind` (`breacher`/`breacher-gunner`/`sentinel`) plus matching
`ENEMY_VISUAL_RADIUS`/`MIN_VISUAL_SPACING`/`textureForEnemyKind` entries.

**13 hulls hand-drawn** (`textures.ts`'s `buildEnemyTextures`, now split across two
functions to stay under the line-count limit): each enemy got a distinct shape
grammar — FODDER a minimal dart-drone, STRIKER a swept-wing starfighter, TANK an
octagonal armor block with side plates, BLOCKER a hexagonal fortress bulkhead with
corner bolts, GUARDIAN/SENTINEL split into their own ring-and-cross vs.
hexagonal-target-frame identities, TURRET a proper gun emplacement, KAMIKAZE a spiked
warhead, BOOSTER a hexagonal support-drone housing its existing feed-emitter,
BOSS pushed to 15 primitives (added an outer ring + pincer wings + plate dividers) as
the densest hull in the game, and BREACHER/BREACHER_GUNNER a riot-shield-faced wall
unit — GUNNER's baked rear stub-cannons are the one case where the static hull
directly represents a real module (`rearWeaponKind !== null`).

**A real, code-verified blocker found by Fable's review, not discovered after
implementation**: `CombatScene.ts`'s existing `addEnemyAnimTween` already spun almost
every enemy sprite continuously (360°) — which would have made every new directional
hull (swept wings, a riot-shield face, forward chevrons) tumble nose-over-tail
forever, reading as broken rather than complex, and directly conflicted with two of
the five new animated overlays (GUARDIAN's ring rotation, BOSS's stall pulse, both
assuming a host sprite that isn't independently spinning). Resolved by shape, not
exemption-list-creep: kinds whose redesigned hull is rotationally symmetric (SWARM's
bare dart, KAMIKAZE's radial star) keep the old spin; everything else switches to a
small ±8° yaw wobble (same `yoyo`/`Sine.easeInOut` technique `turret`'s existing
scale-pulse already used); BOSS drops the spin entirely so its new pulse overlay reads
clearly.

**5 animated overlays, each tied to a real gameplay signal, not decoration**: GUARDIAN
gets 3 orbiting ticks on its ring (a genuine self-regen "tell"); TURRET's barrels
flash-recoil reusing `drawEnemyFireTelegraph`'s own fire-cadence fraction; KAMIKAZE's
core brightens with proximity (`enemy.distance` — a real "getting more dangerous"
readout); BOOSTER gets a marker flowing down through its chevrons; BOSS's outer ring
pulses faster during the stall phase, tying into the existing stall-only anchor ring.
Every other kind gets no new animated overlay — a deliberate scope line, not sparseness
by accident.

**Performance, re-measured, not assumed**: the exact profiling methodology from round
2 (15 synthetic enemies, `requestAnimationFrame` delta, worst case = every
animation-eligible kind cycling with every module overlay on) came back at **-0.05ms
to -0.008ms** across 3 repeated runs — comfortably inside the +3ms budget, and the
static per-hull primitive additions cost nothing per frame at all (baked once via the
existing `bake()`/`GLOW_PASSES` mechanism, same as `buildShipTextures` already proves
at zero measured runtime cost).

Verified: `pnpm build:dry`/`lint`/`lint:comments`/`test` (779, unchanged — this round
was pure rendering, no core logic) clean; `pnpm campaign` 100%/100% both archetypes
unchanged; `pnpm balance` m1-m6 intended clear rates bit-for-bit identical; `pnpm
pacing`/`audit-taps` clean; `pnpm dlx fallow` back to the same 2 pre-existing
findings; the full `pnpm screenshot` batch (77 shots) passes with zero failures (one
transient failure during the pass — `combat-m6-boss`, which uses a real random seed,
not a fixed one — confirmed flaky-by-design on retry, unrelated to this change, and a
stale `hasKind(s, 'guardian')` check in `combat-t1`'s own screenshot setup was caught
and fixed as part of the kind split). Every redesigned enemy inspected directly in a
real running mission (t1/t2/m1/m3b/m6), not just code-reviewed.

### Modular enemies round 2: rear-weapon system + full always-on module rendering — landed 2026-07-23
Tomáš, after seeing round 1's t1/t2 result: "this still looks lame. When the enemy is
JUST A SQUARE, it feels so cheap... I want the enemies to look 'real' like the player
ship. Detailed graphics, mounted modules and I want their missiles to be animated and
visually complex. I want them to have all: energy/generator/shield/front weapon. Some
enemies can use rear weapon that will shoot from behind." Confirmed with him that the
rear weapon should be a real second gun with real independent damage (matching the
player ship's own front+rear system), not a cosmetic trajectory variant.

**Rear-weapon system** (`core/types.ts`, `core/combat.ts`, `core/tick.ts`,
`core/enemyCompose.ts`): `EnemySpec`/`EnemyState` gained a full second weapon slot
(`rearWeaponKind`/`rearShotDamage`/`rearTicksBetweenShots`/`rearCritChance`/
`rearMissChance`/`rearCritMult`/`rearShootTimer`), `null` by default (zero behavior or
RNG-cursor change for every spec that predates this). `fireEnemyRearWeapons` mirrors
`fireEnemyWeapons` exactly — its own timer, its own roll, its own `damageShip` call —
wired into `tick.ts`'s phase order right after the front weapon. Two new
`ShotEventKind`s (`enemy-rear-crit`/`enemy-rear-miss`) so the view can tell front and
rear shots on the same enemy in the same tick apart. `composeEnemy` gained a
`rearWeapon` field on its `base` param (not a 6th positional arg — ESLint's
`max-params` caps at 5).

**Always-on module rendering** (`CombatScene.ts`): every enemy now shows all four
modules as real hull parts, not opt-in per module presence — an always-on pulsing
GENERATOR core (`drawEnemyGeneratorCore`, shown regardless of `generatorKind`, purely
structural), an always-on MOTOR exhaust flame (`drawEnemyMotorTrail`, broadened from
rush/stall-cycle-only), a WEAPON gun mount plus a second rear mount for
`rearWeaponKind`-carrying enemies (`drawEnemyGunMounts`), and a leaner 2-ring SHIELD
visual (`drawEnemyShieldRing`, a dedicated cheaper variant — not a reuse of the
player's own 4-ring `drawShieldRings`, see the profiling note below for why). Rear
weapon shots get their own projectile (`spawnEnemyRearBolt`): launched from an
X-offset rear mount and eased back toward the ship's centered X over its flight,
unlike the front weapon's dead-straight drop — confirmed visually via a forced-fire
Playwright capture (not just code review) that it actually arcs in off-center.

**Performance, re-checked and fixed for real once "always-on" made it a real risk**:
the first profiling pass (15 synthetic enemies, every module overlay on every one —
the deliberate worst case) came back at **+4.2ms** over baseline, well over the +3ms
budget the round-1 plan pinned — a genuine regression, since "opt-in per module" had
kept cost low before and this round deliberately dropped that gate. Trimmed the
actual cost instead of accepting the regression: cut stroke-outline passes from the
gun mounts and generator core (fill-only, half the draw calls), collapsed the motor
trail from a two-layer triangle to one, and replaced the shield ring's reused 4-ring
player version with a dedicated 2-ring enemy variant. Re-measured: **-0.01ms**,
confirmed stable across 3 repeated runs — the always-on redesign ended up *cheaper*
than the original opt-in one once the per-shape cost was actually trimmed, not just
tolerated.

**t1/t2 rebalanced for the new real modules** (`data/missions.ts`): SENTINEL (t1)
gained a real SHIELD (capacity 20) and GENERATOR (self-regen) — balance-safe there
specifically, since t1 has no weapon at all and no mission outcome depends on a
guardian's own hp/shield survival. BREACHER (t2) gained a real SHIELD (capacity 8);
a new **BREACHER GUNNER** variant (wave 2) additionally carries the real rear weapon.
Re-tuned via the same sim-sweep discipline as round 1 (createCoreState+advanceTick,
500 seeds/config): hp came down from 45→34 to compensate for the added shield, landing
at pulse-1 fails 0%, scatter-1 clears 100% (avgHull ~18%). **A real balance trap found
and avoided by sim, not assumed**: an early candidate gave BREACHER a real self-regen
GENERATOR too — sim showed this *inverted* the whole lesson (pulse started clearing
*better* than scatter), because concentrating damage on one target at a time
occasionally outraces regen while scatter's thinner spread lets regen claw back more
of it proportionally. Dropped regen from BREACHER entirely (generator stays
`'none'`, cosmetically inert — the core glow shows regardless) rather than chase a
fix, once the risk was confirmed real rather than theoretical.

Verified: `pnpm build:dry`/`lint`/`lint:comments`/`test` (779, +5 from round 1) clean;
`pnpm campaign` 100%/100% both archetypes unchanged; `pnpm balance` m1-m6 intended
clear rates bit-for-bit identical; `pnpm pacing`/`audit-taps` clean; `pnpm dlx fallow`
back to the same 2 pre-existing findings (one new complexity flag from this round's
own `detectCombatFeedback` growth was found and fixed by extracting
`detectEnemyFrontShots`/`detectEnemyRearShots`, not left as a new regression).
Screenshot-verified both missions show visibly detailed, multi-part enemies (hull +
shield ring + glowing generator core + gun mount, GUNNER's rear mounts too) instead of
a flat outline shape.

### Modular enemies (engine + visuals + t1/t2 rebuild) — landed 2026-07-23, docs/plans/modular-enemies.md
Tomáš: "I currently dislike the enemy design now. they feel really flat - circles that
shoot," wanting enemies built from the same WEAPON/SHIELD/GENERATOR/MOTOR modules the
player ship has, with visible module rendering. Two Fable review rounds before
implementation (spec revised in full detail after round 1's risk findings, per "we are
still pre-alpha... don't be afraid to refactor very hard"); round 2 signed off with 3
small fixes, all applied.

**Engine** (`core/enemyCompose.ts`, `data/enemyModules.ts`): `composeEnemy` folds
concrete WEAPON/SHIELD/GENERATOR/MOTOR module objects into the existing flat
`EnemySpec` shape — spawn-agnostic, so hand-written consts stay valid with zero forced
migration. New `EnemyState`/`EnemySpec` fields (`weaponKind`/`shieldKind`/
`generatorKind`/`motorKind`/`shield`/`shieldCapacity`/`holdBonusTiered`/`displayName`)
carry module identity separately from the display `kind` string. `damageEnemy`
(mirrors `damageShip`'s shield-first pattern) replaces all 5 direct `enemy.hp -=`
sites; the player's own shield-burst splash routes through it too — one uniform
damage rule, no source-specific exception. `hashCoreState` gained the new mutable
`shield` field as a named line item. Five kind-string behavior/reward/visual checks
(boss stall-cycle, booster ally-regen, blocker's tiered bonus, the booster-buff line
draw, the first-booster narrator line) all regeneralized off the new kind fields.

**Visuals** (`CombatScene.ts`): SHIELD reuses the player's own `drawShieldRings`
(opt-in per `shieldCapacity > 0`); MOTOR gets a new shared `enemyMotorGfx` (rush =
speed trail, stall-cycle = pulsing ring only during the actual stall phase);
GENERATOR extends the existing ally-regen buff-line renderer with a self-directed glow
for shield-regen. WEAPON reuses the already-built fire telegraph — no new draw needed.
Verified against real composed test enemies injected directly into a live
`CombatScene` (no mission uses random module composition yet) via a throwaway,
never-committed Playwright script — caught and fixed one of my own analysis mistakes
along the way (misread which on-screen sprite was which by guessing screen-Y order
instead of reading it back). Profiling checkpoint (15 synthetic enemies, all 4
overlays, `requestAnimationFrame` frame-time delta vs. today's baseline): +0.54ms,
comfortably inside the +3ms budget Fable's review asked to have pinned down.

**t1/t2 content rebuild**: Tomáš, after seeing the plan: "let's finish t1 and t2 ...
I would like to have each enemy a meaning, maybe a name? I want less, but stronger
enemies. I think t1 should have just 2 enemies, t2, like 5-10 max." Added
`EnemySpec.displayName`/`EnemyState.displayName` (shown above the HP number in
`updateEnemyHpLabel`, defaults to uppercased `kind` if unset).
- **t1**: `GUARDIAN_SLOW`'s 5-count wave → two named **SENTINEL**s (`composeEnemy`,
  hp=40, shotDamage=16, spacing=100). Sim-verified (createCoreState+advanceTick sweep,
  500-1000 seeds/config): generator-torrent-1/reserve-1/steady-1 all fail 0% (steady-1
  used to be a real ~52% coin-flip at 5-count — at 2 hits that margin collapsed,
  leaving exactly one real fix path, same shape as t2/t3 now); generator-surge-1
  clears 100% (~7% avg hull). spacing=100 is load-bearing twice: it's the real-time gap
  surge-1 needs to refill the shield before the second collision, AND it's tight enough
  that the second SENTINEL is still on-screen when the first collides — required for
  the shield-burst mechanic to have a live target (confirmed 100/100 probe runs; a
  wider, difficulty-equivalent spacing tested at 140 gave the burst 0/100 — the second
  guardian was off-screen by the time the first one collided).
- **t2**: `FODDER`'s 2+8+8=18-count wave → six named **BREACHER**s (own spec, not a
  FODDER edit — FODDER is shared by m1-m6), two waves of 3 half a second apart, hp=45,
  shotDamage=4. Sim-verified against the mission's own pinned generator-torrent-1:
  pulse-1 fails ~97% (avgHull ~0.2%), scatter-1 clears ~100% (avgHull ~27%) — same
  fail/fix split the old 18-count wall held, at a third the headcount.

Verified: `pnpm build:dry`/`lint`/`lint:comments`/`test` (774, +10 from phase 1) clean;
`pnpm campaign` 100%/100% both archetypes unchanged; `pnpm balance` m1-m6 intended
clear rates bit-for-bit identical (m1-m6 don't use SENTINEL/BREACHER); `pnpm pacing`/
`audit-taps` clean; `pnpm dlx fallow` back to the same 2 pre-existing findings
(confirmed via `git stash -u` before/after — neither is new). Screenshot-verified t1/
t2's HP labels show "SENTINEL 40/40" / "BREACHER 25/45" correctly, and both tutorials'
narrator modals still fire at the right ticks with the right enemies on screen.

Deferred, not started: phases 4-5 (m1/m2/m3 hand-authored modular rebuild, m3b-m6
loose/randomized module assembly) — explicitly put on hold by Tomáš ("keep this at
later") pending his look at t1/t2.

### Four t1/t2 polish items: tutorial-autopilot pacing, ship-destruction artifacts, invisible enemy fire, bottom-bar support hints — fixed 2026-07-23
Tomáš, after a fresh look: (1) "the autoclicker is too fast," (2) "ship being destroyed
is missing animation and there are some artefacts left," (3) "there is no indicator of
enemies shooting... I want to see when they will shoot. Their missiles are not visible
enough," (4) "I would get rid of the bottom NOVAK COMMAND messages. just use the
narrator popup." Confirmed with him that (1) meant the dev-only "WATCH TUTORIAL
AUTOPILOT" demo tool, and (4) meant t3/t4 specifically — t1/t2 never actually show a
bottom-bar line (`story.ts`'s `STORY_LINES` has no entry for either).

1. **Autopilot pacing**: `tutorialAutopilot.ts`'s `ACTION_DELAY_MS` (500ms between each
   simulated tap) was too fast to actually watch/follow. Raised to 1100ms.
2. **Ship-destruction artifacts**: `playDeathAnimation()`'s fade tween only targeted
   `shipSprite.alpha` — every other ship-attached visual (thruster/motor glow, gun/
   rear-gun/side-gun indicators, generator core, shield glow ring, the small hull/
   shield status bars) is its own `Graphics` object, never parented to the sprite, so
   they either froze in place or — the thruster specifically, since
   `updatePostFinishEffects` keeps calling `renderThruster()` during the exit-delay
   hold — kept animating at full brightness with no ship left to attach to. Extended
   the same tween to fade all of them together (`Graphics.alpha` is a multiplier over
   whatever's drawn into it, so this works regardless of continued per-frame redraws).
   Screenshot-verified before/after: the old end-state left a glowing thruster and a
   floating empty status bar in otherwise-empty space; now nothing remains.
3. **Enemy fire visibility**: two changes. A new `drawEnemyFireTelegraph` — a growing,
   brightening yellow-white spark at an enemy's own muzzle point during the last
   quarter of its fire cadence (scaled to each kind's own `ticksBetweenShots`, not a
   fixed tick count) — gives advance warning a shot is coming, not just the bolt
   appearing the instant it fires. Deliberately yellow-white, not red/orange like the
   enemy sprites themselves, so it reads as a distinct signal instead of blending into
   the sprite's own outline (confirmed via screenshot: the first color choice, close to
   the enemy's own hue, was barely visible). `spawnEnemyBolt`'s bolt itself grew from a
   bare 3×8px rect to 5×13px plus a soft trailing glow rect, and its travel time eased
   from 240ms to 320ms for better tracking.
4. **Bottom-bar support-call hints → modal**: t3 and t4's `first-support-call` lines
   (shown in the passive bottom `NarratorBar` alongside the still-open card offer) moved
   into their own `T3_NARRATOR_EVENTS`/`T4_NARRATOR_EVENTS` as a second blocking modal
   event each, timed a couple ticks before their own `supportCallTicks[0]` (t3: tick 18
   before 20; t4: tick 88 before 90) — close enough to read as "right before the
   choice," far enough that `checkNarratorEvents` resolves and clears `pendingNarrator`
   on an earlier tick, so `maybeTriggerSupportCall`'s own `pendingOffer` never contends
   with a still-open modal on the same tick. Removed the now-unused entries from
   `story.ts`'s `STORY_LINES` (m3b/m6 keep theirs — out of scope, not what was asked).

**A real regression caught by the full verification pass, not just the targeted
checks**: `tools/screenshot.ts`'s `combat-t4` shot was written against the old
mechanism — it waited for the bottom bar's typewriter reveal
(`waitForNarratorFullyRevealed`), which now never fires for t4 at that point. Updated
the shot's setup to match the new modal-based flow (already auto-dismissed by
`advanceUntil`'s own `fastForward` steps along the way) and removed the now-fully-unused
`waitForNarratorFullyRevealed` helper from `playwrightHarness.ts` (`pnpm dlx fallow`
flagged it as a genuinely unused export once nothing called it anymore).

Verified: full `pnpm test`/`lint`/`lint:comments`/`build:dry`/`balance`/`pacing`/
`campaign`/`audit-taps`/`dlx fallow` clean, the complete `pnpm screenshot` batch (77
shots) passes with zero failures, and each of the four fixes was individually
screenshot- or state-inspected (the death-animation fade at two points in its timeline,
the fire telegraph and enlarged bolt mid-flight in t2, both new t3/t4 modals firing at
their exact intended ticks with the support offer opening cleanly right after).

### Nearly every mission's fodder waves have the same jitter-vs-spacing overlap risk t1 had — mitigated at the root for same-event jitter, and fully covered for the visible symptom either way, as of 2026-07-22/23
Found 2026-07-20 while fixing t1's own visual-overlap bug: `timeline.ts`'s `spawnEnemy`
multiplied each enemy's whole cumulative spawn distance (`LANE_LENGTH + i*spacing`) by
an independent ±10% `SPAWN_JITTER`, so the jitter's absolute size grew with an enemy's
index within its event regardless of how generous `spacing` looked against
`MIN_VISUAL_SPACING`'s static floor — live gaps across nearly every fodder-based wave
in the game (m1-m6, t2, t4, w0, all `spacing: 14`) could dip to ~7 units, about half the
assumed-safe floor.

**Two later, separate fixes this session closed this out, together covering both the
cause and the symptom:**
- The root cause (jitter compounding with index) is gone: `timeline.ts` now draws
  jitter once per *event*, applied only to the shared spawn point, not per enemy to
  each one's own cumulative distance — spacing within one event is exact again. Spot-
  re-verified post-fix: t1/w0/t4's own worst same-event raw gaps now measure
  80/14/14 units, matching or exceeding their floors cleanly (previously as low as
  ~7).
- A **separate** gap (not the one this entry was originally about, found while fixing
  t2's own overlap report) remains at the *raw data* level: two different events close
  together in schedule time can still legitimately land two enemies within a tight raw
  gap — confirmed directly on t2 (still measured as low as ~0.35-2.5 units in spot
  checks). This is a cross-event coincidence, not the index-compounding bug, and isn't
  fixed at the data level.
- **What actually makes this a non-issue for players regardless**: `CombatScene.ts`'s
  `separateOverlappingSprites` (added fixing the t2 overlap report, see that entry)
  corrects on-screen position every frame from the true distance, independent of *why*
  two enemies are close — same-event jitter, cross-event timing, anything. A 300+-seed
  overlap scan across every mission confirmed zero visual overlap post-fix. The
  remaining raw-data tightness is real but no longer able to reach the screen.

Not chased further at the data level (re-tuning every mission's fodder spacing to
avoid ever generating a tight raw gap in the first place) since the view-layer fix
already provides a complete guarantee regardless — doing so now would be pure
belt-and-suspenders against a symptom that can't occur.

### `pnpm pacing`'s MONOTONY flag on m1, and SLOW_START on t1/w0 — both fully resolved 2026-07-22, no longer just "accepted residuals"
These were logged 2026-07-17/18 as known, accepted non-blocking flags (m1's fodder×7
streak sitting one above `MONOTONY_STREAK_THRESHOLD`; t1/w0's opening beat sitting a
couple seconds past `SLOW_START_THRESHOLD_TICKS`) with no fix planned, on the reasoning
that closing them risked reopening a difficulty cliff or an unreadable-fast-enemy
problem. Both were later fixed for real, as a side effect of the same-session mission-
pacing/gap-closing pass documented elsewhere in this file:
- **m1's MONOTONY**: the seconds(132) fodder wave (was count 8) became `striker` count
  3 instead — fewer, tougher enemies breaking the streak at roughly equivalent total
  threat rather than adding on top of it. Real streak dropped to 6, under the
  *original* threshold — no threshold change needed after all.
- **t1's SLOW_START, and w0's**: t1's guardian spacing/count and shield-burst mechanic
  got a real rework (see this file's other t1 entries); w0's opening fodder event moved
  from `seconds(5)` to `seconds(2)`.

`pnpm pacing` now reports zero flags across every mission and tutorial (verified
2026-07-23, re-run as part of this session's later work). Nothing about
`MONOTONY_STREAK_THRESHOLD`/`SLOW_START_THRESHOLD_TICKS` needed changing in the end —
the actual mission data closed the gap instead.

### Backgrounding the tab and returning played every queued sound at once, as one loud burst — fixed 2026-07-22
Tomáš: "if I let the screen in a background window and then I look at it again, ALL the
sounds play at once and it makes A LOUD noise."

`CombatScene.ts`'s `update()` already capped how many ticks a single frame can catch up
(`MAX_CATCH_UP_MS`, 250ms), but that cap is per-frame, not per background-stretch —
nothing stopped the sim from continuing to tick (each one able to trigger a weapon-fire/
hit/kill sound) across however many throttled frames the browser still delivered while
the tab was hidden. Whatever sounds those ticks queued then all land at once the moment
the tab (and the browser's suspended AudioContext) regains focus, instead of playing
spread out over the time they actually happened.

**Fix, two layers:**
- `CombatScene.ts`: `update()` now returns immediately (skips the whole sim/tick step)
  whenever `document.hidden` is true — nothing new gets queued while backgrounded, so
  there's nothing to burst-flush on return.
- `SoundManager.ts` + `main.ts`: a `document.visibilitychange` listener calls a new
  `Sound.suspend()`/`resume()` pair, muting Phaser's own sound manager for the duration
  as a second layer — covers a sound that was already mid-flight in the browser's audio
  pipeline at the exact instant the tab backgrounds, which the tick-skip alone can't
  reach. `resume()` restores exactly whatever mute state the user had chosen, not just
  "unmuted."

Verified with a Playwright script that overrides `document.hidden` and dispatches a real
`visibilitychange` event mid-mission: an 8-second "hidden" window advances zero ticks,
and resuming visibility ticks forward at normal real-time pace (not a burst) immediately
after. `pnpm test`/`lint`/`lint:comments`/`build:dry` all clean.

**Follow-up, 2026-07-24 — the fix above was incomplete, not wrong.** Tomáš: "the bug is
still there - when I switch back to the chrome tab after a while, a lot of sounds play
together at once and it hurts my ears. it's not wixed." Both layers above were real and
necessary but missed a *third*, independent mechanism: Phaser's own
`BaseSoundManager.pauseOnBlur` (default `true`, never explicitly configured) runs
completely separately from `Sound.suspend()`/`resume()`'s mute pair. On tab blur it
**pauses every currently-playing sound instance**, freezing each one's exact playback
position; on focus it **resumes all of them**. Muting (the existing fix) silences
output but doesn't stop Phaser's own pause/resume bookkeeping underneath it — any sfx
mid-flight the instant the tab backgrounds (easy during active combat, several laser/
ding one-shots routinely overlap) gets frozen mid-sound and then **all resume at the
exact same instant** the tab regains focus, each finishing out its remaining tail —
the "lot of sounds play together at once" burst, now correctly identified as resumed
overlapping tails, not newly-queued sounds slipping past the tick-skip.

**Fix**: `SoundManager.ts`'s `attach()` now sets `sound.pauseOnBlur = false` the
moment it binds to Phaser's sound manager, disabling Phaser's own mechanism entirely
so `suspend()`/`resume()` (mute-based) is the *only* visibility-driven audio behavior.
Under mute alone, backgrounded sfx simply keep playing (silently) to their own short
natural completion — nothing is left mid-flight to resume in a batch. Confirmed via
Playwright that `window.__game.sound.pauseOnBlur` reads `false` immediately at boot
and stays `false` through scene transitions (`Sound.attach()` is called from
BootScene/CombatScene/HubScene's own `create()`, idempotently). `pnpm test`/`lint`/
`lint:comments`/`build:dry` all clean.

### t1's guardians were too far apart, and a straggler could arrive already damaged before ever being seen — fixed 2026-07-22
Tomáš noticed both while playing: guardians felt strung out, and one visibly showed up
partway hurt the instant it appeared on screen.

**Root cause, shared by both**: t1's `spacing: 120` was set defensively during the
`SPAWN_JITTER`-compounding bug (see the entry above) and never revisited once that bug
and the view-layer overlap guard made such a wide gap unnecessary — with 5 guardians at
that spacing, the last one spawned 580 distance-units back (`LANE_LENGTH + 4*120`), a
real ~19s at GUARDIAN_SLOW's speed before it ever reached the screen. Meanwhile
`conveyor.ts`'s shield-burst-return mechanic (an earlier collision's absorbed shield
damage splashing onto every *other* live guardian) applied to **every** surviving
guardian regardless of `distance` — including ones still hundreds of units off-screen.
A guardian could take several burst hits from collisions the player hadn't even
prompted yet, arriving with visible chip damage the instant it finally came into view.

**Fix:**
- `conveyor.ts`: shield-burst damage now only applies to survivors with
  `distance <= LANE_LENGTH` — a straggler that hasn't arrived yet doesn't take a hit
  for a collision it wasn't there to see.
- `missions.ts`: t1's `spacing` dropped from 120 to 80. Sim-confirmed this is a real
  balance lever, not just a visual one, and not a small margin either: the intended
  fix (generator-surge-1) needs the real-time gap between collisions to let the shield
  recharge before the next hit, and clear rate is a hard cliff — 100/100 at 70-80,
  0/100 at 60 and below. 80 sits with real margin above that cliff. (An initial,
  much smaller value of 40 was tried first and immediately regressed the mission's own
  fail/fix regression test to 0/100 — this cliff is why.)

Verified: `pnpm test` (the t1 fail/fix regression test, `src/core/regen.test.ts`,
passes again), a live inspect+screenshot at t1's opening wave shows guardians still
off-screen at full HP and only the closest, already-visible one carrying a small,
expected burst dent — not a guardian materializing already hurt. `pnpm balance`/`pnpm
pacing`/`pnpm campaign` all clean; main missions (m1-m6) don't lean on shield-burst as
a core mechanic so were unaffected by the `conveyor.ts` change.

### Enemies routinely rendered visually overlapping (sometimes fully stacked), and an overlapping enemy's own HP number could stay invisible for several seconds — fixed 2026-07-22, view-layer only
Tomáš noticed real gameplay (t2, auto-fire) rendering two fodder sprites stacked into
what looked like a single "X" shape, no gap at all, and separately that an enemy's own
HP number was sometimes just missing. Root-caused both, not guessed:

**Overlap.** `timeline.ts`'s `spawnEnemy` applied `SPAWN_JITTER` (±10%) by
*multiplying* each enemy's own cumulative spawn distance (`LANE_LENGTH + i*spacing`),
so the jitter's absolute size grew with an event's own enemy index `i` — for an
8+ count wave (t2's own wall, or any main mission's wave) that easily swamped a small
`spacing` value, letting same-event enemies spawn overlapping or even out of relative
order. A scripted scan across every mission (comparing real screen-pixel radii, not
raw `spacing` values) confirmed this wasn't t2-specific: every mission except the two
tutorials with only one enemy on screen at a time (t1, t3) had severe overlap
somewhere, commonly 45-65px of actual sprite-on-sprite overlap.

**Missing HP number.** `CombatScene.ts`'s `hpOverlayBarTop` only floors the overhead
HP bar/label's Y position for bosses; a regular enemy's raw `sy - 34` was assumed to
overshoot off-canvas for at most one tick after spawning (`distance` starts at exactly
`LANE_LENGTH`, the old reasoning went). That assumption breaks the moment jitter or
`spacing` push a spawn's `distance` *above* `LANE_LENGTH` — routine for any enemy past
the first in a spaced wave — stretching the "briefly off-canvas" window to several real
seconds while the sprite itself is already clearly on screen.

**Fix, in two independent layers:**
- `timeline.ts`: jitter is now drawn once per *event* and applied only to the shared
  `LANE_LENGTH` spawn point, not per-enemy to the cumulative distance — spacing within
  one event is now exact, eliminating the index-compounding bug at the source.
- `CombatScene.ts`: a new `separateOverlappingSprites` pass, called from
  `renderEnemies` every frame, sorts enemies by their about-to-be-set screen Y and
  nudges any two closer than 1.5× their combined radii apart — purely a display-Y
  adjustment, recomputed fresh from the true `distance` every frame, never written
  back to core state. Non-boss enemies whose bar/label would still render off-canvas
  (rather than being clamped to a shared Y, boss-style — see below) simply skip
  drawing that frame instead, appearing as soon as they're safely on screen.

**A first attempt enforced the same minimum gap in `core/conveyor.ts` instead — tried
and reverted.** Pushing the gap violation into `distance` itself (rather than just the
view) seemed more "correct" at first, but it doesn't stay bounded: a continuous
per-tick correction persists across ticks, so when a loadout can't clear waves as fast
as they arrive (any real backlog), every new spawn gets pushed back by however far the
*existing* pileup had already grown — unbounded, compounding every tick. Caught via
m3b's `timeStarT2Loadout` clear rate collapsing from a healthy ~80% to under 2%; traced
to `state.enemies`' max `distance` climbing from ~200 to 750+ over a single run (should
never exceed roughly 2×`LANE_LENGTH`) while enemy count grew from 5 to 30+, none of
them ever resolving. Moving the exact same gap check to the view (recomputed from
scratch every frame, never accumulated) keeps the guarantee with none of the runaway
risk — `core/conveyor.ts` and `core/constants.ts` are back to their pre-this-issue
state.

Also tried and reverted along the way: matching `booster`'s speed to `tank`'s (0.6),
theorizing a faster trailing booster was getting perpetually speed-capped by the core
enforcement. Correct diagnosis for *that* mechanism, but it turned out not to be the
actual driver of m3b's collapse (reverting it after the real fix made no measurable
difference) — the core-level unbounded growth was.

The `SPAWN_JITTER` fix alone (kept — a real, independent correctness improvement) has
a small legitimate balance effect on m2/m3, whose own clear-rate floors have near-zero
headroom; both needed the same one-fodder-wave trim already established earlier this
file's pacing work to stay compliant. Verified: a scripted overlap scan across every
mission (300+ seeds each) shows zero overlap post-fix; `pnpm balance`/`pnpm
pacing`/`pnpm campaign`/`pnpm test`/`pnpm lint`/`pnpm lint:comments`/`pnpm
build:dry`/`pnpm audit-taps`/`pnpm dlx fallow` all clean; a live screenshot of t2's
former overlap spot now shows one clean sprite with its "20/20" HP number visible,
where before it showed two stacked sprites and no number at all.

### Main missions sit empty for 14-20s at a stretch, and m1 had a 7-fodder monotony streak — fixed 2026-07-22 with real content changes; `pnpm pacing` is fully clean (zero flags, every mission and tutorial)
Tomáš's playtest feedback: "I hate that there are periods without enemies at all...
max gap should be like 1 second max." Baseline (`pnpm pacing`) confirmed it: m2 (the
declared best-paced reference mission) itself averaged a 14.0s longest gap, m3/m4 20s.

An automatic filler mechanism (`core/timeline.ts` auto-spawning a weak enemy past an
idle-tick threshold) was tried first and reverted on Tomáš's own pushback ("why
cannot you just fix the data") — see git history for that attempt. Root cause of most
of the gaps turned out to be mechanical, not just loose spacing: `blocksConveyor`
enemies (blocker, turret) freeze `timelineTick` for their whole lifetime, so once one
finally dies, the schedule needs its *entire* remaining nominal gap in real time
before the next wave fires, regardless of how long the blocker itself took to kill.

**Fix:** a real, persisting enemy placed right after each blocker/turret's own spawn
tick, so it appears the instant the timeline unfreezes and its own kill time eats into
the real wait before the next wave. For plain (non-freeze) wide gaps, the same enemy
dropped mid-gap. Where one bridge wasn't enough (the tougher late-mission blockers in
m6), a short relay of 2-3 chained a few seconds apart closed it further. `tank` (slow,
no `blocksConveyor`, 90 HP) was the default bridge; on the two missions with no floor
margin to spare (m2, m3) a much lighter single/double `fodder` bridge did the same job
with far less balance impact. Applied to every main mission; every insertion was
verified against `pnpm balance` (both floor *and* the 90% ceiling — one relay pushed
m6 to 90.4% and had to be scaled back).

**m1/m2/m3 started with almost no `pnpm balance` clear-rate headroom** (m1: 1.6
points, m2: 1.2, m3: 0.8 above its floor) — plain additions (an extra striker, a lone
tank, a same-count kind-swap) dropped clear rate 3-20 points and broke the floor
almost every time, and schedule compression (retiming waves earlier, zero enemy-count
change) broke it too by cutting shield/generator recovery time between waves. Getting
past this took two more passes:
- **m1's MONOTONY streak (7 fodder events in a row) is genuinely fixed**: the
  seconds(132) fodder wave (was count 8) is now `striker` count 3 — fewer, tougher
  enemies breaking the streak at roughly equivalent total threat (89.8% clear, right
  at the 90% ceiling — this mission has no room left in *either* direction now). Real
  streak is down to 6, under the original `MONOTONY_STREAK_THRESHOLD` — no threshold
  change needed.
- **m2's worst gap improved 11.5s → 10.5s**: trimmed its opening fodder wave by one
  (4→3) and added a single fodder bridge at 9s (clear rate actually rose slightly,
  76.2%→77.0%); a second bridge (232s tank wave → 240s tank bridge → 252s tank wave)
  landed the same way. One attempt on the 28→42s striker/fodder gap dropped clear rate
  to 71-74% and was reverted — that stretch is load-bearing and left alone.
- **m3 needed a lighter touch, not a bigger budget**: a full `tank` bridge at either of
  its two blocker gaps (68s, 230s) broke the floor even after trimming an existing
  wave to pay for it — and, tellingly, dropping content with *no* bridge added *also*
  broke the floor (64.4%, worse than the 65.8% it started from). That ruled out
  "budget" as the actual constraint; the mission is chaotically sensitive near its own
  floor, where even ostensibly-easier changes shift borderline seeds unpredictably. A
  single lightweight `fodder` (count 1-2, well under a tank's threat) at each of the
  two blocker gaps worked where the tank didn't — light enough to avoid the floor
  entirely, still enough presence to meaningfully cut the dead air. Worst gap: 15.0s →
  12.0s, clear rate 65.8% → 65.2% (thin but holding, verified at both 500 and 2000-run
  sample sizes).

**w0's SLOW_START** (first enemy at 5.0s, threshold 3s) was a one-line fix — moved the
opening spawn event from `seconds(5)` to `seconds(2)`.

**Net result: every mission, tutorial, and w0 passes `pnpm pacing` with zero flags** —
no threshold recalibration needed in the end. `HARD_IDLE_GAP_THRESHOLD_SECONDS` was
tightened from its original 2s to 13s (`tools/pacing-report.ts`), anchored to the real
worst surviving gap (m1's 12.5s, a deliberate sparse breather — see its own "collapsed
72-112s stretch" comment — on a mission with no floor margin left after its MONOTONY
fix), the same way this file's other pacing thresholds are already anchored to
measured data rather than an aspirational guess. `pnpm balance`/`pnpm pacing`/`pnpm
campaign`/`pnpm test`/`pnpm lint`/`pnpm lint:comments`/`pnpm build:dry`/`pnpm
audit-taps`/`pnpm dlx fallow` all clean; `pnpm campaign`'s own "one hour of fun"
pacing-shape sub-score rose 30.0 → 49.9, independent confirmation this is a real
pacing improvement.

### t2's "fails on real starter gear" balance was only true in isolation — a carried-over generator, then a carried-over rear weapon, both trivialized it — fixed 2026-07-21
Found building `tools/onboarding-audit.ts` (the new real-journey checker, `pnpm
onboarding`) — the very first live run through the actual documented sequence (t1 fail
→ shop → switch generator to `surge-1` → t1 retry-win → t2) surfaced this: **t2 won on
its very first real attempt, 10/10 times**, not the ~10.8% clear rate this file's own t2
tuning history and `docs/design/15-new-player-experience.md` both state. Root-caused,
not guessed: a fresh save's genuinely-first t2 attempt (verified in isolation, no t1
played first) really did fail as documented — the difference was entirely the
generator. The ship has exactly ONE shared energy pool (`state.ship.energy`):
`core/combat.ts`'s `fireShipWeapon` draws from it per shot, and `core/energy.ts`'s
`pulseShield` separately requires it to reach `generatorCapacity` before firing a
shield pulse, then drains a chunk of it. `generator-surge-1` (t1's own sim-verified fix
— highest output, smallest capacity of any Lv1 generator kind) is excellent for
cycling shield pulses fast, but under t2's sustained wall fight the shield's own
frequent fill-then-drain cycling on that small tank left enough spare energy for
EITHER weapon to clear the wall, regardless of target count. A real player who follows
t1's own hint carries that generator switch straight into t2, since nothing resets it
between missions.

**Confirmed this was already latently present, not newly introduced**, before landing
any fix: `tools/campaign-simulate.ts`'s `applyPurchasePolicy` already had its own
`justFailedMissionId === 't1'` branch (added alongside t1's own redesign) performing
this exact torrent→surge switch for every simulated archetype — `pnpm campaign`'s own
"t2 mean retries=1.00" result had reflected this the whole time, misread as "the
intended pulse→scatter fix working as designed" rather than "t2 is trivial regardless
of the weapon fix, because of the carried-over generator."

**Swept ~60 wave configurations (enemy count, spacing, speed, wave-timing gaps,
burst+trickle hybrids) hunting for a shape where pulse+surge fails but scatter+surge
still clears — none exists.** Every configuration moves pulse+surge and scatter+surge
together (both degrade at the same density, both hold at the same looser density),
confirming this is a structural shield/weapon energy-contention effect, not a
tuning-numbers gap a wave retune can close.

**Fix: neutralize t2's generator, mirroring `neutralizeMotorForDaily`'s established
pattern for this exact class of problem.** New `MissionSpec.neutralizeGeneratorId?:
string` (`core/types.ts`) + `data/loadouts.ts`'s `applyGeneratorOverride` — pins the
generator to a fixed catalog item regardless of what's really equipped, wired into the
same three call sites `disableWeapon` already touches (`CombatScene.ts`,
`tools/simulate.ts`, `tools/campaign-simulate.ts`). t2 pins to `generator-torrent-1` —
the real `defaultSave()`/`STARTER_LOADOUT` default t2's own numbers were originally
tuned against — restoring them exactly with zero new tuning: sim-verified,
`pulse-1`/`scatter-1` both now land at their documented 10.1%/98.9% clear rate
regardless of which generator the player really has equipped. `T2_NARRATOR_EVENTS`'s
third line (previously "check the shop's GENERATOR tab for the tradeoffs between
kinds," a forward reference that became actively misleading once the generator is
pinned) was reworded to state the fixed baseline explicitly. Fable-reviewed before
closing out; two real gaps it found were also closed: a `loadouts.test.ts` regression
test locking in `applyGeneratorOverride`'s behavior and t2's own
`neutralizeGeneratorId` value (previously only verified via a one-off probe), and this
entry itself (previously left under Open with three undecided options, after the
decision had already been made and implemented).

**A second, independent confound surfaced immediately after landing the generator
fix**: `pnpm campaign` still showed t2 clearing on the very first attempt 100% of the
time (mean retries=1.00, both archetypes), even with the generator correctly pinned
and confirmed (via inline debug instrumentation) to read `generator-torrent-1` on
every attempt. An isolated `runMission` reproduction using the same seed formula and
same policies landed back at the expected ~10% clear rate, contradicting the real
campaign run under seemingly identical loadout — pointing at some other input differing
between `buildLoadout(save)` (what the real campaign loop uses) and the isolated test's
hand-built loadout. Root-caused by printing the full resolved loadout for t2's first
attempt directly out of `runOneCampaign`: every sampled campaign (both archetypes) had
`rearWeapon: "grenade-1"` equipped, not `null`. `applyPurchasePolicy`'s post-t1-clear
call always finds a rear weapon (30 coins, the cheapest item in the entire shop) as its
opportunistic pick, since no core-slot upgrade is affordable yet on t1's ~45-coin
payout. `core/combat.ts`'s rear-weapon fire draws `energyCost` from the same shared
pool the generator confound above describes, and adds independent damage on top —
enough on its own to carry t2 regardless of main weapon. This is not a simulator
artifact: any real player who buys the cheapest available shop item after t1 (a
natural, unremarkable thing to do, not an edge case) would see the same inflated t2
clear rate.

**Fix: same lever, extended.** New `MissionSpec.disableAuxWeapons?: boolean`
(`core/types.ts`) + `data/loadouts.ts`'s `applyDisableAuxWeapons` — strips rear and side
weapon regardless of what's bought/equipped, wired into the same three call sites.
t2 sets it alongside `neutralizeGeneratorId`. Sim-verified back to the documented 10.8%
clear rate on `pulse-1`; `pnpm campaign`'s t2 retry-count now reads mean≈1.9 (a real
fail-then-fix shape, matching t1's mean=2.00), not the artificial 1.00 both confounds
produced independently.

Verified: `pnpm test` (753/753), `lint`/`lint:comments`/`build:dry` clean, `pnpm
sim -- --mission t2` at 10.8%, `pnpm campaign`/`pnpm balance` re-confirmed unaffected
outside t2's own loadout resolution, `pnpm onboarding` passes end to end (0 failures
across the full t1→t2→t3→t4 journey).

### t1 playtest feedback (2026-07-20/21) — all 5 items fixed, plus retry narration extended to t2/t3 and a t4 copy pass for cross-tutorial consistency
Tomáš played the just-shipped t1 redesign live and reported 5 concrete items, then asked
for a full first-playthrough story across all four tutorials, not another piecemeal
patch: "think about this as a story, as a plan with bullet points what the new player
will see and will do. it must all line up. All tutorial missions must be lined up!" A
plan was written up (investigation findings + the current vs. proposed story for
t1-t4 + an implementation plan) and approved before any of this landed.

1. **Coins.** Root cause: t1 has no weapon, and shield-burst chip damage was tuned to
   never finish off a guardian (25 HP, deliberately survives one burst) — so kill-coins
   were always exactly 0, win or lose. Asked directly; Tomáš's framing ("you should be
   given coins for every enemy you kill") ruled out a bespoke flat consolation payout in
   favor of making the existing per-kill path actually fire. Folded into the wave retune
   below (`GUARDIAN_SLOW.shotDamage` 3→8 and count/spacing changes together produced a
   real burst-kill on the winning path — 1 avg kill = +15 coins on top of the 30
   completion bonus, sim-verified). A losing run still nets 0, confirmed to be a genuine
   mechanical floor (any guardian HP low enough to let a losing run burst-kill also made
   the wave trivially winnable regardless of generator, tested directly) — Tomáš accepted
   0-on-loss once that tradeoff was shown, matching how every other real mission already
   works when the ship dies with zero kills.
2. **Enemy overlap.** Real, confirmed regression from the original t1 wave (12
   guardians/spacing 18 in one event): `timeline.ts`'s `SPAWN_JITTER` is a percentage of
   each enemy's whole cumulative spawn distance, so its absolute size grows with an
   enemy's index within an event regardless of how generous `spacing` looks — confirmed
   directly (two guardians spawning 0.47 units apart, vs. `MIN_VISUAL_SPACING`'s
   guardian floor of 15). Fixed by capping the wave at 5 guardians in one event
   (sim-verified safe: worst-case live gap ~17-22 across 300+ seeds) and raising
   `shotDamage` to compensate for the lower total collision count, re-verified visually
   in a real browser render across the whole wave (no overlap at any point) in addition
   to the sim probe. A new permanent regression test (`missions.test.ts`, scoped to `t1`
   for now) runs the real spawn path across seeds and checks live gaps — see this file's
   own still-open "jitter-vs-spacing overlap risk... game-wide" entry for why it isn't
   enforced on every mission yet.
3. **Ship-side hull/shield bars.** Didn't exist anywhere in the game (only enemies had
   individual hp bars). Added `CombatScene.ts`'s `renderShipStatusBars()`, mirroring
   `drawEnemyHpBar`'s color-tier pattern, drawn on a dedicated Graphics object (not
   shared with `hpBarGfx`, so it stays visible during the post-finish hold where
   `renderEnemies` doesn't run). Global feature, verified across early-game, endgame
   loadout, boss fight, and low-hull-vignette screenshots.
4. **Retry-aware narration.** Added `SaveData.t1FailedOnce`/`t3FailedOnce` (mirroring the
   existing `t2FailedOnce`), a `narratorEventsForAttempt` resolver (`data/missions.ts`,
   deliberately taking the three flags directly rather than a `SaveData` import, since
   `save/SaveManager.ts` already imports FROM `missions.ts`), and short retry-variant
   scripts for **all three** fail-capable tutorials (t1/t2/t3 — extended beyond t1 alone
   per Tomáš's own "line them all up" framing, confirmed explicitly before implementing).
   Found and fixed a real bug this surfaced: `NARRATOR_ARROW_TARGETS` (`CombatScene.ts`)
   is keyed by `[eventIndex][lineIndex]`, which a single-event/single-line retry script
   can coincidentally share with the first-attempt script despite completely different
   content — t2's retry narration was rendering a stray arrow pointing at the ENRG bar
   for no reason. Fixed with a `usingRetryNarration` flag that suppresses the arrow
   lookup whenever the retry variant is active. All three verified visually in a real
   browser (t3's required forcing a genuine wrong card pick, since `combat.fastForward`'s
   cheat auto-resolution always picks index 0 — which happens to be t3's own correct
   answer, so a plain fast-forward can never fail t3 for a visual check).
5. **Generator kind gating.** Added `GENERATOR_KIND_UNLOCK_STARS` to `items.ts`
   (`torrent: 0, surge: 0, reserve: 3, steady: 5`), mirroring `WEAPON_KIND_UNLOCK_STARS`'s
   `gatedLadder` pattern exactly — a data-only change, since lock-badge rendering was
   already generic. `torrent`/`surge` stay free deliberately: torrent is the real
   `defaultSave()` default every fresh save already has, and surge is t1's one
   sim-verified fix — gating either would strand a first-time, 0-star player. A
   Fable-model review confirmed 3/5 aren't arbitrary (they land almost exactly where a
   player's real star total sits after their first one or two real mission clears, per
   `balance-report.md`'s per-star reachability numbers) and that gating both kinds (not
   just one) matches weapon's own 50/50 free/gated ratio more closely than a gentler
   3-free/1-locked split would. Verified visually (fresh 0-star save's generator tab:
   Torrent equipped/bright, Surge bright with a coin badge, Reserve/Steady dimmed with
   ★3/★5 badges) and via `pnpm campaign` (100%/100% completion, t1 retries still exactly
   2.00, unchanged). A real pre-existing gap surfaced during this review — `computeKindRow`
   never nulls a locked row's `mutation`, unlike `computeLevelChip` — is NOT specific to
   generator (identical for weapon ion/nova and rear-weapon arc/cluster/plasma already)
   and not exploitable in production; logged as its own separate still-open entry rather
   than fixed here.
6. **t4 copy pass.** Small blurb/narration wording change only (no mechanic change) so
   t4 reads as the deliberate no-fail practice round it already mechanically is, instead
   of implying a fourth "you will fail without the fix" puzzle right after three
   real ones in a row.

Verified throughout: `pnpm test` (747/747), `lint`/`lint:comments`/`build:dry` clean,
`pnpm campaign` (100%/100% both archetypes throughout), `pnpm balance`/`pnpm pacing`
unaffected (same baseline flags: w0 SLOW_START, m1 MONOTONY), `pnpm dlx fallow` back to
the same single pre-existing flagged file (`src/core/combat.ts`), `pnpm audit-taps`
22/22, full `pnpm screenshot` batch 77/77 re-run after every workstream, plus real
browser verification (not just sim/screenshot-fixture checks) for the overlap fix, all
three retry narrations, and the generator lock badges.

### t1 (Shield Basics) converted to a fail-first-then-shop-fix tutorial via the GENERATOR — fixed 2026-07-20
Tomáš's request: "I want the game start with the shield tutorial, you will fail, but
then the shop unlock, you will improve the GENERATOR so that your shield will [be]
enough to win the first tutorial." Mirrors t2's own fail→shop-fix pattern, but via the
GENERATOR (energy.ts's `pulseShield` — the shield only recharges once the generator's
own tank hits full capacity, so a generator kind's output-vs-capacity ratio directly
controls how fast the shield recovers) rather than a weapon-kind switch.

**A real design trap found and corrected before shipping:** the first implementation
attempt forced a bad generator kind (`generator-reserve-1`) via `forcedLoadout`, mirroring
the OLD t1's mechanism. A Fable-model pre-implementation review blessed the mechanics
but didn't catch (and neither did the initial plan) that `ForcedLoadout`'s own doc
comment already says the resolution "ignores the player's save" — every attempt,
retries included, would have re-forced the same broken generator regardless of what the
player bought in the shop, making the "fix" completely inert. Caught by re-reading
`CombatScene.ts`'s loadout-resolution line before implementing, not by the review.

**Actual fix:** t1 now runs on the player's REAL equipped gear, like t2 — `forcedLoadout`
dropped entirely. A new `MissionSpec.disableWeapon` flag (applied via
`loadouts.ts`'s `applyDisableWeapon`, wired into `CombatScene.ts`, `tools/simulate.ts`,
and `tools/campaign-simulate.ts` — the same three call sites `neutralizeMotorForDaily`
already touches) replaces the old `forcedLoadout`'s `weaponId: null` for exactly this
one case: strip the weapon from an otherwise-real loadout, without needing a full
override. Since this means torrent-1 (the actual starter-save default, not an
artificial worst-case) has to be the kind that fails, the wave was re-tuned against
that constraint (`runMission`, 3000 seeds/config): 12 guardians at spacing 18
(~14s) — torrent-1/reserve-1/steady-1 all fail 0.00% of the time, `generator-surge-1`
("maximum output, tiny battery") is the one kind whose fast small-batch refill keeps
the shield topped up, clearing 100% with ~11% avg hull remaining. Both of t1's old
stars (`hull-above 0.5`, `shield-unbroken`) are now permanently unreachable even under
the one real fix — dropped, matching t2/t3's own precedent.
`tools/campaign-simulate.ts`'s `applyPurchasePolicy` got a t1-keyed branch
(`justFailedMissionId === 't1'`) mirroring t2's own, so every simulated archetype takes
the free torrent→surge switch right after a real t1 loss — `pnpm campaign` shows
exactly 2.00 mean retries at t1 for both archetypes, 100%/100% completion, unaffected
elsewhere. Verified first-collision timing (T1_NARRATOR_EVENTS' tick-56 sync) is
unaffected by the new wave — timeline.ts's `spawnEnemy` always starts an event's first
enemy at `LANE_LENGTH` regardless of `spacing`/`count`, confirmed via a real
per-tick probe (53-59 across seeds, same band as before).

**A second, unrelated pre-existing bug found and fixed while verifying screenshots:**
`HubScene.ts`'s mission-detail panel hardcoded "Training mission — preset loadout" for
every tutorial regardless of whether it actually used one — already stale for t2 (which
dropped `forcedLoadout` in an earlier session) and now doubly wrong once t1 joined it.
Added `MissionDetailViewModel.usesRealGear` (`mission.forcedLoadout === undefined`) so
the panel says "uses your real equipped gear" for t1/t2 and "preset loadout" for t3/t4.

Verified: `pnpm test` (740/740), `lint`/`lint:comments`/`build:dry` clean, `pnpm
campaign` (100%/100% both archetypes, t1 retries=2.00 exactly), `pnpm balance`/`pnpm
pacing` unaffected (act1-only, don't touch tutorials), `pnpm dlx fallow` back to the
same pre-existing single flagged file (`src/core/combat.ts`), `pnpm audit-taps` 22/22,
full `pnpm screenshot` batch 77/77 including a renamed `result-scene-t1-shop-redirect`
(the old `result-scene-t1-victory` shot's own premise — a fresh player's first t1
attempt wins — is no longer true) and a re-verified `hub-mission-detail-tutorial`
showing the corrected copy.

### Tutorials were skippable, and no forced sequence existed — fixed 2026-07-20
Tomáš's directive: "I wanted you to balance all the game and I would just review. But
this doesn't work at all. Let's always force players through tutorial missions, no skip
available." Removed `SaveManager.ts`'s `skipTutorials()` mutator, `viewmodel/hub.ts`'s
`showSkipTutorialsHint`/the galaxy screen's "skip tutorials" link, the
`__cheat.hub.skipTutorials()` dev hook, and the `MISSION_UNLOCK_EDGES` `['t1','m1']`
shortcut edge (replaced with `['t4','m1']`) — the campaign is now a single forced chain,
t1→t2→t3→t4→m1→…→m6, with no way into act1 except finishing every tutorial. Also
retired `w0`'s TUTORIAL/EXPLORE branch-choice screen and the `save.firstBranchChoice`
field it wrote (`ResultScene.ts`'s `'w0-branch'` button kind, `viewmodel/result.ts`) —
both were already confirmed dead (nothing ever read `firstBranchChoice`, `w0` has no
launcher) per this file's former `w0`/`firstBranchChoice` entry, folded into this fix
since removing the only other skip/branch concept in the game made keeping a second,
already-nonfunctional one inconsistent. Added `MissionSpec.campaign?: 'tutorial' |
'act1'` as the real "is this mission a tutorial" source of truth (deliberately NOT
reused from `forcedLoadout !== undefined`, which answers a different question and
diverges once t2 below drops its forced loadout) — six call sites across
`save/SaveManager.ts`, `viewmodel/hub.ts`, `viewmodel/result.ts`, `view/main.ts`, and
`data/missions.ts` switched from the old `forcedLoadout`-based check to
`campaign === 'tutorial'`. `HubScene.ts`'s galaxy map now renders "TUTORIAL"/"ACT 1"
section labels above their node clusters (fixed coordinates, not per-mission layout
math — a minimal foundation per Tomáš's "just some 'level', for now" framing, not a
full multi-act system).

### t2 converted to a real-gear, fail-first-then-shop-fix mission — fixed 2026-07-20
Tomáš's own idea, investigated and design-reviewed (with a Fable-model consult) before
implementation: "there will be tutorial missions that you fail first, then you will be
navigated to the shop to buy upgrade and then you will finish the level." Applied to t2
("Weapon Systems") as the first instance of this pattern — t3/t4 are NOT converted,
left exactly as they were. Key findings from investigation: a fresh save starts with 0
coins, but every kind of a given system is priced identically at a given level, so a
same-level kind switch (e.g. pulse-1 → scatter-1, both 100 coins) is always net-zero —
the shop-fix requires no coins at all, only a switch. `ResultScene.ts` already had a
SHOP button on every result screen; no new navigation plumbing was needed for the "go to
the shop" half of the idea.

**What changed:** t2 dropped `forcedLoadout` entirely (now runs on the player's real,
equipped gear — provably identical to the old forced pulse-1 loadout for a first
attempt, since under the new no-skip chain t1 is the only mission that can precede it,
and t1's 30-coin reward can't afford any tier change). Dropped the mid-mission card
offer (`supportCallTicks`, `firstOfferIds`, and the two narrator lines describing it) —
the fix now happens in the shop between attempts, not via a card mid-run. Retuned the
wave shape: `runMission` sweeps (2000 seeds/config) found a single `count: 16` wave gave
pulse-1 a 5.1% clear / scatter-1 95.8% clear, but only an 8.2% average hull margin on
scatter wins (4.2% of players who did the intended fix still lost) — a Fable review
flagged that margin as too thin for a mission's first fail→fix loop. Splitting wave 2
into two sub-waves of 8, half a second apart, at a slightly reduced wave-1 count (3→2)
gave a materially better result: pulse-1 clears 10.8% (still a firm fail), scatter-1
clears 99.2% (only 0.8% loss-after-the-intended-fix), avg hull 12.3% on wins — shipped
with this shape. Dropped the hull-above-50% star (unreachable at that margin, same
reasoning as the earlier t2/t3 retune below); kept all-kills (100% reachable on every
win). Added `MissionSpec.defeatHint?: string` (a teaching line shown on the defeat
screen) and a new `ResultViewModel.buttons.kind === 'defeat-shop-redirect'` state — per
Fable's read of Tomáš's literal wording ("you WILL be navigated"), t2's defeat screen
skips the usual RETRY/MISSIONS/SHOP row entirely and shows only the hint text plus a
single GO TO SHOP button (`ResultScene.ts`).

**Known caveat, fixed 2026-07-20:** the wave was tuned against bare `STARTER_LOADOUT`
(no rear weapon). A player who buys the cheap 30-coin rear weapon before ever
attempting t2 (a real, if unlikely, path — nothing stops a player from browsing the
shop after t1 before diving into t2) clears the wall on pulse-1 alone (confirmed via
probe: 100%), skipping the intended fail state entirely. Found via `pnpm campaign`'s
retry-count report showing t2 clearing on attempt 1 essentially every time — traced to
the campaign simulator's own "buy the cheapest affordable thing" purchase policy
reflexively buying that rear weapon with t1's leftover coins. `tools/campaign-simulate.ts`
was updated so its purchase-policy simulation applies the same free pulse→scatter fix
every archetype would get from the mission's own defeat-shop-redirect screen, keyed
specifically on "t2 was just failed" (not "t2 is about to start") so the simulated
economy still experiences the real fail-first attempt before ever fixing it —
`applyPurchasePolicy`'s new `justFailedMissionId` parameter.

Initially judged acceptable (a first-time player following the natural "NEXT MISSION"
flow never sees the shop before their first t2 attempt), but Tomáš asked to close the
gap outright rather than rely on the common-path argument: the hub's main-menu SHOP
button is now locked (dimmed, labeled "(LOCKED)", non-interactive —
`isShopNavLocked`, `viewmodel/hub.ts`) until `SaveData.t2FailedOnce` is set (a new
field, set in `applyMissionResult` the moment t2 is lost — `save/SaveManager.ts`) or
t2 has been won outright. Only the main-menu button is gated, not `HubScene`'s
`setNav()` itself — t2's own defeat-shop-redirect screen (`ResultScene.ts`'s GO TO SHOP
button) navigates via `initialNav: 'shop'`, which routes through `setNav()` directly
and is completely unaffected, as are the `__cheat.navShop`/`showShopTour` dev hooks.
Verified with a real (non-cheat) mouse click on the redirect button after fast-forwarding
t2 to a defeat — lands on `nav: 'shop'` correctly. `hub-main-menu-fresh`'s screenshot
now shows SHIP CONFIGURATION dimmed/locked; the `unlockAll()`-baseline `hub-main-menu`
shot (t2 already completed) shows it fully active, confirming both states render
correctly. New tests: `SaveManager.test.ts` (`t2FailedOnce` set only on a t2 defeat,
never on a win or any other mission) and `hub.test.ts` (`isShopNavLocked`). Full
lint/build:dry/test (736/736)/lint:comments/campaign/audit-taps/screenshot (77/77) all
clean.

**Verification:** lint/build/test/lint:comments/balance/campaign/audit-taps/screenshot
all clean; `pnpm campaign` still 100%/100% completion for both archetypes; a defeat
screenshot (`result-scene-t2-shop-redirect`) confirmed the redirect UI renders
correctly (initial version had the defeat hint text overflowing off-screen — fixed by
switching from the plain `addLabel` widget to a `wordWrap`-configured `Phaser.Text`,
matching the pattern already used elsewhere in the view layer for long strings).

### t2/t3's support-card decision had no real consequence — fixed 2026-07-20
Tomáš's directive: "if you cannot make a decision, you must not fail. but the tutorial
with decision MUST fail if you make the wrong decision. don't make this game too easy."
t2 ("Weapon Systems") and t3 ("Support Cards") both present a scripted 3-card choice and
claim in their own blurb/narrator text that picking correctly matters ("the right card
fixes that" / "you need the right card to break through") — but `completesOnDefeat:
true` applied uniformly to all four tutorials (t1-t4) meant NOTHING you picked, including
skipping the card entirely, could ever fail the mission. Verified before touching
anything: 500-run sims forcing every possible pick (including skip) on both missions all
landed at 100% clear with near-identical hull remaining — the "decision" had zero teeth.

**t3's specific root cause turned out to be different than the mission's own code
comment claimed.** The comment said the regen guardian was "unkillable by shooting
alone" — untrue as tuned: pulse-1's base DPS (10/5-tick cycle) actually does out-damage
the nominal 22 HP/s regen once cycle-boundary math is accounted for, so the guardian
quietly dies to *any* pick eventually. A Fable-model review (asked for a second opinion
given this touches balance data and reverses a documented "tutorials can't fail" rule)
caught this before I shipped a fix built on the wrong diagnosis, and traced the real
mechanism: the guardian was surviving long enough to walk its slow (speed 0.3) approach
into a harmless collision, ending the mission in victory regardless of DPS — the
"problem enemy" was suiciding into the ship's shield.

**Fix**, sim-verified (Fable ran 2000 runs/pick, independently reconfirmed with my own
1000-run sim before landing): both missions now set `completesOnDefeat: false` — a real
decision tutorial with no way to fail teaches nothing, so a wrong pick is a genuine,
intended failure requiring a retry, same semantics every main mission already uses.
- **t2**: replaced the offered cards with `['sit-swarm-sense', 'w-dmg-30', 'w-cost-25']`
  — `sit-swarm-sense` ("hits 3 extra enemies when 6+ are present") is a real,
  thematically-exact fix for "single-target fire bogs down against a dense wall,"
  unlike the old `w-rate-20`/`w-dmg-30`/`w-cost-25` trio, none of which changed the
  weapon's single-target nature. Wave 2's fodder count went 8 → 17 (the exact tuned
  cliff — 16 leaks 7-13% wrong-pick wins, 18 makes even `w-rate-20` viable again if ever
  re-added). Result: sit-swarm-sense 100% clear, either other pick or skip 0%.
- **t3**: `GUARDIAN_REGEN`'s `shotDamage` 2→10 and `ticksBetweenShots` 3s→2s (regen
  2.2→2.1/tick, hp/speed unchanged) — the guardian's own fire is now what fails a wrong
  pick, well before its slow approach would ever collide. Result: `w-dmg-30` 100%
  clear, `s-cap-20`/`g-out-08`/skip 0%.
- Dropped now-permanently-unreachable stars (a real wrong-pick-fails design means the
  survivable path takes real damage): t2 lost `hull-90`/`shield-unbroken`, t3 lost
  `shield-unbroken`. Same reasoning t1's own comment already gives for dropping its
  unreachable all-kills star. Tutorial stars are internal-only bookkeeping anyway —
  `totalStarsAvailable()` excludes every `forcedLoadout` mission, and ResultScene never
  surfaces tutorial stars to the player (`TRAINING MISSION / No stars awarded`, always,
  regardless of what's reachable) — confirmed pre-existing, not something this changed.
- t2/t3's bottom-bar `NOVAK COMMAND` lines (`story.ts`) were softened — t3's especially:
  it previously said "A damage boost is what breaks its regen — take it," an outright
  answer that would have trivialized the now-real decision. Both now hint at the
  *category* of the right answer without naming it, matching the existing blocking-modal
  narrator lines' restraint (Fable's explicit recommendation: let the failure + a correct
  retry teach itself; don't spoil the only puzzle these tutorials have).
- t1 (no decision — no weapon) and t4 (use the preloaded supplies or don't, a spectrum
  rather than a right/wrong pick) were deliberately left alone — completesOnDefeat stays
  true for both, matching Tomáš's own rule that a no-decision tutorial must not fail.
- **Not implemented, flagged for later**: Fable noted t2's tick-0 narrator modal is 6
  lines a player re-taps through on every retry — not missing failure-explanation (there
  should be none), but retry friction. Worth a "skip already-seen tutorial narration on
  retry" mechanism if playtesting shows this annoys people; needs new save/session state
  to track "seen before," out of scope for this fix.

Verified: `lint`/`build:dry`/`lint:comments`/`test` (727/727) clean, `pnpm balance`
(m1-m6 unaffected), `pnpm campaign` (100%/100%, both archetypes use `greedyPick` for
cards so they reliably pick the right one — this sim was never meant to model a
consistently-bad-choices player), full `pnpm screenshot` batch (78/78) and `pnpm
audit-taps` (22/22) clean, plus a manual playthrough-equivalent probe: card offer
screen renders correctly (SWARM SENSE included, no overflow), a wrong pick reaches a
real SHIP DESTROYED/RETRY screen, a right-pick retry reaches MISSION COMPLETE, and — the
part that actually matters — a wrong-pick defeat leaves t3 locked on the galaxy map
while a right-pick victory unlocks it, confirmed via two clean (no `unlockAll`)
progression runs.

### `pnpm dlx fallow` full clean sweep — fixed 2026-07-19
Went through every category `fallow` was flagging, not just the health-threshold
failure: 5 unused exports (`HUD_ROW_HULL`/`HUD_ROW_PROG` in `CombatHud.ts` had no
caller at all — deleted, keeping `HUD_ROW_SHLD`/`HUD_ROW_ENRG` which t1/t2's narrator
arrows do use; `BASE_URL`/`BOOT_TIMEOUT_MS` in `playwrightHarness.ts` and `ROUND_COUNT`
in `dailyMission.ts` are only ever used inside their own file — de-exported, no
behavior change), 1 false-positive unresolved import (`pacing-report.ts`'s
`new URL('./pacing-report.json', import.meta.url)` is constructing an output path to
write, not importing a module — fallow's static analysis flags the `new URL(...,
import.meta.url)` idiom heuristically and can't tell the two apart; suppressed inline
with `// fallow-ignore-next-line unresolved-import`), and 1 real complexity violation
(`screenshot.ts`'s `main()`, cognitive complexity 27 vs. threshold 25 — split into
`resolvePendingShots`/`launchPage`/`runOneShot`/`runShotSetupAndCapture`/
`runShotCleanup`/`reportStrayError`, same pattern as the earlier `tap-target-audit.ts`
`auditState` split). Verified: full 76-shot `pnpm screenshot` batch and `pnpm
audit-taps` (22 states) both pass identically to before the refactor; `lint`/
`lint:comments`/`build:dry`/`test` (727/727) clean; `pnpm dlx fallow` now exits 0.

**Left alone, not a fallow failure:** the "5 refactoring targets" list (`src/core/
combat.ts`, `src/data/cards.ts`, `src/viewmodel/shopSystems.ts`, `src/core/cards.ts`,
`tools/campaign-simulate.ts`) is an advisory ROI ranking, not a threshold violation —
`pnpm dlx fallow` exits 0 with these still listed. Splitting `combat.ts`/`core/cards.ts`
specifically means restructuring the deterministic core simulation module the tick-phase
determinism contract and every replay hash depend on — a real architecture change, not a
mechanical cleanup, and squarely the kind of core/ touch this project's own convention
says needs a Fable pre-implementation review first. Not attempted here; flagged for a
dedicated pass if wanted.

### m6's boss-time T2/T3 use conservative intra-distribution steps — decision: leave as-is, 2026-07-19
Added 2026-07-18 while fixing the duplicate time-star thresholds
(`docs/plans/fable-review-fixes-2026-07-18.md`). m6's `m6-boss-t1/t2/t3` were all
literally 317s; the fix stepped T2/T3 evenly through the intended loadout's own
measured boss-kill-tick spread (317 → 312.7 → 308.3 → 304). This deliberately does NOT
mirror m1-m4's `timeStarT2Loadout` reference-tier anchoring: the same probe measured the
t2/t3 reference tiers killing the boss at ~204s/~189s median — anchoring m6's T2/T3
there would roughly HALVE the finale's boss-time requirements, a real difficulty
redesign of the campaign's one intended test, not a de-dup fix.

**Decision (2026-07-19):** Tomáš authorized making this call directly rather than
holding it. Leaving the conservative intra-distribution steps as-is — a stronger
reference-tier re-anchor changes what the finale's stars mean, and that's not a call to
make without his sign-off. No code changed; this closes the open question raised
2026-07-18.

### Dominant weapon kind per mission (m3/m3b/m4/m5/m6) — decision: leave alone, 2026-07-19
`docs/plans/fable-fun-review-followup.md`'s Item 7: `expert` archetype's campaign
pacing-shape score doesn't respond to mission-density tuning because it always plays
`pnpm tune`'s recommended gear, which converges on whichever weapon kind trivially
counters each mission's difficulty constraint. Investigated 2026-07-15 and again in
Phase E-2 (2026-07-18): confirmed via `pnpm tune`'s full grid that 5/7 missions
(m3=ion, m3b=nova, m4=ion, m5=scatter, m6=ion) genuinely have one dominant weapon kind
at every generator level, not a measurement artifact — the "kinds are situational
sidegrades" design working as built (each kind has a real home-mission and a real
weak-mission). This is what keeps `expert`'s pacing-shape flat, and rebalancing it means
touching core weapon damage numbers across all 7 missions, a real design-philosophy
question, not a tuning tweak.

**Decision (2026-07-19):** Tomáš authorized making this call directly rather than
holding it. Leaving weapon-kind balance alone — this is squarely a bigger
design-philosophy question (whether kinds should be more interchangeable across
missions) than a tuning-data problem, and the current "situational sidegrade" design is
working as intended, just at the cost of `expert`'s pacing-shape metric never moving.
No code changed; this closes the open question raised 2026-07-15/07-18.

### Daily Mission — a faster motor scores WORSE than a slower one at the same weapon/shield/generator tier — fixed 2026-07-19
Confirmed 2026-07-18 (E-4) as a large, monotonic inversion (rush-1 nets ~2× rush-3's
coins at identical weapon/shield/generator), owner-gated between two candidate fixes:
decouple flowing-wave timing from motor speed, or freeze motor draw during gate fights.
Tomáš authorized making this call directly (2026-07-19).

**A Fable-model review prototyped and A/B-tested the draw-freeze candidate before it was
implemented, and rejected it**: freezing motor energy draw during `blocksConveyor` gate
fights barely helps the fastest motor (+6-13%, since rush-3 dies to wave-compression at
~100s, well before brownout becomes the limiting factor) while helping the slowest
motor substantially more (+7-38%), *widening* the rush1/rush3 ratio in 2 of 3 tested
card-policy configs instead of closing it:

| Config | rush-1 | rush-2 | rush-3 | rush1/rush3 ratio |
|---|---|---|---|---|
| greedy cards | 231.0 → 247.8 | 206.7 → 207.0 | 206.6 → 206.8 | 1.12x → 1.20x |
| random cards | 479.5 → 553.1 | 291.3 → 424.2 | 239.3 → 271.1 | 2.00x → 2.04x |
| no cards | 502.4 → 691.3 | 251.3 → 537.2 | 232.3 → 246.9 | 2.16x → 2.80x |

(columns: baseline → with draw-freeze applied.) Root cause is structural, not a small
secondary channel: daily score is driven by "gates reached before death," and a faster
motor's effective timeline speed monotonically compresses the flowing-wave schedule
between gates into less real time regardless of energy draw — measured across the whole
motor system, not just rush (sentinel-5 nets 770 avg coins over 22.9-minute runs vs.
rush-1's 494 and rush-3's 239).

**Fix actually shipped: neutralize motor tier for the Daily entirely**, rather than
patch either timing channel. `src/data/loadouts.ts`'s `neutralizeMotorForDaily()`
replaces a loadout's motor with its own kind's Lv1 spec (every kind's Lv1 is identical:
mult 1.0, draw 0.30) before the run starts — wired into both `CombatScene.ts`'s real
daily path and `tools/simulate.ts`'s `--daily-seed` path, so motor level becomes
score-neutral on the Daily instead of actively punishing investment, without touching
`core/`, `timeline.ts`, or any campaign mission's tuning. Verified via a same-loadout
motor-only sweep (pulse/wall/torrent Lv2, `rush` 1/2/3, 500 runs each against a fixed
daily seed): all three motor levels now produce identical results (231.0 avg coins,
283.3s avg survival) since they all resolve to the same neutralized Lv1 spec. Added
honest UI copy ("Motor governed to baseline here") to the daily detail panel
(`HubScene.ts`) so a player isn't left wondering why an upgraded motor did nothing.
`docs/design/13-balance-and-tuning.md`'s Daily Mission tuning log updated with the
final outcome.

### NarratorBar reveal-timing waits were a wall-clock patch — already fixed, entry was stale
Part of the "Coverage sweep — deliberately deferred items" bundle: `combat-t1`/`t2`/
`t3`/`t4`'s screenshot shots supposedly used a fixed `waitForTimeout(5500)` sized off
the longest current `story.ts` line, which would silently under/over-shoot if a future
line changed length. Checked 2026-07-19 while working through the coverage-sweep
bundle: this no longer describes the current code at all. t1/t2/t3 need no bottom-bar
wait whatsoever (tutorial mission-start narration moved into the blocking modal in an
earlier session); t4 already polls via `waitForNarratorFullyRevealed`
(`playwrightHarness.ts`), not a fixed sleep. The entry was simply never moved out once
the underlying fix landed. Tidied a stray comment in `combat-t4`'s own setup that still
narrated the old 5500ms guess as if it were current. Verified: all four shots pass;
`pnpm build:dry`/`lint`/`lint:comments` clean.

### `tools/tap-target-audit.ts`'s new `fallow` high-risk flag — fixed 2026-07-19
Today's additions (the double-`flushPendingOffer` fix and the new
`checkShopTabLabelClickableAfterTourEnds` regression check) pushed `auditState`'s
complexity to CRITICAL (21 cyclomatic, 28 cognitive, 64 lines), crossing `fallow`'s
health-risk threshold and taking the project from 1 flagged file to 2. Fixed by
splitting `auditState` into named steps: `runStateSetup` (setup + settle + double
flush + error check), `isSceneActive`, `checkTapTargetSizesAndEdges`, and
`checkOverlaps`, with `auditState` itself now a thin orchestrator. Verified:
`pnpm dlx fallow` back to 1 file above threshold (`src/core/combat.ts`, the original,
pre-existing baseline); `pnpm build:dry`/`lint`/`test` (725/725) clean;
`pnpm audit-taps` 22/22, same as before the refactor.

### `combat-m4-turret`'s card-overlay screenshot race — fixed 2026-07-19
A support call could open a real, non-auto-resolving `CardOverlay` in the gap between
`flushPendingOffer`'s own check and the actual `page.screenshot()` call — confirmed
intermittent (one run captured the DISPATCH REINFORCEMENTS overlay instead of the
intended turret combat frame; a subsequent run captured it correctly). Fixed by
re-checking `flushPendingOffer` a second time immediately before the screenshot call
itself, in both `tools/screenshot.ts` and `tools/tap-target-audit.ts`'s main loops
(same race applies to the DOM read in the audit tool, not just the visual capture) —
`flushPendingOffer` is a no-op when nothing is pending, so this costs nothing on every
other shot/state. Verified: 2 full `pnpm screenshot` batches (76/76 each) plus 5
targeted re-runs of the previously-affected shots, all clean; `pnpm audit-taps` 22/22;
`pnpm test` 725/725.

### Silent-timeout risk in `fastForwardToOffer`/`fastForwardToNarrator` call sites — fixed 2026-07-19
The same class of bug `advanceUntil` was already fixed for (stopping silently at its
tick budget instead of throwing) also affected several `tools/screenshot.ts` shots
built on `fastForwardToOffer`/`fastForwardToNarrator`, which never checked whether
their target state actually happened before screenshotting: `combat-card-overlay`
already had a guard; `combat-card-reroll-exhausted`, `combat-narrator-modal`, and the
four `combat-t1..t4-narrator-modal` shots didn't. Fixed by adding the same
`combat.inspect()` + fail-loudly check to each (mirroring `combat-card-overlay`'s
existing pattern) — added a `hasPendingNarrator` field to `CombatCheats.ts`'s
`inspect()` (and the `CombatSnapshot` type) since no equivalent to `hasPendingOffer`
existed for the narrator side. Verified: `pnpm test` 725/725, `pnpm build:dry` clean,
and the guarded shots all pass across 2 full screenshot batches.

### No permanent regression test for "a coach-mark tour's targets stay clickable after it ends" — fixed 2026-07-19
`HubTour.ts`'s `clearStep()` only re-enables input on targets that were actually
enabled beforehand (so a label Text never becomes clickable-with-no-handler and starts
swallowing taps) — verified once via a discarded manual Playwright probe, never
checked into the automated suite. Promoted into a permanent check,
`checkShopTabLabelClickableAfterTourEnds` in `tools/tap-target-audit.ts`, which drives
a REAL click (not just an internal-state read) at a shop tab's label-text position
right after the tour ends, and fails if the tab doesn't actually switch. Runs
unconditionally on every `pnpm audit-taps` invocation, independent of any state-name
filter.

**Verified the check actually catches the regression it guards** (not just that it
passes): temporarily reverted `clearStep()`'s conditional `if (wasEnabled)
obj.setInteractive()` to an unconditional call, confirmed the new check fails with a
clear message, then restored the real fix and confirmed it passes again. Along the
way, found and fixed a bug in the check itself during this verification: it initially
targeted the shop tour's LAST step (`shop-tab-supplies`), but `hub.tourSkip()` called
right after `hub.showShopTour()` ends the tour on its FIRST step — a later step's
targets are never touched by `clearStep()` at all in that flow, so the check would
have passed regardless of whether the fix was present. Retargeted to
`shop-tab-loadout` (the step actually active when skipped).

### Front/rear weapon kinds had zero gating at level 1 — fixed 2026-07-19
Tomáš's direct playtest feedback: "all first levels of front and rear weapons costs 0
coins. let's make only first 2 free f.ex. give player a choice, but we need to have
some weapons gated for later, no?" Root cause: `items.ts`'s "situational sidegrades"
model priced every kind identically per level with 0 stars at Lv1 for all of them, and
the shop's switch-cost economy charges only the price delta between currently-equipped
and target — so once a player owned any Lv1 weapon, every other kind's Lv1 was a free
switch, no kind ever felt unlocked.

Fable pre-implementation review (shared economy data, this project's own convention)
recommended: front weapon free pair pulse+scatter, gated ion(4★)/nova(8★); rear weapon
free pair grenade+flak, gated arc(3★)/cluster(5★)/plasma(8★); the gate floors the
*whole* per-kind ladder (`Math.max(sharedLadder, gate)`), not just level 1, since
`SaveManager.ts`'s `switchItem` has no star check of its own — a level-1-only gate
would be bypassable by buying straight into a gated kind's higher level.

Implemented in `items.ts` (`WEAPON_KIND_UNLOCK_STARS`/`REAR_WEAPON_KIND_UNLOCK_STARS` +
a `gatedLadder` helper). Fable also caught a real stall hazard in
`campaign-simulate.ts`'s `expert` archetype: it buys *exclusively* from its 4
tuned-kind targets, so a star-locked recommended kind meant it bought nothing at
all — not even a same-kind level-up — until enough stars accumulated (no farming
modeled). Fixed via `targetCandidateForKindOrCurrent`, which falls back to climbing the
currently-equipped kind at the same target level while waiting.

Verified: `pnpm test` (725/725, including two updated `hub.test.ts` invariants that
previously assumed every kind shared one star ladder), `pnpm build:dry`/`lint`/
`lint:comments` clean, `pnpm balance` unaffected (fixed-loadout sweeps never purchase),
`pnpm campaign` — `expert` still 100% completion, no stall. Screenshots of a fresh
(0-star) save's shop weapon/rear-weapon tabs confirm the `★4`/`★8` (weapon) and
`★3`/`★5`/`★8` (rear) lock badges render correctly on the gated kinds only.
`docs/design/10-economy.md` updated with the new gate.

### Discord community link added to the alpha notice and hub main menu — 2026-07-19
Tomáš's request: a link to the project's Discord
(https://discord.com/channels/1512167269080367104) on both screens, with copy
appreciating feedback and recruiting help (music/sounds/level design/anything). He
asked directly how this behaves once wrapped as a Capacitor mobile build — a plain
`window.open()` inside a Capacitor WebView is unreliable (the app's own WebView can
navigate itself to the URL instead of handing off to the system browser, trapping the
player outside the game). The correct fix is the `@capacitor/browser` plugin's
`Browser.open({ url })`, which opens an in-app browser tab on native and falls back to
`window.open()` on web.

**Not installed — sandbox constraint, not a design gap.** `pnpm add @capacitor/browser`
failed here (`ERR_PNPM_UNEXPECTED_STORE`: this project's `node_modules` is linked from
a pnpm store at a macOS host path this sandbox can't reach/write; a package add can't
be patched around the way the earlier rollup/esbuild native-binary fix was, without a
real `pnpm install` that risks relinking the whole tree). Landed instead:
`src/view/externalLinks.ts`'s `openExternalLink()` calls plain `window.open()`
(correct for the current web build), with a one-line note to swap in `Browser.open()`
once the dependency can be added from a machine with a reachable pnpm store (e.g.
Tomáš's own host). **Follow-up still needed:** add `@capacitor/browser` and flip that
one call site before an actual Capacitor build ships.

Placement note: the hub main-menu link couldn't go directly below the nav buttons as
first tried — `HubTour.ts`'s coach-mark popup occupies a fixed y=370-520 band on every
tour step regardless of which button is highlighted, and `pnpm audit-taps` correctly
caught the overlap. Moved above the nav buttons instead (below the title separator).
Verified: `pnpm audit-taps` 22/22, `pnpm screenshot` 76/76, `pnpm test` 725/725.

### Terms/privacy/no-ads notice added — 2026-07-19 (copy is a placeholder, not real legal text)
Tomáš's request: an "I accept the terms and conditions" gate noting account sync/login
(starting with Google) is planned but not live yet, and that the game is forever
ad-free (already the standing design pillar in `docs/design/01-identity.md`/
`GAME_DESIGN.md`, so a promise, not a new decision).

Implemented on `AlphaNoticeScene.ts`: a checkbox toggle ("☐/☑ I ACCEPT THE TERMS &
PRIVACY NOTICE") plus two lines of copy, persisted via `SaveData.termsAccepted`
(accept once, not re-asked every launch). CONTINUE is gated — an unchecked box shows an
inline hint instead of navigating. `__cheat.alpha.continue()` auto-accepts first so
headless runs aren't blocked by a gate they can't tap through.

**Permanent caveat, not something to "resolve" later by editing this entry:** the copy
is honest, lightweight in-game text, not a real Terms of Service / Privacy Policy — it
never claims to be one. Do not treat it as a substitute for an actual legal document
before a real store launch; that needs real legal review, out of scope for an agent
session.

### t1 (Shield Basics) tutorial's four reported gaps — fixed 2026-07-19
Tomáš's direct playtest feedback (flagged that he'd raised at least some of this
before and it hadn't been tracked or acted on — see the process note at the end of
this entry). Four problems, all fixed in the same pass (Fable pre-implementation
review first, since it touched `missions.ts` balance data and shared `CombatScene.ts`
rendering):

1. **Narration never explained the generator or its shop upgrade.** Added a 6th
   `T1_NARRATOR_EVENTS` line introducing the generator (t1 has no weapon, so this is
   necessarily a forward-looking preview, not a live demo) plus synced
   `NARRATOR_ARROW_TARGETS`'s new index 5 to point at the ENRG HUD row.
2. **Enemies arrived too fast to track (~1.1s apart).** Widened `spacing` from 24 to
   60, spreading the 3 collisions ~2.7s apart. Sim-verified via `pnpm sim --mission t1
   --loadout forced` (the default loadout gives t1 a weapon it shouldn't have and
   produces garbage numbers) — this also surfaced a real, pre-existing bug: t1's
   `all-kills` star was 0% reachable (collisions aren't kills, and the shield-burst
   mechanic can't kill a guardian outright at these numbers). Replaced it with
   `shield-unbroken`, which needed its own fix once measured (0% reachable at the
   shared tutorial loadout's shield-wall-1/30 capacity) — t1 now forces
   shield-wall-2/60 specifically, verified at 68.4% reachable (500 runs), a real,
   non-trivial, non-impossible star.
3. **Mission ended immediately after the last kill (600ms).** Bumped to a named
   `VICTORY_EXIT_DELAY_MS = 2000`. Along the way, found and fixed a worse bug this
   naive bump would have hit: `CombatScene.update()` fully freezes (particles, floating
   numbers, ship drift, all of it) for the entire post-victory delay once
   `this.finished` is set — a longer delay alone would have meant a longer frozen
   frame. Fixed via a new `updatePostFinishEffects()` cosmetic-only path that keeps
   floats/particles/idle motion animating during the hold. `DEFEAT_EXIT_DELAY_MS`
   (1400) and `ABANDON_EXIT_DELAY_MS` (600) also named, unchanged in value.
4. **No damage-number feedback on the player's own ship.** `detectCombatFeedback()`
   already tracked hull/shield deltas (for shake/flash) — added `spawnDamageFloat`
   calls there (given an optional color param, shield-blue vs. hull-red, offset apart
   so a same-frame shield-drain-then-hull-overflow hit shows both numbers without
   overlapping).

Verified: `pnpm test` 725/725, `pnpm sim`/`pnpm pacing` for t1 both clean (only the
pre-existing accepted SLOW_START flag), and a manual Playwright probe (headless
Chromium doesn't drive `requestAnimationFrame` in this sandbox, so real per-frame
`update()` verification needed manually stepping `scene.update()` directly) confirmed
the ship-side floats actually render (`-9` in shield blue above the ship on a real
collision) and narrator line 6/6 wraps cleanly with the arrow correctly on ENRG.

**Process note (the reason this entry exists at all):** everything reported from now on
gets written here (or to a task) immediately when reported, not just summarized back
and left to the conversation's own memory — this was raised as a direct complaint this
session.

### Hub shop coach-mark tour skipped the SHIP tab — fixed 2026-07-19
Tomáš's direct playtest feedback: "the shop tutorial looks buggy... skips the ship
panel and on the front weapon it tells the player that it works the same." Root cause:
`SHOP_TABS` (`HubScene.ts`) orders tabs loadout → ship → weapon → ..., but
`SHOP_TOUR_STEPS` only had 3 steps (loadout, weapon, supplies) — the highlighted-tab
ring visibly jumped from the 1st tab to the 3rd, skipping SHIP (the 2nd) with no
acknowledgment. The caption itself ("Every other tab works the same way") wasn't
factually wrong — `SHIP_SYSTEM` genuinely is one of the same seven kind-row shop
systems — but the visual skip undercut it. Fixed by retargeting the middle step at
`shop-tab-ship` instead of `shop-tab-weapon` (SHIP sits immediately after LOADOUT, so
the tour now reads as a smooth first→second→last progression). No caption change
needed. Verified via `pnpm audit-taps`/`pnpm screenshot` and a direct look at the
re-generated `hub-shop-tour-step-2` shot.

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
