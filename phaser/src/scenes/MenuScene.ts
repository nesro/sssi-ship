// MenuScene.ts
// The main hub. Reached after the welcome screen and from the nav bar.

import Phaser from 'phaser';
import { NavBar } from '../ui/NavBar.js';
import { SaveManager } from '../SaveManager.js';
import type { SaveData } from '../SaveManager.js';

// ─── background objects ───────────────────────────────────────────────────────

interface Star {
  x: number; y: number;
  speed: number; size: number;
  alpha: number; color: number;
}

interface Asteroid {
  sprite: Phaser.GameObjects.Image;
  vx: number; vy: number;
  rotSpeed: number;
}

export class MenuScene extends Phaser.Scene {
  private starGfx!:   Phaser.GameObjects.Graphics;
  private stars:      Star[]     = [];
  private asteroids:  Asteroid[] = [];
  private W = 0;
  private H = 0;

  constructor() { super({ key: 'MenuScene' }); }

  // fallow-ignore-next-line unused-class-member
  create(): void {
    const { width: W, height: H } = this.scale;
    this.W = W;
    this.H = H;
    const save = SaveManager.load();

    this.buildBackground();
    this.buildAsteroids();
    this.buildLogo(W, H);
    this.buildSubtitle(W, H);
    this.buildPlayButton(W, H);
    this.buildStarCount(W, H, save);
    this.buildAboutButton(W, H);

    new NavBar(this);
  }

  // ─── animated background ─────────────────────────────────────────────────────

  private buildBackground(): void {
    this.starGfx = this.add.graphics().setDepth(-1);
    this.stars   = Array.from({ length: 80 }, () => ({
      x:     Phaser.Math.Between(0, this.W),
      y:     Phaser.Math.Between(0, this.H),
      speed: Phaser.Math.FloatBetween(0.15, 0.8),
      size:  Math.random() < 0.15 ? 2 : 1,
      alpha: Phaser.Math.FloatBetween(0.2, 0.8),
      // Mostly white, occasional blue-white or warm-white tint
      color: Phaser.Math.RND.pick([0xffffff, 0xffffff, 0xffffff, 0xcce8ff, 0xfff5cc]),
    }));
  }

  private buildAsteroids(): void {
    const configs = [
      { radius: 28, x: 0.15, y: 0.22, vx: 16, vy:  9, rot: 0.4 },
      { radius: 18, x: 0.80, y: 0.45, vx: -12, vy: 14, rot: -0.6 },
      { radius: 22, x: 0.55, y: 0.70, vx: 10, vy: -8, rot: 0.3 },
      { radius: 14, x: 0.30, y: 0.85, vx: -18, vy: -6, rot: 0.9 },
      { radius: 32, x: 0.90, y: 0.12, vx: -8, vy: 11, rot: -0.25 },
    ];

    configs.forEach((cfg, i) => {
      const key = `asteroidMenuTex${i}`;
      this.makeAsteroidTexture(key, cfg.radius);
      const sprite = this.add.image(this.W * cfg.x, this.H * cfg.y, key)
        .setAlpha(0.12)   // stepped back so they don't fight the text
        .setDepth(-1);
      this.asteroids.push({
        sprite,
        vx: cfg.vx,
        vy: cfg.vy,
        rotSpeed: cfg.rot,
      });
    });
  }

  private makeAsteroidTexture(key: string, radius: number): void {
    const pts  = 9;
    const size = radius * 2 + 4;
    const cx   = size / 2;
    const cy   = size / 2;
    const g    = this.make.graphics(undefined, false);

    g.lineStyle(1.5, 0x888888, 1);
    g.fillStyle(0x1a1a1a, 1);
    g.beginPath();
    for (let i = 0; i < pts; i++) {
      const angle = (i / pts) * Math.PI * 2 - Math.PI / 2;
      const jitter = 0.65 + Math.random() * 0.5;
      const x = cx + Math.cos(angle) * radius * jitter;
      const y = cy + Math.sin(angle) * radius * jitter;
      i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.closePath();
    g.fillPath();
    g.strokePath();
    g.generateTexture(key, size, size);
    g.destroy();
  }

  private updateBackground(delta: number): void {
    const secDelta = delta / 1000;

    // Scrolling stars
    this.starGfx.clear();
    for (const s of this.stars) {
      s.y += s.speed;
      if (s.y > this.H) { s.y = -2; s.x = Phaser.Math.Between(0, this.W); }
      this.starGfx.fillStyle(s.color, s.alpha);
      this.starGfx.fillRect(s.x, s.y, s.size, s.size);
    }

    // Drifting asteroids
    for (const a of this.asteroids) {
      a.sprite.x     += a.vx * secDelta;
      a.sprite.y     += a.vy * secDelta;
      a.sprite.angle += a.rotSpeed;

      // Wrap around screen with a margin so they glide in from the edge
      const margin = 60;
      if (a.sprite.x < -margin)       a.sprite.x = this.W + margin;
      if (a.sprite.x > this.W + margin) a.sprite.x = -margin;
      if (a.sprite.y < -margin)       a.sprite.y = this.H + margin;
      if (a.sprite.y > this.H + margin) a.sprite.y = -margin;
    }
  }

  // ─── UI elements ─────────────────────────────────────────────────────────────

  private buildLogo(W: number, H: number): void {
    // Anchor to 24% so there's breathing room above and below.
    const title = this.add.text(W / 2, H * 0.24, 'NESRO NOVA', {
      fontSize: '46px', color: '#ffffff',
      fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(2);

    // Slow pulse on the title alpha
    this.tweens.add({
      targets: title, alpha: { from: 0.85, to: 1 },
      duration: 2800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }

  private buildSubtitle(W: number, H: number): void {
    this.add.text(W / 2, H * 0.32, 'IDLE SPACE SHOOTER', {
      fontSize: '14px', color: '#666666', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(2);
  }

  private buildPlayButton(W: number, H: number): void {
    const btn = this.add.text(W / 2, H * 0.50, '▶  PLAY', {
      fontSize: '26px', color: '#00ffff',
      fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setDepth(2);

    this.tweens.add({
      targets: btn, scaleX: { from: 1, to: 1.04 }, scaleY: { from: 1, to: 1.04 },
      duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    btn.on('pointerover', () => btn.setColor('#ffffff'));
    btn.on('pointerout',  () => btn.setColor('#00ffff'));
    btn.on('pointerdown', () => this.scene.start('MissionSelectScene'));
    this.input.keyboard?.once('keydown-ENTER', () => this.scene.start('MissionSelectScene'));
  }

  private buildStarCount(W: number, H: number, save: SaveData): void {
    if (save.totalStarsEarned === 0) return;
    const maxStars = 9;
    this.add.text(W / 2, H * 0.61, `★ ${save.totalStarsEarned} / ${maxStars}`, {
      fontSize: '14px', color: '#888888', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(2);
  }

  private buildAboutButton(W: number, H: number): void {
    const btn = this.add.text(W / 2, H * 0.70, 'ABOUT', {
      fontSize: '13px', color: '#444444', fontFamily: 'monospace',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setDepth(2);

    btn.on('pointerover', () => btn.setColor('#888888'));
    btn.on('pointerout',  () => btn.setColor('#444444'));
    btn.on('pointerdown', () => this.scene.start('WelcomeScene', { fromMenu: true }));
  }

  // ─── update loop ─────────────────────────────────────────────────────────────

  // fallow-ignore-next-line unused-class-member
  update(_time: number, delta: number): void {
    this.updateBackground(delta);
  }
}
