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

/** The point on `rect`'s boundary where a ray from its own center toward (tx, ty)
 * exits — i.e. the edge point facing the given target. Used by drawPointerArrow to
 * anchor a line at each rect's near edge rather than its center. */
function pointOnRectTowards(rect: Phaser.Geom.Rectangle, tx: number, ty: number): { x: number; y: number } {
  const dx = tx - rect.centerX;
  const dy = ty - rect.centerY;
  if (dx === 0 && dy === 0) return { x: rect.centerX, y: rect.centerY };
  const halfW = rect.width / 2 || 0.001;
  const halfH = rect.height / 2 || 0.001;
  const scale = Math.min(
    dx !== 0 ? halfW / Math.abs(dx) : Number.POSITIVE_INFINITY,
    dy !== 0 ? halfH / Math.abs(dy) : Number.POSITIVE_INFINITY,
  );
  return { x: rect.centerX + dx * scale, y: rect.centerY + dy * scale };
}

/** Line + arrowhead connecting one rect's near edge to another's — used to visually tie
 * an explanatory popup to the live UI element it's talking about (HubTour's highlighted
 * nav button, the narrator modal's HUD-bar callouts). Both rects must already be in the
 * same device-px coordinate space as everything else on screen (i.e. pre-px()'d), same
 * as Phaser's own getBounds(). Callers own the returned Graphics' lifecycle (push it
 * into whatever cleanup list already destroys the rest of that popup's objects). */
export function drawPointerArrow(
  scene: Phaser.Scene,
  fromBounds: Phaser.Geom.Rectangle,
  toBounds: Phaser.Geom.Rectangle,
  color: number,
  depth: number,
): Phaser.GameObjects.Graphics {
  const start = pointOnRectTowards(fromBounds, toBounds.centerX, toBounds.centerY);
  const end = pointOnRectTowards(toBounds, fromBounds.centerX, fromBounds.centerY);
  const g = scene.add.graphics().setDepth(depth);
  g.lineStyle(px(2.5), color, 0.9);
  g.lineBetween(start.x, start.y, end.x, end.y);
  const angle = Phaser.Math.Angle.Between(start.x, start.y, end.x, end.y);
  const headLen = px(9);
  const spread = Math.PI / 7;
  g.fillStyle(color, 0.9);
  g.fillTriangle(
    end.x, end.y,
    end.x - headLen * Math.cos(angle - spread), end.y - headLen * Math.sin(angle - spread),
    end.x - headLen * Math.cos(angle + spread), end.y - headLen * Math.sin(angle + spread),
  );
  return g;
}
