import Phaser from 'phaser';
import type { EnemySprite } from '../game/enemy.js';

// One persistent Graphics object cleared and redrawn each frame — O(E) cost.
export class EnemyHpBars {
  private gfx: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    // Depth 6: above enemies but below HUD.
    this.gfx = scene.add.graphics().setDepth(6);
  }

  update(enemies: Phaser.Physics.Arcade.Group): void {
    this.gfx.clear();
    for (const obj of enemies.getChildren()) {
      const e = obj as unknown as EnemySprite;
      if (!e.active || e.enemyType === 'boss') continue;  // boss has its own bar
      const ratio = Math.max(0, e.hp / (e.maxHp ?? e.hp));
      const barW  = e.displayWidth;
      const x     = e.x - barW / 2;
      const y     = e.y - e.displayHeight / 2 - 8;
      const color = ratio > 0.5 ? 0x00ee00 : ratio > 0.25 ? 0xeeee00 : 0xee2200;
      this.gfx.fillStyle(0x1a1a1a, 1); this.gfx.fillRect(x, y, barW, 4);
      this.gfx.fillStyle(color, 1);    this.gfx.fillRect(x, y, barW * ratio, 4);
    }
  }
}
