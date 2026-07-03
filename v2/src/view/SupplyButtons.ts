import Phaser from 'phaser';
import type { CoreState } from '../core/types';
import { cssColor, PALETTE } from './palette';
import { BTN_PANEL_W, BTN_X, fontPx, px } from './layout';
import { UI_FONT } from './widgets';

const BUTTON_W = 120;
const BUTTON_H = 36;
const BUTTON_GAP = 6;
const BUTTONS_TOP = 128;

/** Reserve-supply tap buttons stacked in the left panel (V2_HANDOFF.md §3.7). */
export class SupplyButtons {
  private buttons: { panel: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text }[] = [];

  constructor(
    scene: Phaser.Scene,
    state: CoreState,
    onTap: (slot: number) => void,
  ) {
    const cx = px(BTN_X + BTN_PANEL_W / 2);
    scene.add.text(cx, px(BUTTONS_TOP - 14), 'BOOST', {
      fontFamily: UI_FONT,
      fontSize: `${String(fontPx(8))}px`,
      color: cssColor(PALETTE.generatorAmber),
    }).setOrigin(0.5, 1).setDepth(12).setAlpha(state.supplies.length > 0 ? 0.6 : 0.2);
    if (state.supplies.length === 0) {
      scene.add.text(cx, px(BUTTONS_TOP + 16), '—', {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(9))}px`, color: '#334455',
      }).setOrigin(0.5).setDepth(12);
    }

    state.supplies.forEach((supply, slot) => {
      const y = px(BUTTONS_TOP + slot * (BUTTON_H + BUTTON_GAP));
      const panel = scene.add
        .rectangle(cx, y, px(BUTTON_W), px(BUTTON_H), 0x0a0a18, 0.9)
        .setStrokeStyle(px(1.5), PALETTE.generatorAmber)
        .setDepth(12)
        .setInteractive({ useHandCursor: true });
      panel.on('pointerdown', () => { onTap(slot); });
      const label = scene.add
        .text(cx, y, '', {
          fontFamily: UI_FONT,
          fontSize: `${String(fontPx(9))}px`,
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
      button.label.setText(`${supply.spec.name}  ×${String(supply.chargesLeft)}`);
      button.panel.setAlpha(empty ? 0.3 : 1);
      button.label.setAlpha(empty ? 0.3 : 1);
    });
  }
}
