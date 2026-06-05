import Phaser from 'phaser';

interface StarParticle {
  x: number; y: number; speed: number; size: number; alpha: number;
}

export class Starfield {
  private gfx:   Phaser.GameObjects.Graphics;
  private stars: StarParticle[];
  private W:     number;
  private H:     number;

  constructor(scene: Phaser.Scene, W: number, H: number) {
    this.W    = W;
    this.H    = H;
    this.gfx  = scene.add.graphics().setDepth(-1);
    this.stars = Array.from({ length: 90 }, () => ({
      x:     Phaser.Math.Between(0, W),
      y:     Phaser.Math.Between(0, H),
      speed: Phaser.Math.FloatBetween(0.4, 2.0),
      size:  Math.random() < 0.25 ? 2 : 1,
      alpha: Phaser.Math.FloatBetween(0.3, 1.0),
    }));
  }

  update(): void {
    this.gfx.clear();
    for (const star of this.stars) {
      star.y += star.speed;
      if (star.y > this.H) { star.y = -2; star.x = Phaser.Math.Between(0, this.W); }
      this.gfx.fillStyle(0xffffff, star.alpha);
      this.gfx.fillRect(star.x, star.y, star.size, star.size);
    }
  }
}
