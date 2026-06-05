// WelcomeScene.ts
// Shown automatically on the very first launch.
// After dismissal it is never shown again automatically,
// but remains reachable from the main menu as "About".

import Phaser from 'phaser';
import { SaveManager } from '../SaveManager.js';
import type { SaveData } from '../SaveManager.js';

const NESRO_MESSAGE = [
  'Hi, I am Nesro.',
  '',
  'I created a simple game back in 2010',
  'for my maturita (final school exam).',
  '',
  'I always wanted to finish it as a proper',
  'mobile game — and now, 16 years later,',
  'I am finally on that mission.',
  '',
  'This game is in early stages.',
  '',
  'If you are interested in game design,',
  'level design, balancing, visuals or music',
  '— please reach out.',
  'I would love to hear from you.',
].join('\n');

export class WelcomeScene extends Phaser.Scene {
  private fromMenu: boolean = false;

  constructor() {
    super({ key: 'WelcomeScene' });
  }

  // fromMenu = true when the player opens this voluntarily from the main menu.
  // fallow-ignore-next-line unused-class-member
  init(data?: { fromMenu?: boolean }): void {
    this.fromMenu = data?.fromMenu ?? false;
  }

  // fallow-ignore-next-line unused-class-member
  create(): void {
    const save = SaveManager.load();

    // Skip straight to the menu if already seen (and not opened from menu).
    if (save.welcomeSeen && !this.fromMenu) {
      this.scene.start('MenuScene');
      return;
    }

    this.buildScreen(save);
  }

  private buildScreen(save: SaveData): void {
    const { width: W, height: H } = this.scale;

    this.addTitle(W, H);
    this.addMessage(W, H);

    if (this.fromMenu) {
      this.addCredits(W, H);
      this.addContinueButton(W, H * 0.94, save);
    } else {
      this.addOriginNote(W, H);
      this.addContinueButton(W, H * 0.89, save);
    }
  }

  private addTitle(W: number, H: number): void {
    this.add.text(W / 2, H * 0.10, 'NESRO NOVA', {
      fontSize: '34px', color: '#ffffff',
      fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);
  }

  private addMessage(W: number, H: number): void {
    this.add.text(W / 2, H * 0.22, NESRO_MESSAGE, {
      fontSize: '13px', color: '#cccccc',
      fontFamily: 'monospace', align: 'center', lineSpacing: 5,
    }).setOrigin(0.5, 0);
  }

  private addOriginNote(W: number, H: number): void {
    this.add.text(W / 2, H * 0.80, '— Originally "SSSI Ship", 2010 —', {
      fontSize: '11px', color: '#3a3a3a', fontFamily: 'monospace',
    }).setOrigin(0.5);
  }

  private addCredits(W: number, H: number): void {
    const y = H * 0.64;

    // Divider
    this.add.rectangle(W / 2, y, W * 0.6, 1, 0x222222);

    // Credits header
    this.add.text(W / 2, y + 14, 'CREDITS', {
      fontSize: '10px', color: '#444444',
      fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5, 0);

    // Creator
    this.add.text(W / 2, y + 38, 'Game by', {
      fontSize: '10px', color: '#444444', fontFamily: 'monospace',
    }).setOrigin(0.5, 0);
    this.add.text(W / 2, y + 52, 'TOMAS NESROVNAL', {
      fontSize: '13px', color: '#aaaaaa',
      fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5, 0);

    // Music credit
    this.add.text(W / 2, y + 84, 'Music', {
      fontSize: '10px', color: '#444444', fontFamily: 'monospace',
    }).setOrigin(0.5, 0);
    this.add.text(W / 2, y + 98, '"Swim below as Leviathans"', {
      fontSize: '11px', color: '#888888', fontFamily: 'monospace', fontStyle: 'italic',
    }).setOrigin(0.5, 0);
    this.add.text(W / 2, y + 114, 'by Fireproof Babies', {
      fontSize: '11px', color: '#666666', fontFamily: 'monospace',
    }).setOrigin(0.5, 0);
    this.add.text(W / 2, y + 130, 'CC BY 2.5 · ccmixter.org', {
      fontSize: '10px', color: '#3a3a3a', fontFamily: 'monospace',
    }).setOrigin(0.5, 0);
  }

  private addContinueButton(W: number, y: number, save: SaveData): void {
    const label = this.fromMenu ? 'BACK TO MENU' : 'TAP TO BEGIN';

    const btn = this.add.text(W / 2, y, label, {
      fontSize: '18px', color: '#00ffff', fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.tweens.add({ targets: btn, alpha: 0, duration: 600, yoyo: true, repeat: -1 });

    const dismiss = () => {
      if (!save.welcomeSeen) {
        save.welcomeSeen = true;
        SaveManager.save(save);
      }
      this.scene.start('MenuScene');
    };

    this.input.once('pointerdown', dismiss);
    this.input.keyboard?.once('keydown-SPACE', dismiss);
    this.input.keyboard?.once('keydown-ENTER', dismiss);
    this.input.keyboard?.once('keydown-BACKSPACE', dismiss);
  }
}
