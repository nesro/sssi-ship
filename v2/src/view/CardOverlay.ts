import Phaser from 'phaser';
import { CARD_ACTION_REROLL, CARD_ACTION_SKIP } from '../core/constants';
import type { CardOffer, CoreState } from '../core/types';
import { cardById } from '../data/cards';
import { cssColor, PALETTE } from './palette';
import { fontPx, px, SCREEN_HEIGHT, SCREEN_WIDTH } from './layout';
import { addModalBackdrop, addTextButton, UI_FONT } from './widgets';

const DEPTH = 30;
const CARD_WIDTH_LOGICAL = 460;
const CARD_HEIGHT_LOGICAL = 120;
const CARD_GAP_LOGICAL = 15;

const SYSTEM_COLORS: Record<string, number> = {
  weapon: PALETTE.weaponCyan,
  shield: PALETTE.shieldBlue,
  generator: PALETTE.generatorAmber,
  motor: PALETTE.motorMagenta,
};

/**
 * The support-call modal: a helper ship offers 3 cards; pick one, reroll, or skip.
 * The core sim is paused (pendingOffer) for as long as this overlay is visible.
 */
export class CardOverlay {
  private objects: Phaser.GameObjects.GameObject[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly onAction: (action: number) => void,
  ) {}

  get visible(): boolean {
    return this.objects.length > 0;
  }

  show(offer: CardOffer, state: CoreState): void {
    this.hide();
    this.objects.push(addModalBackdrop(this.scene, DEPTH));
    this.objects.push(
      this.scene.add
        .text(SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 - px(3 * CARD_HEIGHT_LOGICAL / 2 + CARD_GAP_LOGICAL + 50), 'INCOMING SUPPORT CALL — pick one', {
          fontFamily: UI_FONT,
          fontSize: `${String(fontPx(22))}px`,
          color: cssColor(PALETTE.weaponCyan),
        })
        .setOrigin(0.5)
        .setDepth(DEPTH + 1),
    );
    offer.cardIds.forEach((cardId, index) => {
      this.addCard(cardId, index);
    });
    this.addFooterButtons(state);
  }

  hide(): void {
    this.objects.forEach((obj) => { obj.destroy(); });
    this.objects = [];
  }

  private addCard(cardId: string, index: number): void {
    const card = cardById(cardId);
    const color = SYSTEM_COLORS[card.system] ?? PALETTE.hullWhite;
    const width = px(CARD_WIDTH_LOGICAL);
    const height = px(CARD_HEIGHT_LOGICAL);
    const totalH = 3 * height + 2 * px(CARD_GAP_LOGICAL);
    const x = SCREEN_WIDTH / 2;
    const y = SCREEN_HEIGHT / 2 - totalH / 2 + index * (height + px(CARD_GAP_LOGICAL)) + height / 2;

    const panel = this.scene.add
      .rectangle(x, y, width, height, 0x0a0a18, 0.95)
      .setStrokeStyle(px(2), color)
      .setDepth(DEPTH + 1)
      .setInteractive({ useHandCursor: true });
    panel.on('pointerdown', () => { this.onAction(index); });
    panel.on('pointerover', () => panel.setFillStyle(0x16162c, 0.95));
    panel.on('pointerout', () => panel.setFillStyle(0x0a0a18, 0.95));

    const name = this.scene.add
      .text(x, y - height / 2 + px(28), card.name, {
        fontFamily: UI_FONT,
        fontSize: `${String(fontPx(16))}px`,
        color: cssColor(color),
      })
      .setOrigin(0.5)
      .setDepth(DEPTH + 2);
    const description = this.scene.add
      .text(x, y + px(10), card.description, {
        fontFamily: UI_FONT,
        fontSize: `${String(fontPx(13))}px`,
        color: cssColor(PALETTE.hullWhite),
        wordWrap: { width: width - px(20) },
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(DEPTH + 2);
    this.objects.push(panel, name, description);
  }

  private addFooterButtons(state: CoreState): void {
    const totalH = 3 * px(CARD_HEIGHT_LOGICAL) + 2 * px(CARD_GAP_LOGICAL);
    const y = SCREEN_HEIGHT / 2 + totalH / 2 + px(40);
    if (state.rerollsLeft > 0) {
      this.objects.push(
        addTextButton(this.scene, {
          x: SCREEN_WIDTH / 2 - px(90),
          y,
          label: `REROLL (${String(state.rerollsLeft)})`,
          color: PALETTE.generatorAmber,
          onClick: () => { this.onAction(CARD_ACTION_REROLL); },
        }).setDepth(DEPTH + 2),
      );
    }
    this.objects.push(
      addTextButton(this.scene, {
        x: SCREEN_WIDTH / 2 + px(90),
        y,
        label: 'SKIP',
        color: PALETTE.hullWhite,
        onClick: () => { this.onAction(CARD_ACTION_SKIP); },
      }).setDepth(DEPTH + 2),
    );
  }
}
