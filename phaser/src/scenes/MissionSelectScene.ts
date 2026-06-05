// MissionSelectScene.ts
// Lists all missions with their unlock status and best star count.
// Tapping an unlocked mission starts it.

import Phaser from 'phaser';
import { NavBar } from '../ui/NavBar.js';
import { SaveManager } from '../SaveManager.js';
import { MISSIONS, isMissionUnlocked } from '../data/missions.js';
import { DAILY_MISSION_ID, utcDateString } from '../data/daily.js';
import type { SaveData, MissionRecord } from '../SaveManager.js';
import type { MissionDefinition } from '../data/missions.js';

// Visual config
const CARD_WIDTH   = 560;
const CARD_HEIGHT  = 100;
const CARD_GAP     = 18;
const CARD_COLOR   = 0x111111;
const CARD_LOCKED  = 0x0a0a0a;
const STAR_FILLED  = '#ffcc00';
const STAR_EMPTY   = '#333333';

export class MissionSelectScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MissionSelectScene' });
  }

  // fallow-ignore-next-line unused-class-member
  create(): void {
    const { width: W, height: H } = this.scale;
    const save = SaveManager.load();

    this.addTitle(W);
    this.addCoinCounter(W, save.coins);
    this.buildDailyCard(W, save);
    this.addMissionCards(W, H, save);

    new NavBar(this);
  }

  private addTitle(W: number): void {
    this.add.text(W / 2, 40, 'MISSIONS', {
      fontSize:   '20px',
      color:       '#ffffff',
      fontFamily: 'monospace',
      fontStyle:  'bold',
    }).setOrigin(0.5);
  }

  private addCoinCounter(W: number, coins: number): void {
    this.add.text(W - 16, 20, `◈ ${coins}`, {
      fontSize:   '14px',
      color:       '#ffcc00',
      fontFamily: 'monospace',
    }).setOrigin(1, 0.5);
  }

  // ─── daily card ──────────────────────────────────────────────────────────────

  private isDailyAvailable(save: SaveData): boolean {
    if (!save.daily) return true;
    return save.daily.date !== utcDateString() || !save.daily.attempted;
  }

  private buildDailyCard(W: number, save: SaveData): void {
    const available = this.isDailyAvailable(save);
    const cardX     = W / 2;
    const cardY     = 72;
    const cardW     = CARD_WIDTH;
    const cardH     = 72;

    // Card background — gold border when available, muted when locked.
    const borderColor = available ? 0xffaa00 : 0x332200;
    const bgColor     = available ? 0x1a1000 : 0x0d0a00;
    this.add.rectangle(cardX, cardY, cardW, cardH, bgColor)
      .setStrokeStyle(1, borderColor);

    // Label row
    this.add.text(cardX - cardW / 2 + 14, cardY - 24, '⚡ DAILY CHALLENGE', {
      fontSize: '11px', color: available ? '#ffaa00' : '#554400', fontFamily: 'monospace',
    });

    if (available) {
      this.add.text(cardX - cardW / 2 + 14, cardY - 6, 'Endless survival — how far can you go?', {
        fontSize: '10px', color: '#886622', fontFamily: 'monospace',
      });
      this.add.text(cardX - cardW / 2 + 14, cardY + 14, 'One attempt today. Big coin reward.', {
        fontSize: '10px', color: '#554400', fontFamily: 'monospace',
      });

      // Play button
      const hitArea = this.add.rectangle(cardX, cardY, cardW, cardH, 0x000000, 0)
        .setInteractive({ useHandCursor: true });
      hitArea.on('pointerover', () => hitArea.setFillStyle(0xffaa00, 0.06));
      hitArea.on('pointerout',  () => hitArea.setFillStyle(0x000000, 0));
      hitArea.on('pointerdown', () => this.scene.start('GameScene', { missionId: DAILY_MISSION_ID }));

      this.add.text(cardX + cardW / 2 - 16, cardY + 22, 'PLAY ▶', {
        fontSize: '11px', color: '#ffaa00', fontFamily: 'monospace',
      }).setOrigin(1, 0.5);
    } else {
      // Already attempted — show today's result.
      const rec = save.daily!;
      this.add.text(cardX - cardW / 2 + 14, cardY - 6, `Waves cleared: ${rec.wavesCleared}`, {
        fontSize: '11px', color: '#664400', fontFamily: 'monospace',
      });
      this.add.text(cardX - cardW / 2 + 14, cardY + 12, `Earned: ${rec.coinsEarned} ◈  · Come back tomorrow`, {
        fontSize: '10px', color: '#443300', fontFamily: 'monospace',
      });
      this.add.text(cardX + cardW / 2 - 16, cardY, '🔒', {
        fontSize: '16px',
      }).setOrigin(1, 0.5);
    }
  }

  private addMissionCards(W: number, H: number, save: ReturnType<typeof SaveManager.load>): void {
    const missionList = Object.values(MISSIONS);
    const totalHeight = missionList.length * (CARD_HEIGHT + CARD_GAP) - CARD_GAP;
    // Push mission list below the daily card (daily card bottom ≈ 108 px).
    const startY      = Math.max(120, (H - NavBar.HEIGHT) / 2 - totalHeight / 2 + 30);

    missionList.forEach((mission, index) => {
      const cardY    = startY + index * (CARD_HEIGHT + CARD_GAP);
      const record   = save.missions[mission.id];
      const unlocked = isMissionUnlocked(mission.id, save.missions);

      this.addMissionCard(W / 2, cardY, mission, record, unlocked);
    });
  }

  private addMissionCard(
    x: number,
    y: number,
    mission: MissionDefinition,
    record: MissionRecord | undefined,
    unlocked: boolean,
  ): void {
    // A completed mission is always replayable, even if it was reached via a path
    // the player no longer meets the gate for (shouldn't happen in practice, but
    // this upholds the "player must never feel stuck" philosophy unconditionally).
    const bestStars = record?.bestStars ?? 0;
    const completed = bestStars > 0;
    const playable  = unlocked || completed;

    const bgColor = playable ? CARD_COLOR : CARD_LOCKED;
    const alpha   = playable ? 1.0 : 0.5;

    // Card background
    this.add.rectangle(x, y, CARD_WIDTH, CARD_HEIGHT, bgColor)
      .setStrokeStyle(1, playable ? 0x222222 : 0x111111);

    // Mission name
    this.add.text(x - CARD_WIDTH / 2 + 16, y - 28, mission.name.toUpperCase(), {
      fontSize:   '14px',
      color:       playable ? '#ffffff' : '#444444',
      fontFamily: 'monospace',
      fontStyle:  'bold',
    }).setAlpha(alpha);

    // Description
    this.add.text(x - CARD_WIDTH / 2 + 16, y - 6, mission.description, {
      fontSize:   '11px',
      color:       playable ? '#888888' : '#333333',
      fontFamily: 'monospace',
    }).setAlpha(alpha);

    // Stars
    this.addStarRow(x + CARD_WIDTH / 2 - 90, y - 20, bestStars, playable);

    if (playable) {
      this.addPlayTapTarget(x, y, mission.id, completed);
    } else {
      this.addLockIndicator(x, y, mission);
    }
  }

  private addStarRow(x: number, y: number, filledCount: number, _unlocked: boolean): void {
    for (let i = 0; i < 3; i++) {
      const isFilled = i < filledCount;
      this.add.text(x + i * 22, y, '★', {
        fontSize:   '18px',
        color:       isFilled ? STAR_FILLED : STAR_EMPTY,
        fontFamily: 'monospace',
      });
    }
  }

  private addPlayTapTarget(x: number, y: number, missionId: string, isReplay: boolean): void {
    // The whole card is tappable.
    const hitArea = this.add.rectangle(x, y, CARD_WIDTH, CARD_HEIGHT, 0x000000, 0)
      .setInteractive({ useHandCursor: true });

    hitArea.on('pointerover', () => hitArea.setFillStyle(0x00ffff, 0.05));
    hitArea.on('pointerout',  () => hitArea.setFillStyle(0x000000, 0));
    hitArea.on('pointerdown', () => {
      this.scene.start('GameScene', { missionId });
    });

    // Label: REPLAY for already-cleared missions, PLAY for first attempt.
    const label = isReplay ? 'REPLAY ▶' : 'PLAY ▶';
    this.add.text(x + CARD_WIDTH / 2 - 16, y + 32, label, {
      fontSize:   '11px',
      color:       isReplay ? '#aaaaff' : '#00ffff',
      fontFamily: 'monospace',
    }).setOrigin(1, 0.5);
  }

  private addLockIndicator(x: number, y: number, mission: MissionDefinition): void {
    const requirements = mission.unlockRequires!;
    const lines = Object.entries(requirements).map(([mId, stars]) => {
      const name = MISSIONS[mId].name;
      return `Need ${stars}★ on ${name}`;
    });

    this.add.text(x, y + 24, lines.join('  ·  '), {
      fontSize:   '10px',
      color:       '#333333',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.add.text(x + CARD_WIDTH / 2 - 16, y, '🔒', {
      fontSize: '18px',
    }).setOrigin(1, 0.5);
  }
}
