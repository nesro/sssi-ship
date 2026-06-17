import Phaser from 'phaser';
import { BROWNOUT_THRESHOLD, TICKS_PER_SECOND } from '../core/constants';
import { brownoutFactor } from '../core/energy';
import { activeDamageMult, computeEffectiveStats } from '../core/stats';
import type { CoreState } from '../core/types';
import { cssColor, PALETTE } from './palette';
import { fontPx, px } from './layout';
import { UI_FONT } from './widgets';

const LINE_HEIGHT = 24;
const HUD_TOP = 54;

/** Key stats in the left control panel, colour-coded per system (V2_HANDOFF.md §4.1). */
export class CombatHud {
  private readonly lines: Phaser.GameObjects.Text[];

  constructor(scene: Phaser.Scene) {
    const rows: { color: number }[] = [
      { color: PALETTE.hullWhite },
      { color: PALETTE.shieldBlue },
      { color: PALETTE.generatorAmber },
      { color: PALETTE.weaponCyan },
      { color: PALETTE.motorMagenta },
    ];
    this.lines = rows.map((row, index) =>
      scene.add
        .text(px(8), px(HUD_TOP + index * LINE_HEIGHT), '', {
          fontFamily: UI_FONT,
          fontSize: `${String(fontPx(11))}px`,
          color: cssColor(row.color),
        })
        .setDepth(10),
    );
  }

  update(state: CoreState): void {
    const { ship } = state;
    const stats = computeEffectiveStats(state.loadout, state.modifiers, activeDamageMult(state));
    const stretch = brownoutFactor(ship.energy, stats.generatorCapacity);
    const energyFraction = stats.generatorCapacity > 0 ? ship.energy / stats.generatorCapacity : 0;
    const brownout = energyFraction < BROWNOUT_THRESHOLD ? ` ×${stretch.toFixed(1)}` : '';
    const dps = stats.weaponEquipped ? (stats.weaponDamage / stats.weaponInterval) * TICKS_PER_SECOND : 0;
    const texts = [
      `HULL ${bar(ship.hull, ship.maxHull)} ${Math.ceil(ship.hull).toString()}`,
      `SHLD ${bar(ship.shield, stats.shieldCapacity)} ${Math.ceil(ship.shield).toString()}`,
      `ENRG ${bar(ship.energy, stats.generatorCapacity)} ${Math.ceil(ship.energy).toString()}${brownout}`,
      `DPS ${dps.toFixed(1)}  k${String(state.stats.kills)}`,
      `t ${(state.tick / TICKS_PER_SECOND).toFixed(1)}s  q${String(state.enemies.length)}`,
    ];
    this.lines.forEach((line, index) => line.setText(texts[index] ?? ''));
  }
}

function bar(value: number, max: number): string {
  const SLOTS = 6;
  const filled = Math.round(Math.max(0, Math.min(1, value / max)) * SLOTS);
  return '█'.repeat(filled) + '░'.repeat(SLOTS - filled);
}
