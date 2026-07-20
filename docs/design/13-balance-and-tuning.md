← [Design docs index](../../GAME_DESIGN.md) · [← Architecture & Tooling](12-architecture-and-tooling.md)

# Balance & Tuning

## 1-hour campaign target

The full campaign — tutorials + all seven main missions (m3b added 2026-07-15, see
[Mission Progression](09-mission-progression.md)) — should take a **focused first-time
player roughly 60 minutes** including shop time between missions. Breakdown:

| Phase | Content | Combat time | Shop / planning |
|-------|---------|-------------|-----------------|
| Tutorials | t1 – t4 | ~4 × 45 s = 3 min | ~2 min (forced loadout; nothing to buy) |
| Early sector | m1, m2 | ~3 + 5 = 8 min | ~4 min |
| Mid sector | m3, m3b, m4 | ~5 + 4 + 6 = 15 min | ~8 min |
| Late sector | m5, m6 | ~10 + 15 = 25 min | ~8 min |
| **Total** | | **~51 min combat** | **~22 min** |

Target total: **≈ 60–75 min** (some players faster, some slower; the shop time budget absorbs
most variance). This table is a rough per-mission mental model, not the authoritative
number — `pnpm campaign`'s own measured combat-time-to-clear-m6 (median ~31-38 min across
both archetypes as of 2026-07-15) already accounts for real retry/purchase behavior and
supersedes it when the two disagree. If the simulator shows average mission times drifting
above these targets, compress the timeline multiplier; if below, expand it.

## Clear-rate targets per mission

These are the acceptance criteria for a balanced build. Run `pnpm sim --mission <id> --runs 2000`
with the intended loadout (see `v2/src/data/loadouts.ts` for reference loadouts):

| Mission | Intended loadout | Target clear rate |
|---------|-----------------|-------------------|
| t1 – t4 | Forced (built in) | See note below — "clear rate" is no longer quite the right frame |
| m1 | Pulse Laser Lv1, starter modules | ≥ 85% |
| m2 | Pulse Laser Lv1, Barricade or Reflex Shield | ≥ 75% |
| m3 | Pulse Laser Lv2, Generator Lv2 | ≥ 65% |
| m3b | Pulse Laser Lv2, Reflex Shield Lv2, Generator Lv2 | ≥ 60% |
| m4 | Any Lv2 weapon + Lv2 shield + Lv2 generator | ≥ 55% |
| m5 | Lv3 weapon + full Lv2 set | ≥ 50% |
| m6 | Lv4+ weapon + Lv3 shield + Lv3 generator | ≥ 45% |

A clear rate that is too **high** (> 90% except tutorials) means the mission is trivially easy
and should be made harder. Too **low** means the player will hit a wall — adjust enemy HP,
coin economy, or enemy count before touching loadout stats.

**t1/t4 note:** since `completesOnDefeat` (see [Mission Progression](09-mission-progression.md))
makes a t1/t4 defeat pay the same reward as a victory, "clear rate" no longer maps directly
to player-facing success the way it does for m1-m6. Measured numbers as of 2026-07-10: **greedy
strategy is a literal 100.0%** (0/2000 losses) on all four (t1-t4, as they were tuned then);
**random strategy plateaus at ~99.1-99.3%** on t4 specifically (t1-t3 are 100%), after two
independent fix attempts (a reactive supply-usage policy, an added support call) failed to
close the residual further. Whether that ~99% is acceptable, and whether it's still worth
chasing now that a t1/t4 "loss" is a valid completion anyway, is an open call — see
`docs/plans/tutorial-balance-and-doc-cleanup.md`.

**t3 note (2026-07-20):** no longer covered by the t1/t4 note above — retuned to have a
genuine right/wrong support-card decision with real consequence (`completesOnDefeat:
false`, see Mission Progression), so its clear rate is now a real, by-design cliff
rather than a uniform ~100%: sim-verified (2000 runs/pick) at 100.0% with the correct
card and ~0.0% with any other pick or a skip. `GUARDIAN_REGEN`'s stats (shotDamage 10,
2s cadence, regen 2.1/tick) were tuned specifically to produce that cliff — see the
inline comment in `missions.ts` for the exact derivation, and `docs/known-issues.md`'s
entry for the full before/after reasoning.

**t2 note (2026-07-20, superseded its own 2026-07-20 card-based retune the same day):**
converted from a scripted-card fix to a real-gear, fail-first-then-shop-fix design (see
Mission Progression's t2 section) — no longer comparable to the t1/t4 note above at all,
since it now runs on real gear with no forced loadout. Sim-verified (`runMission`, 2000
seeds/config, `STARTER_LOADOUT` vs. a scatter-1 weapon swap, no card offers involved):
pulse-1 (before the shop fix) clears 10.8% of attempts; scatter-1 (after — a free
same-level kind switch) clears 99.2%, avg hull 12.3% remaining on those wins. The wave
shape (2 fodder / 8 fodder / 8 fodder half a second later) was tuned specifically to
produce that cliff — splitting wave 2 into two sub-waves gave a meaningfully wider
margin than a single equal-sized wave (which clocked in at 5.1%/95.8%, avg hull only
8.2%) without softening the pulse-1 fail rate. See `docs/known-issues.md` for the full
tuning history and one known caveat: a player who buys a cheap rear weapon before ever
attempting t2 can clear the wall on pulse-1 alone, since the wave was tuned against
bare `STARTER_LOADOUT`, not "starter gear plus any cheap early purchase."

## Two-tier player model, not smart-vs-dumb

The campaign simulator (`pnpm campaign`) models two purchase archetypes, **expert** and
**average** — confirmed by Tomáš via `/grill-me` (2026-07-11) as explicitly **not** a
smart-vs-dumb split. Both are genuinely competent players; a deliberately bad archetype was
rejected as wasted effort, since "even if you try to make them smart, real people will
outsmart this." They differ only in *optimization depth*:

- **Expert** exploits the "100% sell-back, always" rule (see
  [Shop & Modules](05-shop-and-modules.md)) to its logical conclusion: before
  every mission, it rebuilds toward the mathematically best affordable build for that
  specific mission — the tuned kind per system (`pnpm tune`'s
  `RECOMMENDED_KIND_PER_MISSION`) at that mission's own intended level, full kind-switching,
  no attachment to what it already owns. It also fires side weapons on high-value targets
  only and uses supplies with judgment (shield-restore only when actually low, damage-boost
  only when a real wave is on screen).
- **Average** is equally sensible but commits to the free starter kind (Pulse Laser / Wall /
  Torrent / Rush) for weapon/shield/generator/motor for the *entire* campaign and never
  switches — a completely normal way to play, not a mistake. It still fires side weapons (a
  simpler "enemies on screen" trigger) and still uses supplies (the instant a charge is
  available), just without expert's precision.

**Measured result (2026-07-11, `pnpm campaign --runs 500`):** both complete 100% of campaigns
— average committing to the starter kind never risks getting stuck (a real risk that was
checked: committing to some *other* kinds, like Ion Lance, would leave a campaign stuck at
m5's swarm gauntlet under the patience cap — starter-kind commitment was chosen specifically
because it's safe). Expert measurably outperforms average at the one real test in the game,
the m6 finale (mean retries 1.89 vs. 2.87) — full kind-switching plus using every equipped
slot properly earns a real, measurable edge there. Through m1-m5, both stay close to
frictionless (median hull ≈100% at clear for both), matching the finding below.

## Balance workflow

1. **After any change to enemy stats, weapon stats, or economy:** run
   `pnpm sim --mission <affected> --runs 2000` and verify the clear rate stays within target.
2. **After adding a new module or card:** run a `--sweep` across all missions to catch
   knock-on effects from new power budget.
3. **Coin economy check:** the player should be able to afford the "intended loadout" for each
   mission by the time they first reach it, assuming they replayed the previous mission once
   after failing. If the economy makes that impossible, either lower prices or increase kill
   rewards before touching mission difficulty.
4. **Do not balance by feel alone.** The simulator is the truth — if it says 30% clear rate,
   the mission is too hard regardless of whether a skilled player can beat it.
5. **Isolated per-mission clear rates are not enough — also check the campaign-sim retry
   distribution and margin at clear.** Fable's design review found that meeting every
   mission's own clear-rate target still produced a flat-then-cliff experience:
   `pnpm campaign` showed both purchase archetypes clearing m1-m5 in essentially one
   attempt each (mean retries ≈1.00), with all real challenge concentrated at m6. m2-m5
   were retuned 2026-07-10 (harder striker/swarm waves — see `v2/src/data/missions.ts`'s
   wave-count comments) and the isolated clear-rate targets in the table above still hold,
   but the retune did not move the campaign-sim retry means at all (still ≈1.00 through
   m1-m5).

   **Investigated further and resolved as accepted design, 2026-07-11** (not a bug to keep
   chasing): retry count is a threshold metric — it reads ~1.00 until per-attempt clear
   probability drops below roughly 90%, then jumps, so it structurally cannot show a
   gradual ramp. `pnpm campaign` now also reports **margin at clear** (median hull% and
   near-miss rate, hull < 20%, per mission — see `tools/campaign-simulate.ts`). This
   independently confirms the same shape rather than revealing hidden gradual tension:
   median hull sits at **100%** through m1-m5 for both archetypes, with near-miss rates
   only appearing at m6 (9-12%) — a well-equipped player's shield genuinely never comes
   under real pressure before the finale, by hull margin as much as by retry count. A much
   larger, cliff-aware difficulty swing (see the two known count-based cliffs noted in
   `missions.ts`) or a structural change to gear accumulation (soft reset, difficulty
   scaled to actual gear) could still close this gap, but per the "never stuck," "no single
   best build" principles (see [Principles](03-principles.md)) a frictionless m1-m5 for a
   well-optimized player, with the campaign's one real test saved for its final boss, is
   being accepted as the current design rather than fought further — revisit only if
   hands-on playtesting says the mid-campaign genuinely feels tensionless in practice, not
   just on paper.

   **Re-confirmed 2026-07-11 with the real expert/average archetypes** (not the
   informed-saver/impulse-spender pair the original finding used — see "Two-tier player
   model" above): building genuinely competent purchase logic (tuned kind-switching,
   real side-weapon/supply usage) didn't change this shape either. `expert` improves
   meaningfully at m6 (mean retries 2.61→1.89) but m1-m5 stay just as frictionless as
   before for both tiers. This is now good evidence the flat shape is a property of the
   *missions and economy*, not of under-modeled purchase policies — reconciling the
   "never grinding, always progressing" identity line with the desire for a felt
   difficulty ramp: **a campaign that never forces a grind through its first five
   missions and saves its one real test for the finale is the identity as written, not
   a gap in it.** If playtesting says the mid-campaign should have more texture, the
   right lever is mission/economy design (a deliberate, scoped change), not tuning the
   simulator's players to be worse.

   **A scoped, deliberate mission-design change — exactly what this point called for —
   landed 2026-07-18 (E-3, `docs/plans/fable-review-fixes-2026-07-18.md`), ahead of the
   real playtest this point says should gate it, on Tomáš's own explicit "best effort
   now" instruction.** One new small enemy wave each on m2/m3/m4 (see `missions.ts`'s own
   `E-3 experiment` comments), sized via sim iteration to stay clear of each mission's
   clear-rate floor. Result: `average` archetype's m2 margin-at-clear moved from 100%
   median hull/0% near-miss to **59%/7.0%** — a real, measured tension moment where
   there was none — while `expert` stayed at 100%/0% on all three missions, unaffected.
   m3/m3b moved only slightly (m3's own insert was deliberately the smallest, given the
   thinnest floor headroom of the three). Full data and caveats — most importantly, that
   the sim structurally cannot verify the "a toggle is now required" half of the
   premise, only that clear-rate stays safe and the campaign-sim's margin metrics move —
   in `docs/known-issues.md`'s own entry for this. **Explicitly NOT settled design**:
   unvalidated by a real playthrough, provisional pending Tomáš's own hands-on read.

6. **Weapon×generator spread in `pnpm tune`'s report is expected — a same-system
   dominant-kind signal is the real concern.** `tune-report.md` ranks weapon and
   generator jointly (their energy/brownout interaction is real, per
   [Architecture & Tooling](12-architecture-and-tooling.md)), so a 60-100pp spread there is
   normal — it is not itself a "no dominant kind" violation the way a same-system spread
   would be.

   **The standing kind×mission sweep artifact this point used to say "was never built"
   now exists (2026-07-18, E-2 of `docs/plans/fable-review-fixes-2026-07-18.md`):**
   `pnpm tune` now writes a cross-mission summary table to `tune-report.md` (spread per
   system, one row per mission — scan a column instead of hunting through 7 separate
   per-mission sections) and exits non-zero when any system is flagged dominant on any
   mission, matching `pnpm balance`/`pnpm pacing`'s own CI-style convention. Building it
   surfaced a real, separate bug in the tool itself: `y2010` (the campaign-completion-
   gated Easter-egg weapon, `items.ts`) was included in the weapon tournament and won m3/
   m6 outright — a false "dominant kind" signal, since no real first-time player can
   equip it, and worse, it was silently feeding that recommendation into
   `RECOMMENDED_KIND_PER_MISSION`, which `tools/campaign-simulate.ts`'s `expert`
   archetype then treats as a realistic purchase. Fixed: `tune-loadouts.ts`'s weapon
   tournament now excludes `y2010` from contention (`REAL_WEAPON_KINDS`).

   **Fresh data (2026-07-18, y2010 excluded, 400 runs/candidate) supersedes the
   2026-07-11 framing this point previously stated:** the specific claim "pulse is the
   worst non-nova kind on m1/m2" no longer holds — pulse is now the *recommended
   (winning)* kind on both, at a non-dominant 27.0pp/20.3pp spread. This is consistent
   with, not contradicting, the nova-trap fix and the 2026-07-15 Reserve-generator fix
   (`docs/known-issues.md`'s Resolved section already recorded m1's dominant-kind flag
   clearing 87.0pp→27.0pp and m2's 60.25pp→21.0pp around that time) — the 2026-07-11
   finding was simply never re-checked against later fixes before now. The broader
   pattern is real and current, though: **5 of 7 missions still show a genuine
   same-system dominant kind** — m3 (ion, 99.5pp), m3b (nova, 100pp), m4 (ion, 62pp), m5
   (scatter, 100pp), m6 (ion, 99.8pp). This matches the already-accepted "kinds are
   situational sidegrades — each has a real home mission and a real weak mission"
   reading from the `expert`-archetype known-issues entry (2026-07-15), not a
   newly-discovered problem. **Decided 2026-07-19: left as-is** — rebalancing weapon
   kinds' per-mission matchups touches core damage numbers across all 7 missions and the
   game's stated design philosophy directly, a bigger call than this sweep's scope; see
   `docs/known-issues.md`'s Resolved entry for the reasoning.

## Time-star thresholds

Time-star thresholds (T1–T4 per mission) are set by the simulator: run 2000 clears and use
the **10th, 25th, 50th, and 75th percentile** completion times as T4–T1 respectively. This
ensures the fastest quarter of players earn all four time-stars on a good run, while the
median player earns T2/T3. Recalibrate whenever mission timeline changes.

## Daily Mission tuning (2026-07-17)

`pnpm sim -- --daily-seed <n> --runs <N> --strategy greedy --loadout <tier> [--max-ticks <n>]`
generates and runs the daily like any other mission — `--max-ticks` exists because a
well-tuned strong-gear run can legitimately approach `runMission`'s default 6000-tick (600s)
simulator safety cap, which is a tooling limit, not a live-game one.

**A real inversion was found and fixed before any numeric tuning.** The first version scaled
every enemy — including the plain flowing waves — by round index and scheduled everything via
motor-scaled `atTimelineTick`. Measured result: stronger loadouts (which bundle a faster
motor, e.g. `MOTOR_BASE.rush.mults = [1.0, 2.0, 3.0, 4.2, 5.8]`) blew through the schedule
faster in real time than their extra DPS could compensate for — survival time and coins earned
came out flat or *inverted* across gear tiers, directly violating "a stronger loadout earns a
real multiple more." Root cause: `timeline.ts`'s `advanceTimeline()` freezes the mission
timeline entirely while any `blocksConveyor` enemy is alive, regardless of motor speed — the
first version barely used that mechanic. Fix: moved the escalation wall onto a periodic
`blocksConveyor` "gate" enemy (`v2/src/data/dailyMission.ts`'s `GATE_*` constants) whose
real-time cost is `HP ÷ DPS`, motor-independent, and made gate kills the dominant coin source.
This is a structural fix, not a constants tweak — see the file's own "Gates, not a motor-timed
clock" doc comment.

**Measured after the fix** (raw run score, before `DAILY_COIN_MULT`; `tools/loadoutPresets.ts`
tiers):

| Loadout | Avg duration | Avg raw score |
|---------|-------------|---------------|
| starter (rush-1) | ~4.0 min | ~175 |
| mid (rush-2) | ~2.4 min | ~199 |
| full (rush-3) | ~3.7 min | ~842 |
| t3-reference (weapon4/shield3/gen5/motor2) | ~9.1 min | ~1993 |
| t4-reference (weapon5/shield4/gen5/motor3) | ~7.1 min | ~2903 |

Coins scale ~16.6× from starter to t4-reference — the "real multiple" requirement. Duration
isn't perfectly monotonic through the middle tiers (mid dips below both starter and full,
since `starterKindLoadoutAtLevel` couples motor speed to weapon/shield/generator level — a
motor-heavy, DPS-light loadout is genuinely worse at this mode, which is an acceptable, even
interesting, consequence rather than a bug), but recovers cleanly once weapon/shield/generator
catch up: the two well-rounded high-tier references land at 7-9 minutes, inside the confirmed
8-15 minute target for a strong build. Clear-rate is 0.0% at every tier, confirming the run
always ends in defeat as designed (never a premature victory). `DAILY_COIN_MULT` itself (4.0)
is documented in [Coins & Economy](10-economy.md).

Re-run this sweep after any change to `GATE_*`/`HP_GROWTH_PER_ROUND`/`roundPeriodTicks` in
`dailyMission.ts`, same convention as every other balance-affecting change in this file.

**Motor-only residual, confirmed 2026-07-18 (E-4, `docs/plans/fable-review-fixes-
2026-07-18.md`).** The table above uses `starterKindLoadoutAtLevel`'s coupled tiers,
where motor speed moves together with weapon/shield/generator level — line 234-237's
"mid dips below both starter and full... an acceptable, even interesting, consequence"
framing was based on that coupled view. A true motor-ONLY sweep (same weapon/shield/
generator, only motor level varied — proposed in `docs/known-issues.md` but not run
until now) tells a different, larger story: at a fixed pulse/wall/torrent Lv2 loadout,
500 runs/tier against a real daily seed, `rush-1` averaged 454.9 coins / 404.9s while
`rush-3` averaged only 232.5 coins / 101.3s — the slowest motor nets **~2× the fastest
motor's coins** at identical everything-else. Not the small, easily-dismissed residual
the "acceptable consequence" framing suggested.

**Fixed 2026-07-19.** Root cause: a faster motor's effective timeline speed compresses
the flowing-wave schedule between gates into less real time regardless of energy draw,
so "gates reached before death" — the actual score driver — falls monotonically with
motor tier. A prototyped fix (freeze motor draw during gate fights) was A/B-tested and
rejected: it barely helped the fastest motor while helping the slowest motor more,
widening the ratio in most tested card-policy configs (full numbers in
`docs/known-issues.md`'s Resolved entry). The shipped fix instead neutralizes motor
tier for the Daily entirely: `src/data/loadouts.ts`'s `neutralizeMotorForDaily()`
swaps in the loadout's own motor kind's Lv1 spec before every daily run (every kind's
Lv1 is identical — mult 1.0, draw 0.30), called from both `CombatScene.ts` and
`tools/simulate.ts`'s `--daily-seed` path. A same-loadout motor-only re-sweep after the
fix (pulse/wall/torrent Lv2, `rush` 1/2/3, 500 runs each) confirms all three motor
levels now produce identical results (231.0 avg coins, 283.3s avg survival), since they
resolve to the same neutralized spec. Motor investment is inert on the Daily rather
than actively counterproductive; the daily detail panel's UI copy says so explicitly.

---

Next: [Status — What's Built vs What's Planned](14-status.md)
