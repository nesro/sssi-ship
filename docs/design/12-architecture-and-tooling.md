← [Design docs index](../../GAME_DESIGN.md) · [← Visuals & Audio](11-visuals-and-audio.md)

# Architecture & Tooling

**Core (`v2/src/core/`):** pure deterministic TypeScript — zero Phaser, zero DOM, zero
`Math.random()`. Fixed 100 ms tick. All randomness through the seeded Mulberry32 PRNG.

**View (`v2/src/view/`):** Phaser 3, landscape canvas. Reads core state; never mutates it.
Interpolates positions between ticks for smooth animation.

**Simulator (`v2/tools/simulate.ts`):** imports the real core. Flags: `--mission`, `--runs`,
`--strategy`, `--loadout`, `--seed`, `--daily-seed` (generates and runs the Daily Mission,
[Mission Progression](09-mission-progression.md), in place of `--mission`), `--max-ticks`
(raises `runMission`'s simulator-only safety cap — a well-tuned daily run can legitimately
approach the 600s default). Prints clear-rate, average duration, average/median coins,
average weapon-kills/collisions, and per-star achievement rates. This is the mission editor —
balance numbers here are exactly what players experience.

**Campaign simulator (`v2/tools/campaign-simulate.ts`, `pnpm campaign`):** plays the *whole*
campaign, not one mission — two player-tier archetypes, **expert** and **average** (added
2026-07-10/11; see [Balance & Tuning](13-balance-and-tuning.md)'s "Two-tier player model, not
smart-vs-dumb"). Every run starts from a genuinely blank `defaultSave()` and gets a distinct
seed, so `pnpm campaign` is already "simulate a fresh real player from start to finish,
hundreds of times, randomized" — confirmed 2026-07-15 rather than assumed (~25 full
campaign playthroughs/second measured; 500/archetype in ~40s).

**"One hour of fun" score (same tool, printed per archetype, added 2026-07-15):** a
composite 0-100 score answering "did this campaign actually deliver the target
experience," not just "did it complete." Three sub-scores combined by **geometric
mean** (one weak dimension tanks the total — a technically-complete but boring
campaign shouldn't score well just because nothing broke):
- **Completion** — % of campaigns that reach m6 without hitting the patience cap.
  Failing individual missions isn't penalized here (the player still nets coins and
  keeps progressing, per [Principles](03-principles.md)'s "never stuck") — only
  permanently getting stuck counts against this.
- **Time-fit** — how close estimated total playtime (measured combat time + a
  labeled per-mission shop-time estimate) lands to the aspirational ~60-75min target,
  scored against that real target rather than the current honest ~30min baseline, so
  the number visibly improves as real content lands rather than being quietly
  redefined to match whatever exists today.
- **Pacing-shape** — rewards a real tension curve across missions (using the same
  margin-at-clear data the base report already collects) instead of flat-then-cliff,
  and specifically requires the campaign's actual finale to be at or near the hardest
  point, not just *a* hard point somewhere in the middle. This formalizes what was
  previously a one-off manual check (`docs/plans/fable-fun-review-followup.md`'s Item
  7 campaign-shape acceptance criterion) into a standing, reusable metric.

**Loadout tuning tool (`v2/tools/tune-loadouts.ts`, `pnpm tune`):** the real answer to "which
kind is actually best per mission?" — a per-system tournament (weapon×generator ranked
jointly, since their energy/brownout interaction is real; shield/motor/rear/side weapon/ship
ranked independently) run at each mission's own intended level, not a generic "representative"
one. Generates `tools/recommendedKinds.generated.ts` (auto-generated — never hand-edit) plus a
`tune-report.md` that doubles as a "no trap kind / no dominant kind" invariant check (see
[Principles](03-principles.md)). Say "tune it" to re-run after any `items.ts`/`missions.ts`
balance change — it's pure computation on your machine, not an agent loop, so re-running costs
real wall-clock time but very little conversational budget.

**Pacing/fun report (`v2/tools/pacing-report.ts`, `pnpm pacing`):** measures mission pacing
directly instead of relying on a human reading `missions.ts` prose — a static profile from
`MissionSpec.events`/`EnemySpec.speed` alone (aggression tier per event via time-to-impact,
longest same-kind consecutive streak) plus a dynamic profile from real runs (longest unbroken
zero-enemy stretch, boss weapon-kill-share from `CoreState.bossKillTick`). Flags `MONOTONY`,
`IDLE_STRETCH`, `ANTICLIMAX`; deliberately does not duplicate `pnpm balance`'s star-reachability
check. Thresholds are calibrated against m2 ("Picket Line") as the known-good reference that
must never flag. Re-run after any mission pacing change, same convention as `pnpm tune`.

**Player-fidelity policies (`v2/tools/policies.ts`):** every simulation policy used to leave
`autoFireEnabled`/`rearWeaponEnabled`/`autoShieldEnabled` permanently on — energy management
([Combat](06-combat.md)'s core skill loop) was entirely unmodeled. `RunPolicies.manageToggles`
(`src/core/replay.ts`) is the extension seam; `brownoutAwareToggles` is the first real
policy (cuts the rear weapon below 20% energy, restores above 45%), wired into
`campaign`'s `expert` archetype and exposed as `pnpm sim --manage-toggles`. Confirmed to have
a real, non-trivial effect (sometimes negative — on DPS-constrained missions, cutting the rear
weapon for energy safety cost clear-rate rather than helping, since collision damage from
un-killed enemies outweighed the energy saved).

**Replay record:** `{ version, missionId, seed, loadout, cardPicks, boostTaps, resultHash }`.
Re-running the core with the same record reproduces the run exactly. Playback UI not built yet.

**Save data (`v2/src/save/SaveManager.ts`):** early development only — no player save data is
worth preserving yet. Don't write backward-compatible migrations for save-shape or pricing
changes; bumping `SAVE_VERSION` and falling back to `defaultSave()` for anything older is
sufficient until closer to release. The existing `migrateV5`–`migrateV11`/`migrateLegacy`
functions and `LEGACY_ID_MAP` are legacy scaffolding, not a pattern to keep extending.

**Five constitutional rules** (violating any broke v1):
1. `src/core/` is pure — no Phaser, no DOM, no `Math.random()`.
2. Simulator and game run the **same** core module — never a parallel approximation.
3. Phaser is view-only — reads state, never mutates it.
4. The tick phase order in `tick.ts` is a determinism contract — changing it invalidates replays.
5. Resource mechanics are slopes, not cliffs.

---

Next: [Balance & Tuning](13-balance-and-tuning.md)
