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

| Scene | Purpose |
|-------|---------|
| `BootScene` | Preloads audio assets, then launches `WelcomeScene` (first launch) or `MenuScene` (returning) |
| `WelcomeScene` | First-launch only: Captain Nesro portrait + choice to read developer message or go straight to story. Skipped on all subsequent launches (`save.welcomeSeen === true`). Accessible again via Credits/About from the main menu. |
| `MenuScene` | Galaxy map; tapping a node opens a mission detail panel |
| `ShopScene` | Full-width stacked shop with live preview panel |
| `CombatScene` | Active mission: three-panel layout, conveyor, card overlay, narrator bar |
| `ResultScene` | Victory/defeat: coins earned, newly awarded stars, then back to galaxy map |
| `SettingsScene` | Left-hand toggle, mute, reset save (with confirmation) |
| `CreditsScene` | About + music attribution + link to re-open WelcomeScene (accessible from main menu) |

## First launch & story

On the very first launch the game shows **WelcomeScene** before anything else:

- **Captain Nesro portrait** — a drawn portrait of the in-game character (and developer's
  alter ego). Sets a personal tone immediately.
- **Two choices:**
  - *"Read my message"* — a personal note written by Tomáš about the origin of the game
    (SSSI Ship was his 2010 school maturita project). After reading, continues to the story intro.
  - *"Skip to the game"* — goes straight to the story intro, then the galaxy map.

All players (both paths) see a **brief story intro** after WelcomeScene — a few lines
establishing who Captain Nesro is and why the mission exists. Gives the player a reason to
care before the first mission.

On all subsequent launches `save.welcomeSeen === true` skips WelcomeScene entirely.
The Credits screen lets returning players re-open it.

**Developer message (from v1 — use verbatim or lightly edit):**

> Hi, I am Nesro.
>
> I created a simple game back in 2010 for my maturita (final school exam).
>
> I always wanted to finish it as a proper mobile game — and now, 16 years later, I am
> finally on that mission.
>
> This game is in early stages. If you are interested in game design, level design,
> balancing, visuals or music — please reach out. I would love to hear from you.

The story intro (a few lines before the galaxy map) and Captain Nesro portrait art still
need to be created. In-mission narrator lines exist in `v2/src/data/story.ts`.

---

Next: [Shop & Modules](05-shop-and-modules.md)
