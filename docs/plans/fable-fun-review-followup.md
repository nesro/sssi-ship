# Fun-review follow-up — addressing the 2026-07-15 Fable design review

> Written after a full interview with Tomáš (2026-07-15) resolving every open design
> question the review raised. A second Fable pass then reviewed this plan itself (not the
> docs) and found three items where a "confirmed decision" was actually a confirmed
> *direction* with the real decision still inside it — those are resolved below too. See
> `docs/reviews/2026-07-15-fable-fun-review.md` (the original review) and
> `docs/reviews/2026-07-15-fable-plan-review.md` (the plan review) — both kept verbatim,
> don't edit them to "resolve" points, track resolutions here instead.

## What this changes and why

An independent, unprimed review of the newly-restructured `docs/design/` folder found the
game's own telemetry (`pnpm campaign`'s margin-at-clear data) shows m1-m5 clear with median
100% hull and near-zero retries — the campaign's signature "energy management" skill loop is
never actually tested before the m6 finale. The review made 5 suggestions and flagged 8
inconsistencies; codebase exploration during the interview corrected two of the suggestions
(chain scarcity is economic, not call-count; endless mode is a real feature, not "nearly
free") and confirmed one as cheaper than expected (live star HUD needs zero core changes).

## Confirmed decisions (2026-07-15 interview — do not re-litigate)

| # | Decision | Resolution |
|---|----------|-----------|
| 1 | "Idle" label | Drop it — reposition identity as an arcade roguelite shooter. No idle mechanics being added. |
| 2 | "Subscriptions" shop tab | Rename to **Contracts** — **superseded 2026-07-15, see Item 2 below.** Codebase check during implementation found the live UI never actually displayed "Subscriptions" as a tab label; the real player-facing nav item is already "DISPATCH REINFORCEMENTS" (`HubScene.ts`'s `NAV_ITEMS`), which has no IAP-naming problem. No code rename needed — fixed the design docs' terminology instead. |
| 3 | Live star progress | Build it — confirmed view-layer-only, no core changes needed. |
| 4 | Targeting verb | Add tap-to-target. **Front weapon only.** Soft priority (prefers marked target when valid, falls back to front-most otherwise — never wastes a shot). Free and instant, no cooldown. |
| 5 | Campaign length gap (~30min real vs. ~60-75min target) | Close it with real new content, not a doc-only target correction. |
| 6 | How to add content | New mission(s), not longer existing missions — padding m1-m5 would worsen the frictionlessness complaint, not fix it. |
| 7 | Where | One new, genuinely harder mission inserted **mid-campaign, around m3/m4** — directly targets the flat stretch the data flags, not tacked onto the end. |
| 8 | Booster enemy (documented, never built) | Build now, as the new mission's signature enemy. **Regen-buff variant**: reuses the existing `regenPerTick` field verbatim (same mechanism as t3's guardian). **No buff-stacking** — strict 1:1, each booster buffs only the one enemy directly ahead of it (adjacency rule superseded by decision #14 — distance-based, not spawn-order). A future damage-buff variant is documented but not built this pass. |
| 9 | Endless/siege mode | **Out of scope for this plan.** Tracked as its own future initiative — it's the single largest item in the review and deserves a dedicated design pass. |
| 10 | Mid-run risk lever | **Opt-in blocker elites** — extend the existing "kill a blocker → bonus support call" mechanic into a player choice (see Item 6 below for the exact shape). |
| 11 | Chain enabler economics | Move Overcharge, Pierce Lance, and Shield Sync from subscription Lv2 (950 coins total) to **Lv1** (350 coins) — payoff cards stay at Lv2 as the reward for further investment. (Adrenaline is already at Lv1 — no change needed there.) |
| 12 | Blocker-elite structure (2nd Fable pass caught: the original spec had no real risk — see Item 6) | **Charge accrues only while other enemies are also on screen.** Holding a cleared lane freezes the charge instead of growing it risk-free — the decision requires genuine multitasking, not arithmetic. |
| 13 | Is the new mid-campaign mission skippable? (2nd Fable pass: unspecified, changes what game this is) | **Mandatory.** The old `['m3','m4']` unlock edge is removed, not kept alongside the new one — optional hard content gets skipped by exactly the players who'd benefit most. |
| 14 | Booster adjacency rule (2nd Fable pass: spawn-order vs. visual position can diverge, risking a post-balance-lock redo) | **Distance-based** — "ahead" means whichever alive enemy currently has the next-smaller `distance` value, recomputed live, not fixed at spawn time. |
| 15 | Live star countdown scope (2nd Fable pass: m1-m5's time-star tiers are already-documented-fake ±1-2s tie-breaks — a countdown to them would visibly read as broken) | **Scope the time-threshold countdown to m6 only** (real tiers). Ship the two binary icons (all-kills, shield-unbroken) everywhere. Re-anchoring m1-m5's tiers stays the separately-tracked, already-blocked item it already was (`docs/plans/mission-fun-review.md`'s F4) — not reopened by this plan. |

## Corrections made during the interview (codebase-verified, not re-askable)

- **Chain scarcity is economic, not call-count.** Every main mission has 7-8 support calls
  (verified by counting `supportCallTicks` in `missions.ts`), not the "1-3" the review
  assumed. The real blocker is that 3 of 4 chain enablers require subscription Lv2 (950
  coins) against a 4,000-8,000 coin campaign income. Item 5 addresses the real cause.
- **Mission length is worse than the review said.** Measured 2000-run durations: m1=181s,
  m2=288s, m3=320s, m4=363s, m5=155s, m6=311s. m3, m4, and m6 all exceed the identity doc's
  stated 30-300s range; total combat is ~27min against a claimed ~50min balance-doc subtotal.
  Folded into Item 1's doc fixes, with the range widened once the new mission's length is known.
- **Rear weapon / brownout, conveyor physics** — both were doc-clarity gaps, not open
  questions. Rear weapon costs energy per shot but is confirmed (by code comment) to never
  brownout-stretch. Enemies never interact with each other spatially — `blocksConveyor` only
  freezes new spawns, not existing enemy movement. Folded into Item 1.

## Corrections made during the plan review (2nd Fable pass, codebase-verified)

- **Item 6 as originally specified had no real risk.** Since `blocksConveyor` only freezes
  new spawns, optimal play could clear the live queue then hold a lone blocker in complete
  safety — a risk-free wait, not a decision, and one that would trigger `pnpm pacing`'s own
  IDLE_STRETCH flag. Fixed by making the hold-charge require ongoing pressure (decision #12
  above) — see Item 6 below for the full mechanic.
- **The new mission's mandatory/skippable question was genuinely unspecified** and changes
  what's actually being shipped — an optional "second real test" doesn't fix a flat campaign,
  it just adds bonus content the players who need it most will route around. Resolved as
  mandatory (decision #13).
- **Booster's "enemy directly ahead" needed a precise, decided-now definition**, since
  enemies move at independent speeds and can overtake each other — spawn-order and visual
  position can diverge mid-mission. Resolved as distance-based, recomputed live (decision #14).
- **Item 3's planned time-star countdown would have surfaced already-known-fake data** —
  m1-m5's time-star tiers are a synthetic ±1-2s spread, not real thresholds (see
  `missions.ts`'s own comments). Scoped the countdown to m6 only rather than reopening the
  separately-tracked time-star realism problem (decision #15).

## Execution strategy: balance-first, screenshots-later

Claude Preview / the dev server aren't working in this sandbox yet (separate, unrelated
setup task). Rather than block on that, every item below is split into:

- **Phase A — no dev server needed.** Data changes, core logic, new mechanics, and their
  balance verification. Everything here runs through the existing headless toolchain
  (`pnpm sim` / `balance` / `campaign` / `pacing` / `tune` / `test` / `lint` / `build:dry`) —
  the same tools that did all of this session's earlier mission-balance work with zero
  dev-server dependency. **This is also where "make the balance very good" actually lives** —
  it's not a lesser piece being done first for scheduling convenience, it's the substantive
  design work. Two items (1, 5) are Phase A only, start to finish.
- **Phase B — needs the dev server + screenshots.** Rendering, layout, pointer/tap handling,
  visual feedback, anything `v2/CLAUDE.md`'s mandatory visual-verification rule actually
  gates on. Deliberately deferred as a group to one pass once Preview is working, rather than
  context-switched between the balance work.

**Every Phase A change can be written, tested, and balance-verified now.** Phase B changes
should not be *coded* blind and left unverified — write the Phase A prerequisite each Phase B
item depends on now (e.g. Item 4's core targeting logic), but hold the actual view-layer
code (the pointer handler, the HUD rendering) until Preview is up, so nothing sits in a
"probably works, never actually looked at it" state.

**Suggested order** (revised from a single item-by-item sequence to two waves; reordered
after the 2nd Fable pass to put Item 7 before Item 6 — Item 6's charge-under-pressure
mechanic is easiest to sim-tune against the *complete* mission set including m3b, and m3b
likely has its own blocker(s) worth including in that tuning pass):

**Wave 1 — Phase A, all items, do now:**
1. Item 1 (doc fixes, non-deferred parts) — zero risk, clears the ground.
2. Item 5 (chain economics) — data-only, independent.
3. Item 2's data/naming groundwork (see below) — independent.
4. Item 3's `liveStarProgress` logic + tests (m6-scoped countdown, per decision #15) —
   independent.
5. Item 4's core targeting mechanic + tests + both sim-policy comparisons (high-value AND
   naive) — the most balance-relevant piece of the whole plan; can be fully exercised
   without any UI.
6. Item 7 — the new mission + booster core mechanic (distance-based adjacency, mandatory
   unlock edge, campaign-shape check). Do this before Item 6 now, once the toolchain has
   been exercised on everything smaller.
7. Item 6's core "hold-under-pressure" mechanic + balance verification, tuned against the
   full mission set including m3b.
8. Item 1's deferred doc edits (mission-length range, balance breakdown table) — now that
   Item 7's real numbers exist.

**Wave 2 — Phase B, once Preview/dev server works:**
9. All the view-layer pieces flagged below, ideally in one focused visual-polish pass:
   Contracts rename display check, live star HUD rendering, tap-to-target pointer handler +
   marker, blocker-hold UI signal, booster's texture + new mission's on-screen feel.

## Item 1 — Doc corrections (Phase A only)

Do this first — zero risk, clears the ground before anything else touches these files.

- `docs/design/01-identity.md`: drop "idle," reposition as arcade roguelite shooter; correct
  the mission-length range once Item 7's new mission duration is known (do this edit *after*
  Item 7 lands, not before).
- `docs/design/07-support-calls.md`: Basic Lv1 pool count 5 → 7 (matches `05-shop-and-modules.md`
  and the actual `subscriptions.ts` data).
- `docs/design/06-combat.md`: clarify rear weapon costs energy but never brownout-stretches
  (one sentence).
- `docs/design/02-glossary.md` or `06-combat.md`: clarify enemies never interact with each
  other on the conveyor — `blocksConveyor` freezes spawning only (one sentence).
- `docs/design/13-balance-and-tuning.md`: correct the 1-hour campaign breakdown table to
  measured values (do this after Item 7 lands, so the new mission's time is included).

**Verify:** read-through only, no `pnpm` commands needed, no dev server involved at all.

## Item 2 — "Contracts" rename: superseded, no code change needed

**Resolved 2026-07-15 by checking the codebase instead of executing blind:** searched for
every player-facing "Subscriptions" string before renaming anything. `HubScene.ts`'s
`NAV_ITEMS` shows the actual shipped tab label is already **"DISPATCH REINFORCEMENTS"**
(line 73) — the game never displayed "Subscriptions" as a nav item or tab. Only these
design docs used "Subscriptions" prominently as the concept's name (`ownedSubscriptions`,
`SUBSCRIPTIONS`, `SubscriptionSpec` remain fine as internal/data-model identifiers, per the
original "not the individual subscription names" carve-out — those were never meant to
change either). Fable's original IAP-naming concern doesn't apply to what's actually
shipped; introducing "Contracts" as a third name that doesn't match the live UI would have
been a real regression for zero benefit.

**What actually happened instead:** `docs/design/05-shop-and-modules.md` and
`02-glossary.md` updated to state the real in-game name (Dispatch Reinforcements) and
explain the terminology gap, so a future reader doesn't independently rediscover this. No
code touched, no Phase B visual check needed for this item — it's fully resolved without a
dev server.

## Item 3 — Live star progress in the combat HUD

Stars are only evaluated once at victory (`src/core/stars.ts`'s `evaluateStars`). Every
family's underlying data is already tracked live in `CoreState` every tick:
- `hull-above` — `state.ship.hull / state.ship.maxHull` vs. threshold, live.
- `shield-unbroken` — `state.shieldBroke`, already a live boolean.
- `all-kills` — `state.stats.kills` vs. `state.spawnedCount`, both live counters.
- `finish-time` / `boss-time` — current `state.tick` vs. threshold, a live countdown.

**Phase A (now):** write the **read-only derivation function** (e.g.
`liveStarProgress(state)` in `src/viewmodel/combat.ts`) that computes "at risk" / "on track"
per star from current `CoreState` each frame — no core mutation, no replay/determinism
impact. This is pure logic, fully unit-testable without Phaser or a dev server: feed it
hand-built `CoreState` snapshots (hull low, shield broken, near a time threshold, etc.) and
assert the derived status. This is where the actual design judgment lives (which stars to
surface, when something counts as "at risk") — get it right here before any rendering exists.

**Verify (Phase A):** `pnpm test` (new viewmodel tests covering every star family's live
derivation, including edge cases — shield breaks mid-tick, all-kills becomes impossible
once one enemy reaches distance 0, etc.).

**Phase B (later):** surface it in `CombatHud.ts` — small indicators, not a full re-layout;
the info panel already has room. **Design call already made:** all-kills and shield-unbroken
as small always-visible pass/fail icons (binary, cheap to read at a glance) on **every**
mission. The nearest-unmissed-time-threshold countdown ships **on m6 only** — m1-m5's
time-star tiers are a synthetic ±1-2s spread around one value (`missions.ts`'s own
comments admit this), not four meaningfully different thresholds, so a live countdown to
them would visibly read as broken (T1-T4 blowing past within a 4-second window) and shows
the player a number they can't meaningfully influence. Re-anchoring m1-m5's tiers to a real
spread is a separate, already-tracked, already-blocked item
(`docs/plans/mission-fun-review.md`'s F4 — re-anchoring to motor tiers hit a real
methodology blocker previously) — not reopened by this plan. If that item ever gets
unblocked, extending the countdown to m1-m5 is a trivial follow-up. Confirm the m6-only
countdown reads well in the live preview before finalizing layout; mandatory visual
verification (screenshot mid-combat, near a star-break moment, on m6 specifically).

Also decide before shipping: "at risk" indicators should only fire for stars not yet
permanently earned in a previous clear of that mission — a warning for a star the player
already owns is noise, not tension.

## Item 4 — Tap-to-target (front weapon only)

Per the confirmed decisions: front weapon only, soft priority, free and instant. **This is
the most balance-critical item in the plan and is almost entirely Phase A** — the targeting
logic itself runs through the exact same core the live game uses, so its effect on combat
outcomes is fully measurable via the simulator before any UI exists.

**Phase A (now):**
- Add `priorityTargetId: number | null` to `CoreState`. New mutator `setPriorityTarget(state,
  enemyId | null)` in `combat.ts`, alongside the existing `toggle*` functions.
  `fireShipWeapon` (front weapon) checks: if `priorityTargetId` is set and that enemy is
  still alive and a valid target, fire at it; otherwise fall back to today's front-most logic
  exactly as-is. Include `priorityTargetId` in `hashCoreState` (determinism contract).
- Add `priorityTargetTaps: {tick, enemyId}[]` to `ReplayRecord`, mirroring
  `boostTaps`/`sideWeaponTaps`.
- Add a `TargetPolicy` hook to `RunPolicies` (mirrors `manageToggles`/`useSideWeapon` from
  the earlier simulator-fidelity work) and two policies, not one:
  - `prioritizeHighValueTargets` — confirms the mechanic *can* help (targets
    turret/booster/boss when present).
  - A **naive** always-mark-the-scariest-rear-enemy policy, with no judgment about whether
    now is a good time — verify this one **sometimes loses** to no-targeting-at-all on
    swarm-heavy waves (ignoring the front to snipe something deep should occasionally get
    the front-most enemies to collision range). If naive targeting never loses, the
    mechanic is a zero-cost reflex tax, not a decision — that's a real finding, not just a
    box to check, and would mean revisiting "free and instant" before Phase B.
- **Multi-target/falloff interaction, specified now:** when `effectiveTargets > 1`, the
  priority target (if set and valid) takes index 0 (full damage, no falloff); remaining
  slots fill from front-most as today. Write this into the implementation, don't leave it
  to be discovered.
- **Onboarding:** the new mission in Item 7 must include a narrator line introducing the
  verb the first time a booster appears (e.g. "Mark the booster — your forward battery will
  do the rest") — this is the game's fourth verb and its signature payoff enemy; t1-t4 each
  exist to teach one mechanic this deliberately, tap-to-target shouldn't ship silently.
- Update `08-enemies.md`'s "must be prioritized" language for booster/turret to reference
  the real mechanism now that it exists.

**Verify (Phase A) — done 2026-07-15:** core tests confirm the marked enemy is hit even
when not front-most, falls back cleanly when the target dies/is absent, takes slot 0 with
no falloff, and `hashCoreState`/replay reproduce the same target sequence. Both sim
policies measured against real missions:

- **`alwaysMarkFarthestEnemy` (naive, the "can it hurt" check) — confirmed real cost.**
  Across 200 seeds on m1/intended: 591 collisions with naive targeting vs. **0** without
  any targeting at all. Ignoring the front to chase whatever's deepest reliably lets
  front-most enemies reach collision range — "free and instant" targeting is not a
  strictly-dominant reflex tax, it has a genuine downside if used carelessly.
- **`prioritizeHighValueTargets` (the "can it help" check) — smaller effect than
  expected on today's content, and that's an honest finding, not a bug.** Measured on
  m4/m6 (the only missions with turret today): clear-rate and hull-margin were within
  noise of the no-targeting baseline (m4: 85.4% both ways; m6: 84.2% vs 85.6%, hull
  margin 85.3% vs 86.0%). Root cause understood, not hand-waved: pulse (the intended
  weapon for both missions) has `maxTargets: 1` at every level, so priority marking does
  change which enemy gets hit — but turret is stationary and everything else moving past
  it eventually clears, so it becomes front-most (and gets killed by ordinary targeting)
  soon enough regardless. The mechanic is still justified: it gives the booster/turret
  "must be prioritized" language in `08-enemies.md` a real, working verb for the first
  time (there was none before this item), the downside above proves it's a genuine
  decision, and its clearest payoff is Item 7's booster — a regenerating buff-source
  where early prioritization matters far more directly than a stationary turret's chip
  damage. Not re-tuned further to force a bigger number here; the honest measurement
  stands.

`pnpm test`/`lint`/`build:dry` all clean throughout.

**Phase B (later):** `src/view/CombatScene.ts` pointer handler on enemy sprites, calls
`setPriorityTarget`. Visual marker/reticle on the current priority target (auto-clears when
it dies). Mandatory visual verification (tap an enemy, confirm the front weapon re-targets
and the marker renders correctly).

## Item 5 — Chain enabler economics (Phase A only)

In `src/data/subscriptions.ts`: move `oc-core` (Overcharge) and `pierce-lance` from
`sub-offensive` Lv2's `cardIds` to Lv1's; move `res-sync` (Shield Sync) from `sub-defensive`
Lv2's `cardIds` to Lv1's. Leave the payoff cards (`cnt-...` overcharge payoffs, pierce
payoffs, pulse-amp/pulse-nova) at Lv2 — the level-up still means something, it just no
longer gates the enabler itself. Pure data change; no rendering is affected (the shop
already renders whatever cards are in a level's pool correctly).

**Verify:** `pnpm balance -- --runs 2000 --json` (0 new flags — moving cards between levels
of the same subscription shouldn't move core clear-rate, but confirm), `pnpm test`
(subscription/card-pool tests), `pnpm lint`/`build:dry`. No dev server involved at all.

## Item 6 — Opt-in blocker elites (risk lever)

Extend the existing "kill a blocker → bonus support call" mechanic (`maybeTriggerBonusCall`
in `tick.ts`) into a player choice rather than an automatic reward. **Restructured after the
2nd Fable pass** — the original "hold longer for a bigger bonus" spec had no real risk once
you actually trace it: `blocksConveyor` only freezes new *spawns*, so a player could clear
every other live enemy first, then hold the lone blocker in complete, risk-free safety. That
converges to "always hold, then wait" — arithmetic, not a decision, and it would deliberately
create the exact idle stretches `pnpm pacing`'s IDLE_STRETCH flag exists to catch.

**The fix (decision #12): hold-charge accrues only while pressure exists.** A blocker's
`holdCharge` counter increments each tick **only if at least one other enemy is also alive**
on the conveyor at that moment. The instant the lane clears down to just the blocker, the
counter freezes — and since the blocker itself is still blocking new spawns, it can never
un-freeze on its own. This makes the ceiling on "how big a bonus can I earn" strictly a
function of how long the player can *coexist* with the blocker while other threats are still
present and dealing real damage — genuine risk, not a wait. Killing the blocker (whenever
the player chooses) banks whatever charge has accumulated into the bonus call's size/quality;
exact scaling is a `pnpm sim`-tuned number, not guessed up front.

**The holding verb — no new input, reuses what's already planned:** with auto-fire on, the
front weapon kills whatever's in range including a front-most blocker by default. "Holding"
is the natural consequence of the player choosing *not* to let that happen — toggle the
front weapon off (ties directly into the existing energy-management skill loop), or (once
Item 4 ships) tap-target something else so the weapon's attention is elsewhere. No third
button. When the blocker is the *only* enemy left, both expressions converge on "stop
shooting entirely" — that's fine and consistent (it's also the moment charge is frozen
anyway, so continuing to hold buys nothing).

**Phase A (now):**
- Add a `holdChargeTicks` field to `EnemyState` (blockers only need it, but it's cheapest
  to add to the type generally). Increment it in the tick loop when the owning enemy
  `blocksConveyor` and `state.enemies.length > 1`.
- **Add it to `hashCoreState`'s enemy snapshot** — today that only hashes
  `{id, distance, hp}`; a hold-charge divergence between two runs must be caught by the
  determinism check same as everything else.
- Bonus-call sizing in `maybeTriggerBonusCall` (`tick.ts`) reads accumulated `holdChargeTicks`
  at the moment the blocker dies, not just "a blocker died."
- No new `ReplayRecord` field needed for the holding verb itself — toggle state
  (`autoFireEnabled`) is already hashed and already replay-reproducible via the existing
  toggle mechanism; only the new `holdChargeTicks` counter is new state requiring hash
  coverage (above).
- Sim policies (mirrors Item 4's pattern): "always burn immediately," "always hold as long
  as pressure allows," and a judgment-based policy. Use `pnpm sim`/`pnpm balance` to find
  bonus-scaling numbers where holding is a genuine trade-off (meaningfully better *and*
  meaningfully riskier than burning), not guessed magnitudes.

**Verify (Phase A):** new core tests (`holdChargeTicks` only increments under real pressure,
freezes correctly when the lane clears, resets/doesn't persist incorrectly across multiple
blockers, hash catches a divergence), `pnpm sim`/`pnpm balance` on affected missions
comparing the three policies, `pnpm campaign` (must stay 100%/100% for both archetypes —
confirm this new risk surface doesn't create a stuck state, and doesn't quietly become the
new dominant strategy the way the original spec would have).

**Phase B (later):** the UI signal for "you're holding a blocker and charge is
accruing/frozen" — a visual charging indicator or equivalent, `v2/CLAUDE.md` mandatory
visual verification. Build this after Item 4's Phase B and after Item 7 (see revised
sequencing below) — "hold the blocker, meanwhile tap-target something else" is the intended
synergy and is easiest to feel/tune once both mechanics and the new mission are already on
screen.

## Item 7 — New mid-campaign mission + booster enemy

The biggest single item — do this last within Wave 1, once the toolchain has already been
exercised on everything smaller.

**Phase A (now) — this is the bulk of the item, and it's the same kind of work as the
earlier mission-rebalance pass this session (100% headless):**
- **Booster enemy spec** (`src/data/missions.ts`): `EnemySpec` reusing the existing
  `regenPerTick` field. New core logic needed in `combat.ts`'s `regenerateEnemies` — it
  currently applies `regenPerTick` to the enemy itself; a booster needs to apply *its* regen
  value to the enemy *directly ahead of it* instead. **Adjacency is distance-based (decision
  #14), decided now rather than left for Phase B to discover:** each tick, for each alive
  booster, find the alive enemy with the smallest `distance` value that is still greater
  than the booster's own `distance` (i.e. the closest enemy that is currently closer to the
  ship) and apply the regen to that enemy for the tick. Recomputed live, not fixed at spawn
  time — enemies move at independent speeds and can overtake each other, so a spawn-order
  rule would sometimes buff an enemy the player can see is *behind* the booster on screen.
  This was flagged as the single highest-risk deferred decision in the plan review — getting
  it wrong and discovering it in Phase B would mean redoing Phase A's balance work, so it's
  locked in before any mission data is tuned against it.
- Dedicated tests: the 1:1 no-stacking rule (two boosters in the same wave, confirm neither's
  buff leaks to the other's target), the overtake case (a fast enemy spawned after a booster
  passes it — confirm the buff target updates to the new nearest-ahead enemy), and
  booster-buffs-booster adjacency (one booster directly ahead of another).
- **New mission data**: id should NOT renumber existing missions — use a new, non-conflicting
  id (e.g. `m3b`). **Mandatory, not skippable (decision #13):** remove the existing
  `['m3', 'm4']` edge from `MISSION_UNLOCK_EDGES` entirely, replacing it with
  `['m3', 'm3b'], ['m3b', 'm4']` — do not leave the old edge alongside the new one, or m3b
  becomes bypassable optional content and doesn't fix the flat-campaign problem it exists to
  fix. Update `MISSION_ROUTE` in `campaign-simulate.ts` to insert `'m3b'` between `'m3'` and
  `'m4'`. Add an `m3b` entry to `loadoutPresets.ts`'s `INTENDED_LOADOUT_LEVELS` and
  `tune-loadouts.ts`'s tuned-mission list.
- **Difficulty target**: a genuine "second real test" — target a clear-rate floor noticeably
  tighter than m3/m4's current 65-83%, closer to m6's tier, so it actually produces the
  mid-campaign tension the whole plan exists to create. Find the exact floor via `pnpm sim`/
  `pnpm balance` iteration, same method used for every other mission in this project — don't
  guess a number up front. **Set a retry ceiling too, not just a clear-rate floor** — the
  `average` archetype's mean retries at m3b should stay bounded (e.g. comparable to m6's
  existing ~2-3 range, not unbounded) so a harder mid-campaign mission doesn't become a
  disguised grind wall, which would violate the "never grinding" principle from the other
  direction.
- **Campaign-shape acceptance criterion — now a real, built metric, not a manual read.**
  `pnpm campaign` gained a "one hour of fun" score (2026-07-15, see
  [Architecture & Tooling](../design/12-architecture-and-tooling.md)) with a
  `pacing-shape` sub-score built exactly for this: it rewards a real tension curve
  across missions and specifically requires the finale to be at or near the hardest
  point, penalizing a mid-campaign spike (m3b) that leaves the finale comparatively
  easy by contrast. After m3b lands, check `pacing-shape` moved up from its current
  baseline (expert=34.6, average=85.2, measured pre-m3b) without m6 losing its status
  as the harder of the two — the score makes "did this actually fix the curve, or just
  relocate the flatness" a number instead of an eyeballed judgment call. Still worth a
  manual read of the per-mission retry/margin table for the *specific* shape (which
  mission is flattest now), the score just replaces the pass/fail judgment.

  **Measured outcome (2026-07-15):** `average` moved 85.2 → 85.5 (stayed high, as
  required) with 0 stuck campaigns at n=1000 — clean pass. `expert` is more nuanced:
  against `pnpm tune`'s *own* dominant-kind pick for m3b (`nova` — hits every enemy on
  screen), pacing-shape sits at 34.6, unchanged from baseline, because nova trivially
  counters the exact "single-target weapon vs. simultaneous booster-fed tanks" tension
  the mission is built around — median hull stays 100%, near-miss 0%. Forcing a
  weaker/single-target weapon onto `expert` for this one mission (breaking the
  archetype's "always plays its own best affordable build" premise) does move it: 34.6
  → 44.5, confirmed by hand during tuning. This is a real, structural finding, not a
  tuning miss: `expert`'s dominant-kind selection will always gravitate toward whatever
  most cleanly counters a given mission's specific difficulty lever, so any mission
  whose challenge comes from a targeting/single-target constraint (as m3b's does, per
  Item 4's tap-to-target payoff) is inherently soluble by `expert` picking a multi-target
  weapon — no amount of density tuning against `m3b`'s own `intended`-loadout gate
  changes that, since `expert` never plays at `intended` gear once past the tutorials.
  Fixing this for real would mean reworking the campaign economy's gear-choice model
  (out of scope for Item 7) — not attempted here, left as an honest gap rather than
  force-fit. `m3b`'s own `intended`+`greedy` clear-rate (68.0%, floor 60%) still landed
  meaningfully tighter than m3/m4's 70-85% band, satisfying the mission's own difficulty
  target on its own terms.

**Verify (Phase A):** `pnpm sim --mission m3b --runs 2000` against the chosen floor, `pnpm
balance -- --runs 2000 --json` (0 flags across the whole game), `pnpm pacing` (confirm the
new mission doesn't trip MONOTONY/IDLE_STRETCH — hold new content to the same bar as
everything else), `pnpm campaign` (must stay 100%/100%, confirms no stuck point for either
archetype, plus the campaign-shape check above), `pnpm tune` (regenerate
`recommendedKinds.generated.ts`), `pnpm lint`/`build:dry`/`test`. **All of this is
achievable and should be fully done and verified without the dev server** — by the time
Phase B starts, the mission's balance should already be locked and proven, leaving Phase B
purely about how it looks and feels.

**Caveat carried into Phase B, not resolved here:** Item 4's balance verification uses a
frame-perfect sim policy that re-marks targets instantly — a real player tapping small,
moving sprites on a phone will realize less benefit and mis-tap sometimes. m3b's difficulty
floor is being locked against superhuman targeting input. Expect a real Phase B re-tune pass
on m3b once human playtesting happens, not just a visual look — this is flagged explicitly
so it isn't mistaken for "balance is done" prematurely.

**Phase B (later):** `HubScene.ts`'s galaxy map node layout needs one new node (the ASCII
diagram in `09-mission-progression.md` needs updating to match); the booster's procedural
texture (per the "no image assets, `Graphics.generateTexture()` only" rule); play the new
mission in the live preview and confirm the booster buff actually reads correctly on screen
(the player needs to *see* which enemy is buffed and by what, or the mechanic is invisible
even though it works).

## Explicitly out of scope

Endless/siege mode (item 9 in the decisions table) — tracked, not planned here. No changes
to rear/side weapon targeting (front weapon only, per the confirmed decision). No idle/away-
progression mechanics. No renumbering of existing mission IDs.

**The economy critique (original review, "the shop has no trade-offs, only a fill bar") is
acknowledged and deliberately not acted on this pass.** 100% sell-back and identical
kind-to-kind price ladders were both singled out as *good*, player-respecting design in the
same review — the "only decision is which system to level" critique is a direct consequence
of those two things working as intended, not a separate bug. Revisiting it would mean
weakening a principle the review otherwise praised, which needs its own dedicated design
conversation, not a bullet in this plan. Flagged here explicitly (per the 2nd Fable pass)
so it's a recorded decision, not a silently dropped point.

## File hygiene

No hardcoded personal paths/credentials in any of the above. Every core change (Items 4, 6,
7) gets colocated tests before being called done, matching this project's established
convention. No new save-migration logic needed (early-dev save policy, per `v2/CLAUDE.md`)
even though this changes `CoreState`'s shape — `SAVE_VERSION` bump + `defaultSave()` fallback
is sufficient if anything here touches persisted save data (Item 5's subscription pool
change might interact with already-owned-cards state — check `SaveManager.ts` before
assuming no migration is needed there specifically).

## Checklist

**Wave 1 — Phase A (no dev server needed):**
- [x] Item 1: doc corrections (non-deferred parts)
- [x] Item 5: chain enabler economics
- [x] Item 2: Contracts rename (code + docs)
- [x] Item 3: `liveStarProgress` logic + tests (m6-scoped countdown, all-mission binary icons)
- [x] Item 4: core targeting mechanic + `TargetPolicy` (high-value AND naive policies) + falloff spec + sim verification
- [x] Item 7: new mission data (mandatory unlock edge) + booster core mechanic (distance-based adjacency, no-stacking + overtake tests) + full balance verification + campaign-shape acceptance check (see measured-outcome note above — `average` passed clean, `expert` has an honest, documented gap tied to the campaign's dominant-kind selection, out of scope to fix here)
- [x] Item 6: `holdChargeTicks` mechanic (accrues under pressure only) + hash coverage + sim verification against full mission set
- [x] Item 1 (deferred): mission-length doc range + balance breakdown table, using Item 7's real numbers (01-identity.md's 30-300s range already covered m3b's ~215-235s without change; 13-balance-and-tuning.md's tables updated)
- [x] Full headless verification suite (`pnpm balance --json`, `pnpm campaign`, `pnpm pacing`, `pnpm tune`, `pnpm lint`/`build:dry`/`test`) passes clean after all Wave 1 items land — **0 flags introduced by Wave 1's own changes.** Two pre-existing baseline flags survive, both confirmed via `git diff` to predate this work (m1/m3/m4/m6's own mission data was never touched by any Wave 1 item): `m1-shield` UNREACHABLE (2.6%) in `pnpm balance`, and `m1 MONOTONY` / `m3 IDLE_STRETCH` / `m4 IDLE_STRETCH` / `m6 ANTICLIMAX` in `pnpm pacing`. `pnpm campaign` is clean (100%/100%, both archetypes). `pnpm tune`/`lint`/`build:dry`/`test` (576 tests) are all clean with no caveats.

**Wave 2 — Phase B (needs dev server + Preview):**
- [x] Item 2: visual confirmation of "Contracts" tab rendering — `hub-dispatch-reinforcements` screenshot confirms "DISPATCH REINFORCEMENTS" renders correctly (2026-07-16, via the new `pnpm screenshot` Playwright harness)
- [x] Item 3: `CombatHud.ts` star-progress rendering + screenshot verification — 2026-07-16. `computeCombatHudViewModel` now takes `alreadyEarnedStarIds` and returns `starIndicators`/`timeStarTicksRemaining`; CombatHud renders binary NO-HITS/SHIELD icons (only for not-yet-earned all-kills/shield-unbroken stars) plus an m6-only "TIME STAR Ns" countdown. Confirmed via screenshot: icons render green/red correctly on m1 and m4, countdown appears only on m6 (`TIME STAR 212.7s` in a healthy-state capture), no countdown noise on m1-m5.
- [x] Item 4: pointer handler + target marker + screenshot verification — 2026-07-16. Enemy sprites are now interactive; tapping calls `setPriorityTarget` (tap again to clear). A pulsing cyan corner-bracket reticle renders on the current target, auto-clearing when it dies (sprite lookup just returns nothing). Confirmed via `combat-m1-tap-target` screenshot.
- [x] Item 7: galaxy map node (m3b, done in an earlier session pass), booster texture (done earlier), onboarding narrator line (`first-booster-appear` trigger added 2026-07-16, `story.ts`'s m3b entry: "Mark the booster — your forward battery will do the rest"), booster-buff visual (amber pulsing line + ring from booster to whichever enemy `nearestEnemyAhead` — the exact function `regenerateEnemies` uses — currently targets; confirmed via screenshot). **Still open, not attempted this pass:** the flagged re-tune of m3b's difficulty against real (imperfect) human tap-to-target input — this needs actual playtesting, not something a headless pass can produce.
- [x] Item 6: blocker-hold UI signal + screenshot verification — 2026-07-16. A ring around each `blocksConveyor` enemy fills as `holdChargeTicks` accrues (amber while pressure exists, cooler grey-blue once frozen per `state.enemies.length <= 1`), with a tick mark at the tier-2 threshold. Confirmed via `combat-m4-hold-charge` screenshot showing two blockers mid-charge.

- [ ] `docs/reviews/2026-07-15-fable-fun-review.md` and `docs/reviews/2026-07-15-fable-plan-review.md` — no edits needed (kept as historical record); this plan is the living tracker instead
