// ui/NavBar.ts
// The bottom navigation strip shared by all non-combat scenes.
// Instantiate it in a scene's create() — it attaches itself automatically.

import Phaser from 'phaser';

interface NavItem {
  label: string;
  sceneKey: string;
}

const ITEMS: NavItem[] = [
  { label: 'MENU',     sceneKey: 'MenuScene'          },
  { label: 'MISSIONS', sceneKey: 'MissionSelectScene'  },
  { label: 'SHOP',     sceneKey: 'ShopScene'           },
  { label: 'TALENTS',  sceneKey: 'TalentScene'         },
];

const HEIGHT        = 56;
const BG_COLOR      = 0x080808;
const DIVIDER_COLOR = 0x2a2a2a;
const COLOR_ACTIVE   = '#ffffff';
const COLOR_INACTIVE = '#444444';
const COLOR_HOVER    = '#aaaaaa';

export class NavBar {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.build();
  }

  private build(): void {
    const { width: W, height: H } = this.scene.scale;
    const centerY    = H - HEIGHT / 2;
    const itemWidth  = W / ITEMS.length;

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

      const label = this.scene.add
        .text(x, centerY, item.label, {
          fontSize:   '11px',
          color:       isActive ? COLOR_ACTIVE : COLOR_INACTIVE,
          fontFamily: 'monospace',
        })
        .setOrigin(0.5)
        .setDepth(51);

      if (isActive) {
        // Underline the active item so it is clearly selected.
        this.scene.add
          .rectangle(x, centerY + 14, itemWidth * 0.6, 2, 0x00ffff)
          .setDepth(51);
      } else {
        label.setInteractive({ useHandCursor: true });
        label.on('pointerover', () => label.setColor(COLOR_HOVER));
        label.on('pointerout',  () => label.setColor(COLOR_INACTIVE));
        label.on('pointerdown', () => this.scene.scene.start(item.sceneKey));
      }
    });
  }

  // Convenience: how tall is the nav bar?
  // Scenes use this to keep their content above it.
  static get HEIGHT(): number { return HEIGHT; }
}
