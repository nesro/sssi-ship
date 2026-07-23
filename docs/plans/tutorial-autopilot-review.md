# Tutorial autopilot — dev tool for watching the new-player journey play out

## Context

`docs/design/15-new-player-experience.md` documents the intended t1→t2→t3→t4 journey;
`v2/tools/onboarding-audit.ts` (`pnpm onboarding`) checks it holds structurally, headless,
using cheats (`combat.fastForward`, `startMission`) to skip straight between states. That
tool answers "does the journey still work," not "what does it look like" — Tomáš asked
for something he could actually watch play out, tap by tap, in his own browser.

Two things got built:

1. **`v2/src/view/tutorialAutopilot.ts`** + a **"▶ WATCH TUTORIAL AUTOPILOT" button** on
   `AlphaNoticeScene` (the first screen). Plays the whole t1-t4 journey with synthetic
   taps on the real canvas and real combat time — no fastForward/instant-win cheats.
2. **`HubScene`'s "RESET PROGRESS" button** no longer full-page-reloads (which
   re-triggers the every-launch alpha/terms notice) — it resets and lands straight back
   in the hub, since this button is only reachable from inside the hub in the first
   place.

## How the autopilot actually works

Same technique `onboarding-audit.ts` already uses for headless Playwright (`window.
__game.scene`, text-object bounds → tap coordinates), ported to run directly inside the
live game against `this.game` instead of a headless page. No new interaction surface on
the scenes themselves — it drives the exact `setInteractive()`/`pointerdown` handlers a
real tap would.

t1 always fails its first real attempt (0% clear on starter gear) and t3's card order is
fixed, so both are scripted deterministically. t2 only fails ~90% of the time — the run
checks which result screen actually appeared (`GO TO SHOP ▸` vs `NEXT MISSION ▸`) and
adapts instead of assuming a fail.

## What "real taps" turned out to require (four real bugs, not one)

Every one of these was found by watching a real run get stuck, not by inspection:

- **`mousedown`/`mouseup`, not `pointerdown`/`pointerup`.** Phaser's default
  `MouseManager` listens for real `MouseEvent`s on the canvas — a synthetic
  `PointerEvent` dispatch is silently ignored. First attempt did nothing at all; no
  error, just a frozen terms checkbox.
- **The tick-0 narrator is a blocking modal, not the auto-hiding bottom bar.**
  `core/tick.ts` freezes the whole sim while `state.pendingNarrator !== null`, and that
  only clears when the modal's own CONTINUE/NEXT→ is tapped. `NarratorBar`'s
  `AUTO_HIDE_AFTER_MS` is a different, non-blocking system. Missed this initially and
  every mission just sat at tick 1 forever.
- **The shop has its own one-time coach-mark tour**, separate from the hub's main-menu
  tour. Its backdrop swallowed the tab-switch tap on a genuinely first shop visit — the
  generator switch silently no-opped, and the failure only surfaced two steps later on a
  now-mysteriously-missing "Surge" label.
- **`t4`'s `supportCallTicks` card offer blocks the tick loop the same way
  `pendingNarrator` does** — missed on the first t4 pass, sim froze at exactly tick 90
  (`seconds(9)`, the offer's own scheduled tick).

Card-overlay detection needed its own fix too: t3's offer isn't the only interactive
`Rectangle` on screen during combat — the HUD's AUTO-FIRE/REAR/AUTO-SHIELD toggles and
the modal's own full-screen backdrop are also interactive Rectangles (confirmed live: 10
interactive rectangles present, not 3). Landed on filtering by `CardOverlay.ts`'s known
150×200 logical card size (bracketed 120-180 × 170-230) rather than trying to
distinguish by anything else available on the object.

## Verification

Three consecutive full end-to-end runs against the live dev server, no manual
intervention: two hit t2's fail→shop→retry path, one hit the ~10% lucky-win path — both
branches confirmed clean. `pnpm test` (753/753), `lint`/`lint:comments`/`build:dry`
clean, `dlx fallow` unchanged from baseline.

## Open questions worth a second opinion on

1. **Should this ship in production builds at all?** It's currently unconditionally
   visible on `AlphaNoticeScene` (not gated behind `devMode`, unlike the DEV TOOLS
   section in Settings) — reasoned at the time that the whole screen is already
   dev/alpha-only messaging, but that reasoning wasn't stress-tested against an actual
   release-build path.
2. **Is dispatching synthetic `MouseEvent`s directly on the game canvas an approach
   worth keeping**, or is there a cleaner in-repo way to drive the same scenes
   (e.g., exposing a proper "simulate tap" hook on each scene instead of raw DOM event
   spoofing)? The current approach works but is coupled to an implementation detail of
   Phaser's input manager that isn't part of its public contract.
3. **The card-detection size filter (120-180×170-230) is a re-derived magic number**,
   not shared with `CardOverlay.ts`'s own private `CARD_WIDTH_LOGICAL`/
   `CARD_HEIGHT_LOGICAL` constants — if either changes, this silently drifts out of
   sync with no compiler error. Worth exporting the real constants instead, or is that
   overkill for a dev-only tool?
4. **Polling loops (150-200ms sleep intervals) throughout, rather than any event-driven
   wait** — simple and it works, but is this the right pattern to leave in the
   codebase, or should it lean on Phaser's own event emitters where they exist (e.g.
   scene `shutdown`/`create` events) instead of time-based polling?
5. **Is the unconditional RESET PROGRESS behavior change (skip the alpha-notice screen
   on reset) actually fine for a real end user**, or should it only apply when `devMode`
   is on — given `devMode`'s own default is inconsistent between `AlphaNoticeScene.ts`
   (`=== true`, defaults off) and `HubScene.ts` (`!== false`, defaults on), which is a
   separate, pre-existing bug not fixed as part of this work.
