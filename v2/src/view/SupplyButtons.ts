import Phaser from 'phaser';
import type { CoreState } from '../core/types';
import { cssColor, PALETTE } from './palette';
import { fontPx, LOGICAL_WIDTH, RIGHT_PANEL_W, px } from './layout';
import { UI_FONT } from './widgets';

const BUTTON_W = 70;
const BUTTON_H = 42;
const BUTTON_GAP = 8;
const BUTTONS_TOP = 195;

/** Reserve-supply tap buttons stacked in the left panel (V2_HANDOFF.md §3.7). */
export class SupplyButtons {
  private buttons: { panel: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text }[] = [];

  constructor(
    scene: Phaser.Scene,
    state: CoreState,
    onTap: (slot: number) => void,
  ) {
    state.supplies.forEach((supply, slot) => {
      const x = px(LOGICAL_WIDTH - RIGHT_PANEL_W / 2);
      const y = px(BUTTONS_TOP + slot * (BUTTON_H + BUTTON_GAP));
      const panel = scene.add
        .rectangle(x, y, px(BUTTON_W), px(BUTTON_H), 0x0a0a18, 0.9)
        .setStrokeStyle(px(1.5), PALETTE.generatorAmber)
        .setDepth(12)
        .setInteractive({ useHandCursor: true });
      panel.on('pointerdown', () => { onTap(slot); });
      const label = scene.add
        .text(x, y, '', {
          fontFamily: UI_FONT,
          fontSize: `${String(fontPx(10))}px`,
          color: cssColor(PALETTE.generatorAmber),
          align: 'center',
        })
        .setOrigin(0.5)
        .setDepth(13);
      this.buttons.push({ panel, label });
    });
  }

  update(state: CoreState): void {
    this.buttons.forEach((button, slot) => {
      const supply = state.supplies[slot];
      if (supply === undefined) return;
      const empty = supply.chargesLeft <= 0;
      button.label.setText(`${shortName(supply.spec.name)}\n×${String(supply.chargesLeft)}`);
      button.panel.setAlpha(empty ? 0.3 : 1);
      button.label.setAlpha(empty ? 0.3 : 1);
    });
  }
}

function shortName(name: string): string {
  const first = name.split(' ')[0];
  return first ?? name;
}
