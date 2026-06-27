import Phaser from 'phaser';
import { TICKS_PER_SECOND } from '../core/constants';
import type { LoadoutSnapshot, MissionSpec, StarFamily, StarSpec, WeaponKind } from '../core/types';
import { ALL_MISSIONS, totalStarsAvailable } from '../data/missions';
import {
  ITEMS, SHIPS, SUPPLIES, WEAPON_KINDS, MAX_WEAPON_LEVEL, WEAPON_STARS,
  itemById, shipById, weaponKindDisplayName, weaponSpecAtLevel,
} from '../data/items';
import type { CatalogItem, SystemKind } from '../data/items';
import {
  buildLoadout, buySupplyCharge, isMissionUnlocked, isOwned, loadSave,
  persistSave, sellSupplyCharge, switchItem, switchShip, totalStars,
} from '../save/SaveManager';
import type { SaveData } from '../save/SaveManager';
import { cssColor, PALETTE } from './palette';
import { fontPx, HUB_LEFT_W, LOGICAL_HEIGHT, LOGICAL_WIDTH, px } from './layout';
import { ShopPreviewPanel } from './ShopPreviewPanel';
import type { PreviewLayout } from './ShopPreviewPanel';
import { buildGameTextures, iconTextureForWeaponId } from './textures';
import { addLabel, addTextButton, drawDevBorder, UI_FONT } from './widgets';
import { Sound } from '../audio/SoundManager';

const SHIP_TAB_COLOR = 0x44ffaa;

const SYSTEM_COMPANY: Record<SystemKind, { name: string; color: number }> = {
  weapon:    { name: 'NEXUS ARMAMENTS', color: PALETTE.weaponCyan },
  shield:    { name: 'AEGIS DEFENSE',   color: PALETTE.shieldBlue },
  generator: { name: 'QUANTUM POWER',   color: PALETTE.generatorAmber },
  motor:     { name: 'COMET DRIVE',     color: PALETTE.motorMagenta },
};

type NavItem = 'missions' | 'shop' | 'settings' | 'about' | 'manual';
type ShopTab = SystemKind | 'supplies' | 'ship';

const NAV_Y = 22;
const CONTENT_TOP = 48;
const CONTENT_PAD = 10;
const INFO_PANEL_TOP = 378;
const INFO_PANEL_H = 152;
const SHOP_TAB_W = 82;
const SHOP_ITEM_X = SHOP_TAB_W + 4;
const SHOP_ITEM_W = HUB_LEFT_W - SHOP_ITEM_X - 4;
const SHOP_ROW_H = 40;
const SHOP_ACTION_Y = 432;
const CONTENT_MID = Math.round(HUB_LEFT_W / 2 + SHOP_TAB_W / 2);

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
  { key: 'missions', label: 'EXPLORE NEARBY SPACE', color: PALETTE.weaponCyan },
  { key: 'shop',     label: 'SHIP CONFIGURATION',  color: PALETTE.motorMagenta },
  { key: 'settings', label: 'SETTINGS', color: PALETTE.hullWhite },
  { key: 'about',    label: 'ABOUT',    color: PALETTE.shieldBlue },
  { key: 'manual',   label: 'MANUAL',   color: PALETTE.generatorAmber },
];

const SHOP_TABS: { key: ShopTab; label: string; color: number }[] = [
  { key: 'ship',      label: 'SHIP',      color: SHIP_TAB_COLOR },
  { key: 'weapon',    label: 'WEAPON',    color: PALETTE.weaponCyan },
  { key: 'shield',    label: 'SHIELD',    color: PALETTE.shieldBlue },
  { key: 'generator', label: 'GENERATOR', color: PALETTE.generatorAmber },
  { key: 'motor',     label: 'MOTOR',     color: PALETTE.motorMagenta },
  { key: 'supplies',  label: 'SUPPLIES',  color: PALETTE.hullWhite },
];

// Portrait: preview panel sits below the shop action area (y ≥ 540)
const HUB_PREVIEW_LAYOUT: PreviewLayout = {
  shipX: 430, shipY: 598,
  barsLeftX: 300, barsTopY: 652, barWidth: 210,
  dpsX: 430, dpsY: 720,
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
  'When full, it pulses: shield gains energy,',
  'generator drops to ~50%. Repeats.',
  '',
  'WEAPONS & ENERGY',
  'Every shot costs energy. Running low',
  'slows fire rate (brownout).',
  '',
  'SUPPORT COMPANIES',
  'Mid-mission: a ship offers 3 ability cards.',
  'Weapons → Nexus Armaments (damage/fire).',
  'Shields → Aegis Defense (hull/shield).',
  'Generators → Quantum Power (energy).',
  'Motors → Comet Drive (speed/burst).',
  'Pick passives (instant boost) or actives',
  '(stored in ability bar, costs energy).',
  '',
  'SHOP',
  'Equip items; live preview shows impact.',
  'Supplies refill free before every mission.',
  '',
  'MISSIONS & STARS',
  'Tutorials use a preset loadout.',
  'Combat missions award up to 3 stars.',
  'Stars unlock harder missions.',
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
  private shopPlayerStars = 0;

  constructor() { super('HubScene'); }

  // fallow-ignore-next-line unused-class-member
  create(): void {
    this.save = loadSave();

    // First-time player: send to welcome mission before the hub is shown
    if (!this.save.w0Completed) {
      this.scene.start('CombatScene', { missionId: 'w0' });
      return;
    }

    this.nav = null;
    this.selectedMissionId = null;
    this.shopTab = 'weapon';
    this.shopSelectedItemId = null;
    this.shopSelectedWeaponKind = null;
    this.contentObjects = [];
    this.scrollingStars = [];

    buildGameTextures(this);
    Sound.attach(this.sound);
    Sound.startMusic();
    this.addStarfield();
    drawDevBorder(this, this.save);

    this.add.rectangle(0, px(CONTENT_TOP - 4), px(LOGICAL_WIDTH), px(1), 0x222244).setOrigin(0, 0).setDepth(1);

    this.preview = new ShopPreviewPanel(this, HUB_PREVIEW_LAYOUT);

    // Post-w0 first load: open the section the player chose
    const isFirstLoad = this.save.firstBranchChoice !== undefined && totalStars(this.save) === 0;
    if (isFirstLoad) {
      this.setNav('missions');
    } else {
      this.setNav(null);
    }
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

  private get contentW(): number { return this.nav === 'shop' ? HUB_LEFT_W : LOGICAL_WIDTH; }

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
    }

    switch (this.nav) {
      case null:       this.buildMainMenu(); break;
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

  private buildMainMenu(): void {
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
        this.rebuildContent();
        this.updatePreview();
      });
      this.addC(
        this.add.text(px(SHOP_TAB_W / 2), px(tabY), tab.label, {
          fontFamily: UI_FONT,
          fontSize: `${String(fontPx(8))}px`,
          color: cssColor(active ? tab.color : 0x555577),
        }).setOrigin(0.5).setAlpha(active ? 1 : 0.5),
      );
    });

    this.addC(this.add.rectangle(px(SHOP_TAB_W), px(CONTENT_TOP), px(1), px(LOGICAL_HEIGHT - CONTENT_TOP), 0x333355).setOrigin(0, 0));
    this.addC(this.add.rectangle(px(SHOP_ITEM_X), px(SHOP_ACTION_Y), px(SHOP_ITEM_W), px(1), 0x222244).setOrigin(0, 0));
    this.addC(addLabel(this, { x: px(SHOP_ITEM_X), y: px(CONTENT_TOP + 2), text: `⬤ ${String(this.save.coins)}`, color: PALETTE.generatorAmber, size: 10 }));

    if (this.shopTab === 'ship') {
      this.buildShipRows();
    } else if (this.shopTab === 'supplies') {
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
    const starsNeeded = item.starsRequired ?? 0;
    const locked = starsNeeded > this.shopPlayerStars;
    const requiresParentId = item.requires;
    const requiresGated = requiresParentId !== undefined && !isOwned(this.save, requiresParentId);
    const equipped = this.save.equipped[system] === itemId;
    const owned = !equipped && isOwned(this.save, itemId);
    const selected = this.shopSelectedItemId === itemId;
    const cost = owned ? 0 : Math.max(0, item.price - itemById(this.save.equipped[system]).price);
    const canAfford = equipped || owned || this.save.coins >= cost;
    const y = px(yLogical + SHOP_ROW_H / 2);

    const rowBg = this.add.rectangle(px(SHOP_ITEM_X), y, px(SHOP_ITEM_W), px(SHOP_ROW_H - 4), selected ? 0x16162c : 0x0a0a18)
      .setOrigin(0, 0.5);
    if (!locked && !requiresGated) {
      rowBg.setInteractive({ useHandCursor: true });
      rowBg.on('pointerdown', () => { this.shopSelectedItemId = itemId; this.rebuildContent(); this.updatePreview(); });
      rowBg.on('pointerover', () => { rowBg.setFillStyle(selected ? 0x1c1c38 : 0x12122a); });
      rowBg.on('pointerout', () => { rowBg.setFillStyle(selected ? 0x16162c : 0x0a0a18); });
    }
    if (locked || requiresGated || (!equipped && !owned && !canAfford)) rowBg.setAlpha(0.35);
    this.addC(rowBg);

    const isBranch = item.requires !== undefined;
    const nameX = SHOP_ITEM_X + (isBranch ? 18 : 8);
    if (isBranch) {
      this.addC(this.add.text(px(SHOP_ITEM_X + 4), y, '⤷', {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(10))}px`, color: cssColor(0x444466),
      }).setOrigin(0, 0.5));
    }
    this.addC(this.add.text(px(nameX), y, item.name, {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(12))}px`,
      color: cssColor(locked || requiresGated ? 0x555577 : (equipped ? PALETTE.weaponCyan : PALETTE.hullWhite)),
    }).setOrigin(0, 0.5).setAlpha(locked || requiresGated ? 0.5 : (canAfford ? 1 : 0.4)));

    let statusText: string;
    let statusColor: number;
    if (locked) {
      statusText = `★${String(starsNeeded)}`; statusColor = 0x556677;
    } else if (requiresGated) {
      statusText = `Need ${itemById(requiresParentId).name}`; statusColor = 0x556677;
    } else if (equipped) {
      statusText = 'EQUIPPED'; statusColor = PALETTE.weaponCyan;
    } else if (owned) {
      statusText = 'OWNED'; statusColor = PALETTE.shieldBlue;
    } else if (cost === 0) {
      statusText = 'FREE'; statusColor = PALETTE.shieldBlue;
    } else {
      statusText = `${String(cost)}⬤`; statusColor = canAfford ? PALETTE.generatorAmber : 0x556677;
    }
    this.addC(this.add.text(px(SHOP_ITEM_X + SHOP_ITEM_W - 4), y, statusText, {
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
    const equipped = this.save.equipped[system] === itemId;

    this.addC(this.add.text(px(SHOP_ITEM_X), px(SHOP_ACTION_Y + 8), item.blurb, {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(10))}px`,
      color: cssColor(0x8888aa), wordWrap: { width: px(SHOP_ITEM_W) },
    }));
    const company = SYSTEM_COMPANY[system];
    this.addC(this.add.text(px(SHOP_ITEM_X), px(SHOP_ACTION_Y + 46), `⬡ ${company.name}`, {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(9))}px`,
      color: cssColor(company.color),
    }).setAlpha(0.7));

    const btnY = px(SHOP_ACTION_Y + 68);
    if (equipped) {
      this.addC(addLabel(this, { x: px(SHOP_ITEM_X), y: btnY, text: 'EQUIPPED', color: PALETTE.weaponCyan, size: 12 }));
      return;
    }
    const requiresParentId = item.requires;
    if (requiresParentId !== undefined && !isOwned(this.save, requiresParentId)) {
      this.addC(addLabel(this, { x: px(SHOP_ITEM_X), y: btnY, text: `Need "${itemById(requiresParentId).name}" first`, color: 0x556677, size: 11 }));
      return;
    }
    const owned = isOwned(this.save, itemId);
    const cost = owned ? 0 : Math.max(0, item.price - itemById(this.save.equipped[system]).price);
    const doSwitch = (): void => { this.save = switchItem(this.save, itemId); this.rebuildContent(); this.updatePreview(); };
    if (owned || cost === 0) {
      this.addC(addTextButton(this, {
        x: px(CONTENT_MID), y: btnY,
        label: owned ? 'EQUIP FREE' : 'BUY FREE',
        color: PALETTE.shieldBlue,
        onClick: doSwitch,
      }));
    } else if (this.save.coins >= cost) {
      this.addC(addTextButton(this, {
        x: px(CONTENT_MID), y: btnY, label: `BUY & EQUIP  ${String(cost)}⬤`, color: PALETTE.generatorAmber,
        onClick: doSwitch,
      }));
    } else {
      this.addC(addLabel(this, { x: px(SHOP_ITEM_X), y: btnY, text: `Need ${String(cost - this.save.coins)}⬤ more`, color: PALETTE.enemyOrange, size: 12 }));
    }
  }

  private buildShipRows(): void {
    Object.entries(SHIPS).forEach(([shipId, ship], index) => {
      const starsNeeded = ship.starsRequired ?? 0;
      const locked = starsNeeded > this.shopPlayerStars;
      const equipped = this.save.equipped.ship === shipId;
      const owned = !equipped && isOwned(this.save, shipId);
      const selected = this.shopSelectedItemId === shipId;
      const cost = owned ? 0 : Math.max(0, ship.price - shipById(this.save.equipped.ship).price);
      const canAfford = equipped || owned || this.save.coins >= cost;
      const y = px(CONTENT_TOP + 22 + index * SHOP_ROW_H + SHOP_ROW_H / 2);

      const rowBg = this.add.rectangle(px(SHOP_ITEM_X), y, px(SHOP_ITEM_W), px(SHOP_ROW_H - 4), selected ? 0x16162c : 0x0a0a18)
        .setOrigin(0, 0.5);
      if (!locked) {
        rowBg.setInteractive({ useHandCursor: true });
        rowBg.on('pointerdown', () => { this.shopSelectedItemId = shipId; this.rebuildContent(); this.updatePreview(); });
        rowBg.on('pointerover', () => { rowBg.setFillStyle(selected ? 0x1c1c38 : 0x12122a); });
        rowBg.on('pointerout', () => { rowBg.setFillStyle(selected ? 0x16162c : 0x0a0a18); });
      }
      if (locked || (!equipped && !owned && !canAfford)) rowBg.setAlpha(0.35);
      this.addC(rowBg);

      this.addC(this.add.text(px(SHOP_ITEM_X + 8), y, ship.name, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(12))}px`,
        color: cssColor(locked ? 0x555577 : (equipped ? SHIP_TAB_COLOR : PALETTE.hullWhite)),
      }).setOrigin(0, 0.5).setAlpha(locked ? 0.5 : (canAfford ? 1 : 0.4)));

      this.addC(this.add.text(px(SHOP_ITEM_X + 76), y, `♥${String(ship.hull)}`, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(10))}px`, color: cssColor(0x888899),
      }).setOrigin(0, 0.5).setAlpha(locked ? 0.3 : (canAfford ? 1 : 0.4)));

      let statusText: string;
      let statusColor: number;
      if (locked) {
        statusText = `★${String(starsNeeded)}`; statusColor = 0x556677;
      } else if (equipped) {
        statusText = 'EQUIPPED'; statusColor = SHIP_TAB_COLOR;
      } else if (owned) {
        statusText = 'OWNED'; statusColor = PALETTE.shieldBlue;
      } else if (cost === 0) {
        statusText = 'FREE'; statusColor = PALETTE.shieldBlue;
      } else {
        statusText = `${String(cost)}⬤`; statusColor = canAfford ? PALETTE.generatorAmber : 0x556677;
      }
      this.addC(this.add.text(px(SHOP_ITEM_X + SHOP_ITEM_W - 4), y, statusText, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(10))}px`, color: cssColor(statusColor),
      }).setOrigin(1, 0.5));
    });
    this.buildShipActions();
  }

  private buildShipActions(): void {
    if (this.shopSelectedItemId === null || SHIPS[this.shopSelectedItemId] === undefined) {
      this.addC(addLabel(this, { x: px(SHOP_ITEM_X), y: px(SHOP_ACTION_Y + 28), text: 'Tap a ship to see details.', color: 0x666688, size: 11 }));
      return;
    }
    const shipId = this.shopSelectedItemId;
    const ship = shipById(shipId);
    const equipped = this.save.equipped.ship === shipId;

    this.addC(this.add.text(px(SHOP_ITEM_X), px(SHOP_ACTION_Y + 8), ship.passiveDescription, {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(10))}px`,
      color: cssColor(0x8888aa), wordWrap: { width: px(SHOP_ITEM_W) },
    }));

    const btnY = px(SHOP_ACTION_Y + 68);
    if (equipped) {
      this.addC(addLabel(this, { x: px(SHOP_ITEM_X), y: btnY, text: 'EQUIPPED', color: SHIP_TAB_COLOR, size: 12 }));
      return;
    }
    const owned = isOwned(this.save, shipId);
    const cost = owned ? 0 : Math.max(0, ship.price - shipById(this.save.equipped.ship).price);
    const doSwitch = (): void => { this.save = switchShip(this.save, shipId); this.rebuildContent(); this.updatePreview(); };
    if (owned || cost === 0) {
      this.addC(addTextButton(this, {
        x: px(CONTENT_MID), y: btnY,
        label: owned ? 'EQUIP FREE' : 'BUY FREE',
        color: PALETTE.shieldBlue,
        onClick: doSwitch,
      }));
    } else if (this.save.coins >= cost) {
      this.addC(addTextButton(this, {
        x: px(CONTENT_MID), y: btnY, label: `BUY & EQUIP  ${String(cost)}⬤`, color: PALETTE.generatorAmber,
        onClick: doSwitch,
      }));
    } else {
      this.addC(addLabel(this, { x: px(SHOP_ITEM_X), y: btnY, text: `Need ${String(cost - this.save.coins)}⬤ more`, color: PALETTE.enemyOrange, size: 12 }));
    }
  }

  private buildWeaponRows(): void {
    WEAPON_KINDS.forEach((kind, index) => {
      const kindMinStars = WEAPON_STARS[kind][0];
      const kindLocked = kindMinStars > this.shopPlayerStars;
      const equippedLevel = this.equippedLevelForKind(kind);
      const ownedLevel = this.ownedLevelForKind(kind);
      const equippedThisKind = equippedLevel > 0;
      const ownedThisKind = ownedLevel > 0 && !equippedThisKind;
      const displayLevel = equippedLevel > 0 ? equippedLevel : ownedLevel;
      const selected = this.shopSelectedWeaponKind === kind;
      const y = px(CONTENT_TOP + 22 + index * SHOP_ROW_H + SHOP_ROW_H / 2);
      const iconId = displayLevel > 0 ? `${kind}-${String(displayLevel)}` : `${kind}-1`;

      const targetLevel = (equippedThisKind || ownedThisKind) ? displayLevel : this.bestAffordableLevelForKind(kind);
      const canAffordKind = equippedThisKind || ownedThisKind || targetLevel !== null;

      const rowBg = this.add.rectangle(px(SHOP_ITEM_X), y, px(SHOP_ITEM_W), px(SHOP_ROW_H - 4), selected ? 0x16162c : 0x0a0a18)
        .setOrigin(0, 0.5);
      if (!kindLocked && canAffordKind) {
        rowBg.setInteractive({ useHandCursor: true });
        rowBg.on('pointerdown', () => { this.shopSelectedWeaponKind = kind; this.rebuildContent(); this.updatePreview(); });
        rowBg.on('pointerover', () => { rowBg.setFillStyle(selected ? 0x1c1c38 : 0x12122a); });
        rowBg.on('pointerout', () => { rowBg.setFillStyle(selected ? 0x16162c : 0x0a0a18); });
      }
      if (kindLocked) rowBg.setAlpha(0.35);
      this.addC(rowBg);

      this.addC(this.add.image(px(SHOP_ITEM_X + 18), y, iconTextureForWeaponId(iconId))
        .setOrigin(0.5).setBlendMode(Phaser.BlendModes.ADD)
        .setScale(0.55 + Math.max(0, displayLevel - 1) * 0.04)
        .setAlpha(kindLocked ? 0.15 : (canAffordKind ? ((equippedThisKind || ownedThisKind) ? 1 : 0.5) : 0.2)));

      const nameLabel = displayLevel > 0
        ? `${weaponKindDisplayName(kind)} Lv${String(displayLevel)}`
        : targetLevel !== null && targetLevel > 1
          ? `${weaponKindDisplayName(kind)} Lv${String(targetLevel)}`
          : weaponKindDisplayName(kind);
      this.addC(this.add.text(px(SHOP_ITEM_X + 38), y, nameLabel, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(12))}px`,
        color: cssColor(kindLocked ? 0x555577 : (equippedThisKind ? PALETTE.weaponCyan : PALETTE.hullWhite)),
      }).setOrigin(0, 0.5).setAlpha(kindLocked ? 0.5 : (canAffordKind ? ((equippedThisKind || ownedThisKind) ? 1 : 0.6) : 0.25)));

      if (kindLocked) {
        this.addC(this.add.text(px(SHOP_ITEM_X + SHOP_ITEM_W - 4), y, `★${String(kindMinStars)}`, {
          fontFamily: UI_FONT, fontSize: `${String(fontPx(10))}px`, color: cssColor(0x556677),
        }).setOrigin(1, 0.5));
      } else if (equippedThisKind) {
        const dots = Array.from({ length: MAX_WEAPON_LEVEL }, (_, i) => i < equippedLevel ? '●' : '○').join('');
        this.addC(this.add.text(px(SHOP_ITEM_X + SHOP_ITEM_W - 4), y, dots, {
          fontFamily: UI_FONT, fontSize: `${String(fontPx(10))}px`, color: cssColor(PALETTE.weaponCyan),
        }).setOrigin(1, 0.5));
      } else if (ownedThisKind) {
        const dots = Array.from({ length: MAX_WEAPON_LEVEL }, (_, i) => i < ownedLevel ? '●' : '○').join('');
        this.addC(this.add.text(px(SHOP_ITEM_X + SHOP_ITEM_W - 4), y, dots, {
          fontFamily: UI_FONT, fontSize: `${String(fontPx(10))}px`, color: cssColor(PALETTE.shieldBlue),
        }).setOrigin(1, 0.5));
      } else if (targetLevel !== null) {
        const cost = Math.max(0, itemById(`${kind}-${String(targetLevel)}`).price - itemById(this.save.equipped.weapon).price);
        const label = cost === 0 ? 'FREE' : `${String(cost)}⬤`;
        const color = cost === 0 ? PALETTE.shieldBlue : PALETTE.generatorAmber;
        this.addC(this.add.text(px(SHOP_ITEM_X + SHOP_ITEM_W - 4), y, label, {
          fontFamily: UI_FONT, fontSize: `${String(fontPx(10))}px`, color: cssColor(color),
        }).setOrigin(1, 0.5).setAlpha(0.7));
      } else {
        this.addC(this.add.text(px(SHOP_ITEM_X + SHOP_ITEM_W - 4), y, 'CAN\'T AFFORD', {
          fontFamily: UI_FONT, fontSize: `${String(fontPx(9))}px`, color: cssColor(0x445566),
        }).setOrigin(1, 0.5).setAlpha(0.6));
      }
    });
    this.buildWeaponActions();
  }

  private buildWeaponActions(): void {
    if (this.shopSelectedWeaponKind === null) {
      this.addC(addLabel(this, { x: px(SHOP_ITEM_X), y: px(SHOP_ACTION_Y + 28), text: 'Tap a weapon type.', color: 0x666688, size: 11 }));
      return;
    }
    const kind = this.shopSelectedWeaponKind;
    const equippedLevel = this.equippedLevelForKind(kind);
    const ownedLevel = this.ownedLevelForKind(kind);
    if (equippedLevel === 0 && ownedLevel === 0) { this.buildWeaponKindSwitch(kind); return; }
    if (equippedLevel === 0 && ownedLevel > 0) { this.buildWeaponKindReequip(kind, ownedLevel); return; }

    const nextLevel = equippedLevel + 1;
    const hasUpgrade = equippedLevel < MAX_WEAPON_LEVEL;
    const upgradeStarsNeeded = WEAPON_STARS[kind][equippedLevel] ?? Infinity;
    const upgradeLocked = hasUpgrade && upgradeStarsNeeded > this.shopPlayerStars;
    const hasDowngrade = equippedLevel > 1;
    const headerY = px(SHOP_ACTION_Y + 6);
    const midX = px(SHOP_ITEM_X + Math.round(SHOP_ITEM_W / 2));
    const colW = px(Math.round(SHOP_ITEM_W / 2) - 6);

    this.addWeaponStatBlock(kind, equippedLevel, { x: px(SHOP_ITEM_X), topY: headerY }, colW, '✓ EQUIPPED');
    if (hasUpgrade && !upgradeLocked) {
      this.addWeaponStatBlock(kind, nextLevel, { x: midX, topY: headerY }, colW, '');
    } else if (upgradeLocked) {
      this.addC(addLabel(this, { x: midX, y: headerY + px(4), text: `★${String(upgradeStarsNeeded)} to unlock Lv${String(nextLevel)}`, color: 0x556677, size: 10 }));
    } else {
      this.addC(addLabel(this, { x: midX, y: headerY + px(4), text: 'MAX LEVEL', color: PALETTE.weaponCyan, size: 10 }));
    }

    const btnY = px(SHOP_ACTION_Y + 68);
    if (hasDowngrade) {
      const downLabel = isOwned(this.save, `${kind}-${String(equippedLevel - 1)}`) ? `▼ LV${String(equippedLevel - 1)}  FREE` : `▼ LV${String(equippedLevel - 1)}`;
      this.addC(addTextButton(this, {
        x: px(SHOP_ITEM_X + 60), y: btnY,
        label: downLabel, color: PALETTE.shieldBlue, size: 11,
        onClick: () => { this.save = switchItem(this.save, `${kind}-${String(equippedLevel - 1)}`); this.rebuildContent(); this.updatePreview(); },
      }));
    }
    if (hasUpgrade && !upgradeLocked) {
      const upgradeCost = itemById(`${kind}-${String(nextLevel)}`).price - itemById(`${kind}-${String(equippedLevel)}`).price;
      const upgradeBtn = addTextButton(this, {
        x: hasDowngrade ? px(HUB_LEFT_W - 80) : px(CONTENT_MID), y: btnY,
        label: `▲ LV${String(nextLevel)}  ${String(upgradeCost)}⬤`, color: PALETTE.generatorAmber, size: 11,
        onClick: () => { this.save = switchItem(this.save, `${kind}-${String(nextLevel)}`); this.rebuildContent(); this.updatePreview(); },
      });
      if (this.save.coins < upgradeCost) upgradeBtn.setAlpha(0.4);
      this.addC(upgradeBtn);
    }
  }

  private addWeaponStatBlock(
    kind: WeaponKind, level: number,
    pos: { x: number; topY: number },
    maxWidth: number, badge: string,
  ): void {
    const spec = weaponSpecAtLevel(kind, level);
    const targets = spec.maxTargets === Infinity ? '∞' : String(spec.maxTargets);
    const hColor = badge ? PALETTE.weaponCyan : PALETTE.generatorAmber;
    this.addC(this.add.text(pos.x, pos.topY, `Lv${String(level)}${badge ? `  ${badge}` : ''}`, {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(10))}px`, color: cssColor(hColor),
    }));
    this.addC(this.add.text(pos.x, pos.topY + px(14), `${String(spec.damagePerShot)}dmg  ${String(spec.ticksBetweenShots)}t`, {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(9))}px`, color: cssColor(0x8888aa), wordWrap: { width: maxWidth },
    }));
    this.addC(this.add.text(pos.x, pos.topY + px(26), `${targets} targets  ${String(spec.energyPerShot)} energy`, {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(9))}px`, color: cssColor(0x8888aa), wordWrap: { width: maxWidth },
    }));
  }

  /** Shown when player owns a weapon kind but currently has a different kind equipped. */
  private buildWeaponKindReequip(kind: WeaponKind, ownedLevel: number): void {
    const headerY = px(SHOP_ACTION_Y + 6);
    const midX = px(SHOP_ITEM_X + Math.round(SHOP_ITEM_W / 2));
    const colW = px(Math.round(SHOP_ITEM_W / 2) - 6);
    this.addWeaponStatBlock(kind, ownedLevel, { x: px(SHOP_ITEM_X), topY: headerY }, colW, 'OWNED');

    const nextLevel = ownedLevel + 1;
    const hasUpgrade = ownedLevel < MAX_WEAPON_LEVEL;
    const upgradeStarsNeeded = WEAPON_STARS[kind][ownedLevel] ?? Infinity;
    const upgradeLocked = hasUpgrade && upgradeStarsNeeded > this.shopPlayerStars;
    if (hasUpgrade && !upgradeLocked) {
      this.addWeaponStatBlock(kind, nextLevel, { x: midX, topY: headerY }, colW, '');
    } else if (upgradeLocked) {
      this.addC(addLabel(this, { x: midX, y: headerY + px(4), text: `★${String(upgradeStarsNeeded)} to unlock Lv${String(nextLevel)}`, color: 0x556677, size: 10 }));
    } else {
      this.addC(addLabel(this, { x: midX, y: headerY + px(4), text: 'MAX LEVEL', color: PALETTE.weaponCyan, size: 10 }));
    }

    const btnY = px(SHOP_ACTION_Y + 68);
    const equipItemId = `${kind}-${String(ownedLevel)}`;
    this.addC(addTextButton(this, {
      x: hasUpgrade && !upgradeLocked ? px(SHOP_ITEM_X + 60) : px(CONTENT_MID), y: btnY,
      label: 'EQUIP FREE', color: PALETTE.shieldBlue, size: 11,
      onClick: () => { this.save = switchItem(this.save, equipItemId); this.rebuildContent(); this.updatePreview(); },
    }));
    if (hasUpgrade && !upgradeLocked) {
      const upgradeCost = Math.max(0, itemById(`${kind}-${String(nextLevel)}`).price - itemById(this.save.equipped.weapon).price);
      const upgradeBtn = addTextButton(this, {
        x: px(HUB_LEFT_W - 80), y: btnY,
        label: upgradeCost === 0 ? `▲ LV${String(nextLevel)}  FREE` : `▲ LV${String(nextLevel)}  ${String(upgradeCost)}⬤`,
        color: PALETTE.generatorAmber, size: 11,
        onClick: () => { this.save = switchItem(this.save, `${kind}-${String(nextLevel)}`); this.rebuildContent(); this.updatePreview(); },
      });
      if (this.save.coins < upgradeCost) upgradeBtn.setAlpha(0.4);
      this.addC(upgradeBtn);
    }
  }

  private buildWeaponKindSwitch(kind: WeaponKind): void {
    const targetLevel = this.bestAffordableLevelForKind(kind);
    if (targetLevel === null) return; // row is greyed — no action panel
    const spec = weaponSpecAtLevel(kind, targetLevel);
    const targetItemId = `${kind}-${String(targetLevel)}`;
    const cost = Math.max(0, itemById(targetItemId).price - itemById(this.save.equipped.weapon).price);
    const targets = spec.maxTargets === Infinity ? '∞' : String(spec.maxTargets);
    this.addC(this.add.text(px(SHOP_ITEM_X), px(SHOP_ACTION_Y + 10),
      `Lv${String(targetLevel)}: ${String(spec.damagePerShot)}dmg  ${String(spec.ticksBetweenShots)}t  ${targets} targets  ${String(spec.energyPerShot)} energy`, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(10))}px`,
        color: cssColor(0x8888aa), wordWrap: { width: px(SHOP_ITEM_W) },
      }));
    const doSwitch = (): void => { this.save = switchItem(this.save, targetItemId); this.rebuildContent(); this.updatePreview(); };
    const btnY = px(SHOP_ACTION_Y + 68);
    if (cost === 0) {
      this.addC(addTextButton(this, {
        x: px(CONTENT_MID), y: btnY, label: 'BUY FREE', color: PALETTE.shieldBlue, onClick: doSwitch,
      }));
    } else if (this.save.coins >= cost) {
      this.addC(addTextButton(this, {
        x: px(CONTENT_MID), y: btnY,
        label: `BUY & EQUIP  ${String(cost)}⬤`, color: PALETTE.generatorAmber, onClick: doSwitch,
      }));
    } else {
      this.addC(addLabel(this, { x: px(SHOP_ITEM_X), y: btnY, text: `Need ${String(cost - this.save.coins)}⬤ more`, color: PALETTE.enemyOrange, size: 12 }));
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

  private equippedLevelForKind(kind: WeaponKind): number {
    if (!this.save.equipped.weapon.startsWith(`${kind}-`)) return 0;
    const parts = this.save.equipped.weapon.split('-');
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
    const currentPrice = itemById(this.save.equipped.weapon).price;
    const parts = this.save.equipped.weapon.split('-');
    const currentLevel = parseInt(parts[parts.length - 1] ?? '1', 10) || 1;
    for (let lv = currentLevel; lv >= 1; lv--) {
      if ((WEAPON_STARS[kind][lv - 1] ?? 0) > this.shopPlayerStars) continue;
      const netCost = itemById(`${kind}-${String(lv)}`).price - currentPrice;
      if (netCost <= 0 || this.save.coins >= netCost) return lv;
    }
    return null;
  }

  private prospectiveLoadout(current: LoadoutSnapshot): LoadoutSnapshot | null {
    if (this.shopTab === 'ship') {
      if (this.shopSelectedItemId === null || SHIPS[this.shopSelectedItemId] === undefined) return null;
      if (this.save.equipped.ship === this.shopSelectedItemId) return null;
      return { ...current, ship: shipById(this.shopSelectedItemId) };
    }
    if (this.shopTab === 'weapon') {
      if (this.shopSelectedWeaponKind === null) return null;
      const kind = this.shopSelectedWeaponKind;
      const equippedLevel = this.equippedLevelForKind(kind);
      const previewLevel = equippedLevel > 0 ? equippedLevel : 1;
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

  private buildTextContent(body: string): void {
    this.addC(this.add.text(px(CONTENT_PAD), px(CONTENT_TOP + 8), body, {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(11))}px`,
      color: cssColor(0xaaaacc), lineSpacing: px(4),
      wordWrap: { width: px(this.contentW - CONTENT_PAD * 2) },
    }));
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
