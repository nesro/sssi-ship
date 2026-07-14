# Combat gameplay polish: skip button, audio gaps, shield behavior, button-panel visuals

> Written for a fresh agent (Fable) with no memory of the session that produced this
> document. Read `GAME_DESIGN.md` (repo root) and `v2/CLAUDE.md` first — they are the
> settled source of truth for design and codebase conventions. This document does not
> repeat rules already stated there; it only covers the four gaps below.
>
> **This document has been reviewed once already** (by a Fable-model agent, read-only —
> no source files were changed). That review confirmed every file/line reference below
> against the current working tree and found the plan sound with the corrections already
> folded in below. Do not re-run that review; proceed straight to execution.
>
> **Autonomous-execution note:** every "Design decision requiring confirmation" below has
> a **Recommended** option. Treat the recommended option as pre-approved — implement it
> and move on. Only stop and ask a human if you find a reason the recommendation is
> actually wrong (not just "another option is also plausible").

## What this changes and why

A manual playtest of `v2/` surfaced three complaints: "buttons are too small," "I didn't
see any enemies," "the noises were weird," and "my shield was doing weird stuff." Code
investigation (not guesswork) turned these into four concrete, independently-shippable
work items:

1. The support-call card overlay has no way to decline all three offers, even though the
   core fully supports it — likely explanation for "no enemies" (the overlay covers the
   whole game field and can trap the player).
2. Two real audio gaps make combat feel thin/inconsistent.
3. "Shield doing weird stuff" is most likely a **missing visual-feedback** problem, not a
   mechanic bug — see item 3, which was reframed after review (the mechanic itself is
   settled design, not an open question as an earlier draft of this plan claimed).
4. The button panel (right side of `CombatScene`) is visually a stack of empty bordered
   rectangles with no icons or state color — it "works" but looks like placeholder UI.

Each item below is self-contained and independently valuable — ship #1 alone and the
game is measurably better. **Do these in order.** If you run out of budget partway, stop
after finishing the current item cleanly (passing CI, screenshot-verified) rather than
leaving two items half-done.

---

## Item 1 — Add the missing skip button (highest priority, smallest scope)

**File:** `v2/src/view/CardOverlay.ts`

**Current behavior:** `addFooterButtons()` (line ~123) only renders a `REROLL (N)` button,
and only when `vm.showReroll` (i.e. `rerollsLeft > 0`). There is no way to decline all 3
cards. The overlay (`show()`, line ~32) covers the full game field via
`addModalBackdrop` and stays up until `onAction` is called with a valid action.

**Core already supports this correctly** — do not touch `v2/src/core/cards.ts`:
- `CARD_ACTION_SKIP = -1` (`v2/src/core/constants.ts`)
- `resolveAbilityAction()` (`v2/src/core/cards.ts:69`) handles it: sets
  `state.pendingOffer = null` and records the action, with no side effects.

**Fix:** Add a `SKIP` button, always visible (skip must work even when reroll is also
shown), that calls `this.onAction(CARD_ACTION_SKIP)`. Import `CARD_ACTION_SKIP` (it's
already imported for `CARD_ACTION_REROLL` at the top of the file — add it to that
import). Layout: put it next to REROLL when reroll is available (e.g. two buttons side
by side under the cards), centered alone when it isn't. Reuse `addTextButton` from
`./widgets` exactly like the existing REROLL button does — same color style is fine, or
use `PALETTE.hullWhite`/dim gray to read as the "lesser" of the two footer actions.

**No viewmodel change needed** — `CardOverlayViewModel` (`v2/src/viewmodel/combat.ts:166`)
doesn't need a new field since skip's availability doesn't depend on any state (unlike
reroll's `showReroll`).

### Design decision requiring confirmation
- Placement/styling of the SKIP button when REROLL is also present (side-by-side vs
  stacked). Recommended: side-by-side, SKIP on the left, REROLL on the right, matching
  reading order (weaker action first).

### Test plan
- [x] Manual/visual: with rerolls available, both SKIP and REROLL render, don't overlap,
  and are independently tappable (verify via `preview_screenshot` — CLAUDE.md's mandatory
  visual-verification rule applies, this file is under `src/view/`).
- [x] Manual/visual: with `rerollsLeft === 0`, only SKIP renders (no REROLL), still
  correctly centered.
- [x] Tapping SKIP closes the overlay and gameplay resumes with `state.pendingOffer === null`
  and no card/ability added — verify by playing normally until a support call fires,
  tapping SKIP, and confirming the overlay closes and the mission continues.
- [x] `pnpm test` still passes. **No core test work needed** — `resolveAbilityAction`'s
  skip path is already covered by `v2/src/core/cards.test.ts` ("skip clears the offer
  without applying anything"). This item is view-only.

---

## Item 2 — Audio gaps

**File:** `v2/src/audio/SoundManager.ts`, wiring in `v2/src/view/CombatScene.ts`

**Gap A — rear weapon is silent.** `CombatScene.update()` (around line 448-453) computes
`rearShotsFired` and spawns the visual bolt (`spawnRearBolt()`), but never calls any
`Sound.*` method for it. Front-weapon shots call `Sound.fire()` **once per frame, gated
on `shotsFired > 0`** (not once per shot — see `CombatScene.ts:453`). Mirror that exact
pattern for rear shots (`if (rearShotsFired > 0) Sound.rearFire();` or equivalent) —
don't loop and call it once per shot fired that frame. Add a
rear-weapon fire sound — either reuse `Sound.fire()` (simplest, matches existing
front-weapon behavior) or add a distinct `Sound.rearFire()` if you want rear weapons to
sound different from the front weapon (recommended, since design explicitly treats front
and rear as different weapon *roles* — see `GAME_DESIGN.md` §5). If adding a new method,
follow the exact pattern of `fire()`/`kill()` in `SoundManager.ts` (private `sfx()`
helper, volume constant, no new asset needed — reuse the existing laser samples at a
different volume/detune, the same way `shieldPulse()` reuses `ding` at a different pitch
than `kill()`).

**Gap B — side weapon and reserve-supply boost share one sound.** Both
`handleSideWeaponTap()` and `handleBoostTap()` in `CombatScene.ts` call `Sound.boost()`
(the "rocket" sample). These are conceptually different player actions (a manual weapon
shot vs. an instant utility effect). Recommended: keep `Sound.boost()` for reserve
supplies (matches its name), add a distinct sound for side-weapon fire — reuse the laser
samples (matches "weapon" semantically) rather than adding a new asset file, since
`GAME_DESIGN.md` §11 states all current SFX are `LaserShot1–3, Rocket, Ding` and adding a
new audio asset is out of scope for this pass.

### Design decision requiring confirmation
- Whether rear weapon reuses `Sound.fire()` verbatim (simplest, ships fastest) or gets a
  distinct method/detune (more correct per design intent, marginally more work).
  Recommended: distinct — detune `Sound.fire()`'s laser sample down slightly for rear
  weapon, mirroring how `shieldPulse()` reuses `ding` with `detune: -600`.

### Test plan
- [x] Manual: equip a rear weapon in a mission, confirm an audible SFX plays on each rear
  shot (can verify programmatically too: spy/count calls into a mocked `Sound` in a
  `CombatScene`-level test if one exists, but this codebase has no such view-layer test
  harness today — manual verification via real playtest is acceptable and expected here).
- [x] Manual: tap a side weapon and a reserve supply in the same mission, confirm they now
  sound different.
- [x] `pnpm build:dry`, `pnpm lint` clean (no test suite coverage expected for pure
  audio-trigger wiring — this codebase doesn't mock Phaser's sound system in tests).

---

## Item 3 — Shield/collision behavior: add visual feedback (do not change the mechanic)

**Do not change `v2/src/core/conveyor.ts`.** An earlier draft of this plan treated
shield-first collision routing as an open design question (based on a stale note in
`v2/CLAUDE.md:94-97`, "Week-1 state and open items"). It is not open: `GAME_DESIGN.md`
(2026-07-01, explicitly the superseding source of truth) treats shield-first +
burst-back as **settled, feature-bearing design** —
§6 (line 339-341) states the collision rule outright; §8 (line 406) defines the
**kamikaze enemy's entire purpose** as triggering the burst-return mechanic; §9 (line 461)
says tutorial **t1 exists specifically to teach** "Collision burst-return; shield is a
weapon." Changing the mechanic would silently break a tutorial and orphan an enemy type.
**Do not ask Tomáš to re-decide this** — it's decided. If you genuinely believe the
mechanic itself (not just its legibility) needs to change, say so explicitly and why, but
default to leaving `conveyor.ts` untouched.

**Current mechanic** (`v2/src/core/conveyor.ts:12-31`, `advanceEnemies()`): when an enemy
reaches distance 0, it deals `shotDamage × COLLISION_DAMAGE_MULTIPLIER (3) ×
stats.shipCollisionDamageMult` to the ship via `damageShip()` (line 21), which drains
shield before hull. `stats.shipCollisionDamageMult` is the Tanker ship's passive (halves
this) — factor that in if you're reproducing on a non-Tanker ship and see bigger swings
than expected. Whatever the shield absorbed is multiplied by `SHIELD_BURST_RETURN (0.6)`
and dealt back as AoE damage to remaining enemies (line 24).

**What's actually likely wrong:** the mechanic works as coded, but nothing on screen
clearly tells the player "a collision just happened, here's why your shield dropped and
here's why nearby enemies just took damage." That's a **visual feedback gap**, not a bug.

**What to do:**
1. From code alone (no live repro needed — this item doesn't depend on real-time
   browser observation), check what visual feedback collisions currently get. Look at
   `shieldHitFlash` and `spawnDeflectionSpark()` in `CombatScene.ts` — these likely fire
   on *any* shield damage (weapon hits included), not specifically on a collision + burst
   event. Confirm whether a collision is currently visually distinguishable from a normal
   shield-absorbed weapon hit. It's plausible today it looks identical, which would fully
   explain "weird" (the player can't tell *why* their shield just dropped a chunk, or why
   enemies near them just took damage from nowhere).
2. Add a **distinct** visual cue for the collision + burst-back event specifically: e.g.
   a brief red-tinted flash on the ship (collisions are a bigger, more violent event than
   a normal weapon hit) plus a visible AoE burst ring/flash centered on the ship radiating
   outward to the enemies that just took burst damage — so the causality is legible at a
   glance.
3. This is a pure view-layer change. Do not touch `conveyor.ts`, `SHIELD_BURST_RETURN`,
   `COLLISION_DAMAGE_MULTIPLIER`, or any balance number.

### Design decision requiring confirmation
- Exact visual treatment for the collision/burst event (color, shape, duration).
  Recommended: reuse the existing `shieldPulseRings`/`spawnBurst` machinery already in
  `CombatScene.ts` rather than inventing new rendering primitives — just trigger it with
  collision-specific color/timing distinct from a normal shield pulse.

### Test plan
- [x] `preview_screenshot` before/after: trigger a collision (a kamikaze or any enemy
  reaching distance 0 works) and confirm it now reads visually distinct from a normal
  weapon-hit shield flash.
- [x] `pnpm test` unaffected (pure view change, no core edit).
- [x] Confirm `conveyor.ts` has zero diff — this item must not touch it.

---

## Item 4 — Button panel visual redesign (largest scope, do last)

**File:** `v2/src/view/CombatScene.ts` (toggle buttons + ability slots), possibly
`v2/src/view/SupplyButtons.ts` (reserve-supply slots), `v2/src/view/palette.ts` (if new
named colors are needed).

**Current state:** the right-hand button panel (`AUTO-FIRE`/`REAR`/`AUTO-SHIELD` toggles,
3 ability activation slots, reserve-supply/BOOST slots, `EXIT`) is a vertical stack of
1px-bordered rectangles with small centered text and no icons. Functionally correct
(sizes and spacing were already fixed for overlap/tap-target issues in a prior pass —
don't re-break `ABILITY_SLOTS_TOP`/`ABILITY_SLOT_GAP`/`ABILITY_SLOT_H` constants near the
top of `CombatScene.ts`, or `SupplyButtons.ts`'s `BUTTONS_TOP`, without re-verifying the
whole column still fits above `EXIT` at y=518). But visually it looks like unstyled
placeholder UI — no icon per slot, no distinct color/fill per state (ready vs. cooldown
vs. disabled — currently only conveyed by dim text, easy to miss at a glance), and a
large dead-space gap between the last supply slot and `EXIT`.

**Goal:** make every interactive element in this panel visually read as "a button with a
current state," consistent with the neon baked-glow visual language already established
elsewhere in the game (see `GAME_DESIGN.md` §11 and `v2/src/view/textures.ts`'s `bake()`
pattern, and the icon system in `v2/src/view/textureKeys.ts` / `v2/src/view/textures.ts`
already used for shop rows and side-weapon indicators).

**Suggested approach (not mandatory — use judgment, but stay consistent with existing
patterns rather than inventing a new visual system):**
1. **Icons per slot.** Ability slots should show the equipped ability's company icon
   (there's already a company-color/char system — see `ABILITY_COMPANY_COLORS` in
   `v2/src/viewmodel/companyColors.ts` and its use in `CardOverlay.ts`'s `addCard()` for
   the icon-circle pattern already used there — reuse that exact icon rendering, don't
   invent a new one). Side-weapon and reserve-supply buttons could similarly show their
   kind's icon (already baked as textures for the shop — `iconTextureForSideWeaponId()`
   etc. in `textureKeys.ts`).
2. **State color, not just text color.** Ready/cooldown/disabled should change the slot's
   *fill*, not only the label text color — e.g. a dim green fill tint when ready, matching
   how `updateAbilityBar()` already picks `0x0a1a0a` (ready) vs `0x0a0a12` (cooldown) for
   `slot.bg` fill — that logic already exists, just make the *visual contrast* between
   those two fills much stronger (they're currently both near-black and hard to
   distinguish), and extend the same state-color treatment to the toggle buttons
   (`AUTO-FIRE`/`REAR`/`AUTO-SHIELD`) and reserve-supply slots, which currently only use
   alpha (0.3 vs 1.0) to show disabled state.
3. **Close the dead-space gap.** Either compress the vertical layout (reduce
   `SupplyButtons.BUTTON_GAP`/spacing) or give the empty region a purpose (e.g. don't
   leave it blank — check whether `EXIT`'s position at y=518 is itself movable, or whether
   supply buttons should vertically center in the available space instead of top-aligning
   at a fixed `BUTTONS_TOP`).
4. **Left-handed mode** (`GAME_DESIGN.md` §4, listed in §14 as not yet implemented) is
   explicitly out of scope for this item — don't build a mirrored layout as part of this
   pass unless asked.

### Design decisions requiring confirmation
- Exact state-color palette for ready/cooldown/disabled across all button types (toggle
  buttons, ability slots, side-weapon button, supply slots) — should be **one consistent
  scheme** applied everywhere, not decided per-button-type ad hoc. Recommended: green-tint
  fill = ready/on, dim red or gray-tint fill = cooldown/off, low alpha = truly unavailable
  (no charges left, nothing equipped) — reusing the hue conventions already established
  per system in `palette.ts` (weapon cyan, shield blue, generator amber, motor magenta)
  where a button maps to one of those systems.
- Whether ability/side-weapon slots get real icons in this pass, or just improved state
  color as a smaller first step (icons touch more files: `companyColors.ts`,
  `textureKeys.ts`, and the slot-building code in `CombatScene.ts`).

### Complexity analysis
Every loop touched by this item is over a small, fixed-size collection already iterated
today (3 ability slots, ≤5 reserve-supply slots, 3-4 toggle buttons) — O(1) in practice,
no new O(N×M) risk. No new per-tick work is introduced; all changes are one-time
construction (`create()`) plus the existing per-frame `updateAbilityBar()` update, whose
cost is unchanged (same number of slots, just richer per-slot rendering).

### Test plan
- [x] `preview_screenshot` before/after for: all-ready state, one ability on cooldown, no
  side weapon equipped, reserve supply empty (0 charges) — confirms every state is
  visually distinct at a glance without reading text.
- [x] Confirm the ability-slot resize done in the prior pass (`ABILITY_SLOT_H = 28`, etc.)
  is still respected — no new overlap with `SupplyButtons.BUTTONS_TOP` or `EXIT`.
- [x] `pnpm dlx fallow` clean (no new duplication — if per-slot icon/state-color logic is
  copy-pasted across toggle buttons, ability slots, and supply slots, extract a shared
  helper instead, matching this codebase's existing pattern of shared renderers in
  `shipRenderers.ts`).
- [x] `pnpm build:dry`, `pnpm lint`, `pnpm test` all clean.

---

## File hygiene

No hardcoded personal paths, credentials, or TODO comments expected in any of the touched
files (`CardOverlay.ts`, `SoundManager.ts`, `CombatScene.ts`, `SupplyButtons.ts`,
`palette.ts` if new colors are added). `conveyor.ts` is explicitly **not** touched by this
plan (see item 3). If you find any pre-existing TODO/FIXME while editing these files, flag
it in your summary rather than silently fixing or ignoring it.

---

## Checklist

**Design decisions**
- [x] Item 1: SKIP button placement — proceed with recommended (side-by-side, SKIP left)
- [x] Item 2: rear-weapon sound approach — proceed with recommended (distinct, detuned)
- [x] Item 3: visual treatment for collision feedback — proceed with recommended (reuse
  existing pulse-ring/burst machinery, collision-specific color/timing)
- [x] Item 4: state-color scheme — proceed with recommended (green/red/gray-tint fills,
  one consistent system across all button types)

**Guardrails**
- [x] Item 3 never touches `conveyor.ts`, `SHIELD_BURST_RETURN`, or
  `COLLISION_DAMAGE_MULTIPLIER` — the mechanic is settled design, only its legibility
  changes
- [x] No swallowed exceptions introduced; this is UI/audio wiring, no new error paths
  expected, but if any are added they fail loudly per existing codebase convention

**Performance**
- [x] No new per-tick or per-frame O(N×M) loops (see Item 4's complexity analysis; items
  1-3 don't touch the tick loop at all)

**Readability**
- [x] No function exceeds 100 lines / 5 params (existing ESLint rule, already enforced)
- [x] Shared state-color/icon logic extracted once, not duplicated across button types

**Testability**
- [x] Item 1's skip path is already covered by `v2/src/core/cards.test.ts` — no new core
  test needed, this item is view-only
- [x] Items 2/3/4 are view-layer and audio-trigger work with no existing test harness in
  this codebase for either — manual/visual verification via `preview_screenshot` is the
  correct and expected verification method (per `v2/CLAUDE.md`'s mandatory visual
  verification rule), not a gap to apologize for

**File hygiene**
- [x] No hardcoded personal paths, usernames, or credentials
- [x] No new TODO/FIXME left without a tracking note in your final summary

**CI**
- [x] `pnpm build:dry` passes
- [x] `pnpm lint` passes
- [x] `pnpm test` passes with no new failures
- [x] `pnpm dlx fallow` shows no new duplication/complexity issues beyond the two
  pre-existing flags already known in this codebase (`CombatScene.update`,
  `tools/balance-sweep.ts formatReport`) — do not attempt to fix those two as part of this
  plan, they're out of scope
