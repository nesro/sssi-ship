import Phaser from 'phaser';
import { TICKS_PER_SECOND } from '../core/constants';
import type { StarFamily, StarSpec } from '../core/types';
import { ALL_MISSIONS, totalStarsAvailable } from '../data/missions';
import { isMissionUnlocked, loadSave, totalStars } from '../save/SaveManager';
import type { SaveData } from '../save/SaveManager';
import { cssColor, PALETTE } from './palette';
import { fontPx, LOGICAL_HEIGHT, LOGICAL_WIDTH, px, SCREEN_WIDTH } from './layout';
import { buildGameTextures } from './textures';
import { addLabel, addTextButton, UI_FONT } from './widgets';
import { Sound } from '../audio/SoundManager';
import type { MissionSpec } from '../core/types';

const ROW_HEIGHT_LOGICAL = 56;
const LIST_TOP_LOGICAL = 130;

type MainTab = 'missions' | 'info';
type InfoSubTab = 'settings' | 'about' | 'manual';

const ABOUT_TEXT = [
  'Hi, I am Nesro.',
  '',
  'I created a simple game back in 2010',
  'for my maturita (final school exam).',
  '',
  'I always wanted to finish it as a proper',
  'mobile game — and now, 16 years later,',
  'I am finally on that mission.',
  '',
  'This game is in early stages.',
  '',
  'If you are interested in game design,',
  'level design, balancing, visuals or music',
  '— please reach out.',
  'I would love to hear from you.',
].join('\n');

const MANUAL_TEXT = [
  'GENERATOR & SHIELD',
  'Your generator charges up to 100%.',
  'When it hits 100% it fires a pulse:',
  'your shield gains energy and the generator',
  'drops to ~50%. This repeats — so shield',
  'builds up gradually. Keep the generator',
  'healthy; a bigger one charges faster.',
  '',
  'WEAPONS & ENERGY',
  'Every shot costs energy. If you run low,',
  'the fire rate slows (brownout). High-tier',
  'weapons hit harder but drink more energy.',
  '',
  'SHOP',
  'Buy and equip weapons, shields, generators',
  'and motors. The live preview shows how',
  'each item changes your combat stats.',
  'Supplies are one-use boosts that refill',
  'free before every mission.',
  '',
  'MISSIONS & STARS',
  'Tutorial missions use a preset loadout.',
  'Each combat mission awards up to 3 stars.',
  'Stars unlock harder missions.',
  '',
  'HOW TO WIN',
  'Upgrade your loadout in the shop, farm',
  'stars on earlier missions, then push into',
  'harder ones. Earn all stars to finish the game.',
].join('\n');

/** Mission select: star-gated tree + MISSIONS/SHOP/INFO tab bar. */
export class MenuScene extends Phaser.Scene {
  private stars: { rect: Phaser.GameObjects.Rectangle; speed: number }[] = [];
  private detailObjects: Phaser.GameObjects.GameObject[] = [];
  private hintVisible = false;
  private mainTab: MainTab = 'missions';
  private infoSubTab: InfoSubTab = 'settings';
  private contentObjects: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super('MenuScene');
  }

  // fallow-ignore-next-line unused-class-member
  create(): void {
    this.stars = [];
    this.detailObjects = [];
    this.contentObjects = [];
    this.mainTab = 'missions';
    this.infoSubTab = 'settings';
    buildGameTextures(this);
    Sound.attach(this.sound);
    Sound.startMusic();
    this.addStarfield();

    const save = loadSave();

    this.add
      .text(SCREEN_WIDTH / 2, px(32), 'NESRO NOVA', {
        fontFamily: UI_FONT,
        fontSize: `${String(fontPx(28))}px`,
        color: cssColor(PALETTE.weaponCyan),
      })
      .setOrigin(0.5);

    addLabel(this, {
      x: px(20), y: px(62),
      text: `★ ${String(totalStars(save))}/${String(totalStarsAvailable())}   ⬤ ${String(save.coins)}`,
      color: PALETTE.generatorAmber, size: 13,
    });

    // Three-tab bar: MISSIONS | SHOP | INFO
    addTextButton(this, {
      x: SCREEN_WIDTH / 2 - px(130), y: px(96),
      label: 'MISSIONS', color: PALETTE.weaponCyan, size: 14,
      onClick: () => { this.mainTab = 'missions'; this.rebuildContent(save); },
    }).setAlpha(1);

    addTextButton(this, {
      x: SCREEN_WIDTH / 2, y: px(96),
      label: 'SHOP', color: PALETTE.motorMagenta, size: 14,
      onClick: () => { this.scene.start('ShopScene'); },
    }).setAlpha(0.55);

    addTextButton(this, {
      x: SCREEN_WIDTH / 2 + px(130), y: px(96),
      label: 'INFO', color: PALETTE.shieldBlue, size: 14,
      onClick: () => { this.mainTab = 'info'; this.rebuildContent(save); },
    }).setAlpha(0.55);

    this.add
      .rectangle(SCREEN_WIDTH / 2, px(112), px(LOGICAL_WIDTH - 20), px(1), 0x333355)
      .setOrigin(0.5, 0);

    this.rebuildContent(save);
  }

  // fallow-ignore-next-line unused-class-member
  override update(_time: number, deltaMs: number): void {
    for (const star of this.stars) {
      star.rect.y += px(star.speed) * deltaMs / 1000;
      if (star.rect.y > px(LOGICAL_HEIGHT + 2)) star.rect.y = -px(2);
    }
  }

  private rebuildContent(save: SaveData): void {
    this.contentObjects.forEach((o) => { o.destroy(); });
    this.contentObjects = [];
    this.detailObjects.forEach((o) => { o.destroy(); });
    this.detailObjects = [];
    this.hintVisible = false;

    if (this.mainTab === 'missions') {
      ALL_MISSIONS.forEach((mission, index) => { this.addMissionRow(save, mission, index); });
      this.addTutorialDivider();
    } else {
      this.buildInfoTab();
    }
  }

  private buildInfoTab(): void {
    const subY = px(128);
    const subTabs: { key: InfoSubTab; label: string }[] = [
      { key: 'settings', label: 'SETTINGS' },
      { key: 'about', label: 'ABOUT' },
      { key: 'manual', label: 'MANUAL' },
    ];
    const slotW = LOGICAL_WIDTH / subTabs.length;
    subTabs.forEach((st, i) => {
      const btn = addTextButton(this, {
        x: px(slotW * (i + 0.5)), y: subY,
        label: st.label,
        color: st.key === this.infoSubTab ? PALETTE.shieldBlue : 0x555577,
        size: 13,
        onClick: () => { this.infoSubTab = st.key; this.rebuildInfoTab(); },
      });
      this.contentObjects.push(btn);
    });
    this.contentObjects.push(
      this.add
        .rectangle(SCREEN_WIDTH / 2, px(140), px(LOGICAL_WIDTH - 24), px(1), 0x222244)
        .setOrigin(0.5, 0),
    );
    this.renderInfoBody();
  }

  private rebuildInfoTab(): void {
    this.contentObjects.forEach((o) => { o.destroy(); });
    this.contentObjects = [];
    this.buildInfoTab();
  }

  private renderInfoBody(): void {
    const contentTop = px(152);
    const leftX = px(20);
    const bodyWidth = px(LOGICAL_WIDTH - 40);
    if (this.infoSubTab === 'settings') {
      this.renderSettings(contentTop, leftX);
    } else if (this.infoSubTab === 'about') {
      this.contentObjects.push(
        this.add.text(leftX, contentTop, ABOUT_TEXT, {
          fontFamily: UI_FONT, fontSize: `${String(fontPx(13))}px`,
          color: cssColor(0xcccccc), lineSpacing: px(4), wordWrap: { width: bodyWidth },
        }),
      );
    } else {
      this.contentObjects.push(
        this.add.text(leftX, contentTop, MANUAL_TEXT, {
          fontFamily: UI_FONT, fontSize: `${String(fontPx(12))}px`,
          color: cssColor(0xaaaacc), lineSpacing: px(3), wordWrap: { width: bodyWidth },
        }),
      );
    }
  }

  private renderSettings(topY: number, leftX: number): void {
    const musicMuted = Sound.isMusicMuted();
    const sfxMuted = Sound.isSfxMuted();
    const musicLabel = (): string => `MUSIC  ${Sound.isMusicMuted() ? 'OFF' : 'ON'}`;
    const sfxLabel = (): string => `SFX  ${Sound.isSfxMuted() ? 'OFF' : 'ON'}`;

    const musicBtn = addTextButton(this, {
      x: leftX + px(60), y: topY + px(24), label: musicLabel(),
      color: musicMuted ? 0x666688 : PALETTE.shieldBlue, size: 15,
      onClick: () => {
        Sound.toggleMusic();
        musicBtn.setText(musicLabel());
        musicBtn.setStyle({ color: cssColor(Sound.isMusicMuted() ? 0x666688 : PALETTE.shieldBlue) });
      },
    });
    musicBtn.setOrigin(0, 0.5);
    this.contentObjects.push(musicBtn);

    const sfxBtn = addTextButton(this, {
      x: leftX + px(60), y: topY + px(72), label: sfxLabel(),
      color: sfxMuted ? 0x666688 : PALETTE.shieldBlue, size: 15,
      onClick: () => {
        Sound.toggleSfx();
        sfxBtn.setText(sfxLabel());
        sfxBtn.setStyle({ color: cssColor(Sound.isSfxMuted() ? 0x666688 : PALETTE.shieldBlue) });
      },
    });
    sfxBtn.setOrigin(0, 0.5);
    this.contentObjects.push(sfxBtn);
  }

  private addStarfield(): void {
    const COUNT = 70;
    const buf = crypto.getRandomValues(new Uint32Array(COUNT * 3));
    for (let i = 0; i < COUNT; i++) {
      const rx = buf[i * 3] ?? 0;
      const ry = buf[i * 3 + 1] ?? 0;
      const rz = buf[i * 3 + 2] ?? 0;
      const x = rx % LOGICAL_WIDTH;
      const y = ry % LOGICAL_HEIGHT;
      const alpha = rx % 3 === 0 ? 0.55 : 0.2;
      const size = rx % 7 === 0 ? 2 : 1;
      const speed = 10 + (rz % 28);
      const rect = this.add.rectangle(px(x), px(y), px(size), px(size), 0xffffff, alpha).setDepth(0);
      this.stars.push({ rect, speed });
    }
  }

  private addMissionRow(save: SaveData, mission: MissionSpec, index: number): void {
    const isTutorial = mission.forcedLoadout !== undefined;
    const unlocked = isMissionUnlocked(save, mission.id);
    const y = px(LIST_TOP_LOGICAL + index * ROW_HEIGHT_LOGICAL);

    let rightText: string;
    let color: number;
    if (isTutorial) {
      rightText = '';
      color = unlocked ? PALETTE.generatorAmber : 0x555544;
    } else {
      const earned = save.missionStars[mission.id]?.length ?? 0;
      const gateText = unlocked ? '' : `  need ${String(mission.starGate)}★`;
      rightText = `★ ${String(earned)}/${String(mission.stars.length)}${gateText}`;
      color = unlocked ? PALETTE.weaponCyan : 0x555566;
    }

    const row = this.add
      .text(px(20), y, `${mission.name.padEnd(14)} ${rightText}`, {
        fontFamily: UI_FONT,
        fontSize: `${String(fontPx(16))}px`,
        color: cssColor(color),
        backgroundColor: isTutorial ? '#0d0d0a' : '#0a0a18',
        padding: { x: px(10), y: px(7) },
      })
      .setOrigin(0, 0.5);

    this.contentObjects.push(row);

    if (unlocked) {
      row.setInteractive({ useHandCursor: true });
      row.on('pointerdown', () => { this.openDetailPanel(save, mission); });
      row.on('pointerover', () => row.setAlpha(0.8));
      row.on('pointerout', () => row.setAlpha(1));
    }
  }

  /** Draws a horizontal rule between the last tutorial mission and the first real mission. */
  private addTutorialDivider(): void {
    const lastTutorialIndex = ALL_MISSIONS.reduce((last, m, i) =>
      m.forcedLoadout !== undefined ? i : last, -1);
    if (lastTutorialIndex < 0) return;
    const dividerY = px(LIST_TOP_LOGICAL + (lastTutorialIndex + 1) * ROW_HEIGHT_LOGICAL - ROW_HEIGHT_LOGICAL / 2);
    this.contentObjects.push(
      this.add.rectangle(px(20), dividerY, px(LOGICAL_WIDTH - 40), px(1), 0x443322).setOrigin(0, 0.5),
    );
    this.contentObjects.push(
      this.add.text(px(22), dividerY - px(6), 'TRAINING', {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(9))}px`, color: cssColor(0x665533),
      }).setOrigin(0, 1),
    );
    this.contentObjects.push(
      this.add.text(px(22), dividerY + px(6), 'COMBAT MISSIONS', {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(9))}px`, color: cssColor(0x334455),
      }).setOrigin(0, 0),
    );
  }

  /** Opens the mission detail panel as a bottom-sheet modal. */
  private openDetailPanel(save: SaveData, mission: MissionSpec): void {
    this.detailObjects.forEach((o) => { o.destroy(); });
    this.detailObjects = [];
    this.hintVisible = false;

    const unlocked = isMissionUnlocked(save, mission.id);
    const earned = save.missionStars[mission.id] ?? [];

    const PANEL_H = 440;
    const panelX = px(0);
    const panelW = px(LOGICAL_WIDTH);
    const panelY = px(LOGICAL_HEIGHT - PANEL_H);
    const innerX = panelX + px(20);
    const startBtnY = panelY + px(PANEL_H - 52);

    const backdrop = this.add
      .rectangle(0, 0, px(LOGICAL_WIDTH), panelY, 0x000000, 0.55)
      .setOrigin(0, 0).setDepth(20).setInteractive();
    this.detailObjects.push(backdrop);

    const bg = this.add
      .rectangle(panelX, panelY, panelW, px(PANEL_H), 0x0d0d22, 0.98)
      .setOrigin(0, 0).setDepth(20);
    this.detailObjects.push(bg);

    this.detailObjects.push(
      this.add.text(innerX, panelY + px(16), mission.name.toUpperCase(), {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(18))}px`, color: cssColor(PALETTE.weaponCyan),
      }).setDepth(21),
    );

    let contentY = panelY + px(42);
    if (mission.forcedLoadout !== undefined) {
      this.detailObjects.push(
        this.add.text(innerX, contentY, 'TRAINING MISSION — loadout is preloaded', {
          fontFamily: UI_FONT, fontSize: `${String(fontPx(11))}px`, color: cssColor(PALETTE.generatorAmber),
        }).setDepth(21),
      );
      contentY += px(22);
    }

    contentY += px(4);
    mission.stars.forEach((star) => {
      const isEarned = earned.includes(star.id);
      this.detailObjects.push(
        this.add.text(innerX, contentY, `${isEarned ? '★' : '☆'}  ${starDescription(star)}`, {
          fontFamily: UI_FONT, fontSize: `${String(fontPx(13))}px`,
          color: cssColor(isEarned ? PALETTE.generatorAmber : 0x666688),
        }).setDepth(21),
      );
      contentY += px(24);
    });

    contentY += px(10);
    const hintBtn = addTextButton(this, {
      x: innerX, y: contentY,
      label: 'ⓘ  SHOW HINT', color: 0x8888aa, size: 12,
      onClick: () => {
        this.hintVisible = !this.hintVisible;
        hintText.setVisible(this.hintVisible);
        hintBtn.setText(this.hintVisible ? 'ⓘ  HIDE HINT' : 'ⓘ  SHOW HINT');
      },
    });
    hintBtn.setOrigin(0, 0).setDepth(21);
    this.detailObjects.push(hintBtn);

    const hintText = this.add.text(innerX, contentY + px(34), mission.blurb, {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(12))}px`,
      color: cssColor(0xaaaacc), wordWrap: { width: panelW - px(40) },
    }).setDepth(21).setVisible(false);
    this.detailObjects.push(hintText);

    if (!unlocked) {
      this.detailObjects.push(
        this.add.text(innerX, startBtnY, `Need ${String(mission.starGate)} ★ to unlock`, {
          fontFamily: UI_FONT, fontSize: `${String(fontPx(13))}px`, color: cssColor(PALETTE.enemyOrange),
        }).setDepth(21),
      );
    } else {
      const startBtn = addTextButton(this, {
        x: px(LOGICAL_WIDTH / 2), y: startBtnY,
        label: '▶  START MISSION', color: PALETTE.weaponCyan, size: 16,
        onClick: () => { this.scene.start('CombatScene', { missionId: mission.id }); },
      });
      startBtn.setOrigin(0.5, 0.5).setDepth(21);
      this.detailObjects.push(startBtn);
    }

    const closeBtn = addTextButton(this, {
      x: panelX + panelW - px(16), y: panelY + px(16),
      label: '✕', color: 0x666688, size: 13,
      onClick: () => {
        this.detailObjects.forEach((o) => { o.destroy(); });
        this.detailObjects = [];
      },
    });
    closeBtn.setOrigin(1, 0).setDepth(21);
    this.detailObjects.push(closeBtn);
  }
}

/** Computes a human-readable description of a star's requirement from its spec. */
function starDescription(star: StarSpec): string {
  const DESCRIPTIONS: Record<StarFamily, (threshold: number) => string> = {
    'hull-above': (t) => `Finish with hull above ${String(Math.round(t * 100))}%`,
    'all-kills': () => 'No enemy reaches your ship',
    'shield-unbroken': () => 'Shield never breaks',
    'boss-time': (t) => `Destroy the boss within ${String(Math.round(t / TICKS_PER_SECOND))}s`,
  };
  return DESCRIPTIONS[star.family](star.threshold);
}
