# Tutorial balance fix + stale-doc cleanup — remaining open items

> Original plan resolved almost everything it set out to do: t4's clear-rate fix (greedy
> strategy 75.2% → literal 100.0%) landed in `v2/src/data/missions.ts`, and 4 of 5 stale
> `GAME_DESIGN.md` claims were corrected. Full history of that work (diagnosis steps,
> measurements, rejected approaches) has been trimmed from this doc since it's done and
> no longer actionable — see `git log` on this file if the history is ever needed. Two
> decisions from the original document were never resolved and still need Tomáš's call
> before any further code changes:

## Open decision A: what does "100%" mean for t4?

`GAME_DESIGN.md` §13 states the t1-t4 target as **"100% (tutorials are unkillable by
design)"**. Current measurements:

- **Greedy strategy: literal 100.0%** (0/2000 losses) — target met exactly.
- **Random strategy: ~99.1-99.3%** (measured at both 2000 and 10000 runs) — a small but
  real residual. Two independent, diagnosis-driven fix attempts (a reactive
  supply-usage policy, then a second support call) both failed to move this number
  further; it's not a wiring bug, the outcome is genuinely insensitive to both levers
  that were tried.

**Question:** is ~99% under a deliberately pessimistic "ignores card choice entirely"
random-strategy proxy close enough to call t1-t4 done, or is a third fix attempt
warranted? (Note: since `completesOnDefeat` now applies to t1-t4 — see
`docs/plans/tutorial-minimalism-and-onboarding.md` — a tutorial "loss" under random
strategy may no longer even matter to a real player the way it did when this question
was first raised; worth re-litigating this decision in that light rather than in
isolation.)

## Open decision B: the "fixed seeds" doc-vs-code gap

`GAME_DESIGN.md` §9 used to claim tutorials use a hardcoded RNG seed and play
identically every time. That claim was false — `CombatScene.ts` calls `randomSeed()`
unconditionally for every mission, tutorials included, and no seed field exists
anywhere in `missions.ts`. The doc line has now been corrected to state this honestly
(see this cleanup pass's edit to §9), but the underlying design question is still open:

- **(a) Implement fixed seeds for tutorials as originally intended** — would also give
  decision A a third option: pick a seed guaranteed to clear, sidestepping the
  RNG-variance question entirely.
- **(b) Leave tutorials live-seeded** (now correctly documented as such) and treat
  decision A as a pure balance/tolerance question instead.

Neither option has been chosen. Low complexity either way — this is a design call, not
a sizing problem.
