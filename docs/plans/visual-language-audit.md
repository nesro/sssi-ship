# Visual language audit — full graphics catalog, for Fable to decide what's next

## Purpose

Tomáš: "can you go over all the graphics in this game again, write a docs about the
shape and then we let fable to decide what to add?" This is a from-scratch catalog of
*every* baked texture and runtime-drawn shape in the game — not just enemies (already
redesigned this session) — read directly from the actual drawing code, not from
memory of what was built. The goal isn't to propose a plan myself; it's to lay out
what exists, where the density/detail is uneven, and hand the prioritization
question to Fable.

## The system underneath everything

Two rules govern every visual in this game, and every category below either follows
them or is a deliberate, named exception:

1. **Baked glow, never per-object PostFX** (`textures.ts`'s `bake()`/`GLOW_PASSES`,
   `V2_HANDOFF.md §4.3`): a shape is painted 4 times at increasing width and
   decreasing alpha, once, at load — the "neon glow" look costs nothing at runtime.
   `ADD` blend mode at draw time is what makes overlapping neon lines brighten
   instead of just overlapping flatly. Every static texture in the game (ships,
   enemies, projectiles, icons) uses this exact mechanism.
2. **Runtime-drawn overlays share one Graphics object per overlay *type*, not one
   per instance** — proven this session (modular-enemies rounds 1-2, enemy-hull-
   redesign): this is the lever that keeps 15-enemy concurrency cheap regardless of
   how much detail any one overlay carries.

Palette (`palette.ts`) is system-coded: weapon=cyan, shield=blue, generator=amber,
motor=magenta, enemies=red/orange — the same four hues read as "which module" on
both the player ship and (since this session's modular-enemies work) every enemy.

## Category 1 — Player ships (`buildShipTextures`, 5 hulls)

Baseline density: interceptor 10 primitives (triangle hull + 2 wing struts + twin gun
barrels + cockpit ring + 2 engine struts), warship 13 (adds 2 armor plates + more
strut detail). Every ship is a distinct silhouette (interceptor's sharp triangle,
tanker's blocky rect+triangle, salvager's asymmetric cargo-claw detail, reactor's
cross-braced core, warship's swept dual-hull). This was the reference bar the recent
enemy-hull redesign was built to match — not touched this session, already solid.

## Category 2 — Enemy hulls (`buildEnemyTextures`, 13 hulls) — redesigned this session

10-15 primitives per hull (2-4 for the deliberate FODDER/SWARM low-complexity
exception, justified by real concurrency: `pacing-report.md`'s m5 peaks at 15.0).
Distinct shape grammar per role — swept-wing STRIKER, octagonal-block TANK,
hexagonal-fortress BLOCKER, riot-shield BREACHER, layered-dreadnought BOSS (15
primitives, the densest hull in the game). 5 kinds carry a runtime-animated hull
sub-part tied to real gameplay state (GUARDIAN's rotating ring, TURRET's fire-recoil
flash, KAMIKAZE's proximity glow, BOOSTER's flowing chevron, BOSS's stall-tied
pulse). `addEnemyAnimTween`'s whole-sprite motion now matches shape (rotation-
symmetric hulls spin, directional ones wobble).

## Category 3 — Module overlays, runtime-drawn (`CombatScene.ts` + `shipRenderers.ts`)

The layer between the static hull and the player's own gameplay state. Player ship:
`renderGunIndicator` (shape varies by weapon kind — ring for ion, angled lines for
scatter, big ring for nova), `drawShieldRings` (4-ring glow, intensity-driven),
`renderThrusterAssembly` (animated flame + housing, 3 motor levels), `drawGeneratorCore`
(pulsing core), `drawRearWeaponIndicator`/`drawSideWeaponIndicator` (both already
vary shape by kind — round bomb for grenade, forked lightning for arc, targeting
reticle for focus, dart-fan for flechette, etc.). Enemy side (this session): shield
ring (leaner 2-ring variant), generator core, motor trail, and — **as of this
conversation** — gun mounts that finally vary shape by `weaponKind`
(`drawEnemyGunMountShape`: twin needle prongs for stinger, wide blocky barrel for
battery, long spike for lance) instead of one generic rect for every enemy weapon,
matching the standard `renderGunIndicator` already set for the player ship.

## Category 4 — Projectiles in flight

- **Player front weapon** (`buildProjectileTextures`): pulse/scatter are thin bolts
  (1-2 primitives + a small tip dot for scatter); ion is a filled+stroked circle;
  nova is a double-ring shockwave; y2010 is the deliberately-unpolished retired
  zigzag (a nostalgia callback, not a gap). Reasonably distinct per weapon already.
- **Rear weapon** (`buildRearProjectileTextures`): grenade (filled+stroked circle),
  flak (small stub+dot), plasma (soft orb), arc (zigzag bolt), cluster (diamond+dot)
  — 5 kinds, each visually distinct, 2-3 primitives.
- **Side weapon** (`buildSideProjectileTextures`): the most detailed projectile tier
  in the game — focus (beam+flare+crossbar, 3 primitives), flechette (dart+
  highlight+twin tail lines, 4), railgun (thick core+white inner+tip flare, 3),
  orbital (halo+fill+ring+bright core, 4 concentric layers).
- **Enemy bolts** (`CombatScene.ts`'s `spawnEnemyBolt`/`spawnEnemyRearBolt`, runtime
  rects, not baked textures): a rect + a soft glow rect, color/size varying by crit/
  miss outcome — but **not by `weaponKind`**, unlike the mount that just launched it.
  A stinger, a battery, and a lance all fire the exact same-shaped bolt today. This is
  the most visible remaining inconsistency in the whole projectile category, given
  the mount fix that just landed right next to it.

## Category 5 — Shop icons (weapon/rear/side/equipment, `buildWeaponIconTextures` +
3 sibling functions)

Front weapon icons (2-4 primitives) are the plainest icon tier — mostly parallel
lines with small tick caps. Rear weapon icons (`buildRearWeaponIconTextures`) are
considerably richer (3-8 primitives — arc's forked double-zigzag, cluster's
diamond-plus-4-corner-dots hex pattern). Side weapon icons
(`buildSideWeaponIconTextures`) match that richer tier (reticle+crosshair+dot,
dart-fan, arrow-tipped rail, converging-chevron orbital strike marker). Equipment
icons (`buildEquipmentIconTextures`, shield/generator/motor) are the simplest tier
in the game by design — 2-5 primitives, optimized for legibility at small shop-list
size (bars, chevron, hexagon, battery shape, lightning bolt) rather than per-kind
personality. **Front weapon icons are the one icon tier visibly behind its siblings**
in per-kind distinctiveness — the shop's most-looked-at icon (every player owns a
front weapon; not everyone owns rear/side) is also its least elaborated.

## Category 6 — Combat feedback (particles, floating text, vignette)

`spawnBurst`/`spawnTweenBurst`: radial dot particles, deterministic angular spread,
no per-kind variation (kill bursts, damage floats, etc. are all the same dot-radial
regardless of what died or how). Floating text (coin/heal/damage numbers): plain
colored text, no shape at all — purely typographic, intentionally so (numbers need
to read instantly, not compete for attention). Low-hull vignette: 4 flat-colored
edge rects, intensity-scaled — functional, not really part of the "shape" language at
all. This category is deliberately restrained (feedback needs to be instantly
legible, not a showcase) — flagged here for completeness, not as an obvious gap.

## Category 7 — Background and hub map

- **Combat starfield** (`addStarfield`): 65 plain white 1-2px rects at two alpha
  tiers, scrolling left at varying speed for parallax. The single plainest visual
  element in the entire combat view — no color variation, no shape, by a wide
  margin the least-detailed thing on screen once everything in front of it (ships,
  enemies, modules, bolts) has this much density.
- **Hub galaxy map** (`HubScene.ts`'s `renderGalaxyNode`/`renderGalaxyConnections`):
  mission nodes are 3 concentric filled circles + 2 stroke rings (glow/selection
  state) — simple, functional map iconography, not vector-ship-level detail, which
  may be entirely appropriate for a map UI rather than a gap.

## What this session already touched vs. never touched

**Touched** (enemy-focused, per Tomáš's explicit direction each round): enemy hulls
(13, complete redesign), enemy module overlays (shield/generator/motor/gun mounts,
all built from scratch this session), enemy hull animations (5 kinds), enemy gun
mount weapon-kind shape variation (this conversation).

**Never touched, unchanged since before this session**: player ships, all baked
projectile textures (player/rear/side), all shop icon textures, combat particles/
floating text/vignette, the starfield background, the hub galaxy map. None of these
are broken — the player ship and side-weapon-icon tiers in particular are already at
a high, consistent density — but none have had the scrutiny the enemy roster just
got.

## Open observations, not decisions — for Fable

Three concrete inconsistencies surfaced by this audit, stated as observations, not a
proposed plan:

1. **Enemy bolts don't vary by `weaponKind`**, unlike the mount that just launched
   them (this session's own most recent fix) — the newest, most obvious mismatch in
   the codebase right now.
2. **Front weapon shop icons are the plainest icon tier**, despite being the one
   every player owns and looks at most often — rear/side/equipment icons are all
   more elaborated.
3. **The combat starfield is flat relative to everything now in front of it** — once
   both ships and enemies carry this much detail, 65 plain white dots is the most
   visually "unfinished" layer left on screen.

Handing this catalog to Fable to decide: whether any of these three are worth a
dedicated pass, whether there's a different priority order, or whether something in
the "never touched" list matters more than any of them.

## Fable's decision

Corrected one factual claim first: `addStarfield` scrolls **down**, not left
(`updateStars` increments `.y`, matching the direction enemies approach from) — any
starfield fix should lean into vertical parallax, not invent a left-scroll that
doesn't match the existing motion.

**Ordered recommendation: enemy bolts → front weapon shop icons → (optional,
light-touch) starfield.**

1. **Enemy bolts, first** — not just an untouched area, an actual internal
   contradiction this session created: a mount now visibly shaped per `weaponKind`
   fires a bolt that forgets what fired it. Freshest inconsistency in the codebase,
   small bounded scope (3 `EnemyWeaponKind` values), and the fix pattern already
   exists twice over (`drawEnemyGunMountShape`'s per-kind branches, or better, the
   baked-texture-per-kind approach `buildProjectileTextures`/
   `buildRearProjectileTextures` already use for the player's own bolts).
2. **Front weapon shop icons, second** — real, independent gap, bounded scope (5
   weapon kinds × 2 tiers = 10 icons, comparable to what rear/side icons already
   have), but real per-icon creative design, not a mechanical copy — different scene,
   different kind of work, sequenced after bolts so one visual-language thread
   finishes before the next starts.
3. **Starfield — optional, scoped down, not a peer priority.** Carries zero gameplay
   information (unlike bolts encoding weapon kind, or icons aiding purchase
   decisions) — Category 6's particles/vignette are *deliberately* plain so they
   don't compete with foreground legibility, and the starfield's flatness is
   partially the same restraint, not pure neglect. If picked up: light depth-tiered
   color/twinkle variation riding the existing two-alpha-tier structure, not a
   redesign project with its own plan doc.

**Skip entirely, confirmed correct as-is, not just deprioritized**: player ships
(the reference bar), rear/side projectile textures (already the most detailed tier),
equipment icons (simple by explicit shop-legibility design, not by gap), hub galaxy
map (correct simplicity for map UI), combat particles/floating text (correctly
restrained). Revisiting any of these now would solve problems that don't exist.
