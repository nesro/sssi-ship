# Visuals & UI

## Neon look

The game uses an additive renderer over a near-black background (#0a0a18 or
similar). All game objects use `ADD` blend mode. Glow is baked into textures
via multi-pass `generateTexture()` in `src/view/textures.ts` — never PostFX,
never per-object filters (too expensive on mobile).

## Palette (`src/view/palette.ts`)

| Role | Colour | Hex |
|------|--------|-----|
| Weapon / primary UI | Cyan | `PALETTE.weaponCyan` |
| Shield | Blue | `PALETTE.shieldBlue` |
| Generator | Amber | `PALETTE.generatorAmber` |
| Motor | Magenta | `PALETTE.motorMagenta` |
| Hull / white text | White | `PALETTE.hullWhite` |
| Enemy standard | Orange | `PALETTE.enemyOrange` |
| Enemy threat | Red | `PALETTE.enemyRed` |

Never hardcode hex values in scene code — always use palette constants.

## Canvas sizing

The canvas is `logical × devicePixelRatio` with `zoom: 1/DPR`. This makes
text sharp on high-DPR screens. All sizing goes through `px()` and `fontPx()`
from `src/view/layout.ts`. Logical canvas is 820×540.

## Typography

Single font family (`UI_FONT` from `src/view/widgets.ts`) — monospace. Sizes
via `fontPx()` to account for DPR. No styled text, no rich text.

## Bolt visuals (planned for damage variance)

- Normal hit: weapon colour (cyan for pulse, etc.)
- Critical hit: yellow-white
- Miss: grey (bolt still flies, hits, but no damage spark)

## UI structure

### Combat HUD

- Ship sprite left-centre
- Health bar (hull) — top of HUD
- Shield bar — below hull
- Energy bar — below shield
- Timeline progress bar — bottom
- Enemy sprites in the lane, rightward
- Supply buttons: fixed-position overlay, one per owned supply kind
- Card overlay: full-screen modal when a support call triggers
- Exit button: top-right, opens confirm dialog

### Hub / Menu

- Galaxy map (mission tree) on MISSIONS tab
- SHOP tab: tabs per system (weapon, shield, gen, motor, supplies)
- Settings, About, Manual via top-level nav

### Shop layout

- Tab row at top
- Dividers between zones
- Item list (scrollable area, fixed height)
- Action bar at bottom: item blurb + action button(s)
- Live preview panel: ship sprite, stat bars, DPS value

## No image assets

All visuals are generated procedurally via `generateTexture()`. No PNG/SVG
sprite sheets. Audio is the exception (files in `public/audio/`).
