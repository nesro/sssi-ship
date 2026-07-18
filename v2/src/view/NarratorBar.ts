import Phaser from 'phaser';
import { cssColor, PALETTE } from './palette';
import { fontPx, LOGICAL_HEIGHT, LOGICAL_WIDTH, px } from './layout';
import { UI_FONT } from './widgets';

const CHARS_PER_MS = 1 / 40; // one character every 40 ms
const AUTO_HIDE_AFTER_MS = 5000; // dismiss this long after the last character appears
const BAR_HEIGHT_LOGICAL = 38;
const BAR_Y_LOGICAL = LOGICAL_HEIGHT - BAR_HEIGHT_LOGICAL;

/**
 * Typewriter text strip at the bottom of the screen (V2_HANDOFF.md §3.10).
 * Call show(text) to start a new line; update(deltaMs) advances the animation.
 */
export class NarratorBar {
  private readonly bg: Phaser.GameObjects.Rectangle;
  private readonly label: Phaser.GameObjects.Text;
  private fullText = '';
  private charProgress = 0; // float characters revealed so far
  private active = false;
  private idleMs = 0; // time elapsed since typewriter finished

  constructor(scene: Phaser.Scene) {
    this.bg = scene.add
      .rectangle(0, px(BAR_Y_LOGICAL), px(LOGICAL_WIDTH), px(BAR_HEIGHT_LOGICAL), 0x000022, 0.88)
      .setOrigin(0, 0)
      .setDepth(30)
      .setVisible(false);

    this.label = scene.add
      .text(px(14), px(BAR_Y_LOGICAL + 10), '', {
        fontFamily: UI_FONT,
        fontSize: `${String(fontPx(13))}px`,
        color: cssColor(PALETTE.generatorAmber),
        wordWrap: { width: px(LOGICAL_WIDTH - 28) },
      })
      .setDepth(31)
      .setVisible(false);
  }

  show(text: string): void {
    this.fullText = text;
    this.charProgress = 0;
    this.idleMs = 0;
    this.active = true;
    this.bg.setVisible(true);
    this.label.setVisible(true);
    this.label.setText('');
  }

  update(deltaMs: number): void {
    if (!this.bg.visible) return;
    if (this.active) {
      this.charProgress = Math.min(
        this.fullText.length,
        this.charProgress + deltaMs * CHARS_PER_MS,
      );
      const visible = Math.floor(this.charProgress);
      this.label.setText(this.fullText.slice(0, visible));
      if (visible >= this.fullText.length) {
        this.active = false;
        this.idleMs = 0;
      }
    } else {
      this.idleMs += deltaMs;
      if (this.idleMs >= AUTO_HIDE_AFTER_MS) this.hide();
    }
  }

  hide(): void {
    this.active = false;
    this.bg.setVisible(false);
    this.label.setVisible(false);
  }

  /** True iff a line is on screen and its typewriter reveal has finished — false both
   * before any line has ever shown and after it's fully hidden again. Whichever line is
   * CURRENTLY on the bar, not a specific one — fine today since no mission triggers two
   * sequential bar lines, but a future one that does would need this call site-scoped,
   * not just this flag polled blindly. Lets a caller (the screenshot harness) poll for
   * "done revealing" instead of sleeping a fixed duration sized off today's longest line
   * — see docs/known-issues.md's now-resolved NarratorBar reveal-timing entry. */
  isFullyRevealed(): boolean {
    return this.bg.visible && !this.active;
  }
}
