# Tutorial balance fix + stale-doc cleanup

> Written for a fresh agent (Fable) with no memory of the session that produced this
> document. Read `GAME_DESIGN.md` (repo root) and `v2/CLAUDE.md` first.
>
> **No hard stop this time.** Unlike the previous mission-balance pass
> (`docs/plans/mission-design-and-testing.md`), the standing "no `missions.ts` edits
> without Tomáš's sign-off" rule is back in force here — this document is written
> as hypothesis + data for review, not a pre-approved instruction. Wait for Tomáš's
> go-ahead on the design decisions below before editing `missions.ts` or
> `CombatScene.ts`.
>
> **Fable-reviewed 2026-07-10.** Every factual claim below was independently
> re-verified against the code and reproduced exactly. Fable also caught a real
> mistake in the first draft (the crit/miss item below was wrongly listed as
> unimplemented future work — it's already shipped) and two gaps this version now
> accounts for (the simulator never models tutorial supply usage; a second stale
> doc claim about "fixed seeds" sits right next to the one this plan already fixes).
> See the inline notes marked **(Fable)**.
>
> **Status 2026-07-10: item A (t4) mostly done, item B (doc cleanup) done.** t4's
> greedy-strategy clear-rate is now a literal **100.0%** (was 75.2%), reached through
> three diagnosis-driven steps you approved one at a time: exposing supply usage to the
> simulator, trimming the final wave's density, and adding a second support call.
> Random-strategy sits at **~99.1-99.3%** after two of those fix attempts failed to
> move it further — **still open** whether that's acceptable (see "Scope of the 100%
> target" below). The fixed-seeds question (§9) was deliberately left untouched.

## What this changes and why

Two small, independent, low-risk items, bundled because both are quick and both close
loose ends from recent work rather than opening new ones:

**A. Tutorial t4 fails its own documented target.** `GAME_DESIGN.md` §13 states the
target for t1–t4 plainly: **"100% (tutorials are unkillable by design)"** — not a soft
aspiration, the literal number. A fresh measurement (`pnpm sim -- --mission t4 --runs
1000 --strategy greedy --loadout forced`) shows t1/t2/t3 at 100% but **t4 at 75.2%** (memory
had it at 77.8% a few weeks ago — stable, not drifting). t4 ("Battle Supplies") crams a
5+3+6+4+7-enemy fodder/striker ramp into a ~33-second window with only one support call
at second 12 — dense enough that a forced, fixed loadout sometimes can't keep up. This
was explicitly out of scope for the mission-balance pass that just finished (which
covered m1–m6 only); it's the natural next item because the tooling to fix it (density
trim + `pnpm sim --loadout forced`) is identical to what that pass just used on m1.

**B. `GAME_DESIGN.md` has (at least) five stale claims, three in §14's "Known
technical debt" table, two elsewhere.** Verified against the current codebase
2026-07-10, re-verified again after Fable review:
- *§14, "Ship renderer duplication"* — already resolved. `src/view/shipRenderers.ts`
  exists as a shared module (`renderThrusterAssembly`, `renderGunIndicator`,
  `drawShieldRings`, etc.); both `CombatScene.ts` and `ShopPreviewPanel.ts` delegate to
  it. `fallow` reports 0% duplication project-wide.
- *§14, "Motor toggles removed... toggle code to be removed"* — already resolved. No
  `motorEnabled`/`toggleMotor` field or function exists anywhere in `src/core/`; motor
  is fully always-on. **(Fable) Attribution fix**: this row actually lives in §14's
  *"Needs redesign or implementation"* table (line ~654), not the "Known technical
  debt" table (lines ~668–675) — an implementer following the file-hygiene section
  verbatim would look in the wrong table for this one edit.
- *§14, "Balance sweep for time thresholds... run after landscape revert"* — resolved
  this week by the mission-balance pass (all of m1–m6's time-star thresholds were
  recalibrated from 2000-run percentile data).
- *§14/§8, "Crit/miss bolt color feedback | Designed; not wired to view"* —
  **(Fable) wrong in the first draft of this plan, which listed it as unimplemented
  future work.** It's already shipped: `src/core/types.ts:351` defines
  `ShotEventKind = 'player-crit' | 'player-miss' | 'enemy-crit' | 'enemy-miss'`, and
  `CombatScene.ts` renders distinct colors for each (white-tinted crit bolts, grey/dark
  miss bolts, orange normal, plus an enemy-miss deflection spark) — verified directly
  by reading both files, not just trusting the citation. The stale sentence appears
  twice: §14's table row and §8's prose ("crit = yellow-white, miss = grey bolt...").
- *§9, "Fixed seeds — every tutorial uses a hardcoded RNG seed and plays identically
  every time... `pnpm sim --mission t1 --runs 1` always produces the same result"*
  (line ~455) — **(Fable) not implemented.** `CombatScene.ts:192` calls `randomSeed()`
  for every mission, tutorials included; no seed field exists anywhere in
  `missions.ts`. This one is left as a flag for the design decision below rather than
  auto-fixed, since it bears directly on how t4 should be measured/fixed (see below) —
  fixing the doc line alone without deciding what to do about the underlying gap would
  just relocate the staleness.

Leaving a debt table that lists already-fixed items as outstanding is actively
misleading for whoever reads it next (including a future me). Four of these five are
pure documentation edits — no code risk. The fifth (fixed seeds) is a real design
question, not just a doc typo — see below.

**Deliberately not in this plan** (surfaced during research, sized, and set aside —
listed so nobody re-discovers them from scratch):
- **Three manual toggles** (§14: front weapon, rear weapon, shield recharge). Only
  rear-weapon's toggle (`toggleRearWeapon`) exists today; front-weapon and
  shield-recharge toggles were never built. Real scope, needs its own design pass.
- **Booster enemy** (§8: "slow, behind other enemies, continuously buffs the enemy in
  front — must be prioritized"). New core combat mechanic (a buff-aura effect), not a
  data-only change like a normal enemy kind. Needs design decisions (buff radius/
  magnitude/stacking) before a plan can be written.
- **Stars-as-secondary-currency + completion-gated (not star-gated) mission unlock**
  (§14). A real economy/progression redesign — new save-model fields, migration,
  existing-save handling. Much bigger than anything in this document; deserves its own
  plan and its own Fable review.
- **`fallow`'s 3 standing "medium" refactor targets** (`src/core/combat.ts`,
  `src/data/cards.ts`, `src/core/cards.ts` — all flagged repeatedly across sessions as
  "split this file," never blocking, never addressed). Pure code-health, zero
  user-visible change, but real design work (how to split `combat.ts` without breaking
  the tick-order determinism contract). Worth a dedicated pass, not squeezed in here.
  **(Fable) caveat**: `src/core/cards.ts` is only 117 lines — worth double-checking
  whether `fallow`'s "split this file" recommendation still holds for that one
  specifically before spending effort on it; the other two are unambiguously large
  (389 and 360 lines).

## Design decisions requiring confirmation

- **RESOLVED (tooling): the 75.2% measurement never used t4's own lesson.** t4 gifts two
  supplies (`sup-damage`, `sup-shield` — `missions.ts:229`) the player is meant to tap
  during the fight — that's the entire point of "Battle Supplies." `simulate.ts` never
  modeled supply usage for any mission. Added `--use-supplies` (taps the first charged
  slot every tick); re-measured: **75.2% → 97.9%** (greedy) / **96.3%** (random) at 2000
  runs. Confirms most of the original "failure" was the simulator ignoring the taught
  mechanic, not a real balance problem.
- **Option 1 tried, didn't help.** Added `--supplies-policy reactive` (shield-restore
  only below 60% shield, damage-boost only with 2+ enemies on screen, vs. the naive
  "tap the instant it's charged" default). Result: **97.4%/95.5%** — statistically
  indistinguishable from naive's 97.9%/96.3% (within noise at n=2000), and unchanged
  across two different threshold configurations (0.4/3-enemies and 0.6/2-enemies gave
  identical results to the decimal). Verified the policies really do fire at different
  ticks (naive taps immediately, reactive waits until tick 30 for the damage-boost) —
  so this isn't a wiring bug, the aggregate outcome is just genuinely insensitive to
  *when* these two one-shot supplies get used. **Conclusion: supply timing is not what
  causes the residual losses.** Whatever's failing in that last 2-4% of runs happens
  regardless of how well the two gifted charges are spent.
- **RESOLVED (mostly): `missions.ts` density trim.** Diagnosed the exact failure mode
  first — 90% of naive-policy losses clustered in the mission's final 6-9 seconds, right
  after the last wave (originally 7 fodder at second 27, 24s into a 33s mission, no
  support calls after second 12); every failing run showed hull=0 **and** shield=0 at
  death, meaning cumulative attrition, not a single unlucky hit. Trimmed the final
  fodder wave (7→4, spacing 8→11, delayed to second 28) and the preceding striker wave
  (4→3, spacing 12→14) across 3 iterations. Result: **greedy strategy now measures a
  literal 100.0%** (0/2000 losses) — the actual target from GAME_DESIGN.md §13.
- **Residual: random strategy plateaus around 99.1-99.3%, not fully closed.** After the
  density trim, remaining random-strategy losses shifted to ~24s (during/after the
  striker wave, not the final wave) — diagnosed as caused by t4 having only one card
  offer (second 12); an unlucky random pick there sometimes leaves no time to recover.
  Added a second support call (second 18, matching t2's/t3's existing 2-call pattern)
  — moved the number from 99.2% to 99.3% at 2000 runs, and 99.1% at 10000 runs: **no
  real improvement, within noise both times.** Two independent fix attempts (density,
  card cadence) both failed to close this specific residual — further changes would be
  guessing rather than diagnosis-driven, so this was not pursued further without new
  data. **Open**: accept ~99% under `--strategy random` (a deliberately pessimistic
  "ignores card choice entirely" proxy) as good enough, given the literal target
  (greedy, a more realistic proxy) is now met exactly.
- **RESOLVED: t4 fix approach was both** — density/pacing trim first (final wave and
  the preceding striker wave), then a second support call once the trim alone stopped
  moving the random-strategy number. See above.
- **STILL OPEN — scope of the "100%" target**: does 100% mean literally zero losses
  across a large sample (e.g. 0/2000), or is a tiny residual failure rate (say, <1%)
  acceptable given `critChance`/`missChance` RNG exists even in a forced loadout? This
  is now the live question, not an abstract one: **greedy strategy is a literal
  100.0%** — target met exactly, no ambiguity. **Random strategy sits at ~99.1-99.3%**
  after two independent, diagnosis-driven fix attempts — is that close enough, or does
  it need a third attempt? The doc says "100% (unkillable by design)" without
  qualification — worth confirming the exact bar before calling t4 done.
  **(Fable) Related**: `GAME_DESIGN.md` also claims
  tutorials use a **fixed RNG seed** ("plays identically every time" — §9, line ~455),
  which isn't implemented (`CombatScene.ts` uses `randomSeed()` for every mission). If
  fixed seeds were implemented as documented, a *third* option would exist alongside
  "trim density" and "add a supply-usage policy": simply pick a seed that's guaranteed
  to clear, sidestepping the RNG-variance question of what "100%" tolerance even means.
  Worth deciding whether to (a) implement fixed seeds for tutorials as originally
  designed, (b) fix the doc line to admit tutorials are live-seeded like everything
  else, or (c) leave this specific line flagged and out of scope for this pass — it's
  adjacent to, but not required by, fixing t4's clear-rate.
- **Doc cleanup scope**: fix the four verified-and-resolved stale lines identified
  above (ship renderer duplication, motor toggles, balance-sweep thresholds, crit/miss
  feedback — the last one added after Fable caught it being wrongly excluded), or do a
  fuller pass over the rest of §14/§8/§9 while already in the file (e.g. other rows may
  also be stale — not verified here, since that's a bigger audit than this pass's
  actual trigger)? The fifth item (fixed seeds, §9) is *not* a pure doc fix — see the
  design decision above; it's either real feature work or a different doc correction,
  not covered by "the four verified lines." **Recommended: fix the four verified lines,
  handle fixed-seeds per whichever option is chosen above, don't expand into a full
  audit of the remaining ~10 unverified rows** — that's out of proportion to how this
  item was found.

## Complexity analysis

No core loop changes. t4's fix is data-only (`missions.ts` event counts/spacing/support
calls — same shape as m1's fix this week, O(1) per event, no new loop). The doc edit
touches zero code. Total blast radius: one mission's data, one markdown table.

## Test plan

- [x] Resolved the supply-usage tooling gap: added `--use-supplies` to
  `tools/simulate.ts` (a `BoostPolicy` that taps the first supply slot with charges
  left, one per tick — models "player actually uses the mechanic" rather than
  "player ignores it"). Approval-free tooling, same category as the previous pass's
  `intended`-loadout addition.
- [x] Re-measured t4 with the new flag: **75.2% → 97.9%** (greedy) / **96.3%** (random)
  at 2000 runs — confirmed most of the original gap was the simulator ignoring the
  taught mechanic, not a `missions.ts` problem.
- [x] Tried a reactive supply-usage policy (`--supplies-policy reactive`) — no
  improvement (97.4%/95.5%, within noise); confirmed via diagnostic that the policy
  really does change tap timing, so the outcome is genuinely insensitive to it.
- [x] Diagnosed the residual via a defeat-tick breakdown: 90% of naive-policy losses
  clustered in the final 6-9 seconds (hull=0 and shield=0 simultaneously — cumulative
  attrition from the last wave, not one unlucky hit).
- [x] Trimmed the final fodder wave and preceding striker wave (3 iterations) —
  **greedy strategy now measures a literal 100.0%** (0/2000).
- [x] Diagnosed the remaining random-strategy residual: shifted to ~24s, caused by t4's
  single card offer leaving no recovery room after an unlucky random pick. Added a
  second support call (matching t2/t3's existing pattern) — **no meaningful
  improvement** (99.2%→99.3% at 2000 runs, 99.1% at 10000 — within noise both times).
- [x] Confirmed t1/t2/t3 still at 100.0% (500 runs each, `--loadout forced`) after all
  `missions.ts` edits — no regression from t4's changes.
- [x] `pnpm test` still green (371 passing) throughout.
- [x] `pnpm lint` / `pnpm build:dry` clean on every change (tooling, `missions.ts`,
  `GAME_DESIGN.md`).

## File hygiene

- `v2/src/data/missions.ts` — **done.** t4's final fodder wave (7→4 count, spacing
  8→11, delayed second 27→28), preceding striker wave (4→3 count, spacing 12→14), and
  `supportCallTicks` (added second 18) all edited. Data-only, no hardcoded
  paths/credentials risk.
- `GAME_DESIGN.md` — **done.** Four line edits landed: §14's "Known technical debt"
  table (ship renderer duplication, balance-sweep thresholds — both marked ✓), §14's
  "Needs redesign or implementation" table (motor toggles, marked ✓ — corrected table
  attribution per Fable's review), and the crit/miss lines in both §8 and §14 (marked
  ✓, corrected to describe what's actually rendered). Fixed-seeds (§9) intentionally
  left untouched — still gated on its own design decision. No TODOs introduced.
- `v2/tools/simulate.ts` — **done.** Added `--use-supplies`, `--supplies-policy
  naive|reactive`, `tapFirstChargedSupply`, and `tapSuppliesReactively`, following the
  file's existing flag/policy pattern (mirrors `--percentiles` and `greedyPick`).
  `pnpm lint`/`build:dry`/`test` all clean.
- `v2/tools/balance-report.md` / `.json` — still untracked, still not gitignored (open
  since the last pass, not resolved by this one either — Tomáš's call, unrelated to
  t4).

## Checklist

**Design decisions**
- [x] Whether t4's clear-rate should be measured with a supply-usage sim policy —
  **yes**, resolved via tooling: `--use-supplies` added, 75.2% → 97.9%/96.3%
- [x] How to close the residual gap — tried smarter policy (no help), density trim
  (closed greedy to literal 100%), second support call (no help on random's ~99.1%)
- [ ] Exact meaning of "100%" (literal zero-loss vs. near-zero tolerance) — **the live
  decision**: greedy is a literal 100.0%, random plateaus at ~99.1-99.3% after two
  failed fix attempts — is that close enough?
- [ ] Fixed-seeds doc-vs-code gap (§9) — confirmed which of the three options (implement,
  fix the doc, or defer) applies — **untouched, still open**
- [x] Doc-cleanup scope — done: four verified-stale lines fixed in `GAME_DESIGN.md`
- [ ] Test plan approved by Tomáš

**Guardrails**
- [x] No `missions.ts` edit made without a resolved design decision — the density trim
  and support-call addition happened only after you explicitly picked that direction
  each time, not unilaterally
- [x] Every balance claim backed by a fresh `pnpm sim` run at 2000+ runs (10000 for the
  final random-strategy check)
- [x] The four deliberately-excluded items (missing toggles, booster enemy,
  stars-as-currency, fallow's file-splits) stayed excluded — no scope creep

**Performance**
- [x] No change to core tick-loop complexity — the new `BoostPolicy`s are
  O(supplies.length) per tick (same order as `applyBoost` itself); the `missions.ts`
  edits are data-only, no new loop

**Readability**
- [x] t4's edited events follow the exact same array shape and naming convention as
  every other mission in `missions.ts` — no new pattern introduced

**Testability**
- [x] Before/after `pnpm sim` comparison at 2000-10000 runs for every change
  (tooling, density trim, support-call addition)
- [x] `pnpm test` green (371 passing) throughout every step
- [x] t1/t2/t3 spot-checked at 100.0% after the `missions.ts` edits — no regression

**File hygiene**
- [x] No hardcoded personal paths, usernames, or credentials
- [x] No new TODO/FIXME left untracked
- [x] `GAME_DESIGN.md` edits are corrections to existing stale rows, not new speculative
  content

**CI**
- [x] `pnpm build:dry` passes
- [x] `pnpm lint` passes
- [x] `pnpm test` passes with no new failures (371 passing)
- [x] `pnpm sim -- --mission t4 --runs 10000 --use-supplies` (and 2000-run variants at
  each iteration) run and reviewed throughout
