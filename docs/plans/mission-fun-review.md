# Mission-by-mission fun review — enemy distribution & pacing

> Fable, 2026-07-11. Honest per-mission review of enemy distribution, asked by Tomáš
> ("I want the game to be fun"). Written as a self-contained hand-off doc for a Sonnet
> session to implement — every finding cites the exact data and gives a concrete fix +
> verification loop. Grounded in `v2/src/data/missions.ts` (current working tree, after
> today's tutorial trims), the enemy specs at the top of that file, GAME_DESIGN.md §13,
> and this session's measured sim numbers (cited inline; re-measure anything stale).
>
> **Standing constraints for the implementer:** blocker and tank counts-per-wave sit on
> known sharp difficulty cliffs (2→3 blockers ≈ 95%→42%; +1 tank across three waves ≈
> 87%→7%) — do not bump those counts anywhere. After every `missions.ts` change: the
> touched mission's §13 floor must hold (`pnpm sim --loadout intended --strategy greedy
> --runs 2000`), then a full `pnpm balance -- --runs 2000 --json` (0 flags) before done.

## The verdict in one paragraph

The campaign's skeleton is good — each mission has a distinct stated identity and the
escalation math works. The fun problems are concentrated in four places: **(1) the enemy
roster is distributed badly** — two of the eight enemy kinds (turret, kamikaze) exist
only inside m6's finale chaos where they can't register as distinct threats, while m4
mid-campaign actually has *fewer* enemy kinds (3) than m2 (4), and m4 structurally
clones m3; **(2) m1 opens the game with ~2.5 minutes of fourteen near-identical fodder
waves**; **(3) the final boss is an anticlimax by construction** — bumping into your
ship costs only 30 damage, so ~70% of winning runs never actually kill it; and **(4) the
time-star system is currently fake** — all four thresholds sit 1 second apart, and on
m5 a motor-1 player *physically cannot* earn any of them. Plus one regression from
today: t3 got slower, not faster.

## Per-mission scorecard

| Mission | Kinds used | Real duration (measured) | Verdict |
|---|---|---|---|
| t1 Shield Basics | guardian | ~30s | ✅ Good after today's trim |
| t2 Weapon Systems | fodder | ~16s | ✅ Good; borderline too short — playtest call |
| t3 Support Cards | guardian (+dead `fodder` decl) | **~66s — REGRESSED** (was 51s) | ❌ Fix (F5) |
| t4 Battle Supplies | fodder, striker | ~16s | ✅ Good; borderline too short — playtest call |
| m1 First Contact | 2 (fodder, striker) | ~182s | ⚠️ Monotone opening (F2) |
| m2 Picket Line | 4 | ~295s | ✅ Best-paced mission in the game — use as the template |
| m3 The Wall | 4 | ~330s | ✅ OK alone, but see F1 (m4 clones it) |
| m4 Blockade | **3** (fewer than m2!) | ~368s | ⚠️ Structure clone of m3, variety dip (F1) |
| m5 Asteroid Run | 4 | ~157s at intended (motor-2) | ✅ Composition good; time-stars broken (F4) |
| m6 Leviathan | 8 | ~320-370s | ⚠️ Boss anticlimax (F3); turret/kamikaze debut drowned (F1) |

m2 deserves a explicit callout as the *positive* model: alternating fodder/striker
rhythm, one blocker as a mid-mission speed bump, a genuinely new enemy (tank) as the
finale — identity, variety, and escalation all in one mission. The fixes below mostly
amount to "make the others more like m2 in shape, without copying its content."

---

## F1 (highest fun impact): redistribute the enemy roster — turret → m4, kamikaze → m5

**Problem.** Turret and kamikaze appear *only* in m6, buried in the densest part of the
campaign finale (turret at 70s/232s alongside swarms+strikers; kamikaze at 170s/236s
between blocker gates and tanks). A first-time player meets two brand-new enemy types
at the exact moment they have the least attention to spare — they read as noise, not as
threats with learnable identities. Meanwhile m4 has only fodder/striker/blocker (a
variety *regression* from m2/m3) and is structurally m3 again: same ~270s length, same
escalating fodder/striker body, same three-blocker-wave climax (m3: 2/3/3, m4: 4/4/4).
Two consecutive missions with the same shape and the same climax enemy is where a
player's mid-campaign attention will sag.

**Fix — two targeted insertions, no removals from m6** (m6 stays the "everything
together" exam; that's correct final-mission design):

1. **m4 gets the turret as its signature** ("Blockade" fiction fits perfectly — a
   static gun emplacement IS a blockade). Turret is `speed: 0, blocksConveyor: true`:
   it parks at max range and stalls the timeline until burned down — mechanically a
   *ranged* DPS check, distinct from the blocker's *approaching* DPS check, so it
   deepens m4's stated "DPS check" identity rather than diluting it. Insert 2 single
   turret spawns replacing/adjacent to the two mid-mission single-blocker events (the
   ~26s and ~64s `blocker count: 1` events are the natural slots — swap those to
   `turret count: 1` and keep every remaining blocker event untouched, since blocker
   counts are cliff-sensitive but blocker *presence* at 106s/150s/finale still gives
   m4 its blockade climax). Also update m4's `enemyKinds` to include `turret: TURRET`.
2. **m5 gets a kamikaze taste** ("Asteroid Run" fiction: fast rocks). Kamikaze is the
   sharpest enemy in the game (speed 2.8, collision 12×3 = 36 damage) — exactly the
   kind of threat a player should meet in a readable context once before m6 throws four
   at them mid-chaos. Insert two small waves (`count: 2, spacing: 10`) in the existing
   striker slots at ~142s and ~226s (replace those two `striker count: 3` events — m5
   keeps three other striker waves, so the striker mix survives). Update `enemyKinds`.

**Verification:** m4 floor ≥55%, m5 floor ≥50%, both <90%, at intended/greedy/2000;
full balance sweep 0 flags; `pnpm campaign -- --runs 500` still 100% both archetypes.
Turret swaps in m4 are replacing *harder* stalls (blocker 140hp vs turret 80hp, but
turret shoots 7.5dps from spawn vs blocker's 2.7dps while approaching) — expect a small
clear-rate move in either direction; iterate turret count/timing, never blocker counts.
Re-run `pnpm tune` afterward (mission composition changed → recommended kinds may shift).

## F2: m1's opening is a 2.5-minute screensaver

**Problem.** Fourteen consecutive fodder-only waves (3→8 count, 10s apart) before the
first striker at 148s. Under greedy autofire the median run finishes m1 with 100% hull
(this session's margin data) — meaning for the first ~2.5 minutes of the real game the
player makes no decisions and faces no visible threat evolution. First mission = first
impression; this is where "is this game fun?" gets decided.

**Fix (shape, not difficulty):** keep the total enemy budget roughly constant but break
the monotony: (a) insert a single striker "scout" event (`count: 1`) around ~50s — a
visibly faster, differently-colored enemy that previews the finale threat (m2 already
uses this introduce-early-then-escalate pattern with its blocker); (b) collapse the 14
fodder waves to ~10 by merging the flattest stretch (72s-112s currently repeats
count 6-7 five times) into fewer, more differentiated waves — alternate one dense-tight
wave (count 8, spacing 7) with one sparse-fast gap so the lane visibly breathes. Do NOT
raise total density materially — m1's floor is the tightest (≥85%, currently 89.6%),
so this is a reshuffle, not a buff. Iterate against the floor after each edit.

## F3: the final boss is an anticlimax — bumping beats shooting

**Problem (documented this session, still unfixed).** Boss collision costs
`shotDamage 10 × collision multiplier 3 = 30` damage — less than two kamikaze hits —
against an m6-intended ship with 110+ hull plus shield. So the dominant strategy
(~70% of greedy wins) is: ignore the boss, let the LEVIATHAN gently bump you, absorb
30 damage, mission complete. The campaign's climax is structurally optional.

**Fix, two options (implementer should sim both, pick by numbers):**
- **Option A (data-only, one number):** raise `BOSS.shotDamage` 10 → ~17-18. Collision
  becomes ~51-54 — combined with the pre-boss gauntlet's chip damage, bump-tanking at
  partial hull becomes a real defeat risk while a full-hull tank remains *possible*
  (still no hard cliff, per the slopes rule). Its per-shot pressure during the DPS race
  also rises, which is thematically right for a final boss that currently shoots softer
  per-hit than a turret crits. Watch m6's floor (≥45%, currently 88.4% — there is a LOT
  of headroom to spend on making the boss matter).
- **Option B (bigger, only if A under-delivers):** give the boss a stall-and-bombard
  phase — it advances to ~distance 30 and stops (`speed` staged via core change), never
  colliding: the player *must* out-DPS it. That's a core-engine change (enemy movement
  currently has no stop-at-distance concept) — real scope, new tests, tick-order care.
  Do not start with this; it needs its own plan if A proves insufficient.

**Acceptance target:** weapon-kill share of m6 victories ≥70% (from today's ~30%),
floor stays ≥45%, near-miss rate at m6 may rise (that's desirable tension, not a bug —
see GAME_DESIGN §13's margin metric). Boss time-star thresholds must be recalibrated
after (they anchor to the weapon-kill tick).

## F4: time-stars are currently fake — and on m5, unearnable

**Problem, two layers.** (1) Every m1-m5 time-star quartet is a synthetic 1-second
spread around a single deterministic value (m1: 189/188/187/186 — the code comments
admit this openly). From the player's side, four thresholds that differ by 1s are one
threshold wearing four costumes: you get all four or none, and nothing you do in-run
changes which. (2) Worse: thresholds were calibrated at each mission's *intended*
loadout, and m5's intended loadout includes motor level 2 (2× timeline). A motor-1
player's m5 physically runs ~290s+ real time against thresholds of 161-164s — **zero
time-stars are earnable at motor 1 on m5, by arithmetic, not skill**. Stars are the
hard currency gate (§2); locking some behind an unstated motor purchase is a hidden
trap, exactly the pattern this project keeps rooting out.

**Fix:** re-anchor each mission's four thresholds to *motor tiers*, which is the one
lever that genuinely changes completion time (the timeline is otherwise deterministic —
that's why the percentiles collapsed): T1 = comfortably achievable at motor-1 (measured
motor-1 duration + ~5s), T2 = tight motor-1, T3 = requires rush-2 pace, T4 = rush-3
pace. Measure each via `pnpm sim` with the intended loadout's motor swapped to each
level (loadoutPresets makes this trivial). This makes Rush's "time-star goldmine" shop
blurb *true*, gives time-stars a real meaning ("invest in speed, earn stars faster"),
and fixes the m5 impossibility as a side effect. Update the §13 time-star methodology
paragraph in GAME_DESIGN.md in the same pass — the percentile method is dead; this
replaces it.

## F5: t3 regressed today — 66s, slower than before its "trim"

**Problem.** Today's trim removed t3's fodder padding but kept two 80hp regen
guardians, each `blocksConveyor: true`. The kill math dominates: base DPS 20 vs
2.2/tick regen = the first guardian is unkillable until the +30% card arrives, then
dies at ~4 net DPS ≈ 20+ seconds of watching one HP bar — twice. 66s of mostly-waiting
versus the 51s it replaced. The lesson ("this enemy out-heals you; the right card
breaks it") lands completely on guardian #1; #2 is redundant confirmation.

**Fix:** one guardian, not two — the problem *and* the solution demonstrated on the
same enemy (watch it out-heal you for a few seconds, card arrives at ~5s, break it).
Drop `GUARDIAN_REGEN.hp` 80 → ~55 so the post-card kill takes ~10s instead of 20+.
Target: ≤35s total, clear-rate irrelevant now (completesOnDefeat). Also delete t3's
now-dead `fodder: FODDER` entry in `enemyKinds` — no event spawns fodder anymore.

## F6 (minor, flag-only): t2/t4 may now be one beat too short + stale §13 table

t2 and t4 both land at ~16s. That's aggressive-but-defensible ("show it once"); whether
the supply tutorial gives enough time to actually tap both supplies is a feel question
only Tomáš's thumbs can answer — playtest before adding anything back. Separately,
GAME_DESIGN §13's 1-hour breakdown table still claims m5≈10min/m6≈15min combat; reality
is m5≈2.6min (intended) and the whole campaign median is ~30min combat — update the
table to measured values while in the doc for F4's methodology edit.

## Suggested implementation order

F5 (5 min, pure win) → F1 (the real fun payload) → F2 → F3 option A → F4 (+ §13 doc
edits) → F6 flags. After all of it: full `pnpm balance` (0 flags), `pnpm campaign`
(100%/100%), `pnpm tune` re-run, `pnpm lint`/`build:dry`/`test`, and the plan-doc
checklist conventions from CLAUDE.md apply as always.
