// Native-resolution rendering (V2_HANDOFF.md §4.2): the canvas is sized logical × dpr and
// zoomed back down, so game units are device pixels. All view code sizes through px().

export const LOGICAL_WIDTH = 960;
export const LOGICAL_HEIGHT = 540;

export const DPR = Math.max(1, Math.round((globalThis.devicePixelRatio || 1) * 100) / 100);

export const SCREEN_WIDTH = LOGICAL_WIDTH * DPR;
export const SCREEN_HEIGHT = LOGICAL_HEIGHT * DPR;

/** Width of the left info panel (stat bars + stats) in logical units. */
export const LEFT_PANEL_W = 260;
/** Width of the right button panel (supplies + exit) in logical units. */
export const RIGHT_PANEL_W = 260;
/** X coordinate where the game field starts. */
export const GAME_X = LEFT_PANEL_W;
/** Width of the game field in logical units (~46% of screen). */
export const GAME_WIDTH = LOGICAL_WIDTH - LEFT_PANEL_W - RIGHT_PANEL_W;

/** Width of each half in the hub (menu+shop) screen. */
export const HUB_LEFT_W = 480;

/** Converts a logical design measurement into device pixels. */
export function px(logical: number): number {
  return logical * DPR;
}

/** Integer pixel font size — fractional sizes blur monospace text. */
export function fontPx(logical: number): number {
  return Math.round(logical * DPR);
}

/** Logical offset from ship centre to each gun muzzle (shared by combat + shop views). */
export const SHIP_GUN_X_OFFSET = 17;
export const SHIP_GUN_Y_OFFSET = 10;
