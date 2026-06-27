// Native-resolution rendering (V2_HANDOFF.md §4.2): the canvas is sized logical × dpr and
// zoomed back down, so game units are device pixels. All view code sizes through px().

export const LOGICAL_WIDTH = 540;
export const LOGICAL_HEIGHT = 960;

export const DPR = Math.max(1, Math.round((globalThis.devicePixelRatio || 1) * 100) / 100);

export const SCREEN_WIDTH = LOGICAL_WIDTH * DPR;
export const SCREEN_HEIGHT = LOGICAL_HEIGHT * DPR;

/** Width of the left control panel (stat bars + supplies + toggles + abilities). */
export const LEFT_PANEL_W = 150;
/** X coordinate where the game field starts. */
export const GAME_X = LEFT_PANEL_W;
/** Width of the game field in logical units. */
export const GAME_WIDTH = LOGICAL_WIDTH - LEFT_PANEL_W;  // 390

/** Full-width hub content area (portrait: single column). */
export const HUB_LEFT_W = LOGICAL_WIDTH;  // 540

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
