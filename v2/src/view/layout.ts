// Native-resolution rendering: canvas is sized logical × dpr and zoomed back down, so
// game units are device pixels. All view code sizes through px(). Landscape 960×540.

export const LOGICAL_WIDTH = 960;
export const LOGICAL_HEIGHT = 540;

export const DPR = Math.max(1, Math.round((globalThis.devicePixelRatio || 1) * 100) / 100);

export const SCREEN_WIDTH = LOGICAL_WIDTH * DPR;
export const SCREEN_HEIGHT = LOGICAL_HEIGHT * DPR;

/** Width of the left info panel (stat bars + stats + picked abilities). */
export const INFO_PANEL_W = 160;
/** Width of the right button panel (toggles + ability slots + supplies + exit). */
export const BTN_PANEL_W = 160;
/** X coordinate where the game field starts. */
export const GAME_X = INFO_PANEL_W;
/** Width of the game field in logical units (= 640). */
export const GAME_WIDTH = LOGICAL_WIDTH - INFO_PANEL_W - BTN_PANEL_W;
/** X coordinate where the right button panel starts (= 800). */
export const BTN_X = GAME_X + GAME_WIDTH;

/** Full-width hub content area. */
export const HUB_LEFT_W = LOGICAL_WIDTH;

/** Converts a logical design measurement into device pixels. */
export function px(logical: number): number {
  return logical * DPR;
}

/** Integer pixel font size — fractional sizes blur monospace text. 1.15 scale improves legibility on mobile. */
export function fontPx(logical: number): number {
  return Math.round(logical * DPR * 1.15);
}

/** Logical offset from ship centre to each gun muzzle (shared by combat + shop views). */
export const SHIP_GUN_X_OFFSET = 17;
export const SHIP_GUN_Y_OFFSET = 10;
