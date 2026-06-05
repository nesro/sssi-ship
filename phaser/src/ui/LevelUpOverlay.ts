import Phaser from 'phaser';
import type { CardDefinition } from '../data/cards.js';

const PANEL_W      = 340;
const PANEL_H      = 80;
const PANEL_GAP    = 12;
const BG_COLOR     = 0x000000;
const BG_ALPHA     = 0.82;
const CARD_COLORS: Record<string, number> = {
  boost:   0x00ff88,
  enabler: 0xffcc00,
  payoff:  0xff8844,
};

export class LevelUpOverlay {
  private readonly scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  show(
    cards: CardDefinition[],
    rerollsLeft: number,
    title: string,
    onPick:   (card: CardDefinition) => void,
    onReroll: (() => void) | null,
    onSkip:   (() => void) | null,
  ): void {
    this.hide();

    const { width: W, height: H } = this.scene.scale;
    const items: Phaser.GameObjects.GameObject[] = [];

    const bg = this.scene.add.rectangle(W / 2, H / 2, W, H, BG_COLOR, BG_ALPHA)
      .setInteractive();
    items.push(bg);

    const titleY = H * 0.18;
    const titleText = this.scene.add.text(W / 2, titleY, title, {
      fontSize: '22px', color: '#ffff00', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);
    items.push(titleText);

    const totalH = cards.length * PANEL_H + (cards.length - 1) * PANEL_GAP;
    const startY = H / 2 - totalH / 2;

    cards.forEach((card, i) => {
      const panelY = startY + i * (PANEL_H + PANEL_GAP) + PANEL_H / 2;
      const color  = CARD_COLORS[card.category] ?? 0xffffff;

      const panel = this.scene.add.rectangle(W / 2, panelY, PANEL_W, PANEL_H, 0x111111)
        .setStrokeStyle(2, color)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => onPick(card));
      items.push(panel);

      const nameText = this.scene.add.text(W / 2 - PANEL_W / 2 + 12, panelY - 18, card.name, {
        fontSize: '14px', color: `#${color.toString(16).padStart(6, '0')}`,
        fontFamily: 'monospace', fontStyle: 'bold',
      });
      items.push(nameText);

      const descText = this.scene.add.text(W / 2 - PANEL_W / 2 + 12, panelY + 2, card.description, {
        fontSize: '11px', color: '#aaaaaa', fontFamily: 'monospace',
        wordWrap: { width: PANEL_W - 24 },
      });
      items.push(descText);
    });

    if (onReroll !== null) {
      const rerollY   = startY + totalH + PANEL_GAP * 2 + 20;
      const canReroll = rerollsLeft > 0;
      const rerollBtn = this.scene.add.rectangle(W / 2, rerollY, 180, 40, 0x222222)
        .setStrokeStyle(1, canReroll ? 0x888888 : 0x444444)
        .setInteractive({ useHandCursor: canReroll });
      if (canReroll) rerollBtn.on('pointerdown', onReroll);
      items.push(rerollBtn);

      const rerollLabel = this.scene.add.text(W / 2, rerollY, `REROLL (${rerollsLeft})`, {
        fontSize: '13px', color: canReroll ? '#cccccc' : '#555555', fontFamily: 'monospace',
      }).setOrigin(0.5);
      items.push(rerollLabel);

    }

    // Skip shown independently — ally drops have no reroll but do have skip.
    if (onSkip !== null) {
      const skipY   = startY + totalH + PANEL_GAP * 2 + (onReroll !== null ? 72 : 20);
      const skipBtn = this.scene.add.rectangle(W / 2, skipY, 120, 36, 0x111111)
        .setStrokeStyle(1, 0x444444)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', onSkip);
      items.push(skipBtn);

      items.push(this.scene.add.text(W / 2, skipY, 'SKIP', {
        fontSize: '12px', color: '#555555', fontFamily: 'monospace',
      }).setOrigin(0.5));
    }

    this.container = this.scene.add.container(0, 0, items).setDepth(50);
  }

  hide(): void {
    this.container?.destroy();
    this.container = null;
  }

  // fallow-ignore-next-line unused-class-member
  get visible(): boolean {
    return this.container !== null;
  }
}
