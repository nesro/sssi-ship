import Phaser from 'phaser';
import { BROWNOUT_THRESHOLD, TICKS_PER_SECOND } from '../core/constants';
import { activeDamageMult, computeEffectiveStats } from '../core/stats';
import type { CoreState, EnemyState } from '../core/types';
import { cssColor, PALETTE } from './palette';
import { fontPx, LEFT_PANEL_W, LOGICAL_HEIGHT, px } from './layout';
import { UI_FONT } from './widgets';

// 4 stat bars: HULL / SHIELD / ENERGY / MISSION(or BOSS)
const SECTION = LEFT_PANEL_W / 4;
const BAR_W = 34;
const BAR_TOP = 26;
const BAR_BOT = LOGICAL_HEIGHT - 110; // 430
const BAR_H = BAR_BOT - BAR_TOP;

const VALUE_Y = BAR_BOT + 14; // 444  — current/max labels
const LABEL_Y = BAR_BOT + 30; // 460  — HULL/SHIELD/ENERGY/MISSION
const STATS_Y = BAR_BOT + 48; // 478  — stat text lines start

const BAR_X = [
  Math.round(SECTION * 0.5),
  Math.round(SECTION * 1.5),
  Math.round(SECTION * 2.5),
  Math.round(SECTION * 3.5),
] as const;

const PANEL_CX = Math.round(LEFT_PANEL_W / 2);

const STAT_BARS = [
  { label: 'HULL',    color: PALETTE.hullWhite },
  { label: 'SHIELD',  color: PALETTE.shieldBlue },
  { label: 'ENERGY',  color: PALETTE.generatorAmber },
  { label: 'MISSION', color: PALETTE.weaponCyan },
] as const;

/** Left info panel: 4 stat bars + current/max values + DPS/kills/time/damage/crit stats. */
export class CombatHud {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly values: Phaser.GameObjects.Text[];
  private readonly labels: Phaser.GameObjects.Text[];
  private readonly statsTexts: [
    Phaser.GameObjects.Text,
    Phaser.GameObjects.Text,
    Phaser.GameObjects.Text,
    Phaser.GameObjects.Text,
  ];

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(5);

    this.labels = STAT_BARS.map((bar, i) =>
      scene.add
        .text(px(BAR_X[i] ?? 0), px(LABEL_Y), bar.label, {
          fontFamily: UI_FONT,
          fontSize: `${String(fontPx(8))}px`,
          color: cssColor(bar.color),
        })
        .setOrigin(0.5, 0)
        .setAlpha(0.5)
        .setDepth(11),
    );

    this.values = STAT_BARS.map((bar, i) =>
      scene.add
        .text(px(BAR_X[i] ?? 0), px(VALUE_Y), '', {
          fontFamily: UI_FONT,
          fontSize: `${String(fontPx(10))}px`,
          color: cssColor(bar.color),
          align: 'center',
        })
        .setOrigin(0.5, 0)
        .setAlpha(0.85)
        .setDepth(11),
    );

    const statsStyle = { fontFamily: UI_FONT, fontSize: `${String(fontPx(9))}px`, color: '#778899' };
    this.statsTexts = [
      scene.add.text(px(PANEL_CX), px(STATS_Y),      '', statsStyle).setOrigin(0.5, 0).setDepth(11),
      scene.add.text(px(PANEL_CX), px(STATS_Y + 16), '', statsStyle).setOrigin(0.5, 0).setDepth(11),
      scene.add.text(px(PANEL_CX), px(STATS_Y + 32), '', statsStyle).setOrigin(0.5, 0).setDepth(11),
      scene.add.text(px(PANEL_CX), px(STATS_Y + 48), '', statsStyle).setOrigin(0.5, 0).setDepth(11),
    ];
  }

  update(state: CoreState, boss: EnemyState | null, progressFrac: number): void {
    const { ship } = state;
    const stats = computeEffectiveStats(state.loadout, state.modifiers, activeDamageMult(state));

    const hullFrac    = ship.maxHull > 0                ? ship.hull / ship.maxHull             : 0;
    const shieldFrac  = stats.shieldCapacity > 0        ? ship.shield / stats.shieldCapacity   : 0;
    const energyFrac  = stats.generatorCapacity > 0     ? ship.energy / stats.generatorCapacity : 0;
    const missionFrac = boss !== null ? boss.hp / boss.maxHp : progressFrac;
    const inBrownout  = energyFrac < BROWNOUT_THRESHOLD;

    const fracs  = [hullFrac, shieldFrac, energyFrac, missionFrac];
    const colors = [
      PALETTE.hullWhite,
      PALETTE.shieldBlue,
      inBrownout ? 0xff4400 : PALETTE.generatorAmber,
      boss !== null ? PALETTE.enemyOrange : PALETTE.weaponCyan,
    ];

    // ── Draw 4 bars ───────────────────────────────────────────────────────────
    this.gfx.clear();
    STAT_BARS.forEach((_, i) => {
      const cx     = BAR_X[i] ?? 0;
      const frac   = Math.max(0, Math.min(1, fracs[i] ?? 0));
      const filled = Math.round(frac * BAR_H);
      const color  = colors[i] ?? PALETTE.hullWhite;

      this.gfx.fillStyle(0x111122, 0.7);
      this.gfx.fillRect(px(cx - BAR_W / 2), px(BAR_TOP), px(BAR_W), px(BAR_H));

      if (filled > 0) {
        this.gfx.fillStyle(color, 0.7);
        this.gfx.fillRect(px(cx - BAR_W / 2), px(BAR_BOT - filled), px(BAR_W), px(filled));
        this.gfx.fillStyle(color, 0.95);
        this.gfx.fillRect(px(cx - BAR_W / 2), px(BAR_BOT - filled), px(BAR_W), px(2));
      }
    });

    // Support call markers on the MISSION bar when no boss
    if (boss === null) {
      const lastEvent = state.mission.events[state.mission.events.length - 1];
      const totalTicks = lastEvent !== undefined ? lastEvent.atTimelineTick * 1.05 : 1;
      const cx = BAR_X[3];
      for (const tick of state.mission.supportCallTicks) {
        const frac = Math.min(1, tick / totalTicks);
        const markerY = BAR_BOT - frac * BAR_H;
        this.gfx.fillStyle(PALETTE.generatorAmber, 0.9);
        this.gfx.fillRect(px(cx - BAR_W / 2 - 3), px(markerY - 1), px(BAR_W + 6), px(2));
      }
    }

    // ── Current/max values ────────────────────────────────────────────────────
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
      this.values[i]?.setColor(cssColor(colors[i] ?? PALETTE.hullWhite));
    });

    this.labels[2]?.setColor(cssColor(inBrownout ? 0xff4400 : PALETTE.generatorAmber));
    this.labels[3]?.setText(boss !== null ? 'BOSS' : 'MISSION');

    // ── Stats section ─────────────────────────────────────────────────────────
    const dps = stats.weaponEquipped
      ? (stats.weaponDamage / stats.weaponInterval) * TICKS_PER_SECOND
      : 0;
    const weapon    = state.loadout.weapon;
    const critMult  = stats.shipCritMultOverride ?? (weapon?.critMult  ?? 2.0);
    const critPct   = Math.round((weapon?.critChance ?? 0) * 100);
    const minDmg    = stats.weaponDamage;
    const maxDmg    = minDmg * critMult;
    const timeSec   = (state.tick / TICKS_PER_SECOND).toFixed(1);

    this.statsTexts[0].setText(`DPS ${dps.toFixed(1)}   KILLS ${String(state.stats.kills)}`);
    this.statsTexts[1].setText(`TIME ${timeSec}s`);
    this.statsTexts[2].setText(
      stats.weaponEquipped ? `DMG  ${minDmg.toFixed(1)} – ${maxDmg.toFixed(1)}` : '',
    );
    this.statsTexts[3].setText(
      stats.weaponEquipped ? `CRIT  ${String(critPct)}%   ×${critMult.toFixed(1)}` : '',
    );
  }
}
