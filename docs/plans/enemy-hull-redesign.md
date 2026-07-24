# Enemy hull redesign — hand-drawn, complex, animated

## Context

Tomáš, after seeing modular-enemies' overlay work land: "you just added a circle
inside of the square. I have time and a lot of claude ai limit. Please, make a plan
how the enemies should look and make them complex... the problem is really just the
enemies are a stupid square. I want ALL part of the enemies to be complex: their
'ship' AND all the modules." The module overlays (shield ring, generator core,
thruster, gun mounts) from the previous round were real, but they decorate a hull
that's still one bare primitive (`strokeDiamond`, `traceStar`, a plain `strokeRect`)
per `textures.ts`'s `buildEnemyTextures` — the actual complaint. Asked directly for
direction: "try it yourself first" (no external reference — use the player ship's own
texture code, `buildShipTextures`, as the complexity floor, not a ceiling — "try to
come up with more complex shapes AND animations"), and explicitly **hand-drawn per
named enemy**, not procedural-from-modules (his own words, choosing that option over
a procedural-hull alternative I'd offered).

## What "complex" already means in this codebase — the bar to clear, not just match

Read `buildShipTextures` before designing anything. The player's `interceptor` hull is
not one shape: `strokeTriangle` (hull) + 2 `lineBetween` (wing struts) + 4
`lineBetween` (twin gun barrels with tip caps, `drawStandardGunBarrels`) + `strokeCircle`
(cockpit) + 2 more `lineBetween` (engine struts) — **10 primitives**, one recognizable
silhouette with real sub-detail. `warship` goes further: 13 primitives including two
armor-plate rects. Today's enemy hulls (`buildEnemyTextures`) are nowhere close:
`fodder`/`swarm` are a single `strokeDiamond` — literally the "stupid square"
complaint, one primitive, zero sub-detail. `turret`/`booster` already sit at 3-4
primitives and `boss` at 8 — proof this file already knows how to do better, just
didn't for the common cases. Target: **every enemy hull at or above the player
ship's own 10-13 primitive density**, each with a distinct shape language, not a
recolored variant of the next one's silhouette.

## Roster and kind changes required first

Hand-drawn-per-named-enemy means every named archetype needs its **own** `kind`
value and texture entry — no more sharing. Two enemies from the previous round
currently violate this and must be split out before their hulls can be designed:

- **BREACHER** and **BREACHER GUNNER** (`data/missions.ts`) currently both set
  `kind: 'fodder'`, rendering as plain `FODDER`'s diamond (`textureForEnemyKind`'s
  lookup is keyed on `kind`, not `displayName`). They need their own `kind` values
  (`breacher`, `breacher-gunner`) and texture entries, plus their own
  `ENEMY_VISUAL_RADIUS`/`MIN_VISUAL_SPACING` rows (currently borrowed from `fodder`/
  the `gunner` shim added last round — that shim can be removed once GUNNER has a
  real `kind` of its own).
- **SENTINEL** (t1) currently sets `kind: 'guardian'`, sharing `GUARDIAN_REGEN`'s
  (t3) ring-and-cross texture. They're thematically different enough (t1's disposable
  training drone vs. t3's regenerating stalling threat) to earn distinct hulls —
  SENTINEL gets its own `kind: 'sentinel'`; the existing `guardian` texture becomes
  `GUARDIAN_REGEN`'s alone.

Full active roster after this split, all needing new hull painters: `FODDER`,
`STRIKER`, `TANK`, `SWARM`, `BLOCKER`, `GUARDIAN` (t3's regen guardian only),
`SENTINEL` (t1), `TURRET`, `KAMIKAZE`, `BOOSTER`, `BOSS`, `BREACHER`, `BREACHER_GUNNER`
— 13 hulls, not 9. No hypothetical future enemies invented for this pass; this is the
complete real roster.

## Design language — one shape family per role, not a recolor of the next

Each hull gets a distinct *silhouette grammar* reflecting its role, so the roster reads
as a real bestiary at a glance (matching how the 5 player ships already read
distinctly — triangle interceptor vs. blocky tanker vs. cross-shaped reactor) rather
than 13 variations on "diamond with extra lines." Assignments below, with the
specific primitive list for each (all achievable with the existing toolkit —
`strokeTriangle`/`strokeRect`/`strokeCircle`/`lineBetween`/`beginPath`+`lineTo` custom
polygons, same as `buildShipTextures` already uses; no new Phaser capability needed).

**A performance-aware exception, stated up front, not discovered late**: `SWARM` and
`FODDER` are this game's highest-concurrency enemies (`pacing-report.md`'s own
numbers put `m5` at 15.0 peak concurrent, driven largely by SWARM; FODDER's own
worst missions, m1/m3/m3b, sit at 9.0-11.2). They get noticeably *less*
primitive-count than the rest — a deliberate, named exception to "match the 10-13
bar everywhere," not an oversight. Every other enemy (lower count, higher individual
stakes) gets the full treatment.

| Enemy | Silhouette grammar | Primitive sketch (~count) |
|---|---|---|
| **FODDER** | Minimal dart-drone — the deliberate low-complexity exception | Elongated kite fuselage (custom 4-point polygon) + 2 small stub-fin `lineBetween` + 1 sensor-dot `strokeCircle`. **~4 primitives.** |
| **SWARM** | Even leaner — a bare dart, deliberately rotation-tolerant (see the animation-conflict section below for why it has no directional tail detail) | 3-point polygon dart + 1 small centered notch line. **~2 primitives.** |
| **STRIKER** | Swept-wing starfighter | Forward-swept kite fuselage (polygon) + 2 angled wing-blade triangles + cockpit `strokeCircle` + 2 wingtip stub `lineBetween`. **~6 primitives.** |
| **TANK** | Reinforced armor block | Octagon hull (8-point polygon, not a bare rect) + 2 cross-brace `lineBetween` + 2 side armor-plate `strokeRect` + turret-dome `strokeCircle`. **~7 primitives.** |
| **BLOCKER** | Fortress bulkhead — reads as immovable | Outer hexagon frame (6-point polygon) + inner diamond core (existing `strokeDiamond`, reused) + 4 corner-bolt `strokeCircle` + 1 top hazard-chevron `traceChevronDown`. **~7 primitives.** |
| **GUARDIAN** (t3) | Orbital sentinel — animated ring is the regen "tell" | Outer ring + inner ring (existing 2 `strokeCircle`, kept) + 4 radiating spoke `lineBetween` (existing cross, kept) + 4 short "vent" tick marks around the inner ring. **~10 primitives.** Inner ring **rotates** at runtime (see Animation). |
| **SENTINEL** (t1) | Training-dummy target frame — distinct from GUARDIAN | Hexagonal target frame (6-point polygon) + internal crosshair cross (2 `lineBetween`) + 4 corner tick marks. **~7 primitives.** |
| **TURRET** | Gun emplacement | Trapezoid base platform (4-point polygon, replacing the bare rect) + raised turret-ring `strokeCircle` + twin parallel-barrel `lineBetween` pairs with tip caps (reuses `drawStandardGunBarrels`'s exact technique) + 2 side-fin `lineBetween`. **~9 primitives.** Barrels **recoil** slightly on fire (see Animation — reuses the fire-telegraph timing already computed). |
| **KAMIKAZE** | Spiked warhead | Existing spiky star (kept, it's already apt) + inner core `strokeCircle` + 2 stabilizer-fin `lineBetween`. **~4 primitives** static; core **brightens with proximity** at runtime (see Animation). |
| **BOOSTER** | Support drone housing a feed emitter | Hexagonal support-drone frame (6-point polygon) + existing ring+2-chevron feed emitter (kept, already thematically right) + 2 antenna-strut `lineBetween`. **~10 primitives.** Chevrons **animate downward** continuously at runtime (see Animation), on top of the existing `renderBoosterBuffs` connecting line. |
| **BOSS** | Layered dreadnought — the most complex hull in the game, matching its role | Existing diamond + ring + 8 radiating lines (kept, already the densest today) + 1 outer second ring + 2 side pincer-wing polygons + 4 hull-plate divider `lineBetween`. **~16 primitives.** Pincer wings and outer ring **pulse faster during the stall phase** (see Animation — ties into the existing `BOSS_APPROACH_TICKS`/`BOSS_STALL_TICKS` cycle). |
| **BREACHER** (t2) | Riot-shield wall unit | Wide flattened hexagon ("shield-faced," 6-point polygon wider than tall) + 2 side thruster-fin `lineBetween` + 1 forward gun-nub `strokeRect`. **~4 primitives** base, **~9** once the real WEAPON/SHIELD baked details below are added. |
| **BREACHER GUNNER** (t2) | Same shield-wall base, visibly escalated | BREACHER's exact hull **plus** 2 additional rear stub-cannon `strokeRect` baked into the hull itself (in addition to the existing runtime rear-mount overlay) — reads as "the same drone, now armed further," not an unrelated new shape. **~11 primitives.** |

## Baking real WEAPON/SHIELD/GENERATOR/MOTOR identity into the hulls that have one

Hand-drawn-per-named-enemy doesn't mean the hull ignores its own real modules — it
means *whoever writes that enemy's painter* bakes in the details by hand, matching
what that specific enemy is actually composed with (checked against `data/
missions.ts` at design time, not derived automatically):

- **SENTINEL**/**BREACHER**/**BREACHER GUNNER** carry real SHIELD/GENERATOR modules
  (previous round) — their hulls get a small baked emitter-ring notch or vent detail
  echoing that, distinct from the runtime shield-ring/generator-core *overlays*
  (which stay exactly as built — the hull detail is a static echo, the overlay is the
  live, capacity-aware readout).
- **BREACHER GUNNER**'s baked rear stub-cannons (above) are the one case where the
  static hull directly represents a specific module (`rearWeaponKind !== null`) —
  appropriate since it's the one enemy in the game with a structurally different
  weapon loadout from its own undecorated counterpart.
- Everything else keeps today's split: hull is hand-drawn per archetype; the four
  module overlays (shield/generator/motor/gun-mounts, all still fully general-purpose
  and reused for every kind) stay exactly as the previous round left them, still
  always-on, still driven by the enemy's real `EnemyState` fields.

## Animation — real, tied to gameplay state where a hook already exists

Static baked hulls stay static (cheap, existing pattern, `bake()`/`GLOW_PASSES`
unchanged). New *animated* hull sub-parts are runtime-drawn, following the exact
performance discipline already proven this session: **one shared Graphics object per
animated-detail type, cleared and redrawn every frame for every enemy together** —
never a per-instance object, which is the actual lever that kept the previous round's
profiling delta near zero.

| Enemy | Animated element | Drive signal |
|---|---|---|
| GUARDIAN | Inner ring rotation | Continuous, tied to `this.thrusterPhase` (existing shared animation clock) — reads as "actively cycling," matching its real self-regen. |
| TURRET | Barrel recoil (small back-and-forth offset) | `drawEnemyFireTelegraph`'s own `shootTimer`/`ticksBetweenShots` fraction — the barrels visibly kick right as the telegraph peaks, not a separate unrelated timer. |
| KAMIKAZE | Core brightness | `enemy.distance` — brightens as it closes in, a genuine "getting more dangerous" readout, not decoration. |
| BOOSTER | Chevron flow (position cycles down the existing chevron pair) | Continuous phase clock, same technique as the thruster flicker. |
| BOSS | Outer-ring/pincer pulse rate | `BOSS_APPROACH_TICKS`/`BOSS_STALL_TICKS` — visibly faster during stall, tying into the *existing* pulsing anchor ring overlay from the previous round rather than fighting it for attention. |

Every other enemy (FODDER, SWARM, STRIKER, TANK, BLOCKER, SENTINEL, BREACHER,
BREACHER GUNNER) gets **no new animated hull element** in this pass — their hulls are
static bakes, same as today's are, just with more primitives. This is a deliberate
scope line: animation is reserved for enemies where a real gameplay signal exists to
drive it, not added uniformly "because more animation." A future pass can revisit
this if it turns out too sparse once it's actually on screen.

## `addEnemyAnimTween` conflict — found by Fable's review, resolved here, not deferred

`CombatScene.ts`'s existing `addEnemyAnimTween` already spins almost every enemy
sprite continuously via a whole-sprite `angle: 360` tween (swarm 800ms/rev, striker
1800ms, blocker 5000ms, tank 3200ms, kamikaze 600ms, boss 4000ms + a separate
scale-pulse, and an unlabeled `else` branch at 2400ms covering fodder/guardian/
booster/anything else not explicitly matched — which will include SENTINEL/BREACHER/
BREACHER GUNNER once they're split out). Only `turret` is exempt today (scale-oscillate
only, "it's a stationary emplacement"). This was missed in the first draft of this
plan and would have shipped broken: a directional, asymmetric silhouette (swept-wing
STRIKER, riot-shield-faced BREACHER, forward-chevron BOOSTER) tumbling nose-over-tail
forever reads as a bug, not "complex" — and it directly fights two of the five new
animated overlays above (GUARDIAN's inner-ring rotation and BOSS's pincer/ring pulse
both sit on a host sprite that's *also* independently spinning/pulsing on its own
unrelated schedule).

**Resolved by shape, not by exemption list-creep**: whether a kind keeps the
existing continuous spin depends on whether its *new* redesigned silhouette is
rotationally symmetric (spinning doesn't break the read) or directional (spinning
does):

- **Keep full continuous spin, unchanged**: `SWARM` (redesigned as a bare dart —
  dropping the "motion-streak tail" detail from the table above specifically because
  a trailing streak *would* break under rotation; the dart itself doesn't need one to
  read as fast/small) and `KAMIKAZE` (redesigned hull is a radially-symmetric spiky
  star, already rotation-tolerant, and "tumbling warhead" is a coherent read for a
  suicide unit anyway).
- **Replace continuous 360° spin with a small yaw wobble** (angle oscillates roughly
  ±8°, `yoyo: true`, `Sine.easeInOut` — the exact technique `turret`'s existing
  scale-pulse already uses, just applied to `angle` instead of `scaleX`/`scaleY`):
  `FODDER`, `STRIKER`, `TANK`, `BLOCKER`, `SENTINEL`, `BOOSTER`, `BREACHER`,
  `BREACHER_GUNNER`. Reads as "maneuvering/drifting," keeps the hull's front-facing
  orientation intact, still real motion.
- **`GUARDIAN`**: switches from continuous spin to the same yaw wobble as above —
  necessary specifically so the *new* inner-ring rotation overlay reads as its own
  distinct motion against a host sprite that's no longer independently spinning.
- **`BOSS`**: drops the continuous `angle: 360` tween entirely; keeps the existing
  `scaleX/scaleY` breathing pulse unchanged. The new approach/stall-tied pulse-rate
  animation applies to the outer-ring/pincer *overlay* elements only, per the table
  above — with the host sprite no longer spinning, that overlay motion reads clearly
  instead of competing with it.
- **`TURRET`**: unchanged (already correctly exempted, already the model this fix
  generalizes from).

This decision is now part of Phase 3 (below) explicitly, not left implicit.

## Performance — a real budget check before landing, not an afterthought

The previous round found a genuine +4.2ms regression from going "always-on" on the
module overlays, fixed it down to ±0.02ms by trimming draw calls once it was
measured, not guessed. This round adds **more static primitives per hull** (cheap —
baked once at load, zero per-frame cost, this is the *same* mechanism `buildShipTextures`
already uses at zero measured runtime cost) **and up to 5 new small animated
overlays** (GUARDIAN ring rotation, TURRET recoil, KAMIKAZE brightness, BOOSTER flow,
BOSS pulse — each one shared-Graphics-object-per-type, matching the proven pattern).

Concrete plan: implement, then re-run the exact profiling script from the previous
round (`requestAnimationFrame` delta, 15 synthetic enemies, worst case = every
animated-overlay-eligible kind present at once) against the same **+3ms budget**.
Expect near-zero delta given the mechanism is identical to what already measured at
-0.01ms (confirmed stable across 3 repeated runs, `known-issues.md`), but this gets
*measured*, not assumed, matching the discipline that caught the real regression last
time.

## Implementation phases

1. **Kind/texture split.** Give BREACHER/BREACHER GUNNER/SENTINEL their own `kind`
   values, `ENEMY_VISUAL_RADIUS`/`MIN_VISUAL_SPACING` rows, and `textureForEnemyKind`
   entries (currently falling through to shared kinds). No visual change yet — this
   just clears the ground so each can get its own painter next.
2. **13 hull painters.** One at a time, per the table above, in `buildEnemyTextures` —
   screenshot-verified against a real running mission after each one (not batched
   blind), same discipline as every other view-layer change this session.
3. **`addEnemyAnimTween` rewrite** (the conflict above) — done alongside the hull
   painters, not after, so no directional hull is ever screenshot-verified while
   still spinning. Plus the **5 new animated overlays** (GUARDIAN/TURRET/KAMIKAZE/
   BOOSTER/BOSS), each its own shared Graphics object, wired into `renderEnemies`'s
   existing per-enemy loop next to the module overlays already there.
4. **Profiling checkpoint** against the +3ms budget, worst-case synthetic scene,
   before considering this done.
5. **Full verification pass**: `pnpm build:dry`/`lint`/`lint:comments`/`test`/
   `campaign`/`balance`/`pacing`/`audit-taps`/`dlx fallow`/`screenshot`, plus a fresh
   look at every redesigned enemy in its real mission context.

## Fable's review — done, one real blocker found and resolved above

Verified against the actual code (not the plan's claims at face value): the kind-split
is genuinely safe (`enemy.kind` isn't in `hashCoreState`, doesn't touch the sim's
high-value-target card policy, `FODDER_EASY` correctly stays out of the 13-hull
roster), and the three animation hooks (fire-telegraph fraction, boss approach/stall
ticks, `thrusterPhase`) are all real and reachable exactly as described. One genuine,
code-verified blocker: `addEnemyAnimTween` already spins almost every enemy sprite
continuously, which would visibly conflict with the new directional silhouettes and
with two of the five proposed overlays — resolved above (shape-dependent: rotation-
tolerant hulls keep spinning, directional ones switch to a yaw wobble). Also fixed:
the interceptor primitive count (10, not 8), boss's density framing, the FODDER/SWARM
pacing citation, and the performance citation — all folded into the sections above.
Proceeding to implementation.
