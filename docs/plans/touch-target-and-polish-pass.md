# Touch-target compliance + iteration-loop polish pass

**Status:** reviewed by Fable 2026-07-16, corrections folded in below, now implementing.
First round of an open-ended polish loop (per Tomáš, 2026-07-16): use the design docs as
the "should look/feel" reference, the simulator for balance safety, and the Playwright
screenshot harness (`v2/tools/screenshot.ts`) to visually verify — repeat until nothing
embarrassing survives a cold look at the dev server. No deadline; go deep.

## Corrections from Fable's review (before any of this was implemented)

- **The "500px available, ~520px needed at zero gaps" math was wrong.** Real inventory:
  4 toggle rows (worst case) + 3 ability slots + 3 supply rows (worst case) + 1 exit = 11
  rows × 44px = 484px, which *fits* in the 500px safe area (20-520) with 16px to spare —
  not "impossible." The honest framing: it fits with **zero breathing room** (16px total
  slack spread across 10 row boundaries), which still means naive in-place enlargement
  makes every row boundary a mis-tap hazard. The redesign is still justified; the
  original "doesn't fit" claim was not accurate and has been corrected here.
- **The exit button already violates the 20px edge rule today, independent of this
  plan.** `CombatScene.ts`'s exit button is centered at y=518 with height 24 → bottom
  edge at 530, i.e. **10px from the screen edge**, inside Android's gesture-nav dead
  zone. This contradicts the design doc's own claim ("bottom of the button panel sits at
  y ≤ 520") — that doc line is stale and gets a `known-issues.md` entry. Fixed as part of
  this round's scope, not deferred: the redesigned layout reserves the bottom 44px+gap
  for exit specifically so its hit area never crosses y=520.
- **Nothing was checking for hit areas overlapping each other** — the exact failure mode
  this plan warns about for naive enlargement was never actually tested for, including
  retroactively against finding 1's already-shipped fix. The auditor (see below) now
  asserts pairwise non-overlap, not just minimum size.
- **The auditor is now a committed tool**, not a one-off scratch script:
  `v2/tools/tap-target-audit.ts`, checking three things every future round can rely on:
  minimum 44×44 size, pairwise hit-area overlap, and the 20px screen-edge rule. Built to
  recurse into Phaser Containers even though zero exist today, so it doesn't silently
  undercount the first time one is added.
- **Visual row heights grow along with the new spacing, not just hit areas.** Finding 1's
  invisible-padding trick was right for a game-wide sweep of already-reasonably-sized
  buttons, but the combat panel's rows are currently 14-36px tall with tiny labels;
  leaving the visuals that small inside much bigger invisible hit areas would fix
  tappability while leaving the actual player-visible legibility problem in place.
- **Explicit invariant: layout is computed once at `create()`, never reflows mid-run.**
  Every input to row count (loadout, owned supply types) is fixed at mission start
  today — worth stating so a future change doesn't recompute on `update()` and move
  buttons under the player's thumb mid-fight.
- **Combat-panel loadout-state screenshots (minimal/rear-only/endgame) are pulled into
  this round's scope**, not deferred to the coverage-expansion round — needed to actually
  see the before/after of the layout change itself.
- Logged for Tomáš, not blocking this round: whether the 44px rule in
  `04-screens-and-layout.md` means logical or physical device pixels — 44 logical px at
  typical landscape phone scaling is under both Android's 48dp and Apple's 44pt guidance.
  Ties into the already-flagged on-device smoke test.

## What triggered this

`docs/design/04-screens-and-layout.md`'s mobile safe-zone rule is explicit and testable:

> Interactive tap targets require a minimum touch area of 44×44 px. This is a hard rule
> for every scene.

Nobody had ever actually measured against it. I wrote a runtime auditor (`page.evaluate`
walking every scene's `children.list`, reading `obj.input.hitArea` back in logical px)
and ran it across every reachable screen. Findings below are runtime-measured, not
estimated.

## Findings

### 1. Every `addTextButton` (widgets.ts) was under 44×44 — game-wide, fixed already
Every font size actually used in the game (11 through 22) produces a text+padding box
under 44px tall from font metrics alone — even the *largest* button in the game (size 22,
main-menu nav) measured ~43px. This is nearly every button in the hub: BACK, DEBUG,
settings toggles, dispatch pagination, card-overlay SKIP/REROLL, exit-confirm
CONFIRM/CANCEL, result-screen CONTINUE, supply buy/sell (−1/+1).

**Fixed:** `ensureMinTapTarget()` in `widgets.ts` — expands a GameObject's Phaser
`hitArea` symmetrically around its existing visual bounds to at least 44×44 logical px,
using a custom `Rectangle` hit area. The button's *visual* size is untouched; only the
tappable area grows. Wired into `addTextButton` itself, so every call site gets it for
free. Verified at runtime: the smallest button ("‹ BACK", 11pt) now measures exactly
44.0×44.0.

### 2. Combat right panel: toggle buttons, ability slots, supply buttons, exit — all under 44, and packed too tightly to just enlarge in place
Runtime-measured on a live mission:
- Front-weapon / shield toggle buttons (`CombatScene.buildToggleButtons`): **120×14px**,
  rows only 18px apart.
- Ability slots (`buildAbilitySlots`): **120×28px**, rows 34px apart.
- Supply/boost buttons (`SupplyButtons.ts`): **120×36px**, rows 42px apart.
- Exit button: **120×24px**.

Unlike finding 1, these can't be fixed by `ensureMinTapTarget` alone: that helper
expands a hit area *around* an element's current position, but these rows are spaced
18-42px apart — closer than the 44px a compliant hit area needs. Naively expanding each
in place would make adjacent controls' hit areas overlap (e.g. tapping near the boundary
between AUTO-FIRE and REAR could hit either), trading a "too small to tap" bug for a
"taps the wrong thing" bug.

**The panel has zero breathing room for a fixed-position fix, corrected math:** usable
safe area is 20-520px (500px). Worst case (rear+side weapon+3 supplies all equipped —
plausible endgame, not a corner case): 4 toggle rows + 3 ability slots + 3 supply rows +
1 exit = 11 rows × 44px = 484px, leaving only 16px of slack across 10 row boundaries.
That's not "impossible" (Fable's review caught this — the original doc draft overstated
it), but it is functionally zero margin: naive in-place enlargement still makes every
row boundary a mis-tap hazard.

**Fix — dynamic Y-cursor layout, exit reserved at the bottom:**
Currently every row (toggle buttons, ability slots, supply buttons, exit) is placed at a
hardcoded Y offset, with conditional rows (rear/side toggle) just going invisible in
place rather than freeing their slot — this is exactly what caused the original
"BUTTONS_TOP was never adjusted" bug flagged in an earlier commit.
- Reserve the bottom of the panel for exit first: hit-area bottom edge must be ≤520 (the
  design doc's edge rule, and the fix for exit's current real violation — see corrections
  above). Exit hit area 44 tall → center ≤498, top of its reserved zone at 476.
- Flow everything else (toggles, ability slots, supplies) top-down from y=20 with a
  shared cursor: each section asks "how many rows do I actually need" (2-4 for toggles
  depending on rear/side equip state, 0-3 for supplies depending on how many types are
  owned) and advances the cursor by exactly `rows × 44`, plus a small fixed gap between
  sections (not within one) for visual grouping.
- Worst case (10 flowing rows): 10×44 = 440px + 3 inter-section gaps ≈ 450-460px, fits
  comfortably before the exit zone starts at 476.
- Row *visuals* render slightly smaller than the 44px pitch (e.g. 40px tall) so adjacent
  rows read as visually separated even though their hit areas sit pitch-to-pitch with
  zero gap — hit areas never overlap by construction (pitch = hit height = 44 exactly).
- Common early-game loadouts (no rear/side weapon yet, 0-1 supply types) get generous
  leftover whitespace between the flowing content and the reserved exit zone for free.
- Layout is computed once in `create()` from loadout/supplies state, which never changes
  mid-mission — never recomputed in `update()` (see corrections above).
- No more silent "forgot to adjust when a new row was added" class of bug — the cursor
  makes every section self-accounting.
- Escape hatch if real numbers come out tighter than expected: pack supply buttons two
  columns wide (the panel is 120px usable width, plenty for two ~55px-wide buttons)
  instead of shrinking anything below 44px.

### 3. Galaxy map: tutorial nodes have a smaller hit zone than main-mission nodes
`HubScene.renderGalaxyNode`: visual radius is deliberately smaller for tutorials
(`r = isTutorial ? 6 : 8`, presumably to visually rank them below main missions), but the
hit-zone radius derives from the same `r` (`hitR = Math.max(r + 14, 20)`), so tutorial
nodes measure 40×40 vs. main missions' 44×44. Small, but a real, measured violation.
**Fix:** decouple hit-zone size from visual size — `Math.max(r + 14, 22)` guarantees 44px
regardless of the visual dot's radius.

## Not yet done — next passes in this loop

- **Text-overflow sweep.** Spot-checked the two highest-risk spots (CardOverlay's
  wordWrap regions, against the longest actual card name/description in
  `data/cards.ts`) and both have comfortable margin today. Have not yet swept every
  screen systematically (dispatch cards, shop detail panels, settings, mission map
  labels) — planned for the round after this one, once the touch-target fix lands and
  the harness is confirmed still green.
- **Screenshot coverage gaps.** The current harness (10 shots) doesn't cover: shop tabs
  other than weapon (ship, rear-weapon, side-weapon, shield, generator, motor,
  supplies), the main menu, result screen (victory/defeat), card-overlay mid-open,
  exit-confirm mid-open, narrator modal mid-open. Expanding this is part of the next
  round so future passes don't rely on spot-checks.

## Verification plan

1. Implement the panel-layout cursor change in `CombatScene.ts`/`SupplyButtons.ts`.
2. Re-run the runtime tap-target auditor across every screen — must show 0 elements
   under 44×44 (including the loaded-endgame case: rear+side weapon+3 supplies
   equipped).
3. Re-run the full `pnpm screenshot` batch — confirm no visual regression (rows still
   read as a coherent group, nothing overlapping visually even though hit areas don't).
4. `pnpm test`/`lint`/`build:dry` — must stay green throughout (no core changes here,
   view-layer only, so no balance re-verification needed).
5. Send the before/after screenshots to Fable for an independent look specifically at
   whether the new spacing reads as intentional or as "there's suddenly a lot of empty
   space."

## Result (2026-07-16)

Implemented, verified, all green. `pnpm audit-taps` (the committed tool, min-size +
overlap + edge checks) now passes clean on every hub screen and both combat loadout
states (minimal and the rear+side+3-supplies endgame case). `pnpm test`/`lint`/`build:dry`
stayed green throughout (591 tests). Screenshot batch confirms no visual regression —
the endgame panel looks intentionally full, not cramped, and the minimal-loadout panel
has generous breathing room.

**Two real bugs found *during* implementation, not anticipated by the original plan:**
- `addTextButton`'s `ensureMinTapTarget` call ran *before* several callers' follow-up
  `.setOrigin(0, 0.5)` calls, computing the hit area against the wrong (default 0.5,0.5)
  origin — desyncing the hit area from where the button actually rendered. Affected
  BACK/DEBUG and every settings-screen button. Fixed by adding `originX`/`originY` to
  `TextButtonOptions` so the final origin is set before the hit area is computed, and
  updating all 7 affected call sites to pass origin up front instead of mutating it
  after. This is exactly the "a bigger hit area silently overlaps something else"
  failure mode the plan predicted for the combat panel — it just showed up somewhere
  the plan didn't expect first.
- An off-by-one in the new cursor math: rows were centered at the *top* of their pitch
  slot instead of the middle, which for the very first row (right at the top safe-zone
  edge) triggered `ensureMinTapTarget`'s edge-clamp, silently shifting it down into the
  next row's space. Fixed by centering every row at `cursor + ROW_PITCH / 2` instead of
  `cursor`. Also caught (same root cause) a 6px overlap between the last supply button
  and the reserved exit zone in the tightest loadout case, fixed by trimming
  `SupplyButtons`' own leading offset from an arbitrary +28 to the same `+ROW_PITCH/2`
  pattern.

**One finding reviewed and accepted, not fixed:** the auditor flags enemy sprites
(tap-to-target hit areas) with negative top-edge values shortly after they spawn. This
is enemies entering from off-screen by design — a player can't tap something that isn't
visible yet, and by the time it's reachable it has moved into a valid position. Not a
UI-element violation in the sense the design doc's rule is about; left as an accepted,
documented exception rather than forcing gameplay entities to respect a rule meant for
static buttons.

Fixed also, incidentally found by the same audit runs: shop tab rail's last row 1px
from the bottom edge, dispatch reinforcement rows flush against the left edge (0px),
and the settings screen's dev-tools buttons overlapping each other by 6px.

Committed as a permanent tool: `v2/tools/tap-target-audit.ts` (`pnpm audit-taps`),
covering every hub screen and two combat loadout extremes, checking min-size,
pairwise-overlap, and the 20px edge rule together. Also extracted
`v2/tools/playwrightHarness.ts` — shared Playwright plumbing (`cheat`, `waitForMissionReady`,
`advanceUntil`, `flushPendingOffer`, `bootToHub`) now used by both `screenshot.ts` and
`tap-target-audit.ts`, so future tools in this loop don't re-derive it.

Next round: expand screenshot coverage (task queued) and the text-overflow sweep
(task queued), both deferred from this round as planned.

## Round 2 (same session, 2026-07-16): coverage expansion + text-overflow sweep

Both deferred items done in the same pass rather than a separate round, since the
tooling was already warm.

**Screenshot coverage** expanded from 10 to 21 shots: added the main menu, all 8 shop
tabs previously uncovered (ship, rear-weapon, side-weapon, shield, generator, motor,
loadout, supplies), the exit-confirm modal, and ResultScene's victory screen. Two new
dev cheats made the last two reachable headlessly: `combat.showExitConfirm()` (opens the
modal without a real tap) and letting `combat.fastForward` run long enough (6000 ticks)
for a mission to actually resolve, then waiting out the real `time.delayedCall` that
gates the `ResultScene` transition. Also extended `tap-target-audit.ts` to cover the
exit-confirm modal and ResultScene, which surfaced one more thing to fix: the auditor
was flagging `addModalBackdrop`'s full-screen click-catcher rectangle as if it were a
malformed 960×540 button (and everything else as "overlapping" it) — a true false
positive, since a backdrop's entire job is to cover the whole screen. Fixed by excluding
any hit box covering ≥90% of the screen in both dimensions from the auditor's checks.

**Text-overflow sweep:** visually reviewed all 21 screenshots at native resolution.
Zero overflow, clipping, or misalignment found anywhere — every shop tab, the loadout
summary, supplies, dispatch cards, and the mission map all render cleanly within their
containers. (Earlier in this session, a code-level check of the two highest-risk
wordWrap regions — CardOverlay's name/description text — against the longest actual
strings in `data/cards.ts` also came back with comfortable margin; this round's visual
sweep didn't turn up a case that check would have missed.)

**Final state:** `pnpm audit-taps` passes clean across all 11 audited states (7 hub
screens/tabs + 2 combat loadout extremes + exit-confirm modal + ResultScene) except the
one documented, accepted exception (enemy sprites spawning off-screen). `pnpm test`
(591 tests) / `lint` / `build:dry` all green throughout every step of both rounds.
