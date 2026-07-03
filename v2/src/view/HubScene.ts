import Phaser from 'phaser';
import { TICKS_PER_SECOND } from '../core/constants';
import type { LoadoutSnapshot, MissionSpec, RearWeaponKind, StarFamily, StarSpec, WeaponKind } from '../core/types';
import { ALL_MISSIONS, totalStarsAvailable } from '../data/missions';
import {
  ITEMS, REAR_WEAPON_ITEMS, REAR_WEAPON_KINDS, SHIP_KINDS, SHIPS, SUPPLIES,
  SHIELD_KINDS, GENERATOR_KINDS, MOTOR_KINDS,
  WEAPON_KINDS, MAX_REAR_WEAPON_LEVEL, MAX_SHIP_LEVEL, MAX_WEAPON_LEVEL, MAX_SHIELD_LEVEL, MAX_GENERATOR_LEVEL, MAX_MOTOR_LEVEL, WEAPON_STARS,
  itemById, rearWeaponKindDisplayName, rearWeaponSpecAtLevel, shipById,
  weaponKindDisplayName, weaponSpecAtLevel,
  shieldKindDisplayName, shieldSpecAtLevel,
  generatorKindDisplayName, generatorSpecAtLevel,
  motorKindDisplayName, motorSpecAtLevel,
} from '../data/items';
import type { ShieldKind, GeneratorKind, MotorKind, ShipKind, SystemKind } from '../data/items';
import {
  buildLoadout, buySubscription, buySupplyCharge, downgradeSubscription, isMissionUnlocked,
  isOwned, loadSave, persistSave, resetSave, sellSupplyCharge, switchItem,
  switchRearWeapon, switchShip, totalStars, unequipShield, unequipWeapon, upgradeSubscription,
} from '../save/SaveManager';
import type { SaveData } from '../save/SaveManager';
import { SUBSCRIPTIONS, subscriptionById } from '../data/subscriptions';
import { ALL_ABILITIES } from '../data/cards';
import { ALL_NEW_ABILITIES } from '../data/abilities';
import { cssColor, PALETTE } from './palette';
import { fontPx, HUB_LEFT_W, LOGICAL_HEIGHT, LOGICAL_WIDTH, px } from './layout';
import { ShopPreviewPanel } from './ShopPreviewPanel';
import type { PreviewLayout } from './ShopPreviewPanel';
import {
  buildGameTextures,
  iconTextureForGeneratorKind,
  iconTextureForMotorKind,
  iconTextureForRearWeaponId,
  iconTextureForShieldKind,
  iconTextureForShipKind,
  iconTextureForWeaponId,
} from './textures';
import { addLabel, addTextButton, drawDevBorder, UI_FONT } from './widgets';
import { Sound } from '../audio/SoundManager';

const SHIP_TAB_COLOR = 0x44ffaa;


type NavItem = 'missions' | 'shop' | 'dispatch-reinforcements' | 'settings';
type ShopTab = SystemKind | 'supplies' | 'ship' | 'rear-weapon' | 'loadout';

const NAV_Y = 22;
const CONTENT_TOP = 48;
const CONTENT_PAD = 10;
const INFO_PANEL_TOP = 378;
const INFO_PANEL_H = 152;
const SHOP_TAB_W = 130;
const SHOP_ITEM_X = SHOP_TAB_W + 4;
/** Right edge of the shop item column — preview panel occupies the remaining width. */
const SHOP_COL_W = 640;
const SHOP_ITEM_W = SHOP_COL_W - SHOP_ITEM_X - 4;
const SHOP_ROW_H = 48;
const SHOP_ACTION_Y = 432;
const SHOP_ICON_X_OFFSET = 18;   // icon centre x within row
const SHOP_NAME_X_OFFSET = 38;   // name label left x within row

const ABILITY_COMPANY_COLORS: Record<string, number> = {
  nexus: PALETTE.weaponCyan,
  aegis: PALETTE.shieldBlue,
  quantum: PALETTE.generatorAmber,
  comet: PALETTE.motorMagenta,
};
const DR_LEFT_W = 200;
const DR_RIGHT_X = DR_LEFT_W + 4;
const DR_ROW_H = 70;
const DR_CARD_W = 140;
const DR_CARD_H = 190;
const DR_CARD_GAP = 8;
const DR_CARDS_PER_ROW = 5;
const DR_CARDS_PER_COL = 2;
const DR_CARDS_PER_PAGE = DR_CARDS_PER_ROW * DR_CARDS_PER_COL;

const MISSION_DURATION: Record<string, string> = {
  t1: '~30s', t2: '~1min', t3: '~1min', t4: '~2min',
  m1: '~3min', m2: '~5min', m3: '~8min', m4: '~8min',
  m5: '~12min', m6: '~15min',
};

const GALAXY_CONNECTIONS: [string, string][] = [
  ['t1', 't2'], ['t2', 't3'], ['t3', 't4'],
  ['t1', 'm1'],
  ['m1', 'm2'], ['m2', 'm3'], ['m3', 'm4'], ['m4', 'm5'], ['m5', 'm6'],
];

// Galaxy node positions scaled to portrait 540px width (from 960px landscape × 0.5625).
const GALAXY_NODES: Record<string, { x: number; y: number }> = {
  t1: { x: 62,  y: 130 }, t2: { x: 133, y: 200 }, t3: { x: 87,  y: 285 }, t4: { x: 172, y: 330 },
  m1: { x: 253, y: 100 }, m2: { x: 315, y: 185 }, m3: { x: 369, y: 115 },
  m4: { x: 408, y: 240 }, m5: { x: 450, y: 315 }, m6: { x: 494, y: 185 },
};

const NAV_ITEMS: { key: NavItem; label: string; color: number }[] = [
  { key: 'missions',                label: 'EXPLORE NEARBY SPACE',    color: PALETTE.weaponCyan },
  { key: 'shop',                    label: 'SHIP CONFIGURATION',      color: PALETTE.motorMagenta },
  { key: 'dispatch-reinforcements', label: 'DISPATCH REINFORCEMENTS', color: PALETTE.shieldBlue },
  { key: 'settings',                label: 'SETTINGS',                color: PALETTE.hullWhite },
];

const SHOP_TABS: { key: ShopTab; label: string; color: number }[] = [
  { key: 'loadout',     label: 'MY\nLOADOUT',   color: PALETTE.hullWhite },
  { key: 'ship',        label: 'SHIP',           color: SHIP_TAB_COLOR },
  { key: 'weapon',      label: 'FRONT\nWEAPON',  color: PALETTE.weaponCyan },
  { key: 'rear-weapon', label: 'REAR\nWEAPON',   color: PALETTE.weaponCyan },
  { key: 'shield',      label: 'SHIELD',         color: PALETTE.shieldBlue },
  { key: 'generator',   label: 'GENERATOR',      color: PALETTE.generatorAmber },
  { key: 'motor',       label: 'MOTOR',          color: PALETTE.motorMagenta },
  { key: 'supplies',    label: 'SUPPLIES',       color: PALETTE.hullWhite },
];

// Preview panel sits in the right column (SHOP_COL_W → LOGICAL_WIDTH = 320 px wide)
const HUB_PREVIEW_LAYOUT: PreviewLayout = {
  shipX: 800, shipY: 220,
  barsLeftX: 650, barsTopY: 330, barWidth: 290,
  dpsX: 800, dpsY: 420,
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


/** Merged hub: mission list on the left, always-on ship preview on the right. */
export class HubScene extends Phaser.Scene {
  private save!: SaveData;
  private nav: NavItem | null = null;
  private scrollingStars: { rect: Phaser.GameObjects.Rectangle; speed: number }[] = [];
  private contentObjects: Phaser.GameObjects.GameObject[] = [];
  private preview!: ShopPreviewPanel;

  private selectedMissionId: string | null = null;

  private shopTab: ShopTab = 'weapon';
  private shopSelectedItemId: string | null = null;
  private shopSelectedWeaponKind: WeaponKind | null = null;
  private shopSelectedRearWeaponKind: RearWeaponKind | null = null;
  private shopSelectedShipKind: ShipKind | null = null;
  private shopSelectedShieldKind: ShieldKind | null = null;
  private shopSelectedGeneratorKind: GeneratorKind | null = null;
  private shopSelectedMotorKind: MotorKind | null = null;
  private shopPlayerStars = 0;
  private shopSubViewLevel = 1;

  constructor() { super('HubScene'); }

  // fallow-ignore-next-line unused-class-member
  create(): void {
    this.save = loadSave();

    this.nav = null;
    this.selectedMissionId = null;
    this.shopTab = 'weapon';
    this.shopSelectedItemId = null;
    this.shopSelectedWeaponKind = null;
    this.shopSelectedRearWeaponKind = null;
    this.shopSelectedShipKind = null;
    this.shopSelectedShieldKind = null;
    this.shopSelectedGeneratorKind = null;
    this.shopSelectedMotorKind = null;
    this.shopSubViewLevel = 1;
    this.contentObjects = [];
    this.scrollingStars = [];

    buildGameTextures(this);
    Sound.attach(this.sound);
    Sound.startMusic();
    this.addStarfield();
    drawDevBorder(this, this.save);

    this.add.rectangle(0, px(CONTENT_TOP - 4), px(LOGICAL_WIDTH), px(1), 0x222244).setOrigin(0, 0).setDepth(1);

    this.preview = new ShopPreviewPanel(this, HUB_PREVIEW_LAYOUT);

    this.setNav(null);
  }

  // fallow-ignore-next-line unused-class-member
  override update(_time: number, deltaMs: number): void {
    for (const star of this.scrollingStars) {
      star.rect.y += px(star.speed) * deltaMs / 1000;
      if (star.rect.y > px(LOGICAL_HEIGHT + 2)) star.rect.y = -px(2);
    }
    this.preview.update(deltaMs);
  }

  private setNav(nav: NavItem | null): void {
    this.nav = nav;
    this.rebuildContent();
    this.preview.setVisible(nav === 'shop');
    if (nav === 'shop') this.preview.show(buildLoadout(this.save), null);
  }

  /** Dev-only: called by __cheat.navShop(tab) to jump directly to a shop tab. */
  cheatNavShop(tab: string): void {
    this.shopTab = tab as ShopTab;
    this.setNav('shop');
  }

  private rebuildContent(): void {
    this.contentObjects.forEach((o) => { o.removeInteractive(); o.destroy(); });
    this.contentObjects = [];

    if (this.nav !== null) {
      const backBtn = addTextButton(this, {
        x: px(CONTENT_PAD), y: px(NAV_Y),
        label: '‹ BACK', color: 0x8888aa, size: 11,
        onClick: () => { this.setNav(null); },
      });
      backBtn.setOrigin(0, 0.5);
      this.addC(backBtn);
      const navItem = NAV_ITEMS.find((n) => n.key === this.nav);
      if (navItem !== undefined) {
        this.addC(this.add.text(px(LOGICAL_WIDTH / 2), px(NAV_Y), navItem.label, {
          fontFamily: UI_FONT, fontSize: `${String(fontPx(12))}px`, color: cssColor(navItem.color),
        }).setOrigin(0.5, 0.5));
      }
      this.addC(this.add.text(px(LOGICAL_WIDTH - CONTENT_PAD), px(NAV_Y), `⬤ ${String(this.save.coins)}`, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(12))}px`, color: cssColor(PALETTE.generatorAmber),
      }).setOrigin(1, 0.5));
    }

    switch (this.nav) {
      case null:       this.buildMainMenu(); break;
      case 'missions':                this.buildMissionsContent(); break;
      case 'shop':                    this.buildShopContent(); break;
      case 'dispatch-reinforcements': this.buildDispatchReinforcementsContent(); break;
      case 'settings':                this.buildSettingsContent(); break;
    }
  }

  private addC<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.contentObjects.push(obj);
    return obj;
  }

  private buildMainMenu(): void {
    this.addC(this.add.text(px(LOGICAL_WIDTH / 2), px(NAV_Y), 'NESRO  NOVA', {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(16))}px`, color: cssColor(PALETTE.weaponCyan),
    }).setOrigin(0.5, 0.5).setDepth(2));

    const BTN_GAP = 64;
    const totalH = (NAV_ITEMS.length - 1) * BTN_GAP;
    const startY = Math.round((LOGICAL_HEIGHT - totalH) / 2);
    NAV_ITEMS.forEach((item, i) => {
      this.addC(addTextButton(this, {
        x: px(LOGICAL_WIDTH / 2), y: px(startY + i * BTN_GAP),
        label: item.label, color: item.color, size: 22,
        onClick: () => { this.setNav(item.key); },
      }));
    });
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

  // ─── Missions (galaxy view) ──────────────────────────────────────────────────

  private buildMissionsContent(): void {
    this.addC(addLabel(this, {
      x: px(CONTENT_PAD), y: px(CONTENT_TOP),
      text: `★ ${String(totalStars(this.save))}/${String(totalStarsAvailable())}   ⬤ ${String(this.save.coins)}`,
      color: PALETTE.generatorAmber, size: 10,
    }));

    const gfx = this.addC(this.add.graphics().setDepth(2));

    // Constellation lines
    for (const [aId, bId] of GALAXY_CONNECTIONS) {
      const a = GALAXY_NODES[aId];
      const b = GALAXY_NODES[bId];
      if (a === undefined || b === undefined) continue;
      const bothUnlocked = isMissionUnlocked(this.save, aId) && isMissionUnlocked(this.save, bId);
      gfx.lineStyle(px(0.5), bothUnlocked ? 0x334466 : 0x1a2233, bothUnlocked ? 0.7 : 0.35);
      gfx.beginPath();
      gfx.moveTo(px(a.x), px(a.y));
      gfx.lineTo(px(b.x), px(b.y));
      gfx.strokePath();
    }

    ALL_MISSIONS.forEach((mission) => {
      const pos = GALAXY_NODES[mission.id];
      if (pos !== undefined) this.buildGalaxyNode(gfx, mission, pos);
    });

    this.addC(this.add.rectangle(0, px(INFO_PANEL_TOP - 1), px(LOGICAL_WIDTH), px(1), 0x222244).setOrigin(0, 0));
    this.buildMissionInfoPanel();
  }

  private buildGalaxyNode(gfx: Phaser.GameObjects.Graphics, mission: MissionSpec, pos: { x: number; y: number }): void {
    const isTutorial = mission.forcedLoadout !== undefined;
    const unlocked = isMissionUnlocked(this.save, mission.id);
    const selected = mission.id === this.selectedMissionId;
    const earned = this.save.missionStars[mission.id]?.length ?? 0;
    const nodeColor = isTutorial ? PALETTE.generatorAmber : PALETTE.weaponCyan;
    const r = isTutorial ? 6 : 8;

    // Glow layers
    gfx.fillStyle(nodeColor, unlocked ? (selected ? 0.22 : 0.10) : 0.04);
    gfx.fillCircle(px(pos.x), px(pos.y), px(r * 3.5));
    gfx.fillStyle(nodeColor, unlocked ? (selected ? 0.40 : 0.18) : 0.07);
    gfx.fillCircle(px(pos.x), px(pos.y), px(r * 1.8));
    // Core
    gfx.fillStyle(nodeColor, unlocked ? 1.0 : 0.22);
    gfx.fillCircle(px(pos.x), px(pos.y), px(r));

    // Selection ring
    if (selected) {
      gfx.lineStyle(px(1.5), nodeColor, 0.9);
      gfx.strokeCircle(px(pos.x), px(pos.y), px(r + 6));
      gfx.lineStyle(px(0.5), nodeColor, 0.35);
      gfx.strokeCircle(px(pos.x), px(pos.y), px(r + 11));
    }

    // Label
    const labelY = pos.y + r + 10;
    const labelText = unlocked ? mission.name : '???';
    const labelColor = !unlocked ? 0x445566 : (selected ? nodeColor : (isTutorial ? 0xaa8833 : 0x99aacc));
    this.addC(this.add.text(px(pos.x), px(labelY), labelText, {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(9))}px`, color: cssColor(labelColor),
    }).setOrigin(0.5, 0).setDepth(3).setAlpha(unlocked ? 1 : 0.45));

    if (!isTutorial && unlocked && mission.stars.length > 0) {
      this.addC(this.add.text(px(pos.x), px(labelY + 13), `★${String(earned)}/${String(mission.stars.length)}`, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(8))}px`, color: cssColor(PALETTE.generatorAmber),
      }).setOrigin(0.5, 0).setDepth(3).setAlpha(0.75));
    }

    // Hit zone (invisible, larger than the visual dot)
    const hitR = Math.max(r + 14, 20);
    const zone = this.addC(
      this.add.zone(px(pos.x), px(pos.y), px(hitR * 2), px(hitR * 2))
        .setInteractive({ useHandCursor: unlocked }).setDepth(4),
    );
    if (unlocked) {
      zone.on('pointerdown', () => {
        this.selectedMissionId = selected ? null : mission.id;
        this.rebuildContent();
      });
    }
  }

  private buildMissionInfoPanel(): void {
    this.addC(this.add.rectangle(0, px(INFO_PANEL_TOP), px(LOGICAL_WIDTH), px(INFO_PANEL_H), 0x06060f, 0.92).setOrigin(0, 0));

    if (this.selectedMissionId === null) {
      this.addC(this.add.text(px(LOGICAL_WIDTH / 2), px(INFO_PANEL_TOP + INFO_PANEL_H / 2), 'Select a mission', {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(11))}px`, color: cssColor(0x445566),
      }).setOrigin(0.5));
      return;
    }

    const mission = ALL_MISSIONS.find((m) => m.id === this.selectedMissionId);
    if (mission === undefined) return;

    const isTutorial = mission.forcedLoadout !== undefined;
    const earned = this.save.missionStars[mission.id] ?? [];
    const nodeColor = isTutorial ? PALETTE.generatorAmber : PALETTE.weaponCyan;
    const duration = MISSION_DURATION[mission.id] ?? '';
    const panelX = CONTENT_PAD + 4;
    const topY = INFO_PANEL_TOP + 16;

    this.addC(this.add.text(px(panelX), px(topY), mission.name, {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(15))}px`, color: cssColor(nodeColor),
    }));

    let detailY = topY + 22;
    if (duration) {
      this.addC(this.add.text(px(panelX), px(detailY), duration, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(10))}px`, color: cssColor(0x667788),
      }));
      detailY += 18;
    }

    if (isTutorial) {
      this.addC(this.add.text(px(panelX), px(detailY), 'Training mission — preset loadout', {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(10))}px`, color: cssColor(0x887744),
      }));
    } else {
      mission.stars.forEach((star) => {
        const isEarned = earned.includes(star.id);
        this.addC(this.add.text(px(panelX), px(detailY), `${isEarned ? '★' : '☆'}  ${starDescription(star)}`, {
          fontFamily: UI_FONT, fontSize: `${String(fontPx(10))}px`,
          color: cssColor(isEarned ? PALETTE.generatorAmber : 0x556677),
        }));
        detailY += 18;
      });
    }

    this.addC(addTextButton(this, {
      x: px(Math.round(LOGICAL_WIDTH * 0.76)), y: px(INFO_PANEL_TOP + INFO_PANEL_H / 2),
      label: '▶  START', color: PALETTE.weaponCyan, size: 14,
      onClick: () => { this.scene.start('CombatScene', { missionId: mission.id }); },
    }));
  }

  // ─── Shop ─────────────────────────────────────────────────────────────────

  private buildShopContent(): void {
    this.shopPlayerStars = totalStars(this.save);
    this.addC(this.add.rectangle(px(HUB_LEFT_W), 0, px(1), px(LOGICAL_HEIGHT), 0x333355).setOrigin(0, 0).setDepth(1));
    const tabH = (LOGICAL_HEIGHT - CONTENT_TOP) / SHOP_TABS.length;
    SHOP_TABS.forEach((tab, i) => {
      const tabY = CONTENT_TOP + tabH * (i + 0.5);
      const active = tab.key === this.shopTab;
      const bg = this.addC(
        this.add.rectangle(px(0), px(tabY), px(SHOP_TAB_W), px(tabH - 2), active ? 0x111128 : 0x080818, 0.95)
          .setOrigin(0, 0.5).setInteractive({ useHandCursor: true }),
      );
      if (active) bg.setStrokeStyle(px(1), tab.color, 0.6);
      bg.on('pointerdown', () => {
        this.shopTab = tab.key;
        this.shopSelectedItemId = null;
        this.shopSelectedWeaponKind = null;
        this.shopSelectedRearWeaponKind = null;
        this.shopSelectedShipKind = null;
        this.shopSelectedShieldKind = null;
        this.shopSelectedGeneratorKind = null;
        this.shopSelectedMotorKind = null;
        this.shopSubViewLevel = 1;
        this.rebuildContent();
        this.updatePreview();
      });
      this.addC(
        this.add.text(px(SHOP_TAB_W / 2), px(tabY), tab.label, {
          fontFamily: UI_FONT,
          fontSize: `${String(fontPx(9))}px`,
          color: cssColor(active ? tab.color : 0x555577),
          align: 'center',
        }).setOrigin(0.5).setAlpha(active ? 1 : 0.5),
      );
    });

    this.addC(this.add.rectangle(px(SHOP_TAB_W), px(CONTENT_TOP), px(1), px(LOGICAL_HEIGHT - CONTENT_TOP), 0x333355).setOrigin(0, 0));
    this.addC(this.add.rectangle(px(SHOP_COL_W), px(CONTENT_TOP), px(1), px(LOGICAL_HEIGHT - CONTENT_TOP), 0x333355).setOrigin(0, 0));
    this.addC(this.add.rectangle(px(SHOP_ITEM_X), px(SHOP_ACTION_Y), px(SHOP_ITEM_W), px(1), 0x222244).setOrigin(0, 0));

    if (this.shopTab === 'loadout') {
      this.buildLoadoutRows();
    } else if (this.shopTab === 'ship') {
      this.buildShipRows();
    } else if (this.shopTab === 'supplies') {
      this.buildSupplyRows();
    } else if (this.shopTab === 'weapon') {
      this.buildWeaponRows();
    } else if (this.shopTab === 'rear-weapon') {
      this.buildRearWeaponRows();
    } else if (this.shopTab === 'shield') {
      this.buildShieldRows();
    } else if (this.shopTab === 'generator') {
      this.buildGeneratorRows();
    } else {
      this.buildMotorRows();
    }
  }

  // ─── Rear weapon shop tab ─────────────────────────────────────────────────

  private buildRearWeaponRows(): void {
    const equippedRW = this.save.equipped.rearWeapon;
    if (this.shopSelectedRearWeaponKind === null && equippedRW !== null) {
      const kind = equippedRW.split('-')[0] as RearWeaponKind;
      if ((REAR_WEAPON_KINDS as readonly string[]).includes(kind)) this.shopSelectedRearWeaponKind = kind;
    }
    const isNone = equippedRW === null;
    this.buildNoneRow(0, isNone, isNone, PALETTE.weaponCyan, () => {
      this.save = switchRearWeapon(this.save, null);
      this.shopSelectedRearWeaponKind = null;
      this.rebuildContent();
      this.updatePreview();
    });
    REAR_WEAPON_KINDS.forEach((kind, index) => { this.buildRearWeaponRow(kind, index + 1); });
    this.buildRearWeaponLevelChips();
  }

  private buildRearWeaponRow(kind: RearWeaponKind, index: number): void {
    const equippedId = this.save.equipped.rearWeapon;
    const equippedThisKind = equippedId !== null && equippedId.startsWith(`${kind}-`);
    const equippedLevel = equippedThisKind
      ? (parseInt(equippedId.split('-')[1] ?? '0', 10) || 0)
      : 0;
    const ownedLevel = this.ownedRearWeaponLevelForKind(kind);
    const ownedThisKind = ownedLevel > 0 && !equippedThisKind;
    const displayLevel = equippedLevel > 0 ? equippedLevel : ownedLevel;
    const iconId = displayLevel > 0 ? `${kind}-${String(displayLevel)}` : `${kind}-1`;
    const selected = this.shopSelectedRearWeaponKind === kind;
    const entryPrice = REAR_WEAPON_ITEMS[`${kind}-1`]?.price ?? 0;
    const canAfford = equippedThisKind || ownedThisKind || this.save.coins >= entryPrice;
    const y = px(CONTENT_TOP + 22 + index * SHOP_ROW_H + SHOP_ROW_H / 2);

    this.addKindRowBg(y, selected, false, canAfford, () => {
      if (!equippedThisKind) {
        const ownedLv = this.ownedRearWeaponLevelForKind(kind);
        const targetLv = ownedLv > 0 ? ownedLv : 1;
        this.save = switchRearWeapon(this.save, `${kind}-${String(targetLv)}`);
      }
      this.shopSelectedRearWeaponKind = kind;
      this.rebuildContent(); this.updatePreview();
    });
    this.addC(this.add.image(px(SHOP_ITEM_X + SHOP_ICON_X_OFFSET), y, iconTextureForRearWeaponId(iconId))
      .setOrigin(0.5).setBlendMode(Phaser.BlendModes.ADD)
      .setScale(1.2 + Math.max(0, displayLevel - 1) * 0.07)
      .setAlpha(canAfford ? ((equippedThisKind || ownedThisKind) ? 1 : 0.5) : 0.2));
    this.addC(this.add.text(px(SHOP_ITEM_X + SHOP_NAME_X_OFFSET), y, rearWeaponKindDisplayName(kind), {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(14))}px`,
      color: cssColor(equippedThisKind ? PALETTE.weaponCyan : PALETTE.hullWhite),
    }).setOrigin(0, 0.5).setAlpha(canAfford ? ((equippedThisKind || ownedThisKind) ? 1 : 0.6) : 0.25));
    const equippedRearPrice = equippedId !== null ? (REAR_WEAPON_ITEMS[equippedId]?.price ?? 0) : 0;
    this.addKindBadge(y, { locked: false, starsNeeded: 0, entryPrice, equippedPrice: equippedRearPrice, show: !equippedThisKind && ownedLevel === 0, canAfford });
  }

  private ownedRearWeaponLevelForKind(kind: RearWeaponKind): number {
    for (let lv = MAX_REAR_WEAPON_LEVEL; lv >= 1; lv--) {
      if (isOwned(this.save, `${kind}-${String(lv)}`)) return lv;
    }
    return 0;
  }

  private buildRearWeaponLevelChips(): void {
    const kind = this.shopSelectedRearWeaponKind;
    if (kind === null) {
      this.addC(addLabel(this, { x: px(SHOP_ITEM_X), y: px(SHOP_ACTION_Y + 28), text: 'Tap a rear weapon type.', color: 0x666688, size: 13 }));
      return;
    }
    const equippedId = this.save.equipped.rearWeapon;
    const levels = Array.from({ length: MAX_REAR_WEAPON_LEVEL }, (_, i) => {
      const id = `${kind}-${String(i + 1)}`;
      const item = REAR_WEAPON_ITEMS[id];
      return { id, label: `Lv${String(i + 1)}`, price: item?.price ?? 0, starsRequired: item?.starsRequired ?? 0 };
    });
    this.buildLevelChips(levels, equippedId, PALETTE.weaponCyan, (id) => {
      this.save = switchRearWeapon(this.save, id);
      this.rebuildContent();
      this.updatePreview();
    });
    const equippedThisKind = equippedId !== null && equippedId.startsWith(`${kind}-`);
    if (equippedThisKind) {
      const levelStr = equippedId.split('-').pop() ?? '1';
      const level = parseInt(levelStr, 10) || 1;
      this.addRearWeaponStatBlock(kind, level,
        { x: px(SHOP_ITEM_X), topY: px(SHOP_ACTION_Y + 54) }, px(SHOP_ITEM_W), true);
    }
  }

  private addRearWeaponStatBlock(
    kind: RearWeaponKind, level: number,
    pos: { x: number; topY: number },
    maxWidth: number, isCurrent: boolean,
  ): void {
    const spec = rearWeaponSpecAtLevel(kind, level);
    const color = isCurrent ? PALETTE.weaponCyan : PALETTE.generatorAmber;
    this.addC(this.add.text(pos.x, pos.topY, `${String(spec.damagePerShot)}dmg  ${String(spec.ticksBetweenShots)}t`, {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(11))}px`, color: cssColor(color), wordWrap: { width: maxWidth },
    }));
    this.addC(this.add.text(pos.x, pos.topY + px(14), `${String(spec.maxTargets)} targets  ${String(spec.energyPerShot)} energy`, {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(11))}px`, color: cssColor(color), wordWrap: { width: maxWidth },
    }));
  }

  // ─── Dispatch Reinforcements ──────────────────────────────────────────────

  private buildDispatchReinforcementsContent(): void {
    this.shopPlayerStars = totalStars(this.save);
    this.addC(this.add.rectangle(px(DR_LEFT_W), px(CONTENT_TOP), px(1), px(LOGICAL_HEIGHT - CONTENT_TOP), 0x333355).setOrigin(0, 0));
    this.buildDRLeftPanel();
    if (this.shopSelectedItemId !== null) {
      const sub = SUBSCRIPTIONS[this.shopSelectedItemId];
      if (sub !== undefined) this.buildDRCardsGrid(sub);
    }
  }

  private buildDRLeftPanel(): void {
    const subs = Object.values(SUBSCRIPTIONS);
    subs.forEach((sub, i) => {
      const ownedLevel = this.save.ownedSubscriptions[sub.id] ?? 0;
      const selected = this.shopSelectedItemId === sub.id;
      const rowY = CONTENT_TOP + i * DR_ROW_H;
      const midY = rowY + DR_ROW_H / 2;
      const bg = this.addC(
        this.add.rectangle(px(0), px(rowY), px(DR_LEFT_W), px(DR_ROW_H - 1), selected ? 0x111128 : 0x080818, 0.95)
          .setOrigin(0, 0).setInteractive({ useHandCursor: true }),
      );
      if (selected) bg.setStrokeStyle(px(1), sub.color, 0.5);
      bg.on('pointerdown', () => {
        const wasSelected = this.shopSelectedItemId === sub.id;
        this.shopSelectedItemId = sub.id;
        if (!wasSelected) this.shopSubViewLevel = 1;
        this.rebuildContent();
      });
      this.addC(this.add.text(px(8), px(midY - 10), sub.name, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(12))}px`,
        color: cssColor(selected ? sub.color : (ownedLevel > 0 ? 0x9999bb : 0x555577)),
      }).setOrigin(0, 0.5));
      const dots = Array.from({ length: sub.levels.length }, (_, j) => j < ownedLevel ? '●' : '○').join('');
      this.addC(this.add.text(px(DR_LEFT_W - 6), px(midY - 10), dots, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(10))}px`,
        color: cssColor(ownedLevel > 0 ? sub.color : 0x444466),
      }).setOrigin(1, 0.5));
      const statusText = ownedLevel > 0 ? `Lv${String(ownedLevel)} / ${String(sub.levels.length)}` : 'not subscribed';
      this.addC(this.add.text(px(8), px(midY + 10), statusText, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(9))}px`,
        color: cssColor(ownedLevel > 0 ? 0x778899 : 0x334455),
      }).setOrigin(0, 0.5));
    });
    this.buildDRActionZone();
  }

  private buildDRActionZone(): void {
    const actionY = CONTENT_TOP + DR_ROW_H * 5;
    this.addC(this.add.rectangle(px(0), px(actionY), px(DR_LEFT_W), px(1), 0x333355).setOrigin(0, 0));
    if (this.shopSelectedItemId === null || SUBSCRIPTIONS[this.shopSelectedItemId] === undefined) return;
    const sub = subscriptionById(this.shopSelectedItemId);
    const ownedLevel = this.save.ownedSubscriptions[sub.id] ?? 0;

    this.buildSubLevelChips(sub, ownedLevel, actionY + 14);

    if (ownedLevel > 0) {
      const tagline = sub.levels[ownedLevel - 1]?.tagline ?? '';
      this.addC(this.add.text(px(6), px(actionY + 68), tagline, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(9))}px`,
        color: cssColor(0x8888aa), wordWrap: { width: px(DR_LEFT_W - 10) },
      }));
    }
  }

  private buildSubLevelChips(sub: ReturnType<typeof subscriptionById>, ownedLevel: number, topY: number): void {
    const count = sub.levels.length;
    const chipW = Math.floor((DR_LEFT_W - 8) / count);
    const chipH = 32;
    const chipCY = topY + chipH / 2;

    for (let i = 0; i < count; i++) {
      const lv = i + 1;
      const isCurrent = ownedLevel === lv;
      const lvSpec = sub.levels[i];

      let cost = 0;
      if (lv > ownedLevel) {
        for (let step = ownedLevel; step < lv; step++) {
          cost += sub.levels[step]?.price ?? 0;
        }
      } else if (lv < ownedLevel) {
        for (let step = lv; step < ownedLevel; step++) {
          cost -= sub.levels[step]?.price ?? 0;
        }
      }

      const isRefund = cost < 0;
      const locked = (lvSpec?.starsRequired ?? 0) > this.shopPlayerStars;
      const cannotAfford = !isRefund && !isCurrent && this.save.coins < cost;
      const chipX = 4 + i * chipW + chipW / 2;

      const chip = this.add.rectangle(px(chipX), px(chipCY), px(chipW - 3), px(chipH),
        isCurrent ? 0x0c1a2e : 0x0e0e1e).setOrigin(0.5);
      if (isCurrent) chip.setStrokeStyle(px(1), sub.color, 0.8);
      if (!isCurrent) {
        if (locked || cannotAfford) {
          chip.setAlpha(0.35);
        } else {
          chip.setInteractive({ useHandCursor: true });
          chip.on('pointerdown', () => {
            let s = this.save;
            if (lv > ownedLevel) {
              for (let step = ownedLevel; step < lv; step++) {
                s = step === 0 ? buySubscription(s, sub.id) : upgradeSubscription(s, sub.id);
              }
            } else {
              for (let step = ownedLevel; step > lv; step--) {
                s = downgradeSubscription(s, sub.id);
              }
            }
            this.save = s;
            this.rebuildContent();
          });
          chip.on('pointerover', () => { chip.setFillStyle(0x151530); });
          chip.on('pointerout', () => { chip.setFillStyle(0x0e0e1e); });
        }
      }
      this.addC(chip);

      this.addC(this.add.text(px(chipX), px(chipCY - 7), `Lv${String(lv)}`, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(9))}px`,
        color: cssColor(locked ? 0x444466 : isCurrent ? sub.color : (cannotAfford ? 0x444466 : PALETTE.hullWhite)),
      }).setOrigin(0.5));

      let subText = '';
      let subColor = 0x556677;
      if (locked) {
        subText = `★${String(lvSpec?.starsRequired ?? 0)}`; subColor = 0x445566;
      } else if (isCurrent) {
        subText = '▶'; subColor = sub.color;
      } else if (isRefund) {
        subText = `+${String(-cost)}⬤`; subColor = PALETTE.shieldBlue;
      } else if (cost === 0) {
        subText = 'FREE'; subColor = PALETTE.shieldBlue;
      } else {
        subText = `${String(cost)}⬤`;
        subColor = cannotAfford ? 0x445566 : PALETTE.generatorAmber;
      }
      this.addC(this.add.text(px(chipX), px(chipCY + 8), subText, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(8))}px`, color: cssColor(subColor),
      }).setOrigin(0.5));
    }
  }

  private buildDRCardsGrid(sub: ReturnType<typeof subscriptionById>): void {
    const ownedLevel = this.save.ownedSubscriptions[sub.id] ?? 0;
    const allById = new Map([...ALL_ABILITIES, ...ALL_NEW_ABILITIES].map((a) => [a.id, a]));
    const allCards: Array<{ cardId: string; levelRequired: number }> = [];
    sub.levels.forEach((lvlData, i) => {
      lvlData.cardIds.forEach((cardId) => { allCards.push({ cardId, levelRequired: i + 1 }); });
    });

    const totalPages = Math.max(1, Math.ceil(allCards.length / DR_CARDS_PER_PAGE));
    const page = Math.min(Math.max(1, this.shopSubViewLevel), totalPages);
    const startIdx = (page - 1) * DR_CARDS_PER_PAGE;
    const pageCards = allCards.slice(startIdx, startIdx + DR_CARDS_PER_PAGE);

    const rightW = LOGICAL_WIDTH - DR_RIGHT_X;
    const gridW = DR_CARDS_PER_ROW * DR_CARD_W + (DR_CARDS_PER_ROW - 1) * DR_CARD_GAP;
    const cardStartX = DR_RIGHT_X + Math.floor((rightW - gridW) / 2);
    const cardStartY = CONTENT_TOP + 10;

    pageCards.forEach(({ cardId, levelRequired }, idx) => {
      const col = idx % DR_CARDS_PER_ROW;
      const row = Math.floor(idx / DR_CARDS_PER_ROW);
      const cx = cardStartX + col * (DR_CARD_W + DR_CARD_GAP);
      const cy = cardStartY + row * (DR_CARD_H + DR_CARD_GAP);
      this.buildDRCard(cx, cy, {
        id: cardId, ability: allById.get(cardId),
        levelRequired, accessible: levelRequired <= ownedLevel, fallbackColor: sub.color,
      });
    });

    if (totalPages > 1) {
      const paginationY = cardStartY + DR_CARDS_PER_COL * DR_CARD_H + (DR_CARDS_PER_COL - 1) * DR_CARD_GAP + 14;
      const midX = DR_RIGHT_X + Math.floor(rightW / 2);
      this.addC(this.add.text(px(midX), px(paginationY), `${String(page)} / ${String(totalPages)}`, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(12))}px`, color: cssColor(0x8888aa),
      }).setOrigin(0.5, 0));
      if (page > 1) {
        this.addC(addTextButton(this, {
          x: px(midX - 50), y: px(paginationY),
          label: '←', color: PALETTE.hullWhite, size: 14,
          onClick: () => { this.shopSubViewLevel = page - 1; this.rebuildContent(); },
        }));
      }
      if (page < totalPages) {
        this.addC(addTextButton(this, {
          x: px(midX + 50), y: px(paginationY),
          label: '→', color: PALETTE.hullWhite, size: 14,
          onClick: () => { this.shopSubViewLevel = page + 1; this.rebuildContent(); },
        }));
      }
    }
  }

  private buildDRCard(
    x: number,
    y: number,
    card: {
      id: string;
      ability: { name: string; description: string; kind: string; company: string } | undefined;
      levelRequired: number;
      accessible: boolean;
      fallbackColor: number;
    },
  ): void {
    const alpha = card.accessible ? 1.0 : 0.35;
    const companyColor = ABILITY_COMPANY_COLORS[card.ability?.company ?? ''] ?? card.fallbackColor;
    const panel = this.add.rectangle(px(x), px(y), px(DR_CARD_W), px(DR_CARD_H), 0x0a0a18, 0.95)
      .setOrigin(0, 0).setAlpha(alpha).setStrokeStyle(px(1.5), companyColor, card.accessible ? 0.75 : 0.25);
    this.addC(panel);
    this.addC(this.add.text(px(x + DR_CARD_W - 4), px(y + 5), `LV${String(card.levelRequired)}`, {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(8))}px`,
      color: cssColor(card.accessible ? companyColor : 0x334455),
    }).setOrigin(1, 0).setAlpha(alpha));
    const kindColor = card.ability?.kind === 'active' ? PALETTE.generatorAmber : 0x7788aa;
    this.addC(this.add.text(px(x + 4), px(y + 5), (card.ability?.kind ?? 'passive').toUpperCase(), {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(7))}px`, color: cssColor(kindColor),
    }).setOrigin(0, 0).setAlpha(alpha));
    const iconX = px(x + DR_CARD_W / 2);
    const iconY = px(y + 28);
    const iconGfx = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD).setAlpha(alpha);
    iconGfx.fillStyle(companyColor, card.accessible ? 0.08 : 0.04);
    iconGfx.fillCircle(iconX, iconY, px(14));
    iconGfx.fillStyle(companyColor, card.accessible ? 0.22 : 0.08);
    iconGfx.fillCircle(iconX, iconY, px(9));
    iconGfx.fillStyle(companyColor, card.accessible ? 0.75 : 0.3);
    iconGfx.fillCircle(iconX, iconY, px(5));
    this.addC(iconGfx);
    this.addC(this.add.text(px(x + DR_CARD_W / 2), px(y + 50), card.ability?.name ?? card.id, {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(11))}px`,
      color: cssColor(card.accessible ? companyColor : 0x334455),
      align: 'center', wordWrap: { width: px(DR_CARD_W - 10) },
    }).setOrigin(0.5, 0).setAlpha(alpha));
    if (card.ability?.description) {
      this.addC(this.add.text(px(x + DR_CARD_W / 2), px(y + 100), card.ability.description, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(9))}px`,
        color: cssColor(0x9999bb), align: 'center',
        wordWrap: { width: px(DR_CARD_W - 10) },
      }).setOrigin(0.5, 0).setAlpha(card.accessible ? 0.85 : 0.3));
    }
  }

  // ─── Shield shop tab ─────────────────────────────────────────────────────────

  private equippedLevelForShieldKind(kind: ShieldKind): number {
    const id = this.save.equipped.shield;
    if (id === null || !id.startsWith(`shield-${kind}-`)) return 0;
    return parseInt(id.split('-').pop() ?? '0', 10);
  }

  private ownedLevelForShieldKind(kind: ShieldKind): number {
    for (let lv = MAX_SHIELD_LEVEL; lv >= 1; lv--) {
      if (isOwned(this.save, `shield-${kind}-${String(lv)}`)) return lv;
    }
    return 0;
  }

  private buildShieldRows(): void {
    const equippedShield = this.save.equipped.shield;
    if (this.shopSelectedShieldKind === null && equippedShield !== null) {
      const parts = equippedShield.split('-');
      const kind = parts[1] as ShieldKind;
      if ((SHIELD_KINDS as readonly string[]).includes(kind)) this.shopSelectedShieldKind = kind;
    }
    this.buildNoneRow(0, this.shopSelectedShieldKind === null, equippedShield === null, PALETTE.shieldBlue, () => {
      this.save = unequipShield(this.save);
      this.shopSelectedShieldKind = null;
      this.rebuildContent();
      this.updatePreview();
    });
    SHIELD_KINDS.forEach((kind, index) => { this.buildShieldKindRow(kind, index + 1); });
    this.buildShieldLevelChips();
  }

  private buildShieldKindRow(kind: ShieldKind, index: number): void {
    const equippedLevel = this.equippedLevelForShieldKind(kind);
    const ownedLevel = this.ownedLevelForShieldKind(kind);
    const lv1 = ITEMS[`shield-${kind}-1`];
    const starsNeeded = lv1?.starsRequired ?? 0;
    const locked = starsNeeded > this.shopPlayerStars;
    const entryPrice = lv1?.price ?? 0;
    const equippedThisKind = equippedLevel > 0;
    const displayLevel = equippedLevel > 0 ? equippedLevel : ownedLevel;
    const canAfford = equippedThisKind || ownedLevel > 0 || this.save.coins >= entryPrice;
    const selected = this.shopSelectedShieldKind === kind;
    const y = px(CONTENT_TOP + 22 + index * SHOP_ROW_H + SHOP_ROW_H / 2);

    this.addKindRowBg(y, selected, locked, !locked && canAfford, () => {
      if (!equippedThisKind) {
        const target = ownedLevel > 0 ? ownedLevel : 1;
        this.save = switchItem(this.save, `shield-${kind}-${String(target)}`);
      }
      this.shopSelectedShieldKind = kind;
      this.rebuildContent(); this.updatePreview();
    });
    this.addC(this.add.image(px(SHOP_ITEM_X + SHOP_ICON_X_OFFSET), y, iconTextureForShieldKind(kind))
      .setOrigin(0.5).setBlendMode(Phaser.BlendModes.ADD)
      .setScale(1.2 + Math.max(0, displayLevel - 1) * 0.07)
      .setAlpha(locked ? 0.15 : (canAfford ? ((equippedThisKind || ownedLevel > 0) ? 1 : 0.5) : 0.2)));
    this.addC(this.add.text(px(SHOP_ITEM_X + SHOP_NAME_X_OFFSET), y, shieldKindDisplayName(kind), {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(14))}px`,
      color: cssColor(locked ? 0x555577 : (equippedThisKind ? PALETTE.shieldBlue : PALETTE.hullWhite)),
    }).setOrigin(0, 0.5).setAlpha(locked ? 0.5 : (canAfford ? 1 : 0.4)));
    const equippedShieldPrice = this.save.equipped.shield !== null ? (ITEMS[this.save.equipped.shield]?.price ?? 0) : 0;
    this.addKindBadge(y, { locked, starsNeeded, entryPrice, equippedPrice: equippedShieldPrice, show: !equippedThisKind && ownedLevel === 0, canAfford });
  }

  private buildShieldLevelChips(): void {
    const kind = this.shopSelectedShieldKind;
    if (kind === null) { this.addC(addLabel(this, { x: px(SHOP_ITEM_X), y: px(SHOP_ACTION_Y + 28), text: 'Tap a shield type.', color: 0x666688, size: 13 })); return; }
    const equippedId = this.save.equipped.shield;
    const levels = Array.from({ length: MAX_SHIELD_LEVEL }, (_, i) => {
      const id = `shield-${kind}-${String(i + 1)}`;
      const item = ITEMS[id];
      return { id, label: `Lv${String(i + 1)}`, price: item?.price ?? 0, starsRequired: item?.starsRequired ?? 0 };
    });
    this.buildLevelChips(levels, equippedId, PALETTE.shieldBlue, (id) => {
      this.save = switchItem(this.save, id); this.rebuildContent(); this.updatePreview();
    });
    if (equippedId !== null) {
      const item = ITEMS[equippedId];
      if (item?.system === 'shield') {
        this.addC(this.add.text(px(SHOP_ITEM_X), px(SHOP_ACTION_Y + 54), item.blurb, {
          fontFamily: UI_FONT, fontSize: `${String(fontPx(11))}px`, color: cssColor(0x777799), wordWrap: { width: px(SHOP_ITEM_W) },
        }));
      }
    }
  }

  // ─── Generator shop tab ───────────────────────────────────────────────────────

  private equippedLevelForGeneratorKind(kind: GeneratorKind): number {
    const id = this.save.equipped.generator;
    if (!id.startsWith(`generator-${kind}-`)) return 0;
    return parseInt(id.split('-').pop() ?? '0', 10);
  }

  private ownedLevelForGeneratorKind(kind: GeneratorKind): number {
    for (let lv = MAX_GENERATOR_LEVEL; lv >= 1; lv--) {
      if (isOwned(this.save, `generator-${kind}-${String(lv)}`)) return lv;
    }
    return 0;
  }

  private buildGeneratorRows(): void {
    const equippedId = this.save.equipped.generator;
    if (this.shopSelectedGeneratorKind === null) {
      const parts = equippedId.split('-');
      const kind = parts[1] as GeneratorKind;
      if ((GENERATOR_KINDS as readonly string[]).includes(kind)) this.shopSelectedGeneratorKind = kind;
    }
    if (this.shopSelectedGeneratorKind === null) this.shopSelectedGeneratorKind = 'torrent';
    GENERATOR_KINDS.forEach((kind, index) => { this.buildGeneratorKindRow(kind, index); });
    this.buildGeneratorLevelChips();
  }

  private buildGeneratorKindRow(kind: GeneratorKind, index: number): void {
    const equippedLevel = this.equippedLevelForGeneratorKind(kind);
    const ownedLevel = this.ownedLevelForGeneratorKind(kind);
    const lv1 = ITEMS[`generator-${kind}-1`];
    const starsNeeded = lv1?.starsRequired ?? 0;
    const locked = starsNeeded > this.shopPlayerStars;
    const entryPrice = lv1?.price ?? 0;
    const equippedThisKind = equippedLevel > 0;
    const displayLevel = equippedLevel > 0 ? equippedLevel : ownedLevel;
    const canAfford = equippedThisKind || ownedLevel > 0 || this.save.coins >= entryPrice;
    const selected = this.shopSelectedGeneratorKind === kind;
    const y = px(CONTENT_TOP + 22 + index * SHOP_ROW_H + SHOP_ROW_H / 2);

    this.addKindRowBg(y, selected, locked, !locked && canAfford, () => {
      if (!equippedThisKind) {
        const target = ownedLevel > 0 ? ownedLevel : 1;
        this.save = switchItem(this.save, `generator-${kind}-${String(target)}`);
      }
      this.shopSelectedGeneratorKind = kind;
      this.rebuildContent(); this.updatePreview();
    });
    this.addC(this.add.image(px(SHOP_ITEM_X + SHOP_ICON_X_OFFSET), y, iconTextureForGeneratorKind(kind))
      .setOrigin(0.5).setBlendMode(Phaser.BlendModes.ADD)
      .setScale(1.2 + Math.max(0, displayLevel - 1) * 0.07)
      .setAlpha(locked ? 0.15 : (canAfford ? ((equippedThisKind || ownedLevel > 0) ? 1 : 0.5) : 0.2)));
    this.addC(this.add.text(px(SHOP_ITEM_X + SHOP_NAME_X_OFFSET), y, generatorKindDisplayName(kind), {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(14))}px`,
      color: cssColor(locked ? 0x555577 : (equippedThisKind ? PALETTE.generatorAmber : PALETTE.hullWhite)),
    }).setOrigin(0, 0.5).setAlpha(locked ? 0.5 : (canAfford ? 1 : 0.4)));
    const equippedGenPrice = ITEMS[this.save.equipped.generator]?.price ?? 0;
    this.addKindBadge(y, { locked, starsNeeded, entryPrice, equippedPrice: equippedGenPrice, show: !equippedThisKind && ownedLevel === 0, canAfford });
  }

  private buildGeneratorLevelChips(): void {
    const kind = this.shopSelectedGeneratorKind;
    if (kind === null) { this.addC(addLabel(this, { x: px(SHOP_ITEM_X), y: px(SHOP_ACTION_Y + 28), text: 'Tap a generator type.', color: 0x666688, size: 13 })); return; }
    const equippedId = this.save.equipped.generator;
    const levels = Array.from({ length: MAX_GENERATOR_LEVEL }, (_, i) => {
      const id = `generator-${kind}-${String(i + 1)}`;
      const item = ITEMS[id];
      return { id, label: `Lv${String(i + 1)}`, price: item?.price ?? 0, starsRequired: item?.starsRequired ?? 0 };
    });
    this.buildLevelChips(levels, equippedId, PALETTE.generatorAmber, (id) => {
      this.save = switchItem(this.save, id); this.rebuildContent(); this.updatePreview();
    });
    const item = ITEMS[equippedId];
    if (item?.system === 'generator') {
      this.addC(this.add.text(px(SHOP_ITEM_X), px(SHOP_ACTION_Y + 54), item.blurb, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(11))}px`, color: cssColor(0x777799), wordWrap: { width: px(SHOP_ITEM_W) },
      }));
    }
  }

  // ─── Motor shop tab ───────────────────────────────────────────────────────────

  private equippedLevelForMotorKind(kind: MotorKind): number {
    const id = this.save.equipped.motor;
    if (!id.startsWith(`motor-${kind}-`)) return 0;
    return parseInt(id.split('-').pop() ?? '0', 10);
  }

  private ownedLevelForMotorKind(kind: MotorKind): number {
    for (let lv = MAX_MOTOR_LEVEL; lv >= 1; lv--) {
      if (isOwned(this.save, `motor-${kind}-${String(lv)}`)) return lv;
    }
    return 0;
  }

  private buildMotorRows(): void {
    const equippedId = this.save.equipped.motor;
    if (this.shopSelectedMotorKind === null) {
      const parts = equippedId.split('-');
      const kind = parts[1] as MotorKind;
      if ((MOTOR_KINDS as readonly string[]).includes(kind)) this.shopSelectedMotorKind = kind;
    }
    if (this.shopSelectedMotorKind === null) this.shopSelectedMotorKind = 'rush';
    MOTOR_KINDS.forEach((kind, index) => { this.buildMotorKindRow(kind, index); });
    this.buildMotorLevelChips();
  }

  private buildMotorKindRow(kind: MotorKind, index: number): void {
    const equippedLevel = this.equippedLevelForMotorKind(kind);
    const ownedLevel = this.ownedLevelForMotorKind(kind);
    const lv1 = ITEMS[`motor-${kind}-1`];
    const starsNeeded = lv1?.starsRequired ?? 0;
    const locked = starsNeeded > this.shopPlayerStars;
    const entryPrice = lv1?.price ?? 0;
    const equippedThisKind = equippedLevel > 0;
    const displayLevel = equippedLevel > 0 ? equippedLevel : ownedLevel;
    const canAfford = equippedThisKind || ownedLevel > 0 || this.save.coins >= entryPrice;
    const selected = this.shopSelectedMotorKind === kind;
    const y = px(CONTENT_TOP + 22 + index * SHOP_ROW_H + SHOP_ROW_H / 2);

    this.addKindRowBg(y, selected, locked, !locked && canAfford, () => {
      if (!equippedThisKind) {
        const target = ownedLevel > 0 ? ownedLevel : 1;
        this.save = switchItem(this.save, `motor-${kind}-${String(target)}`);
      }
      this.shopSelectedMotorKind = kind;
      this.rebuildContent(); this.updatePreview();
    });
    this.addC(this.add.image(px(SHOP_ITEM_X + SHOP_ICON_X_OFFSET), y, iconTextureForMotorKind(kind))
      .setOrigin(0.5).setBlendMode(Phaser.BlendModes.ADD)
      .setScale(1.2 + Math.max(0, displayLevel - 1) * 0.07)
      .setAlpha(locked ? 0.15 : (canAfford ? ((equippedThisKind || ownedLevel > 0) ? 1 : 0.5) : 0.2)));
    this.addC(this.add.text(px(SHOP_ITEM_X + SHOP_NAME_X_OFFSET), y, motorKindDisplayName(kind), {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(14))}px`,
      color: cssColor(locked ? 0x555577 : (equippedThisKind ? PALETTE.motorMagenta : PALETTE.hullWhite)),
    }).setOrigin(0, 0.5).setAlpha(locked ? 0.5 : (canAfford ? 1 : 0.4)));
    const equippedMotorPrice = ITEMS[this.save.equipped.motor]?.price ?? 0;
    this.addKindBadge(y, { locked, starsNeeded, entryPrice, equippedPrice: equippedMotorPrice, show: !equippedThisKind && ownedLevel === 0, canAfford });
  }

  private buildMotorLevelChips(): void {
    const kind = this.shopSelectedMotorKind;
    if (kind === null) { this.addC(addLabel(this, { x: px(SHOP_ITEM_X), y: px(SHOP_ACTION_Y + 28), text: 'Tap a motor type.', color: 0x666688, size: 13 })); return; }
    const equippedId = this.save.equipped.motor;
    const levels = Array.from({ length: MAX_MOTOR_LEVEL }, (_, i) => {
      const id = `motor-${kind}-${String(i + 1)}`;
      const item = ITEMS[id];
      return { id, label: `Lv${String(i + 1)}`, price: item?.price ?? 0, starsRequired: item?.starsRequired ?? 0 };
    });
    this.buildLevelChips(levels, equippedId, PALETTE.motorMagenta, (id) => {
      this.save = switchItem(this.save, id); this.rebuildContent(); this.updatePreview();
    });
    const item = ITEMS[equippedId];
    if (item?.system === 'motor') {
      this.addC(this.add.text(px(SHOP_ITEM_X), px(SHOP_ACTION_Y + 54), item.blurb, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(11))}px`, color: cssColor(0x777799), wordWrap: { width: px(SHOP_ITEM_W) },
      }));
    }
  }

  // ─── Shared kind-row helpers (used by every shop tab) ────────────────────────

  /** Draws the row background rectangle, wires hover/tap, and dims when star-locked. */
  private addKindRowBg(
    y: number, selected: boolean, locked: boolean, interactive: boolean,
    onTap: () => void,
  ): void {
    const bg = this.add.rectangle(
      px(SHOP_ITEM_X), y, px(SHOP_ITEM_W), px(SHOP_ROW_H - 4),
      selected ? 0x16162c : 0x0a0a18,
    ).setOrigin(0, 0.5);
    if (locked) bg.setAlpha(0.35);
    if (interactive) {
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', onTap);
      bg.on('pointerover', () => { bg.setFillStyle(selected ? 0x1c1c38 : 0x12122a); });
      bg.on('pointerout', () => { bg.setFillStyle(selected ? 0x16162c : 0x0a0a18); });
    }
    this.addC(bg);
  }

  /**
   * Draws the right-aligned badge on a kind row:
   * – opts.locked: shows a star-count requirement
   * – opts.show: shows net cost (FREE when 0, greyed when unaffordable)
   * – otherwise: no-op
   */
  private addKindBadge(y: number, opts: {
    locked: boolean; starsNeeded: number;
    entryPrice: number; equippedPrice: number;
    show: boolean; canAfford: boolean;
  }): void {
    const { locked, starsNeeded, entryPrice, equippedPrice, show, canAfford } = opts;
    if (!locked && !show) return;
    const x = px(SHOP_ITEM_X + SHOP_ITEM_W - 4);
    if (locked) {
      this.addC(this.add.text(x, y, `★${String(starsNeeded)}`, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(12))}px`, color: cssColor(0x556677),
      }).setOrigin(1, 0.5));
      return;
    }
    const netCost = Math.max(0, entryPrice - equippedPrice);
    const label = netCost === 0 ? 'FREE' : `${String(netCost)}⬤`;
    const color = netCost === 0 ? PALETTE.shieldBlue : (canAfford ? PALETTE.generatorAmber : 0x556677);
    this.addC(this.add.text(x, y, label, {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(12))}px`, color: cssColor(color),
    }).setOrigin(1, 0.5).setAlpha(0.7));
  }

  /** Level chips shown in the action panel — one chip per level/item, click = immediate switch. */
  private buildLevelChips(
    levels: Array<{ id: string; label: string; price: number; starsRequired: number }>,
    equippedId: string | null,
    accentColor: number,
    onSwitch: (id: string) => void,
  ): void {
    const count = levels.length;
    const chipW = Math.floor(SHOP_ITEM_W / count);
    const chipH = 32;
    const chipCY = SHOP_ACTION_Y + 20;

    levels.forEach((lv, i) => {
      const isCurrent = equippedId === lv.id;
      const locked = lv.starsRequired > this.shopPlayerStars;
      const curPrice = equippedId !== null
        ? (ITEMS[equippedId]?.price ?? REAR_WEAPON_ITEMS[equippedId]?.price ?? SHIPS[equippedId]?.price ?? 0) : 0;
      const cost = lv.price - curPrice;
      const isRefund = cost < 0;
      const canAfford = isCurrent || isRefund || (!locked && this.save.coins >= cost);
      const chipX = SHOP_ITEM_X + i * chipW + chipW / 2;

      const chip = this.add.rectangle(px(chipX), px(chipCY), px(chipW - 4), px(chipH),
        isCurrent ? 0x0c1a2e : 0x0e0e1e).setOrigin(0.5);
      if (isCurrent) chip.setStrokeStyle(px(1), accentColor, 0.8);
      if (!isCurrent) {
        if (locked || !canAfford) { chip.setAlpha(0.35); }
        else {
          chip.setInteractive({ useHandCursor: true });
          chip.on('pointerdown', () => { onSwitch(lv.id); });
          chip.on('pointerover', () => { chip.setFillStyle(0x151530); });
          chip.on('pointerout', () => { chip.setFillStyle(0x0e0e1e); });
        }
      }
      this.addC(chip);

      this.addC(this.add.text(px(chipX), px(chipCY - 7), lv.label, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(9))}px`,
        color: cssColor(locked ? 0x444466 : isCurrent ? accentColor : (canAfford ? PALETTE.hullWhite : 0x444466)),
      }).setOrigin(0.5));

      let subText = '';
      let subColor = 0x556677;
      if (locked) {
        subText = `★${String(lv.starsRequired)}`; subColor = 0x445566;
      } else if (isCurrent) {
        subText = '▶'; subColor = accentColor;
      } else if (isRefund) {
        subText = `+${String(-cost)}⬤`; subColor = PALETTE.shieldBlue;
      } else if (cost === 0) {
        subText = 'FREE'; subColor = PALETTE.shieldBlue;
      } else {
        subText = `${String(cost)}⬤`;
        subColor = canAfford ? PALETTE.generatorAmber : 0x445566;
      }
      this.addC(this.add.text(px(chipX), px(chipCY + 8), subText, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(8))}px`, color: cssColor(subColor),
      }).setOrigin(0.5));
    });
  }

  /** Renders a "— NONE" row at the given slot index. */
  private buildNoneRow(
    index: number,
    isSelected: boolean,
    isCurrentlyNone: boolean,
    accentColor: number,
    onClick: () => void,
  ): void {
    const highlighted = isSelected || isCurrentlyNone;
    const y = px(CONTENT_TOP + 22 + index * SHOP_ROW_H + SHOP_ROW_H / 2);
    const rowBg = this.add.rectangle(px(SHOP_ITEM_X), y, px(SHOP_ITEM_W), px(SHOP_ROW_H - 4), highlighted ? 0x16162c : 0x0a0a18)
      .setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
    rowBg.on('pointerdown', onClick);
    rowBg.on('pointerover', () => { rowBg.setFillStyle(highlighted ? 0x1c1c38 : 0x12122a); });
    rowBg.on('pointerout', () => { rowBg.setFillStyle(highlighted ? 0x16162c : 0x0a0a18); });
    this.addC(rowBg);
    this.addC(this.add.text(px(SHOP_ITEM_X + 8), y, '— NONE', {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(14))}px`,
      color: cssColor(isCurrentlyNone ? accentColor : 0x555577),
    }).setOrigin(0, 0.5));
  }



  private equippedLevelForShipKind(kind: ShipKind): number {
    const equippedId = this.save.equipped.ship;
    if (!equippedId.startsWith(`ship-${kind}-`)) return 0;
    return parseInt(equippedId.split('-').pop() ?? '0', 10);
  }

  private ownedLevelForShipKind(kind: ShipKind): number {
    for (let lv = MAX_SHIP_LEVEL; lv >= 1; lv--) {
      if (isOwned(this.save, `ship-${kind}-${String(lv)}`)) return lv;
    }
    return 0;
  }

  private buildShipRows(): void {
    const equippedKind = shipById(this.save.equipped.ship).kind as ShipKind;
    if (this.shopSelectedShipKind === null) this.shopSelectedShipKind = equippedKind;
    SHIP_KINDS.forEach((kind, index) => { this.buildShipKindRow(kind, index); });
    this.buildShipLevelChips();
  }

  private buildShipKindRow(kind: ShipKind, index: number): void {
    const lv1 = SHIPS[`ship-${kind}-1`];
    if (lv1 === undefined) return;
    const starsNeeded = lv1.starsRequired ?? 0;
    const locked = starsNeeded > this.shopPlayerStars;
    const equippedLevel = this.equippedLevelForShipKind(kind);
    const equippedThisKind = equippedLevel > 0;
    const ownedLevel = this.ownedLevelForShipKind(kind);
    const selected = this.shopSelectedShipKind === kind;
    const entryPrice = lv1.price;
    const canAfford = equippedThisKind || ownedLevel > 0 || this.save.coins >= entryPrice;
    const y = px(CONTENT_TOP + 22 + index * SHOP_ROW_H + SHOP_ROW_H / 2);

    this.addKindRowBg(y, selected, locked, !locked && canAfford, () => {
      if (!equippedThisKind) {
        const targetLv = ownedLevel > 0 ? ownedLevel : 1;
        this.save = switchShip(this.save, `ship-${kind}-${String(targetLv)}`);
      }
      this.shopSelectedShipKind = kind;
      this.rebuildContent(); this.updatePreview();
    });
    this.addC(this.add.image(px(SHOP_ITEM_X + SHOP_ICON_X_OFFSET), y, iconTextureForShipKind(kind))
      .setOrigin(0.5).setBlendMode(Phaser.BlendModes.ADD).setScale(0.6)
      .setAlpha(locked ? 0.15 : (canAfford ? ((equippedThisKind || ownedLevel > 0) ? 1 : 0.5) : 0.2)));
    const displayName = kind.charAt(0).toUpperCase() + kind.slice(1);
    this.addC(this.add.text(px(SHOP_ITEM_X + SHOP_NAME_X_OFFSET), y, displayName, {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(14))}px`,
      color: cssColor(locked ? 0x555577 : (equippedThisKind ? SHIP_TAB_COLOR : PALETTE.hullWhite)),
    }).setOrigin(0, 0.5).setAlpha(locked ? 0.5 : (canAfford ? 1 : 0.4)));
    const equippedShipPrice = SHIPS[this.save.equipped.ship]?.price ?? 0;
    this.addKindBadge(y, { locked, starsNeeded, entryPrice, equippedPrice: equippedShipPrice, show: !equippedThisKind && ownedLevel === 0, canAfford });
  }

  private buildShipLevelChips(): void {
    const kind = this.shopSelectedShipKind;
    if (kind === null) {
      this.addC(addLabel(this, { x: px(SHOP_ITEM_X), y: px(SHOP_ACTION_Y + 28), text: 'Tap a ship type.', color: 0x666688, size: 13 }));
      return;
    }
    const equippedId = this.save.equipped.ship;
    const levels = Array.from({ length: MAX_SHIP_LEVEL }, (_, i) => {
      const id = `ship-${kind}-${String(i + 1)}`;
      const ship = SHIPS[id];
      return { id, label: `Lv${String(i + 1)}`, price: ship?.price ?? 0, starsRequired: ship?.starsRequired ?? 0 };
    });
    this.buildLevelChips(levels, equippedId, SHIP_TAB_COLOR, (id) => {
      this.save = switchShip(this.save, id);
      this.rebuildContent();
      this.updatePreview();
    });
    const equippedLevel = this.equippedLevelForShipKind(kind);
    if (equippedLevel > 0) {
      const ship = SHIPS[equippedId];
      if (ship !== undefined) {
        this.addC(this.add.text(px(SHOP_ITEM_X), px(SHOP_ACTION_Y + 54), `♥${String(ship.hull)}  ${ship.passiveDescription}`, {
          fontFamily: UI_FONT, fontSize: `${String(fontPx(11))}px`,
          color: cssColor(SHIP_TAB_COLOR), wordWrap: { width: px(SHOP_ITEM_W) },
        }));
      }
    }
  }

  private buildLoadoutRows(): void {
    const eq = this.save.equipped;
    const weaponItem = eq.weapon !== null ? itemById(eq.weapon) : null;
    const shieldItem = eq.shield !== null ? itemById(eq.shield) : null;
    const genItem = itemById(eq.generator);
    const motorItem = itemById(eq.motor);
    const shipSpec = shipById(eq.ship);

    const rearId = eq.rearWeapon;
    const rearItem = rearId !== null ? REAR_WEAPON_ITEMS[rearId] : undefined;
    const rearName = rearItem !== undefined ? rearItem.name.replace(/\s+Lv\s*\d+$/, '') : 'None';
    const rearPrice = rearItem?.price ?? 0;

    const rows: Array<{ label: string; name: string; price: number; color: number; empty?: boolean }> = [
      { label: 'SHIP',         name: `${shipSpec.name} Lv${String(shipSpec.level)}`,                                   price: shipSpec.price,    color: SHIP_TAB_COLOR },
      { label: 'FRONT WEAPON', name: weaponItem !== null ? weaponItem.name.replace(/\s+Lv\s*\d+$/, '') : 'None',       price: weaponItem?.price ?? 0, color: PALETTE.weaponCyan,    empty: weaponItem === null },
      { label: 'REAR WEAPON',  name: rearName,                                                                         price: rearPrice,         color: PALETTE.weaponCyan,    empty: rearItem === undefined },
      { label: 'SHIELD',       name: shieldItem !== null ? shieldItem.name.replace(/\s+Lv\s*\d+$/, '') : 'None',       price: shieldItem?.price ?? 0, color: PALETTE.shieldBlue,   empty: shieldItem === null },
      { label: 'GENERATOR',    name: genItem.name.replace(/\s+Lv\s*\d+$/, ''),                                         price: genItem.price,     color: PALETTE.generatorAmber },
      { label: 'MOTOR',        name: motorItem.name.replace(/\s+Lv\s*\d+$/, ''),                                       price: motorItem.price,   color: PALETTE.motorMagenta },
    ];

    const totalInvested = rows.reduce((sum, r) => sum + r.price, 0);

    rows.forEach((row, i) => {
      const y = px(CONTENT_TOP + 22 + i * SHOP_ROW_H + SHOP_ROW_H / 2);
      this.addC(this.add.text(px(SHOP_ITEM_X + 4), y, row.label, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(9))}px`, color: cssColor(row.color),
      }).setOrigin(0, 0.5).setAlpha(0.65));
      this.addC(this.add.text(px(SHOP_ITEM_X + 122), y, row.name, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(13))}px`, color: cssColor(PALETTE.hullWhite),
      }).setOrigin(0, 0.5).setAlpha(row.empty === true ? 0.35 : 1));
      if (row.price > 0) {
        this.addC(this.add.text(px(SHOP_ITEM_X + SHOP_ITEM_W - 4), y, `${String(row.price)}⬤`, {
          fontFamily: UI_FONT, fontSize: `${String(fontPx(12))}px`, color: cssColor(PALETTE.generatorAmber),
        }).setOrigin(1, 0.5).setAlpha(0.6));
      }
    });

    const totalLabel = totalInvested > 0 ? `TOTAL SHIP VALUE  ${String(totalInvested)}⬤` : 'TOTAL SHIP VALUE  FREE';
    this.addC(this.add.text(px(SHOP_ITEM_X + SHOP_ITEM_W - 4), px(SHOP_ACTION_Y + 24), totalLabel, {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(14))}px`, color: cssColor(PALETTE.generatorAmber),
    }).setOrigin(1, 0));
  }

  private buildWeaponRows(): void {
    const equippedW = this.save.equipped.weapon;
    if (this.shopSelectedWeaponKind === null && equippedW !== null) {
      const kind = equippedW.split('-')[0] as WeaponKind;
      if ((WEAPON_KINDS as readonly string[]).includes(kind)) this.shopSelectedWeaponKind = kind;
    }
    const isNone = equippedW === null;
    this.buildNoneRow(0, isNone, isNone, PALETTE.weaponCyan, () => {
      this.save = unequipWeapon(this.save);
      this.shopSelectedWeaponKind = null;
      this.rebuildContent();
      this.updatePreview();
    });
    WEAPON_KINDS.forEach((kind, index) => { this.buildWeaponRow(kind, index + 1); });
    this.buildWeaponLevelChips();
  }

  private buildWeaponRow(kind: WeaponKind, index: number): void {
    const starsNeeded = WEAPON_STARS[kind][0];
    const locked = starsNeeded > this.shopPlayerStars;
    const equippedLevel = this.equippedLevelForKind(kind);
    const ownedLevel = this.ownedLevelForKind(kind);
    const equippedThisKind = equippedLevel > 0;
    const ownedThisKind = ownedLevel > 0 && !equippedThisKind;
    const displayLevel = equippedLevel > 0 ? equippedLevel : ownedLevel;
    const selected = this.shopSelectedWeaponKind === kind;
    const y = px(CONTENT_TOP + 22 + index * SHOP_ROW_H + SHOP_ROW_H / 2);
    const iconId = displayLevel > 0 ? `${kind}-${String(displayLevel)}` : `${kind}-1`;
    const targetLevel = (equippedThisKind || ownedThisKind) ? displayLevel : this.bestAffordableLevelForKind(kind);
    const canAfford = equippedThisKind || ownedThisKind || targetLevel !== null;

    this.addKindRowBg(y, selected, locked, !locked && canAfford, () => {
      if (this.equippedLevelForKind(kind) === 0) {
        const ownedLv = this.ownedLevelForKind(kind);
        const targetLv = ownedLv > 0 ? ownedLv : (this.bestAffordableLevelForKind(kind) ?? 1);
        this.save = switchItem(this.save, `${kind}-${String(targetLv)}`);
      }
      this.shopSelectedWeaponKind = kind;
      this.rebuildContent(); this.updatePreview();
    });
    this.addC(this.add.image(px(SHOP_ITEM_X + SHOP_ICON_X_OFFSET), y, iconTextureForWeaponId(iconId))
      .setOrigin(0.5).setBlendMode(Phaser.BlendModes.ADD)
      .setScale(1.2 + Math.max(0, displayLevel - 1) * 0.07)
      .setAlpha(locked ? 0.15 : (canAfford ? ((equippedThisKind || ownedThisKind) ? 1 : 0.5) : 0.2)));
    this.addC(this.add.text(px(SHOP_ITEM_X + SHOP_NAME_X_OFFSET), y, weaponKindDisplayName(kind), {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(14))}px`,
      color: cssColor(locked ? 0x555577 : (equippedThisKind ? PALETTE.weaponCyan : PALETTE.hullWhite)),
    }).setOrigin(0, 0.5).setAlpha(locked ? 0.5 : (canAfford ? ((equippedThisKind || ownedThisKind) ? 1 : 0.6) : 0.25)));
    const equippedWeaponPrice = this.save.equipped.weapon !== null ? itemById(this.save.equipped.weapon).price : 0;
    const badgeEntryPrice = targetLevel !== null ? itemById(`${kind}-${String(targetLevel)}`).price : 0;
    this.addKindBadge(y, { locked, starsNeeded, entryPrice: badgeEntryPrice, equippedPrice: equippedWeaponPrice, show: !equippedThisKind && !ownedThisKind && targetLevel !== null, canAfford });
  }

  private buildWeaponLevelChips(): void {
    const kind = this.shopSelectedWeaponKind;
    if (kind === null) {
      this.addC(addLabel(this, { x: px(SHOP_ITEM_X), y: px(SHOP_ACTION_Y + 28), text: 'Tap a weapon type.', color: 0x666688, size: 13 }));
      return;
    }
    const equippedId = this.save.equipped.weapon;
    const levels = Array.from({ length: MAX_WEAPON_LEVEL }, (_, i) => {
      const id = `${kind}-${String(i + 1)}`;
      const item = itemById(id);
      return { id, label: `Lv${String(i + 1)}`, price: item.price, starsRequired: item.starsRequired ?? 0 };
    });
    this.buildLevelChips(levels, equippedId, PALETTE.weaponCyan, (id) => {
      this.save = switchItem(this.save, id);
      this.rebuildContent();
      this.updatePreview();
    });
    const equippedLevel = this.equippedLevelForKind(kind);
    if (equippedLevel > 0) {
      this.addWeaponStatBlock(kind, equippedLevel,
        { x: px(SHOP_ITEM_X), topY: px(SHOP_ACTION_Y + 54) }, px(SHOP_ITEM_W), true);
    }
  }

  private addWeaponStatBlock(
    kind: WeaponKind, level: number,
    pos: { x: number; topY: number },
    maxWidth: number, isCurrent: boolean,
  ): void {
    const spec = weaponSpecAtLevel(kind, level);
    const targets = spec.maxTargets === Infinity ? '∞' : String(spec.maxTargets);
    const color = isCurrent ? PALETTE.weaponCyan : PALETTE.generatorAmber;
    this.addC(this.add.text(pos.x, pos.topY, `${String(spec.damagePerShot)}dmg  ${String(spec.ticksBetweenShots)}t`, {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(11))}px`, color: cssColor(color), wordWrap: { width: maxWidth },
    }));
    this.addC(this.add.text(pos.x, pos.topY + px(14), `${targets} targets  ${String(spec.energyPerShot)} energy`, {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(11))}px`, color: cssColor(color), wordWrap: { width: maxWidth },
    }));
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
        color: PALETTE.hullWhite, size: 14,
      }));
      this.addC(addLabel(this, { x: px(SHOP_ITEM_X), y: px(y + 20), text: entry.spec.description, color: 0x8888aa, size: 12 }));

      if (owned > 0) {
        this.addC(addTextButton(this, {
          x: px(rightX - 112), y: px(y + 10),
          label: `-1  ${String(entry.pricePerCharge)}⬤`, color: PALETTE.enemyOrange, size: 13,
          onClick: () => { this.save = sellSupplyCharge(this.save, supplyId); this.rebuildContent(); },
        }));
      }
      if (!atMax) {
        const buyBtn = addTextButton(this, {
          x: px(rightX - 28), y: px(y + 10),
          label: `+1  ${String(entry.pricePerCharge)}⬤`, color: PALETTE.generatorAmber, size: 13,
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
    this.addC(addLabel(this, { x: px(SHOP_ITEM_X), y: px(SHOP_ACTION_Y + 28), text: 'Charges refill free before every mission.', color: 0x8888aa, size: 13 }));
  }

  private equippedLevelForKind(kind: WeaponKind): number {
    const weapon = this.save.equipped.weapon;
    if (weapon === null || !weapon.startsWith(`${kind}-`)) return 0;
    const parts = weapon.split('-');
    const level = parseInt(parts[parts.length - 1] ?? '0', 10);
    return isNaN(level) ? 0 : level;
  }

  /** Returns the highest level of `kind` in `ownedItems`, 0 if none owned. */
  private ownedLevelForKind(kind: WeaponKind): number {
    for (let lv = MAX_WEAPON_LEVEL; lv >= 1; lv--) {
      if (isOwned(this.save, `${kind}-${String(lv)}`)) return lv;
    }
    return 0;
  }

  // Returns the highest level of `kind` the player can afford AND has stars for when
  // switching from the current weapon, capped at the currently equipped level. null = none accessible.
  private bestAffordableLevelForKind(kind: WeaponKind): number | null {
    const weapon = this.save.equipped.weapon;
    const currentPrice = weapon !== null ? itemById(weapon).price : 0;
    const parts = weapon !== null ? weapon.split('-') : [];
    const currentLevel = parseInt(parts[parts.length - 1] ?? '1', 10) || 1;
    for (let lv = currentLevel; lv >= 1; lv--) {
      if ((WEAPON_STARS[kind][lv - 1] ?? 0) > this.shopPlayerStars) continue;
      const netCost = itemById(`${kind}-${String(lv)}`).price - currentPrice;
      if (netCost <= 0 || this.save.coins >= netCost) return lv;
    }
    return null;
  }

  private prospectiveLoadout(current: LoadoutSnapshot): LoadoutSnapshot | null {
    if (this.shopTab === 'ship') return this.prospectiveShipLoadout(current);
    if (this.shopTab === 'weapon') return this.prospectiveWeaponLoadout(current);
    if (this.shopTab === 'rear-weapon') return this.prospectiveRearWeaponLoadout(current);
    if (this.shopTab === 'shield') return this.prospectiveShieldLoadout(current);
    if (this.shopTab === 'generator') return this.prospectiveGeneratorLoadout(current);
    if (this.shopTab === 'motor') return this.prospectiveMotorLoadout(current);
    return null;
  }

  private prospectiveRearWeaponLoadout(current: LoadoutSnapshot): LoadoutSnapshot | null {
    if (this.shopSelectedRearWeaponKind === null) return null;
    const kind = this.shopSelectedRearWeaponKind;
    const equippedId = this.save.equipped.rearWeapon;
    const equippedLevel = equippedId !== null && equippedId.startsWith(`${kind}-`)
      ? (parseInt(equippedId.split('-')[1] ?? '0', 10) || 0) : 0;
    const ownedLevel = this.ownedRearWeaponLevelForKind(kind);
    const previewLevel = equippedLevel > 0 ? equippedLevel : ownedLevel > 0 ? ownedLevel : 1;
    const spec = rearWeaponSpecAtLevel(kind, previewLevel);
    if (current.rearWeapon?.id === spec.id) return null;
    return { ...current, rearWeapon: spec };
  }

  private prospectiveShipLoadout(current: LoadoutSnapshot): LoadoutSnapshot | null {
    const kind = this.shopSelectedShipKind;
    if (kind === null) return null;
    const equippedLevel = this.equippedLevelForShipKind(kind);
    const previewLevel = equippedLevel > 0 ? equippedLevel : 1;
    const previewId = `ship-${kind}-${String(previewLevel)}`;
    if (this.save.equipped.ship === previewId) return null;
    return { ...current, ship: shipById(previewId) };
  }

  private prospectiveWeaponLoadout(current: LoadoutSnapshot): LoadoutSnapshot | null {
    if (this.shopSelectedWeaponKind === null) return null;
    const kind = this.shopSelectedWeaponKind;
    const equippedLevel = this.equippedLevelForKind(kind);
    const previewLevel = equippedLevel > 0 ? equippedLevel : 1;
    const spec = weaponSpecAtLevel(kind, previewLevel);
    if (current.weapon?.id === spec.id) return null;
    return { ...current, weapon: spec };
  }

  private prospectiveShieldLoadout(current: LoadoutSnapshot): LoadoutSnapshot | null {
    const kind = this.shopSelectedShieldKind;
    if (kind === null) return null;
    const equippedLevel = this.equippedLevelForShieldKind(kind);
    const previewLevel = equippedLevel > 0 ? equippedLevel : 1;
    const spec = shieldSpecAtLevel(kind, previewLevel);
    if (this.save.equipped.shield === spec.id) return null;
    return { ...current, shield: spec };
  }

  private prospectiveGeneratorLoadout(current: LoadoutSnapshot): LoadoutSnapshot | null {
    const kind = this.shopSelectedGeneratorKind;
    if (kind === null) return null;
    const equippedLevel = this.equippedLevelForGeneratorKind(kind);
    const previewLevel = equippedLevel > 0 ? equippedLevel : 1;
    const spec = generatorSpecAtLevel(kind, previewLevel);
    if (this.save.equipped.generator === spec.id) return null;
    return { ...current, generator: spec };
  }

  private prospectiveMotorLoadout(current: LoadoutSnapshot): LoadoutSnapshot | null {
    const kind = this.shopSelectedMotorKind;
    if (kind === null) return null;
    const equippedLevel = this.equippedLevelForMotorKind(kind);
    const previewLevel = equippedLevel > 0 ? equippedLevel : 1;
    const spec = motorSpecAtLevel(kind, previewLevel);
    if (this.save.equipped.motor === spec.id) return null;
    return { ...current, motor: spec };
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
    const devLabel = (): string => `DEV MODE  ${this.save.devMode === false ? 'OFF' : 'ON'}`;

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

    const devOn = this.save.devMode !== false;
    const devBtn = addTextButton(this, {
      x: baseX, y: px(CONTENT_TOP + 140), label: devLabel(),
      color: devOn ? PALETTE.generatorAmber : 0x666688, size: 14,
      onClick: () => {
        this.save = { ...this.save, devMode: this.save.devMode !== false ? false : true };
        persistSave(this.save);
        this.scene.restart();
      },
    });
    devBtn.setOrigin(0, 0.5);
    this.addC(devBtn);

    const resetY = devOn ? CONTENT_TOP + 296 : CONTENT_TOP + 192;
    let resetPending = false;
    const resetLabel = (): string => resetPending ? '▸ CONFIRM RESET' : 'RESET PROGRESS';
    const resetColor = (): number => resetPending ? 0xff4444 : 0x664444;
    const resetBtn = addTextButton(this, {
      x: baseX, y: px(resetY), label: resetLabel(), color: resetColor(), size: 14,
      onClick: () => {
        if (!resetPending) {
          resetPending = true;
          resetBtn.setText(resetLabel());
          resetBtn.setStyle({ color: cssColor(resetColor()) });
        } else {
          resetSave();
          window.location.reload();
        }
      },
    });
    resetBtn.setOrigin(0, 0.5);
    this.addC(resetBtn);

    // Right column: About
    const rightColX = Math.round(LOGICAL_WIDTH / 2) + 20;
    const rightColW = LOGICAL_WIDTH - rightColX - CONTENT_PAD;
    this.addC(this.add.rectangle(px(Math.round(LOGICAL_WIDTH / 2)), px(CONTENT_TOP), px(1), px(LOGICAL_HEIGHT - CONTENT_TOP), 0x222244).setOrigin(0, 0));
    this.addC(addLabel(this, { x: px(rightColX), y: px(CONTENT_TOP + 8), text: 'ABOUT', color: PALETTE.shieldBlue, size: 11 }));
    this.addC(this.add.text(px(rightColX), px(CONTENT_TOP + 26), ABOUT_TEXT, {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(10))}px`,
      color: cssColor(0x8888aa), lineSpacing: px(3),
      wordWrap: { width: px(rightColW) },
    }));

    if (devOn) {
      const coinsBtn = addTextButton(this, {
        x: baseX, y: px(CONTENT_TOP + 192), label: 'ADD 999999 COINS',
        color: PALETTE.generatorAmber, size: 14,
        onClick: () => {
          this.save = { ...this.save, coins: this.save.coins + 999999 };
          persistSave(this.save);
          this.scene.restart();
        },
      });
      coinsBtn.setOrigin(0, 0.5);
      this.addC(coinsBtn);

      const starsBtn = addTextButton(this, {
        x: baseX, y: px(CONTENT_TOP + 244), label: 'UNLOCK ALL STARS',
        color: PALETTE.generatorAmber, size: 14,
        onClick: () => {
          const allStars: Record<string, string[]> = {};
          for (const mission of ALL_MISSIONS) {
            if (mission.stars.length > 0) {
              allStars[mission.id] = mission.stars.map((s) => s.id);
            }
          }
          this.save = { ...this.save, missionStars: allStars };
          persistSave(this.save);
          this.scene.restart();
        },
      });
      starsBtn.setOrigin(0, 0.5);
      this.addC(starsBtn);
    }
  }

}

function starDescription(star: StarSpec): string {
  const DESCRIPTIONS: Record<StarFamily, (threshold: number) => string> = {
    'finish-time':     (t) => `Finish in ${String(Math.round(t / TICKS_PER_SECOND))}s`,
    'hull-above':      (t) => `Finish hull > ${String(Math.round(t * 100))}%`,
    'all-kills':       () => 'No enemy reaches your ship',
    'shield-unbroken': () => 'Shield never breaks',
    'boss-time':       (t) => `Boss in ${String(Math.round(t / TICKS_PER_SECOND))}s`,
  };
  return DESCRIPTIONS[star.family](star.threshold);
}
