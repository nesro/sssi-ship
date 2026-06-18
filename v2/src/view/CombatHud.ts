import Phaser from 'phaser';
import { BROWNOUT_THRESHOLD } from '../core/constants';
import { activeDamageMult, computeEffectiveStats } from '../core/stats';
import type { CoreState } from '../core/types';
import { cssColor, PALETTE } from './palette';
import { fontPx, LEFT_PANEL_W, LOGICAL_HEIGHT, px } from './layout';
import { UI_FONT } from './widgets';

const BAR_W = 12;
const BAR_TOP = 28;
const BAR_BOT = LOGICAL_HEIGHT - 22;
const BAR_H = BAR_BOT - BAR_TOP;
const LABEL_Y = 10;
const VALUE_Y = LOGICAL_HEIGHT - 6;
const SECTION = LEFT_PANEL_W / 3; // 30 logical px per bar slot

// Bar centres at 1/6, 3/6, 5/6 of LEFT_PANEL_W → 15, 45, 75
const BAR_X = [
  Math.round(SECTION * 0.5),
  Math.round(SECTION * 1.5),
  Math.round(SECTION * 2.5),
] as const;

const BARS = [
  { label: 'HUL', color: PALETTE.hullWhite },
  { label: 'SHD', color: PALETTE.shieldBlue },
  { label: 'NRG', color: PALETTE.generatorAmber },
] as const;

/** Vertical stat bars in the left panel: HULL / SHIELD / ENERGY (V2_HANDOFF.md §4.1). */
export class CombatHud {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly values: Phaser.GameObjects.Text[];

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(10);

    // Static labels above each bar
    BARS.forEach((bar, i) => {
      scene.add
        .text(px(BAR_X[i] ?? 0), px(LABEL_Y), bar.label, {
          fontFamily: UI_FONT,
          fontSize: `${String(fontPx(7))}px`,
          color: cssColor(bar.color),
        })
        .setOrigin(0.5, 0)
        .setDepth(11);
    });

    this.values = BARS.map((_, i) =>
      scene.add
        .text(px(BAR_X[i] ?? 0), px(VALUE_Y), '', {
          fontFamily: UI_FONT,
          fontSize: `${String(fontPx(7))}px`,
          color: '#777788',
        })
        .setOrigin(0.5, 1)
        .setDepth(11),
    );
  }

  update(state: CoreState): void {
    const { ship } = state;
    const stats = computeEffectiveStats(state.loadout, state.modifiers, activeDamageMult(state));
    const hullFrac = ship.maxHull > 0 ? ship.hull / ship.maxHull : 0;
    const shieldFrac = stats.shieldCapacity > 0 ? ship.shield / stats.shieldCapacity : 0;
    const energyFrac = stats.generatorCapacity > 0 ? ship.energy / stats.generatorCapacity : 0;
    const inBrownout = energyFrac < BROWNOUT_THRESHOLD;

    const fracs = [hullFrac, shieldFrac, energyFrac];
    const colors = [PALETTE.hullWhite, PALETTE.shieldBlue, inBrownout ? 0xff4400 : PALETTE.generatorAmber];
    const rawValues = [Math.ceil(ship.hull), Math.ceil(ship.shield), Math.ceil(ship.energy)];

    this.gfx.clear();
    BARS.forEach((_, i) => {
      const cx = BAR_X[i] ?? 0;
      const frac = Math.max(0, Math.min(1, fracs[i] ?? 0));
      const filled = Math.round(frac * BAR_H);
      const color = colors[i] ?? PALETTE.hullWhite;

      // Dim background track
      this.gfx.fillStyle(0x111122, 0.7);
      this.gfx.fillRect(px(cx - BAR_W / 2), px(BAR_TOP), px(BAR_W), px(BAR_H));

      if (filled > 0) {
        // Main fill, bottom-to-top
        this.gfx.fillStyle(color, 0.7);
        this.gfx.fillRect(px(cx - BAR_W / 2), px(BAR_BOT - filled), px(BAR_W), px(filled));
        // Bright leading edge at top of fill
        this.gfx.fillStyle(color, 0.95);
        this.gfx.fillRect(px(cx - BAR_W / 2), px(BAR_BOT - filled), px(BAR_W), px(2));
      }
    });

    this.values.forEach((v, i) => { v.setText(String(rawValues[i] ?? 0)); });
  }
}
