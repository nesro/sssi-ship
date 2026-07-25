// Dev-only visuals gallery — bakes every procedural texture (via the real
// buildGameTextures) and lays them out in a labelled, scrollable, zoomable grid over the
// game's own near-black + ADD-blend look, so the whole sprite set can be eyeballed at once
// while iterating. Not part of the shipped game (served by Vite at /gallery.html).
// Controls: mouse wheel scrolls, +/- zoom, R toggles rotation.

import Phaser from 'phaser';
import { buildGameTextures } from '../src/view/textures';
import { PALETTE } from '../src/view/palette';

const CELL = 132;
const LABEL_H = 22;

class GalleryScene extends Phaser.Scene {
  private images: Phaser.GameObjects.Image[] = [];
  private zoom = 1;
  private spin = false;

  constructor() { super('GalleryScene'); }

  create(): void {
    buildGameTextures(this);
    const keys = this.textures.getTextureKeys().sort((a, b) => a.localeCompare(b));
    const cols = Math.max(1, Math.floor(this.scale.width / CELL));

    keys.forEach((key, i) => {
      const col = i % cols;
      const rowN = Math.floor(i / cols);
      const cx = col * CELL + CELL / 2;
      const cy = rowN * CELL + CELL / 2;
      const img = this.add.image(cx, cy, key).setBlendMode(Phaser.BlendModes.ADD);
      this.fitImage(img);
      this.images.push(img);
      this.add.text(cx, cy + CELL / 2 - LABEL_H / 2, key, {
        fontFamily: 'ui-monospace, monospace', fontSize: '11px', color: '#8899cc', align: 'center',
        wordWrap: { width: CELL - 8 },
      }).setOrigin(0.5);
    });

    const rows = Math.ceil(keys.length / cols);
    this.cameras.main.setBounds(0, 0, this.scale.width, rows * CELL + 40);
    this.add.text(8, 8, `${String(keys.length)} textures · wheel: scroll · +/−: zoom · R: spin`, {
      fontFamily: 'ui-monospace, monospace', fontSize: '12px', color: '#00ffee',
    }).setScrollFactor(0).setDepth(100);

    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      this.cameras.main.scrollY = Phaser.Math.Clamp(this.cameras.main.scrollY + dy, 0, rows * CELL);
    });
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => { this.onKey(e.key); });
  }

  private fitImage(img: Phaser.GameObjects.Image): void {
    const target = 78 * this.zoom;
    const scale = target / Math.max(img.width, img.height);
    img.setScale(scale);
  }

  private onKey(key: string): void {
    if (key === '+' || key === '=') this.zoom = Math.min(4, this.zoom * 1.25);
    else if (key === '-' || key === '_') this.zoom = Math.max(0.4, this.zoom / 1.25);
    else if (key === 'r' || key === 'R') { this.spin = !this.spin; return; }
    else return;
    for (const img of this.images) this.fitImage(img);
  }

  override update(_t: number, dt: number): void {
    if (!this.spin) return;
    for (const img of this.images) img.angle += dt * 0.05;
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'gallery',
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: PALETTE.backgroundNearBlack,
  render: { roundPixels: true },
  scene: [GalleryScene],
});
