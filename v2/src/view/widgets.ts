import Phaser from 'phaser';
import { cssColor } from './palette';
import { fontPx, px, SCREEN_WIDTH, SCREEN_HEIGHT } from './layout';
import type { SaveData } from '../save/SaveManager';

export const UI_FONT = 'Menlo, Consolas, monospace';

// Mobile safe-zone rule (docs/design/04-screens-and-layout.md): every interactive tap
// target needs a minimum touch area of 44×44 logical px, and no UI element may sit
// closer than 20px to any screen edge. Checked against every addTextButton size
// actually used in the game (11–22) — every one of them, including the largest, fell
// short of 44px tall from font metrics + padding alone.
const MIN_TAP_TARGET = 44;
const EDGE_MARGIN = 20;

/** Expands a GameObject's hit area to at least MIN_TAP_TARGET×MIN_TAP_TARGET — the
 * tappable area grows without the button itself looking any bigger. Phaser's default
 * hitArea (from a bare setInteractive()) is `Rectangle(0, 0, width, height)` in the
 * object's own local frame regardless of setOrigin().
 *
 * Expansion is symmetric *unless* that would push the hit area past the 20px edge
 * margin (e.g. a top-bar back button a few px from y=0) — a purely symmetric expansion
 * on an element already close to an edge pushes the far side past the edge entirely
 * (caught by tools/tap-target-audit.ts, not eyeballed: "‹ BACK"'s hit area extended to
 * y=0). In that case the box shifts inward just enough to respect the margin, keeping
 * the full 44px size rather than shrinking it. */
export function ensureMinTapTarget(obj: Phaser.GameObjects.Text | Phaser.GameObjects.Shape | Phaser.GameObjects.Image): void {
  const min = px(MIN_TAP_TARGET);
  const edge = px(EDGE_MARGIN);
  const w = Math.max(obj.width, min);
  const h = Math.max(obj.height, min);
  let localX = (obj.width - w) / 2;
  let localY = (obj.height - h) / 2;

  const worldLeft = obj.x - obj.originX * obj.width + localX;
  const worldTop = obj.y - obj.originY * obj.height + localY;
  if (worldLeft < edge) localX += edge - worldLeft;
  else if (worldLeft + w > SCREEN_WIDTH - edge) localX -= (worldLeft + w) - (SCREEN_WIDTH - edge);
  if (worldTop < edge) localY += edge - worldTop;
  else if (worldTop + h > SCREEN_HEIGHT - edge) localY -= (worldTop + h) - (SCREEN_HEIGHT - edge);

  obj.setInteractive({
    hitArea: new Phaser.Geom.Rectangle(localX, localY, w, h),
    hitAreaCallback: (rect: Phaser.Geom.Rectangle, x: number, y: number) => Phaser.Geom.Rectangle.Contains(rect, x, y),
    useHandCursor: true,
  });
}

export interface TextButtonOptions {
  x: number;
  y: number;
  label: string;
  color: number;
  size?: number;
  /** Symmetric origin shorthand (both axes). Use originX/originY for an asymmetric
   * origin like left-aligned-but-vertically-centered — set it here, not via a follow-up
   * `.setOrigin()` call on the returned Text: ensureMinTapTarget() computes the hit area
   * from the origin at the moment this function runs, so changing origin afterward
   * desyncs the hit area from where the button actually renders (caught by
   * tools/tap-target-audit.ts as two "unrelated" buttons overlapping — they weren't
   * actually overlapping on screen, just in their now-stale hit areas). */
  origin?: number;
  originX?: number;
  originY?: number;
  onClick: () => void;
}

/** Neon-styled tap target: monospace label with a stroked underline box. */
export function addTextButton(
  scene: Phaser.Scene,
  options: TextButtonOptions,
): Phaser.GameObjects.Text {
  const size = options.size ?? 18;
  const originX = options.originX ?? options.origin ?? 0.5;
  const originY = options.originY ?? options.origin ?? 0.5;
  const text = scene.add
    .text(options.x, options.y, options.label, {
      fontFamily: UI_FONT,
      fontSize: `${String(fontPx(size))}px`,
      color: cssColor(options.color),
      backgroundColor: '#101020',
      padding: { x: px(10), y: px(6) },
    })
    .setOrigin(originX, originY);
  ensureMinTapTarget(text);
  text.on('pointerdown', options.onClick);
  text.on('pointerover', () => text.setAlpha(0.8));
  text.on('pointerout', () => text.setAlpha(1));
  return text;
}

export interface LabelOptions {
  x: number;
  y: number;
  text: string;
  color: number;
  size?: number;
}

export function addLabel(scene: Phaser.Scene, options: LabelOptions): Phaser.GameObjects.Text {
  return scene.add.text(options.x, options.y, options.text, {
    fontFamily: UI_FONT,
    fontSize: `${String(fontPx(options.size ?? 15))}px`,
    color: cssColor(options.color),
  });
}

/** 1px white border around the full canvas — visible when devMode is on. */
export function drawDevBorder(scene: Phaser.Scene, save: SaveData): void {
  if (save.devMode === false) return;
  const g = scene.add.graphics().setDepth(99);
  g.lineStyle(px(1), 0xffffff, 1);
  g.strokeRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
}

/** Dimmed full-screen backdrop used by modal overlays. */
export function addModalBackdrop(scene: Phaser.Scene, depth: number): Phaser.GameObjects.Rectangle {
  const { width, height } = scene.scale;
  return scene.add
    .rectangle(width / 2, height / 2, width, height, 0x000000, 0.75)
    .setDepth(depth)
    .setInteractive(); // swallow clicks under the modal
}
