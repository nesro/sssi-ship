---
name: polish-loop
description: Run one round of Nesro Nova v2's visual/UX polish loop — hunt for text overflow, small/hard-to-tap buttons, overlapping enemies, dead-time pacing gaps, and inaccurate/incomplete tutorial narration against docs/design/*.md, optionally chase a focus area the user names, verify with the Playwright audit+screenshot harness and pnpm pacing/test, and cycle nontrivial changes through a Fable review before and after implementing.
---

# Polish loop

One round of an open-ended, repeatable pass over Nesro Nova v2's UI. Tomáš invokes this
from time to time, sometimes bare, sometimes with a focus area in mind ("first app
opening experience", "a tutorial that shows where buttons are"). Either way, the
standing, non-negotiable baseline never changes: **it must never be possible to open the
dev server and see text spilling out of its box, or a button too small/awkward to tap.**

Work autonomously through this whole loop — investigate, plan, implement, verify,
re-verify — without stopping to ask permission for each individual fix. Tomáš has said
explicitly he wants this: "we have time, there is no rush... make as much work as
possible." Only stop to ask if something is genuinely ambiguous in a way code/docs can't
resolve (a real design-intent question, not "should I fix this obvious bug").

Two directory roots matter and are easy to mix up:
- **Repo root** (`/Users/tomasnesrovnal/g/sssi-ship/`): `GAME_DESIGN.md`,
  `docs/design/*.md`, `docs/known-issues.md`. `v2/docs/` is a *different* directory
  (only `plans/`) — don't look for design docs there.
- **`v2/`**: every `pnpm` command in this skill runs from here (`cd v2/` first).

## 0. Orient

- From repo root: read `GAME_DESIGN.md` and whichever `docs/design/*.md` topic files
  bear on this round's focus (always re-read `04-screens-and-layout.md` for the mobile
  safe-zone rule: 44×44px minimum tap target, never closer than 20px to any screen
  edge).
- From repo root: read `docs/known-issues.md` in full. Pick up anything already logged
  as open/deferred that's in scope for this round before hunting for brand-new issues —
  this loop is cumulative across invocations, not memoryless. Its own convention (stated
  at its top and in `v2/CLAUDE.md`) is to move closed entries to a "Resolved" section
  with date + fix, never just delete them — follow that when you close something out.
- `cd v2/` for everything below. Confirm the dev server is up and actually *responding*,
  not just started — `pnpm dev &` returns before Vite is listening, so poll
  (`until curl -s -o /dev/null -w '%{http_code}' http://localhost:5173 | grep -q 200; do
  sleep 1; done`) rather than firing the Playwright harness immediately after launch.
- If Tomáš gave a focus area this round, treat it as the primary theme: read the
  relevant design-doc section(s) for it, and scope investigation there first. Still
  leave room for the standing overflow/tap-target sweep — it's cheap (the audit tool
  covers the whole game in one run) and it's the one thing that must never regress.

## 1. Investigate

- `pnpm audit-taps` (all states) — console-only output (FAIL lines + exit code), **no
  images**. It only checks what's in `tools/tap-target-audit.ts`'s `STATES` list; a
  screen not listed there gets zero coverage.
- `pnpm screenshot` (all shots) — writes PNGs to `v2/screenshots/` (override with
  `SCREENSHOT_OUT_DIR` if you want them elsewhere). This is the one that needs your eyes:
  use the Read tool on each PNG relevant to this round (plus a spot-check of the rest)
  and actually look for: text truncated or spilling past its container; overlapping
  elements; **raw internal ids or placeholder strings leaking into player-facing text**
  (a real bug this loop already found once — a result screen showing "TIME-T1" instead
  of a real label); obviously wrong values; anything that *looks* low-contrast or broken
  but might just be correct state (e.g. a "can't afford this yet" dimming) — verify
  against the code and/or a screenshot taken with a wealthier save before calling it a
  bug, the same way the side-weapon "low contrast" flag turned out to be correct
  affordability dimming, not a defect.
- **Enemy overlap**: `missions.ts`'s `MIN_VISUAL_SPACING` table is a
  per-kind floor enforced by `missions.test.ts` — `pnpm test` already fails loudly if any
  mission event's `spacing` drops below it, so a same-kind overlap regression can't land
  silently. That floor only guarantees two enemies of the SAME kind in one spawn event
  won't overlap; it says nothing about different kinds spawned close together (e.g. a
  fodder wave's tail overlapping a striker wave's start) or about how crowded a screen
  *looks* at high concurrent counts even with zero literal sprite overlap. Spot-check the
  densest screenshots (swarm-heavy missions like m5, multi-kind boss waves like m6) for
  visual clutter the automated floor doesn't cover.
- **Pacing / "nothing is happening"**: `pnpm pacing` (writes `tools/pacing-report.md`)
  flags three things per mission — `SLOW_START` (>3s before the first shot or collision),
  `IDLE_STRETCH` (a single stretch >17s with zero enemies on the lane), `MONOTONY` (>6
  same-kind enemies in a row). `docs/known-issues.md` already documents t1/w0's
  `SLOW_START` flags as an accepted, investigated residual (an intentionally readable
  approach speed, not a bug) — don't re-litigate those two each round. Any OTHER mission
  newly flagged, or an existing flag whose numbers got meaningfully worse, is real signal
  worth investigating.
- **Tutorial narration — accuracy and completeness**: for every tutorial (`t1`-`t4`,
  `w0`)'s `narratorEvents` in `missions.ts`, re-derive each line's claim from the actual
  mechanic it describes — don't just check that it reads plausibly. Trace it to the real
  code: a shield-absorbs-first claim against `conveyor.ts`'s collision routing, an
  energy-refill/brownout claim against `energy.ts`'s slope, a regen-outpaces-damage claim
  against the actual `EnemySpec.regenPerTick` vs. weapon DPS numbers, and so on. This
  exact class of bug — narration describing a mechanic slightly differently than the code
  actually behaves — has slipped through before; treat every mechanic-description line as
  a claim to verify, not prose to skim. Also check completeness: each tutorial's one core
  teaching mechanic (from its own `blurb`) needs an actual narrator line or HUD-arrow
  callout — a tutorial that never explains its own point is a gap even if every line it
  *does* have is individually true. If `CombatScene.ts`'s `NARRATOR_ARROW_TARGETS` points
  an arrow at a HUD bar for a given line index, re-check those indices still line up after
  any edit to a tutorial's line ordering — the two are kept in sync by hand and drift
  silently if only one side changes.
- If the focus area touches a screen/flow the harness doesn't reach yet (e.g. a
  first-open/onboarding flow with no `__cheat` entry point), that's itself the first
  piece of work: add the `__cheat` hook and a `STATES`/`SHOTS` entry before you can
  verify anything about it.
- Mission balance/pacing numbers in `src/data/missions.ts` need Tomáš in the loop before
  changing — this has been treated as owner-gated in practice this project (see
  `docs/known-issues.md`'s F1-F5 history), even though it isn't yet written down as a
  standing rule anywhere durable; if you're unsure whether a change counts, ask. Only run
  `pnpm sim -- --mission <id> --runs 2000` / `pnpm balance` when a round actually touches
  `src/core/` or `src/data/` — the simulator runs the core module headlessly and has no
  view-layer dependency (`v2/CLAUDE.md`'s constitutional rule 2), so a pure `src/view/`
  change cannot move a sim result. Running a 2000-run sim to "check" a layout tweak burns
  time confirming nothing, or worse, gets read as evidence that a view change was safe.
- Track findings with `TaskCreate`/`TaskUpdate` as you go — one task per concrete fix,
  marked in_progress/completed as you work through them. Don't let the list go stale;
  delete or complete items that turn out to be non-issues (with a one-line "why not a
  bug" reason, matching the reviewed-not-a-bug pattern in step 4).

## 2. Plan, then let Fable check it

For anything beyond a pure copy/constant tweak — and *especially* anything touching a
shared helper or layout-math pattern (`ensureMinTapTarget`, the dynamic-cursor layout in
`CombatScene.ts`, `abilityPoolForLoadout`, etc.) — write a short plan (what's broken,
why, the fix, how you'll verify it) and send it to a Fable-model agent for a
pre-implementation critique **before writing code**. Two self-inflicted regressions this
loop already found (an origin/hit-area desync, an off-by-one in a cursor calculation)
were exactly this class of "small" hitbox/layout change — line count is not a good
signal for how much review a change needs; blast radius is.

```
Agent({
  description: "Fable review: <round's focus> plan",
  model: "fable",
  run_in_background: false,   // this is a gate — implementation must wait for the result
  prompt: "Repo root: /Users/tomasnesrovnal/g/sssi-ship (v2/ has the actual game).
           <the plan: what's broken, why, the fix, how you'll verify it — plus enough
           context (file paths, current behavior, the design-doc rule being enforced)
           that a reviewer with no prior context on this conversation can judge it and,
           since you have full repo access, go read the actual files rather than trust
           this description>.",
})
```

`run_in_background: false` is not optional here — Agent calls run in the background by
default, and this step only works as a gate if you actually wait for the result before
implementing.

## 3. Implement and verify

- Make the change. Prefer real, root-cause fixes over papering-over (this session's
  precedent: the BACK/DEBUG dead-zone was fixed by moving the button so its hit area
  needed no edge-clamp at all, not by just writing it up as a known trade-off).
- After every change: `pnpm lint && pnpm lint:comments && pnpm build:dry && pnpm test`
  (must all pass clean). Findings, reasoning, and review attributions belong in
  `docs/known-issues.md`, `docs/plans/*.md`, and commit messages — never in source
  comments; `pnpm lint:comments` enforces this (see `v2/CLAUDE.md`'s "Comment style"
  rule) and a session that writes a dated/narrative comment will fail it, not just
  drift the style.
- Re-run `pnpm audit-taps` and the relevant `pnpm screenshot` shot(s); actually open the
  regenerated PNGs (see step 1's checklist) rather than trusting a clean exit code — a
  "0 failures" audit result only means the states/checks it runs found nothing, not that
  nothing is wrong on screen.
- If your fix touches a shared/generic helper, grep for every other call site before
  declaring done, not just the one you were looking at.

## 4. Fable reviews the result — skeptically

Once verification is clean, note exactly which files you touched this round (`git
status`/`git diff` will include a lot of unrelated pre-existing uncommitted work in this
repo — scope the review to your own touched-file list, not the raw diff). Send Fable a
summary and ask it to find problems, not confirm success:

```
Agent({
  description: "Fable review: <round's focus> result",
  model: "fable",
  run_in_background: false,
  prompt: "Repo root: /Users/tomasnesrovnal/g/sssi-ship (v2/ has the actual game).
           Files touched this round: <list>. Here's what changed and why: <summary>.
           Here's what I verified: <lint/build/test/audit-taps/screenshot results,
           including which screenshots you actually looked at>. You have full repo
           access — read the touched files and any relevant screenshots yourself rather
           than taking this summary at face value. Be skeptical — what's unverified,
           overstated, or still broken?"
})
```

Triage what comes back the same way this loop did the first time:
- **Concrete, in-scope, fixable now** → fix it, re-verify, done.
- **Real but out of scope** (mission-balance data, a bigger redesign) → log to
  `docs/known-issues.md` with enough context for someone to pick it up later, don't
  silently drop it.
- **Subjective/matter-of-taste, or the investigation shows it's actually correct
  behavior** → close it out with a one-line reviewed-not-a-bug note (with the actual
  evidence — e.g. the wealthier-save screenshot — not just an assertion). Don't make
  speculative aesthetic changes chasing a review comment that doesn't survive you
  actually checking it against the code/a real screenshot.

## 5. Wrap the round

- Final full sweep, run from `v2/`: `pnpm lint && pnpm lint:comments && pnpm build:dry
  && pnpm test && pnpm audit-taps && pnpm screenshot` (no shot filters — the whole
  batch). Then actually open
  the screenshots for every screen this round touched, plus a spot-check of a few others,
  to catch cross-screen regressions — the batch re-running clean is necessary but not
  sufficient; nothing in this harness diffs images automatically, a human/agent eye is
  the only regression check that exists for visuals.
- Update `docs/known-issues.md` for anything deferred (repeat: move resolved entries to
  its Resolved section with date + fix, don't delete); mark tasks completed.
- **Never `git add`/`commit`/push anything this loop touches unless Tomáš explicitly
  asks in that turn** — this repo generally carries a lot of pre-existing uncommitted
  work, and commit scope should stay exactly what was asked for.
- Report back concise: what changed, what's verified, what's deferred and why, and (if a
  focus area was given) how it maps to what's left before that feature is real. No need
  to re-explain the process each time — Tomáš has run this before.

## Notes for next time

If a round surfaces a structural gap in the loop itself (the audit tool missing a
screen, the screenshot harness lacking a shot, a `__cheat` hook that doesn't exist yet
for something you need to drive headlessly, or a gap in this skill file itself) — fix it
as part of the round, the same way `flushPendingOffer`'s race condition and the
enemy-sprite exception got fixed in-line rather than deferred. The loop's own
infrastructure — including this file — is fair game, not just the game's UI.
