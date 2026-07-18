# Comprehensive coverage sweep — closing the gap between "verified" and "everything"

## Why this plan exists

Tomáš: "I am afraid that I will start the game and I will see things that are wrong."
Three prior `/polish-loop` rounds this session were real but *ad hoc* — each found
genuine bugs (a star-list overflow, a narrator-modal desync, several tap-target
violations) by noticing a gap and closing it, not by working from a complete inventory.
This plan replaces that with a real inventory, sent to Fable for an adversarial
completeness pass before any execution — the point of that review was to find gaps in
the gap-hunting itself, and it found real, structural ones (documented inline below,
not just folded in silently). This is the revised plan, post-review.

## Current coverage inventory (2026-07-16)

16 `tap-target-audit.ts` STATES, 32 `screenshot.ts` SHOTS, covering all 5 scenes and
most interaction *patterns* (toggles, modals, overlays). What's actually missing, per
Fable's review, sorts into four kinds of gap — not just "more screenshots":

1. **Missions/enemy-kinds never rendered** — m2/m3/m5 combat, t1-t4 combat, w0 combat.
2. **An entire save-state axis never varied** — every hub/shop/map shot runs against
   the same one or two save states (fresh, or `unlockAll` w/ ~0 coins). Locked/partial
   progression, rich-with-nothing-owned, broke-in-the-shop are all unrendered — and
   **the most common real-player state (mid-progression) can't even be reached by any
   cheat that exists today.**
3. **Player interactions with no `__cheat` hook** — card pick/reroll/skip-to-exhausted,
   ability activation, side-weapon manual fire, supply BOOST activation. `cheatFastForward`
   auto-picks card 0 always; none of the others are reachable at all headlessly.
4. **Automatable risk classes mis-filed as "out of scope"** — DPR≠1 rendering (the
   entire point of this game's `zoom: 1/DPR` sizing system) and transient/animated
   visuals (fading titles, floating numbers, bolt travel) are both testable headlessly;
   the previous draft of this plan wrongly bucketed them with real-device-only concerns.

## Genuinely out of scope (real, not padding)

Real device testing (touch feel, GPU, memory pressure), audio correctness, and save
migration edge cases beyond `SaveManager.test.ts`'s existing coverage. Named so the
residual risk after this plan is explicit, not implied to be zero.

## Plan of work, in execution order

**Phase 0 — tooling correctness first (everything downstream depends on this being right):**
- Fix `screenshot.ts`/`tap-target-audit.ts` to **fail the run on any `pageerror`**, not
  just log it — a mid-shot exception currently still prints `✓`.
- Decouple `unlockAll()` from `hub-main-menu`'s setup — it currently only runs there, so
  `pnpm screenshot hub-shop-weapon` alone renders a *different* shop than a full-batch
  run does. Move progression setup into each shot's own setup (or a shared per-shot
  prefix), so any shot is correct in isolation, not just in full-batch order.
- Add missing `__cheat` hooks, since several states below can't be reached without them:
  `combat.pickCard(index)` / `combat.rerollCard()` / `combat.skipCard()` (mirrors
  `resolveAbilityAction`'s existing action codes — no new core logic, just exposing what
  `cheatFastForward` already calls internally with a hardcoded 0), `combat.activateAbility(slot)`,
  `combat.fireSideWeapon()`, `combat.activateSupply(slot)`, and a save-mutator cheat for
  **partial progression** (e.g. `setProgress(missionIds[])` — completes exactly the
  named missions/stars, unlike `unlockAll`'s all-or-nothing).
- Add `deviceScaleFactor: 2` (or 3) as a **second full pass**, not a one-off — either a
  `--dpr` flag on both tools or a second CI-style invocation, so DPR-scaled rounding and
  text sharpness get the same systematic coverage as DPR 1, matching what the
  "dpr-sharp" config in `main.ts` actually exists to protect.
- Give each combat shot an `advanceUntil(hasKind(...))`-style predicate for the specific
  enemy kind it claims to show (matching `combat-m3b-booster`'s existing pattern),
  instead of a fixed tick count — "no need to hunt for a unique mechanic" was wrong;
  without a real predicate, a fixed-tick shot can silently miss the kind entirely.

**Phase 1 — first-run coverage (promoted to co-equal top priority per Fable's review:
this is literally what "I will start the game" means):**
- Fresh-save hub main menu and galaxy map (no `unlockAll`).
- Onboarding → hub landing (tour over a *genuinely* fresh save, not `unlockAll`'s).
- `t1` combat (forced `weaponId: null` — untested AUTO-FIRE-with-no-weapon rendering).
- `t1` **victory ResultScene** (`stars: []` — a real player's first-ever result screen).
- `w0` combat (not just its narrator modal) and `w0`'s **victory ResultScene**
  (`'w0-branch'` TUTORIAL/EXPLORE layout — a third, structurally distinct ResultScene
  layout that's fully described in `ResultScene.ts` and currently has zero coverage).
- Mid-progression galaxy map (some locked, some partial-star) — needs Phase 0's new
  `setProgress` cheat.
- **Locked-mission detail panel** — this is already `known-issues.md`'s top open entry;
  this plan should either force the `canStart`-gating decision or explicitly schedule
  the state so the existing open item gets resolved, not re-discovered a fourth time.

**Phase 2 — remaining missions/tutorials, indexed by enemy kind, not mission:**
- `m2`, `m3`, `m5` combat — each with an `advanceUntil` predicate for a kind not yet
  screenshotted anywhere: **`guardian`** (currently zero coverage — only appears in
  t1/t3/w0), `tank` (m2/m3/m3b/m6), `turret` (m4/m6), `swarm`/`kamikaze` (m5/m6, and
  note the existing `combat-m6-boss` shot's predicate waits for `boss`, not swarm, so
  it's not covering swarm just because it's technically "on m6").
- `t2`, `t3`, `t4` combat (t2: `weaponId: 'pulse-1'` forced low-level; t3: the
  unkillable-regen guardian; t4: gifted supplies — each is a distinct forced-state
  render, not a formality).

**Phase 3 — interaction states, now reachable via Phase 0's new cheats:**
- Card overlay: a picked-card state, a rerolled state, and the **reroll-exhausted
  layout** (`CardOverlay.ts` — SKIP re-centers alone, a distinct branch from the normal
  SKIP/REROLL pair, never rendered).
- Ability bar: ACTIVE / `CD n` / READY fill states (currently only reachable by luck
  during a long auto-pick fastForward).
- Side-weapon manual fire: charge-decrement label, bolt-travel visual, empty/disabled
  fill state (shipped recently, zero verification since).
- Supply BOOST activation mid-combat.
- Settings: MUSIC/SFX OFF label states, and confirm the DEV TOOLS section (only ever
  audited with `devMode` implicitly on/off by whatever the ambient save state was, never
  deliberately both ways).

**Phase 4 — save-state × shop-chip-state matrix:**
- Shop chip states (`HubScene.ts`'s equipped/purchasable/unaffordable/locked, 4 alphas)
  — deliberately hit each of the 4, not whichever ones a shot's ambient coin balance
  happens to produce. `setCoins` already exists for this.
- Coins pushed past 1,000,000 (top-bar overflow check — dynamic width, no fixed box).
- Every shop system fully maxed (trade-in prices at "already equipped," not "buyable").
- Rich save, nothing purchased beyond starter gear.

**Phase 5 — transient/animated visuals (needs a real capture strategy, not just
`waitForTimeout`):**
- Combat mission-title fade-out (`CombatHud.ts`'s persistent name label is the one
  that matters for a static screenshot — the fading title text is expected to be gone
  by settle time and isn't itself a bug target).
- Low-hull red vignette, death flash, floating heal numbers, side-weapon bolt travel,
  shop-preview demo-fire — each needs a shot timed to *catch* the transient state
  (a specific tick offset or an `advanceUntil` on the underlying condition), not just
  "whatever's on screen after the normal settle delay."
- Scene-transition/restart states beyond the one already covered: retry-from-defeat,
  result→hub→same-mission-again, exit-confirm ABANDON→hub. (This is the exact class
  that produced the already-fixed WebGL restart crash — worth deliberately re-covering,
  not just trusting the one fix generalizes.)

## Verification (same as every prior round, run after each phase, not just at the end)
`pnpm lint && pnpm build:dry && pnpm test && pnpm audit-taps && pnpm screenshot` — and
actually open every new/changed screenshot. Log findings to `docs/known-issues.md`
immediately per the established pattern. Resolve (not just re-log) the two known-issues
entries this plan directly touches: locked-mission `canStart` gating, and `w0`
reachability (Phase 1's `w0` coverage should make explicit whether this plan treats it
as "test via cheat, real reachability still blocked on WelcomeScene" — matching the
existing known-issues framing — or surfaces a reason to revisit that).

## Scope note

This grew substantially from the pre-review draft — Phase 0 alone adds five new cheats
and a DPR-pass mode, which is more than pure UI polish (it's closer to "extend the test
harness's reach"). Flagging this size increase explicitly rather than silently
executing it: worth confirming this full scope is wanted before starting, versus
prioritizing Phases 0-1 (tooling correctness + first-run coverage, the two Fable
ranked highest) as a first pass and treating 2-5 as follow-on rounds.
