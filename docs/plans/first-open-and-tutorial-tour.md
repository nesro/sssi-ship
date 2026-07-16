# First-open experience + "where are the buttons" tour

## Context

Today, `BootScene.create()` (`v2/src/view/BootScene.ts:37-40`) goes straight to
`HubScene` — a brand-new player lands on the bare main menu (EXPLORE NEARBY SPACE / SHIP
CONFIGURATION / DISPATCH REINFORCEMENTS / SETTINGS) with zero guidance, no
introduction, nothing pointing at what anything does. Tomáš asked for two things: a
better first-open experience, and "a tutorial that will show you where buttons are and
what they do."

**Two things already exist in docs and are relevant, and one thing is explicitly out of
scope — read this before touching anything:**

1. `docs/design/04-screens-and-layout.md`'s "First launch & story" section specs a full
   `WelcomeScene`: Captain Nesro portrait, a personal developer message Tomáš writes
   himself, then a story intro. `docs/design/14-status.md` lists this as **not built,
   content not written yet — "content tasks for Tomáš."** That's a hard content
   dependency on Tomáš's own writing, not something to build around or draft placeholder
   copy for. **Out of scope for this work.** Don't build `WelcomeScene`, don't write
   developer-message copy, don't add a `save.welcomeSeen` field (it doesn't exist yet —
   the design doc describes a target state, not current code).
2. `docs/plans/tutorial-minimalism-and-onboarding.md` already fully specs an unbuilt
   "tutorials or skip?" prompt, explicitly **decoupled from `WelcomeScene`'s story
   content** — i.e. designed to be buildable independently of #1's content block. This
   is real, ready-to-build scope: **Part A below** (with two corrections to that doc's
   original spec — see Part A).
3. A guided "here's what this button does" UI tour (coach marks / spotlight overlay) has
   no existing spec anywhere. This is genuinely new: **Part B below**.

**Also found while researching this** (logged to `docs/known-issues.md`, not fixed
here): `w0` (Calibration Run) already ships a real TUTORIAL/EXPLORE branch-choice screen
on its result screen (`ResultScene.ts:57-76`, persists `save.firstBranchChoice`) —
dormant only because `w0` is unreachable (no galaxy-map node, no boot redirect; its
intended launcher is the still-blocked `WelcomeScene`). This plan builds an independent
`OnboardingScene` that asks a similar question without touching `w0`. **When
`WelcomeScene` ships, someone needs to reconcile the two** (most likely retire `w0`'s
branch screen) — flagged in known-issues.md, not solved here since `w0`/`WelcomeScene`
aren't reachable yet and speculatively unifying now would mean designing against a
screen nobody can see.

Existing tutorial missions (t1-t4, `docs/design/09-mission-progression.md`) already
teach *combat mechanics* in-mission via forced loadouts and the narrator typewriter bar
(shield tanking, energy brownout, cards, supplies). Part B is not a replacement for
that — it's for the **hub UI** (persistent menu navigation), which nothing currently
explains at all.

## Scope split — flagging for review, not deciding unilaterally

**Phase 1 (this round): onboarding prompt (Part A) + a hub-only button tour (Part B,
the 4 main-menu buttons only — not the ★/coins top bar, which doesn't even render on
the main menu screen; it only appears once you've navigated into a section).**
**Phase 2 (later, only if Phase 1 lands well): a combat-panel tour** (AUTO-FIRE /
AUTO-SHIELD / REAR / BOOST / EXIT / tap-to-target). Deferring Phase 2 on purpose: t1-t4's
narrator bar already explains most combat-panel elements contextually, as they're
introduced (t2 introduces energy/brownout right when the AUTO-FIRE toggle starts
mattering, t4 introduces supplies right when BOOST buttons appear). A second, static,
all-at-once tour covering the same ground risks conflicting with or duplicating that
live narration rather than helping. Worth deciding after Phase 1 ships and (ideally)
gets played, not guessed at now.

## Part A — Onboarding prompt (tutorials or skip)

Mostly what `tutorial-minimalism-and-onboarding.md` already specs, with two corrections
found while planning this round:

- **Fresh-save detection**: `completedMissionIds.length === 0 && coins === 0 &&
  !w0Completed` (exactly `defaultSave()`'s starting state) — as originally specced.
- **Correction 1 — a new `onboardingSeen?: boolean` save field IS needed, contradicting
  the original doc's "no new field" plan.** The original plan claimed "once a choice is
  made, the save is no longer fresh, so the prompt naturally never reappears" — true for
  "Skip" (it mutates `completedMissionIds` immediately), **false for "Start with
  tutorials"** (which the original doc specs as "no mutator — it's simply 'don't
  skip'"). A player who picks tutorials, then closes the tab before finishing any
  mission or earning any coins, still matches the fresh-save check on next launch and
  sees the full onboarding prompt *and* auto-tour again — every time, until they
  actually complete something. Fix: both buttons set `onboardingSeen: true`
  immediately on tap (an optional field, same pattern as existing `w0Completed?:
  boolean` — no `SAVE_VERSION` bump needed). The fresh-save/trigger check becomes
  `!save.onboardingSeen` alone (still true for every existing pre-this-change save,
  since the field is absent/undefined there, which is the correct "hasn't seen it yet"
  default).
- **New `SaveManager.ts` mutator** `skipTutorials(save)`: adds `t1`/`t2`/`t3`/`t4` to
  `completedMissionIds` (so `m1` unlocks via `MISSION_UNLOCK_EDGES`, and t2-t4 don't sit
  around looking like unclaimed locked content) and sets `onboardingSeen: true`, grants
  **zero** coins. "Start with tutorials" just sets `onboardingSeen: true`.
- **New `OnboardingScene.ts`**, inserted `BootScene` → (`!save.onboardingSeen`?) →
  `OnboardingScene` → `HubScene` (with `{ showTour: true }` init data — see Part B);
  seen saves skip straight to `HubScene` as today. Two buttons, both through
  `addTextButton`/`ensureMinTapTarget` like every other interactive control in the game
  — no exceptions to the 44×44/20px rule for being "just" an onboarding screen.
- **Correction 2 — `__cheat.reset()` (`main.ts:62`) needs a routing fix.** It currently
  calls `resetSave()` then jumps straight to `HubScene`, bypassing `BootScene`'s new
  onboarding check entirely — after this change, a dev-reset save would never show
  onboarding without a manual page reload. Route it to `BootScene` instead (`goTo`'s
  existing scene-stop-then-start pattern works for any registered scene, not just
  `HubScene`) so it exercises the same real check a fresh install would.

## Part B — Hub button tour (coach marks)

A sequence of full-screen steps, each dimming the screen except a bright stroked
highlight around one real, currently-on-screen UI element, with a short caption and
NEXT/SKIP controls.

**Trigger:** `HubScene.init(data)` receiving `{ showTour: true }` from
`OnboardingScene`'s `scene.start('HubScene', { showTour: true })` call on *both*
buttons (tutorials-or-skip is a combat-tutorial question; the UI tour is orthogonal and
both branches equally need it). Independently **re-invokable anytime** via a new "HOW TO
PLAY" button added to the hub's Settings panel (`HubScene.ts`'s `buildSettingsContent` —
**not** a separate `SettingsScene.ts`, which doesn't exist; Settings is one panel inside
`HubScene`, same file as everything else being touched here) — that path needs no
fresh-save gating, it's just "show the overlay now."

**Input handling during the tour (the part the original sketch got wrong):**
`addModalBackdrop` (`widgets.ts:117-123`) is a single full-screen rect that dims and
click-swallows *everything*, including whatever it's drawn under — so a highlight ring
around a still-dimmed button doesn't read as a spotlight. The fix isn't "raise the
target above the backdrop" (that would leave `buildMainMenu`'s real `onClick` live
underneath the tour — tapping the spotlighted EXPLORE NEARBY SPACE mid-tour would
navigate away and `rebuildContent()` would destroy the very objects the tour is tracking,
under a still-open overlay). Instead: **before drawing a step, call
`target.disableInteractive()` on the real button being highlighted, undim it visually
(draw it again — or a visual clone — above the backdrop at full alpha, non-interactive),
and restore `setInteractive()` on step-change/tour-exit.** This keeps the whole tour
strictly look-only, matching "coach mark" semantics (point and explain, don't let the
player act mid-explanation) and avoids the destroyed-mid-overlay hazard entirely.

**Targeting implementation:**
- Tag each real target object at creation with `.setData('tourId', '<id>')` — same
  pattern this session already used for `isGameplayEntity` on enemy sprites
  (`CombatScene.ts`). A tour step looks its target up by scanning `HubScene`'s children
  for that tag and reads its **real runtime bounds** via `getBounds()` — verified this
  works cleanly for `buildMainMenu`'s plain `addTextButton` Text objects (no containers,
  no scaling, `px()`-positioned, `getBounds()` includes the button's padding/background
  as part of its measured size) rather than recomputing each button's layout math.
  Note: `getBounds()` gives the *visual* box, not `ensureMinTapTarget`'s expanded 44×44
  hit area — correct for drawing a ring around what the player actually sees; just keep
  NEXT/SKIP clear of a highlighted target's (larger) hit area so they don't overlap.
- Step content (voice matches `W0_NARRATOR_EVENTS`'s direct, "Commander…" briefing
  tone — `missions.ts:100-106`), four steps to start:
  1. EXPLORE NEARBY SPACE → "Commander. This is your galaxy map — pick a mission to
     fly."
  2. SHIP CONFIGURATION → "Outfit your ship here: weapons, shields, and more."
  3. DISPATCH REINFORCEMENTS → "Subscribe for support cards you'll draw mid-mission."
  4. SETTINGS → "Audio, dev tools, and this tour again — any time."
- NEXT/SKIP controls: same button pattern as everywhere else, tap-target compliant, own
  depth clearly above both the backdrop and the undimmed target clone.
- "SKIP" ends the tour immediately at any step; "NEXT" on the last step ends it. Neither
  needs to persist anything — the tour ending is just "stop rendering the overlay,"
  since `onboardingSeen` was already set the moment `OnboardingScene` handed off.

## Verification plan

- New `__cheat` hooks: a `HubScene` cheat (matching the existing `cheatNavTo`/
  `cheatNavShop` pattern) to trigger the tour on demand without needing a fresh save
  every time. `__cheat.reset()` already produces the fresh-save signal after Correction
  2's routing fix — no separate `freshSave()` cheat needed.
- New `tools/tap-target-audit.ts` `STATES` entries: the onboarding prompt, and the tour
  overlay (at least its first and last step — NEXT/SKIP buttons must clear 44×44/20px
  same as everything else; the highlight ring itself isn't interactive so it's exempt
  same as decorative graphics generally are).
- New `tools/screenshot.ts` `SHOTS` entries: onboarding prompt, each tour step (so text
  overflow in the captions is actually checked, not assumed).
- Per the `/polish-loop` skill: send this plan to a Fable-model agent before writing
  code (done — see revision history below); implement; `pnpm lint && pnpm build:dry &&
  pnpm test && pnpm audit-taps && pnpm screenshot`; send the result to Fable
  skeptically; triage.

## File hygiene

New: `src/view/OnboardingScene.ts`, `src/view/HubTour.ts` (or similar — the coach-mark
overlay, kept separate from `HubScene.ts` itself so the latter doesn't balloon).

Edit: `src/save/SaveManager.ts` (`SaveData.onboardingSeen` field, `skipTutorials` +
fresh-save check), `src/view/main.ts` (register `OnboardingScene`, fix `reset()`
routing, wire new `__cheat` hooks), `src/view/BootScene.ts` (onboarding routing + its
stale "MenuScene" comment, `BootScene.ts:9` — fix while touching this file),
`src/view/HubScene.ts` (`init(data)` for `showTour`, tag main-menu targets, invoke the
tour, add "HOW TO PLAY" to `buildSettingsContent`).

Docs: mark `tutorial-minimalism-and-onboarding.md`'s Decision 5 done once Part A ships
(noting the two corrections above); add both features to `docs/design/14-status.md`'s
built/planned table; leave `WelcomeScene`/story content rows exactly as-is (still
blocked on Tomáš).

## Revision history

- 2026-07-16: Fable pre-implementation review caught: (1) the coach-mark input-handling
  gap now covered in Part B, (2) the dormant `w0`/`firstBranchChoice` duplicate, now
  logged in `docs/known-issues.md`, (3) the onboarding re-show asymmetry, fixed via the
  new `onboardingSeen` field (Correction 1), (4) the incorrect "+ top bar" scope claim,
  removed, (5) a nonexistent `SettingsScene.ts` reference, fixed to `HubScene`'s
  settings panel, (6) the redundant `freshSave()` cheat and `reset()`'s routing gap
  (Correction 2). All incorporated above before implementation started.
- 2026-07-16, post-implementation: Fable's skeptical result review found one real
  shipping blocker and two lesser issues, all fixed:
  1. **(Blocker) The tour replayed after every mission, every combat exit, and every
     dev-tools restart for the rest of the session.** `OnboardingScene`'s
     `scene.start('HubScene', { showTour: true })` data object is retained by Phaser
     forever — every later *bare* `scene.start('HubScene')`/`scene.restart()` call
     (`ResultScene`'s MISSIONS/SHOP buttons, `CombatScene`'s exit-confirm, the settings
     panel's DEV MODE/ADD COINS/UNLOCK STARS buttons — none of them pass data) kept
     re-delivering the same `{ showTour: true }` to `init()`. My own defensive fix
     (`setNav()` tearing down a stale tour) accidentally masked this from every
     verification tool, since `navTo`/`navShop`/`startMission` all call `setNav()`
     before a screenshot — no tool ever drove the real ResultScene-button-to-hub path.
     Fixed by consuming the flag in `init()`: `data.showTour = false`, mutating the
     retained object in place so the next bare start sees it already cleared. Reproduced
     Fable's exact repro before and after the fix to confirm.
  2. **The plan's own doc-update checklist wasn't done.** Fixed: `14-status.md`'s table
     now lists both features as built; `tutorial-minimalism-and-onboarding.md` rewritten
     to record what shipped and where it diverged from the original sketch.
  3. **A comment claimed the settings-panel row offsets were "named, computed values"
     when they were actually hardcoded literals requiring manual sync.** Fixed for
     real, not just re-worded: `SETTINGS_ROW_PITCH`/`SETTINGS_ROW_1_Y`/
     `SETTINGS_HOW_TO_PLAY_Y`/`DEV_TOOLS_HEADER_Y`/`DEV_TOOLS_START_Y` now derive every
     row's Y from one shared pitch; re-verified identical pixel output via screenshot.
