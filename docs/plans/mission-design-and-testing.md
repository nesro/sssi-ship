# Mission design, enemy pacing, and testing approach — remaining open items

> The bulk of this plan shipped 2026-07-10 under an explicit Tomáš sign-off
> (`/grill-me` handoff): the aggression-tier model (Patient/Escalating/Aggressive)
> reshaped m1/m3/m5, time-star thresholds were recalibrated from real percentile data
> (0 unreachable stars remaining), and `balance-sweep.ts` gained `--json`/exit-code
> output plus a per-mission `intended` loadout check. Full history (the balance-debt
> data, the tier model derivation, the tooling build log) has been trimmed from this
> doc since it's done and no longer actionable — see `git log` on this file if needed.
> Three items were explicitly left open and still need attention:

## Open item 1: manual playtest of the reshaped missions

m1, m3, and m5 were reshaped and pass the simulator's clear-rate/star numbers, but
**nobody has actually played them yet.** The simulator is structurally blind to feel —
the side-weapon/HUD polish work that landed around the same time found real bugs
(missing skip button, silent rear weapon, indistinguishable button states) purely by
playing the game, none of which would ever show up in a clear-rate number. This is the
one item that can't be closed by more simulation; it needs a human with a controller.

Checklist for whoever does this pass:
- [ ] Play each reshaped mission fresh, starter loadout, no prior knowledge advantage.
- [ ] Patient-tier stretches (m1, m2, most of m3/m4): does the opening feel like a
  warm-up — enemies visibly drifting, time to react — or does something already feel
  urgent?
- [ ] Escalating/Aggressive-tier stretches (m5, m6): does the escalation feel like a
  step change the player notices?
- [ ] Note anything that reads as "unfair" even where the simulator says the clear-rate
  is in-band (a single human run can feel bad for reasons that don't average out, e.g.
  an early bad-luck crit chain).
- [ ] Confirm HUD/audio feedback reads correctly against the new enemy mix.

## Open item 2: automated aggression metric — resolved 2026-07-15

Superseded by `pnpm pacing` (`tools/pacing-report.ts`), which measures monotony streaks,
idle stretches, and boss anticlimax signal directly instead of requiring a human to
eyeball `missions.ts` prose. See `docs/known-issues.md` for current `pnpm pacing` findings.

## Open item 3: is `balance-report.md`/`.json` meant to be committed? — resolved 2026-07-15

Gitignored, along with `tune-report.*` and `pacing-report.*` (same category of
regeneratable artifact) — Tomáš's call. See `docs/known-issues.md`.
