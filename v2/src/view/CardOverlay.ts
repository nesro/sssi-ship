import Phaser from 'phaser';
import { CARD_ACTION_REROLL } from '../core/constants';
import type { AbilityOffer, CoreState } from '../core/types';
import { abilityById } from '../data/cards';
import { cssColor, PALETTE } from './palette';
import { fontPx, px, SCREEN_HEIGHT, SCREEN_WIDTH } from './layout';
import { addModalBackdrop, addTextButton, UI_FONT } from './widgets';

const DEPTH = 30;
// Portrait: 3 cards side by side — 150px each × 3 + 10px gap × 2 = 470px < 540px
const CARD_WIDTH_LOGICAL = 150;
const CARD_HEIGHT_LOGICAL = 200;
const CARD_GAP_LOGICAL = 10;

const COMPANY_COLORS: Record<string, number> = {
  nexus: PALETTE.weaponCyan,
  aegis: PALETTE.shieldBlue,
  quantum: PALETTE.generatorAmber,
  comet: PALETTE.motorMagenta,
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

  show(offer: AbilityOffer, state: CoreState): void {
    this.hide();
    this.objects.push(addModalBackdrop(this.scene, DEPTH));
    this.objects.push(
      this.scene.add
        .text(SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 - px(CARD_HEIGHT_LOGICAL / 2) - px(44), 'DISPATCH REINFORCEMENTS', {
          fontFamily: UI_FONT,
          fontSize: `${String(fontPx(18))}px`,
          color: cssColor(PALETTE.weaponCyan),
        })
        .setOrigin(0.5)
        .setDepth(DEPTH + 1),
    );
    this.objects.push(
      this.scene.add
        .text(SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 - px(CARD_HEIGHT_LOGICAL / 2) - px(22), 'pick one', {
          fontFamily: UI_FONT,
          fontSize: `${String(fontPx(13))}px`,
          color: cssColor(PALETTE.hullWhite),
        })
        .setOrigin(0.5)
        .setAlpha(0.6)
        .setDepth(DEPTH + 1),
    );
    offer.abilityIds.forEach((cardId, index) => {
      this.addCard(cardId, index);
    });
    this.addFooterButtons(state);
  }

  hide(): void {
    this.objects.forEach((obj) => { obj.removeInteractive(); obj.destroy(); });
    this.objects = [];
  }

  private addCard(cardId: string, index: number): void {
    const card = abilityById(cardId);
    const color = COMPANY_COLORS[card.company] ?? PALETTE.hullWhite;
    const width = px(CARD_WIDTH_LOGICAL);
    const height = px(CARD_HEIGHT_LOGICAL);
    // 3 cards side by side, centered
    const totalW = 3 * width + 2 * px(CARD_GAP_LOGICAL);
    const x = SCREEN_WIDTH / 2 - totalW / 2 + index * (width + px(CARD_GAP_LOGICAL)) + width / 2;
    const y = SCREEN_HEIGHT / 2;

    const panel = this.scene.add
      .rectangle(x, y, width, height, 0x0a0a18, 0.95)
      .setStrokeStyle(px(2), color)
      .setDepth(DEPTH + 1)
      .setInteractive({ useHandCursor: true });
    panel.on('pointerdown', () => { this.onAction(index); });
    panel.on('pointerover', () => panel.setFillStyle(0x16162c, 0.95));
    panel.on('pointerout', () => panel.setFillStyle(0x0a0a18, 0.95));

    // Company icon at top-centre of card
    const iconCX = x;
    const iconCY = y - height / 2 + px(28);
    const iconGfx = this.scene.add.graphics().setDepth(DEPTH + 2).setBlendMode(Phaser.BlendModes.ADD);
    iconGfx.fillStyle(color, 0.08);
    iconGfx.fillCircle(iconCX, iconCY, px(18));
    iconGfx.fillStyle(color, 0.22);
    iconGfx.fillCircle(iconCX, iconCY, px(11));
    iconGfx.fillStyle(color, 0.80);
    iconGfx.fillCircle(iconCX, iconCY, px(6));
    const COMPANY_CHARS: Record<string, string> = { nexus: 'N', aegis: 'A', quantum: 'Q', comet: 'C' };
    const iconText = this.scene.add.text(iconCX, iconCY, COMPANY_CHARS[card.company] ?? '?', {
      fontFamily: UI_FONT,
      fontSize: `${String(fontPx(9))}px`,
      color: cssColor(color),
    }).setOrigin(0.5, 0.45).setDepth(DEPTH + 3);

    const name = this.scene.add
      .text(x, iconCY + px(22), card.name, {
        fontFamily: UI_FONT,
        fontSize: `${String(fontPx(11))}px`,
        color: cssColor(color),
        wordWrap: { width: width - px(8) },
        align: 'center',
      })
      .setOrigin(0.5, 0)
      .setDepth(DEPTH + 2);
    const description = this.scene.add
      .text(x, iconCY + px(54), card.description, {
        fontFamily: UI_FONT,
        fontSize: `${String(fontPx(9))}px`,
        color: cssColor(PALETTE.hullWhite),
        wordWrap: { width: width - px(10) },
        align: 'center',
      })
      .setOrigin(0.5, 0)
      .setDepth(DEPTH + 2);
    this.objects.push(panel, iconGfx, iconText, name, description);
  }

  private addFooterButtons(state: CoreState): void {
    if (state.rerollsLeft <= 0) return;
    const y = SCREEN_HEIGHT / 2 + px(CARD_HEIGHT_LOGICAL / 2) + px(40);
    this.objects.push(
      addTextButton(this.scene, {
        x: SCREEN_WIDTH / 2,
        y,
        label: `REROLL (${String(state.rerollsLeft)})`,
        color: PALETTE.generatorAmber,
        onClick: () => { this.onAction(CARD_ACTION_REROLL); },
      }).setDepth(DEPTH + 2),
    );
  }
}
