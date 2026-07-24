# Round 4 — 8-item brief for Fable to turn into a concrete plan

## Context

Tomáš, after the visual-language audit round landed: "great progress, but can we do
one more round," followed by 8 items, then: "use fable again and let fable write you
what to do." This doc is the investigation — grounding each item in the actual
current code, not guessing — for Fable to turn into the actual concrete plan
(specific numbers, specific technical approach, specific scope per item), the same
way Fable's own decision drove the previous round. Implementation follows whatever
Fable writes, per this session's established process.

Verbatim request, 8 items:
1. Improve the player ship and all of its modules.
2. Make the death animation more obvious and longer.
3. Intensify the starfield even more, "I like it."
4. Don't use pulsating circle animation, looks cheap — "I like the rotating circle
   one."
5. Don't make the autoclicker skip tutorials, always click just next.
6. Player ship bottom bars miss numbers and energy bar.
7. "I would love to see some 'extra mini bar' of energy and shield in the visuals as
   well."
8. Do not ever use just plain rectangle as something — "I can see that in t3 enemy."

## Item 1 — player ship + modules

`buildShipTextures` (5 hulls, 10-13 primitives each) was the audit's own reference
bar and hasn't been touched. The bigger gap is the *modules*: `shipRenderers.ts`'s
`renderGunIndicator`/`drawShieldRings`/`renderThrusterAssembly`/`drawGeneratorCore`/
`drawRearWeaponIndicator`/`drawSideWeaponIndicator` already vary shape by kind, but
carry **no animation tied to real gameplay state** the way the enemy roster's own
modules now do (GUARDIAN's rotating ring, TURRET's fire-recoil, KAMIKAZE's proximity
glow, BOOSTER's flowing chevron, BOSS's stall pulse — all built the last two
rounds). The player ship, the thing on screen the whole game, is now visually
*behind* the enemies it fights in this one specific respect. Open question for
Fable: hull redesign too, or modules-only parity/exceeding the enemy bar? My read:
the modules gap is the more concrete, measurable one; the hull was never flagged as
plain the way enemy hulls were.

## Item 2 — death animation

`playDeathAnimation()` (`CombatScene.ts`): a 550ms edge-flash fade, a 400ms camera
shake, 3 particle bursts staggered 160ms apart (each burst's own tween ~380ms), and
the ship+modules fade over 500ms starting at a 100ms delay. Everything is
functionally finished by ~600-700ms. `DEFEAT_EXIT_DELAY_MS = 1400` (the total hold
before cutting to `ResultScene`) means the screen sits idle for roughly the last
700-800ms with nothing happening. "More obvious and longer" reads as both: extend
`DEFEAT_EXIT_DELAY_MS` itself, and extend/add stages to the animation so the whole
window is actually used (e.g., more burst waves, a expanding shockwave ring, staged
intensity) rather than finishing early and idling.

## Item 3 — starfield, intensify further

Last round added 3 depth tiers (near/mid/far moving together), a small tinted
fraction (cyan/amber), and a twinkle on the near tier only, deliberately light-touch
per Fable's own prior scoping ("not a redesign project," since it carries no
gameplay information). Tomáš now explicitly likes the direction and wants more.
Candidates: more stars (`COUNT = 65` today), a brighter/more distinct near tier,
twinkle extended to the mid tier too, more color variety. Given his "I like it," this
is now Tomáš's own request to go further, not a case for keeping it minimal — Fable
should feel free to size this up for real, not re-apply the previous round's
restraint reasoning.

## Item 4 — replace pulsating circles with rotating ones

Direct grep of every `Math.sin(...Phase...)`-driven circle in `CombatScene.ts`:
- **`drawEnemyGeneratorCore`** (line ~2060) — a `fillCircle` whose alpha *and* radius
  both pulse via `sin`. This is the one every single enemy in the game shows,
  continuously, all the time — almost certainly the main offender.
- **BOSS's stall-tied pulse** (`drawEnemyHullAnim`, line ~2113) — a `strokeCircle`
  whose alpha pulses, faster during the stall phase.
- **`renderBoosterBuffs`'s shield-regen glow** (line ~1786) — a `fillCircle` alpha
  pulse, self-directed glow for shield-regen enemies.
- **The one Tomáš likes, "the rotating circle one"**: almost certainly GUARDIAN's
  inner-ring rotation (`drawEnemyHullAnim`'s guardian branch) — 3 small dots
  orbiting the baked ring via `cos`/`sin` of a continuously-advancing angle, not an
  alpha pulse at all. Confirmed the only *rotating* (not alpha-pulsing) circle
  effect in the codebase.
- **Not pulsing, unaffected**: the player's own `drawGeneratorCore`
  (`shipRenderers.ts`) ties alpha to `energyFrac` (a real number), not a time-based
  sine — doesn't animate on its own. `renderShieldPulseRings`
  (`tickShieldPulseRings`) are event-triggered one-shot expanding rings on an actual
  shield pulse, not an idle loop.

Open question for Fable: replace generator-core/boss-pulse/shield-regen-glow's
alpha-pulse with a rotation-based treatment each (mirroring guardian's technique),
or something else that still isn't a static circle? And does item 1's player-module
animation work (if approved) need this same rule applied from the start (i.e., don't
build a *new* pulsating-circle effect for the player's own generator core while
fixing this everywhere else)?

## Item 5 — remove the tutorial SKIP shortcut

Found the real mechanism, and it's a genuine player-facing gap, not a bug in the
dev-only autopilot tool (which already only ever taps `NEXT →`/`CONTINUE` — checked
its predicate directly). `CombatScene.ts`'s `showNarratorLine`: every narrator line
except the last one renders **two** buttons — `NEXT →` and a second, real `SKIP`
button (`label: 'SKIP', onClick: () => resolveNarrator(this.core)`) that dismisses
the *entire* remaining narrator sequence in one tap, right next to `NEXT →` at the
same vertical position (easy to hit by accident while tapping quickly through
dialog). Tomáš's ask: remove `SKIP` entirely so the only way to progress is
`NEXT →`/`CONTINUE`, one line at a time, every time.

## Item 6 — player ship's own under-ship status bars

`renderShipStatusBars()`: draws a HULL bar and a SHIELD bar directly under the ship
(`SHIP_STATUS_BAR_W/H/GAP/Y_OFFSET` = 44/4/3/36px) — plain filled rects, **no
numeric text on either one**, and **no energy bar at all** (only hull+shield). The
left info panel elsewhere on screen already shows HULL/SHLD/ENRG with numbers, but a
player's eyes are on the ship during combat, not the side panel. Straightforward:
add current/max numeric labels to both existing bars, and add a third bar for
energy, matching the existing bar's own visual language (same fill-tier coloring
convention used elsewhere, e.g. `drawEnemyHpBar`'s green/amber/red thresholds).

## Item 7 — "an extra mini bar... as well"

Genuinely ambiguous on a single read — my best interpretation, for Fable to confirm
or correct: "as well" reads as *in addition to* item 6's fix (which is entirely
about the player's own ship), meaning this is about giving **enemies** a compact
energy/shield mini-bar too — right now an enemy's shield is only conveyed by the
ring overlay's glow *intensity* (no exact reading) and its generator has no
numeric representation at all beyond the cosmetic core pulse. If that reading's
right, scope is: a small 2-segment mini-bar (shield + energy-equivalent) drawn near
each enemy's existing HP bar, opt-in per module presence (only enemies with a real
shield/generator show it) — matching the same "don't render a layer that isn't doing
anything" discipline every other enemy overlay already follows. Flagging this
explicitly as my inference, not a confirmed reading, since the alternative (a
*second* mini version of the player's own bars, redundant with item 6, shown
somewhere else entirely) is also plausible from the wording alone.

## Item 8 — the plain rectangle in t3

Confirmed exactly, by reading `data/missions.ts` directly: `GUARDIAN_REGEN` (t3's
enemy) is a hand-written `EnemySpec` predating the modular system — it never calls
`composeEnemy` and never sets `weaponKind`. `timeline.ts`'s `spawnEnemy` defaults an
unset `weaponKind` to `null`, and `drawEnemyGunMountShape`'s dispatch has a fallback
`else` branch for exactly this case: **a bare `fillRect`**, the one remaining plain
rectangle standing in for a real module in the entire game (every other enemy either
has a real `weaponKind` now, shaped accordingly, or predates the mount system
entirely and was already redesigned at the hull level). Two ways to close this,
for Fable to pick: (a) give `GUARDIAN_REGEN` an explicit `weaponKind` (matching how
BOSS/BOOSTER/BLOCKER already got explicit `motorKind`/`generatorKind`/
`holdBonusTiered` when their own dispatch was generalized), or (b) change
`drawEnemyGunMountShape`'s fallback shape itself to something better than a rect, so
*no* legacy spec — present or future — can ever render a bare rectangle mount, only
option (a) fixes t3 specifically without a systemic guarantee.

## Ask

Same process as every round this session: Fable verifies these findings against the
actual code (don't take this brief's claims on faith — I may have missed something,
especially on item 7's ambiguity) and writes the actual concrete plan for each of the
8 items — specific numbers, specific technical approach, what to build and how, not
just direction. Implementation follows exactly what comes back.
