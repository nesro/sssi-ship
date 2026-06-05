import Phaser from 'phaser';
import { DebugConfig }  from '../debug/DebugConfig.js';
import { DebugOverlay } from '../debug/DebugOverlay.js';

// ─── layout constants (exported so GameScene can align play-field objects) ───

const        HUD_W  = 240;   // right panel width in pixels (internal to this module)
export const PLAY_W = 560;   // play-field width: 800 − HUD_W

// Panel internal geometry (all canvas-absolute x coords)
const PANEL_X = PLAY_W;           // panel left edge
const PAD     = 10;               // horizontal inner padding
const LBL_X   = PANEL_X + PAD;   // label text left edge
const BAR_X   = PANEL_X + 48;    // status bar left edge
const BAR_W   = 120;              // status bar width
const BAR_H   = 9;                // status bar height
const VAL_X   = PANEL_X + 230;   // value text right edge (origin 1,0)

// XP thresholds — cumulative XP to reach level 2, 3, 4, 5, 6
const XP_THRESHOLDS = [80, 200, 380, 600, 900];

// Maximum number of active card names shown in the panel.
const MAX_CARDS = 3;

// ─── row Y positions ─────────────────────────────────────────────────────────

const Y_SCORE    = 14;   // SCORE label top
const Y_XP       = 33;   // XP progress bar top
const Y_SEP1     = 47;   // first separator
const Y_HP       = 55;   // HP bar row
const Y_GEN      = 78;   // GEN bar row
const Y_SHD      = 101;  // SHD bar row
const Y_SEP2     = 122;  // second separator
const Y_CARDS_LBL = 130; // "CARDS" label
const Y_CARD0    = 144;  // first card slot (14 px per slot)
const Y_SEP3     = 194;  // third separator (above weapon button area)

export class CombatHUD {
  private readonly scoreText:  Phaser.GameObjects.Text;
  private readonly levelText:  Phaser.GameObjects.Text;
  private readonly hpText:     Phaser.GameObjects.Text;
  private readonly energyText: Phaser.GameObjects.Text;
  private readonly shieldText: Phaser.GameObjects.Text;
  private readonly barGfx:     Phaser.GameObjects.Graphics;
  private readonly xpBarGfx:   Phaser.GameObjects.Graphics;
  private readonly cardTexts:  Phaser.GameObjects.Text[];

  private debugOverlay: DebugOverlay | null = null;
  private activeCards:  string[]            = [];

  constructor(scene: Phaser.Scene, _W: number, H: number) {
    // ── panel chrome (static, created once) ──────────────────────────────────

    // Vertical divider line between play field and HUD
    scene.add.rectangle(PANEL_X, H / 2, 1, H, 0x222222).setDepth(9);

    // Dark panel background
    scene.add.rectangle(
      PANEL_X + HUD_W / 2, H / 2,
      HUD_W, H,
      0x040404, 1,
    ).setDepth(9);

    // ── score & level ────────────────────────────────────────────────────────
    this.scoreText = scene.add.text(LBL_X, Y_SCORE, 'SCORE  0', {
      fontSize: '12px', color: '#ffffff', fontFamily: 'monospace',
    }).setDepth(10);

    this.levelText = scene.add.text(PANEL_X + HUD_W - PAD, Y_SCORE, 'LV 1', {
      fontSize: '12px', color: '#ffff00', fontFamily: 'monospace',
    }).setOrigin(1, 0).setDepth(10);

    // ── XP progress bar ──────────────────────────────────────────────────────
    this.xpBarGfx = scene.add.graphics().setDepth(10);

    // ── separator 1 ──────────────────────────────────────────────────────────
    scene.add.rectangle(PANEL_X + HUD_W / 2, Y_SEP1, HUD_W, 1, 0x1a1a1a).setDepth(10);

    // ── row labels ───────────────────────────────────────────────────────────
    const lbl = { fontSize: '9px', color: '#555555', fontFamily: 'monospace' };
    scene.add.text(LBL_X, Y_HP,  'HP',  lbl).setDepth(10);
    scene.add.text(LBL_X, Y_GEN, 'GEN', lbl).setDepth(10);
    scene.add.text(LBL_X, Y_SHD, 'SHD', lbl).setDepth(10);

    // ── value texts ──────────────────────────────────────────────────────────
    const val = { fontSize: '9px', color: '#888888', fontFamily: 'monospace' };
    this.hpText     = scene.add.text(VAL_X, Y_HP,  '', val).setOrigin(1, 0).setDepth(10);
    this.energyText = scene.add.text(VAL_X, Y_GEN, '', val).setOrigin(1, 0).setDepth(10);
    this.shieldText = scene.add.text(VAL_X, Y_SHD, '', val).setOrigin(1, 0).setDepth(10);

    // ── bars (drawn dynamically each frame) ──────────────────────────────────
    this.barGfx = scene.add.graphics().setDepth(10);

    // ── separator 2 ──────────────────────────────────────────────────────────
    scene.add.rectangle(PANEL_X + HUD_W / 2, Y_SEP2, HUD_W, 1, 0x1a1a1a).setDepth(10);

    // ── active cards section ─────────────────────────────────────────────────
    scene.add.text(LBL_X, Y_CARDS_LBL, 'CARDS', {
      fontSize: '9px', color: '#444444', fontFamily: 'monospace',
    }).setDepth(10);

    this.cardTexts = Array.from({ length: MAX_CARDS }, (_, i) =>
      scene.add.text(LBL_X, Y_CARD0 + i * 14, '', {
        fontSize: '10px', color: '#888855', fontFamily: 'monospace',
      }).setDepth(10),
    );

    // ── separator 3 (above side-weapon button area) ───────────────────────────
    scene.add.rectangle(PANEL_X + HUD_W / 2, Y_SEP3, HUD_W, 1, 0x1a1a1a).setDepth(10);

    if (DebugConfig.enabled) this.debugOverlay = new DebugOverlay(scene);
  }

  // ─── update (called every frame) ─────────────────────────────────────────

  update(
    hullHp:       number,
    hullMaxHp:    number,
    energyAmount: number,
    energyCap:    number,
    energyRatio:  number,
    shieldHp:     number,
    shieldMax:    number,
    shieldRatio:  number,
    xp:           number,
    level:        number,
  ): void {
    // XP progress bar
    const xpRatio = this.xpProgressRatio(xp, level);
    this.xpBarGfx.clear();
    this.xpBarGfx.fillStyle(0x1a1a1a, 1);
    this.xpBarGfx.fillRect(PANEL_X, Y_XP, HUD_W, 4);
    this.xpBarGfx.fillStyle(0xaa66ff, 1);
    this.xpBarGfx.fillRect(PANEL_X, Y_XP, HUD_W * xpRatio, 4);

    // Status bars — only redraw when values have changed
    const hpRatio  = Math.max(0, hullHp / hullMaxHp);
    const hpColor  = hpRatio > 0.5 ? 0x00ee00 : hpRatio > 0.25 ? 0xeeee00 : 0xee2200;
    this.barGfx.clear();
    this.drawBar(Y_HP,  hpRatio,    hpColor);
    this.drawBar(Y_GEN, energyRatio, 0x0077ff);
    this.drawBar(Y_SHD, shieldRatio, 0x00cccc);

    this.hpText.setText(`${hullHp}/${hullMaxHp}`);
    this.energyText.setText(`${Math.round(energyAmount)}/${energyCap}`);
    this.shieldText.setText(shieldMax > 0 ? `${Math.round(shieldHp)}/${shieldMax}` : '--');
  }

  updateScore(score: number): void {
    this.scoreText.setText(`SCORE  ${score}`);
  }

  updateLevel(level: number): void {
    this.levelText.setText(`LV ${level}`);
  }

  // Append a card name to the active-cards list (keeps the last MAX_CARDS).
  showCard(label: string): void {
    this.activeCards.push(label);
    if (this.activeCards.length > MAX_CARDS) {
      this.activeCards.shift();
    }
    for (let i = 0; i < MAX_CARDS; i++) {
      const name = this.activeCards[i];
      this.cardTexts[i].setText(name ? `• ${name}` : '');
    }
  }

  enableDebugOverlay(scene: Phaser.Scene): void {
    this.debugOverlay = new DebugOverlay(scene);
  }

  disableDebugOverlay(): void {
    this.debugOverlay?.destroy();
    this.debugOverlay = null;
  }

  updateDebugOverlay(stats: Record<string, string | number>): void {
    this.debugOverlay?.update(stats);
  }

  get hasDebugOverlay(): boolean {
    return this.debugOverlay !== null;
  }

  // ─── private helpers ──────────────────────────────────────────────────────

  private drawBar(y: number, ratio: number, color: number): void {
    this.barGfx.fillStyle(0x1a1a1a, 1);
    this.barGfx.fillRect(BAR_X, y, BAR_W, BAR_H);
    this.barGfx.fillStyle(color, 1);
    this.barGfx.fillRect(BAR_X, y, BAR_W * Math.max(0, ratio), BAR_H);
  }

  private xpProgressRatio(xp: number, level: number): number {
    if (level > XP_THRESHOLDS.length) return 1;
    const prev = level >= 2 ? XP_THRESHOLDS[level - 2] : 0;
    const next  = XP_THRESHOLDS[level - 1];
    return Math.min(1, (xp - prev) / (next - prev));
  }
}
