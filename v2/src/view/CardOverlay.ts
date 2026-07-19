import Phaser from 'phaser';
import { CARD_ACTION_REROLL, CARD_ACTION_SKIP } from '../core/constants';
import type { AbilityOffer, CoreState } from '../core/types';
import { computeCardOverlayViewModel } from '../viewmodel/combat';
import type { CardOverlayViewModel, OfferCardViewModel } from '../viewmodel/combat';
import { cssColor, PALETTE } from './palette';
import { fontPx, px, SCREEN_HEIGHT, SCREEN_WIDTH } from './layout';
import { addModalBackdrop, addTextButton, UI_FONT } from './widgets';
import { ManagedObjectGroup } from './ManagedObjectGroup';

const DEPTH = 30;
// Portrait: 3 cards side by side — 150px each × 3 + 10px gap × 2 = 470px < 540px
const CARD_WIDTH_LOGICAL = 150;
const CARD_HEIGHT_LOGICAL = 200;
const CARD_GAP_LOGICAL = 10;

/**
 * The support-call modal: a helper ship offers 3 cards; pick one, reroll, or skip.
 * The core sim is paused (pendingOffer) for as long as this overlay is visible.
 */
export class CardOverlay {
  private objects = new ManagedObjectGroup();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly onAction: (action: number) => void,
  ) {}

  get visible(): boolean {
    return this.objects.length > 0;
  }

  show(offer: AbilityOffer, state: CoreState): void {
    const vm = computeCardOverlayViewModel(offer, state);
    this.hide();
    this.objects.add(addModalBackdrop(this.scene, DEPTH));
    this.objects.add(
      this.scene.add
        .text(SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 - px(CARD_HEIGHT_LOGICAL / 2) - px(44), 'DISPATCH REINFORCEMENTS', {
          fontFamily: UI_FONT,
          fontSize: `${String(fontPx(18))}px`,
          color: cssColor(PALETTE.weaponCyan),
        })
        .setOrigin(0.5)
        .setDepth(DEPTH + 1),
    );
    this.objects.add(
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
    vm.cards.forEach((card, index) => { this.addCard(card, index); });
    this.addFooterButtons(vm);
  }

  hide(): void {
    this.objects.destroyAll();
  }

  private addCard(card: OfferCardViewModel, index: number): void {
    const color = card.companyColor;
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
    const iconText = this.scene.add.text(iconCX, iconCY, card.companyChar, {
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
    this.objects.add(panel);
    this.objects.add(iconGfx);
    this.objects.add(iconText);
    this.objects.add(name);
    this.objects.add(description);
  }

  /** SKIP is always available (declining all 3 offers must never be blocked); REROLL only
   * shows while rerolls remain. Both are laid out side by side, centered as one block, so
   * the player is never stuck on this overlay with no way to close it. */
  private addFooterButtons(vm: CardOverlayViewModel): void {
    const y = SCREEN_HEIGHT / 2 + px(CARD_HEIGHT_LOGICAL / 2) + px(40);

    const skipBtn = addTextButton(this.scene, {
      x: SCREEN_WIDTH / 2,
      y,
      label: 'SKIP',
      color: PALETTE.hullWhite,
      onClick: () => { this.onAction(CARD_ACTION_SKIP); },
    }).setDepth(DEPTH + 2);
    this.objects.add(skipBtn);

    if (!vm.showReroll) return;

    const rerollBtn = addTextButton(this.scene, {
      x: SCREEN_WIDTH / 2,
      y,
      label: `REROLL (${String(vm.rerollsLeft)})`,
      color: PALETTE.generatorAmber,
      onClick: () => { this.onAction(CARD_ACTION_REROLL); },
    }).setDepth(DEPTH + 2);
    this.objects.add(rerollBtn);

    // Both buttons were created centered on the same point — spread them apart
    // symmetrically now that their actual rendered widths are known.
    const gap = px(16);
    const totalWidth = skipBtn.width + gap + rerollBtn.width;
    const leftEdge = SCREEN_WIDTH / 2 - totalWidth / 2;
    skipBtn.setX(leftEdge + skipBtn.width / 2);
    rerollBtn.setX(leftEdge + skipBtn.width + gap + rerollBtn.width / 2);
  }
}
