# Mission-by-mission fun review — enemy distribution & pacing

> Fable, 2026-07-11. Original review below (F1-F6) is preserved for findings still
> open. F1, F2, and F5 were implemented and verified 2026-07-15 — see each section's
> "Resolution" note. A companion tool, `pnpm pacing` (`docs/plans/simulator and
> pacing metrics work`, 2026-07-15), now measures several of these findings directly
> instead of requiring a human to read `missions.ts` prose — run it after any further
> mission change; it independently reproduced this doc's F2 and F3 findings almost
> exactly (monotony streak 14, boss weapon-kill-share 28% vs. this doc's ~30% estimate).

## The verdict in one paragraph

The campaign's skeleton is good — each mission has a distinct stated identity and the
escalation math works. The fun problems were concentrated in four places: **(1) the
enemy roster was distributed badly** — turret/kamikaze existed only inside m6's finale
— **fixed 2026-07-15 (F1)**; **(2) m1 opened with ~2.5 minutes of near-identical fodder
waves** — **fixed 2026-07-15 (F2)**; **(3) the final boss is now fixed** — the
data-only fix (Option A) didn't work, but Option B (stall-and-bombard) did — **fixed
2026-07-15 (F3)**; **(4) time-stars were fake** — **fixed 2026-07-15 (F4)** for all 7
main missions, including m6's separate `boss-time` stars (re-anchored after F3 landed).
Plus t3's guardian regression — **fixed 2026-07-15 (F5)**.

**New findings from `pnpm pacing`, not in the original review:** m3 and m4 both showed a
genuine sustained dead patch (longest idle stretch 20.0s, vs. m2's reference 14.0s) —
**root-caused and fixed 2026-07-15** (`docs/known-issues.md`): not inherent to
blocker-heavy pacing as first suspected, but a mechanical side effect of
`blocksConveyor` freezing the timeline for a blocker wave's entire lifetime, so the
nominal gap to the next wave replayed as pure dead time the instant it died. Fixed by
tightening the final-push blocker-wave gaps (m3 20s→15s, m4 20s→12s); both missions now
pass `pnpm pacing` clean. Also,
m1's shield-unbroken star had dropped to ~2.6% reachability (below the project's 5%
"unreachable" flag) as a side effect of F2's added density — **fixed 2026-07-15**, see
`docs/known-issues.md`: traced to the scout striker + two dense fodder waves right after
it (50-80s), loosened spacing there (counts unchanged, monotony fix intact), 2.6%→6.7%.
`pnpm balance` now exits clean with zero flags.

## Per-mission scorecard

| Mission | Kinds used | Verdict |
|---|---|---|
| t1-t4 | — | ✅ Unchanged this pass |
| m1 First Contact | fodder, striker | ✅ Fixed (F2) — see resolution below |
| m2 Picket Line | 4 | ✅ Still the best-paced mission — reference point for `pnpm pacing`'s thresholds |
| m3 The Wall | 4 | ✅ Idle-stretch flag fixed 2026-07-15 (see above) |
| m4 Blockade | 4 (was 3) | ✅ Turret added (F1); idle-stretch flag fixed 2026-07-15 (see above) |
| m5 Asteroid Run | 5 (was 4) | ✅ Kamikaze added (F1) |
| m6 Leviathan | 8 | ✅ Boss anticlimax fixed (F3) — stall-and-bombard mechanic |

---

## F1 — redistribute the enemy roster — turret → m4, kamikaze → m5

**Resolution (2026-07-15): done.** Turret swapped into m4's two single-blocker events
(seconds 26/64); kamikaze swapped into two of m5's five striker events (seconds
142/226). Verified via `pnpm sim`/`pnpm balance`/`pnpm campaign`/`pnpm pacing`.

One deviation from the original prescription, both due to real measured data: the
doc's suggested kamikaze `count: 2` measured at ~95% clear-rate (over the 90% "too
easy" ceiling) — 2 low-HP kamikaze is strictly less total threat than the 3 strikers
they replaced against a continuously-firing greedy player. Re-tuned to `count: 4` (82%
clear-rate, safely in-band). Turret's original `count: 1` needed no change.

---

## F2 — m1's opening is a 2.5-minute screensaver

**Resolution (2026-07-15): done.** Striker scout added at second 50; the flat
72-112s stretch (5 waves, count 6-7 each) collapsed to 3 (dense-tight/breather/
dense-tight). `pnpm pacing`'s longest-same-kind-streak metric confirms the shape fix:
14 → 7.

**Residual, not chased further:** 7 still exceeds `pnpm pacing`'s own MONOTONY
threshold (6, calibrated against m2's streak of 3). The straightforward version of this
fix (doc's exact suggested counts) measured 90.2% clear-rate — right on the 90% "too
easy" ceiling — and this region turned out to sit on a real difficulty cliff (dense-wave
count 9→10 alone swung clear-rate from 90% to 77.5%, under the ≥85% floor). Landed on a
combination that measures 87.6-88.1% (in-band) without fully clearing the monotony
flag. A second variety break in the second fodder stretch would likely clear it but
wasn't attempted — feels like a reasonable stopping point given the 50% streak
reduction already achieved and the floor's limited headroom.

---

## F3: the final boss is an anticlimax — bumping beats shooting

**Resolved 2026-07-15 — Option B (stall-and-bombard) implemented, see
`docs/known-issues.md` for the full writeup.** Boss weapon-kill-share of victories:
~30% → 100% (target was ≥70%), with m6's clear-rate (85.2%, within the 45-90% floor/
ceiling band) and the `average` archetype's 100% campaign completion both intact —
neither invariant broke this time. Original Option A investigation log kept below for
context (it's what proved a data-only fix couldn't work and pointed at Option B).

**Investigated and reverted 2026-07-15 — Option A confirmed insufficient, not
implemented.** Tried the doc's exact suggestion (`BOSS.shotDamage` 10 → 17): m6's
intended/greedy clear-rate collapsed from ~88% to 8.5%, blowing through the ≥45% floor —
the doc's own "floor stays ≥45%, there is a LOT of headroom" prediction did not hold
against real simulation. Bisected down to a floor-safe value (12, clear-rate 58.8%) but
that broke a harder invariant: `pnpm campaign`'s `average` archetype (the
starter-kind-committed build GAME_DESIGN §13 calls "safe by design") dropped from 100%
to 93.4% campaign completion — 33/500 runs got stuck at m6's patience cap, a real
"player can get stuck" regression per §3's own philosophy.

Worse, at the floor-safe value, boss weapon-kill-share of victories was **unchanged**
(28%, identical to the original shotDamage). This is the real finding: shotDamage only
makes collision-tanking *costlier*, it never changes *which* death mechanism actually
kills the boss — that's governed by weapon DPS vs. boss HP vs. approach time, a
relationship shotDamage doesn't touch at all. **Reverted to the original value (10).**

**Conclusion, higher-confidence than the original review:** Option A cannot hit the
≥70% weapon-kill-share target at any value that doesn't also break an existing safety
invariant. Option B (the doc's own fallback — a stall-and-bombard boss phase, `speed`
staged via a core change so the boss cannot simply walk into the player) is the only
path that can actually work, exactly as the doc anticipated ("only if A under-delivers,
it needs its own plan"). That's real scope — new core mechanic, new tests, tick-order
care — and stays explicitly out of scope here.

---

## F4: time-stars are currently fake — and on m5, unearnable

**Resolved 2026-07-15 — see `docs/known-issues.md` for the full writeup.** m1-m5/m3b's
`finish-time` stars were re-anchored first; m6's `boss-time` stars (a different metric —
when the boss dies by weapon fire, not overall duration) were re-anchored separately
once F3 landed and changed the underlying weapon-kill-share dynamic they depend on.
Original investigation log below, kept for context.
Attempted the doc's proposed fix (re-anchor T1-T4 to motor tiers: T1/T2 at motor-1,
T3 at motor-2 pace, T4 at motor-3 pace, everything else held at the mission's own
intended loadout). Measured directly: **motor level 2 and 3, with every other system
left at its own intended level, make most missions completely unwinnable** — 0 victories
in 1000 runs each for m1/m2/m3 at motor-2, and m1-m5 at motor-3. Motor level scales both
timeline speed *and* energy draw, so swapping only the motor field isn't "the same
mission, faster" — it's a different, much harder power-budget problem the rest of the
intended loadout was never sized for.

This means the "T3 = motor-2 pace" framing needs a real design decision before it can be
implemented: does a higher-tier time-star also assume a correspondingly upgraded
generator (and if so, which one, and does that then need re-verifying against the
clear-rate floor too)? Or should the reference loadout for time-star measurement be
something else entirely? Left open pending that decision — the original F4 problem
(synthetic ±1s thresholds, m5 unearnable at motor-1) is unchanged and still real.

**Decision (Tomáš, 2026-07-15):** motor *and* a correspondingly upgraded generator —
pair the faster motor with the generator upgrade a real player would realistically fund
alongside it, not the mission's own `intended` generator level held flat while only the
motor climbs. Still needs: the actual per-tier generator level/kind pairing chosen,
percentile data re-measured at each paired loadout, and re-verification against the
clear-rate floor. Not yet implemented — see `docs/known-issues.md`.

---

## F5: t3 regressed today — 66s, slower than before its "trim"

**Resolution (2026-07-15): done.** Dropped to one guardian (was two);
`GUARDIAN_REGEN.hp` 80 → 55; removed the dead `fodder` entry from t3's `enemyKinds`
(no event ever spawned it).

---

## F6 (minor, flag-only): t2/t4 may now be one beat too short + stale §13 table

**Still open — unchanged, playtest call only.** t2 and t4 both land at ~16s — whether
the supply tutorial gives enough time to actually tap both supplies is a feel question
only Tomáš's thumbs can answer. GAME_DESIGN §13's 1-hour breakdown table still claims
m5≈10min/m6≈15min combat against a measured reality closer to m5≈2.6min/whole-campaign
median ≈30min combat — worth a table update whenever someone is next in that section of
the doc, not urgent enough to justify a dedicated pass on its own.
