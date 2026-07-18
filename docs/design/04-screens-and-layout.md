← [Design docs index](../../GAME_DESIGN.md) · [← Principles](03-principles.md)

# Layout & Screens

## Canvas

**Landscape (horizontal), 960×540 logical pixels.** The phone is held horizontally.
`devicePixelRatio`-native canvas with `zoom: 1/DPR` for sharp text. All sizing goes through
`px()` / `fontPx()` from `v2/src/view/layout.ts`.

## Combat — three panels

```
┌──────────────┬──────────────────────────────┬──────────────┐
│  INFO PANEL  │         GAME FIELD           │ BUTTON PANEL │
│   ~150 px    │          ~660 px             │   ~150 px    │
│              │    ↓  ↓  ↓  enemies          │              │
│  hull bar    │                              │ front weapon │
│  shield bar  │        [ship]                │ rear weapon  │
│  energy bar  │      bottom center           │ shield rchg  │
│  next call   │                              │ side weapons │
│  countdown   │   scrolling starfield        │ supplies     │
└──────────────┴──────────────────────────────┴──────────────┘
```

- **Info panel** — left by default: hull, shield, energy bars; countdown to next support call;
  DPS and time stats. Passive read — no tappable elements.
- **Game field** — center: ship sprite at the **bottom center**, enemies enter from the **top**
  and march **downward**. Scrolling starfield backdrop.
- **Button panel** — right by default: three module toggles (front weapon, rear weapon, shield
  recharge), side weapon buttons, reserve supply buttons. All manual tap targets live here.

**Left-handed mode** (Settings toggle): swaps info and button panels. Game field stays center.

## Mobile safe zones

Android devices have various dead zones — status bars, navigation bars, notches, and swipe-
gesture areas. **Never place any UI element closer than 20 px to any screen edge.** Interactive
tap targets additionally require a minimum touch area of 44×44 px. This is a hard rule for
every scene, applied in code via the layout constants in `layout.ts` — do not hardcode edge-
adjacent positions.

The current panels already respect this: the info panel left-edge content starts at x ≥ 8,
the button panel right-edge content ends at x ≤ 940 (960 − 20), and the bottom of the button
panel sits at y ≤ 520 (540 − 20).

## Scenes

**Rewritten 2026-07-18** — this table and the section below it described a
`WelcomeScene`/`MenuScene`/`ShopScene`/`SettingsScene`/`CreditsScene` architecture that
was never built this way; `docs/known-issues.md` already flagged the drift precisely.
The real scene graph (`v2/src/view/main.ts`) is five scenes, not eight — Settings,
Credits, the shop, and Dispatch Reinforcements are all nav panels *inside* `HubScene`,
not separate `Phaser.Scene`s, and there is no `MenuScene`.

| Scene | Purpose |
|-------|---------|
| `BootScene` | Preloads audio assets, then launches `AlphaNoticeScene` |
| `AlphaNoticeScene` | Every launch, no save-flag gate (not first-launch-only): a standing dev/alpha-build notice with a two-tap RESET PROGRESS button. On CONTINUE, hands off to `HubScene`, forwarding a `showTour` flag on a genuinely fresh save so the hub button coach-mark still plays exactly once. |
| `HubScene` | Galaxy map (missions nav) plus four more nav panels rendered by the same scene instance: shop (`buildShopContent`), Dispatch Reinforcements (`renderDRLeftPanel`), Settings (`buildSettingsContent`), Credits (`buildCreditsContent`) |
| `CombatScene` | Active mission: three-panel layout, conveyor, card overlay, narrator bar/modal |
| `ResultScene` | Victory/defeat/abandoned: coins earned, newly awarded stars, next-mission/retry/missions/shop buttons |

**Left-handed mode** (info/button panel swap) is a planned setting, not yet
implemented — no `leftHand`-style flag exists anywhere in the save model or view layer
today; treat any reference to it elsewhere in these docs as intent, not shipped
behavior.

## First launch & story

**Rewritten 2026-07-18 to describe the real flow** (see `BootScene.ts`'s own comment,
which documents this precisely — this section now mirrors it rather than the
never-built design below). There is no separate `WelcomeScene` and no first-launch/
returning-launch branch at the scene level:

1. `BootScene` preloads audio, then unconditionally starts `AlphaNoticeScene` — every
   player sees it, every single launch, first or hundredth. It is not a first-run-only
   prompt.
2. `AlphaNoticeScene`'s CONTINUE hands off to `HubScene`. Only on a genuinely fresh save
   (`!onboardingSeen`) does this also trigger the hub's one-time button coach-mark tour
   — persisted as seen only once the player actually reaches `HubScene` this way (a
   crash/quit on the alpha notice itself must not burn that one-time tour; see
   `docs/known-issues.md`'s Resolved section for the bug this exact ordering fixed).
3. **There is no tutorials-or-skip prompt scene either.** The choice lives on the
   galaxy map itself: `HubScene`'s missions nav renders a one-time "skip tutorials" link
   (visible only while none of t1-t4 are completed) right in the mission-info panel,
   alongside `t1` being the one glowing, unlocked node on an otherwise-dim map.

**Planned, blocked on content — not shipped.** A from-scratch `WelcomeScene` (Captain
Nesro portrait + a choice to read Tomáš's developer message about the game's 2010
maturita-project origin, or skip straight to a story intro) is still the intent — see
`docs/known-issues.md`'s `w0`/`firstBranchChoice` entry for the full unreachability
picture (`w0` itself has no unlock edge and no launcher today). In the meantime, the
developer-message content already exists verbatim in `HubScene`'s Credits nav panel
(`ABOUT_TEXT`), reachable by any player right now — it just isn't gated behind a
first-launch moment the way the original design intended. In-mission narrator lines
live in `v2/src/data/story.ts`.

---

Next: [Shop & Modules](05-shop-and-modules.md)
