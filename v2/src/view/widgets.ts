import Phaser from 'phaser';
import { cssColor } from './palette';
import { fontPx, px } from './layout';

export const UI_FONT = 'Menlo, Consolas, monospace';

export interface TextButtonOptions {
  x: number;
  y: number;
  label: string;
  color: number;
  size?: number;
  origin?: number;
  onClick: () => void;
}

/** Neon-styled tap target: monospace label with a stroked underline box. */
export function addTextButton(
  scene: Phaser.Scene,
  options: TextButtonOptions,
): Phaser.GameObjects.Text {
  const size = options.size ?? 18;
  const text = scene.add
    .text(options.x, options.y, options.label, {
      fontFamily: UI_FONT,
      fontSize: `${String(fontPx(size))}px`,
      color: cssColor(options.color),
      backgroundColor: '#101020',
      padding: { x: px(10), y: px(6) },
    })
    .setOrigin(options.origin ?? 0.5)
    .setInteractive({ useHandCursor: true });
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

/** Dimmed full-screen backdrop used by modal overlays. */
export function addModalBackdrop(scene: Phaser.Scene, depth: number): Phaser.GameObjects.Rectangle {
  const { width, height } = scene.scale;
  return scene.add
    .rectangle(width / 2, height / 2, width, height, 0x000000, 0.75)
    .setDepth(depth)
    .setInteractive(); // swallow clicks under the modal
}
