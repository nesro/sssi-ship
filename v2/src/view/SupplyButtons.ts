import Phaser from 'phaser';
import type { CoreState } from '../core/types';
import { computeSupplyButtonsViewModel } from '../viewmodel/combat';
import { cssColor, PALETTE } from './palette';
import { BTN_PANEL_W, BTN_X, fontPx, px } from './layout';
import { ensureMinTapTarget, UI_FONT } from './widgets';

const BUTTON_W = 120;
const BUTTON_H = 36; // visual height; ensureMinTapTarget pads the hit area up to 44
const ROW_PITCH = 44; // must match CombatScene's ROW_PITCH — keeps hit areas non-overlapping

/** Reserve-supply tap buttons stacked in the right panel (V2_HANDOFF.md §3.7). `startY`
 * comes from CombatScene's dynamic layout cursor — this used to hardcode its own start
 * position (`BUTTONS_TOP`) with a comment warning it "must clear" whatever CombatScene
 * put above it, which is exactly the kind of fixed-offset coupling that caused a real
 * bug before (BUTTONS_TOP not adjusted when a new toggle row was added). */
export class SupplyButtons {
  private buttons: { panel: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text }[] = [];

  constructor(
    scene: Phaser.Scene,
    state: CoreState,
    startY: number,
    onTap: (slot: number) => void,
  ) {
    const vm = computeSupplyButtonsViewModel(state);
    const cx = px(BTN_X + BTN_PANEL_W / 2);
    const labelY = startY + 8;
    // startY + half-pitch, not +28 — the tightest valid center position for the first
    // row (same "cursor + ROW_PITCH/2" pattern as CombatScene's other sections). The
    // extra 6px this used to reserve was enough, in the rear+side+3-supplies worst case,
    // to push the last supply row 6px into the reserved exit-button zone at the panel's
    // bottom (tools/tap-target-audit.ts caught the overlap, not eyeballed).
    const buttonsTop = startY + ROW_PITCH / 2;
    scene.add.text(cx, px(labelY), 'BOOST', {
      fontFamily: UI_FONT,
      fontSize: `${String(fontPx(8))}px`,
      color: cssColor(PALETTE.generatorAmber),
    }).setOrigin(0.5, 1).setDepth(12).setAlpha(vm.hasSupplies ? 0.6 : 0.2);
    if (!vm.hasSupplies) {
      scene.add.text(cx, px(buttonsTop + 16), '—', {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(9))}px`, color: '#334455',
      }).setOrigin(0.5).setDepth(12);
    }

    vm.buttons.forEach((button, slot) => {
      const y = px(buttonsTop + slot * ROW_PITCH);
      const panel = scene.add
        .rectangle(cx, y, px(BUTTON_W), px(BUTTON_H), 0x0a0a18, 0.9)
        .setStrokeStyle(px(1.5), PALETTE.generatorAmber)
        .setDepth(12);
      ensureMinTapTarget(panel);
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
      const entry = { panel, label };
      this.buttons.push(entry);
      this.applyButtonState(entry, button.label, button.empty);
    });
  }

  update(state: CoreState): void {
    const vm = computeSupplyButtonsViewModel(state);
    this.buttons.forEach((button, slot) => {
      const supply = vm.buttons[slot];
      if (supply === undefined) return;
      this.applyButtonState(button, supply.label, supply.empty);
    });
  }

  private applyButtonState(button: { panel: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text }, label: string, empty: boolean): void {
    button.label.setText(label);
    button.panel.setAlpha(empty ? 0.3 : 1);
    button.label.setAlpha(empty ? 0.3 : 1);
  }
}
