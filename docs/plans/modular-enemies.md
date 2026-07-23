# Modular enemies — build enemies out of the same kind of parts the player ship is

## Context

Tomáš, on the current enemy roster: "I currently dislike the enemy design now. they
feel really flat - circles that shoot. I think this can add some more depth -
especially if the modules of the enemies will be visible as well." Follow-up
clarifying scope:

- Enemies should be composed from modules "the same as the player ship" — mix-and-match
  parts, not one flat stat block per named kind — and those modules should be **visibly
  distinct on the sprite**, not just internal stat differences.
- **Tune the tutorial missions (t1-t4, w0) carefully. Main missions (m1-m6) can be "a
  little bit random"** — an explicit, deliberate scope split, not a shortcut being
  smuggled in.
- **"Let's not focus on the balancing of the entire game. that failed."** — a direct
  reference to this session's own `docs/known-issues.md` entry ("shield kind is a
  campaign-wide balance variable that's never actually been validated"): sweeping every
  m1-m6 star threshold across every shield kind surfaced a huge, expensive-to-close gap
  that got explicitly deferred rather than chased. This plan is scoped from the start to
  not repeat that — build a solid, working base; extend the campaign's own precision
  later, deliberately, not as part of landing the base system.

## Current architecture (what "flat" means concretely)

- `EnemySpec` (`core/types.ts`): one flat record per kind — `hp`, `speed`, `shotDamage`,
  `ticksBetweenShots`, `blocksConveyor`, `coinReward`, `regenPerTick`, `critChance`,
  `missChance`, `critMult`, `isBoss?`. `data/missions.ts` hand-writes ~11 of these as
  module-level consts (`FODDER`, `STRIKER`, `TANK`, `SWARM`, `BLOCKER`, `BOSS`,
  `TURRET`, `KAMIKAZE`, `BOOSTER`, plus two `GUARDIAN_*` variants and a `FODDER_EASY`),
  reused verbatim across missions via each `MissionSpec.enemyKinds` map.
- **Rendering is one baked texture per kind** (`textures.ts`'s `buildEnemyTextures` /
  `textureForEnemyKind`) — a fixed silhouette painted once at boot, no per-instance
  visual composition. This is the literal "circles that shoot" complaint: every fodder
  looks identical to every other fodder, forever, regardless of what makes it
  mechanically different from a striker beyond color/shape chosen by hand.
- **"Special" behaviors are hardcoded kind checks, not data**: `conveyor.ts`'s
  `effectiveSpeed` special-cases `kind !== 'boss'` for the stall-approach cycle;
  `combat.ts`'s `regenerateEnemies` special-cases `kind === 'booster'` to redirect
  `regenPerTick` to the nearest enemy ahead instead of self-healing; `blocksConveyor` is
  a bare boolean, not a named behavior. Each new "special" enemy today means a new
  hardcoded branch somewhere in core, not a reusable, composable trait.

## Design: four module slots, mirroring the player ship's own four systems

The player ship is WEAPON / SHIELD / GENERATOR / MOTOR, each an independent kind+level
slot combined once per tick via `computeEffectiveStats`. Proposed: enemies get the same
four slots, with enemy-flavored kinds in each:

| Slot | What it governs | Existing player-side parallel |
|---|---|---|
| **WEAPON** | `shotDamage`, `ticksBetweenShots`, crit/miss, bolt color/size — reuses the fire-telegraph + bolt system already built this session | Front weapon |
| **SHIELD** | An optional absorb-buffer *separate from raw hp*, drained before hp the same way `damageShip` already routes shield-first for the player — new capability, not represented at all today. Visibly a glow-ring (reusing `shipRenderers.ts`'s shield-ring drawing, not a new pattern) | Shield |
| **GENERATOR** | Regen behavior: self-heal (today's `GUARDIAN_REGEN`), donate to nearest-ahead ally (today's `BOOSTER`, generalized off its hardcoded kind check), or — new, only meaningful paired with a SHIELD module — recharge that shield over time the way the player's own generator does | Generator |
| **MOTOR** | `speed` plus a named movement pattern: steady, patient-then-rush, the boss's stall/approach cycle (generalized off its hardcoded kind check), or "anchor" (speed 0, `blocksConveyor: true` — unifying blocker/turret's mechanic as a motor choice instead of a bare separate flag) | Motor |

This isn't a new taxonomy invented for enemies — it's the same four names the player
already has, reused. `blocksConveyor`, the boss stall-cycle, and the booster's regen
donation all fold into MOTOR/GENERATOR as named module *kinds* instead of scattered
`kind === X` branches — strictly less special-casing than exists today, not more.

## Composition, not a per-tick rebuild

`EnemySpec` stays a flat, resolved record — the shape `EnemyState`/combat/conveyor
already consume every tick — but gets built **once, at spawn**, from four module refs
(`{ kind, level }` each, exactly like `LoadoutSnapshot`'s own fields) via a new
`composeEnemy(weapon, shield, generator, motor): EnemySpec`. Nothing in the hot tick
loop changes shape or gets slower; only how the flat spec gets *authored* changes.

Additive, not a rewrite: existing hand-written consts (`FODDER`, `STRIKER`, etc.) stay
exactly as they are, valid `EnemySpec` objects — nothing forces every mission to
migrate on day one. New content opts in to `composeEnemy` where it's worth the
authoring cost; nothing breaks if a mission never does.

## Visual composition (the actually-requested part)

Layered rendering per enemy instance, not a bigger baked-texture table (a fixed
texture per kind × module-combo would combinatorially explode): a base body/chassis
image (silhouette by size tier, same baking approach as today) plus `Graphics`
overlays drawn per-instance from whichever modules that specific enemy has — a shield
glow-ring if SHIELD is present, an engine trail/glow colored by MOTOR kind, a small
weapon-tip marker colored by WEAPON kind, matching exactly how `shipRenderers.ts`
already layers the player's own gun/shield/thruster/generator indicators onto one base
ship image. No new rendering *pattern* — the same one, pointed at enemies too.

## Scope split, made concrete

- **t1-t4 and w0**: hand-authored module combinations, same care as every tutorial fix
  already landed this session (t1's spacing/burst-mode cliff, t3's regen-vs-damage
  math) — each tutorial's specific teaching moment stays load-bearing and gets
  re-verified against its own existing regression tests (`regen.test.ts`'s t1 fail/fix
  pair, etc.) before landing.
- **m1-m6**: allowed to be "a little random" — module combinations can be assembled
  more loosely (a small seeded-random pick within a per-mission difficulty budget,
  or simply hand-picked without the exhaustive floor/ceiling/star sweep every prior
  mission change this session got). `pnpm balance`'s existing floor/ceiling check still
  gates real breakage, just not chased to the same precision as tutorials.
- **Not in this plan at all**: re-opening the shield-kind campaign-wide balance gap.
  That stays exactly where `known-issues.md` left it — a separate, explicitly deferred
  effort, not something this change should touch or imply progress on.

## Implementation phases

1. **Engine only, no mission changes.** `core/types.ts`: add the module-kind types and
   `composeEnemy`. `conveyor.ts`/`combat.ts`: generalize the boss-stall and
   booster-regen hardcoded branches into MOTOR/GENERATOR kind checks (behavior-
   identical refactor, existing tests must still pass unchanged). Add the new
   shield-buffer mechanic to `combat.ts`'s damage routing (enemy-side mirror of
   `damageShip`'s own shield-first logic). Start with 2 kinds per slot — enough to prove
   composition and visuals work, not a full roster yet.
2. **Visual layering.** Extend `shipRenderers.ts`'s existing drawing functions (or add
   enemy-specific siblings reusing their exact technique) so `CombatScene.ts`'s
   `renderEnemies` draws per-instance module overlays. Screenshot-verify against t1/t2
   (already-touched missions this session) before any roster change.
3. **Tutorials rebuilt on the new system.** Re-author t1-t4/w0's enemies as explicit
   module combinations, re-verify every existing regression test + a fresh sim sweep
   for each.
4. **m1-m6, loosely.** Only after 1-3 are solid — and explicitly not chasing the same
   precision, per the scope split above.

## Open questions — Fable's call, same as the last two rounds

- Is the WEAPON/SHIELD/GENERATOR/MOTOR four-slot split right, or does enemy "hp/size"
  need its own fifth slot (a chassis/hull) rather than living inside whichever module
  happens to set it today?
- Visual approach: fully dynamic per-frame `Graphics` overlays (matches the player
  ship, zero extra texture-bake cost, but more per-frame draw calls at high enemy
  counts) vs. a small curated set of pre-baked common combos (cheaper per-frame, more
  boot-time/maintenance cost, caps variety to what's pre-baked)?
- Do existing kinds (`FODDER`, `STRIKER`, etc.) get reimplemented as specific default
  module combinations for visual consistency, or stay exactly as they are (flat,
  legacy) alongside new modular enemies indefinitely?
- Is 2 kinds per slot the right starting size for phase 1, or is that too little to
  actually prove "combine many modules into more enemy types" is working?
- Should phase 4 (m1-m6) happen at all in a first pass, or should this plan stop after
  phase 3 (tutorials) and treat main-mission adoption as a clearly separate, later
  plan of its own — matching how tutorials vs. main-mission scope has been kept apart
  everywhere else this session?
