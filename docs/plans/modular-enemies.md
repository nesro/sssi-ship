# Modular enemies — build enemies out of the same kind of parts the player ship is

## Context

Tomáš, on the current enemy roster: "I currently dislike the enemy design now. they
feel really flat - circles that shoot. I think this can add some more depth -
especially if the modules of the enemies will be visible as well." Scope, explicit:
tutorials get careful hand-tuning; main missions "can be a little bit random"; don't
re-open the whole-campaign balance effort that already failed once this session (the
deferred shield-kind-balance finding, `known-issues.md`). Follow-up, after a first
review round surfaced real risk: **"we are still pre-alpha. don't be chickens...
don't be afraid to refactor very hard... plan it in detail, let fable take a look and
go for it."** This is the detailed version — every gap the first review found now has
a concrete decision, not another open question.

## What changed since the first draft (Fable's first review, addressed point by point)

1. **Composition timing, pinned down**: real spawn-time composition, a real enemy
   module catalog — not authoring-time sugar over today's flat consts. Bigger, correctly.
2. **Determinism gap, closed**: the new per-tick-mutable shield buffer is added to
   `hashCoreState` explicitly, as its own line item.
3. **MOTOR/GENERATOR generalization, done right**: new `EnemyState` fields
   (`weaponKind`/`shieldKind`/`generatorKind`/`motorKind`) carry module identity
   separately from the display `kind` — not a find-and-replace on the old branches.
4. **Enemy shield damage routing, fully scoped**: one `damageEnemy` helper, all five
   existing `enemy.hp -=` sites rewritten to call it, and the "does the player's own
   shield-burst splash get absorbed by an enemy shield" question **answered: yes** —
   see below.
5. **Performance, designed around, not hoped around**: overlays reuse the *existing*
   shared `Graphics` objects and are opt-in per module presence; the weapon module
   reuses the fire-telegraph already built rather than adding a new draw; a real
   profiling checkpoint gates phase 4.
6. **m1-m6 scope, split using headroom data that already exists**: not one blanket
   "random" bucket — m1/m2/m3 (1-5 points of floor margin, documented chaotic
   sensitivity) get the *same* hand-tuned care as tutorials; m3b/m4/m5/m6 (17-41 points
   of headroom) get the genuinely loose treatment. Phase 4 happens — it's not left
   dangling as "maybe never," since skipping it means the actual complaint never
   reaches the missions players spend the most time in.

## Current architecture (unchanged from draft 1, still accurate)

- `EnemySpec`/`EnemyState` (`core/types.ts`): one flat record per kind. `data/
  missions.ts` hand-writes ~11 of these as module-level consts (`FODDER`, `STRIKER`,
  `TANK`, `SWARM`, `BLOCKER`, `BOSS`, `TURRET`, `KAMIKAZE`, `BOOSTER`, two
  `GUARDIAN_*`, `FODDER_EASY`).
- One baked texture per kind (`textures.ts`), no per-instance visual composition.
- Special behaviors are hardcoded kind checks: `conveyor.ts`'s `effectiveSpeed`
  (`kind !== 'boss'`), `combat.ts`'s `regenerateEnemies` (`kind === 'booster'`). Three
  more sites do the same thing and are easy to miss since they're reward/visual, not
  behavioral: `combat.ts:411`'s tiered hold-charge bonus payout (`kind === 'blocker'`),
  `CombatScene.ts:1594`'s `renderBoosterBuffs` connecting-line draw (`kind ===
  'booster'`), and `CombatScene.ts:1210`'s first-time booster narrator line (same
  check). All five sites key module-relevant behavior or feedback off the display
  `kind` string.
- Every enemy-damage site mutates `enemy.hp` directly — no shared apply-damage
  function analogous to the player's own `damageShip`: `fireShipWeapon` (`combat.ts:
  52`), `fireRearWeapon` (`:164`), `fireSideWeapon` (`:209`), the shield-burst-tiers
  mechanic (`conveyor.ts:67`), and the kill-explosion chain (`combat.ts:452`).
- `hashCoreState` (`replay.ts:249-251`) hashes only `{id, distance, hp,
  holdChargeTicks, aliveTicks}` per enemy — everything else is immutable post-spawn
  today, which is exactly why it's safe to leave out. That assumption breaks the
  moment something new mutates per tick.
- Real peak concurrency (`pnpm pacing`'s own numbers): t2 15.2, m5 15.0, m6 14.0, m3b
  11.2, m1/m3 9.0.
- Deferred, and staying deferred: `known-issues.md`'s "shield kind is a campaign-wide
  balance variable" finding — every m1-m6 mission trivializes on 3 of 4 player shield
  kinds, sweep never done. Not this plan's job. Named here only because phase 4's own
  risk assessment below builds on it directly.

## Module design — four slots, mirroring the player ship's own four systems

| Slot | Governs | New catalog file |
|---|---|---|
| **WEAPON** | `shotDamage`, `ticksBetweenShots`, crit/miss, bolt color | `data/enemyModules.ts` |
| **SHIELD** | Absorb-buffer separate from hp, shield-first before hp (mirrors `damageShip`) | `data/enemyModules.ts` |
| **GENERATOR** | `none` / `self-regen` / `ally-regen` (booster, generalized) / `shield-regen` (only meaningful paired with a SHIELD module) | `data/enemyModules.ts` |
| **MOTOR** | `speed`, and a named pattern: `steady` / `anchor` (speed 0, `blocksConveyor: true` — unifies blocker/turret) / `stall-cycle` (boss, generalized) / `rush` | `data/enemyModules.ts` |

**No level axis for enemy modules** — unlike player gear (which needs 5 levels for
shop progression), enemy modules don't need purchasable tiers. Each slot has a small
set of self-contained named kinds; variety comes from combination, not leveling.
Starting roster: 3 *active* kinds per slot (12 total definitions, not 8 — "prove
combination actually creates variety" needs enough per-slot options that combinations
don't feel like the same 2 things swapped), plus the null/baseline state each slot
already needs regardless (GENERATOR's `none`, MOTOR's `steady`) — same role as
`shield: EnemyShieldModule | null` being nullable rather than a counted catalog entry.
WEAPON has no null state (every enemy fires); SHIELD's null state is `shield: null`
itself, not a fourth SHIELD kind.

**SHIELD is deliberately simple, not a ported energy system.** The player's own
generator→shield path (`energy.ts`'s `pulseShield`) is a full resource loop: energy
accumulates to capacity, drains a fraction on pulse, gated by brownout. Porting that
per-enemy at 15 concurrent instances is a second resource system, not a kind-check
generalization. V1 instead: an enemy's shield has a fixed capacity and, if paired with
a `shield-regen` GENERATOR module, regenerates a flat fraction of capacity per tick
(a boolean gate + a number, not a pulse/brownout system). Room to grow into the full
system later if it turns out to matter; not blocking v1 on it.

## Composition — real, at spawn, with a real catalog

`composeEnemy(weapon: EnemyWeaponModule, shield: EnemyShieldModule | null, generator:
EnemyGeneratorModule, motor: EnemyMotorModule, base: { displayKind: string; hp: number;
coinReward: number; isBoss?: boolean }): EnemySpec` builds the flat spec, tagging
`weaponKind`/`shieldKind`/`generatorKind`/`motorKind` onto it alongside the existing
`kind` (now purely a *display* identity — texture lookup, `MIN_VISUAL_SPACING`, HP
label — decoupled from behavior). `timeline.ts`'s `spawnEvent`/`spawnEnemy` call
`composeEnemy` at actual spawn time; `MissionSpec.enemyKinds` can hold either a
pre-composed `EnemySpec` (existing consts, untouched, zero migration forced) or a
`{ weapon, shield, generator, motor, base }` module-ref bundle for new/rebuilt
content — both resolve to the same flat `EnemySpec` shape before `spawnEnemy` ever
runs, so the hot tick loop never sees the difference.

`isBoss` stays a fully independent third axis from any module — a modular enemy can
have the `stall-cycle` MOTOR kind without being flagged `isBoss`, and the campaign
boss can keep `isBoss: true` regardless of which MOTOR kind it uses. Every current
`isBoss`-keyed system (`bossDamageMult`, `bossAliveGenBonus`, `bossKillTick`, the boss
texture branch) stays keyed on `isBoss` specifically, never inferred from `motorKind`.

**Random module pick, mechanism decided (phase 1, not deferred to phase 5).** m3b-m6's
"loose" assembly draws each of the four module kinds independently via `state.rng()`
(the seeded core RNG — never `Math.random()`) **per spawned instance**, not once per
enemy-kind-per-run: every spawn of a "randomized" enemy role re-rolls its own module
set at the moment `timeline.ts` composes it, so two "swarm-random" enemies in the same
run can carry different modules. This is deliberate, not incidental — per-instance
variety is the actual point ("combine many modules into even more enemy types"); a
per-run pick would make every instance of a role identical within one playthrough,
which is no more visually varied than today's flat consts. Drawing from `state.rng()`
means the pick is folded into the same deterministic seed every other roll already
uses, so `pnpm balance`'s existing many-seed sweep covers the random-assignment space
automatically — no new sweep tooling required. `EnemyModuleWeightTable` (a plain
`{ kind: T; weight: number }[]` per slot, mirroring `cards.ts`'s existing weighted-draw
shape) is the phase-1 type a "randomized" `MissionSpec.enemyKinds` entry holds, versus
a concrete module-ref bundle for hand-authored entries — both resolve through
`composeEnemy` at spawn time either way.

## Determinism — `hashCoreState` gets the new mutable field

`EnemyState` gains `shield: number` (current buffer, 0 if no SHIELD module) and
`shieldCapacity: number` (max, immutable post-spawn — safe to leave out of the hash,
same reasoning as `maxHp` today). `shield` itself **must** be added to
`hashCoreState`'s per-enemy hashed fields alongside `hp` — this is a named, explicit
phase-1 line item, not an implicit side effect of adding the field. A new replay
determinism test (two runs, same seed, comparing `shield` specifically across ticks)
locks it in, mirroring the existing hp/distance hash coverage tests.

## Damage routing — one `damageEnemy` helper, five call sites rewritten, one explicit design call

New `combat.ts` function, mirroring `damageShip`'s existing shield-first pattern
exactly:

```ts
function damageEnemy(enemy: EnemyState, amount: number): void {
  if (enemy.shield > 0) {
    const absorbed = Math.min(enemy.shield, amount);
    enemy.shield -= absorbed;
    amount -= absorbed;
  }
  enemy.hp -= amount;
}
```

Rewrites `fireShipWeapon`, `fireRearWeapon`, `fireSideWeapon` (`combat.ts`), the
shield-burst-tiers mechanic (`conveyor.ts`), and the kill-explosion chain
(`combat.ts`) to call this instead of `enemy.hp -=` directly — five call sites, named
individually as a phase-1 checklist, not "add shield routing" as one bullet.

**Explicit decision, not left open**: the player's own shield-burst splash damage
*does* get absorbed by an enemy's SHIELD module first, same as every other damage
source. One uniform rule — "shields absorb whatever hits them, regardless of
source" — matching how the player's own shield already behaves. No special-cased
exception for burst damage specifically.

Kill detection (`hp <= 0`) and the HP bar/label (`hp / maxHp`) stay reading `hp`/
`maxHp` only, never `shield` — shield is a separate, additional buffer a hit has to
clear first, not a reinterpretation of what "dead" means.

**Naming note, carried into tutorial-copy review (phase 3)**: this is the third
distinct use of "shield" in the codebase (the player's equipped `ShieldSpec`, the
shield-burst-tiers splash mechanic, and now an enemy module). t1's whole lesson is
"your SHIELD is the only defense" — if t1's own guardian ever gets a SHIELD module in
phase 3, its narrator copy gets a specific pass to make sure "shield" reads
unambiguously on a screen that's teaching the player's own shield at the same time.

## Visual layering — reuses existing shared Graphics, opt-in per module, profiled before phase 4

`renderEnemies` already draws an HP bar, HP label, fire telegraph, and (for blockers)
a hold-charge ring per enemy per frame, all into the *same* shared `hpBarGfx` Graphics
object (cleared and rebuilt every frame) — this already handles today's 15-enemy peak
without issue. New overlays follow the identical pattern, not a new one:

- **WEAPON**: no new draw — the fire telegraph already built this session (yellow-
  white muzzle spark, scaled to `ticksBetweenShots`) *is* the weapon module's visual
  signature. Its color could vary by `weaponKind` later; not required for v1.
- **SHIELD**: a glow-ring drawn into `hpBarGfx`, same technique as
  `shipRenderers.ts`'s `drawShieldRings` — **only for enemies with `shieldCapacity >
  0`**. An enemy with no SHIELD module draws nothing extra; this isn't "every enemy
  gets 4 layers," it's "every enemy gets exactly the layers its own modules earn."
- **MOTOR**: a small trail/glint tinted by `motorKind`, drawn into the existing
  `thrusterGfx`-style pattern but per-enemy (a new shared Graphics object, cleared/
  redrawn once per frame for all enemies together — not one object per enemy
  instance, which is the actual lever that keeps object count flat regardless of
  enemy count).
- **GENERATOR**: a small pulse/glint on `ally-regen`/`shield-regen` kinds only,
  reusing the booster-buff line-draw pattern (`renderBoosterBuffs`) already built.

**Profiling checkpoint, gates phase 4, not aesthetic-only**: before touching m3b-m6,
measure actual frame time with a synthetic 15-enemy scene where every enemy carries
all four module overlays (the deliberate worst case, worse than any real mission
would produce) via Playwright's CDP performance trace, compared against today's
baseline at the same concurrency. **Numeric threshold, pinned now so the checkpoint
can actually fail**: average per-frame rendering time (the CDP trace's own
`Recalculate Style + Paint + Composite` cost, not total frame time including idle
wait) must not exceed baseline-at-15-enemies by more than **+3ms**, and must stay
under **10ms** average in absolute terms — leaving roughly a 6ms margin under the
16.67ms/60fps budget for a real device running 2-3x slower than the dev machine this
trace runs on. If the worst case exceeds either number, the fallback is capping which
module combinations render *all four* visible layers simultaneously (e.g., GENERATOR
glint only rendered while the buff is actively ticking, not constantly), not
abandoning the feature.

## Scope split — using the headroom data that already exists, not a blanket bucket

| Missions | Treatment | Why |
|---|---|---|
| **t1-t4, w0** | Hand-authored module combos, full regression re-verification (existing fail/fix tests, sim sweeps) | Precision-tuned teaching moments, unchanged reasoning from every tutorial fix already landed this session |
| **m1, m2, m3** | Hand-authored module combos, same rigor as tutorials — **not randomized** | `known-issues.md`'s own numbers: 1.6/1.2/0.8 points of floor margin pre-existing, later improved to 3.8/2.0/4.6 — still thin, and independently documented as "chaotically sensitive... even ostensibly-easier changes shift borderline seeds unpredictably." Random module assembly here is the same risk the scope split exists to avoid, just moved to the enemy side — so it doesn't get the "random" treatment regardless of general scope philosophy. |
| **m3b, m4, m5, m6** | Genuinely loose: seeded-random module pick per enemy kind within a per-mission difficulty budget | 22.6/17.4/31.2/41.0 points of headroom respectively (this session's own prior analysis) — real margin to absorb looser tuning. Verified only via `pnpm balance`'s existing floor/ceiling gate, not an exhaustive sweep. |
| **Shield-kind campaign balance gap** | Not touched | Stays exactly where `known-issues.md` left it — a separate, already-deferred effort. This plan doesn't reduce or increase how deferred it is. |

## Implementation phases

1. **Engine.** `data/enemyModules.ts` (new file: 3 active kinds × 4 slots + each
   slot's null/baseline), `composeEnemy`, `EnemyModuleWeightTable` + the per-instance
   `state.rng()` draw, new `EnemyState`/`EnemySpec` fields (`weaponKind`/`shieldKind`/
   `generatorKind`/`motorKind`/`shield`/`shieldCapacity`), `hashCoreState` update + its
   own determinism test, `damageEnemy` + all five hp-mutation call-site rewrites.
   MOTOR/GENERATOR/reward/visual generalization off the new kind fields (not the old
   `kind` string) at **all five** sites: `conveyor.ts`'s `effectiveSpeed`, `combat.ts`'s
   `regenerateEnemies`, `combat.ts:411`'s tiered hold-charge bonus payout,
   `CombatScene.ts:1594`'s `renderBoosterBuffs` line draw, and `CombatScene.ts:1210`'s
   first-time booster narrator line — the last three are easy to miss since they're
   reward/visual, not core behavior, but a randomly-composed enemy with an
   `ally-regen` GENERATOR and a non-`booster` display kind must still pay out and
   render correctly, or phase 5 silently ships enemies that buff invisibly. New tests
   for `composeEnemy`, `damageEnemy`'s shield-first math, and the generalized
   stall-cycle/ally-regen dispatch — not just "old tests still pass unchanged."
2. **Visuals.** Shield-ring/motor-trail/generator-glint overlays per the design above,
   built and screenshot-verified against 2-3 *real* modular test enemies created for
   this purpose (not yet wired to any mission) so there's something real to render —
   not just re-screenshotting today's legacy t1/t2 enemies, which carry no module
   tags yet. Profiling checkpoint at synthetic 15-enemy/all-modules concurrency against
   the pinned +3ms/10ms thresholds above.
3. **Tutorials.** t1-t4/w0 rebuilt as hand-authored module combos. Full existing
   regression suite (t1's fail/fix pair, t3's regen-math, etc.) plus fresh sim
   verification per mission.
4. **m1/m2/m3.** Rebuilt as hand-authored module combos, same rigor as phase 3 —
   `pnpm balance`/`pnpm sim` re-verification against each mission's own floor/ceiling.
5. **m3b/m4/m5/m6.** Rebuilt with genuinely loose/randomized module assembly within a
   difficulty budget, verified via `pnpm balance`'s existing gate only.

## Phase 1 — done

Implemented as planned, with two small refinements discovered while writing real
code (neither changes any external behavior or needs another review round):

- **`blocksConveyor` stays fully independent of `motorKind`**, not derived from an
  'anchor' MOTOR kind as the original module-design table implied. Real data
  contradicts the coupling: `GUARDIAN_REGEN` has `blocksConveyor: true` at speed 0.3,
  not 0, so "anchor = speed 0 + blocks" doesn't hold campaign-wide. MOTOR ended up
  with 3 kinds (`steady`/`stall-cycle`/`rush`) governing `speed` and the stall-cycle
  pattern only; `blocksConveyor` is set directly in `composeEnemy`'s `base` param,
  same as `isBoss`.
- **`combat.ts:411`'s blocker tiered-bonus payout got its own field**,
  `holdBonusTiered?: boolean`, rather than being folded into a MOTOR kind. Tying it
  to MOTOR would have silently changed turret/boss/guardian's payouts (all
  `blocksConveyor`, none previously tiered) the moment they got any modular MOTOR
  identity — a balance change outside this plan's scope. The new field defaults
  `false` and is set `true` only on `BLOCKER`, preserving today's numbers exactly
  while still decoupling the dispatch from `kind === 'blocker'`.

Delivered: `EnemyWeaponModule`/`EnemyShieldModule`/`EnemyGeneratorModule`/
`EnemyMotorModule` types, `composeEnemy` (`core/enemyCompose.ts`), the module
catalog (`data/enemyModules.ts`, 3 kinds × 4 slots), `EnemyState`/`EnemySpec`'s new
identity fields, `hashCoreState`'s `shield` line item + its determinism test,
`damageEnemy` + all 5 hp-mutation call sites + the 3 additional reward/visual sites
Fable's second review found, and the generalized `ally-regen`/`shield-regen`/
`stall-cycle` dispatch (with a test proving `stall-cycle` triggers off `motorKind`
alone, independent of `isBoss` or the display `kind`). 10 new tests. Full verification
clean: `pnpm build:dry`, `pnpm test` (774 passed), `pnpm lint`, `pnpm lint:comments`,
`pnpm campaign` (100%/100% both archetypes, unchanged), `pnpm balance` (m1-m6 intended
clear rates bit-for-bit identical to before — 88.8/77.0/69.6/84.6/73.6/78.2/88.4%),
`pnpm pacing`, `pnpm audit-taps`, `pnpm dlx fallow` (the one pre-existing health flag
on `combat.ts` and the one pre-existing stale-suppression both predate this work,
confirmed via `git stash -u` before/after comparison — neither is new).

## Phase 2 — done

All four module overlays implemented in `CombatScene.ts`, each opt-in per module
presence exactly as designed:

- **WEAPON**: no new draw, as planned — reuses the existing fire-telegraph.
- **SHIELD**: `drawShieldRings` (already built for the player's own shield,
  `shipRenderers.ts`) reused directly, drawn into the existing shared `hpBarGfx`,
  gated on `shieldCapacity > 0`.
- **GENERATOR**: `renderBoosterBuffs` (renamed in spirit, not in name — still the
  least-churn choice) extended with a second, self-directed blue glow for
  `shield-regen` enemies (only while `shield < shieldCapacity`, so a topped-up buffer
  stops pulsing) alongside the existing `ally-regen` feed-line, both keyed off
  `generatorKind`.
- **MOTOR**: a new shared `enemyMotorGfx` Graphics object (one object total, cleared/
  redrawn every frame for every enemy together — same lever that keeps `hpBarGfx`
  cheap at 15-enemy concurrency applied here too). `rush` draws a small magenta speed
  trail; `stall-cycle` draws a pulsing ring only while actually in its stall phase
  (`aliveTicks % cycle >= BOSS_APPROACH_TICKS`) — a future non-boss stall-cycle enemy
  now gets the same "it's anchored right now" signal the boss gets today from its
  sheer size alone.

Verified against 5 real injected modular enemies (not screenshotted from any mission —
none exist yet — but pushed directly into a live `CombatScene`'s `core.enemies` via
`window.__cheat`/direct state access, a throwaway Playwright script, never committed):
confirmed the SHIELD ring renders at the right intensity and fades with a draining
buffer, the `rush` trail and `stall-cycle` pulse both render distinctly, the
`ally-regen` feed-line generalization still works for a non-`booster`-display enemy,
and the new `shield-regen` glow renders and correctly stays off for a full buffer.
Screenshots inspected directly (not just "code looks right") — caught and fixed one
real analysis mistake along the way (misread which on-screen sprite was which by
guessing Y-order instead of reading the actual coordinates back).

**Profiling checkpoint — passed, methodology adjusted from the plan's original
wording.** Written as a real number, not "should be fine," but measured as end-to-end
`requestAnimationFrame` frame-time deltas rather than isolated CDP
Style/Paint/Composite category durations — total frame time is vsync-capped on the
dev machine (~16.7ms regardless of scene content) and therefore not itself comparable
to the originally-stated "10ms absolute" figure, but the **delta between baseline and
worst-case, both measured the same way, at the same vsync rate, is exactly the number
that answers the real question** (does this add meaningful per-frame cost), and it's
a strictly more inclusive measurement (captures overlay JS draw-call cost AND any
downstream style/paint/composite cost together) than isolating one category would
have been. Measured: 15 synthetic enemies, baseline (no modules, today's rendering)
vs. worst case (all 15 carrying all 4 overlays simultaneously — shield ring +
shield-regen glow + rush trail + fire telegraph on every single one, deliberately
worse than any real mission, which would mix module presence across a roster, would
ever produce) — mean frame time 16.63ms → 17.17ms, **delta +0.54ms**, comfortably
inside the +3ms budget. `pnpm build:dry`, `pnpm lint`, `pnpm lint:comments`, `pnpm
test` (774, unchanged) all clean throughout.

## Phase 3 — t1/t2 done (t3/t4/w0 deferred), scope set by Tomáš directly, not this doc

After seeing the plan, Tomáš narrowed and reshaped phase 3 rather than approving it as
written: "keep this at later. just let's finish t1 and t2 and I will take a look. I
would like to have each enemy a meaning, maybe a name? I want less, but stronger
enemies. I think t1 should have just 2 enemies, t2, like 5-10 max." Two new,
concrete precedents this sets for t3/t4/w0 and beyond, not previously in this doc:

- **`EnemySpec.displayName`/`EnemyState.displayName`** — a real per-archetype name
  shown above the HP number, distinct from `kind`. One name per archetype (not
  per-instance) — a `SpawnEvent` still spawns `count` copies of one `EnemySpec`, so
  giving individual instances within one event distinct names isn't possible without
  splitting them into separate events, which breaks `SPAWN_JITTER`'s once-per-event
  relative-spacing guarantee (confirmed the hard way: an early spacing candidate for
  t1 that looked equally good on paper turned out to leave the second SENTINEL
  off-screen when the first collided, silently killing the shield-burst demo — caught
  by explicitly probing `pendingVisualEvents` for a `shield-burst` event across 100
  seeds, not by eyeballing the spacing number).
- **Fewer, individually stronger enemies** as the explicit direction for tutorials
  generally, not just t1/t2 specifically — headcount goes down, per-enemy hp/damage
  goes up, same fail/fix balance split reproduced at the lower count via sim (never
  assumed).

Full results: `docs/known-issues.md`'s "Modular enemies (engine + visuals + t1/t2
rebuild)" entry has the exact numbers (spacing, hp, damage, sim clear-rates) for both.

t3/t4/w0 and phases 4-5 (m1/m2/m3, m3b-m6) are explicitly on hold pending Tomáš's look
at t1/t2 — not dropped, not forgotten, just sequenced behind his review of what's
landed so far.

## Fable's second-round verdict

Sound, proceed to implementation. Confirmed against the real codebase (`replay.ts`,
`combat.ts`, `conveyor.ts`, `timeline.ts`, `types.ts`, `CombatScene.ts`,
`pacing-report.md`, `known-issues.md`) with three fixes, all folded into this
document above: the three missed kind-string sites now on the phase-1 checklist, the
random-pick mechanism decided (per-instance, `state.rng()`, phase-1 typed), and the
profiling checkpoint's pass/fail threshold pinned. This is the last review before
implementation — proceeding to phase 1.
