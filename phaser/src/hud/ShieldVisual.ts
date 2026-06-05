import Phaser from 'phaser';

export class ShieldVisual {
  private gfx:   Phaser.GameObjects.Graphics;
  private flash: number = 0;

  constructor(scene: Phaser.Scene) {
    // Shield glow sits behind the player (depth 4); follows player position every frame.
    this.gfx = scene.add.graphics().setDepth(4);
  }

  // Call this when a shield absorbs a hit so the ring flashes white.
  onHit(): void {
    this.flash = 1.0;
  }

  update(delta: number, playerX: number, playerY: number, shieldRatio: number): void {
    this.gfx.clear();
    if (shieldRatio <= 0) return;

    this.flash = Math.max(0, this.flash - 1.8 * (delta / 1000));

    const baseColor  = 0x00ccff;
    const flashColor = 0xffffff;
    const color      = lerpColor(baseColor, flashColor, this.flash);
    const radius     = 44;  // matches half-diagonal of 64×88 ship

    this.gfx.fillStyle(color, shieldRatio * 0.22);
    this.gfx.fillCircle(playerX, playerY, radius);

    this.gfx.lineStyle(2, color, shieldRatio * 0.75);
    this.gfx.strokeCircle(playerX, playerY, radius);
  }
}

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  return (
    (Math.round(ar + (br - ar) * t) << 16) |
    (Math.round(ag + (bg - ag) * t) << 8)  |
     Math.round(ab + (bb - ab) * t)
  );
}
