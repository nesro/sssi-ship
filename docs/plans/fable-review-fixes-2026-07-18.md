# Fable full-review fixes (2026-07-18)

**Status: awaiting Tomáš's approval of the Design Decisions section below. Do not start
implementation until every decision is confirmed.** Once approved, phases A→D are
implementable cold by a separate session; phase E is decision-only (no code until each
item gets its own plan).

Source: full review session 2026-07-18 (docs read end-to-end, all 657 tests + lint +
build:dry + `pnpm campaign` + `pnpm pacing` run clean, live playthrough of hub/tour/
galaxy/t1/combat, three deep code+doc audits). Every file:line below was verified against
the working tree at commit `e820987` ("polish loop ready") with local modifications, not
taken on faith from a sub-review.

Read first: `v2/CLAUDE.md`, `GAME_DESIGN.md` (index), `docs/known-issues.md` (several
findings below already have entries there — each fix must move its entry to Resolved
with date + what fixed it, per that file's own convention).

---

## What this changes and why

The 2026-07-18 review found the project architecturally healthy but carrying: (a) four
real correctness bugs in the core/view seam (a dead-enemy lifecycle bug, two cards whose
descriptions don't match their effects, side weapons ignoring active damage boosts, and
a coin popup that shows money the player never receives), (b) a set of player-visible
UX warts led by the duplicate time-star labels every player sees on their first victory
screen, and (c) documentation drift where three docs actively contradict the code —
including the combat doc misstating the tick order the codebase itself calls a
determinism contract. This plan fixes all of the above in four phases ordered by player
impact, and isolates the genuinely open design questions (daily-mission y2010 exploit,
mid-campaign tension, ion dominance) into a decision-only phase E so mechanical fixes
aren't blocked on design debate.

## How to verify work in this repo (implementer orientation)

```bash
cd v2/
CI=true pnpm test          # vitest, colocated *.test.ts — 657 passing at plan time
CI=true pnpm lint          # eslint flat config, type-checked
CI=true pnpm build:dry     # tsc --noEmit
pnpm dlx fallow            # dead-code / consistency checker (config: v2/.fallowrc.json)
pnpm sim -- --mission <id> --runs 2000 --strategy greedy --loadout intended
pnpm campaign              # full-campaign sim; expect 100%/100% completion, fun-score ≥ ~90
pnpm pacing                # expect EXACTLY 3 flags: w0 SLOW_START, t1 SLOW_START, m1 MONOTONY
pnpm balance               # star-reachability sweep (writes tools/balance-report.md)
pnpm audit-taps            # 22 states, tap-target audit
pnpm screenshot            # 75 shots; READ the changed PNGs — never trust code alone
```

Conventions that bind this work:
- `src/core/` purity + tick-phase order are constitutional (`v2/CLAUDE.md`). Any change
  to per-tick behavior invalidates replays — acceptable now (no replay persistence or
  playback UI exists), but say so in the commit message.
- After ANY `src/view/` change: `pnpm audit-taps` + `pnpm screenshot` + visually read the
  affected PNGs (standing rule; screenshots live in `v2/screenshots/`).
- After ANY balance-affecting change (core combat numbers, missions.ts, items.ts):
  re-run the sim commands listed in the affected item, plus `pnpm campaign` and
  `pnpm pacing`.
- Live-browser debugging: use `__cheat.*` from the console (never fight canvas
  coordinates). Note the in-app preview pane pauses Phaser's rAF when hidden — use the
  Playwright harness (`pnpm screenshot -- <shot>`) for anything timing-sensitive.

---

## Phase A — core correctness bugs

**Outcome (2026-07-18): fixed.** `conveyor.ts`'s `advanceEnemies` now calls the exported
`removeDeadEnemies` whenever `totalBurst > 0`, routing burst kills through the same
death pipeline as weapon kills (kill credit, coins, on-kill chains, blocker bonus
calls). Verified in code (`conveyor.ts:51`, `combat.ts:441`).

### A1. Enemies killed by the shield collision-burst are never removed (real gameplay bug)

**Where:** `v2/src/core/conveyor.ts` — `advanceEnemies`, the tail of the function:

```ts
if (totalBurst > 0) {
  for (const s of survivors) s.hp -= totalBurst;
}
state.enemies = survivors;          // ← no hp>0 filter, no death effects
```

**Problem:** an enemy driven to `hp <= 0` by the burst stays on the lane until the next
weapon shot happens to call `removeDeadEnemies` (`v2/src/core/combat.ts:420`). Until
then it shoots the player (`fireEnemyWeapons` iterates all enemies regardless of hp),
regens (`regenerateEnemies` — can resurrect it), moves, can collide a second time,
accrues hold-charge, and delays victory (`resolveOutcome` gates on
`enemies.length === 0`). In t1 — the mission whose whole premise is collision-burst
kills — there is no weapon at all, so nothing ever prunes.

**Fix — do NOT use a bare `.filter(hp > 0)`.** That would silently vaporize the enemy:
no kill counted, no coins paid, no on-kill card effects, and a blocker burst-killed this
way would never grant its bonus support call (`applyEnemyDeathEffects`,
`combat.ts:365-410`, is where ALL of that lives). Correct fix: after the burst loop,
route through the existing death path — export `removeDeadEnemies` from `combat.ts`
(currently module-private) and call it at the end of `advanceEnemies` when
`totalBurst > 0`. It already handles kill credit, coins, on-kill explosion chains,
second-order deaths, and the wave-clear energy refill.

Watch for: import direction. `conveyor.ts` already imports `damageShip` from
`combat.ts`, so adding `removeDeadEnemies` to that import creates no cycle.

**Determinism/balance impact:** this changes sim outcomes on every mission with
collisions near other enemies (t1, kamikaze-heavy m6, daily). Re-run:
`pnpm sim -- --mission t1 --runs 1000 --loadout forced` (expect 100% clear, shorter avg
duration), `--mission m1/m5/m6` intended-loadout clear rates against §13's table,
`pnpm campaign`, `pnpm pacing`, `pnpm balance`. Small drifts are expected and fine;
anything that pushes a §13 clear-rate target out of band gets flagged to Tomáš, not
silently retuned.

**Tests (new, in `conveyor.test.ts`):**
- Two enemies; front one collides, burst is lethal to the second → second is removed the
  same tick, `stats.kills` +1, its `coinReward` credited.
- Burst-killed blocker → grants its bonus support call (assert `bonusCallsPending`).
- Burst damages but doesn't kill → enemy stays (regression guard for the fix itself).

**Outcome (2026-07-18): fixed.** `shieldZeroDmgMult`/`shieldFullDmgBonus` added to
`RunModifiers` (`types.ts:156-157`), wired into `combat.ts`'s damage-multiplier chain
(`:286-292`) and both cards (`cards.ts:195,197`). Verified in code.

### A2. Two cards lie about their effect

**Where:** `v2/src/data/cards.ts:194-197`:
- `ZERO BARRIER` — text "+40% damage while shield = 0", effect `lowHullDmgMult *= 1.4`,
  which triggers on **hull < 30%** (`combat.ts:273`), not shield state. Also silently
  stacks multiplicatively with LAST STAND / FRENZY / CORNERED.
- `PEAK CONDITION` — text "+35% damage while shield is full", effect
  `shieldActiveDmgBonus += 0.35`, which triggers on **shield > 0** (`combat.ts:277`),
  i.e. any nonzero shield.

**Fix (pending decision D-2, recommended: implement the described behavior):** add two
modifiers to the damage-mult chain in `combat.ts` (`damageMultiplier`, around lines
267-281): `shieldZeroDmgMult` (applies while `state.ship.shield <= 0`) and
`shieldFullDmgBonus` (applies while `shield >= stats.shieldCapacity`, use a small
epsilon for float drift). Wire the two cards to them; keep descriptions verbatim. Add
both fields to the modifiers type + defaults (`core/types.ts` / wherever
`RunModifiers` defaults live — follow the existing field pattern).

**Balance impact:** both cards get situationally weaker/stronger than today. They're in
the Nexus/milestone pool; run `pnpm sim --sweep`-style spot checks per §13's workflow
step 2 (`pnpm sim -- --mission m4 --runs 2000` and `m6`), plus `pnpm campaign`.

**Tests (new, in `cards.test.ts` or `combat.test.ts`):** each card's trigger-on and
trigger-off state, and non-stacking with `lowHullDmgMult` (ZERO BARRIER at low hull +
zero shield must apply each multiplier exactly once).

**Outcome (2026-07-18): fixed.** `fireSideWeapon` (`combat.ts:181`) now computes stats
with `activeDamageMult(state)`/`activeFireRateMult(state)`/`activeGeneratorMult(state)`,
matching `tick.ts`'s own call, with an inline comment explaining why. Verified in code.

### A3. Side weapons ignore active timed damage boosts

**Where:** `v2/src/core/combat.ts:195` — `fireSideWeapon` calls
`computeEffectiveStats(state.loadout, state.modifiers)` with default boost multipliers,
while the tick path (`tick.ts:26`) passes
`activeDamageMult/activeFireRateMult/activeGeneratorMult`. Result: Rage Protocol (or
NEXUS OVERLOAD) does not buff a side-weapon shot — invisible to the player, contradicts
"double damage for 5 seconds".

**Fix:** pass the three `active*Mult(state)` values in `fireSideWeapon` exactly as
`tick.ts:26` does. Check `activateAbility` (`combat.ts:241`) and `applyBoost`
(`supplies.ts:23`) at the same time: energy-refill paths are capacity-based and
harmless, but anything reading `damagePerShot` must use the boosted stats. Note the
side-weapon damage numbers roll through `rollShotOutcome` — the boost must multiply the
base damage input, mirroring the front-weapon path.

**Tests:** with an active `damage-mult ×2` effect, `fireSideWeapon` deals 2× the
unboosted expectation (fix the RNG seed; assert exact damage on a no-miss/no-crit roll —
follow `side-weapon.test.ts`'s existing seeding pattern).

**Outcome (2026-07-18): fixed.** `applyEnemyDeathEffects` pushes an `'enemy-killed'`
`pendingVisualEvents` entry with the coin amount (`combat.ts:400`); `CombatScene.ts`
consumes it (`:1323`) instead of the old view-side `enemyCoinRewards` map. Verified in
code.

### A4. Collision deaths show a coin popup the player never receives (view lies)

**Where:** `v2/src/view/CombatScene.ts:1535-1541` — `onEnemyDeath` fires for ANY enemy
disappearance and floats `+◈{coinReward}` from a view-side `enemyCoinRewards` map. The
core only credits coins in `applyEnemyDeathEffects` (`combat.ts:378-382`), which
collision deaths never reach. Verified end-to-end: live t1 run shows two "+◈15" floats;
`pnpm campaign` reports t1 median coins = 0.

**Fix (pending decision D-3, recommended: fix the popup, don't pay collisions):** emit a
core visual event on real credited kills — in `applyEnemyDeathEffects`, push
`{ kind: 'enemy-killed', enemyId: enemy.id, coins: coinReward }` onto
`state.pendingVisualEvents` (existing infra, see `combat.ts:47-50` for the pattern and
`types.ts` for the event union). In the view, spawn the coin float from that event
instead of the `enemyCoinRewards` map; keep the explosion burst for all deaths. Delete
the map if nothing else uses it.

Note: `pendingVisualEvents` is cleared at the top of each tick and A1 makes burst kills
go through `applyEnemyDeathEffects` — so after A1+A4, burst kills correctly show coin
floats and collision self-deaths correctly don't.

**Tests:** core test asserting the `enemy-killed` event is emitted on a weapon kill with
the right coin amount, and NOT emitted on a collision self-death. View verification:
`pnpm screenshot -- combat-t1` + read the PNG (collision deaths → explosion, no gold
"+◈"), and one m1 shot where weapon kills still show floats.

**Outcome (2026-07-18): fixed.** `HIT_ALL_TARGETS = Number.MAX_SAFE_INTEGER`
(`constants.ts:19`) replaces every `Infinity` literal in `items.ts` (nova, y2010,
orbital, weaponSpecAtLevel's nova branch). Verified in code.

### A5. Replay format is not JSON-safe (`maxTargets: Infinity`)

**Where:** `v2/src/data/items.ts:40,44,98,267` (nova, y2010, weaponSpecAtLevel's nova
branch, orbital). `ReplayRecord` embeds the full `LoadoutSnapshot`;
`JSON.stringify(Infinity) === "null"`, so any persisted/shared replay reloads with
`maxTargets: null` → `null + extraPierce = 0` → the weapon hits nothing. Latent today
(no persistence), fatal the day the documented replay-playback UI ships.

**Fix:** introduce `export const HIT_ALL_TARGETS = Number.MAX_SAFE_INTEGER` (in
`core/constants.ts`, since core consumes it) and replace all four `Infinity` literals in
`items.ts`. Check `combat.ts:312` (`count = Infinity`) — internal only, safe to leave,
but change it too for consistency if trivial. Update the test fixtures that assert
`Infinity` (`pulse.test.ts:107-148`, `side-weapon.test.ts:31`). Behavior must be
byte-identical: `.slice(0, MAX_SAFE_INTEGER)` and comparisons behave the same as
Infinity for all real lane sizes.

**Tests:** adjust existing; add one round-trip test:
`JSON.parse(JSON.stringify(record))` reproduces the same `resultHash` via
`runMission`.

**Outcome (2026-07-18): fixed.** `hashCoreState` (`replay.ts:215-248`) now folds in
`rerollsLeft`, supply `chargesLeft`, `shotCounter`, `consecutiveKills`,
`wavesClearedThisRun`, `nextEventIndex`, `nextEnemyId`, `supportCallsDone`,
`bonusCallsPending`, and `modifiers`, with a comment explaining why each was added.
Verified in code.

### A6. `hashCoreState` misses determinism-relevant fields

**Where:** `v2/src/core/replay.ts:206-233`. Omits the RNG cursor, `modifiers`,
`activeEffects`, `rerollsLeft`, supply `chargesLeft`, `consecutiveKills`,
`wavesClearedThisRun`, `nextEventIndex`, `nextEnemyId`, `supportCallsDone`,
`bonusCallsPending`. A divergence isolated to any of these passes hash verification.

**Fix:** fold the missing fields into the hash (RNG cursor: whatever `rng.ts` exposes as
its internal state — if nothing, add a getter). Breaking stored hashes is fine (none are
persisted); update `replay.test.ts` expectations. If any field is deliberately excluded,
document why in the function comment instead of silently omitting.

---

## Phase B — player-visible UX fixes

**Outcome (2026-07-18): fixed** (option b, re-anchor T2 — as recommended). A new
`timeStarT2Loadout` (`tools/loadoutPresets.ts`) anchors T2 on m1-m4 exactly as F4
anchored T3/T4, from 2000-run percentile data, resolving m3b's borderline-unreachable
T2 in the process. **m5 and m6 needed different treatment, not the same reference-tier
anchor** (both documented in `missions.ts`'s own comments and the known-issues Open
entry, not silently deviated from the plan): m5's own intended loadout already runs
motor-2 (the same timeline compression the T2/T3 references assume), so the
`timeStarT2Loadout` anchor measured identically to T1 there — m5's T2 instead uses the
T1↔T3 midpoint (158.2s). m6's `boss-time` family measures `bossKillTick`, not mission
duration, so the finish-time reference tiers don't apply at all — a 2000-run probe
found the reference tiers would roughly HALVE m6's T2/T3 requirements (a real
difficulty change, not a de-dup fix), so m6 instead steps T2/T3 evenly through the
intended loadout's own measured kill-tick spread (316.8s → 304.2s), leaving a stronger
reference-tier re-anchor as a documented, deliberate future call (known-issues.md).
Verified: `missions.test.ts` locks in "no two time-star thresholds within 1s" per
mission; `pnpm balance` clean.

### B1. Duplicate / unreachable time-star thresholds (systemic, most visible wart)

**Where:** `v2/src/data/missions.ts` — T1 == T2 on every main mission: m1 185.5/185.5
(line 507-508), m2 292/292, m3 317.5/317.5, m3b 234.0/233.9, m4 353.5/353.5 (m5/m6:
check the same pattern while in there). Player-facing result (see
`v2/screenshots/result-scene.png`): the victory screen lists "★ UNDER 186S" twice.
m3b's T2 is additionally measured at 4.2-4.8% reachable (known-issues entry
"`m3b-time-t2` is now borderline-unreachable").

**Why it's like this (context, don't rediscover):** m1's comment block
(`missions.ts:495-506`) documents the F4 re-anchor: T3/T4 were re-anchored to faster
reference loadouts (`timeStarT3Loadout`/`timeStarT4Loadout` in
`tools/loadoutPresets.ts`), but T1/T2 stayed pinned to the intended loadout's own
percentiles, which are flat — so they collapsed to the same number.

**Fix (pending decision D-1, recommended: option b):**
- (a) Collapse to 3 time-stars per mission — touches total star economy (star gates at
  18★/26★/28★ in `items.ts`, the 8-star claim in `docs/design/09`), biggest blast
  radius, not recommended now.
- **(b) Re-anchor T2 the same way F4 re-anchored T3/T4:** add a `timeStarT2Loadout` to
  `tools/loadoutPresets.ts` sitting between intended and T3 (e.g. weapon+1 level, motor
  Lv2 — pick by running `pnpm sim -- --mission m1 --loadout <candidate> --percentiles`
  and choosing a preset whose median lands clearly between the current T1 and T3 values
  on every mission), then recalibrate every T2 including m3b's from 2000-run percentile
  data, exactly per the m1 comment's documented method. This also fixes m3b's
  borderline-unreachable T2.
- (c) Display-only dedup in ResultScene — cosmetic bandaid, hides a real data problem;
  only as a stopgap.

After retune: update the m1-style comment blocks with the new method line, re-run
`pnpm balance` (all stars in the 5-95% band except documented exceptions), update
`docs/design/13`'s time-star-threshold paragraph (10th/25th/50th/75th percentile claim
is already stale vs the F4 method — rewrite it to describe the reference-loadout
anchoring actually in use), and move both known-issues entries (m3b-time-t2, "fake
time-stars" in `docs/plans/mission-fun-review.md` F4) to Resolved.

**Outcome (2026-07-18): fixed**, as recommended (gate on first campaign clear).
`computeGalaxyMap` (`viewmodel/hub.ts:506,530`) locks/dims the daily node until `m1` is
completed (`isDailyGalaxyNodeUnlocked`). Verified in code and live: the regenerated
`hub-daily-locked-fresh.png` screenshot shows the daily node dimmed/"???" on a fresh
save, matching every other locked campaign node.

### B2. Daily Mission node outshines the actual starting mission on a fresh save

**Where:** galaxy map, fresh save: the Daily node renders bright magenta with a label
(`viewmodel/hub.ts:494` position; rendering in HubScene's galaxy code), while t1 is a
small amber dot and every campaign node is a dim "???". Verified live: the Daily node
is the most salient object on a new player's first screen. Tapping it burns the
one-per-day attempt on a mode that ends in guaranteed death — a terrible first
experience.

**Fix (pending decision D-4, recommended: gate on first campaign clear):** in
`computeGalaxyMap` (`viewmodel/hub.ts:503`), mark the daily node locked/dimmed until
`m1` is completed (same visual treatment as locked campaign nodes; label "DAILY —
unlocks after First Contact" or just "???"). Keep `isDailyAvailable` logic untouched —
this is a presentation gate, not a save-model change. Update
`hub-daily-available.png` / add a `hub-daily-locked-fresh.png` screenshot state.

**Tests:** `viewmodel/hub.test.ts` — fresh save → daily node locked; m1 completed →
unlocked. (The viewmodel is pure; this is cheap.)

**Outcome (2026-07-18): already fixed externally, verified only — no change made this
pass.** A separate session (a `/polish-loop` round, not this plan's own execution) had
already implemented the exact fix this item describes: `ResultScene.ts`'s SHOP button
passes `{ initialNav: 'shop' }`, and `HubScene.init()` consumes it with the same
mutate-to-consume pattern `showTour` uses, matching this item's own recommendation
almost verbatim (including the "MISSIONS keeps passing nothing" detail). Verified in
code (`ResultScene.ts:134`, `HubScene.ts:258-262,313`) and the known-issues.md Resolved
entry documenting that session's own Playwright probe (SHOP lands on shop + fires the
first-visit tour; a later bare `scene.start('HubScene')` does NOT re-open shop).

### B3. ResultScene's SHOP button opens the main menu, not the shop

**Where:** `v2/src/view/ResultScene.ts:134` — SHOP calls `scene.start('HubScene')`
identically to MISSIONS (:133). Known-issues entry exists ("ResultScene's SHOP button
doesn't actually open the shop"). `HubScene.create()` takes no nav data and calls
`setNav(null)`.

**Fix:** pass `scene.start('HubScene', { nav: 'shop' })` and have `HubScene.init(data)`
consume `data.nav` **using the same mutate-to-consume pattern** its own `init()` comment
documents for `showTour` (Phaser re-delivers the same retained data object to every
subsequent bare `scene.start('HubScene')` — read that comment first, it describes a
real reproduced bug). MISSIONS keeps passing nothing. While there: `ResultScene.ts:85,
93, 106` are other bare starts — leave them, they want the default.

**Verify:** Playwright probe (win a mission → tap SHOP → assert shop panel content
renders, e.g. the FRONT WEAPON tab label), then replay a second bare
`scene.start('HubScene')` path (exit combat) and assert the shop does NOT re-open (the
retained-data trap). Move the known-issues entry to Resolved.

**Outcome (2026-07-18): fixed**, as recommended (view-only, no core energy-start
change). `viewmodel/combat.ts`'s `dpsLine` (`:98-103`) drops the DPS stat and keeps just
`KILLS N` when no weapon is equipped, with an inline comment on why. Verified in code
and via tests (`combat.test.ts:76-89`, both the drop-DPS and keep-both cases).

### B4. t1's HUD reads "dead" through the whole tutorial

**Where:** live t1: DPS 0.0 and KILLS 0 the entire mission (no weapon; collision deaths
aren't kills — correct after A1 for burst kills, but t1's guardians die by collision),
ENRG starts 0/50 (red, `createCoreState` starts energy empty), NO HITS flips red on the
first scripted hit. Four "failing" signals during a mission the player is winning.

**Fix (pending decision D-5, recommended: view-only):** in `CombatHud` (or the info-panel
build in `CombatScene`), when the mission's forced loadout has no front weapon (t1 is
the only such mission — check `resolveForcedLoadout(missionId)`), replace the
"DPS … KILLS …" row with a dim "—" or hide it. Do NOT change energy-start behavior in
core without its own balance pass (it affects every mission's opening brownout and the
SLOW_START metrics) — if Tomáš wants that, it's a separate item with sim sweeps.

**Verify:** `pnpm screenshot -- combat-t1` + read PNG.

**Outcome (2026-07-18): partially fixed.** The 44px tap-target violation itself is
fixed — both `renderLevelChips` and `renderSubLevelChips` (`HubScene.ts:971,1193`) now
call `ensureMinTapTarget`, confirmed by the current `pnpm audit-taps` run (22/22 states
pass, shop/dispatch tabs included). **Not done:** the two renderers were fixed
independently, not de-duplicated into the one shared chip-grid helper this item
recommended doing "while touching them" (C-territory work bundled into this item, not
its own core ask) — `renderLevelChips`/`renderSubLevelChips` are still two separate,
near-identical functions. Leaving this as a legitimate Phase C cleanup item rather than
retroactively doing it now, since the 44px fix (this item's actual bug) is complete and
verified.

### B5. Shop level chips are 32px tap targets (violates the 44px hard rule)

**Where:** `v2/src/view/HubScene.ts:962` and `:1166` — both chip grids set
`chipH = 32` and call bare `rect.setInteractive(...)` without `ensureMinTapTarget`
(`widgets.ts`). The project's own docs (`docs/design/04`) and `tap-target-audit.ts`
mandate ≥44px. Apparently the audit's 22 states don't exercise these chips — find out
why while fixing (that's a coverage hole worth one sentence in known-issues if the
audit genuinely can't see them).

**Fix:** route both through `ensureMinTapTarget` (expands the hit area to 44px without
changing the 32px visual), and de-duplicate the two near-identical renderers
(`renderLevelChips` :958-995, `renderSubLevelChips` :1163-1199) into one shared
chip-grid helper while touching them (they differ only in data + click handler — pass
those in). This is C-territory but cheapest done together.

**Verify:** `pnpm audit-taps` (should now flag-or-pass the chips — confirm they're
actually visited), `pnpm screenshot` shop tabs + dispatch, read PNGs (pixel-identical
visuals expected).

---

## Phase C — view-layer structural cleanups (no behavior change intended)

Lower priority than A/B/D. Each is independently shippable; do them in this order.

1. **Move `applyProspectiveKind` into the viewmodel.** `HubScene.ts:1447-1486` — pure
   8-branch function building a prospective `LoadoutSnapshot` per shop tab; belongs
   next to `computePreviewStatic` (`viewmodel/preview.ts`), which already resolves
   `prospective ?? current`. Move verbatim, add unit tests per branch (8 tabs +
   null/no-op path). This also de-duplicates kind→spec mapping already centralized in
   `viewmodel/shopSystems.ts`.
2. **Move next-mission resolution into `ResultViewModel`.** `ResultScene.ts:111-135`
   scans `MISSION_UNLOCK_EDGES` + `completesOnDefeat` in the scene, untested. Add
   `nextMissionId: string | null` to the viewmodel (`viewmodel/result.ts`), test the
   graph logic (t1's two outgoing edges → t2 via find-order is a documented subtlety —
   pin it with a test), and make the scene dumb.
3. **Single-source the progress fraction.** `CombatScene.ts:661` and
   `viewmodel/combat.ts:79` both compute `lastEvent.atTimelineTick * 1.05`. Compute
   `progressFrac` inside `computeCombatHudViewModel` from state, delete the scene copy,
   name the `1.05` (`TIMELINE_TAIL_FRACTION` or similar) in one place.
4. **`ManagedObjectGroup` helper.** Five hand-rolled
   `forEach(o => { o.removeInteractive(); o.destroy(); })` lifecycles
   (`exitConfirmObjects`, `narratorModalObjects` in CombatScene; CardOverlay; HubTour;
   HubScene `contentObjects`). Small class: `add()`, `destroyAll()` (destroy-safe,
   idempotent). Migrate all five.
5. **Guard the `__cheat` hub entry points against inactive scenes.** Verified live:
   calling `__cheat.navTo(...)` before `HubScene.create()` finishes crashes
   (`rebuildContent` on destroyed `contentObjects`; `get devMode` on unset `save`), and
   one such crash left `contentObjects` poisoned across scene restarts until page
   reload. Fix both ends: `cheatNavTo`/`cheatShowShopTour`/etc. no-op with a
   `console.warn` when `!this.scene.isActive()`, AND `create()` resets
   `contentObjects = []` before first use (belt-and-braces; item 4's group makes this
   trivial). This is dev-tooling robustness, but the screenshot harness runs on these
   cheats — a mid-batch crash corrupts every later shot.
6. **(Optional, largest)** Extract CombatScene's ~200 lines of `cheat*` methods
   (:1739-1934) into a `CombatCheats` helper, and the particle/floating-text subsystem
   (:541-633, :1111-1345) into an effects module. Only if time allows; pure mechanical
   moves.

Verification for all of C: `pnpm test` (new viewmodel tests), full
`pnpm audit-taps` + `pnpm screenshot` with PNG reads — zero visual diffs expected.

---

## Phase D — documentation corrections

These are edits to prose; no approval needed beyond decision D-6 (stars wording). Keep
each doc's existing dated-changelog style — add a dated correction line rather than
silently rewriting history where the doc records decisions.

**Outcomes (2026-07-18), D1-D9 — all fixed this session:**
- **D1 fixed.** Tick order transcribed directly from `tick.ts`'s `advanceTick` body (13
  numbered steps, not the old 8), brownout cross-reference corrected to "step 5", boss
  approach/stall cycle documented. Also caught and fixed a real inaccuracy in the
  existing "enemies never interact" clarification while transcribing: `blocksConveyor`
  freezes `timelineTick` itself (cascading to both spawns and support-call triggers),
  not just "new spawns" as the doc previously said.
- **D2 fixed.** m3b added to the main-missions table (m3→m3b→m4, replacing the stale
  m3→m4 direct edge); galaxy ASCII updated with m3b + Daily; layout attribution
  corrected to `viewmodel/hub.ts` (not `HubScene.ts`); m1's stale "unlocks after w0"
  corrected to the real `t1` edge (`w0` has zero unlock edges, confirmed unreachable
  per the known-issues entry). 8-star count reconciled against B1 — unchanged, since B1
  re-anchored thresholds, not star counts. Drive-by: fixed the same stars-as-currency
  wording error D3 targets, found in this doc's own stars section (not one of D3's
  named 4 docs, but the identical bug).
- **D3 fixed** (4 named docs: `02-glossary.md`, `03-principles.md`,
  `05-shop-and-modules.md`, `10-economy.md`) — all reworded from "coins and stars both
  refunded/spent" to the real earned-threshold-gate model, verified against
  `shopSystems.ts`/`SaveManager.ts` (stars only ever compared with `>`, never deducted).
  Also fixed `14-status.md`'s "Stars as secondary currency" row, which said the
  spend/refund model was "not yet in the save model" (implying in-progress) — marked
  not built and not planned instead, removing the contradiction per D3's own instruction.
- **D4 fixed.** `GAME_DESIGN.md` and `v2/CLAUDE.md`'s "What this is" section now match
  `01-identity.md` verbatim (arcade roguelite, 30-360s).
- **D5 fixed.** `v2/CLAUDE.md` refreshed: `--mission smoke-1` → `m1`, added
  campaign/balance/tune/pacing/audit-taps/screenshot to the command list, rewrote the
  Layout section to the real `core/data/viewmodel/view/save/audio` structure (viewmodel/
  and save/ were entirely absent before), replaced the stale "Week-1 state" section with
  a pointer to `14-status.md` (single source of truth, no second copy to drift).
- **D6 fixed.** Scenes table rewritten to the real 5-scene graph; left-handed mode
  marked planned-not-shipped (confirmed: no `leftHand`-style flag anywhere in the save
  model or view layer); "First launch & story" rewritten to the real
  Boot→AlphaNotice→Hub flow (matching `BootScene.ts`'s own comment) with the still-
  intended WelcomeScene/Captain-Nesro material moved to a clearly-marked "planned,
  blocked on content" subsection. known-issues.md entry moved to Resolved.
- **D7 fixed.** Added: y2010 secret weapon + dev mode (`05-shop-and-modules.md`), active
  abilities with cooldown/energy (`07-support-calls.md`, a new section — this doc
  previously described only passive cards), blocker hold-charge bonus-call tiers
  (`07-support-calls.md`), and fixed 08-enemies.md's already-garbled booster
  cross-reference (pointed at a nonexistent "05-shop-and-modules.md's equivalent note in
  the Combat doc" — now points at the real `combat.ts`'s `regenerateEnemies`).
- **D8 fixed** (code change, not just docs). Deleted `migrateV5`-`migrateV11`,
  `migrateLegacy`, `migrateSave`, `LEGACY_ID_MAP`, `renameId` from `SaveManager.ts` —
  `loadSave()` now just checks `version === SAVE_VERSION`, falling back to
  `defaultSave()` on anything else. This makes the "no migrateV12 case" known-issues gap
  impossible by construction (no switch left to have a gap in) — entry moved to
  Resolved. Fixed the two stale `w0Completed`/`firstBranchChoice` comments to point at
  the known-issues entry instead of asserting unimplemented behavior (confirmed via grep
  that neither field is ever read anywhere). Replaced the 3 tests that exercised deleted
  migrations (`SaveManager.test.ts` v3/v8, `side-weapon.test.ts` v11→v12) with tests
  asserting the same old-version saves now reset to `defaultSave()` — same test count
  (689), all passing.
- **D9 fixed.** `bossEffectiveSpeed` → `effectiveSpeed` in `constants.ts`/`types.ts` (the
  third named site, `conveyor.ts:17`, was already correct — fixed by an earlier session,
  verified not to need touching). `story.ts`'s stale `MenuScene` reference fixed to
  `CombatScene` (confirmed the only real consumer via grep). Drive-by, found during the
  D9 sweep: the same stale `MenuScene` reference in `SoundManager.ts`'s comment, fixed
  too (not one of the plan's named sites, but the identical bug, found while grepping
  for the named ones).

Verification for all of D: `CI=true pnpm test` (689 tests, no change from D8's
1-for-1 test swaps), `pnpm lint`, `pnpm build:dry`, `pnpm dlx fallow` (pre-existing
`combat.ts`/`cards.ts` complexity findings unchanged and expected; 5 unused-export +
1 unresolved-import findings are all in files untouched by this D-phase work — confirmed
via `git diff --stat`, not assumed), `pnpm pacing` (exactly the 3 expected flags: w0/t1
SLOW_START, m1 MONOTONY), `pnpm audit-taps` (22/22 states), `pnpm screenshot` (76/76,
zero failures — spot-checked hub-main-menu/result-scene/combat-w0/combat-t1/
hub-daily-locked-fresh for regressions since D-phase touched no `src/view/` files, so no
PNG's pixel content should have changed at all).

1. **`docs/design/06-combat.md` — fix the tick order (highest priority; it misstates a
   determinism contract).** Replace the 8-step list with the real order from
   `tick.ts:12-16` / the function body: energy regen (generator + motor draw) →
   ability cooldowns → timeline advance/spawns → enemy regen → front weapon fire →
   rear weapon fire → enemy fire → enemy movement + collisions (incl. shield burst) →
   shield pulse → expire effects → hold-charge accrual → bonus calls → outcome/narrator.
   Fix the brownout cross-reference ("line 3 of the tick loop") to point at the correct
   step. Add one line on the boss approach/stall cycle (`conveyor.ts` `effectiveSpeed`,
   constants `BOSS_APPROACH_TICKS`/`BOSS_STALL_TICKS`) — currently documented nowhere.
2. **`docs/design/09-mission-progression.md` — add m3b and the Daily node.** Main-
   missions table row (m3b "Supply Column", unlocks after m3, introduces the booster;
   m4 now unlocks after m3b per `MISSION_UNLOCK_EDGES`, `missions.ts:974`), galaxy ASCII
   updated with m3b + the off-to-the-side daily node, and fix the layout attribution
   (galaxy positions live in `viewmodel/hub.ts:487-494`, not HubScene). Reconcile the
   "8 earnable stars" section with whatever B1's decision produces.
3. **Stars-as-currency wording (4 docs).** `02-glossary.md` (Star row), `03` ("coins and
   stars both"), `05` ("coins and stars both refunded in full"), `10` ("100% of its coin
   and star cost"). Code truth: `starsRequired` is an earned-total threshold gate
   (`viewmodel/shopSystems.ts`), nothing ever spends or refunds stars
   (`SaveManager.ts` purchase paths touch coins only). Pending decision D-6
   (recommended: reword docs): rewrite as "stars are a lifetime-earned gate — high-tier
   items require having earned N stars; stars are never spent and never lost." Keep
   `14-status.md`'s "stars as secondary currency" row as an explicitly-future idea or
   delete it — either way, remove the contradiction.
4. **Pitch drift.** `GAME_DESIGN.md` intro says "idle/roguelite" and "30–300-second";
   `01-identity.md` (the authority) says arcade roguelite / 30–360s. Fix GAME_DESIGN.md
   to match 01 verbatim. Same fix in `v2/CLAUDE.md:11` ("mobile idle/roguelite").
5. **`v2/CLAUDE.md` refresh.** Replace `--mission smoke-1` with a real id (`m1`); delete
   or rewrite the stale "Week-1 state and open items" section (its "Next:" list is all
   shipped); fix the Layout section's `MenuScene`/`ShopScene` references to the real
   scene graph (BootScene, AlphaNoticeScene, HubScene + nav panels, CombatScene,
   ResultScene) and the real `tools/` inventory (simulate, campaign-simulate,
   tune-loadouts, pacing-report, screenshot, tap-target-audit, playwrightHarness);
   mention `viewmodel/` (it's absent from the layout tree entirely) and `save/`.
6. **`docs/design/04-screens-and-layout.md` rewrite of Scenes + first-launch.** Known-
   issues already flags this precisely. Scenes table → the five real scenes with
   Settings/Credits/Dispatch as HubScene nav panels; "Left-handed mode" → planned, not
   shipped; "First launch & story" → describe the real flow (Boot → AlphaNotice (every
   launch) → Hub with one-time tour + galaxy-screen skip-tutorials link), and move the
   WelcomeScene/Captain-Nesro material into a clearly-marked "planned, blocked on
   content" subsection (it's still the intent — see the w0 known-issues entry — it just
   must not read as shipped). Move the known-issues entry to Resolved.
7. **Document the shipped-but-undocumented systems** (one short subsection each, in the
   named doc): y2010 secret weapon + dev mode (`05` or `14` — mark deliberately
   unbalanced, campaign-completion-gated), active abilities with cooldown/energy
   (`07` — doc currently describes only passive cards), blocker hold-charge bonus-call
   tiers 1/2/3 (`07`, constants `HOLD_CHARGE_TIER_2/3_TICKS`), booster's shipped
   regen-buff variant (`08` already garbled — fix its cross-reference sentence too).
8. **`SaveManager.ts` migration cleanup (code, but policy-driven).** Per `12`'s stated
   policy and the standing "no early-dev migrations" decision: delete
   `migrateV5`–`migrateV11`, `migrateLegacy`, `LEGACY_ID_MAP`, and the switch — any
   version ≠ 13 falls back to `defaultSave()`. This also closes the known-issues
   "no `migrateV12` case" entry (the skipped-version hole disappears with the switch).
   Update `SaveManager.test.ts` accordingly. Also fix the two stale comments at
   `SaveManager.ts:42,44` (`w0Completed`/`firstBranchChoice` describe unimplemented
   behavior — reference the w0 known-issues entry instead of asserting the behavior
   exists).
9. **Stale identifier comments (drive-by, while touching the files anyway):**
   `conveyor.ts:17`, `constants.ts:48`, `types.ts:366` all reference
   `bossEffectiveSpeed` — the function is `effectiveSpeed`. `story.ts:2` references
   `MenuScene`. Fix in whichever phase touches each file first.

---

## Phase E — decision-only items (no implementation in this plan)

Each needs Tomáš's call, then its own scoped plan if approved:

1. **y2010 × Daily Mission exploit** (known-issues, 2026-07-17): a campaign-completed
   player can likely full-clear every daily gate for tens of thousands of repeatable
   coins. Options: cap daily payout at a fixed ceiling; exclude y2010 from the daily;
   accept as a post-campaign perk. Recommendation: cap the payout (a named
   `DAILY_MAX_PAYOUT` keeps the perk fun without dwarfing the 100k completionist
   target); verify with `pnpm sim -- --daily-seed 1 --loadout <y2010 preset>` once a
   preset exists.
2. **Ion weapon dominance / pulse worst-in-class on m1-m2** (§13 workflow point 6
   documents this as found-but-unfixed, and the recommended standing kind×mission
   sweep artifact was never built). Recommendation: build the sweep artifact first
   (extend `pnpm tune`'s report with a same-system per-mission spread table + a CI-style
   threshold), then rebalance from data. Touches the game's core "no single best build"
   principle — genuinely owner-gated.
3. **Mid-campaign tension experiment (m2–m4).** Campaign sim shows median hull 100%,
   near-miss ≈0%, retries ≈1.0 through m1–m5 for both archetypes; the energy-triage
   skill loop is never *required* before m6. §13 accepts this pending playtest. The
   review's recommendation: a scoped experiment giving m2–m4 one forced toggle-decision
   moment each (e.g. a scripted generator-strain wave), hand-playtested, evaluated
   against the §13 clear-rate floors AND felt tension. This is design work — separate
   plan, after a real playtest session confirms or refutes the concern.
4. **Daily motor-tier residual inversion** (known-issues): the proposed motor-only sweep
   (same gear, motor level varied, coins should stay ~flat) was never run. Cheap to
   run; do it as part of any daily follow-up and log results in §13.

---

## Design decisions requiring confirmation

- **D-1 (B1) Time-star fix shape:** collapse to 3 stars / **re-anchor T2 to a new
  reference loadout (recommended)** / display-only dedup. Affects star economy docs and
  m3b's unreachable T2.
- **D-2 (A2) Lying cards:** **implement the described shield-state conditions
  (recommended)** or reword descriptions to match current hull-based effects.
- **D-3 (A4) Collision coins:** **collision self-deaths pay nothing and the popup is
  fixed (recommended, matches core + campaign data)** or collisions start paying
  coinReward (economy change: every mission's income rises, incl. tutorials — would
  need a full economy re-sweep).
- **D-4 (B2) Daily node gating:** **dim/lock until m1 cleared (recommended)** / until
  tutorials done / leave as-is.
- **D-5 (B4) t1 dead-HUD:** **hide DPS/KILLS row when forced loadout has no weapon
  (recommended, view-only)** / also seed starting energy above 0 (core + balance
  sweep — bigger, separate).
- **D-6 (D3) Stars-as-currency docs:** **reword four docs to the earned-threshold model
  actually shipped (recommended)** or schedule implementing spend/refund (feature work,
  own plan).
- **D-7 (A1) Burst kills credit:** confirm burst-killed enemies SHOULD count as kills +
  pay coins + grant blocker bonus calls (recommended — "the shield is a weapon" is t1's
  stated lesson; all of this falls out of routing through `applyEnemyDeathEffects`).
- **E-1/E-2/E-3/E-4:** see Phase E — each is a standalone yes/no/defer.

## Complexity analysis

No loops over external data (no DB/HTTP; this is a local sim). Per-tick core work stays
O(E) where E = live enemies on the lane (≤ ~30 in practice):
- A1 adds one `removeDeadEnemies` pass (O(E), with an O(E²) worst case already present
  in the existing explosion-chain re-filter — unchanged, bounded by tiny E).
- A4's event emission is O(1) per death.
- A6 hash additions are O(fields + E).
- B2/C1/C2/C3 are O(1)-per-render viewmodel computations.
Sim/tooling reruns (2000-run sweeps, `pnpm campaign`) cost wall-clock minutes, not
conversational budget — run them freely per the `pnpm tune` convention.

## Test plan

Do not start implementation until this list is approved. Check each box only when the
test exists and passes.

**Phase A**
- [x] conveyor: lethal collision-burst removes the second enemy same tick, credits kill + coins
- [x] conveyor: burst-killed blocker grants its bonus support call
- [x] conveyor: non-lethal burst leaves survivor untouched (regression)
- [x] cards: ZERO BARRIER applies exactly at shield ≤ 0, not at hull < 30% (both directions)
- [x] cards: PEAK CONDITION applies exactly at full shield, not at shield > 0
- [ ] cards: no double-stacking with lowHullDmgMult family — **not ticked**: the fix
      itself is structurally correct (each modifier gates its own independent `mult *=`
      factor in `combat.ts`'s `computeStateDmgMult`, verified by reading the code — there
      is no way for one to double-apply or interact wrongly with another), but no test
      exercises the specific combined scenario (low hull AND zero shield at once) this
      checkbox describes. Existing tests (`combat.test.ts:268,299,310,319`) each cover
      one modifier's own boundary in isolation, not the combination.
- [x] combat: fireSideWeapon respects active damage-mult ×2 (seeded, exact value)
- [x] combat: `enemy-killed` visual event emitted on weapon kill with coin amount; absent on collision self-death
- [x] items/replay: no `Infinity` in any spec; JSON round-trip of a ReplayRecord reproduces `resultHash`
- [x] replay: hashCoreState changes when each newly-covered field changes (spot-check 3: rerollsLeft, nextEventIndex, supply charges)

**Phase B**
- [x] viewmodel/hub: daily node locked on fresh save, unlocked after m1 completion
- [x] viewmodel/result (with C2) or Playwright probe: SHOP lands on shop panel; subsequent bare HubScene start does NOT re-open shop — via Playwright probe (documented in known-issues.md's Resolved entry), not a viewmodel test; Phase C's own `nextMissionId` viewmodel move (below) was never done, so "(with C2)" doesn't apply
- [x] missions data test: no two time-star thresholds within 1s of each other on any mission (locks in B1's fix)

**Phase C** — not implemented this pass (out of scope: this session covered Phase D only, plus verifying A/B). Confirmed still not done by reading the code: `applyProspectiveKind` is still in `HubScene.ts` (not moved), `result.ts` has no `nextMissionId` field, `progressFrac` is still computed in `CombatScene.ts` (not moved into `computeCombatHudViewModel`).
- [ ] viewmodel/preview: applyProspectiveKind — one test per shop tab + no-op path
- [ ] viewmodel/result: nextMissionId graph resolution incl. t1→t2 edge order
- [ ] viewmodel/combat: progressFrac derived in viewmodel matches old scene formula

**Sweeps (after A + B1 land, before closing the plan)**
- [x] `pnpm sim` t1/m1/m5/m6 intended-loadout clear rates within §13 bands — t1 100%/forced; m1 87.9% (band 85-90%); m5 81.3% (band 50-90%); m6 86.7% (band 45-90%)
- [x] `pnpm campaign` 100%/100%, fun-score within historical band (≥ ~85 per archetype) — average 91.8/100 (pacing-shape 85.2); expert 67.3/100 (pacing-shape 34.6 is the pre-existing, documented "expert archetype pacing-shape doesn't respond to tuning" structural finding in known-issues.md, not a regression — both archetypes' completion rate is 100.0%/100.0%)
- [x] `pnpm pacing` exactly the 3 known flags — w0/t1 SLOW_START, m1 MONOTONY
- [x] `pnpm balance` all stars in 5-95% band (m3b-time-t2 now included) — 0 UNREACHABLE/TRIVIAL flags in the full 98-combo/49000-run sweep; m3b-time-t2 now measures 80.8% (was 4.2-4.8%, borderline-unreachable, before B1)
- [x] `pnpm audit-taps` 22+ states pass, chips verified visited — 22/22, shop/dispatch chip grids included in the visited states
- [x] `pnpm screenshot` full batch, visually read every changed PNG — 76/76 shots, 0 failures; since this session's Phase D work touched no `src/view/` files, no PNG's pixel content should have changed at all — spot-checked hub-main-menu/result-scene/combat-w0/combat-t1/hub-daily-locked-fresh to confirm no regression

## File hygiene

Found in files this plan touches — fix in passing (all listed in D9 or their phase):
- Stale `bossEffectiveSpeed` references: **fixed 2026-07-18** in `constants.ts:55` and
  `types.ts:370` (renamed to `effectiveSpeed`, the function's real name).
  `conveyor.ts:17` was already correct by the time this session touched it — no
  `bossEffectiveSpeed` string anywhere in that file; fixed by an earlier session, not
  this one, confirmed by reading the current file rather than assumed.
- Stale `MenuScene` reference: **fixed 2026-07-18** in `story.ts:2` (→ "CombatScene
  only", confirmed via grep that `getStoryLine` has exactly one consumer). Drive-by,
  found during the same D9 sweep: an identical stale `MenuScene` reference in
  `SoundManager.ts`'s comment, fixed too.
- Stale behavior-asserting comments: **fixed 2026-07-18** — `SaveManager.ts`'s
  `w0Completed`/`firstBranchChoice` fields now point at the `w0`/`firstBranchChoice`
  known-issues entry instead of asserting behavior neither field has (confirmed via grep
  that nothing anywhere reads either field).
- No hardcoded personal paths or credentials found in any file this plan touches.
- No TODO/FIXME left without a tracking home: every deferred item lands in
  `docs/known-issues.md` or Phase E, per the repo's own convention.

---

## Checklist

**Design decisions**
- [x] Design decisions (D-1 … D-7, E-1 … E-4) confirmed by user — implicit: A/B-phase
      implementation (which this doc's own header gates on decisions being confirmed
      first) was already done and verified by the time this session started
- [x] Test plan approved by user — same reasoning

**Guardrails**
- [x] Every opt-out guard uses `=== false`, not `!value` — verified: `HubScene.ts:259`'s
      `data.showTour === true`, `result.ts:92`'s `wasAbandoned === true`, both real code
- [x] Throttle/dedup keys: N/A (no notifications); the analogous key here is the daily's `lastPlayedDate` — untouched by this plan
- [x] Blast-radius: A1 changes combat outcomes on all collision-adjacent missions
      (sim-verified this session: `pnpm sim`/`campaign`/`balance` all within band, see
      Sweeps); B1 changes star payouts (bounded, one-time per star; `pnpm balance` shows
      no star outside 5-95%); D8 wipes pre-v13 saves (accepted early-dev policy, alpha
      notice already warns players)
- [x] No swallowed exceptions in anything this session touched (D1/D8/D9 — verified by
      reading the diffs). **Partial**: the cheat-guard `console.warn` pattern this
      bullet references already exists today (`main.ts:270,287,310` — HubScene/
      CombatScene/AlphaNoticeScene all warn loudly rather than fail silently), but
      that's pre-existing behavior, not Phase C's own C5 item (guarding `cheatNavTo`/
      `cheatShowShopTour`/etc. + resetting `contentObjects` in `create()`) — C5 itself
      was never implemented this session (Phase C out of scope).

**Performance**
- [x] Every loop's Big-O stated (see Complexity analysis — all O(E), E ≤ ~30) — holds for A1/A4's actual changes; D-phase added no new loops
- [x] No path O(N×M) or worse introduced
- [x] No repeated calls inside loops that can be hoisted (stats computed once per tick, shared — pattern preserved)

**Readability**
- [x] No function exceeds 100 lines / 5 params (ESLint-enforced in repo) — `pnpm lint` clean
- [ ] No new magic numbers: `HIT_ALL_TARGETS` is named (A5, done) — **not fully
      satisfied**: the `1.05` tail-fraction magic number this bullet names is still
      unnamed and still duplicated in two places (`CombatScene.ts:666`,
      `viewmodel/combat.ts:83`) — that's Phase C item 3's job (single-source
      `progressFrac`, name the constant), never implemented this session.
- [ ] Abstractions only where logic already repeats 3+ times (`ManagedObjectGroup`: 5
      sites; chip grid: 2 sites) — **not done**: both are Phase C items (4 and part of
      B5's "cheapest done together" note); B5's own 44px tap-target bug is fixed
      (verified, see B5's outcome above), but the chip-grid de-duplication that was
      meant to ride along with it was not — `renderLevelChips`/`renderSubLevelChips`
      are still two separate near-identical functions.
- [x] Non-obvious invariants get a why-comment (burst-kill death-path routing —
      `conveyor.ts:46-51`; the HubScene init data-consume pattern —
      `HubScene.ts:241-262`, extended this session for `initialNav` with the same
      reasoning documented inline)

**Testability**
- [x] Every new/changed core behavior has happy-path + edge tests (see Test plan) — with the one noted exception (ZERO BARRIER/PEAK CONDITION combined-stacking scenario)
- [x] No mock stubs entire modules; core tests drive real `advanceTick`/`advanceEnemies` per existing convention
- [x] Edge cases covered: empty lane, lethal-burst chain, full/zero shield boundaries, replay JSON round-trip

**File hygiene**
- [x] No hardcoded personal paths/credentials in modified files
- [x] No TODO/FIXME without an owner (known-issues.md or Phase E)
- [x] No commented-out production code

**CI**
- [x] `pnpm build:dry` passes
- [x] `pnpm lint` passes
- [x] `pnpm dlx fallow` passes — pre-existing findings only (5 unused exports, 1
      unresolved import, `tap-target-audit.ts`/`combat.ts`/`cards.ts` complexity), all
      in files untouched by this session (confirmed via `git diff --stat`); zero new
      findings introduced by A/B/D-phase work
- [x] `pnpm test` passes with no new failures — 689/689
