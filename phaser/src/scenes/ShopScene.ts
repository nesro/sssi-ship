import Phaser from 'phaser';
import type { SaveData, ShipLoadout } from '../SaveManager.js';
import type { ItemDefinition } from '../data/items.js';
import { NavBar }            from '../ui/NavBar.js';
import { ShipPreviewPanel }  from '../ui/ShipPreviewPanel.js';
import { SaveManager }       from '../SaveManager.js';
import { ITEMS, SIDE_WEAPON_IDS, totalCostPaid } from '../data/items.js';

const CARD_W      = 700;
const CARD_H      = 76;   // slot-tag(11) + name(17) + desc(12) + btn(20) + padding
const CARD_GAP    = 1;
const CARD_X      = 50;   // left edge (card centred at 400 px)
const LIST_Y      = 40;   // top of first item card

// Maps ItemSlot to the corresponding ShipLoadout field name.
const SLOT_TO_FIELD: Record<string, keyof ShipLoadout> = {
  front:     'frontWeapon',
  generator: 'generator',
  shields:   'shields',
};

const SLOT_COLORS: Record<string, number> = {
  front:     0x00ccff,
  generator: 0xffcc00,
  shields:   0x00cccc,
  left:      0xff8800,
  right:     0xff8800,
};

// ─── scene ────────────────────────────────────────────────────────────────────

export class ShopScene extends Phaser.Scene {
  private preview!: ShipPreviewPanel;

  constructor() { super({ key: 'ShopScene' }); }

  // fallow-ignore-next-line unused-class-member
  create(): void {
    const { width: W, height: H } = this.scale;
    const save = SaveManager.load();

    this.add.rectangle(W / 2, (H - NavBar.HEIGHT) / 2, W, H - NavBar.HEIGHT, 0x080808);
    this.buildHeader(W, save.coins);
    this.buildItemList(save);
    this.preview = new ShipPreviewPanel(this, save, W, H - NavBar.HEIGHT);
    new NavBar(this);
  }

  // ─── header ─────────────────────────────────────────────────────────────────

  private buildHeader(W: number, coins: number): void {
    this.add.text(16, 14, 'SHOP', {
      fontSize: '18px', color: '#ffffff', fontFamily: 'monospace', fontStyle: 'bold',
    });
    this.add.text(W - 16, 14, `◈ ${coins}`, {
      fontSize: '14px', color: '#ffcc00', fontFamily: 'monospace',
    }).setOrigin(1, 0);
    this.add.rectangle(W / 2, 36, W, 1, 0x222222);
  }

  // ─── item list ───────────────────────────────────────────────────────────────

  private buildItemList(save: SaveData): void {
    const order = ['laser_mk1', 'generator_mk1', 'shield_mk1', 'spread_shot', 'heavy_beam'];
    order.forEach((id, i) => {
      const item = ITEMS[id];
      if (item) this.buildItemCard(item, i, save);
    });
  }

  private buildItemCard(item: ItemDefinition, index: number, save: SaveData): void {
    const y        = LIST_Y + index * (CARD_H + CARD_GAP);
    const ownedLvl = save.inventory[item.id]?.level ?? 0;
    const maxLvl   = item.levels.length;
    const accent   = SLOT_COLORS[item.slot] ?? 0xffffff;

    // Background panel — tapping opens the preview drawer.
    this.add.rectangle(CARD_X + CARD_W / 2, y + CARD_H / 2, CARD_W, CARD_H, 0x111111)
      .setStrokeStyle(1, ownedLvl > 0 ? accent : 0x2a2a2a)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.preview.toggle(item, ownedLvl));

    // Slot tag
    const slotLabel = SIDE_WEAPON_IDS.has(item.id) ? 'SIDE WEAPON' : item.slot.toUpperCase();
    this.add.text(CARD_X + 8, y + 6, slotLabel, {
      fontSize: '9px',
      color: `#${accent.toString(16).padStart(6, '0')}`,
      fontFamily: 'monospace',
    });

    // Item name
    this.add.text(CARD_X + 8, y + 18, item.name, {
      fontSize: '12px', color: '#ffffff', fontFamily: 'monospace', fontStyle: 'bold',
    });

    // Description — 9px keeps it below the name without touching the action buttons.
    this.add.text(CARD_X + 8, y + 34, item.description, {
      fontSize: '9px', color: '#666666', fontFamily: 'monospace',
    });

    // Level display
    const levelStr = ownedLvl > 0 ? `LV ${ownedLvl}/${maxLvl}` : 'NOT OWNED';
    this.add.text(CARD_X + CARD_W - 8, y + 18, levelStr, {
      fontSize: '11px',
      color: ownedLvl > 0 ? '#aaaaaa' : '#444444',
      fontFamily: 'monospace',
    }).setOrigin(1, 0);

    this.buildItemButtons(item, index, y, ownedLvl, maxLvl, save);
  }

  private buildItemButtons(
    item: ItemDefinition,
    index: number,
    y: number,
    ownedLvl: number,
    maxLvl: number,
    save: SaveData,
  ): void {
    const btnY  = y + CARD_H - 16;
    let   btnX  = CARD_X + 8;

    const isSideWeapon = SIDE_WEAPON_IDS.has(item.id);

    if (ownedLvl === 0) {
      // BUY
      const cost = item.levels[0].cost;
      const canAfford = save.coins >= cost;
      btnX = this.addButton(btnX, btnY, `BUY ◈${cost}`, canAfford ? 0x00aa44 : 0x222222, () => {
        if (canAfford) this.handleBuy(item, save);
      });
    } else if (ownedLvl < maxLvl) {
      // UPGRADE
      const cost = item.levels[ownedLvl].cost;
      const canAfford = save.coins >= cost;
      btnX = this.addButton(btnX, btnY, `UPGRADE ◈${cost}`, canAfford ? 0x0077cc : 0x222222, () => {
        if (canAfford) this.handleUpgrade(item, save);
      });
    } else {
      // Max level indicator (no button)
      this.add.text(btnX, btnY + 2, 'MAX LEVEL', {
        fontSize: '10px', color: '#444444', fontFamily: 'monospace',
      });
      btnX += 90;
    }

    if (ownedLvl > 0) {
      // SELL
      const refund = totalCostPaid(item, ownedLvl);
      btnX = this.addButton(btnX + 4, btnY, `SELL ◈${refund}`, 0x662222, () => {
        this.handleSell(item, save);
      });

      // EQUIP buttons
      if (isSideWeapon) {
        const isLeft  = save.ship.leftWeapon  === item.id;
        const isRight = save.ship.rightWeapon === item.id;
        btnX = this.addButton(btnX + 4, btnY, isLeft  ? '◀ L' : 'L', isLeft  ? 0x884400 : 0x333333, () => {
          this.handleEquipSide(item.id, 'left',  save);
        });
        this.addButton(btnX + 4, btnY, isRight ? '▶ R' : 'R', isRight ? 0x884400 : 0x333333, () => {
          this.handleEquipSide(item.id, 'right', save);
        });
      } else {
        const isEquipped = this.isEquipped(item.id, save);
        this.addButton(btnX + 4, btnY, isEquipped ? 'EQUIPPED' : 'EQUIP', isEquipped ? 0x445500 : 0x333333, () => {
          if (!isEquipped) this.handleEquip(item, save);
        });
      }
    }

    void index; // index unused beyond layout, silence unused warning
  }

  // ─── actions ─────────────────────────────────────────────────────────────────

  private handleBuy(item: ItemDefinition, save: SaveData): void {
    const cost = item.levels[0].cost;
    if (save.coins < cost) return;
    save.coins -= cost;
    save.inventory[item.id] = { level: 1 };
    // Auto-equip to the first compatible empty slot.
    this.autoEquip(item, save);
    SaveManager.save(save);
    this.scene.restart();
  }

  private handleUpgrade(item: ItemDefinition, save: SaveData): void {
    const ownedLvl = save.inventory[item.id]?.level ?? 0;
    if (ownedLvl >= item.levels.length) return;
    const cost = item.levels[ownedLvl].cost;
    if (save.coins < cost) return;
    save.coins -= cost;
    save.inventory[item.id].level++;
    SaveManager.save(save);
    this.scene.restart();
  }

  private handleSell(item: ItemDefinition, save: SaveData): void {
    const ownedLvl = save.inventory[item.id]?.level ?? 0;
    if (ownedLvl === 0) return;
    // Unequip from all loadout slots before refunding.
    this.unequipAll(item.id, save);
    save.coins += totalCostPaid(item, ownedLvl);
    delete save.inventory[item.id];
    SaveManager.save(save);
    this.scene.restart();
  }

  private handleEquip(item: ItemDefinition, save: SaveData): void {
    const field = SLOT_TO_FIELD[item.slot];
    if (field) save.ship[field] = item.id;
    SaveManager.save(save);
    this.scene.restart();
  }

  private handleEquipSide(itemId: string, side: 'left' | 'right', save: SaveData): void {
    const key = side === 'left' ? 'leftWeapon' : 'rightWeapon';
    // Toggle: if already in this slot, unequip; otherwise equip.
    if (save.ship[key] === itemId) {
      save.ship[key] = null;
    } else {
      save.ship[key] = itemId;
    }
    SaveManager.save(save);
    this.scene.restart();
  }

  // ─── helpers ─────────────────────────────────────────────────────────────────

  private autoEquip(item: ItemDefinition, save: SaveData): void {
    if (SIDE_WEAPON_IDS.has(item.id)) {
      if (!save.ship.leftWeapon)       save.ship.leftWeapon  = item.id;
      else if (!save.ship.rightWeapon) save.ship.rightWeapon = item.id;
    } else {
      const field = SLOT_TO_FIELD[item.slot];
      if (field && !save.ship[field]) save.ship[field] = item.id;
    }
  }

  private unequipAll(itemId: string, save: SaveData): void {
    if (save.ship.frontWeapon  === itemId) save.ship.frontWeapon  = null;
    if (save.ship.leftWeapon   === itemId) save.ship.leftWeapon   = null;
    if (save.ship.rightWeapon  === itemId) save.ship.rightWeapon  = null;
    if (save.ship.generator    === itemId) save.ship.generator    = null;
    if (save.ship.shields      === itemId) save.ship.shields      = null;
  }

  private isEquipped(itemId: string, save: SaveData): boolean {
    return save.ship.frontWeapon === itemId
        || save.ship.generator   === itemId
        || save.ship.shields     === itemId;
  }

  private addButton(x: number, y: number, label: string, bgColor: number, onClick: () => void): number {
    const FONT  = { fontSize: '10px', color: '#cccccc', fontFamily: 'monospace' };
    const textW = label.length * 6 + 16;
    const btnH  = 20;

    const bg = this.add.rectangle(x + textW / 2, y, textW, btnH, bgColor)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', onClick);
    const txt = this.add.text(x + textW / 2, y, label, FONT).setOrigin(0.5);
    bg.on('pointerover',  () => txt.setColor('#ffffff'));
    bg.on('pointerout',   () => txt.setColor('#cccccc'));

    return x + textW;
  }
}
