import Phaser from 'phaser';
import { preloadAudio, Sound } from '../audio/SoundManager';
import { cssColor, PALETTE } from './palette';
import { fontPx, px, SCREEN_HEIGHT, SCREEN_WIDTH } from './layout';
import { UI_FONT } from './widgets';

/**
 * First scene: loads all audio assets (the only files Phaser must fetch — textures are
 * generated at runtime), then hands off to MenuScene. A tiny loading label covers the
 * brief fetch of the ~9 MB music track on first launch.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  // fallow-ignore-next-line unused-class-member
  preload(): void {
    this.add
      .text(SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2, 'NESRO NOVA', {
        fontFamily: UI_FONT,
        fontSize: `${String(fontPx(28))}px`,
        color: cssColor(PALETTE.weaponCyan),
      })
      .setOrigin(0.5);
    this.add
      .text(SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + px(40), 'loading…', {
        fontFamily: UI_FONT,
        fontSize: `${String(fontPx(13))}px`,
        color: cssColor(0x6666aa),
      })
      .setOrigin(0.5);
    preloadAudio(this);
  }

  // fallow-ignore-next-line unused-class-member
  create(): void {
    Sound.attach(this.sound);
    this.scene.start('HubScene');
  }
}
