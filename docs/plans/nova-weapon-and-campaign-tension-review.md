# Nova weapon underperformance + campaign-sim retry-tension — review doc

> Not an implementation plan yet. Two open investigations spun off from the 2026-07-10
> design-review follow-up (`docs/plans/game-identity-and-design-review-followup.md`),
> written up here for Fable to critique before any code changes are made. Tomáš will play
> the actual game and give his own read tomorrow; this doc + Fable's review are prep for
> that conversation, not a decision record.

---

## 1. Nova weapon is dead weight despite being priced as a sidegrade

**Context:** the 2026-07-10 repricing pass made all 4 weapon kinds (pulse/scatter/ion/nova)
share one identical price/star ladder (`WEAPON_STARS_BY_LEVEL`/`WEAPON_PRICES_BY_LEVEL` in
`v2/src/data/items.ts`) instead of nova costing ~15× more than pulse for the same level. The
intent (GAME_DESIGN.md §3/§5): every kind should be a viable, situational sidegrade — no kind
universally best, no kind a trap.

**What a quick sim comparison found:** equipping level-3 weapons of each kind
(`tools/loadoutPresets.ts`'s `weaponAtKindIndex`, kind index 3 = nova) against m3/m4/m5
(`v2/src/data/missions.ts`):

| Mission | Character | ion (single-target) | scatter (pierce) | nova (hits everyone) |
|---------|-----------|---------------------|-------------------|----------------------|
| m3 | blocker-heavy | ~100% clear | — | **0% clear** |
| m4 | blocker-heavy | ~100% clear | — | **0% clear** |
| m5 | swarm-heavy | — | ~100% clear | **~10% clear** |

Nova's own flavor text is "Hits every enemy. Swarm destroyer." — it should be *scatter's*
competitor on m5, not strictly worse than it. Instead scatter wins the swarm matchup nova is
supposedly built for, and nova is unplayable on the blocker-heavy missions too.

**Base stats** (`WEAPON_BASE.nova` in `items.ts`): `damage: 3, ticks: 9, energy: 16,
targets: Infinity, falloff: 1.0`. Compare pulse: `damage: 10, ticks: 5, energy: 6, targets: 1`.
Nova pays ~2.7× pulse's energy per shot, fires ~1.8× slower, for ~3.3× less damage per hit —
before even asking whether it hits N enemies for N× value or is throttled below that.

**Hypotheses, not yet distinguished:**
1. **Energy cost triggers brownout and craters nova's real fire rate.** `v2/src/core/energy.ts`
   stretches the fire interval below 30% energy capacity (up to 2×, per the "slopes not cliffs"
   constitutional rule in `v2/CLAUDE.md`). At `energy: 16`/shot on `ticksBetweenShots: 9`, nova
   may be structurally unable to sustain fire without living permanently in brownout, on top of
   its already-slow base cadence — compounding rather than just adding to the damage shortfall.
2. **Base damage-per-shot is simply too low for the "hits everyone" tradeoff to pay off**, even
   at full, un-throttled fire rate — i.e. even ignoring energy/brownout entirely, `damage: 3 ×
   Infinity targets` may not beat a focused pulse/ion build against typical wave compositions in
   these missions (enemy counts per wave, HP per enemy — needs checking against
   `missions.ts`'s actual wave shapes, not assumed).
3. **Some mix of both**, at different weights — this needs isolating, not guessing. Suggested
   diagnostic: run nova at its current energy cost vs. a hypothetical near-zero energy cost
   (or with brownout disabled) and see how much of the clear-rate gap closes from that alone,
   before touching base damage.

**Not yet done:** actually running `pnpm sim` with the nova-3 loadout against m3/m4/m5 to
confirm the 0%/0%/~10% figures precisely (the numbers above are from a "quick sim comparison,"
not a full 2000-run pass), and inspecting energy-tick logs / brownout-active fraction during a
nova run to settle hypothesis 1 vs. 2 before changing any numbers.

**Constraint on any fix:** GAME_DESIGN.md §13's per-mission clear-rate floors are calibrated
against **pulse** (the intended-loadout weapon for every mission in
`tools/loadoutPresets.ts`'s `intendedLoadoutForMission`), not nova. A nova buff should not move
`pnpm balance`'s existing intended-loadout numbers for m1-m6 at all — if it does, something
about the fix leaked into pulse's own math or a shared constant, and that's a bug in the fix,
not an acceptable side effect.

---

## 2. Campaign-sim retry distribution stays flat despite a real per-mission difficulty retune

**Context:** decision 2 of the same design-review follow-up ("build tension gradually") called
for m2-m5 to retune so campaign-sim retries climb gradually into m6, not stay flat until a
sudden wall. m2-m5 were retuned via striker/swarm wave-count bumps (the safe lever — see the
cliff note below) and **isolated** per-mission clear rates (checked via `pnpm sim --loadout
intended`, i.e. GAME_DESIGN.md §13's declining floor) moved as intended:

| Mission | Before | After | Floor | Status |
|---------|--------|-------|-------|--------|
| m2 | 87.3% | 81.8% | ≥75% | ✓ still passing |
| m3 | 77.8% | 68.7% | ≥65% | ✓ still passing |
| m4 | 81.6% | 79.2% | ≥55% | ✓ still passing |
| m5 | 89.0% | 87.5% | ≥50% | ✓ still passing |

0 `pnpm balance` flags throughout.

**But** re-running the full campaign simulator (`pnpm campaign`, `v2/tools/campaign-
simulate.ts`) after this retune shows almost no change to the actual retry distribution: both
purchase archetypes (`informed-saver`, `impulse-spender`) still clear m1-m5 in essentially one
attempt each (mean ≈1.00 retries per mission), with real challenge still concentrated entirely
at m6 (mean 2.65-3.17 retries depending on archetype). The retune measurably worked on the
metric it was checked against and did nothing to the metric that actually matters for how the
game *feels* to play through.

**Likely mechanism:** a well-optimized player's gear accumulates monotonically across a
campaign — nothing is ever spent down or lost, coins/stars only go up, and the shop's 100%
sell-back rule means there's no cost to being maximally efficient. So by the time a simulated
(or real, disciplined) player reaches mission N, they're typically well ahead of that mission's
own "intended loadout" baseline — the exact baseline GAME_DESIGN's floor is calibrated against.
The retune's isolated difficulty increase gets absorbed by that pre-existing margin before it
ever shows up as a real retry.

**Known hazard for any next attempt:** this session found **two** independent sharp,
non-linear difficulty cliffs while tuning m1-m6 — blocker count-per-wave (~95-99% clear at
2/wave vs. ~42% at 3/wave) and tank count-per-wave (bumping all 3 of m2's tank-finale waves by
+1 each collapsed clear rate 87.3%→7.3%). Both were found by accident while trying a "reasonable-
looking" bump and had to be reverted in favor of striker/swarm-count bumps instead (the lever
that's actually behaved gradually so far). **Any larger difficulty push needs to re-test after
every single lever change, not just at the end** — these cliffs don't announce themselves in
advance, and a push big enough to register in the campaign sim's retry distribution is, by
definition, a bigger push than what's been tried so far.

**Three options on the table, not yet weighed against each other:**

**(a) Redefine what "gradual tension" is measured against.** Accept that a genuinely
well-optimized player (the `informed-saver` archetype, or a real player who never wastes a
coin) will naturally face less resistance than the isolated per-mission floor implies, and stop
trying to make the campaign sim's retry distribution ramp for that archetype specifically. Tune
only for the isolated per-mission floor going forward; treat "flat until m6" as an acceptable,
even correct, outcome for a player who is playing optimally. Risk: this may just be relabeling
the problem rather than solving it — if the *design intent* really was "tension should build,"
this option quietly abandons that intent rather than achieving it.

**(b) Much larger, cliff-aware difficulty increases.** Push m2-m5 harder than this pass did,
carefully, one lever and one mission at a time, re-running `pnpm balance` after every single
change (not batched) specifically because of the two known cliffs above. Unknown: how much
harder is "enough" to register in the campaign sim without also making the isolated
intended-loadout clear rate fall below GAME_DESIGN's own floor for a less-optimized or
freshly-arrived player — these two constraints may not have a compatible solution within the
current floor table at all, in which case the floor table itself may need to be the thing that
changes (which is a GAME_DESIGN.md decision, not just a data tweak).

**(c) Change the campaign simulator's purchase policy instead of the missions.**
`informed-saver`'s logic in `campaign-simulate.ts` could be changed to track closer to "buy
just enough to barely clear the upcoming mission's intended target" rather than accumulating
ahead of it via a broader purchase policy. This leaves every mission's own data untouched and
instead makes the *simulated player* less over-prepared, which may make the retry distribution
look different without touching a single balance number. Open question: is this actually
representative of how a real optimizing player behaves (they don't usually "just barely" gear
up on purpose), or would this just be tuning the tool to produce the answer we want rather than
modeling reality? Also doesn't help if the target audience for "gradual tension" already
includes `impulse-spender`, which showed the same flat pattern despite a much less
optimization-driven purchase policy.

**Not yet done:** picking between (a)/(b)/(c), or some combination; running any of them against
`pnpm balance -- --runs 2000 --json` (must stay 0 flags) and `pnpm campaign -- --runs 500`
(check whether the retry distribution actually shows a gradual ramp, not just whether the
isolated clear rate looks different) to verify; then `pnpm lint` / `pnpm build:dry` / `pnpm
test`.

---

## Ask for Fable

Read this doc plus the referenced files (`v2/src/data/items.ts`, `v2/src/core/energy.ts`,
`v2/src/data/missions.ts`, `v2/tools/campaign-simulate.ts`, `GAME_DESIGN.md` — especially §3,
§5, §13) and critique the framing above. Specifically:

- For nova: is there a angle on "why it's dead weight" we haven't considered — e.g. something
  about how `falloff`/`maxTargets`/`Infinity` targets actually resolves in `combat.ts` that
  changes the math, or a wave-composition reason nova should just accept being weaker on these
  particular missions rather than being fixed at all?
- For the campaign-tension problem: is there a fourth option we're missing? Is one of (a)/(b)/(c)
  clearly better once you've read the actual code, or clearly a dead end?
- Anything in either section that reads like it's solving the wrong problem, or missing a
  design-philosophy consideration from GAME_DESIGN.md (§3's "no single best build" /
  "allocate don't accumulate" / "slopes not cliffs" principles) that should constrain the
  eventual fix.

Append findings as a new "## Fable's review" section at the end of this document rather than
editing the sections above — Tomáš wants to see the original framing and the critique
side-by-side tomorrow, not one merged into the other.

---

## Fable's review (2026-07-11)

I read every referenced file and re-ran the numbers rather than trusting the tables above.
Verification setup: scratch scripts (300 seeds/cell, greedy card picks — same policy the §13
floors use) that take `intendedLoadoutForMission(m)` and swap only the weapon (and, where
noted, the generator); plus a fresh full `pnpm campaign` (500 campaigns/archetype). Nothing in
`v2/src/` was modified.

### Nova

**The doc's numbers reproduce — and undersell the problem.** My grid (level-3 kinds on the
intended base loadout): m3 = pulse 98.7 / scatter 100 / ion 100 / **nova 0.0**; m4 = 99.7 /
100 / 100 / **0.0**; m5 = 90.0 / 100 / 0.7 / **12.3**. But the doc frames this as an
m3/m4/m5 problem. It isn't: **nova-1 clears 0.0% of m1 and 0.0% of m2** (level-1 kinds on
those missions' intended bases; ion and scatter sit at ~100% there). A 100-coin nova-1 —
same price and star cost as pulse-1 — cannot clear the *first mission in the game*. Under
§3's "no kind is ever a strictly worse purchase," that's not an underperforming sidegrade,
it's a trap purchase at the front door. The only mission where nova functions at all is m6
(nova-4 = 59%, above the 45% floor, though still worst-of-four). Any fix framing should start
from "unplayable everywhere until the finale," not "weak on three mid missions."

**Hypothesis 1 vs 2 is now settled — I ran the doc's own suggested diagnostic** (nova-3 with
`energyPerShot` forced to 0, isolating energy/brownout from base damage):

| Mission | nova-3 (real) | nova-3 free-energy | Verdict |
|---------|---------------|--------------------|---------|
| m3 | 0.0% | 0.3% | energy explains ~nothing — base damage vs 140-HP blockers is the wall |
| m4 | 0.0% | 19.7% | mix, still mostly damage |
| m5 | 12.3% | **97.7%** | almost entirely energy/brownout — damage is fine vs swarm |

So it's "some mix of both" only in the least useful sense: the weights are extreme *and
opposite* per mission. The swarm-mission gap (the one that actually contradicts nova's
flavor text) is an energy-economy problem and can be fixed without touching damage. The
blocker-mission gap is pure damage-vs-HP and arguably shouldn't be fixed at all — see the
ion precedent below.

**combat.ts resolves Infinity/falloff correctly — no hidden bug, but two structural
mechanics the doc missed:**

1. *Trough-sampled brownout.* `fireShipWeapon` computes the brownout stretch **immediately
   after subtracting the shot's energy cost** (combat.ts, the `stretch` line before
   `fireTimer +=`). The next interval is locked in at the energy *trough*, even though energy
   recovers over the following ticks. For pulse (7.9 cost vs 45 capacity) this is negligible;
   for nova-3 (21.2 cost — 47% of torrent-2's whole buffer) it's decisive. Worse, the shield
   pulse drain is capacity-proportional (`pulseDrainFraction × capacity` = 24.75 on
   torrent-2), so one pulse + one nova shot exceeds the entire buffer: nova lives at max
   stretch (2×) *even when average generator output covers its average cost*. The
   slopes-not-cliffs rule was designed for smooth-drip costs; trough sampling quietly turns
   it back into a de-facto cliff for chunky-cost weapons. Caution: re-sampling brownout
   against average-over-interval energy is a **shared-mechanic change** — it would move
   pulse's and ion's floors and (per constitutional rule 4) invalidate replays. That's
   exactly the leak the doc's own constraint paragraph warns about, so the safer levers are
   nova-local (its energy cost, or its cost-to-capacity story).
2. *Simultaneous-death exposure.* Nova deals equal, falloff-free damage to every enemy — so
   against a uniform wave, everything dies **at the same time, at the end**. Time-integrated
   incoming fire is roughly N×T instead of a focused weapon's N×T/2, and the front-most enemy
   (the collision threat, ×3 damage) receives only 4.5 of nova-3's damage where pulse lands
   14.9. "Hits N enemies for N× value" is structurally worth much less than N×; the doc's
   per-shot arithmetic understates the deficit. At level 3, nova needs ~10+ enemies alive
   *simultaneously* just to match scatter's damage-per-energy — lane occupancy that high
   usually means the run is already lost. One breakpoint detail worth writing down: nova
   never one-shots the 8-HP swarm at **any** level (3 → 6.7 damage across lv1–5). A "swarm
   destroyer" that always two-taps the smallest swarm unit is losing to HP breakpoints, not
   just to DPS ratios.

**The test methodology biased against nova, and the doc should say so.** Swapping only the
weapon on the intended loadout means every kind is tested on **torrent** — the small-buffer
generator that maximizes nova's trough-brownout. Pairing nova-3 with surge-2 (whose items.ts
blurb literally says "ion and nova goldmine") lifts m5 from 12.3% to **66.3%**. That's §3's
"allocate, don't accumulate" working as designed — nova is *supposed* to demand a generator
decision. Two caveats: reserve-2 (the "vast tank") scores **0.0%** — its trickle output can't
feed nova at all, so the viable pairing is exactly one generator kind, which is thin; and
66% still loses outright to scatter-on-anything (100%). So pairing narrows the gap but can't
close it. Any follow-up sim table should include a nova+surge row or it will overstate the
needed buff.

**The ion precedent reframes m3/m4.** Ion is ~100% on m3/m4/m6 and **0.7% on m5** — a
counter-matchup collapse just as total as nova's on m3/m4, and nobody calls ion dead weight.
Under "situational sidegrades," a kind being unplayable into its counter-composition is
apparently accepted design. Nova's real anomaly is exactly **one cell**: losing its own
specialty matchup (m5) to scatter 12-vs-100. The doc's framing ("dead weight on all three")
invites over-buffing; the defensible target is "nova competitive with scatter on
swarm-heavy missions, still bad into blockers," which per the free-energy result is
reachable through energy cost alone.

**The design-level question the doc never asks: what is nova for?** GAME_DESIGN §5 defines
the front-weapon slot as "single-target, high damage… the primary DPS tool," and assigns
lane-wide AoE to the rear weapon (flak/cluster) and the side weapon (orbital strike). Nova
contradicts its own slot's stated role and competes with two *other slots'* identities.
Before any stat change, decide what nova offers that flak + orbital doesn't. One candidate
answer already latent in the code: cards like `energyPerHit` refund energy *per enemy hit*
(combat.ts multiplies by `hitCount`) — nova is the designed payoff for that whole synergy
family, but it's currently too weak to ever reach the point where the synergy matters. A
nova identity built on "hits-everything engine for per-hit synergies" is a different (and
cheaper) fix than raw damage.

### Campaign tension

**The doc's "likely mechanism" paragraph is subtly wrong, and the error matters.** Reading
`campaign-simulate.ts`: informed-saver **cannot over-gear the four core systems** —
`buildTargetedCandidates` stops exactly at the mission's intended item, by construction. Yet
informed-saver is the perfectly-flat archetype (fresh 500-run pass: mean 1.00 for every one
of m1–m5, m6 = 2.61). So the margin is *not* "gear accumulates past the intended baseline"
in the core systems. It comes from the five systems `intendedLoadoutForMission` **omits
entirely**: the floor calibration runs with `rearWeapon: null`, `sideWeapon: null`,
`supplies: []`, the default ship, and sub-basic cards, while both archetypes (and every real
player) fill those slots — a rear weapon costs **30 coins**. The floor metric and the
campaign metric aren't measuring the same player at different gear levels; they're measuring
a player missing three whole equipment slots vs. one who has them. Of course a retune
calibrated on the former is absorbed by the latter. Cheap diagnostic to confirm the weight of
this: rerun the campaign sim with the opportunistic-slot purchases disabled and see how much
retry signal appears — I'd bet the 30-coin grenade launcher alone carries a large share of
the flatness.

**Fourth option (and I think the right one): recalibrate the baseline, then retune.** Update
§13's intended loadouts to include what a real player actually has on arrival — rear/side
weapon at plausible levels, ship, supplies, subscription tier; the campaign sim's own median
gear-at-arrival is the natural data source. Then option (b) becomes tractable, because right
now (b) is **near-mathematically dead** inside the current floor table: retries-among-cleared
is ≈ 1/p, so a gradual ramp to m6's ~2.6 wants m5 around mean 1.7 → p ≈ 0.59 for the
*slot-filled* player, who currently clears at ~99%+. A difficulty swing that big drops the
strictly-weaker slot-empty intended loadout at or below its own 50% floor — the two
constraints can't both hold while the baselines differ by whole slots. The doc suspects
"may not have a compatible solution"; the code makes it concrete. Also worth noting: §13's
own open-issue note *already lists* two further options the doc's (a)/(b)/(c) menu dropped —
a soft gear reset, and scaling difficulty to actual gear. The review doc under-reads the
document it cites.

**(c) is a dead end — confirmed, not just suspected.** informed-saver already buys "just
enough" for the core four by definition; making it buy less means modeling a player who
deliberately ignores shop tabs, and impulse-spender — which has no target at all — shows the
same flat m1–m3/m5 pattern anyway. It would be tuning the instrument to draw the desired
chart. Drop it.

**(a) is stronger than the doc's "just relabeling" framing — if the metric is replaced, not
abandoned.** Two observations from the fresh run: (1) retries are a *threshold* metric — they
read 1.00 until per-attempt clear drops below ~90%, then move fast; they cannot show a
gradual ramp by their nature. (2) They're already non-monotonic where they do move:
impulse-spender shows m4 mean = **1.47**, then m5 back to **1.00** (so the doc's "both
archetypes ≈1.00 through m1-m5" is stale for m4 — and the bump sits on m4's quad-blocker
finale, i.e. the known cliff lever, not on any floor-table gradient). A better tension metric
for this game is *margin*, not failure: median hull fraction at clear, near-miss rate
(hull < 20%), star-earn rate per mission — all cheap to add to the campaign sim's existing
trajectory tracking. Crucially, GAME_DESIGN §1/§3 ("never grinding, always progressing,"
"the player is never stuck") actively argue against making forced retries the tension
currency for m1–m5. A campaign where hull margins visibly shrink toward m6 while retries
stay near 1 until the finale is arguably the *designed* experience, and it's measurable.
So my recommendation is (a)-with-margin-metrics first; if Tomáš's hands-on play tomorrow
says the mid-campaign genuinely feels tensionless, then the fourth option (rebaseline §13,
then cliff-aware retune) — never (c).

### Broader gaps

1. **"No single best build" is being audited one-sided.** The doc hunts for the worst kind
   but never checks for a silently-best one. My grid says ion is ≥ every other kind on
   every tested mission except m5 (where it collapses), and pulse — the calibration anchor —
   is the *worst* non-nova kind on m1/m2 (88/77% vs ion's 100/100). The spread between kinds
   at identical price is already enormous; nova is just the only one outside any defensible
   band. Suggestion: make a kind×mission clear-rate matrix a standing `balance-sweep`
   artifact, so "no universal best, no trap" becomes a tested invariant rather than a hope.
   Nova's 0% would have been caught at m1, not m3.
2. **Slopes-not-cliffs needs a per-mechanic audit, not just per-resource.** The brownout
   *rule* is a slope; brownout *sampled at the post-shot trough, compounded with
   capacity-proportional shield-pulse drains*, is a cliff for any weapon whose per-shot cost
   is a large capacity fraction. That interaction is invisible in the constants and only
   shows up in the composition — same genus as the blocker/tank count cliffs section 2
   already documents. Worth a one-line comment in combat.ts either way the decision goes.
3. **Both sections stop one question short of the design layer.** Section 1 asks "how do we
   buff nova" before asking "what is nova's role, given the rear and side weapon slots own
   AoE"; section 2 asks "how do we make retries ramp" before asking "is retry count even the
   right tension proxy for a game whose identity forbids being stuck." GAME_DESIGN.md is the
   single source of truth — both answers belong there first, and both fixes get smaller and
   safer once they're written down.

**Verification appendix:** scratch scripts live at
`/private/tmp/claude-501/.../scratchpad/nova-check.ts` and `m6-kinds.ts` (session-temporary);
full kind×mission grid at 300 seeds/cell, campaign numbers from `pnpm campaign` (500/archetype,
default seed) on 2026-07-11. n=300 cells carry roughly ±3pp noise — irrelevant at the 0%-vs-100%
scale of every finding above.

## Resolution (2026-07-11)

Tomáš reviewed this doc plus Fable's critique and picked, via two quick decisions:
nova gets an energy fix *and* a low-level damage bump (not energy-only, not a full
identity redesign), and the campaign-tension question gets resolved by redefining the
metric plus adding real instrumentation (not a rebaseline, not left alone).

**Nova — fixed.** A finer sim sweep (own scratch script, replicating
`weaponSpecAtLevel`'s formula, at each mission's real intended weapon level) confirmed
Fable's energy diagnosis for m5/m6 but also found energy alone does **not** fix m1/m2 —
even energy=0 left them at 0%, since nova-1's raw damage (3/hit) is too low to matter
against even 2-4 fodder regardless of energy. Landed on `WEAPON_BASE.nova`: damage
3→5, ticks 9→7, energy 16→6 (see `v2/src/data/items.ts`'s updated comment). Result grid
(own level, intended base loadout, 800 seeds/mission):

| | m1 | m2 | m3 | m4 | m5 | m6 |
|---|---|---|---|---|---|---|
| before | 0.0% | 0.0% | 0.0% | 0.0% | 17.4% | 60.0% |
| after | 100.0% | 69.8% | 22.0% | 70.5% | 100.0% | 95.6% |

m3 (the hardest pure-blocker mission) is left deliberately weak, mirroring ion's own
accepted collapse on m5 — a real, isolated weakness rather than "unplayable everywhere."
`pnpm balance -- --runs 2000 --json` re-run clean afterward: pulse's own intended-loadout
numbers for m1-m6 are byte-identical to before (89.6/79.6/70.2/83.9/89.9/88.4%, 0 flags),
confirming the fix never leaked outside nova's own base constants. `pnpm lint` /
`pnpm build:dry` / `pnpm test` (497 passing) all clean.

**Campaign tension — instrumented, not "solved."** Added a sixth report metric to
`pnpm campaign` (`tools/campaign-simulate.ts`): median hull fraction at clear + near-miss
rate (hull < 20%) per mission, per archetype — cheap to compute since `MissionResult`
already tracks `hullFraction`, just wasn't kept per-mission before. Result: margin
**confirms** the flat-then-cliff shape rather than revealing a hidden gradual ramp —
median hull sits at 100% through m1-m5 for both archetypes, with near-miss rates only
appearing at m6 (9-12%). This is stronger evidence than retry count alone that a
well-equipped player's shield genuinely never comes under real pressure before the
finale. Per Fable's recommendation and GAME_DESIGN §1/§3's own philosophy ("never
stuck," "no single best build"), this is now documented in GAME_DESIGN.md §13 point 5
as the accepted current design shape — not an open bug — with an explicit note that a
bigger cliff-aware retune or a gear-accumulation structural change could still close it
later, revisit only if hands-on play says the mid-campaign genuinely feels tensionless.

All four CI gates green: `pnpm lint`, `pnpm build:dry`, `pnpm test` (497 passing),
`pnpm dlx fallow` (0 above threshold), `pnpm balance -- --runs 2000 --json` (0 flags),
`pnpm campaign -- --runs 500` (both archetypes 100% completion, new margin metric
verified rendering correctly).
