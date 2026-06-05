import Phaser from 'phaser';
import type { SideWeaponType } from '../data/items.js';

const BTN_W    = 80;
const BTN_H    = 80;
const DEPTH    = 20;

const WEAPON_LABELS: Record<SideWeaponType, string> = {
  spread: 'SPREAD',
  beam:   'BEAM',
};

export class SideWeaponButton {
  private readonly scene: Phaser.Scene;
  private readonly weapon: SideWeaponType | null;
  private readonly x: number;
  private readonly y: number;
  private readonly cooldownMs: number;
  private readonly onActivate: () => void;

  private gfx!: Phaser.GameObjects.Graphics;
  private label!: Phaser.GameObjects.Text;
  private cooldownLabel!: Phaser.GameObjects.Text;

  private lastUsedAt: number = -Infinity;
  private cooldownRatio: number = 0;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    weapon: SideWeaponType | null,
    cooldownMs: number,
    onActivate: () => void,
  ) {
    this.scene      = scene;
    this.x          = x;
    this.y          = y;
    this.weapon     = weapon;
    this.cooldownMs = cooldownMs;
    this.onActivate = onActivate;

    this.buildGraphics();

    if (weapon) {
      scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
        this.handleTap(p, scene.time.now);
      });
    }
  }

  private buildGraphics(): void {
    this.gfx = this.scene.add.graphics().setDepth(DEPTH);

    const labelText = this.weapon ? WEAPON_LABELS[this.weapon] : 'EMPTY';
    this.label = this.scene.add.text(this.x, this.y - 10, labelText, {
      fontSize: '11px', color: '#888888', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(DEPTH + 1);

    this.cooldownLabel = this.scene.add.text(this.x, this.y + 16, '', {
      fontSize: '9px', color: '#555555', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(DEPTH + 1);

    this.redraw(1);
  }

  update(now: number, energyRatio: number): void {
    const elapsed = now - this.lastUsedAt;
    this.cooldownRatio = Math.max(0, 1 - elapsed / this.cooldownMs);
    const ready     = this.cooldownRatio === 0;
    const hasEnergy = energyRatio > 0.1;

    const brightness = (ready && hasEnergy) ? 1 : 0.35;
    this.redraw(brightness);

    if (ready) {
      this.cooldownLabel.setText('');
    } else {
      const secsLeft = ((this.cooldownMs - elapsed) / 1000).toFixed(1);
      this.cooldownLabel.setText(`${secsLeft}s`);
    }
  }

  private handleTap(pointer: Phaser.Input.Pointer, now: number): void {
    const half = BTN_W / 2;
    const inBounds =
      pointer.x >= this.x - half && pointer.x <= this.x + half &&
      pointer.y >= this.y - half && pointer.y <= this.y + half;

    if (!inBounds) return;
    if (this.cooldownRatio > 0) return;

    this.lastUsedAt = now;
    this.onActivate();
  }

  private redraw(brightness: number): void {
    this.gfx.clear();

    const alpha     = brightness;
    const fillColor = this.weapon ? 0x1a1a2e : 0x111111;
    const lineColor = this.weapon ? 0x336699 : 0x333333;

    this.gfx.fillStyle(fillColor, alpha);
    this.gfx.fillRect(this.x - BTN_W / 2, this.y - BTN_H / 2, BTN_W, BTN_H);
    this.gfx.lineStyle(1, lineColor, alpha);
    this.gfx.strokeRect(this.x - BTN_W / 2, this.y - BTN_H / 2, BTN_W, BTN_H);

    if (this.weapon && this.cooldownRatio > 0) {
      const barH = BTN_H * (1 - this.cooldownRatio);
      this.gfx.fillStyle(0x0055aa, 0.5);
      this.gfx.fillRect(
        this.x - BTN_W / 2,
        this.y + BTN_H / 2 - barH,
        BTN_W,
        barH,
      );
    }
  }

  // fallow-ignore-next-line unused-class-member
  destroy(): void {
    this.gfx.destroy();
    this.label.destroy();
    this.cooldownLabel.destroy();
  }
}
