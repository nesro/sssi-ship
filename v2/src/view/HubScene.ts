import Phaser from 'phaser';
import { TICKS_PER_SECOND } from '../core/constants';
import type { LoadoutSnapshot, MissionSpec, StarFamily, StarSpec, WeaponKind } from '../core/types';
import { ALL_MISSIONS, totalStarsAvailable } from '../data/missions';
import {
  ITEMS, SUPPLIES, WEAPON_KINDS, MAX_WEAPON_LEVEL,
  itemById, STARTER_ITEM_IDS, weaponKindDisplayName, weaponSpecAtLevel,
} from '../data/items';
import type { CatalogItem, SystemKind } from '../data/items';
import {
  buildLoadout, buyItem, buySupplyCharge, buyWeaponLevel,
  equipItem, isMissionUnlocked, loadSave, sellItem,
  sellSupplyCharge, sellWeaponLevel, totalStars,
} from '../save/SaveManager';
import type { SaveData } from '../save/SaveManager';
import { cssColor, PALETTE } from './palette';
import { fontPx, HUB_LEFT_W, LOGICAL_HEIGHT, LOGICAL_WIDTH, px } from './layout';
import { ShopPreviewPanel } from './ShopPreviewPanel';
import type { PreviewLayout } from './ShopPreviewPanel';
import { buildGameTextures, iconTextureForWeaponId } from './textures';
import { addLabel, addTextButton, UI_FONT } from './widgets';
import { Sound } from '../audio/SoundManager';

type NavItem = 'missions' | 'shop' | 'settings' | 'about' | 'manual';
type ShopTab = SystemKind | 'supplies';

const NAV_Y = 22;
const CONTENT_TOP = 48;
const CONTENT_PAD = 10;
const MISSION_ROW_H = 44;
const MISSION_LIST_TOP = 66;
const EXPANSION_H = 150;
const SHOP_TAB_W = 82;
const SHOP_ITEM_X = SHOP_TAB_W + 4;
const SHOP_ITEM_W = HUB_LEFT_W - SHOP_ITEM_X - 4;
const SHOP_ROW_H = 40;
const SHOP_ACTION_Y = 432;
const CONTENT_MID = Math.round(HUB_LEFT_W / 2 + SHOP_TAB_W / 2);

const MISSION_DURATION: Record<string, string> = {
  t1: '~30s', t2: '~1min', t3: '~1min', t4: '~2min',
  m1: '~5min', m2: '~5min', m3: '~8min', m4: '~8min',
  m5: '~12min', m6: '~15min',
};

const NAV_ITEMS: { key: NavItem; label: string; color: number }[] = [
  { key: 'missions', label: 'MISSIONS', color: PALETTE.weaponCyan },
  { key: 'shop',     label: 'SHOP',     color: PALETTE.motorMagenta },
  { key: 'settings', label: 'SETTINGS', color: PALETTE.hullWhite },
  { key: 'about',    label: 'ABOUT',    color: PALETTE.shieldBlue },
  { key: 'manual',   label: 'MANUAL',   color: PALETTE.generatorAmber },
];

const SHOP_TABS: { key: ShopTab; label: string; color: number }[] = [
  { key: 'weapon',    label: 'WPN', color: PALETTE.weaponCyan },
  { key: 'shield',    label: 'SHD', color: PALETTE.shieldBlue },
  { key: 'generator', label: 'GEN', color: PALETTE.generatorAmber },
  { key: 'motor',     label: 'MTR', color: PALETTE.motorMagenta },
  { key: 'supplies',  label: 'SUP', color: PALETTE.hullWhite },
];

const HUB_PREVIEW_LAYOUT: PreviewLayout = {
  shipX: 720, shipY: 185,
  barsLeftX: 556, barsTopY: 295, barWidth: 310,
  dpsX: 720, dpsY: 370,
};

const ABOUT_TEXT = [
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

const MANUAL_TEXT = [
  'GENERATOR & SHIELD',
  'Your generator charges up to 100%.',
  'When it hits 100% it fires a pulse:',
  'your shield gains energy and the generator',
  'drops to ~50%. This repeats — so shield',
  'builds up gradually.',
  '',
  'WEAPONS & ENERGY',
  'Every shot costs energy. If you run low,',
  'the fire rate slows (brownout).',
  '',
  'SHOP',
  'Buy and equip weapons, shields, generators',
  'and motors. Live preview shows stat impact.',
  'Supplies refill free before every mission.',
  '',
  'MISSIONS & STARS',
  'Tutorial missions use a preset loadout.',
  'Each combat mission awards up to 3 stars.',
  'Stars unlock harder missions.',
].join('\n');

/** Merged hub: mission list on the left, always-on ship preview on the right. */
export class HubScene extends Phaser.Scene {
  private save!: SaveData;
  private nav: NavItem = 'missions';
  private scrollingStars: { rect: Phaser.GameObjects.Rectangle; speed: number }[] = [];
  private contentObjects: Phaser.GameObjects.GameObject[] = [];
  private preview!: ShopPreviewPanel;
  private readonly navBtns = new Map<NavItem, Phaser.GameObjects.Text>();

  private expandedMissionId: string | null = null;
  private hintVisible = false;
  private hintText: Phaser.GameObjects.Text | null = null;

  private shopTab: ShopTab = 'weapon';
  private shopSelectedItemId: string | null = null;
  private shopSelectedWeaponKind: WeaponKind | null = null;

  constructor() { super('HubScene'); }

  // fallow-ignore-next-line unused-class-member
  create(): void {
    this.save = loadSave();
    this.nav = 'missions';
    this.expandedMissionId = null;
    this.hintVisible = false;
    this.hintText = null;
    this.shopTab = 'weapon';
    this.shopSelectedItemId = null;
    this.shopSelectedWeaponKind = null;
    this.navBtns.clear();
    this.contentObjects = [];
    this.scrollingStars = [];

    buildGameTextures(this);
    Sound.attach(this.sound);
    Sound.startMusic();
    this.addStarfield();

    this.add.rectangle(px(HUB_LEFT_W), 0, px(1), px(LOGICAL_HEIGHT), 0x333355).setOrigin(0, 0).setDepth(1);
    this.add.rectangle(0, px(CONTENT_TOP - 4), px(HUB_LEFT_W), px(1), 0x222244).setOrigin(0, 0).setDepth(1);

    this.buildNavRow();
    this.preview = new ShopPreviewPanel(this, HUB_PREVIEW_LAYOUT);
    this.preview.show(buildLoadout(this.save), null);
    this.setNav('missions');
  }

  // fallow-ignore-next-line unused-class-member
  override update(_time: number, deltaMs: number): void {
    for (const star of this.scrollingStars) {
      star.rect.y += px(star.speed) * deltaMs / 1000;
      if (star.rect.y > px(LOGICAL_HEIGHT + 2)) star.rect.y = -px(2);
    }
    this.preview.update(deltaMs);
  }

  private setNav(nav: NavItem): void {
    this.nav = nav;
    this.updateNavHighlight();
    this.rebuildContent();
    if (nav !== 'shop') this.preview.show(buildLoadout(this.save), null);
  }

  private buildNavRow(): void {
    const slotW = (HUB_LEFT_W - CONTENT_PAD * 2) / NAV_ITEMS.length;
    NAV_ITEMS.forEach((item, i) => {
      const cx = CONTENT_PAD + slotW * (i + 0.5);
      const btn = addTextButton(this, {
        x: px(cx), y: px(NAV_Y),
        label: item.label, color: item.color, size: 12,
        onClick: () => { this.setNav(item.key); },
      });
      btn.setDepth(5);
      this.navBtns.set(item.key, btn);
    });
  }

  private updateNavHighlight(): void {
    NAV_ITEMS.forEach((item) => {
      const btn = this.navBtns.get(item.key);
      if (btn === undefined) return;
      btn.setAlpha(item.key === this.nav ? 1 : 0.4);
    });
  }

  private rebuildContent(): void {
    this.contentObjects.forEach((o) => { o.destroy(); });
    this.contentObjects = [];
    this.hintText = null;
    switch (this.nav) {
      case 'missions': this.buildMissionsContent(); break;
      case 'shop':     this.buildShopContent(); break;
      case 'settings': this.buildSettingsContent(); break;
      case 'about':    this.buildTextContent(ABOUT_TEXT); break;
      case 'manual':   this.buildTextContent(MANUAL_TEXT); break;
    }
  }

  private addC<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.contentObjects.push(obj);
    return obj;
  }

  private addStarfield(): void {
    const COUNT = 55;
    const buf = crypto.getRandomValues(new Uint32Array(COUNT * 3));
    for (let i = 0; i < COUNT; i++) {
      const rx = buf[i * 3] ?? 0;
      const ry = buf[i * 3 + 1] ?? 0;
      const rz = buf[i * 3 + 2] ?? 0;
      const x = rx % LOGICAL_WIDTH;
      const y = ry % LOGICAL_HEIGHT;
      const alpha = rx % 3 === 0 ? 0.55 : 0.2;
      const size = rx % 7 === 0 ? 2 : 1;
      const speed = 10 + (rz % 28);
      const rect = this.add.rectangle(px(x), px(y), px(size), px(size), 0xffffff, alpha).setDepth(0);
      this.scrollingStars.push({ rect, speed });
    }
  }

  // ─── Missions ────────────────────────────────────────────────────────────────

  private buildMissionsContent(): void {
    this.addC(addLabel(this, {
      x: px(CONTENT_PAD), y: px(CONTENT_TOP),
      text: `★ ${String(totalStars(this.save))}/${String(totalStarsAvailable())}   ⬤ ${String(this.save.coins)}`,
      color: PALETTE.generatorAmber, size: 10,
    }));

    let yBase = MISSION_LIST_TOP;
    let dividerDone = false;
    const expandedIdx = ALL_MISSIONS.findIndex((m) => m.id === this.expandedMissionId);

    ALL_MISSIONS.forEach((mission, index) => {
      const isTutorial = mission.forcedLoadout !== undefined;
      if (!dividerDone && !isTutorial) {
        this.addMissionDivider(yBase - MISSION_ROW_H / 2);
        dividerDone = true;
      }
      this.buildMissionRow(mission, yBase);
      yBase += MISSION_ROW_H;
      if (index === expandedIdx) {
        this.buildMissionExpansion(mission, yBase);
        yBase += EXPANSION_H;
      }
    });
  }

  private addMissionDivider(y: number): void {
    const w = HUB_LEFT_W - CONTENT_PAD * 2;
    this.addC(this.add.rectangle(px(CONTENT_PAD), px(y), px(w), px(1), 0x443322).setOrigin(0, 0.5));
    this.addC(this.add.text(px(CONTENT_PAD + 2), px(y - 4), 'TRAINING', {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(8))}px`, color: cssColor(0x665533),
    }).setOrigin(0, 1));
    this.addC(this.add.text(px(CONTENT_PAD + 2), px(y + 4), 'COMBAT MISSIONS', {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(8))}px`, color: cssColor(0x334455),
    }).setOrigin(0, 0));
  }

  private buildMissionRow(mission: MissionSpec, yLogical: number): void {
    const isTutorial = mission.forcedLoadout !== undefined;
    const unlocked = isMissionUnlocked(this.save, mission.id);
    const isExpanded = mission.id === this.expandedMissionId;
    const earned = this.save.missionStars[mission.id]?.length ?? 0;
    const dimAlpha = unlocked ? 1 : 0.45;
    const nameColor = isTutorial
      ? (unlocked ? PALETTE.generatorAmber : 0x445544)
      : (unlocked ? PALETTE.hullWhite : 0x445566);
    const y = px(yLogical);

    const rowBg = this.add
      .rectangle(px(CONTENT_PAD), y, px(HUB_LEFT_W - CONTENT_PAD * 2), px(MISSION_ROW_H - 4), isTutorial ? 0x0d0d0a : 0x0a0a18, 0.7)
      .setOrigin(0, 0.5).setAlpha(dimAlpha);
    this.addC(rowBg);

    const displayName = unlocked ? mission.name : '???';
    const nameText = this.addC(this.add.text(px(CONTENT_PAD + 8), y, `${isExpanded ? '▶ ' : ''}${displayName}`, {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(13))}px`, color: cssColor(nameColor),
    }).setOrigin(0, 0.5).setAlpha(dimAlpha));

    const duration = MISSION_DURATION[mission.id] ?? '';
    if (duration) {
      this.addC(this.add.text(px(HUB_LEFT_W * 0.58), y, duration, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(10))}px`, color: cssColor(0x667788),
      }).setOrigin(0.5, 0.5).setAlpha(dimAlpha));
    }

    if (!isTutorial) {
      const starStr = unlocked ? `★${String(earned)}/${String(mission.stars.length)}` : `${String(mission.starGate)}★`;
      this.addC(this.add.text(px(HUB_LEFT_W - CONTENT_PAD - 2), y, starStr, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(10))}px`,
        color: cssColor(unlocked ? PALETTE.generatorAmber : 0x555566),
      }).setOrigin(1, 0.5).setAlpha(dimAlpha));
    }

    if (unlocked) {
      rowBg.setInteractive({ useHandCursor: true });
      rowBg.on('pointerover', () => { nameText.setAlpha(0.7); });
      rowBg.on('pointerout', () => { nameText.setAlpha(1); });
      rowBg.on('pointerdown', () => {
        this.expandedMissionId = isExpanded ? null : mission.id;
        this.hintVisible = false;
        this.rebuildContent();
      });
    }
  }

  private buildMissionExpansion(mission: MissionSpec, yLogical: number): void {
    const earned = this.save.missionStars[mission.id] ?? [];
    this.addC(this.add.rectangle(px(CONTENT_PAD), px(yLogical), px(HUB_LEFT_W - CONTENT_PAD * 2), px(EXPANSION_H - 2), 0x0d0d22, 0.97).setOrigin(0, 0));

    let cy = yLogical + 8;

    if (mission.forcedLoadout !== undefined) {
      this.addC(this.add.text(px(CONTENT_PAD + 8), px(cy), 'TRAINING MISSION — preset loadout', {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(10))}px`, color: cssColor(PALETTE.generatorAmber),
      }).setOrigin(0, 0));
      cy += 16;
    }

    mission.stars.forEach((star) => {
      const isEarned = earned.includes(star.id);
      this.addC(this.add.text(px(CONTENT_PAD + 8), px(cy), `${isEarned ? '★' : '☆'}  ${starDescription(star)}`, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(11))}px`,
        color: cssColor(isEarned ? PALETTE.generatorAmber : 0x666688),
      }).setOrigin(0, 0));
      cy += 20;
    });

    cy += 4;
    const hintBtn = addTextButton(this, {
      x: px(CONTENT_PAD + 8), y: px(cy),
      label: this.hintVisible ? 'ⓘ HIDE HINT' : 'ⓘ SHOW HINT',
      color: 0x8888aa, size: 10,
      onClick: () => {
        this.hintVisible = !this.hintVisible;
        hintBtn.setText(this.hintVisible ? 'ⓘ HIDE HINT' : 'ⓘ SHOW HINT');
        if (this.hintText !== null) this.hintText.setVisible(this.hintVisible);
      },
    });
    hintBtn.setOrigin(0, 0.5);
    this.addC(hintBtn);

    this.hintText = this.addC(this.add.text(px(CONTENT_PAD + 8), px(cy + 20), mission.blurb, {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(10))}px`,
      color: cssColor(0xaaaacc), wordWrap: { width: px(HUB_LEFT_W - CONTENT_PAD * 2 - 16) },
    }).setOrigin(0, 0).setVisible(this.hintVisible));

    this.addC(addTextButton(this, {
      x: px(CONTENT_PAD + 8), y: px(yLogical + EXPANSION_H - 28),
      label: '▶  START MISSION', color: PALETTE.weaponCyan, size: 13,
      onClick: () => { this.scene.start('CombatScene', { missionId: mission.id }); },
    }).setOrigin(0, 0.5));
  }

  // ─── Shop ─────────────────────────────────────────────────────────────────

  private buildShopContent(): void {
    const tabH = (LOGICAL_HEIGHT - CONTENT_TOP) / SHOP_TABS.length;
    SHOP_TABS.forEach((tab, i) => {
      const tabY = CONTENT_TOP + tabH * (i + 0.5);
      const active = tab.key === this.shopTab;
      const bg = this.addC(this.add.rectangle(px(0), px(tabY), px(SHOP_TAB_W), px(tabH - 2), active ? 0x111128 : 0x080818, 0.95).setOrigin(0, 0.5));
      if (active) bg.setStrokeStyle(px(1), tab.color, 0.6);
      const btn = addTextButton(this, {
        x: px(SHOP_TAB_W / 2), y: px(tabY),
        label: tab.label, color: active ? tab.color : 0x555577, size: 9,
        onClick: () => {
          this.shopTab = tab.key;
          this.shopSelectedItemId = null;
          this.shopSelectedWeaponKind = null;
          this.rebuildContent();
          this.updatePreview();
        },
      });
      btn.setAlpha(active ? 1 : 0.5);
      this.addC(btn);
    });

    this.addC(this.add.rectangle(px(SHOP_TAB_W), px(CONTENT_TOP), px(1), px(LOGICAL_HEIGHT - CONTENT_TOP), 0x333355).setOrigin(0, 0));
    this.addC(this.add.rectangle(px(SHOP_ITEM_X), px(SHOP_ACTION_Y), px(SHOP_ITEM_W), px(1), 0x222244).setOrigin(0, 0));
    this.addC(addLabel(this, { x: px(SHOP_ITEM_X), y: px(CONTENT_TOP + 2), text: `⬤ ${String(this.save.coins)}`, color: PALETTE.generatorAmber, size: 10 }));

    if (this.shopTab === 'supplies') {
      this.buildSupplyRows();
    } else if (this.shopTab === 'weapon') {
      this.buildWeaponRows();
    } else {
      this.buildItemRows(this.shopTab);
    }
  }

  private buildItemRows(system: SystemKind): void {
    const entries = Object.entries(ITEMS).filter(([, item]) => item.system === system);
    entries.forEach(([itemId, item], index) => {
      this.buildItemRow(system, itemId, item, CONTENT_TOP + 22 + index * SHOP_ROW_H);
    });
    this.buildItemActions(system);
  }

  private buildItemRow(system: SystemKind, itemId: string, item: CatalogItem, yLogical: number): void {
    const owned = this.save.ownedItemIds.includes(itemId);
    const equipped = this.save.equipped[system] === itemId;
    const selected = this.shopSelectedItemId === itemId;
    const unlocked = this.isItemUnlocked(item);
    const canAfford = owned || (unlocked && this.save.coins >= item.price);
    const status = !unlocked ? 'LOCKED' : (equipped ? 'EQUIP' : (owned ? 'OWNED' : `${String(item.price)}⬤`));
    const y = px(yLogical + SHOP_ROW_H / 2);

    const rowBg = this.add.rectangle(px(SHOP_ITEM_X), y, px(SHOP_ITEM_W), px(SHOP_ROW_H - 4), selected ? 0x16162c : 0x0a0a18)
      .setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
    rowBg.on('pointerdown', () => { this.shopSelectedItemId = itemId; this.rebuildContent(); this.updatePreview(); });
    rowBg.on('pointerover', () => { rowBg.setFillStyle(selected ? 0x1c1c38 : 0x12122a); });
    rowBg.on('pointerout', () => { rowBg.setFillStyle(selected ? 0x16162c : 0x0a0a18); });
    if (!unlocked) rowBg.setAlpha(0.25);
    else if (!canAfford) rowBg.setAlpha(0.35);
    this.addC(rowBg);

    const isBranch = item.requires !== undefined;
    const nameX = SHOP_ITEM_X + (isBranch ? 18 : 8);
    if (isBranch) {
      this.addC(this.add.text(px(SHOP_ITEM_X + 4), y, '⤷', {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(10))}px`, color: cssColor(0x444466),
      }).setOrigin(0, 0.5));
    }
    const nameAlpha = !unlocked ? 0.3 : (!canAfford ? 0.4 : 1);
    this.addC(this.add.text(px(nameX), y, `${selected ? '▶ ' : ''}${item.name}`, {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(12))}px`,
      color: cssColor(equipped ? PALETTE.weaponCyan : PALETTE.hullWhite),
    }).setOrigin(0, 0.5).setAlpha(nameAlpha));

    const statusColor = equipped ? PALETTE.weaponCyan : (!unlocked ? 0x444466 : (owned ? PALETTE.hullWhite : PALETTE.generatorAmber));
    this.addC(this.add.text(px(SHOP_ITEM_X + SHOP_ITEM_W - 4), y, status, {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(10))}px`, color: cssColor(statusColor),
    }).setOrigin(1, 0.5));
  }

  private buildItemActions(system: SystemKind): void {
    if (this.shopSelectedItemId === null) {
      this.addC(addLabel(this, { x: px(SHOP_ITEM_X), y: px(SHOP_ACTION_Y + 28), text: 'Tap an item to see details.', color: 0x666688, size: 11 }));
      return;
    }
    const itemId = this.shopSelectedItemId;
    const item = itemById(itemId);
    const owned = this.save.ownedItemIds.includes(itemId);
    const equipped = this.save.equipped[system] === itemId;
    const unlocked = this.isItemUnlocked(item);
    const canSell = owned && !STARTER_ITEM_IDS.includes(itemId);

    this.addC(this.add.text(px(SHOP_ITEM_X), px(SHOP_ACTION_Y + 8), item.blurb, {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(10))}px`,
      color: cssColor(0x8888aa), wordWrap: { width: px(SHOP_ITEM_W) },
    }));

    const btnY = px(SHOP_ACTION_Y + 68);
    if (!unlocked) {
      const reqName = item.requires !== undefined ? itemById(item.requires).name : '';
      this.addC(addLabel(this, { x: px(SHOP_ITEM_X), y: btnY, text: `Requires: ${reqName}`, color: 0x555577, size: 11 }));
    } else if (!owned && this.save.coins >= item.price) {
      this.addC(addTextButton(this, {
        x: px(CONTENT_MID), y: btnY, label: `BUY  ${String(item.price)}⬤`, color: PALETTE.generatorAmber,
        onClick: () => { this.save = buyItem(this.save, itemId); this.rebuildContent(); this.updatePreview(); },
      }));
    } else if (!owned) {
      this.addC(addLabel(this, { x: px(SHOP_ITEM_X), y: btnY, text: 'Not enough coins', color: PALETTE.enemyOrange, size: 12 }));
    } else {
      const actionX = canSell ? px(SHOP_ITEM_X + 60) : px(CONTENT_MID);
      if (!equipped) {
        this.addC(addTextButton(this, {
          x: actionX, y: btnY, label: 'EQUIP', color: PALETTE.weaponCyan,
          onClick: () => { this.save = equipItem(this.save, itemId); this.rebuildContent(); this.updatePreview(); },
        }));
      } else {
        this.addC(addLabel(this, { x: actionX - px(canSell ? 30 : 40), y: btnY - px(8), text: 'EQUIPPED', color: PALETTE.weaponCyan, size: 12 }));
      }
      if (canSell) {
        this.addC(addTextButton(this, {
          x: px(HUB_LEFT_W - 60), y: btnY, label: `SELL  +${String(item.price)}⬤`, color: PALETTE.enemyOrange, size: 11,
          onClick: () => { this.save = sellItem(this.save, itemId); this.shopSelectedItemId = null; this.rebuildContent(); this.updatePreview(); },
        }));
      }
    }
  }

  private isItemUnlocked(item: CatalogItem): boolean {
    if (item.requires === undefined) return true;
    return this.save.ownedItemIds.includes(item.requires);
  }

  private buildWeaponRows(): void {
    WEAPON_KINDS.forEach((kind, index) => {
      const highestOwned = this.highestOwnedLevel(kind);
      const equippedThisKind = this.save.equipped.weapon.startsWith(`${kind}-`);
      const selected = this.shopSelectedWeaponKind === kind;
      const y = px(CONTENT_TOP + 22 + index * SHOP_ROW_H + SHOP_ROW_H / 2);
      const iconId = highestOwned > 0 ? `${kind}-${String(highestOwned)}` : `${kind}-1`;

      const rowBg = this.add.rectangle(px(SHOP_ITEM_X), y, px(SHOP_ITEM_W), px(SHOP_ROW_H - 4), selected ? 0x16162c : 0x0a0a18)
        .setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
      rowBg.on('pointerdown', () => { this.shopSelectedWeaponKind = kind; this.rebuildContent(); this.updatePreview(); });
      rowBg.on('pointerover', () => { rowBg.setFillStyle(selected ? 0x1c1c38 : 0x12122a); });
      rowBg.on('pointerout', () => { rowBg.setFillStyle(selected ? 0x16162c : 0x0a0a18); });
      if (highestOwned === 0) rowBg.setAlpha(0.35);
      this.addC(rowBg);

      this.addC(this.add.image(px(SHOP_ITEM_X + 18), y, iconTextureForWeaponId(iconId))
        .setOrigin(0.5).setBlendMode(Phaser.BlendModes.ADD)
        .setScale(0.55 + Math.max(0, highestOwned - 1) * 0.04)
        .setAlpha(highestOwned === 0 ? 0.3 : 1));

      this.addC(this.add.text(px(SHOP_ITEM_X + 38), y, `${selected ? '▶ ' : ''}${weaponKindDisplayName(kind)}`, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(12))}px`,
        color: cssColor(equippedThisKind ? PALETTE.weaponCyan : PALETTE.hullWhite),
      }).setOrigin(0, 0.5).setAlpha(highestOwned === 0 ? 0.4 : 1));

      const dots = Array.from({ length: MAX_WEAPON_LEVEL }, (_, i) => i < highestOwned ? '●' : '○').join('');
      this.addC(this.add.text(px(SHOP_ITEM_X + SHOP_ITEM_W - 4), y, dots, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(10))}px`,
        color: cssColor(highestOwned > 0 ? PALETTE.weaponCyan : 0x555577),
      }).setOrigin(1, 0.5).setAlpha(highestOwned === 0 ? 0.4 : 1));
    });
    this.buildWeaponActions();
  }

  private buildWeaponActions(): void {
    if (this.shopSelectedWeaponKind === null) {
      this.addC(addLabel(this, { x: px(SHOP_ITEM_X), y: px(SHOP_ACTION_Y + 28), text: 'Tap a weapon type.', color: 0x666688, size: 11 }));
      return;
    }
    const kind = this.shopSelectedWeaponKind;
    const highestOwned = this.highestOwnedLevel(kind);
    if (highestOwned === 0) { this.buildWeaponFirstBuy(kind); return; }

    const nextLevel = highestOwned + 1;
    const hasUpgrade = nextLevel <= MAX_WEAPON_LEVEL;
    const equippedId = this.save.equipped.weapon;
    const equippedThisKind = equippedId.startsWith(`${kind}-`);
    const equippedLevel = equippedThisKind ? parseInt(equippedId.split('-')[1] ?? '1', 10) : 0;
    const isFreeStarter = itemById(`${kind}-1`).price === 0 && highestOwned === 1;
    const canSell = !isFreeStarter;

    const headerY = px(SHOP_ACTION_Y + 6);
    const midX = px(SHOP_ITEM_X + Math.round(SHOP_ITEM_W / 2));
    const colW = px(Math.round(SHOP_ITEM_W / 2) - 6);
    const badge = equippedThisKind && equippedLevel === highestOwned ? '✓ EQUIP' : '';

    this.addWeaponStatBlock(kind, highestOwned, { x: px(SHOP_ITEM_X), topY: headerY }, colW, badge);
    if (hasUpgrade) {
      this.addWeaponStatBlock(kind, nextLevel, { x: midX, topY: headerY }, colW, '');
    } else {
      this.addC(addLabel(this, { x: midX, y: headerY + px(4), text: 'MAX LEVEL', color: PALETTE.weaponCyan, size: 10 }));
    }

    const btnY = px(SHOP_ACTION_Y + 68);
    if (canSell) {
      const refund = itemById(`${kind}-${String(highestOwned)}`).price;
      this.addC(addTextButton(this, {
        x: px(SHOP_ITEM_X + 60), y: btnY,
        label: `▼ SELL +${String(refund)}⬤`, color: PALETTE.enemyOrange, size: 11,
        onClick: () => { this.save = sellWeaponLevel(this.save, kind); this.rebuildContent(); this.updatePreview(); },
      }));
    }

    if (hasUpgrade) {
      const nextItem = itemById(`${kind}-${String(nextLevel)}`);
      const upgradeBtn = addTextButton(this, {
        x: canSell ? px(HUB_LEFT_W - 80) : px(CONTENT_MID), y: btnY,
        label: `▲ Lv${String(nextLevel)} ${String(nextItem.price)}⬤`, color: PALETTE.generatorAmber, size: 11,
        onClick: () => {
          this.save = buyWeaponLevel(this.save, kind, nextLevel);
          this.save = equipItem(this.save, `${kind}-${String(nextLevel)}`);
          this.rebuildContent();
          this.updatePreview();
        },
      });
      if (this.save.coins < nextItem.price) upgradeBtn.setAlpha(0.4);
      this.addC(upgradeBtn);
    } else if (!equippedThisKind || equippedLevel < highestOwned) {
      this.addC(addTextButton(this, {
        x: canSell ? px(HUB_LEFT_W - 80) : px(CONTENT_MID), y: btnY,
        label: `EQUIP Lv${String(highestOwned)}`, color: PALETTE.weaponCyan, size: 11,
        onClick: () => { this.save = equipItem(this.save, `${kind}-${String(highestOwned)}`); this.rebuildContent(); this.updatePreview(); },
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
    const hColor = badge ? PALETTE.weaponCyan : PALETTE.generatorAmber;
    this.addC(this.add.text(pos.x, pos.topY, `Lv${String(level)}${badge ? `  ${badge}` : ''}`, {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(10))}px`, color: cssColor(hColor),
    }));
    this.addC(this.add.text(pos.x, pos.topY + px(14), `${String(spec.damagePerShot)}dmg  ${String(spec.ticksBetweenShots)}t`, {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(9))}px`, color: cssColor(0x8888aa), wordWrap: { width: maxWidth },
    }));
    this.addC(this.add.text(pos.x, pos.topY + px(26), `${tgt}tgt  ${String(spec.energyPerShot)}nrg`, {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(9))}px`, color: cssColor(0x8888aa), wordWrap: { width: maxWidth },
    }));
  }

  private buildWeaponFirstBuy(kind: WeaponKind): void {
    const spec = weaponSpecAtLevel(kind, 1);
    const item = itemById(`${kind}-1`);
    const tgt = spec.maxTargets === Infinity ? '∞' : String(spec.maxTargets);
    this.addC(this.add.text(px(SHOP_ITEM_X), px(SHOP_ACTION_Y + 10),
      `Lv1: ${String(spec.damagePerShot)}dmg  ${String(spec.ticksBetweenShots)}t  ${tgt}tgt  ${String(spec.energyPerShot)}nrg`, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(10))}px`,
        color: cssColor(0x8888aa), wordWrap: { width: px(SHOP_ITEM_W) },
      }));
    if (this.save.coins >= item.price) {
      this.addC(addTextButton(this, {
        x: px(CONTENT_MID), y: px(SHOP_ACTION_Y + 68),
        label: `BUY Lv1  ${String(item.price)}⬤`, color: PALETTE.generatorAmber,
        onClick: () => {
          this.save = buyWeaponLevel(this.save, kind, 1);
          this.save = equipItem(this.save, `${kind}-1`);
          this.rebuildContent();
          this.updatePreview();
        },
      }));
    } else {
      this.addC(addLabel(this, { x: px(SHOP_ITEM_X), y: px(SHOP_ACTION_Y + 68), text: 'Not enough coins', color: PALETTE.enemyOrange, size: 12 }));
    }
  }

  private buildSupplyRows(): void {
    const ROW_GAP = SHOP_ROW_H + 22;
    Object.entries(SUPPLIES).forEach(([supplyId, entry], index) => {
      const y = CONTENT_TOP + 22 + index * ROW_GAP;
      const owned = this.save.ownedSupplyCharges[supplyId] ?? 0;
      const atMax = owned >= entry.spec.maxCharges;
      const canAffordBuy = this.save.coins >= entry.pricePerCharge;
      const rightX = SHOP_ITEM_X + SHOP_ITEM_W;

      this.addC(addLabel(this, {
        x: px(SHOP_ITEM_X), y: px(y),
        text: `${entry.spec.name}   ×${String(owned)}/${String(entry.spec.maxCharges)}`,
        color: PALETTE.hullWhite, size: 12,
      }));
      this.addC(addLabel(this, { x: px(SHOP_ITEM_X), y: px(y + 18), text: entry.spec.description, color: 0x8888aa, size: 10 }));

      if (owned > 0) {
        this.addC(addTextButton(this, {
          x: px(rightX - 112), y: px(y + 10),
          label: `-1  ${String(entry.pricePerCharge)}⬤`, color: PALETTE.enemyOrange, size: 11,
          onClick: () => { this.save = sellSupplyCharge(this.save, supplyId); this.rebuildContent(); },
        }));
      }
      if (!atMax) {
        const buyBtn = addTextButton(this, {
          x: px(rightX - 28), y: px(y + 10),
          label: `+1  ${String(entry.pricePerCharge)}⬤`, color: PALETTE.generatorAmber, size: 11,
          onClick: () => {
            if (this.save.coins < entry.pricePerCharge) return;
            this.save = buySupplyCharge(this.save, supplyId);
            this.rebuildContent();
          },
        });
        if (!canAffordBuy) buyBtn.setAlpha(0.4);
        this.addC(buyBtn);
      }
    });
    this.addC(addLabel(this, { x: px(SHOP_ITEM_X), y: px(SHOP_ACTION_Y + 28), text: 'Charges refill free before every mission.', color: 0x8888aa, size: 11 }));
  }

  private highestOwnedLevel(kind: WeaponKind): number {
    for (let lv = MAX_WEAPON_LEVEL; lv >= 1; lv--) {
      if (this.save.ownedItemIds.includes(`${kind}-${String(lv)}`)) return lv;
    }
    return 0;
  }

  private prospectiveLoadout(current: LoadoutSnapshot): LoadoutSnapshot | null {
    if (this.shopTab === 'weapon') {
      if (this.shopSelectedWeaponKind === null) return null;
      const kind = this.shopSelectedWeaponKind;
      const highestOwned = this.highestOwnedLevel(kind);
      const previewLevel = highestOwned > 0 ? highestOwned : 1;
      const spec = weaponSpecAtLevel(kind, previewLevel);
      if (current.weapon?.id === spec.id) return null;
      return { ...current, weapon: spec };
    }
    if (this.shopSelectedItemId === null || this.shopTab === 'supplies') return null;
    const item = itemById(this.shopSelectedItemId);
    if (this.save.equipped[item.system] === this.shopSelectedItemId) return null;
    switch (item.system) {
      case 'weapon': return { ...current, weapon: item.spec };
      case 'shield': return { ...current, shield: item.spec };
      case 'generator': return { ...current, generator: item.spec };
      case 'motor': return { ...current, motor: item.spec };
    }
  }

  private updatePreview(): void {
    const current = buildLoadout(this.save);
    this.preview.show(current, this.prospectiveLoadout(current));
  }

  // ─── Settings / text ─────────────────────────────────────────────────────

  private buildSettingsContent(): void {
    const baseX = px(CONTENT_PAD + 30);
    const musicMuted = Sound.isMusicMuted();
    const sfxMuted = Sound.isSfxMuted();
    const musicLabel = (): string => `MUSIC  ${Sound.isMusicMuted() ? 'OFF' : 'ON'}`;
    const sfxLabel = (): string => `SFX    ${Sound.isSfxMuted() ? 'OFF' : 'ON'}`;

    const musicBtn = addTextButton(this, {
      x: baseX, y: px(CONTENT_TOP + 36), label: musicLabel(),
      color: musicMuted ? 0x666688 : PALETTE.shieldBlue, size: 14,
      onClick: () => {
        Sound.toggleMusic();
        musicBtn.setText(musicLabel());
        musicBtn.setStyle({ color: cssColor(Sound.isMusicMuted() ? 0x666688 : PALETTE.shieldBlue) });
      },
    });
    musicBtn.setOrigin(0, 0.5);
    this.addC(musicBtn);

    const sfxBtn = addTextButton(this, {
      x: baseX, y: px(CONTENT_TOP + 88), label: sfxLabel(),
      color: sfxMuted ? 0x666688 : PALETTE.shieldBlue, size: 14,
      onClick: () => {
        Sound.toggleSfx();
        sfxBtn.setText(sfxLabel());
        sfxBtn.setStyle({ color: cssColor(Sound.isSfxMuted() ? 0x666688 : PALETTE.shieldBlue) });
      },
    });
    sfxBtn.setOrigin(0, 0.5);
    this.addC(sfxBtn);
  }

  private buildTextContent(body: string): void {
    this.addC(this.add.text(px(CONTENT_PAD), px(CONTENT_TOP + 8), body, {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(11))}px`,
      color: cssColor(0xaaaacc), lineSpacing: px(4),
      wordWrap: { width: px(HUB_LEFT_W - CONTENT_PAD * 2) },
    }));
  }
}

function starDescription(star: StarSpec): string {
  const DESCRIPTIONS: Record<StarFamily, (threshold: number) => string> = {
    'hull-above':      (t) => `Finish hull > ${String(Math.round(t * 100))}%`,
    'all-kills':       () => 'No enemy reaches your ship',
    'shield-unbroken': () => 'Shield never breaks',
    'boss-time':       (t) => `Boss in ${String(Math.round(t / TICKS_PER_SECOND))}s`,
  };
  return DESCRIPTIONS[star.family](star.threshold);
}
