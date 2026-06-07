import Phaser from 'phaser';
import { SaveManager } from '../SaveManager.js';
import type { RunRecord } from '../SaveManager.js';

const ROW_H    = 52;
const ROW_GAP  = 6;
const MISSION_LABELS: Record<string, string> = {
  tutorial:  'Tutorial',
  mission_1: 'Mission 1',
  mission_2: 'Mission 2',
  mission_3: 'Mission 3',
  daily:     'Daily',
};

export class RunHistoryScene extends Phaser.Scene {
  private scrollY   = 0;
  private rowsContainer!: Phaser.GameObjects.Container;

  constructor() { super({ key: 'RunHistoryScene' }); }

  // fallow-ignore-next-line unused-class-member
  create(): void {
    const { width: W, height: H } = this.scale;
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000);

    this.add.text(W / 2, 20, 'RUN HISTORY', {
      fontSize: '18px', color: '#aaaaaa', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5, 0);

    const save    = SaveManager.load();
    const history = [...save.runHistory].reverse(); // newest first

    if (history.length === 0) {
      this.add.text(W / 2, H / 2, 'No runs recorded yet.', {
        fontSize: '13px', color: '#444444', fontFamily: 'monospace',
      }).setOrigin(0.5);
    } else {
      this.buildRows(W, H, history);
    }

    this.addBackButton(W, H);
  }

  private buildRows(W: number, H: number, history: RunRecord[]): void {
    const listTop = 52;
    const listH   = H - listTop - 44;
    const items: Phaser.GameObjects.GameObject[] = [];

    history.forEach((record, i) => {
      const rowY = i * (ROW_H + ROW_GAP);
      items.push(...this.buildRow(W, rowY, record));
    });

    this.rowsContainer = this.add.container(0, listTop, items);

    // Clamp scroll to keep rows inside view.
    const totalH = history.length * (ROW_H + ROW_GAP);
    const maxScroll = Math.max(0, totalH - listH);

    this.input.on('wheel', (_ptr: unknown, _gameObjects: unknown, _dx: unknown, dy: number) => {
      this.scrollY = Phaser.Math.Clamp(this.scrollY + dy, 0, maxScroll);
      this.rowsContainer.y = listTop - this.scrollY;
    });

    // Mask so rows clip at top and bottom of the list area.
    const mask = this.make.graphics({ x: 0, y: 0 });
    mask.fillRect(0, listTop, W, listH);
    this.rowsContainer.setMask(mask.createGeometryMask());
  }

  private buildRow(W: number, rowY: number, record: RunRecord): Phaser.GameObjects.GameObject[] {
    const items: Phaser.GameObjects.GameObject[] = [];
    const rowBg = this.add.rectangle(W / 2, rowY + ROW_H / 2, W - 20, ROW_H, 0x111111)
      .setStrokeStyle(1, record.bossBeaten ? 0x224422 : 0x221111)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => rowBg.setFillStyle(0x1a1a1a))
      .on('pointerout',  () => rowBg.setFillStyle(0x111111))
      .on('pointerdown', () => this.watchReplay(record));
    items.push(rowBg);

    // Mission label + result badge
    const missionLabel = MISSION_LABELS[record.missionId] ?? record.missionId;
    const resultLabel  = record.bossBeaten ? '✓ WIN' : '✗ LOSS';
    const resultColor  = record.bossBeaten ? '#22aa44' : '#aa2222';

    items.push(this.add.text(20, rowY + 8, missionLabel, {
      fontSize: '13px', color: '#888888', fontFamily: 'monospace', fontStyle: 'bold',
    }));
    items.push(this.add.text(20, rowY + 28, resultLabel, {
      fontSize: '11px', color: resultColor, fontFamily: 'monospace',
    }));

    // Stats: time, kills, hull
    const timeStr = this.formatTime(record.secondsTaken);
    items.push(this.add.text(W / 2 - 40, rowY + 8, `${timeStr}`, {
      fontSize: '12px', color: '#666666', fontFamily: 'monospace',
    }).setOrigin(0.5, 0));
    items.push(this.add.text(W / 2 - 40, rowY + 28, 'time', {
      fontSize: '9px', color: '#333333', fontFamily: 'monospace',
    }).setOrigin(0.5, 0));

    items.push(this.add.text(W / 2 + 40, rowY + 8, `${record.enemiesKilled}`, {
      fontSize: '12px', color: '#666666', fontFamily: 'monospace',
    }).setOrigin(0.5, 0));
    items.push(this.add.text(W / 2 + 40, rowY + 28, 'kills', {
      fontSize: '9px', color: '#333333', fontFamily: 'monospace',
    }).setOrigin(0.5, 0));

    const hullStr = `${Math.round(record.hullPercent)}%`;
    items.push(this.add.text(W - 70, rowY + 8, hullStr, {
      fontSize: '12px', color: '#666666', fontFamily: 'monospace',
    }).setOrigin(0.5, 0));
    items.push(this.add.text(W - 70, rowY + 28, 'hull', {
      fontSize: '9px', color: '#333333', fontFamily: 'monospace',
    }).setOrigin(0.5, 0));

    // Watch replay chevron
    const hasCards = (record.cardOffers?.length ?? 0) > 0 || record.cardPicks.length > 0;
    if (hasCards) {
      items.push(this.add.text(W - 22, rowY + ROW_H / 2, '▶', {
        fontSize: '14px', color: '#335533', fontFamily: 'monospace',
      }).setOrigin(0.5));
    }

    return items;
  }

  private watchReplay(record: RunRecord): void {
    this.scene.start('GameScene', { missionId: record.missionId, replay: record });
  }

  private addBackButton(W: number, H: number): void {
    const btn = this.add.text(W / 2, H - 22, 'BACK', {
      fontSize: '15px', color: '#445544', fontFamily: 'monospace',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    btn.on('pointerover', () => btn.setColor('#88aa88'));
    btn.on('pointerout',  () => btn.setColor('#445544'));
    btn.on('pointerdown', () => this.scene.start('MissionSelectScene'));
    this.input.keyboard?.once('keydown-ESC', () => this.scene.start('MissionSelectScene'));
  }

  private formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return m > 0 ? `${m}m${s}s` : `${s}s`;
  }
}
