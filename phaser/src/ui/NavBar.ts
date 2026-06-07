// ui/NavBar.ts
// The bottom navigation strip shared by all non-combat scenes.
// Instantiate it in a scene's create() — it attaches itself automatically.

import Phaser from 'phaser';
import { SaveManager } from '../SaveManager.js';

interface NavItem {
  label:      string;
  sceneKey:   string;
  // If set, this tab is locked until the named mission has bestStars >= 1.
  unlockedBy?: string;
  lockHint?:   string;   // shown briefly when a locked tab is tapped
}

const ITEMS: NavItem[] = [
  { label: 'MENU',     sceneKey: 'MenuScene'         },
  { label: 'MISSIONS', sceneKey: 'MissionSelectScene' },
  { label: 'SHOP',    sceneKey: 'ShopScene',   unlockedBy: 'tutorial',  lockHint: 'Complete the Tutorial to unlock' },
  { label: 'TALENTS', sceneKey: 'TalentScene', unlockedBy: 'mission_1', lockHint: 'Complete First Contact to unlock' },
];

const HEIGHT        = 56;
const BG_COLOR      = 0x080808;
const DIVIDER_COLOR = 0x2a2a2a;
const COLOR_ACTIVE   = '#ffffff';
const COLOR_INACTIVE = '#444444';
const COLOR_LOCKED   = '#2a2a2a';
const COLOR_HOVER    = '#aaaaaa';

export class NavBar {
  private scene:     Phaser.Scene;
  private toastText: Phaser.GameObjects.Text | null = null;
  private toastTimer: Phaser.Time.TimerEvent | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.build();
  }

  private build(): void {
    const { width: W, height: H } = this.scene.scale;
    const centerY   = H - HEIGHT / 2;
    const itemWidth = W / ITEMS.length;
    const save      = SaveManager.load();

    // Background panel
    this.scene.add
      .rectangle(W / 2, centerY, W, HEIGHT, BG_COLOR)
      .setDepth(50);

    // Top divider line
    this.scene.add
      .rectangle(W / 2, H - HEIGHT, W, 1, DIVIDER_COLOR)
      .setDepth(50);

    ITEMS.forEach((item, index) => {
      const x        = itemWidth * index + itemWidth / 2;
      const isActive = this.scene.scene.key === item.sceneKey;
      const isLocked = item.unlockedBy !== undefined
        && (save.missions[item.unlockedBy]?.bestStars ?? 0) < 1;

      const color = isActive ? COLOR_ACTIVE : isLocked ? COLOR_LOCKED : COLOR_INACTIVE;

      const label = this.scene.add
        .text(x, isLocked ? centerY - 4 : centerY, item.label, {
          fontSize: '11px', color, fontFamily: 'monospace',
        })
        .setOrigin(0.5)
        .setDepth(51);

      if (isActive) {
        this.scene.add
          .rectangle(x, centerY + 14, itemWidth * 0.6, 2, 0x00ffff)
          .setDepth(51);
      } else if (isLocked) {
        // Lock icon below the label — gives visual affordance without hiding the tab.
        this.scene.add
          .text(x, centerY + 10, '🔒', { fontSize: '10px' })
          .setOrigin(0.5)
          .setDepth(51);

        // Tap the locked tab → show a brief hint above the nav bar.
        const hitZone = this.scene.add
          .rectangle(x, centerY, itemWidth - 2, HEIGHT, 0x000000, 0)
          .setInteractive({ useHandCursor: false })
          .setDepth(52);
        hitZone.on('pointerdown', () => this.showToast(W, H, item.lockHint ?? ''));
      } else {
        label.setInteractive({ useHandCursor: true });
        label.on('pointerover', () => label.setColor(COLOR_HOVER));
        label.on('pointerout',  () => label.setColor(COLOR_INACTIVE));
        label.on('pointerdown', () => this.scene.scene.start(item.sceneKey));
      }
    });
  }

  private showToast(W: number, H: number, message: string): void {
    // Cancel any in-progress toast.
    this.toastTimer?.destroy();
    this.toastText?.destroy();

    const toastY = H - HEIGHT - 14;
    this.toastText = this.scene.add.text(W / 2, toastY, message, {
      fontSize: '10px', color: '#888888', fontFamily: 'monospace',
      backgroundColor: '#111111', padding: { x: 8, y: 4 },
    }).setOrigin(0.5, 1).setDepth(55).setAlpha(1);

    this.scene.tweens.add({
      targets: this.toastText, alpha: 0,
      delay: 1400, duration: 400, ease: 'Power1',
    });

    this.toastTimer = this.scene.time.delayedCall(1800, () => {
      this.toastText?.destroy();
      this.toastText = null;
    });
  }

  // Convenience: how tall is the nav bar?
  // Scenes use this to keep their content above it.
  static get HEIGHT(): number { return HEIGHT; }
}
