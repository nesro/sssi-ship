import Phaser from 'phaser';
import { BROWNOUT_THRESHOLD, TICKS_PER_SECOND } from '../core/constants';
import { activeDamageMult, activeFireRateMult, activeGeneratorMult, computeEffectiveStats } from '../core/stats';
import type { CoreState, EnemyState } from '../core/types';
import { cssColor, PALETTE } from './palette';
import { fontPx, INFO_PANEL_W, px } from './layout';
import { UI_FONT } from './widgets';

// Hull bar uses vivid green — ADD blend over near-black makes white look grey, green stays readable
const HULL_GREEN = 0x44ff66;

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

const STAT_BARS = [
  { label: 'HULL',  color: HULL_GREEN },
  { label: 'SHLD',  color: PALETTE.shieldBlue },
  { label: 'ENRG',  color: PALETTE.generatorAmber },
  { label: 'MISS',  color: PALETTE.weaponCyan },
] as const;

/** Left control panel: 4 compact horizontal stat bars + stat lines. */
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

    this.labels = STAT_BARS.map((bar, i) =>
      scene.add
        .text(px(BAR_LABEL_X), px(ROW_TOP + i * ROW_GAP), bar.label, {
          fontFamily: UI_FONT,
          fontSize: `${String(fontPx(7))}px`,
          color: cssColor(bar.color),
        })
        .setOrigin(0, 0.5)
        .setAlpha(0.8)
        .setDepth(11),
    );

    this.values = STAT_BARS.map((bar, i) =>
      scene.add
        .text(px(VALUE_X), px(ROW_TOP + i * ROW_GAP), '', {
          fontFamily: UI_FONT,
          fontSize: `${String(fontPx(7))}px`,
          color: cssColor(bar.color),
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
    const { ship } = state;
    const stats = computeEffectiveStats(
      state.loadout, state.modifiers,
      activeDamageMult(state), activeFireRateMult(state), activeGeneratorMult(state),
    );

    const hullFrac    = ship.maxHull > 0            ? ship.hull / ship.maxHull              : 0;
    const shieldFrac  = stats.shieldCapacity > 0    ? ship.shield / stats.shieldCapacity    : 0;
    const energyFrac  = stats.generatorCapacity > 0 ? ship.energy / stats.generatorCapacity : 0;
    const missionFrac = boss !== null ? boss.hp / boss.maxHp : progressFrac;
    const inBrownout  = energyFrac < BROWNOUT_THRESHOLD;

    const fracs  = [hullFrac, shieldFrac, energyFrac, missionFrac];
    const colors = [
      HULL_GREEN,
      PALETTE.shieldBlue,
      inBrownout ? 0xff4400 : PALETTE.generatorAmber,
      boss !== null ? PALETTE.enemyOrange : PALETTE.weaponCyan,
    ];

    // ── Draw 4 horizontal bars ─────────────────────────────────────────────────
    this.bgGfx.clear();
    this.fillGfx.clear();

    STAT_BARS.forEach((_, i) => {
      const cy    = ROW_TOP + i * ROW_GAP;
      const frac  = Math.max(0, Math.min(1, fracs[i] ?? 0));
      const filled = frac * BAR_W;
      const color = colors[i] ?? HULL_GREEN;
      const by    = px(cy - BAR_H / 2);
      const bh    = px(BAR_H);

      this.bgGfx.fillStyle(0x0d0d28, 0.9);
      this.bgGfx.fillRect(px(BAR_X), by, px(BAR_W), bh);
      this.bgGfx.lineStyle(px(0.8), color, 0.18);
      this.bgGfx.strokeRect(px(BAR_X), by, px(BAR_W), bh);

      if (filled > 0) {
        this.fillGfx.fillStyle(color, 0.55);
        this.fillGfx.fillRect(px(BAR_X), by, px(filled), bh);
        this.fillGfx.fillStyle(color, 1.0);
        this.fillGfx.fillRect(px(BAR_X + filled - 2), by, px(2), bh);
      }
    });

    // Support-call markers on the MISS bar
    if (boss === null) {
      const lastEvent = state.mission.events[state.mission.events.length - 1];
      const totalTicks = lastEvent !== undefined ? lastEvent.atTimelineTick * 1.05 : 1;
      const cy = ROW_TOP + 3 * ROW_GAP;
      for (const tick of state.mission.supportCallTicks) {
        const frac = Math.min(1, tick / totalTicks);
        const markerX = BAR_X + frac * BAR_W;
        this.fillGfx.fillStyle(PALETTE.generatorAmber, 0.9);
        this.fillGfx.fillRect(px(markerX - 1), px(cy - BAR_H / 2 - 3), px(2), px(BAR_H + 6));
      }
    }

    // ── Value labels ───────────────────────────────────────────────────────────
    const missionVal = boss !== null
      ? `${String(Math.round(missionFrac * 100))}%`
      : `${String(Math.round(progressFrac * 100))}%`;

    [
      `${String(Math.ceil(ship.hull))}/${String(Math.ceil(ship.maxHull))}`,
      `${String(Math.ceil(ship.shield))}/${String(Math.ceil(stats.shieldCapacity))}`,
      `${String(Math.ceil(ship.energy))}/${String(Math.ceil(stats.generatorCapacity))}`,
      missionVal,
    ].forEach((txt, i) => {
      this.values[i]?.setText(txt);
      this.values[i]?.setColor(cssColor(colors[i] ?? HULL_GREEN));
    });

    this.labels[2]?.setColor(cssColor(inBrownout ? 0xff4400 : PALETTE.generatorAmber));
    this.labels[3]?.setText(boss !== null ? 'BOSS' : 'MISS');

    // ── Stats section ──────────────────────────────────────────────────────────
    const dps = stats.weaponEquipped
      ? (stats.weaponDamage / stats.weaponInterval) * TICKS_PER_SECOND
      : 0;
    const weapon   = state.loadout.weapon;
    const critMult = stats.shipCritMultOverride ?? (weapon?.critMult ?? 2.0);
    const critPct  = Math.round((weapon?.critChance ?? 0) * 100);
    const minDmg   = stats.weaponDamage;
    const maxDmg   = minDmg * critMult;
    const timeSec  = (state.tick / TICKS_PER_SECOND).toFixed(1);

    this.statsTexts[0].setText(`DPS ${dps.toFixed(1)}  K${String(state.stats.kills)}`);
    this.statsTexts[1].setText(`T ${timeSec}s`);
    this.statsTexts[2].setText(stats.weaponEquipped ? `${minDmg.toFixed(1)}–${maxDmg.toFixed(1)}` : '');
    this.statsTexts[3].setText(stats.weaponEquipped ? `CRIT ${String(critPct)}%` : '');
  }
}
