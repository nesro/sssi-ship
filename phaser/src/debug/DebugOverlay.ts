// debug/DebugOverlay.ts
// A small semi-transparent panel drawn in the top-left corner of any Phaser scene.
// Shows live stats passed in from the scene's update() loop.
// Toggled by F1 key or window.__debug.toggle() in the browser console.

import Phaser from 'phaser';

export type DebugStats = Record<string, string | number>;

const PANEL_X      = 8;
const PANEL_Y      = 8;
const LINE_HEIGHT  = 14;
const PADDING      = 8;
const FONT_SIZE    = '11px';
const FONT_FAMILY  = 'monospace';
const BG_COLOR     = 0x000000;
const BG_ALPHA     = 0.65;
const TEXT_COLOR   = '#00ff88';
const LABEL_COLOR  = '#666666';
const DEPTH        = 100;  // above everything else

export class DebugOverlay {
  private readonly scene: Phaser.Scene;
  private readonly bg:    Phaser.GameObjects.Rectangle;
  private readonly lines: Phaser.GameObjects.Text[];
  private keys:           string[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.lines = [];

    // Background panel — width/height adjusted dynamically in update()
    this.bg = scene.add
      .rectangle(PANEL_X, PANEL_Y, 160, 20, BG_COLOR, BG_ALPHA)
      .setOrigin(0, 0)
      .setDepth(DEPTH);
  }

  // Call every frame from the scene's update() with fresh stats.
  update(stats: DebugStats): void {
    const entries = Object.entries(stats);

    // Create or reuse text objects — one per stat line.
    entries.forEach(([key, value], i) => {
      if (!this.lines[i]) {
        this.lines[i] = this.scene.add
          .text(PANEL_X + PADDING, PANEL_Y + PADDING + i * LINE_HEIGHT, '', {
            fontSize:   FONT_SIZE,
            fontFamily: FONT_FAMILY,
            color:      TEXT_COLOR,
          })
          .setDepth(DEPTH + 1);
      }
      this.lines[i].setText(`${this.colorLabel(key)}  ${value}`);
    });

    // Hide any leftover lines from a previous call with more keys.
    for (let i = entries.length; i < this.lines.length; i++) {
      this.lines[i].setVisible(false);
    }

    // Resize the background panel to fit the current content.
    const panelHeight = PADDING * 2 + entries.length * LINE_HEIGHT;
    this.bg.setSize(160, panelHeight);

    this.keys = entries.map(([k]) => k);
  }

  // Tints the label part of each line differently from the value.
  private colorLabel(key: string): string {
    return `\`${key}\``;
  }

  // Remove all display objects from the scene.
  destroy(): void {
    this.bg.destroy();
    this.lines.forEach(t => t.destroy());
  }
}
