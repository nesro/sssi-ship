import Phaser from 'phaser';
import type { CoreState, EnemyState } from '../core/types';
import { computeCombatHudViewModel, HULL_GREEN } from '../viewmodel/combat';
import type { BarViewModel } from '../viewmodel/combat';
import { cssColor, PALETTE } from './palette';
import { fontPx, INFO_PANEL_W, px } from './layout';
import { UI_FONT } from './widgets';

// Left info panel (160px wide): 4 compact horizontal bar rows.
const ROW_TOP = 14;      // y-centre of first bar
const ROW_GAP = 20;      // row-to-row spacing

const BAR_LABEL_X = 20;                   // label left edge — 20 px mobile safe zone
const BAR_X = 52;                         // bar fill left edge
const BAR_END_X = INFO_PANEL_W - 20;      // bar fill right edge (= 140)
const BAR_W = BAR_END_X - BAR_X;          // = 88
const BAR_H = 6;
const VALUE_X = INFO_PANEL_W - 4;         // value text right edge (panel-internal, not screen edge)

const STATS_Y = ROW_TOP + 4 * ROW_GAP + 12;  // = 106
const STAT_LINE_GAP = 12;

// Fixed per-row name + color, set once at construction (matches the real HUD, where
// only the ENRG label recolors dynamically for brownout and the MISS/BOSS label only
// ever changes its text, never its color).
const ROW_LABELS = [
  { label: 'HULL', color: HULL_GREEN },
  { label: 'SHLD', color: PALETTE.shieldBlue },
  { label: 'ENRG', color: PALETTE.generatorAmber },
  { label: 'MISS', color: PALETTE.weaponCyan },
] as const;

/** Left control panel: 4 compact horizontal stat bars + stat lines. Reads a computeCombatHudViewModel() every frame — no game logic here. */
export class CombatHud {
  private readonly bgGfx: Phaser.GameObjects.Graphics;
  private readonly fillGfx: Phaser.GameObjects.Graphics;
  private readonly values: Phaser.GameObjects.Text[];
  private readonly labels: Phaser.GameObjects.Text[];
  private readonly statsTexts: [
    Phaser.GameObjects.Text,
    Phaser.GameObjects.Text,
    Phaser.GameObjects.Text,
    Phaser.GameObjects.Text,
  ];

  constructor(scene: Phaser.Scene) {
    this.bgGfx   = scene.add.graphics().setDepth(5);
    this.fillGfx = scene.add.graphics().setDepth(6).setBlendMode(Phaser.BlendModes.ADD);

    this.labels = ROW_LABELS.map((row, i) =>
      scene.add
        .text(px(BAR_LABEL_X), px(ROW_TOP + i * ROW_GAP), row.label, {
          fontFamily: UI_FONT,
          fontSize: `${String(fontPx(7))}px`,
          color: cssColor(row.color),
        })
        .setOrigin(0, 0.5)
        .setAlpha(0.8)
        .setDepth(11),
    );

    this.values = ROW_LABELS.map((row, i) =>
      scene.add
        .text(px(VALUE_X), px(ROW_TOP + i * ROW_GAP), '', {
          fontFamily: UI_FONT,
          fontSize: `${String(fontPx(7))}px`,
          color: cssColor(row.color),
          align: 'right',
        })
        .setOrigin(1, 0.5)
        .setAlpha(0.9)
        .setDepth(11),
    );

    const panelCX = INFO_PANEL_W / 2;
    const statsStyle = { fontFamily: UI_FONT, fontSize: `${String(fontPx(8))}px`, color: '#8899aa' };
    this.statsTexts = [
      scene.add.text(px(panelCX), px(STATS_Y),                     '', statsStyle).setOrigin(0.5, 0).setDepth(11),
      scene.add.text(px(panelCX), px(STATS_Y + STAT_LINE_GAP),     '', statsStyle).setOrigin(0.5, 0).setDepth(11),
      scene.add.text(px(panelCX), px(STATS_Y + STAT_LINE_GAP * 2), '', statsStyle).setOrigin(0.5, 0).setDepth(11),
      scene.add.text(px(panelCX), px(STATS_Y + STAT_LINE_GAP * 3), '', statsStyle).setOrigin(0.5, 0).setDepth(11),
    ];
  }

  update(state: CoreState, boss: EnemyState | null, progressFrac: number): void {
    const vm = computeCombatHudViewModel(state, boss, progressFrac);
    const bars: BarViewModel[] = [vm.hull, vm.shield, vm.energy, vm.missionOrBoss];

    this.bgGfx.clear();
    this.fillGfx.clear();
    bars.forEach((bar, i) => { this.renderBar(bar, i); });
    this.renderSupportMarkers(vm.supportMarkers);

    bars.forEach((bar, i) => {
      this.values[i]?.setText(bar.label);
      this.values[i]?.setColor(cssColor(bar.color));
    });
    this.labels[2]?.setColor(cssColor(vm.energy.color));
    this.labels[3]?.setText(vm.missionOrBoss.name);

    this.statsTexts[0].setText(vm.dpsLine);
    this.statsTexts[1].setText(vm.timeLine);
    this.statsTexts[2].setText(vm.damageRangeLine);
    this.statsTexts[3].setText(vm.critLine);
  }

  private renderBar(bar: BarViewModel, index: number): void {
    const cy = ROW_TOP + index * ROW_GAP;
    const filled = bar.fraction * BAR_W;
    const by = px(cy - BAR_H / 2);
    const bh = px(BAR_H);

    this.bgGfx.fillStyle(0x0d0d28, 0.9);
    this.bgGfx.fillRect(px(BAR_X), by, px(BAR_W), bh);
    this.bgGfx.lineStyle(px(0.8), bar.color, 0.18);
    this.bgGfx.strokeRect(px(BAR_X), by, px(BAR_W), bh);

    if (filled > 0) {
      this.fillGfx.fillStyle(bar.color, 0.55);
      this.fillGfx.fillRect(px(BAR_X), by, px(filled), bh);
      this.fillGfx.fillStyle(bar.color, 1.0);
      this.fillGfx.fillRect(px(BAR_X + filled - 2), by, px(2), bh);
    }
  }

  private renderSupportMarkers(markers: { fraction: number }[]): void {
    const cy = ROW_TOP + 3 * ROW_GAP;
    for (const marker of markers) {
      const markerX = BAR_X + marker.fraction * BAR_W;
      this.fillGfx.fillStyle(PALETTE.generatorAmber, 0.9);
      this.fillGfx.fillRect(px(markerX - 1), px(cy - BAR_H / 2 - 3), px(2), px(BAR_H + 6));
    }
  }
}
