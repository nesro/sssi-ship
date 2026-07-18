import Phaser from 'phaser';
import type { CoreState, EnemyState } from '../core/types';
import { TICKS_PER_SECOND } from '../core/constants';
import { computeCombatHudViewModel, HULL_GREEN } from '../viewmodel/combat';
import type { BarViewModel, StarIndicatorViewModel } from '../viewmodel/combat';
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

// Item 3 (fable-fun-review-followup.md): live star progress, below the stat lines
// (STATS_Y..142) and above CombatScene's "ABILITIES" header (fixed at y=180).
const STAR_ROW_Y = 158;
const COUNTDOWN_Y = 172;
const STAR_FAMILIES: { family: StarIndicatorViewModel['family']; label: string; x: number }[] = [
  { family: 'all-kills', label: 'NO HITS', x: 28 },
  { family: 'shield-unbroken', label: 'SHIELD', x: 92 },
];

// Fixed per-row name + color, set once at construction (matches the real HUD, where
// only the ENRG label recolors dynamically for brownout and the PROG/BOSS label only
// ever changes its text, never its color).
const ROW_LABELS = [
  { label: 'HULL', color: HULL_GREEN },
  { label: 'SHLD', color: PALETTE.shieldBlue },
  { label: 'ENRG', color: PALETTE.generatorAmber },
  { label: 'PROG', color: PALETTE.weaponCyan },
] as const;

// Row indices into ROW_LABELS/hudRowScreenBounds — named so callers pointing an arrow
// at a specific bar (e.g. CombatScene's narrator-modal HUD callouts) don't hardcode a
// bare number matching this array's order by accident.
export const HUD_ROW_HULL = 0;
export const HUD_ROW_SHLD = 1;
export const HUD_ROW_ENRG = 2;
export const HUD_ROW_PROG = 3;

/** Device-px bounds of a HUD row's label+bar area, for pointing an arrow at it from
 * elsewhere in the scene (drawPointerArrow, widgets.ts) — kept here so callers never
 * duplicate ROW_TOP/ROW_GAP/BAR_LABEL_X/BAR_END_X as their own magic numbers. */
export function hudRowScreenBounds(rowIndex: number): Phaser.Geom.Rectangle {
  const cy = ROW_TOP + rowIndex * ROW_GAP;
  return new Phaser.Geom.Rectangle(px(BAR_LABEL_X), px(cy - 10), px(BAR_END_X - BAR_LABEL_X), px(20));
}

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
  private readonly starIcons: { dot: Phaser.GameObjects.Arc; label: Phaser.GameObjects.Text }[];
  private readonly countdownText: Phaser.GameObjects.Text;

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

    // A dark stroke, not just the fill color, is what actually fixes the legibility bug
    // (fable-fun-review-followup.md's screenshot pass): this text sits directly on top of
    // its own bar's fill, and at high fill% a bright same-hue background swallows the
    // leading digit (78/80 misread as 8/80) — a fill-independent outline reads correctly
    // regardless of what's rendered underneath.
    this.values = ROW_LABELS.map((row, i) =>
      scene.add
        .text(px(VALUE_X), px(ROW_TOP + i * ROW_GAP), '', {
          fontFamily: UI_FONT,
          fontSize: `${String(fontPx(7))}px`,
          color: cssColor(row.color),
          align: 'right',
          stroke: cssColor(PALETTE.backgroundNearBlack),
          strokeThickness: px(1.6),
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

    // Fable's 2nd pass: at the original px(3) dot + 7px font, these were effectively
    // invisible in an actual screenshot — a bigger dot with its own contrast ring plus a
    // stroked label (same fill-independent-outline trick as the bar values above) actually
    // reads at native resolution instead of just existing in the DOM.
    this.starIcons = STAR_FAMILIES.map((f) => ({
      dot: scene.add.circle(px(f.x - 9), px(STAR_ROW_Y), px(4.5), 0x334455)
        .setStrokeStyle(px(1), PALETTE.backgroundNearBlack, 0.8).setDepth(11),
      label: scene.add.text(px(f.x), px(STAR_ROW_Y), f.label, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(8))}px`, color: '#556677',
        stroke: cssColor(PALETTE.backgroundNearBlack), strokeThickness: px(1.4),
      }).setOrigin(0, 0.5).setDepth(11),
    }));
    this.countdownText = scene.add.text(px(BAR_LABEL_X), px(COUNTDOWN_Y), '', {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(8))}px`, color: cssColor(PALETTE.weaponCyan),
      stroke: cssColor(PALETTE.backgroundNearBlack), strokeThickness: px(1.4),
    }).setOrigin(0, 0.5).setDepth(11);
  }

  update(state: CoreState, boss: EnemyState | null, progressFrac: number, alreadyEarnedStarIds: string[]): void {
    const vm = computeCombatHudViewModel(state, boss, progressFrac, alreadyEarnedStarIds);
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

    this.renderStarIndicators(vm.starIndicators, vm.timeStarTicksRemaining);
  }

  private renderStarIndicators(indicators: StarIndicatorViewModel[], ticksRemaining: number | null): void {
    const byFamily = new Map(indicators.map((i) => [i.family, i]));
    STAR_FAMILIES.forEach((f, i) => {
      const icon = this.starIcons[i];
      if (icon === undefined) return;
      const status = byFamily.get(f.family);
      icon.dot.setVisible(status !== undefined);
      icon.label.setVisible(status !== undefined);
      if (status === undefined) return;
      icon.dot.setFillStyle(status.onTrack ? 0x44ff66 : 0xff4444);
      icon.label.setColor(cssColor(status.onTrack ? 0xaaffcc : 0xff9999));
    });

    if (ticksRemaining === null) {
      this.countdownText.setVisible(false);
      return;
    }
    this.countdownText.setVisible(true);
    this.countdownText.setText(`TIME STAR  ${(ticksRemaining / TICKS_PER_SECOND).toFixed(1)}s`);
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
