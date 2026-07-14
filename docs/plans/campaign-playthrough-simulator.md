# Campaign playthrough simulator — "how does a new player actually experience the whole game"

> **Implemented 2026-07-10** — `v2/tools/campaign-simulate.ts` + `pnpm campaign`.
> All six design decisions confirmed via `/grill-me`, plan reviewed 3x by Fable, then
> built. This document is now historical record of the design process; see the tool's
> own header comment for the current, authoritative behavior summary.
>
> Written for a fresh agent (Fable) with no memory of the session that produced this
> document. Read `GAME_DESIGN.md` (repo root) and `v2/CLAUDE.md` first.
>
> **Standing rule still applies**: this document proposes new tooling, not balance
> number changes. Nothing here touches `v2/src/data/missions.ts` or `items.ts`. If
> running this tool later reveals a real balance problem, that's a separate,
> follow-up plan — same rule as every other balance finding this project has had.

## What this changes and why

Every simulation tool that exists today (`pnpm sim`, `pnpm balance`) answers one
question: *"given this one fixed, hand-picked loadout, how does this one mission go?"*
Confirmed by reading `tools/simulate.ts` and `tools/balance-sweep.ts` end to end —
neither imports `src/save/SaveManager.ts`, tracks a coin balance across missions, or
makes a purchase decision. They test *mission* balance, not *campaign* balance.

That leaves a real gap Tomáš flagged directly: nobody has ever simulated the thing a
new player actually does — start with zero coins and starter gear, attempt mission 1,
earn some coins (whether they win or lose), decide what to buy in the shop, attempt the
next unlocked mission, and so on until they either reach the end or get stuck and quit.
Every mission this project has balanced (including this week's m1–m6 and t4 passes) was
verified in isolation against a hand-authored "intended loadout" — never checked against
whether a real new player's actual, lived economy gets them there in time.

This is not a replacement for the existing per-mission tools — it's a different layer,
answering a different question: not "is m4 winnable at its intended loadout" (already
verified) but "does a new player's own money and choices actually put them in m4 with
that loadout by the time they reach it, or do they arrive undergeared and get stuck?"

### What already exists to build on (verified, not assumed)

The shop's real purchase/equip logic is a clean, headless-callable, side-effect-pure
API in `src/save/SaveManager.ts` — reusing it directly (not reimplementing shop math)
is both the right call and the project's existing constitutional rule extended one
layer up ("the simulator and the live game share the same core," `v2/CLAUDE.md`):

- `defaultSave()` (`SaveManager.ts:63`) — the true zero-state: 0 coins, starter gear
  (`pulse-1`/`shield-wall-1`/`generator-torrent-1`/`motor-rush-1`), no stars.
- `buildLoadout(save)` (`SaveManager.ts:237`) — turns current save state into the
  `LoadoutSnapshot` that `runMission()` actually consumes for m1-m6. **Does not apply
  to w0 or t1-t4** — see the forced-loadout callout below; those five missions never
  call this function at all, in the sim or the live game.
- `switchItem`/`switchShip`/`switchRearWeapon`/`switchSideWeapon`/`unequipWeapon`/
  `unequipShield` (lines 431, 468, 263, 299, 450, 459) — all 7 equip-slot systems,
  identical trade-in economics, throw on unaffordable rather than silently failing.
- `buySupplyCharge`/`sellSupplyCharge` (lines 485, 504) — the 8th purchasable
  (Reserve Supplies, per-charge).
- `applyMissionResult(save, result)` (`SaveManager.ts:397`) — folds a finished run's
  coins and newly-earned stars into the save. Confirmed by reading it directly:
  **coins are always credited (kill rewards bank even on a loss; only the
  `completionCoins` bonus requires victory), and stars are permanently deduplicated
  once earned — a worse replay never removes a star** (`SaveManager.ts:411`,
  `result.earnedStarIds.filter((id) => !previous.includes(id))`). **w0 and every
  tutorial (any mission with `forcedLoadout !== undefined`) take an early-return
  branch that credits coins and marks completion but always returns `newStarIds: []`**
  (`SaveManager.ts:399-408`) — no mission in that group ever grants a star, by design.
  All stars, and therefore all star-gated shop unlocks, come from m1-m6 only.
- `isMissionUnlocked(save, missionId)` (`SaveManager.ts:229`) — **mission unlock is
  completion-gated, not star-gated** (changed 2026-07-10, after this plan's first draft
  — GAME_DESIGN.md §9 states stars are never required to progress). It checks
  `save.completedMissionIds` against `MISSION_UNLOCK_EDGES`
  (`src/data/missions.ts:553`), a real dependency graph, not a linear array index: a
  mission with no incoming edge (only `t1`) is always unlocked; every other mission
  unlocks once *any one* of its incoming edges' source mission has been won (any star
  count — completion, not performance, is what counts). The graph branches: tutorials
  (`t1→t2→t3→t4`) and main missions (`m1→m2→...→m6`) are separate chains joined once,
  at `t1→m1`. `totalStars(save)` still exists but is unrelated to mission unlock now —
  see the callout below on what it's still used for.
- `abilityPoolForLoadout(loadout)` (`src/data/cards.ts`) — computes which ability cards
  can be drawn during a run from `loadout.subscriptionCardIds`: if non-empty, restricts
  to exactly those ids; if empty, falls back to the full 120-card catalog
  (`ALL_ABILITIES` + `ALL_NEW_ABILITIES`, counted directly) — a rule that only applies
  to forced tutorial loadouts by design, never to a real save. **This
  must be called fresh before every mission attempt**, not cached at campaign start —
  a real player's subscription can change between attempts (see the purchase system
  below), and the pool has to reflect whatever they own *right now*. Reuse this
  function directly; do not reimplement it. This is a hard-won lesson from this same
  session: `tools/simulate.ts` and `tools/balance-sweep.ts` each carried their own
  stale, diverged local copy that silently ignored `subscriptionCardIds` entirely,
  making every earlier balance run simulate the wrong (full) card pool for months. Both
  were deleted in favor of this one shared function — the campaign simulator must not
  reintroduce a fourth copy.
- **w0 and every tutorial (t1-t4) never call `buildLoadout(save)` at all — a real gap
  in this plan if left unhandled.** Any mission with `forcedLoadout` defined (w0, t1,
  t2, t3, t4 — confirmed by reading each entry in `missions.ts`) is resolved through
  `resolveForcedLoadout(forced)` (`src/data/loadouts.ts:41`) instead, which ignores the
  save entirely and always sets `subscriptionCardIds: []` on purpose — that's what
  makes every tutorial draw from the full 120-card catalog above regardless of the
  player's real subscription (documented in that function's own comment as
  deliberate, not a fidelity gap), **with one further wrinkle**: `abilityPoolForLoadout`
  also filters out `nexus`-company cards whenever `loadout.weapon === null`
  (`cards.ts:379`), and t1's `forcedLoadout` explicitly sets `weaponId: null`
  (`missions.ts:179`) — so t1's real pool is 120 minus nexus cards, not literally all
  120. Immaterial for the simulator's implementation (it reuses
  `abilityPoolForLoadout` either way, so this falls out for free), but worth knowing if
  anyone hand-verifies a t1 pool count later. The campaign simulator's mission-attempt step must
  branch on this the same way `CombatScene.ts` and `tools/simulate.ts` already do:
  `forcedLoadout !== undefined` → `resolveForcedLoadout(forced)`, otherwise →
  `buildLoadout(save)`. Getting this wrong (e.g. always calling `buildLoadout`) would
  make t1-t4 draw from the player's tiny real subscription pool instead of the full
  catalog — the opposite of what the live game does.
- `buySubscription`/`upgradeSubscription`/`downgradeSubscription`
  (`SaveManager.ts:328,345,367`) — a **9th purchase system**, easy to undercount
  alongside the 7 equip slots + supplies. **`sub-basic` is not a fixed, one-shot
  freebie — it's `permanent` only in the narrow sense that Lv1 is free, always owned
  (`defaultSave()`'s `ownedSubscriptions: { 'sub-basic': 1 }`), and can't be
  downgraded or re-bought.** It still has 3 real levels: Lv2 (600 coins) and Lv3 (1200
  coins) are genuine purchases via `upgradeSubscription`, same as any other system. An
  "informed saver"/"impulse spender" that treats sub-basic as untouchable after the
  free Lv1 would be modeling the game wrong — its higher levels are exactly the kind of
  purchase decision this simulator exists to capture, since every tier change updates
  `subscriptionCardIds` directly (the ability pool above), not a combat stat. Other
  subscription lines beyond `sub-basic` are ordinary priced purchases throughout.
- **Shop-item level gating (`starsRequired` on catalog items, `src/data/items.ts`) is
  enforced only in the viewmodel layer** (`src/viewmodel/hub.ts:322,395,570` — a
  kind-row lock plus two level-chip locks), **not inside any `SaveManager` mutator.**
  `switchItem`/`switchShip`/`upgradeSubscription`/etc. do not check stars themselves —
  calling one directly bypasses the star gate entirely, **including on subscription
  levels**: `sub-basic` Lv2 is ungated but Lv3 gates at ★18 (`subscriptions.ts:61`,
  surfaced via `hub.ts:570`), but
  `upgradeSubscription` itself has no such check. If the campaign simulator calls
  these mutators directly (as it should, per the shared-core rule above), it must
  replicate hub.ts's `starsRequired > totalStars(save)` check itself before attempting
  *any* purchase — item, ship, or subscription — that a real player couldn't make
  through the UI. `hub.ts` has zero Phaser/DOM imports (confirmed by reading its
  import list) — reuse its existing lock-check logic rather than re-deriving the
  comparison independently.

**Design decision already made, stated explicitly so it isn't re-litigated:** only
mission *unlock* moved to completion-gating this session. Shop-item level gating (the
`starsRequired` check just above) is unchanged and still star-based for now — but this
is **not settled design to preserve**, unlike the mission-unlock decision. GAME_DESIGN
§9 (line 443) states the intent plainly: "Shop items are gated by mission completion,
not stars," and its own status table (line 658) lists "Mission-completion shop gates |
Star-based gates to be replaced." The current star-based behavior is a known,
acknowledged gap against the documented design, not a deliberate choice this plan is
making. The simulator must still replicate *today's real, live-game behavior*
(star-based, since that's what's actually implemented and running) — that part of the
guidance above is unchanged — but the doc should not imply this is how it's meant to
stay. If that gate is ever migrated to completion-based (matching mission unlock), this
simulator's purchase-gating logic needs the same follow-up change.

**Mission order and unlock graph** (`src/data/missions.ts`, read directly): w0 is
always unlocked (no incoming edge in the graph, and not part of it at all). t1 is the
graph's sole root. From there it branches: `t1→t2→t3→t4` (tutorials) and `t1→m1→m2→m3→
m4→m5→m6` (main campaign) are independent chains joined only at `t1→m1` — completing
t4 is not required to reach m1. A campaign simulator's mission-attempt order must
respect this graph, not a flat array index.

**Confirmed: no attempt/loss tracking exists anywhere in `SaveData`.** A loss is a
complete no-op beyond banking whatever kill-coins were earned before dying — no
cooldown, no penalty, unlimited immediate retries. The same freedom applies to a
*win* — nothing stops replaying an already-cleared mission for its coins again (stars
dedupe, but `result.coins` is added unconditionally every time). This matters a lot for
design decisions 3 and 4 below.

### A real technical blocker, found by testing it directly, not assumed

Every SaveManager mutator above calls `persistSave()` internally, and
`persistSave()` (`SaveManager.ts:210`) calls `localStorage.setItem(...)` directly.
**`localStorage` does not exist in a plain Node/`tsx` process** — confirmed with
`node -e "console.log(typeof localStorage)"` → `undefined`, and `npx tsx -e` → same.
`SaveManager.test.ts` only works because of a per-file `// @vitest-environment
happy-dom` pragma (line 1) that vitest applies *only inside its own test runner* — it
does not apply to a standalone script run the way `pnpm sim`/`pnpm balance` are run
today. Calling any SaveManager mutator from a new `tools/campaign-simulate.ts` script
would throw `ReferenceError: localStorage is not defined` on the first purchase.

**Fix (mechanical, not a design choice — the only alternative is reimplementing shop
math in parallel, which the project's own rules already rule out):** define a small
in-memory `Map`-backed shim (`getItem`/`setItem`/`removeItem`) and assign it to
`globalThis.localStorage`. **Correction on ordering**: static ESM `import` statements
are hoisted and all evaluate before any module-body code runs, so "assign it before
importing SaveManager" as a same-file instruction doesn't actually control execution
order the way it sounds like it does. It works anyway only because `SaveManager.ts`
touches `localStorage` exclusively inside function bodies (`persistSave`, called at
call-time, not at module-load time) — confirmed by reading the file, no module-scope
access exists. State that explicitly rather than relying on file position, or put the
shim in its own file and `import` it first (import order across *separate* files does
run top-to-bottom, unlike statements within one file) so a future edit that adds any
module-scope `SaveManager` code doesn't silently break this.

## Design decisions requiring confirmation

This is where the plan needs your input before anything gets built — these are
judgment calls about what "new player" actually means, not mechanical questions.

### 1. Purchase policy — the central decision, everything else is secondary

What does the simulated player actually buy, and when? Two candidate archetypes,
proposed as a *pair* to run side by side (mirroring the existing balance-sweep
pattern of always running `greedy` and `random` together rather than picking one):

- **"Informed saver"**: after every mission (win or lose), check
  `tools/loadoutPresets.ts`'s existing `intendedLoadoutForMission(nextMissionId)` —
  the exact table GAME_DESIGN.md §13 already defines as "what gear you should have by
  this mission" — and spend toward buying whichever piece of that target loadout is
  currently missing and cheapest, saving up if unaffordable. This reuses an artifact
  already validated this session rather than inventing new purchase logic. **Two real
  gaps in reusing it as-is, found by reading it directly (`tools/loadoutPresets.ts:79`,
  `INTENDED_LOADOUT_LEVELS` at line 63):**
  - It only defines targets for **4 of the 9 systems** (weapon/shield/generator/motor
    levels, always kind-index 0) — ship, rear weapon, side weapon, supplies, and
    subscription tier are all hard-set to none/default/fixed regardless of mission. An
    "informed saver" driven by this function alone would never buy 5 of the 9 systems;
    either extend the table or have this archetype fall back to the impulse-spender
    rule for the systems it doesn't cover.
  - `INTENDED_LOADOUT_LEVELS` only has entries for `m1`-`m6`. **It throws for any
    other mission id** — calling it with `nextMissionId = 't2'` (a completely normal
    "next unlocked mission" right after `t1`) crashes immediately. The purchase-policy
    step must skip calling this function for w0/t1-t4 (nothing to buy for a forced
    loadout anyway) rather than call it unconditionally after every mission.
- **"Impulse spender"**: after every mission, spend on whatever single affordable
  upgrade (across all **9** systems — 7 equip slots + supplies + subscriptions) is
  *cheapest* right now, no target in mind. Models a player who buys as soon as they
  can rather than planning ahead — the plausible worst case for "arrives undergeared
  because they spent on the wrong thing." A subscription upgrade competing on raw price
  against, say, a cheap motor upgrade is exactly the kind of "wrong thing" this
  archetype should be able to pick, since it changes the ability pool rather than a
  combat stat — this is why subscriptions can't be left out of either archetype.

**Confirmed by Tomáš (2026-07-10):** these two archetypes are sufficient for v1 — no
third archetype. **For the 5 systems `intendedLoadoutForMission` doesn't cover** (ship,
rear weapon, side weapon, supplies, subscription tier), **"informed saver" falls back
to the impulse-spender rule** (cheapest affordable upgrade, no target) rather than
extending the table with unvalidated per-mission targets nobody has specified in
GAME_DESIGN.md — inventing those targets is separate design work, out of scope here.
So "informed saver" is a hybrid: target-driven for weapon/shield/generator/motor,
opportunistic for everything else.

### 2. Combine with existing card-pick strategies?

`greedy`/`random` (card picks during combat) already exist and are orthogonal to the
purchase-policy question above. Should the campaign sim cross both axes (2 purchase
policies × 2 card strategies = 4 archetype combos, mirroring balance-sweep's existing
loadout×strategy matrix), or fix card-picks to `greedy` only and vary just the
purchase policy? Crossing both is more thorough but doubles+ the compute for what
might be a secondary effect compared to purchase decisions.

**Confirmed by Tomáš (2026-07-10): fix card-picks to `greedy` only.** This project
already treats `greedy` as the realistic-player proxy everywhere else — it's the
strategy `INTENDED_CLEAR_RATE_FLOOR` checks against. Combat card-picking is already
covered by the existing per-mission balance tools; this plan's focus is purchase/
economy behavior, and crossing in `random` would dilute that signal for a secondary
axis. 2 archetypes total, not 4.

### 3. Farming/replay policy and mission route

**Missing from the first draft entirely — added after Fable's review flagged it as
decision-defining, not a minor gap.** The first draft's loop was "attempt next
mission, retry until win or patience cap," with no notion of going back to an easier
mission — but missions are freely replayable for coins even after clearing them, and
this is not incidental: GAME_DESIGN.md's own "player never stuck" philosophy treats
farming an earlier, easier mission as the game's actual escape hatch for an
undergeared player, not something to design around. `applyMissionResult` re-adds
`result.coins` on every single run of an already-cleared mission (only star dedup is
special-cased); nothing else limits it. The first draft's loop cannot represent the
single most obvious thing a real stuck player actually does: stop banging their head
on the next mission and go re-clear an easier one for coins instead.
Without a farming rule, the sim will systematically overestimate churn/stuck-rate,
making the game look harder than it is for a real player who has this option. Two
sub-decisions, both open:

- **Does either purchase-policy archetype ever farm, and under what trigger?**
  **Confirmed by Tomáš (2026-07-10): no farming in v1.** Ship the baseline simulator
  first; add farming as a follow-up enhancement if the baseline numbers suggest it's
  needed. **This means the report must state clearly that a no-farming baseline
  overestimates churn/stuck-rate** — real players have this escape hatch
  (`applyMissionResult` re-adds `result.coins` on every replay of an already-cleared
  mission, unconditionally), the sim doesn't model it yet, and any "stuck" numbers this
  version reports are an upper bound, not the real rate.
- **Mission route through the branching graph**: the unlock graph (above) lets
  tutorials (`t1→t2→t3→t4`) and `m1` unlock independently once `t1` is cleared — a
  simulated player could rush straight to `m1` after `t1`, or clear all four tutorials
  first (each pays coins with a ~100% clear rate, effectively free farming before the
  real economy even starts). **Confirmed by Tomáš (2026-07-10): clear all four
  tutorials before attempting m1.** Free coins with no downside, and the simpler route
  to implement (no branching decision needed in the mission-attempt loop).

**Because farming is off in v1, decision 4's patience cap keeps its original, simple
definition** ("N losses in a row on the same mission = stuck") rather than the
farming-aware variant this section originally worried about — that complication only
applies once farming exists as an alternative to retrying blindly.

### 4. "Stuck" / player-patience cap

Since retries are free and unlimited, an uncapped simulation would eventually
succeed at *every* mission given enough attempts, making "did they finish" a
trivial always-yes and hiding the actual risk (a real player quits after some
number of losses, even though the game itself never stops them). Need a concrete
**patience cap** — if a simulated player loses the same mission N times in a row
without a successful clear, the campaign is marked stuck/churned at that mission and
stops. **Confirmed by Tomáš (2026-07-10): N = 8.** This is a product judgment about
realistic player patience, not something derivable from the code — treat it as a
reasoned choice, not a precisely computed one.

**Grounding used to pick it**: this session's final greedy-strategy clear-rates
against each mission's own real target — m1 86.0%, m2 87.3%, m3 77.8%, m4 81.6%, m5
89.0%, m6 85.8% — give an *expected* number of attempts to first-clear (1 / clear-rate)
under intended-loadout play: roughly 1.16-1.29 attempts for every mission, worst case
m3 at ~1.29. At N=8, even the worst intended-loadout mission has a ~0% chance of a
well-geared player hitting the cap purely from bad luck ((1-0.778)^8 ≈ 0.0004%), while
still being tight enough to flag a genuinely undergeared player (lower real clear-rate
than the intended-loadout baseline) within a realistic patience window rather than
letting the sim retry indefinitely.

### 5. What gets reported

**Confirmed by Tomáš (2026-07-10): all 5 proposed metrics, as-is.**
- Overall completion rate: % of simulated campaigns that clear m6 before hitting the
  patience cap on any mission.
- Per-mission retry-count distribution (mean/median/p90) — which missions make a new
  player retry the most, even among campaigns that eventually succeed.
- Churn-point histogram: among campaigns that got stuck, which mission did they get
  stuck at, and how often?
- Cumulative real-world playtime distribution to reach m6 — this is the actual,
  finally-real answer to "finish the game in an hour" (`GAME_DESIGN.md` §13's target
  table), which every other pass this session could only estimate from single-mission
  `avg-duration`, never a full campaign. **Compare this against the right number**: the
  sim can only measure combat time (mission-run duration), never shop/planning time —
  GAME_DESIGN §13's breakdown (line 581) is explicit that the 60-75 minute headline is
  **~50 min combat + ~20 min shop/planning**. Report against the ~50 min combat-only
  subtotal, not the full 60-75 min figure, or a campaign that's actually on-target will
  read as ~20 minutes short and falsely fail this check.
- Coin/star trajectory over the campaign (are there multi-mission stretches with ~0
  spendable coins — a "dead zone" that feels punishing even if the player eventually
  breaks through?).

### 6. Run size and where this lives

New file `tools/campaign-simulate.ts`, new script `pnpm campaign` (matches `pnpm sim`/
`pnpm balance` naming). **Per-mission-run cost corrected this pass — the first draft's
~240ms figure was wrong by roughly two orders of magnitude**, from misreading
`balance-sweep.ts`'s "500 runs per combo (~2 min)" comment as "500 runs total" instead
of what it actually means (500 runs × 48 combos ≈ 24,000 total runs in ~2 minutes).
Measured directly this pass with `time pnpm sim -- --runs 20000`: **~1.3ms per
mission-run** once the `tsx` process is warm, plus a one-time ~1.1s process-startup
cost paid once per `pnpm campaign` invocation, not once per campaign. A full campaign
at a patience cap of ~5-10 across ~11 missions is roughly 30-110 mission-runs, i.e.
**~40-150ms of actual simulation time per campaign** once warm — negligible next to
the fixed startup cost. Concretely: N=100 campaigns in one invocation ≈ 1.1s + 100 ×
0.1s ≈ **~11s total**; N=1000 ≈ **~1.5 min total**. This changes this decision's practical
guidance — a "quick check" can comfortably run several hundred campaigns synchronously
without `run_in_background`; reserve it for N in the low thousands or more. Following
this project's existing convention (`docs/plans/mission-design-and-testing.md` item 5B)
regardless: state the real default N chosen, and confirm the estimate above against an
actual timed run before trusting it at a much larger N — process overhead compounds
differently once purchase mutations and `abilityPoolForLoadout` recomputation are added
per mission, not just raw `runMission` calls.

**Confirmed by Tomáš (2026-07-10): default `pnpm campaign` run = 500 campaigns per
archetype (1000 total across the 2 archetypes); thorough pass = 5000 per archetype,
documented as the flag to reach for when the quick numbers look borderline, run via
`run_in_background` per the established convention.** 500/archetype is fast enough
(well under a minute per the estimate above) to run synchronously by default without
thinking about backgrounding it, while still a meaningful sample for the retry-count
and playtime percentiles decision 5 reports.

## Complexity analysis

No loops over circles/locations/alerts/devices (not a notification system) — the
equivalent scaling here: N (simulated campaigns, 500 quick / 5000 thorough per
decision 6) × A (archetype combos — 2, fixed per decisions 1–2, not crossed with card
strategy) × M (~11 missions) × R (retries per mission, bounded by decision 4's
patience cap of 8) × existing per-mission-run cost (already O(ticks), unchanged). No
farming term — decision 3 confirmed farming is off for v1, so there's no extra
replay-run factor to bound. Nothing new is O(N²) — campaigns are independent,
stateless draws (each starts fresh from `defaultSave()`), so this parallelizes
trivially and needs no shared mutable state across campaigns, only across missions
*within* one campaign (the evolving save).

## Test plan

- [ ] `globalThis.localStorage` shim works: a purchase call (`switchItem`) followed by
  a `buildLoadout` call round-trips correctly with no crash, in a plain `tsx` run.
- [ ] `defaultSave()` → `buildLoadout()` produces a `LoadoutSnapshot` identical to the
  existing `STARTER_LOADOUT` constant (sanity check that the reused save-layer path
  matches the simulator's already-trusted starter loadout).
- [ ] One full campaign run (fixed seed) is deterministic: running it twice with the
  same seed and same archetype produces identical retry counts, purchases, and final
  outcome.
- [ ] `isMissionUnlocked` gating is respected: the sim never attempts a mission before
  completing at least one of its incoming-edge source missions in `MISSION_UNLOCK_EDGES`,
  verified by asserting the attempted-mission sequence respects the unlock graph above
  (and specifically that a mission unlocks on completion regardless of star count).
- [ ] Shop purchases never buy an item **or a subscription level** the player's
  current `totalStars(save)` doesn't meet — replicating hub.ts's
  `starsRequired > playerStars` lock check for both, since neither `switchItem`/
  `switchShip`/etc. nor `upgradeSubscription` enforce it themselves (see the callout
  above). Explicitly test that an impulse-spender-style purchase can't call
  `upgradeSubscription('sub-basic')` to reach Lv3 (★18 requirement) without 18 stars.
- [ ] `abilityPoolForLoadout` is recomputed from the current save immediately before
  each mission attempt, not once at campaign start or cached across a subscription
  change — verified by a test that upgrades a subscription mid-campaign and checks the
  next mission attempt's pool reflects it.
- [ ] Coin/star bookkeeping matches `applyMissionResult`'s real behavior exactly —
  losing a mission with kills still increases `save.coins`; winning a mission adds
  `completionCoins` once; replaying an already-cleared mission doesn't duplicate
  already-earned star ids (per the dedup logic at `SaveManager.ts:411`).
- [ ] `pnpm test` still green — no core/save logic changes, this is a new tool only.
- [ ] `pnpm lint` / `pnpm build:dry` clean on the new file.
- [ ] A real run, at the confirmed settings (2 archetypes, `greedy`-only, no farming,
  tutorials-first, N=8 patience cap, N=500 quick), produces a
  sensible report — spot-checked by hand against a couple of individual campaign logs
  before trusting the aggregate numbers.

## File hygiene

- New file `v2/tools/campaign-simulate.ts` only. No existing tool file is modified.
- The `localStorage` shim is a small, self-contained addition confined to this new
  file — not a change to `SaveManager.ts`, `persistSave()`, or any production save
  path. Flagged explicitly here so it's never mistaken for a "fix" to the real game.
- No hardcoded paths/credentials. No TODOs.
- `tools/balance-report.md`/`.json` gitignore question from the previous two passes
  is still open and still unrelated to this one.

## Checklist

**Design decisions**
- [x] Purchase-policy archetypes: informed-saver + impulse-spender, no third.
  Informed-saver falls back to impulse-spender's rule for the 5 systems
  `intendedLoadoutForMission` doesn't cover. Confirmed by Tomáš 2026-07-10.
- [x] Card-pick strategy: fixed to `greedy` only, not crossed with `random`.
  Confirmed by Tomáš 2026-07-10.
- [x] Farming/replay: off for v1 (report must flag this as an overestimate of
  churn/stuck-rate). Tutorial route: clear all four tutorials before m1. Confirmed by
  Tomáš 2026-07-10.
- [x] Player-patience cap: **N = 8** consecutive losses on the same mission. Confirmed
  by Tomáš 2026-07-10.
- [x] Reporting scope: all 5 proposed metrics, as-is. Confirmed by Tomáš 2026-07-10.
- [x] Default N: **500 campaigns/archetype quick, 5000/archetype thorough**. Confirmed
  by Tomáš 2026-07-10.
- [x] Test plan approved as written by Tomáš 2026-07-10 — no adjustment needed now
  that farming is off (no existing test-plan item referenced it).

**Guardrails**
- [ ] No `missions.ts`/`items.ts` balance number changes — this document is tooling
  only; any balance finding it surfaces is a separate follow-up plan
- [ ] The `localStorage` shim never leaks into or modifies production `SaveManager.ts`
- [ ] Campaign runs are deterministic per seed — no hidden reliance on wall-clock time
  or non-seeded randomness anywhere in the new tool

**Performance**
- [ ] Per-campaign cost estimated and stated before running any large N (~40-150ms/
  campaign once warm, per the measured estimate above — confirm against a real timed
  run before trusting it for larger batches, since purchase mutations and per-mission
  `abilityPoolForLoadout` recomputation aren't in that measurement)
- [ ] No O(N²) coupling between simulated campaigns; independent and parallelizable
- [ ] Anything beyond the quick default run via `run_in_background`, consistent with
  the established convention from the previous two passes

**Readability**
- [ ] New file follows the existing `tools/` structure and naming (flag parsing style
  matching `simulate.ts`/`balance-sweep.ts`, not a third parallel CLI-parsing pattern)
- [ ] Named constants for the patience cap and any other tunable, not magic numbers

**Testability**
- [ ] Every new function has a happy-path test plus the edge cases listed above
  (determinism, gating respected, bookkeeping correctness)
- [ ] No test relies on the real `localStorage` global outside the shim — verify the
  shim itself is exercised, not silently bypassed by an accidental vitest environment

**File hygiene**
- [ ] No hardcoded personal paths, usernames, or credentials
- [ ] No TODO/FIXME left untracked
- [ ] No production file touched except adding the one new tool

**CI**
- [x] `pnpm build:dry` passes
- [x] `pnpm lint` passes
- [x] `pnpm test` passes (383 tests, including 10 new for this tool)
- [x] A real `pnpm campaign` run at N=500/archetype, reviewed by hand (2026-07-10) —
  **the first run's "m4 is a churn point" reading (63.8%/59.8% completion) turned out
  to be three tool bugs, not a balance problem**, found and fixed the same day:
  1. informed-saver's targeted candidates competed against the 5 opportunistic ones
     in one combined "pick globally cheapest" pool — a 30-coin rear-weapon buy always
     outbid a 950-coin weapon upgrade, so the "informed" plan never actually executed.
     Fixed: targeted candidates are now exclusive while any are still missing.
  2. impulse-spender's literal "always buy globally cheapest" never once touched
     weapon/shield/generator/motor across a full campaign (confirmed: 0 of ~1780
     purchases across 100 campaigns) — those systems' second tier is pricier than an
     entire tier of rear-weapon/side-weapon/supplies. Fixed per Tomáš's confirmed
     choice: soft preference for the core 4 (buy the cheapest affordable core upgrade
     if one exists, else fall back to the opportunistic 5).
  3. `nextCatalogUpgrade` picked "next pricier item in the whole catalog," which
     interleaves *across* weapon/shield/etc. kinds (pulse-2=1050, then scatter-1=1200,
     then pulse-3=2300) — causing a shopper to hop into a fresh, level-1 weapon of a
     different kind instead of climbing their own kind's levels. Fixed: stays within
     the current kind until it's maxed, only switches kinds as a last resort.
  **Final, correct numbers**: informed-saver 99.8% completion, impulse-spender 99.6% —
  both clear m1-m5 in essentially one attempt (mean≈1.00 retries per mission) with
  retry pressure appearing only at m6, the final boss, as expected. The earlier
  "m4 churn point" finding does not hold up — GAME_DESIGN's own m1-m5 balance is
  solid for a full campaign under both archetypes.
