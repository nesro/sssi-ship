// ResultScene.ts
// Shown after a mission ends (win or loss).
// Calculates stars and coins, updates the save, then presents the summary.

import Phaser from 'phaser';
import { SaveManager } from '../SaveManager.js';
import { calculateStars, calculateCoins, MISSIONS } from '../data/missions.js';
import { DAILY_MISSION_ID, dailyCoins } from '../data/daily.js';
import type { MissionResult } from '../data/missions.js';

const STAR_FILLED = '#ffcc00';
const STAR_EMPTY  = '#333333';

export class ResultScene extends Phaser.Scene {
  private result!: MissionResult;

  constructor() {
    super({ key: 'ResultScene' });
  }

  // GameScene passes its result here via scene.start('ResultScene', result).
  // fallow-ignore-next-line unused-class-member
  init(result: MissionResult): void {
    this.result = result;
  }

  // fallow-ignore-next-line unused-class-member
  create(): void {
    const { width: W, height: H } = this.scale;
    const { missionId, bossBeaten } = this.result;

    // Solid background so this scene fully covers whatever was beneath it.
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000);

    if (missionId === DAILY_MISSION_ID) {
      this.handleDailyResult(W, H);
    } else if (bossBeaten) {
      this.handleVictory(W, H, missionId);
    } else {
      this.handleDefeat(W, H);
    }
  }

  private handleDailyResult(W: number, H: number): void {
    const waves   = this.result.wavesCleared ?? 0;
    const coins   = dailyCoins(waves);
    const beaten  = this.result.bossBeaten;  // true = survived all 50 waves

    const save = SaveManager.load();
    SaveManager.awardDailyResult(save, waves, coins);
    SaveManager.save(save);

    // Header
    const headerColor = beaten ? '#ffaa00' : '#ff6600';
    const headerText  = beaten ? 'DAILY COMPLETE' : 'DAILY — SHIP DESTROYED';
    this.add.text(W / 2, H * 0.12, headerText, {
      fontSize: '20px', color: headerColor, fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(W / 2, H * 0.20, '⚡ DAILY CHALLENGE', {
      fontSize: '12px', color: '#888888', fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Score
    this.add.text(W / 2, H * 0.35, `${waves}`, {
      fontSize: '56px', color: '#ffaa00', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add.text(W / 2, H * 0.48, 'WAVES CLEARED', {
      fontSize: '13px', color: '#666666', fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Stats
    this.addStatRow(W, H * 0.58, 'Enemies killed', this.result.enemiesKilled);
    this.addStatRow(W, H * 0.64, 'Time survived', this.formatTime(this.result.secondsTaken));

    // Coins
    this.addCoinReward(W, H * 0.75, coins);
    this.add.text(W / 2, H * 0.82, 'Come back tomorrow for a new challenge!', {
      fontSize: '10px', color: '#444444', fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.addContinueButton(W, H * 0.91, 'CONTINUE');
  }

  private handleVictory(W: number, H: number, missionId: string): void {
    const stars      = calculateStars(missionId, this.result);
    const coinsBase  = calculateCoins(missionId, stars);

    const save       = SaveManager.load();
    const { starDelta, newBest } = SaveManager.awardMissionResult(save, missionId, stars, coinsBase);
    SaveManager.save(save);

    this.buildVictoryScreen(W, H, missionId, stars, newBest, coinsBase, starDelta);
  }

  private handleDefeat(W: number, H: number): void {
    this.buildDefeatScreen(W, H);
  }

  private buildVictoryScreen(
    W: number,
    H: number,
    missionId: string,
    stars: number,
    previousBest: number,
    coinsEarned: number,
    newStarCount: number,
  ): void {
    const mission = MISSIONS[missionId];

    // Header
    this.add.text(W / 2, H * 0.10, 'MISSION COMPLETE', {
      fontSize: '22px', color: '#00ff88', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(W / 2, H * 0.17, mission.name.toUpperCase(), {
      fontSize: '14px', color: '#888888', fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Stars
    this.addStarRow(W, H * 0.30, stars);
    this.addStarLabel(W, H * 0.44, stars, previousBest);

    // Stats
    this.addStatRow(W, H * 0.54, 'Enemies killed', this.result.enemiesKilled);
    this.addStatRow(W, H * 0.60, 'Time', this.formatTime(this.result.secondsTaken));
    this.addStatRow(W, H * 0.66, 'Hull on finish', `${Math.round(this.result.hullPercent)}%`);

    // Coins
    this.addCoinReward(W, H * 0.76, coinsEarned);

    // New stars awarded
    if (newStarCount > 0) {
      this.add.text(W / 2, H * 0.83, `+${newStarCount} new star${newStarCount > 1 ? 's' : ''} earned!`, {
        fontSize: '13px', color: '#ffcc00', fontFamily: 'monospace',
      }).setOrigin(0.5);
    }

    this.addContinueButton(W, H * 0.93, 'CONTINUE');
  }

  private buildDefeatScreen(W: number, H: number): void {
    this.add.text(W / 2, H * 0.25, 'SHIP DESTROYED', {
      fontSize: '28px', color: '#ff2200', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(W / 2, H * 0.40, 'Upgrade your ship in the shop\nand try again.', {
      fontSize: '13px', color: '#888888', fontFamily: 'monospace', align: 'center',
    }).setOrigin(0.5);

    this.addStatRow(W, H * 0.55, 'Enemies killed', this.result.enemiesKilled);

    this.addContinueButton(W, H * 0.70, 'TRY AGAIN');
  }

  private addStarRow(W: number, y: number, filledCount: number): void {
    const starSize   = 42;
    const totalWidth = 3 * starSize + 2 * 10;
    const startX     = W / 2 - totalWidth / 2 + starSize / 2;

    for (let i = 0; i < 3; i++) {
      const isFilled = i < filledCount;
      this.add.text(startX + i * (starSize + 10), y, '★', {
        fontSize:   `${starSize}px`,
        color:       isFilled ? STAR_FILLED : STAR_EMPTY,
        fontFamily: 'monospace',
      }).setOrigin(0.5);
    }
  }

  private addStarLabel(W: number, y: number, stars: number, previousBest: number): void {
    const labels = ['', '1 Star', '2 Stars', '3 Stars'];
    const isNewRecord = stars > previousBest;
    const suffix = isNewRecord && previousBest > 0 ? '  ↑ new best!' : '';
    const color  = isNewRecord ? '#ffcc00' : '#888888';

    this.add.text(W / 2, y, labels[stars] + suffix, {
      fontSize: '15px', color: color, fontFamily: 'monospace',
    }).setOrigin(0.5);
  }

  private addStatRow(W: number, y: number, label: string, value: string | number): void {
    this.add.text(W / 2 - 20, y, label, {
      fontSize: '12px', color: '#555555', fontFamily: 'monospace',
    }).setOrigin(1, 0.5);

    this.add.text(W / 2 + 20, y, String(value), {
      fontSize: '12px', color: '#aaaaaa', fontFamily: 'monospace',
    }).setOrigin(0, 0.5);
  }

  private addCoinReward(W: number, y: number, coins: number): void {
    this.add.text(W / 2, y, `+ ${coins} ◈`, {
      fontSize: '20px', color: '#ffcc00', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);
  }

  private addContinueButton(W: number, y: number, label: string): void {
    const btn = this.add.text(W / 2, y, label, {
      fontSize: '18px', color: '#00ffff', fontFamily: 'monospace',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    this.tweens.add({ targets: btn, alpha: 0.3, duration: 700, yoyo: true, repeat: -1 });

    const goBack = () => this.scene.start('MissionSelectScene');
    btn.on('pointerdown', goBack);
    this.input.keyboard?.once('keydown-ENTER', goBack);
    this.input.keyboard?.once('keydown-SPACE', goBack);
  }

  private formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }
}
