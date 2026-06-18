import Phaser from 'phaser';

import type { LoadoutSnapshot } from '../core/types';
import {
  ITEMS,
  SUPPLIES,
  WEAPON_KINDS,
  MAX_WEAPON_LEVEL,
  itemById,
  STARTER_ITEM_IDS,
  supplyById,
  weaponKindDisplayName,
  weaponSpecAtLevel,
} from '../data/items';
import type { CatalogItem, SystemKind } from '../data/items';
import type { WeaponKind } from '../core/types';
import {
  buildLoadout,
  buyItem,
  buySupplyCharge,
  buyWeaponLevel,
  equipItem,
  loadSave,
  sellItem,
  sellSupplyCharge,
  sellWeaponLevel,
} from '../save/SaveManager';
import type { SaveData } from '../save/SaveManager';
import { cssColor, PALETTE } from './palette';
import { fontPx, LOGICAL_WIDTH, px, SCREEN_WIDTH } from './layout';
import { ShopPreviewPanel } from './ShopPreviewPanel';
import type { PreviewLayout } from './ShopPreviewPanel';
import { buildGameTextures, iconTextureForWeaponId } from './textures';
import { addLabel, addTextButton, UI_FONT } from './widgets';

type ShopTab = SystemKind | 'supplies';

const TABS: { key: ShopTab; label: string; color: number }[] = [
  { key: 'weapon', label: 'WEAPONS', color: PALETTE.weaponCyan },
  { key: 'shield', label: 'SHIELDS', color: PALETTE.shieldBlue },
  { key: 'generator', label: 'GEN', color: PALETTE.generatorAmber },
  { key: 'motor', label: 'MOTORS', color: PALETTE.motorMagenta },
  { key: 'supplies', label: 'SUPPLIES', color: PALETTE.hullWhite },
];

// Vertical bands (logical units). Landscape canvas 820×540 — compressed to fit.
const TAB_ROW_Y = 84;
const TAB_MARGIN = 12;
const PREVIEW_BOTTOM_Y = 200;
const LIST_TOP_LOGICAL = 216;
const ROW_HEIGHT_LOGICAL = 40;
const ROW_BG_HEIGHT = 34;
const ACTION_TOP_LOGICAL = 432;
const SIDE_MARGIN = 14;
const ROW_WIDTH = LOGICAL_WIDTH - SIDE_MARGIN * 2;

// Ship sits on the left of the preview band; bars + DPS fill the right.
const PREVIEW_LAYOUT: PreviewLayout = {
  shipX: 92,
  shipY: 155,
  barsLeftX: 170,
  barsTopY: 124,
  barWidth: 450,
  dpsX: 450,
  dpsY: 186,
};

/** The shop (§3.8): tabs per system, buy/equip, and the live load-calculator preview. */
export class ShopScene extends Phaser.Scene {
  private save!: SaveData;
  private tab: ShopTab = 'weapon';
  private selectedItemId: string | null = null;
  private selectedWeaponKind: WeaponKind | null = null;
  private preview!: ShopPreviewPanel;
  private rebuildable: Phaser.GameObjects.GameObject[] = [];
  private tabButtons: { key: ShopTab; text: Phaser.GameObjects.Text }[] = [];
  private tabUnderline!: Phaser.GameObjects.Rectangle;

  constructor() {
    super('ShopScene');
  }

  // fallow-ignore-next-line unused-class-member
  override update(_time: number, deltaMs: number): void {
    this.preview.update(deltaMs);
  }

  // fallow-ignore-next-line unused-class-member
  create(): void {
    this.save = loadSave();
    this.tab = 'weapon';
    this.selectedItemId = null;
    this.tabButtons = [];
    buildGameTextures(this);

    this.add
      .text(SCREEN_WIDTH / 2, px(22), 'NESRO NOVA', {
        fontFamily: UI_FONT,
        fontSize: `${String(fontPx(24))}px`,
        color: cssColor(PALETTE.weaponCyan),
      })
      .setOrigin(0.5);

    // Top-level MISSIONS / SHOP switch
    addTextButton(this, {
      x: SCREEN_WIDTH / 2 - px(70), y: px(52),
      label: 'MISSIONS', color: PALETTE.weaponCyan, size: 14,
      onClick: () => { this.scene.start('MenuScene'); },
    }).setAlpha(0.55);
    addTextButton(this, {
      x: SCREEN_WIDTH / 2 + px(70), y: px(52),
      label: 'SHOP', color: PALETTE.motorMagenta, size: 14,
      onClick: () => { /* already here */ },
    }).setAlpha(1);

    this.addDivider(68);
    this.buildCategoryTabs();
    this.addDivider(100);
    this.addDivider(PREVIEW_BOTTOM_Y);
    this.addDivider(ACTION_TOP_LOGICAL - 8);

    this.preview = new ShopPreviewPanel(this, PREVIEW_LAYOUT);
    this.rebuild();
  }

  private addDivider(logicalY: number): void {
    this.add
      .rectangle(SCREEN_WIDTH / 2, px(logicalY), px(LOGICAL_WIDTH - 24), px(1), 0x222244)
      .setOrigin(0.5, 0);
  }

  /** Full-width single row of category tabs, with an underline under the active one. */
  private buildCategoryTabs(): void {
    const slot = (LOGICAL_WIDTH - TAB_MARGIN * 2) / TABS.length;
    TABS.forEach((tabDef, index) => {
      const centreX = TAB_MARGIN + slot * (index + 0.5);
      const text = addTextButton(this, {
        x: px(centreX), y: px(TAB_ROW_Y),
        label: tabDef.label, color: tabDef.color, size: 12,
        onClick: () => {
          this.tab = tabDef.key;
          this.selectedItemId = null;
          this.selectedWeaponKind = null;
          this.refreshTabs();
          this.rebuild();
        },
      });
      this.tabButtons.push({ key: tabDef.key, text });
    });
    this.tabUnderline = this.add
      .rectangle(0, px(TAB_ROW_Y + 14), px(slot - 20), px(2), PALETTE.weaponCyan)
      .setOrigin(0.5, 0);
    this.refreshTabs();
  }

  private refreshTabs(): void {
    for (const { key, text } of this.tabButtons) {
      const active = key === this.tab;
      text.setAlpha(active ? 1 : 0.45);
      if (active) {
        const def = TABS.find((t) => t.key === key);
        this.tabUnderline.setX(text.x);
        if (def) this.tabUnderline.setFillStyle(def.color);
      }
    }
  }

  private rebuild(): void {
    this.rebuildable.forEach((obj) => {
      (obj as unknown as { removeInteractive?: () => void }).removeInteractive?.();
      obj.destroy();
    });
    this.rebuildable = [];
    this.rebuildable.push(
      addLabel(this, { x: px(SIDE_MARGIN), y: px(40), text: `⬤ ${String(this.save.coins)} coins`, color: PALETTE.generatorAmber, size: 13 }),
    );
    if (this.tab === 'supplies') this.buildSupplyRows();
    else this.buildItemRows(this.tab);
    this.updatePreview();
  }

  private buildItemRows(system: SystemKind): void {
    if (system === 'weapon') {
      this.buildWeaponRows();
      return;
    }
    const entries = Object.entries(ITEMS).filter(([, item]) => item.system === system);
    entries.forEach(([itemId, item], index) => {
      this.buildItemRow(system, itemId, item, index);
    });
    this.buildItemActions(system);
  }

  private buildRowBg(y: number, selected: boolean, onTap: () => void): Phaser.GameObjects.Rectangle {
    const rowBg = this.add
      .rectangle(px(SIDE_MARGIN), y, px(ROW_WIDTH), px(ROW_BG_HEIGHT), selected ? 0x16162c : 0x0a0a18)
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true });
    rowBg.on('pointerdown', onTap);
    rowBg.on('pointerover', () => rowBg.setFillStyle(selected ? 0x1c1c38 : 0x12122a));
    rowBg.on('pointerout', () => rowBg.setFillStyle(selected ? 0x16162c : 0x0a0a18));
    this.rebuildable.push(rowBg);
    return rowBg;
  }

  /** Returns true if the item's prerequisite is owned (or has none). */
  private isUnlocked(item: CatalogItem): boolean {
    if (item.requires === undefined) return true;
    return this.save.ownedItemIds.includes(item.requires);
  }

  /** One full-width tappable row: background, name, right-aligned status. Branch items are indented. */
  private buildItemRow(
    system: SystemKind,
    itemId: string,
    item: CatalogItem,
    index: number,
  ): void {
    const y = px(LIST_TOP_LOGICAL + index * ROW_HEIGHT_LOGICAL);
    const owned = this.save.ownedItemIds.includes(itemId);
    const equipped = this.save.equipped[system] === itemId;
    const selected = this.selectedItemId === itemId;
    const unlocked = this.isUnlocked(item);
    const canAfford = owned || (unlocked && this.save.coins >= item.price);

    // Locked items show their requirement; unlocked items show price or ownership
    let status: string;
    if (!unlocked) {
      status = 'LOCKED';
    } else {
      status = equipped ? 'EQUIPPED' : owned ? 'OWNED' : `${String(item.price)} ⬤`;
    }

    const rowBg = this.buildRowBg(y, selected, () => { this.selectedItemId = itemId; this.rebuild(); });

    // Branch items are indented to show tree structure
    const isBranch = item.requires !== undefined;
    const nameX = isBranch ? 36 : 26;
    if (isBranch) {
      const connector = this.add.text(px(20), y, '⤷', {
        fontFamily: UI_FONT,
        fontSize: `${String(fontPx(12))}px`,
        color: cssColor(0x444466),
      }).setOrigin(0, 0.5);
      this.rebuildable.push(connector);
    }

    const nameText = this.add.text(px(nameX), y, `${selected ? '▶ ' : ''}${item.name}`, {
      fontFamily: UI_FONT,
      fontSize: `${String(fontPx(15))}px`,
      color: cssColor(equipped ? PALETTE.weaponCyan : PALETTE.hullWhite),
    }).setOrigin(0, 0.5);
    this.rebuildable.push(nameText);

    const statusColor = equipped
      ? PALETTE.weaponCyan
      : (!unlocked ? 0x444466 : (owned ? PALETTE.hullWhite : PALETTE.generatorAmber));
    const statusText = this.add.text(px(SIDE_MARGIN + ROW_WIDTH - 12), y, status, {
      fontFamily: UI_FONT,
      fontSize: `${String(fontPx(13))}px`,
      color: cssColor(statusColor),
    }).setOrigin(1, 0.5);
    this.rebuildable.push(statusText);

    if (!unlocked) {
      rowBg.setAlpha(0.25);
      nameText.setAlpha(0.3);
    } else if (!canAfford) {
      rowBg.setAlpha(0.35);
      nameText.setAlpha(0.4);
      statusText.setAlpha(0.4);
    }
  }

  /** Fixed bottom action bar: blurb + BUY/EQUIP/SELL for the selected item. */
  private buildItemActions(system: SystemKind): void {
    if (this.selectedItemId === null) {
      this.rebuildable.push(
        addLabel(this, { x: px(SIDE_MARGIN), y: px(ACTION_TOP_LOGICAL + 30), text: 'Tap an item to see details.', color: 0x666688, size: 13 }),
      );
      return;
    }
    const itemId = this.selectedItemId;
    const item = itemById(itemId);
    const owned = this.save.ownedItemIds.includes(itemId);
    const equipped = this.save.equipped[system] === itemId;
    const unlocked = this.isUnlocked(item);
    const canSell = owned && !STARTER_ITEM_IDS.includes(itemId);
    const blurbY = px(ACTION_TOP_LOGICAL + 12);
    const buttonY = px(ACTION_TOP_LOGICAL + 78);
    const leftX = SCREEN_WIDTH / 2 - px(90);
    const rightX = SCREEN_WIDTH / 2 + px(90);

    this.rebuildable.push(
      this.add.text(px(SIDE_MARGIN), blurbY, item.blurb, {
        fontFamily: UI_FONT,
        fontSize: `${String(fontPx(13))}px`,
        color: cssColor(0x8888aa),
        wordWrap: { width: px(ROW_WIDTH) },
      }),
    );

    if (!unlocked) {
      const reqName = item.requires !== undefined ? itemById(item.requires).name : '';
      this.rebuildable.push(
        addLabel(this, { x: px(SIDE_MARGIN), y: buttonY, text: `Requires: ${reqName}`, color: 0x555577, size: 13 }),
      );
    } else if (!owned && this.save.coins >= item.price) {
      this.rebuildable.push(
        addTextButton(this, {
          x: SCREEN_WIDTH / 2, y: buttonY, label: `BUY  ${String(item.price)} ⬤`, color: PALETTE.generatorAmber,
          onClick: () => { this.save = buyItem(this.save, itemId); this.rebuild(); },
        }),
      );
    } else if (!owned) {
      this.rebuildable.push(
        addLabel(this, { x: px(SIDE_MARGIN), y: buttonY, text: 'Not enough coins — replay missions!', color: PALETTE.enemyOrange, size: 14 }),
      );
    } else {
      // Owned: EQUIP/EQUIPPED on the left, SELL on the right (if not a starter)
      const actionX = canSell ? leftX : SCREEN_WIDTH / 2;
      if (!equipped) {
        this.rebuildable.push(
          addTextButton(this, {
            x: actionX, y: buttonY, label: 'EQUIP', color: PALETTE.weaponCyan,
            onClick: () => { this.save = equipItem(this.save, itemId); this.rebuild(); },
          }),
        );
      } else {
        this.rebuildable.push(
          addLabel(this, { x: actionX - px(canSell ? 50 : 40), y: buttonY - px(8), text: 'EQUIPPED', color: PALETTE.weaponCyan, size: 14 }),
        );
      }
      if (canSell) {
        this.rebuildable.push(
          addTextButton(this, {
            x: rightX, y: buttonY, label: `SELL  +${String(item.price)}⬤`, color: PALETTE.enemyOrange, size: 13,
            onClick: () => {
              this.save = sellItem(this.save, itemId);
              this.selectedItemId = null;
              this.rebuild();
            },
          }),
        );
      }
    }
  }

  private buildWeaponRows(): void {
    WEAPON_KINDS.forEach((kind, index) => {
      const highestOwned = this.highestOwnedLevel(kind);
      const equippedThisKind = this.save.equipped.weapon.startsWith(`${kind}-`);
      const selected = this.selectedWeaponKind === kind;
      const y = px(LIST_TOP_LOGICAL + index * ROW_HEIGHT_LOGICAL);
      const iconId = highestOwned > 0 ? `${kind}-${String(highestOwned)}` : `${kind}-1`;

      const rowBg = this.buildRowBg(y, selected, () => { this.selectedWeaponKind = kind; this.rebuild(); });

      const icon = this.add
        .image(px(38), y, iconTextureForWeaponId(iconId))
        .setOrigin(0.5)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(0.6 + Math.max(0, highestOwned - 1) * 0.04);
      this.rebuildable.push(icon);

      const nameText = this.add.text(px(62), y, `${selected ? '▶ ' : ''}${weaponKindDisplayName(kind)}`, {
        fontFamily: UI_FONT,
        fontSize: `${String(fontPx(15))}px`,
        color: cssColor(equippedThisKind ? PALETTE.weaponCyan : PALETTE.hullWhite),
      }).setOrigin(0, 0.5);
      this.rebuildable.push(nameText);

      // Level dots ●●●○○
      const dots = Array.from({ length: MAX_WEAPON_LEVEL }, (_, i) =>
        i < highestOwned ? '●' : '○',
      ).join('');
      const dotsText = this.add.text(px(SIDE_MARGIN + ROW_WIDTH - 12), y, dots, {
        fontFamily: UI_FONT,
        fontSize: `${String(fontPx(13))}px`,
        color: cssColor(highestOwned > 0 ? PALETTE.weaponCyan : 0x555577),
      }).setOrigin(1, 0.5);
      this.rebuildable.push(dotsText);

      if (highestOwned === 0) {
        icon.setAlpha(0.3);
        nameText.setAlpha(0.4);
        rowBg.setAlpha(0.35);
        dotsText.setAlpha(0.4);
      }
    });
    this.buildWeaponActions();
  }

  private buildWeaponActions(): void {
    if (this.selectedWeaponKind === null) {
      this.rebuildable.push(
        addLabel(this, { x: px(SIDE_MARGIN), y: px(ACTION_TOP_LOGICAL + 30), text: 'Tap a weapon type to see details.', color: 0x666688, size: 13 }),
      );
      return;
    }
    const kind = this.selectedWeaponKind;
    const highestOwned = this.highestOwnedLevel(kind);
    if (highestOwned === 0) {
      this.buildWeaponFirstBuy(kind);
      return;
    }

    const nextLevel = highestOwned + 1;
    const hasUpgrade = nextLevel <= MAX_WEAPON_LEVEL;
    const equippedId = this.save.equipped.weapon;
    const equippedThisKind = equippedId.startsWith(`${kind}-`);
    const equippedLevel = equippedThisKind ? parseInt(equippedId.split('-')[1] ?? '1', 10) : 0;
    const isFreeStarter = itemById(`${kind}-1`).price === 0 && highestOwned === 1;
    const canSell = !isFreeStarter;

    // Two-column stats comparison
    const midX = LOGICAL_WIDTH / 2;
    const headerY = px(ACTION_TOP_LOGICAL + 8);
    const colW = px(midX - SIDE_MARGIN - 6);

    const badge = equippedThisKind && equippedLevel === highestOwned ? '✓ EQUIPPED' : '';
    this.addWeaponStatBlock(kind, highestOwned, { x: px(SIDE_MARGIN), topY: headerY }, colW, badge);

    if (hasUpgrade) {
      this.addWeaponStatBlock(kind, nextLevel, { x: px(midX + 6), topY: headerY }, colW, '');
    } else {
      this.rebuildable.push(
        addLabel(this, { x: px(midX + 6), y: headerY + px(4), text: 'MAX LEVEL', color: PALETTE.weaponCyan, size: 12 }),
      );
    }

    // Button row
    const btnY = px(ACTION_TOP_LOGICAL + 72);
    const leftX = SCREEN_WIDTH / 2 - px(90);
    const rightX = SCREEN_WIDTH / 2 + px(90);

    if (canSell) {
      const refund = itemById(`${kind}-${String(highestOwned)}`).price;
      this.rebuildable.push(addTextButton(this, {
        x: leftX, y: btnY, label: `▼ SELL  +${String(refund)}⬤`,
        color: PALETTE.enemyOrange, size: 13,
        onClick: () => { this.save = sellWeaponLevel(this.save, kind); this.rebuild(); },
      }));
    }

    if (hasUpgrade) {
      const nextItem = itemById(`${kind}-${String(nextLevel)}`);
      const upgradeBtn = addTextButton(this, {
        x: canSell ? rightX : SCREEN_WIDTH / 2, y: btnY,
        label: `▲ Lv ${String(nextLevel)}  ${String(nextItem.price)}⬤`,
        color: PALETTE.generatorAmber, size: 13,
        onClick: () => {
          this.save = buyWeaponLevel(this.save, kind, nextLevel);
          this.save = equipItem(this.save, `${kind}-${String(nextLevel)}`);
          this.rebuild();
        },
      });
      if (this.save.coins < nextItem.price) upgradeBtn.setAlpha(0.4);
      this.rebuildable.push(upgradeBtn);
    } else if (!equippedThisKind || equippedLevel < highestOwned) {
      this.rebuildable.push(addTextButton(this, {
        x: canSell ? rightX : SCREEN_WIDTH / 2, y: btnY,
        label: `EQUIP Lv ${String(highestOwned)}`, color: PALETTE.weaponCyan, size: 13,
        onClick: () => { this.save = equipItem(this.save, `${kind}-${String(highestOwned)}`); this.rebuild(); },
      }));
    }
  }

  private addWeaponStatBlock(
    kind: WeaponKind, level: number,
    pos: { x: number; topY: number },
    maxWidth: number, badge: string,
  ): void {
    const spec = weaponSpecAtLevel(kind, level);
    const tgt = spec.maxTargets === Infinity ? '∞' : String(spec.maxTargets);
    const header = `Lv ${String(level)}${badge ? `  ${badge}` : ''}`;
    const line1 = `${String(spec.damagePerShot)} dmg  ${String(spec.ticksBetweenShots)} ticks`;
    const line2 = `${tgt} tgt  ${String(spec.energyPerShot)} nrg`;
    const hColor = badge ? PALETTE.weaponCyan : PALETTE.generatorAmber;
    this.rebuildable.push(
      this.add.text(pos.x, pos.topY, header, { fontFamily: UI_FONT, fontSize: `${String(fontPx(12))}px`, color: cssColor(hColor) }),
      this.add.text(pos.x, pos.topY + px(14), line1, { fontFamily: UI_FONT, fontSize: `${String(fontPx(11))}px`, color: cssColor(0x8888aa), wordWrap: { width: maxWidth } }),
      this.add.text(pos.x, pos.topY + px(28), line2, { fontFamily: UI_FONT, fontSize: `${String(fontPx(11))}px`, color: cssColor(0x8888aa), wordWrap: { width: maxWidth } }),
    );
  }

  private buildWeaponFirstBuy(kind: WeaponKind): void {
    const spec = weaponSpecAtLevel(kind, 1);
    const item = itemById(`${kind}-1`);
    const tgt = spec.maxTargets === Infinity ? '∞' : String(spec.maxTargets);
    const blurbY = px(ACTION_TOP_LOGICAL + 12);
    const btnY = px(ACTION_TOP_LOGICAL + 68);
    this.rebuildable.push(
      this.add.text(px(SIDE_MARGIN), blurbY,
        `Lv 1:  ${String(spec.damagePerShot)} dmg  ${String(spec.ticksBetweenShots)} ticks  ${tgt} tgt  ${String(spec.energyPerShot)} nrg`, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(12))}px`,
        color: cssColor(0x8888aa), wordWrap: { width: px(ROW_WIDTH) },
      }),
    );
    if (this.save.coins >= item.price) {
      this.rebuildable.push(
        addTextButton(this, {
          x: SCREEN_WIDTH / 2, y: btnY,
          label: `BUY Lv 1  ${String(item.price)} ⬤`, color: PALETTE.generatorAmber,
          onClick: () => { this.save = buyWeaponLevel(this.save, kind, 1); this.save = equipItem(this.save, `${kind}-1`); this.rebuild(); },
        }),
      );
    } else {
      this.rebuildable.push(
        addLabel(this, { x: px(SIDE_MARGIN), y: btnY, text: 'Not enough coins — replay missions!', color: PALETTE.enemyOrange, size: 14 }),
      );
    }
  }

  private highestOwnedLevel(kind: WeaponKind): number {
    for (let lv = MAX_WEAPON_LEVEL; lv >= 1; lv--) {
      if (this.save.ownedItemIds.includes(`${kind}-${String(lv)}`)) return lv;
    }
    return 0;
  }

  private buildSupplyRows(): void {
    const ROW_GAP = ROW_HEIGHT_LOGICAL + 22;
    Object.entries(SUPPLIES).forEach(([supplyId, entry], index) => {
      const y = LIST_TOP_LOGICAL + index * ROW_GAP;
      const owned = this.save.ownedSupplyCharges[supplyId] ?? 0;
      const atMax = owned >= entry.spec.maxCharges;
      const canAffordBuy = this.save.coins >= entry.pricePerCharge;
      this.rebuildable.push(
        addLabel(this, {
          x: px(SIDE_MARGIN),
          y: px(y),
          text: `${entry.spec.name}   ×${String(owned)}/${String(entry.spec.maxCharges)}`,
          color: PALETTE.hullWhite,
          size: 15,
        }),
      );
      this.rebuildable.push(
        addLabel(this, { x: px(SIDE_MARGIN), y: px(y + 22), text: entry.spec.description, color: 0x8888aa, size: 12 }),
      );
      // Sell button — always available when at least one charge is owned
      if (owned > 0) {
        this.rebuildable.push(
          addTextButton(this, {
            x: px(SIDE_MARGIN + ROW_WIDTH - 148), y: px(y + 12),
            label: `-1  ${String(entry.pricePerCharge)}⬤`,
            color: PALETTE.enemyOrange, size: 13,
            onClick: () => { this.save = sellSupplyCharge(this.save, supplyId); this.rebuild(); },
          }),
        );
      }
      // Buy button
      if (!atMax) {
        const buyBtn = addTextButton(this, {
          x: px(SIDE_MARGIN + ROW_WIDTH - 50), y: px(y + 12),
          label: `+1  ${String(entry.pricePerCharge)}⬤`,
          color: PALETTE.generatorAmber, size: 13,
          onClick: () => { this.tryBuyCharge(supplyId); },
        });
        if (!canAffordBuy) buyBtn.setAlpha(0.4);
        this.rebuildable.push(buyBtn);
      }
    });
    this.rebuildable.push(
      addLabel(this, { x: px(SIDE_MARGIN), y: px(ACTION_TOP_LOGICAL + 30), text: 'Charges refill free before every mission.', color: 0x8888aa, size: 13 }),
    );
  }

  private tryBuyCharge(supplyId: string): void {
    if (this.save.coins < supplyById(supplyId).pricePerCharge) return;
    this.save = buySupplyCharge(this.save, supplyId);
    this.rebuild();
  }

  private updatePreview(): void {
    const current = buildLoadout(this.save);
    this.preview.show(current, this.prospectiveLoadout(current));
  }

  /** The selected item hypothetically equipped — even before buying it (§3.8). */
  private prospectiveLoadout(current: LoadoutSnapshot): LoadoutSnapshot | null {
    if (this.tab === 'weapon') {
      if (this.selectedWeaponKind === null) return null;
      const kind = this.selectedWeaponKind;
      const highestOwned = this.highestOwnedLevel(kind);
      const previewLevel = highestOwned > 0 ? highestOwned : 1;
      const spec = weaponSpecAtLevel(kind, previewLevel);
      if (current.weapon?.id === spec.id) return null;
      return { ...current, weapon: spec };
    }
    if (this.selectedItemId === null || this.tab === 'supplies') return null;
    const item = itemById(this.selectedItemId);
    if (this.save.equipped[item.system] === this.selectedItemId) return null;
    switch (item.system) {
      case 'weapon': return { ...current, weapon: item.spec };
      case 'shield': return { ...current, shield: item.spec };
      case 'generator': return { ...current, generator: item.spec };
      case 'motor': return { ...current, motor: item.spec };
    }
  }
}
