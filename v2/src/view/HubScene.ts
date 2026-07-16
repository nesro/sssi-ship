import Phaser from 'phaser';
import type { LoadoutSnapshot, RearWeaponKind, SideWeaponKind, WeaponKind } from '../core/types';
import { ALL_MISSIONS, totalStarsAvailable } from '../data/missions';
import {
  shipById,
  generatorSpecAtLevel, motorSpecAtLevel, rearWeaponSpecAtLevel, shieldSpecAtLevel, sideWeaponSpecAtLevel, weaponSpecAtLevel,
} from '../data/items';
import type { GeneratorKind, MotorKind, ShieldKind } from '../data/items';
import {
  buildLoadout, buySubscription, buySupplyCharge, downgradeSubscription,
  loadSave, persistSave, resetSave, sellSupplyCharge, switchItem,
  switchRearWeapon, switchShip, switchSideWeapon, totalStars, unequipShield, unequipWeapon, upgradeSubscription,
} from '../save/SaveManager';
import type { SaveData } from '../save/SaveManager';
import { subscriptionById } from '../data/subscriptions';
import { cssColor, PALETTE } from './palette';
import { fontPx, HUB_LEFT_W, LOGICAL_HEIGHT, LOGICAL_WIDTH, px } from './layout';
import { ShopPreviewPanel } from './ShopPreviewPanel';
import type { PreviewLayout } from './ShopPreviewPanel';
import { buildGameTextures } from './textures';
import { addLabel, addTextButton, drawDevBorder, UI_FONT } from './widgets';
import { HubTour } from './HubTour';
import type { TourStep } from './HubTour';
import { Sound } from '../audio/SoundManager';
import {
  DEFAULT_HUB_UI_STATE, computeDetailHint, computeDispatch, computeGalaxyMap,
  computeKindRows, computeKindRowTrace, computeLevelChips, computeLoadoutRows, computeMissionDetail,
  computeSettings, computeSupplies, resolveUiState,
} from '../viewmodel/hub';
import type {
  DispatchCardViewModel, DispatchViewModel, GalaxyMapViewModel, HubNav, HubUIState,
  KindRowState, KindRowViewModel, LevelChipViewModel, MissionDetailViewModel, SubLevelChipViewModel,
} from '../viewmodel/hub';
import { shopSystemFor } from '../viewmodel/shopSystems';
import type { ShopSystemConfig, ShopTab } from '../viewmodel/shopSystems';

const SHIP_TAB_COLOR = 0x44ffaa;

type NavItem = Exclude<HubNav, null>;

// 42, not 22 — a centered 44px-tall tap target at NAV_Y=22 needs its top edge-clamped
// down to y=20 (the mobile safe margin), which desyncs the hit area from BACK/DEBUG's
// visual button: the top ~12px of the visible button no longer responds to taps. At
// NAV_Y=42 the target's natural top (42-22=20) already sits exactly on the safe margin,
// so no clamp — and no dead zone — is needed. Moves the whole nav row (title, coins/
// stars, nav labels share this constant) down 20px together, so it stays one aligned row.
const NAV_Y = 42;
// 70, not 48 — the (now unclamped) 44px-tall tap target still extends to y=64 (NAV_Y=42
// + 22 half-height); content starting at 48 overlapped it (tools/tap-target-audit.ts
// caught this, not eyeballed — it looked fine visually).
const CONTENT_TOP = 70;
const CONTENT_PAD = 20;       // mobile safe-area left/right margin

// Settings panel's left-column row rhythm (buildSettingsContent/buildDevToolsSection).
// Every row offset below is derived from these two, not hand-copied — a prior version
// hardcoded each Y as its own magic number with a comment claiming they were "named,
// computed values kept in sync," which was false (Fable's post-implementation review
// caught the contradiction): they were literals that had to be manually re-typed in
// lockstep on every insertion. MUSIC/SFX/DEV MODE/HOW TO PLAY sit on SETTINGS_ROW_PITCH;
// the DEV TOOLS section (only shown when devOn) starts tighter below HOW TO PLAY (a
// section header, not another full row) and then resumes the same pitch internally.
const SETTINGS_ROW_PITCH = 52;
const SETTINGS_ROW_1_Y = 36; // MUSIC's offset from CONTENT_TOP
const SETTINGS_HOW_TO_PLAY_Y = SETTINGS_ROW_1_Y + 3 * SETTINGS_ROW_PITCH;
const DEV_TOOLS_HEADER_Y = SETTINGS_HOW_TO_PLAY_Y + 30;
const DEV_TOOLS_START_Y = SETTINGS_HOW_TO_PLAY_Y + 66;
const INFO_PANEL_TOP = 378;
const INFO_PANEL_H = 152;
const SHOP_TAB_W = 130;
const SHOP_ITEM_X = CONTENT_PAD + SHOP_TAB_W + 4;  // tabs + margin + gap
/** Right edge of the shop item column — preview panel occupies the remaining width. */
const SHOP_COL_W = 640;
const SHOP_ITEM_W = SHOP_COL_W - SHOP_ITEM_X - 4;
const SHOP_ROW_H = 58;        // taller rows for mobile tap targets + a stat line under the name
const SHOP_ROW_NAME_DY = -12; // name sits above row-centre so the stat line(s) fit below it
const SHOP_ROW_STAT_DY = 4;   // first stat line's y offset from row-centre
const SHOP_ROW_STAT_LINE_H = 11;
const SHOP_ACTION_Y = 432;
const SHOP_ICON_X_OFFSET = 18;   // icon centre x within row
const SHOP_NAME_X_OFFSET = 38;   // name label left x within row
const LOADOUT_ICON_X_OFFSET = 130;   // icon centre x within a loadout row
const LOADOUT_NAME_X_OFFSET = 152;   // name label left x within a loadout row

const DR_LEFT_X = 20; // mobile safe-zone left inset (04-screens-and-layout.md)
const DR_LEFT_W = 200;
const DR_RIGHT_X = DR_LEFT_W + 4;
const DR_ROW_H = 70;
const DR_CARD_W = 140;
const DR_CARD_H = 190;
const DR_CARD_GAP = 8;
const DR_CARDS_PER_ROW = 5;
const DR_CARDS_PER_COL = 2;

const GALAXY_CONNECTION_COLOR = { on: 0x334466, off: 0x1a2233 };

const NAV_ITEMS: { key: NavItem; label: string; color: number }[] = [
  { key: 'missions',                label: 'EXPLORE NEARBY SPACE',    color: PALETTE.weaponCyan },
  { key: 'shop',                    label: 'SHIP CONFIGURATION',      color: PALETTE.motorMagenta },
  { key: 'dispatch-reinforcements', label: 'DISPATCH REINFORCEMENTS', color: PALETTE.shieldBlue },
  { key: 'settings',                label: 'SETTINGS',                color: PALETTE.hullWhite },
];

// Main-menu button tour (docs/plans/first-open-and-tutorial-tour.md, Part B) — one step
// per NAV_ITEMS key, matched at runtime via .setData('tourId', ...) in buildMainMenu.
// Voice matches W0_NARRATOR_EVENTS's direct "Commander…" briefing tone (missions.ts).
const HUB_TOUR_STEPS: TourStep[] = [
  { tourId: 'missions', caption: 'Commander. This is your galaxy map — pick a mission to fly.' },
  { tourId: 'shop', caption: 'Outfit your ship here: weapons, shields, and more.' },
  { tourId: 'dispatch-reinforcements', caption: 'Subscribe for support cards you\'ll draw mid-mission.' },
  { tourId: 'settings', caption: 'Audio, dev tools, and this tour again — any time.' },
];

const SHOP_TABS: { key: ShopTab; label: string; color: number }[] = [
  { key: 'loadout',     label: 'MY\nLOADOUT',   color: PALETTE.hullWhite },
  { key: 'ship',        label: 'SHIP',           color: SHIP_TAB_COLOR },
  { key: 'weapon',      label: 'FRONT\nWEAPON',  color: PALETTE.weaponCyan },
  { key: 'rear-weapon', label: 'REAR\nWEAPON',   color: PALETTE.weaponCyan },
  { key: 'side-weapon', label: 'SIDE\nWEAPON',   color: PALETTE.weaponCyan },
  { key: 'shield',      label: 'SHIELD',         color: PALETTE.shieldBlue },
  { key: 'generator',   label: 'GENERATOR',      color: PALETTE.generatorAmber },
  { key: 'motor',       label: 'MOTOR',          color: PALETTE.motorMagenta },
  { key: 'supplies',    label: 'SUPPLIES',       color: PALETTE.hullWhite },
];

/** Accent color per shop system — the renderer's job per plan ("systemKey → color via palette"). */
function accentColorFor(tab: ShopTab): number {
  return SHOP_TABS.find((t) => t.key === tab)?.color ?? PALETTE.hullWhite;
}

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

/** Equip/unequip mutation handlers per shop system — the "scene dispatch table" (not viewmodel concern). */
const SWITCH_HANDLERS: Partial<Record<ShopTab, (save: SaveData, itemId: string) => SaveData>> = {
  weapon: (s, id) => switchItem(s, id),
  'rear-weapon': (s, id) => switchRearWeapon(s, id),
  'side-weapon': (s, id) => switchSideWeapon(s, id),
  shield: (s, id) => switchItem(s, id),
  generator: (s, id) => switchItem(s, id),
  motor: (s, id) => switchItem(s, id),
  ship: (s, id) => switchShip(s, id),
};

const UNEQUIP_HANDLERS: Partial<Record<ShopTab, (save: SaveData) => SaveData>> = {
  weapon: (s) => unequipWeapon(s),
  shield: (s) => unequipShield(s),
  'rear-weapon': (s) => switchRearWeapon(s, null),
  'side-weapon': (s) => switchSideWeapon(s, null),
};

/** Merged hub: mission list on the left, always-on ship preview on the right. */
export class HubScene extends Phaser.Scene {
  private save!: SaveData;
  private scrollingStars: { rect: Phaser.GameObjects.Rectangle; speed: number }[] = [];
  private contentObjects: Phaser.GameObjects.GameObject[] = [];
  private preview!: ShopPreviewPanel;
  private uiState: HubUIState = DEFAULT_HUB_UI_STATE;
  /** The viewmodel object most recently computed for whatever panel is on screen —
   * inspectable via the dev-mode DEBUG button so bugs can be diagnosed from the
   * printed data itself, without reading pixels off a screenshot. */
  private lastViewModel: unknown = null;
  private hubTour: HubTour | null = null;
  private showTourOnCreate = false;

  constructor() { super('HubScene'); }

  /** Phaser calls init(data) before create() when the scene is started with data —
   * OnboardingScene.ts passes { showTour: true } on both its buttons.
   *
   * Must consume the flag by mutating `data` in place, not just read it: Phaser's
   * SceneManager only overwrites `scene.sys.settings.data` when a *later* start() call
   * passes a truthy data object (Systems.start) — every subsequent bare
   * `scene.start('HubScene')` / `scene.restart()` (ResultScene's MISSIONS/SHOP buttons,
   * CombatScene's exit-confirm, the settings panel's DEV MODE/ADD COINS/UNLOCK STARS
   * buttons — none of them pass data) keeps re-delivering this SAME retained object to
   * init() forever, replaying the tour after every mission and every dev-tools restart
   * for the rest of the session. Confirmed as a real, reproducible bug (Fable's
   * post-implementation review), not a theoretical one. Setting `data.showTour = false`
   * mutates the retained object itself, so the next bare start() sees it already
   * cleared. */
  // fallow-ignore-next-line unused-class-member
  init(data: { showTour?: boolean }): void {
    this.showTourOnCreate = data.showTour === true;
    data.showTour = false;
  }

  private get playerStars(): number {
    return totalStars(this.save);
  }

  private get devMode(): boolean {
    return this.save.devMode !== false;
  }

  // fallow-ignore-next-line unused-class-member
  create(): void {
    this.save = loadSave();
    this.uiState = DEFAULT_HUB_UI_STATE;
    this.contentObjects = [];
    this.scrollingStars = [];
    // Phaser reuses this Scene instance across stop/restart (__cheat's goTo() stops
    // every scene then starts HubScene fresh) — every display object from a previous
    // life, including any HubTour's target/backdrop/ring, is already destroyed by the
    // time create() runs again, but this class field isn't reset automatically. Discard
    // it outright (not hubTour?.end() — that would call setInteractive() on an
    // already-destroyed GameObject and throw "Cannot read properties of undefined
    // (reading 'sys')", found via a real screenshot-batch crash, not eyeballed).
    this.hubTour = null;

    buildGameTextures(this);
    Sound.attach(this.sound);
    Sound.startMusic();
    this.addStarfield();
    drawDevBorder(this, this.save);

    this.add.rectangle(0, px(CONTENT_TOP - 4), px(LOGICAL_WIDTH), px(1), 0x222244).setOrigin(0, 0).setDepth(1);

    this.preview = new ShopPreviewPanel(this, HUB_PREVIEW_LAYOUT);

    this.setNav(null);

    if (this.showTourOnCreate) this.showTour();
  }

  /** Always forces the main menu first — HUB_TOUR_STEPS' targets are only tagged on
   * buildMainMenu()'s buttons (nav === null), so invoking this from anywhere else (the
   * Settings panel's HOW TO PLAY button, most commonly) would otherwise find nothing to
   * highlight on step 1. setNav() itself tears down any previous tour, so this is safe
   * to call while one is already running. */
  private showTour(): void {
    this.setNav(null);
    this.hubTour = new HubTour(this, HUB_TOUR_STEPS);
  }

  /** __cheat.hub.showTour() — also wired to the Settings panel's HOW TO PLAY button. */
  // fallow-ignore-next-line unused-class-member
  cheatShowTour(): void {
    this.showTour();
  }

  /** __cheat.hub.tourNext() — headless equivalent of tapping the tour's NEXT/DONE. */
  // fallow-ignore-next-line unused-class-member
  cheatTourNext(): void {
    this.hubTour?.cheatNext();
  }

  /** __cheat.hub.tourSkip() — headless equivalent of tapping the tour's SKIP TOUR. */
  // fallow-ignore-next-line unused-class-member
  cheatTourSkip(): void {
    this.hubTour?.cheatSkip();
  }

  // fallow-ignore-next-line unused-class-member
  override update(_time: number, deltaMs: number): void {
    for (const star of this.scrollingStars) {
      star.rect.y += px(star.speed) * deltaMs / 1000;
      if (star.rect.y > px(LOGICAL_HEIGHT + 2)) star.rect.y = -px(2);
    }
    this.preview.update(deltaMs);
  }

  private setNav(nav: HubNav): void {
    // A live HubTour points at main-menu buttons that rebuildContent() is about to
    // destroy (they're only tagged/rendered while nav === null) — end it first on any
    // navigation, for any reason, rather than leaving its backdrop/ring/caption
    // orphaned on screen with a dangling reference to a destroyed target (found via
    // tools/screenshot.ts, not eyeballed: a stray tour overlay from an earlier shot
    // survived a later navTo() and rendered on top of an unrelated panel).
    this.hubTour?.end();
    this.hubTour = null;
    this.uiState = { ...this.uiState, nav };
    this.rebuildContent();
    this.preview.setVisible(nav === 'shop');
    if (nav === 'shop') this.updatePreview();
  }

  /** Dev-only: called by __cheat.navTo(nav) to jump directly to any top-level hub
   * section ('missions' | 'shop' | 'dispatch-reinforcements' | 'settings' | null) —
   * navShop only ever reaches 'shop', this covers the rest. */
  // fallow-ignore-next-line unused-class-member
  cheatNavTo(nav: string | null): void {
    this.setNav(nav as HubNav);
  }

  /** Dev-only: called by __cheat.selectSubscription(id) — the Dispatch Reinforcements
   * cards grid only renders once a subscription tier is selected (a real click on the
   * left-panel row), which navTo alone can't reach. */
  // fallow-ignore-next-line unused-class-member
  cheatSelectSubscription(id: string): void {
    this.uiState = { ...this.uiState, selectedSubscriptionId: id, dispatchPage: 1 };
    this.setNav('dispatch-reinforcements');
  }

  /** Dev-only: called by __cheat.navShop(tab) to jump directly to a shop tab. */
  // fallow-ignore-next-line unused-class-member
  cheatNavShop(tab: string): void {
    this.uiState = resolveUiState(this.save, { ...this.uiState, tab: tab as ShopTab });
    this.setNav('shop');
  }

  private rebuildContent(): void {
    this.contentObjects.forEach((o) => { o.removeInteractive(); o.destroy(); });
    this.contentObjects = [];

    if (this.uiState.nav !== null) {
      const backBtn = addTextButton(this, {
        x: px(CONTENT_PAD), y: px(NAV_Y), originX: 0, originY: 0.5,
        label: '‹ BACK', color: 0x8888aa, size: 11,
        onClick: () => { this.setNav(null); },
      });
      this.addC(backBtn);
      if (this.devMode) {
        const debugBtn = addTextButton(this, {
          x: px(CONTENT_PAD + 70), y: px(NAV_Y), originX: 0, originY: 0.5,
          label: 'DEBUG', color: 0x66aa66, size: 11,
          onClick: () => { this.logViewModel(); },
        });
        this.addC(debugBtn);
      }
      const navItem = NAV_ITEMS.find((n) => n.key === this.uiState.nav);
      if (navItem !== undefined) {
        this.addC(this.add.text(px(LOGICAL_WIDTH / 2), px(NAV_Y), navItem.label, {
          fontFamily: UI_FONT, fontSize: `${String(fontPx(12))}px`, color: cssColor(navItem.color),
        }).setOrigin(0.5, 0.5));
      }
      this.addC(this.add.text(px(LOGICAL_WIDTH - CONTENT_PAD), px(NAV_Y),
        `★ ${String(totalStars(this.save))}/${String(totalStarsAvailable())}  ⬤ ${String(this.save.coins)}`, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(11))}px`, color: cssColor(PALETTE.generatorAmber),
      }).setOrigin(1, 0.5));
    }

    switch (this.uiState.nav) {
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

  /** Dev-only: prints the current panel's viewmodel as JSON text — the whole point of
   * a pure viewmodel layer is that a bug shows up in this text, not just in pixels. */
  private logViewModel(): void {
    console.log(JSON.stringify(this.lastViewModel, null, 2));
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
        onClick: () => {
          // Ship Configuration always opens on My Loadout — cheatNavShop sets its
          // own tab right before calling setNav, so this only affects real clicks.
          if (item.key === 'shop') this.uiState = { ...this.uiState, tab: 'loadout' };
          this.setNav(item.key);
        },
      }).setData('tourId', item.key)); // matched by HUB_TOUR_STEPS/HubTour.ts
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
    // The top nav bar (setNav()) already shows ★/coins for every screen — this used to
    // repeat it a second time, top-left, directly under the top-right original.
    const map = computeGalaxyMap(this.save, this.uiState.selectedMissionId);
    const gfx = this.addC(this.add.graphics().setDepth(2));
    this.renderGalaxyConnections(gfx, map);
    map.missions.forEach((mission) => { this.renderGalaxyNode(gfx, mission); });

    this.addC(this.add.rectangle(0, px(INFO_PANEL_TOP - 1), px(LOGICAL_WIDTH), px(1), 0x222244).setOrigin(0, 0));
    const missionDetail = computeMissionDetail(this.save, this.uiState.selectedMissionId);
    this.renderMissionInfoPanel(missionDetail);
    this.lastViewModel = { panel: 'missions', galaxyMap: map, missionDetail };
  }

  private renderGalaxyConnections(gfx: Phaser.GameObjects.Graphics, map: GalaxyMapViewModel): void {
    const positions = new Map(map.missions.map((m) => [m.id, m]));
    for (const conn of map.connections) {
      const a = positions.get(conn.fromId);
      const b = positions.get(conn.toId);
      if (a === undefined || b === undefined) continue;
      gfx.lineStyle(px(0.5), conn.bothUnlocked ? GALAXY_CONNECTION_COLOR.on : GALAXY_CONNECTION_COLOR.off, conn.bothUnlocked ? 0.7 : 0.35);
      gfx.beginPath();
      gfx.moveTo(px(a.x), px(a.y));
      gfx.lineTo(px(b.x), px(b.y));
      gfx.strokePath();
    }
  }

  private renderGalaxyNode(gfx: Phaser.GameObjects.Graphics, mission: GalaxyMapViewModel['missions'][number]): void {
    const nodeColor = mission.isTutorial ? PALETTE.generatorAmber : PALETTE.weaponCyan;
    const r = mission.isTutorial ? 6 : 8;

    gfx.fillStyle(nodeColor, mission.unlocked ? (mission.isSelected ? 0.22 : 0.10) : 0.04);
    gfx.fillCircle(px(mission.x), px(mission.y), px(r * 3.5));
    gfx.fillStyle(nodeColor, mission.unlocked ? (mission.isSelected ? 0.40 : 0.18) : 0.07);
    gfx.fillCircle(px(mission.x), px(mission.y), px(r * 1.8));
    gfx.fillStyle(nodeColor, mission.unlocked ? 1.0 : 0.22);
    gfx.fillCircle(px(mission.x), px(mission.y), px(r));

    if (mission.isSelected) {
      gfx.lineStyle(px(1.5), nodeColor, 0.9);
      gfx.strokeCircle(px(mission.x), px(mission.y), px(r + 6));
      gfx.lineStyle(px(0.5), nodeColor, 0.35);
      gfx.strokeCircle(px(mission.x), px(mission.y), px(r + 11));
    }

    const labelY = mission.y + r + 10;
    const labelColor = !mission.unlocked ? 0x445566 : (mission.isSelected ? nodeColor : (mission.isTutorial ? 0xaa8833 : 0x99aacc));
    this.addC(this.add.text(px(mission.x), px(labelY), mission.label, {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(9))}px`, color: cssColor(labelColor),
    }).setOrigin(0.5, 0).setDepth(3).setAlpha(mission.unlocked ? 1 : 0.45));

    if (mission.showStarCount) {
      this.addC(this.add.text(px(mission.x), px(labelY + 13), `★${String(mission.starsEarned)}/${String(mission.starsTotal)}`, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(8))}px`, color: cssColor(PALETTE.generatorAmber),
      }).setOrigin(0.5, 0).setDepth(3).setAlpha(0.75));
    }

    // 22, not 20 — a 44px-diameter minimum tap target (mobile safe-zone rule) regardless
    // of the visual dot's radius; tutorials draw smaller (r=6 vs 8) to visually rank
    // below main missions, but that shouldn't shrink their hit zone below the same floor
    // every other node gets (tools/tap-target-audit.ts caught tutorials at 40x40).
    const hitR = Math.max(r + 14, 22);
    const zone = this.addC(
      this.add.zone(px(mission.x), px(mission.y), px(hitR * 2), px(hitR * 2))
        .setInteractive({ useHandCursor: mission.unlocked }).setDepth(4),
    );
    if (mission.unlocked) {
      zone.on('pointerdown', () => {
        this.uiState = { ...this.uiState, selectedMissionId: mission.isSelected ? null : mission.id };
        this.rebuildContent();
      });
    }
  }

  private renderMissionInfoPanel(detail: MissionDetailViewModel | null): void {
    this.addC(this.add.rectangle(0, px(INFO_PANEL_TOP), px(LOGICAL_WIDTH), px(INFO_PANEL_H), 0x06060f, 0.92).setOrigin(0, 0));

    if (detail === null) {
      this.addC(this.add.text(px(LOGICAL_WIDTH / 2), px(INFO_PANEL_TOP + INFO_PANEL_H / 2), 'Select a mission', {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(11))}px`, color: cssColor(0x445566),
      }).setOrigin(0.5));
      return;
    }

    const nodeColor = detail.isTutorial ? PALETTE.generatorAmber : PALETTE.weaponCyan;
    const panelX = CONTENT_PAD + 4;
    const topY = INFO_PANEL_TOP + 16;

    this.addC(this.add.text(px(panelX), px(topY), detail.name, {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(15))}px`, color: cssColor(nodeColor),
    }));

    let detailY = topY + 22;
    if (detail.duration) {
      this.addC(this.add.text(px(panelX), px(detailY), detail.duration, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(10))}px`, color: cssColor(0x667788),
      }));
      detailY += 18;
    }

    if (detail.isTutorial) {
      this.addC(this.add.text(px(panelX), px(detailY), 'Training mission — preset loadout', {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(10))}px`, color: cssColor(0x887744),
      }));
    } else {
      detail.stars.forEach((star) => {
        this.addC(this.add.text(px(panelX), px(detailY), `${star.earned ? '★' : '☆'}  ${star.description}`, {
          fontFamily: UI_FONT, fontSize: `${String(fontPx(10))}px`,
          color: cssColor(star.earned ? PALETTE.generatorAmber : 0x556677),
        }));
        detailY += 18;
      });
    }

    const missionId = this.uiState.selectedMissionId;
    if (missionId === null) return;
    this.addC(addTextButton(this, {
      x: px(Math.round(LOGICAL_WIDTH * 0.76)), y: px(INFO_PANEL_TOP + INFO_PANEL_H / 2),
      label: '▶  START', color: PALETTE.weaponCyan, size: 14,
      onClick: () => { this.scene.start('CombatScene', { missionId }); },
    }));
  }

  // ─── Shop ─────────────────────────────────────────────────────────────────

  private buildShopContent(): void {
    this.uiState = resolveUiState(this.save, this.uiState);
    this.addC(this.add.rectangle(px(HUB_LEFT_W), 0, px(1), px(LOGICAL_HEIGHT), 0x333355).setOrigin(0, 0).setDepth(1));
    // -20 reserves the mobile safe-zone bottom margin (04-screens-and-layout.md) — without
    // it the last tab's row ran to y=539, 1px from the screen edge (tap-target-audit.ts).
    const tabH = (LOGICAL_HEIGHT - 20 - CONTENT_TOP) / SHOP_TABS.length;
    SHOP_TABS.forEach((tab, i) => {
      const tabY = CONTENT_TOP + tabH * (i + 0.5);
      const active = tab.key === this.uiState.tab;
      const bg = this.addC(
        this.add.rectangle(px(CONTENT_PAD), px(tabY), px(SHOP_TAB_W), px(tabH - 2), active ? 0x111128 : 0x080818, 0.95)
          .setOrigin(0, 0.5).setInteractive({ useHandCursor: true }),
      );
      if (active) bg.setStrokeStyle(px(1), tab.color, 0.6);
      bg.on('pointerdown', () => {
        this.uiState = resolveUiState(this.save, { ...this.uiState, tab: tab.key });
        this.rebuildContent();
        this.updatePreview();
      });
      // Inactive tabs must stay readable — the player needs to see what else the shop
      // offers, not just the currently-open tab.
      this.addC(
        this.add.text(px(CONTENT_PAD + SHOP_TAB_W / 2), px(tabY), tab.label, {
          fontFamily: UI_FONT,
          fontSize: `${String(fontPx(9))}px`,
          color: cssColor(active ? tab.color : 0x8899bb),
          align: 'center',
        }).setOrigin(0.5).setAlpha(active ? 1 : 0.8),
      );
    });

    this.addC(this.add.rectangle(px(CONTENT_PAD + SHOP_TAB_W), px(CONTENT_TOP), px(1), px(LOGICAL_HEIGHT - CONTENT_TOP), 0x333355).setOrigin(0, 0));
    this.addC(this.add.rectangle(px(SHOP_COL_W), px(CONTENT_TOP), px(1), px(LOGICAL_HEIGHT - CONTENT_TOP), 0x333355).setOrigin(0, 0));
    this.addC(this.add.rectangle(px(SHOP_ITEM_X), px(SHOP_ACTION_Y), px(SHOP_ITEM_W), px(1), 0x222244).setOrigin(0, 0));

    if (this.uiState.tab === 'loadout') { this.renderLoadoutTab(); return; }
    if (this.uiState.tab === 'supplies') { this.renderSuppliesTab(); return; }
    const config = shopSystemFor(this.uiState.tab);
    if (config !== null) this.renderKindRowTab(config);
  }

  // ─── Generic kind-row shop tab (weapon / rear-weapon / shield / generator / motor / ship) ──

  private renderKindRowTab(config: ShopSystemConfig): void {
    const selectedKind = this.uiState.selectedKindByTab[config.systemKey] ?? null;
    const rows = computeKindRows({ config, save: this.save, playerStars: this.playerStars }, selectedKind);
    rows.forEach((row, index) => { this.renderKindRow(row, index, config); });

    // Full cost-computation trace for whatever kind is selected — every intermediate
    // value the badge/rowState math is built from, not just the final numbers.
    const trace = selectedKind !== null
      ? computeKindRowTrace({ config, save: this.save, kind: selectedKind, playerStars: this.playerStars })
      : null;

    if (selectedKind === null) {
      const hint = computeDetailHint(config, null);
      this.addC(addLabel(this, { x: px(SHOP_ITEM_X), y: px(SHOP_ACTION_Y + 28), text: hint.text, color: 0x666688, size: 13 }));
      this.lastViewModel = { panel: 'shop-kind-rows', tab: config.systemKey, selectedKind, rows, levelChips: [], detailHint: hint, selectedTrace: trace };
      return;
    }
    const chips = computeLevelChips({ config, save: this.save, kind: selectedKind, playerStars: this.playerStars });
    this.renderLevelChips(chips, config);
    const equippedLevel = config.equippedLevelForKind(this.save, selectedKind);
    if (equippedLevel > 0) this.renderDetailLines(config.detailLines(selectedKind, equippedLevel), config);
    this.lastViewModel = { panel: 'shop-kind-rows', tab: config.systemKey, selectedKind, rows, levelChips: chips, equippedLevel, selectedTrace: trace };
  }

  private renderDetailLines(lines: string[], config: ShopSystemConfig): void {
    const color = config.systemKey === 'ship' ? SHIP_TAB_COLOR : accentColorFor(config.systemKey);
    lines.forEach((line, i) => {
      this.addC(this.add.text(px(SHOP_ITEM_X), px(SHOP_ACTION_Y + 54 + i * 14), line, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(11))}px`, color: cssColor(color), wordWrap: { width: px(SHOP_ITEM_W) },
      }));
    });
  }

  private renderKindRow(row: KindRowViewModel, index: number, config: ShopSystemConfig): void {
    const y = px(CONTENT_TOP + 22 + index * SHOP_ROW_H + SHOP_ROW_H / 2);
    const locked = row.rowState === 'locked';
    const highlighted = row.isNoneRow ? (row.isSelected || row.rowState === 'equipped') : row.isSelected;
    const bg = this.add.rectangle(px(SHOP_ITEM_X), y, px(SHOP_ITEM_W), px(SHOP_ROW_H - 4), highlighted ? 0x16162c : 0x0a0a18).setOrigin(0, 0.5);
    if (locked) bg.setAlpha(0.35);
    if (!locked) {
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => { this.onKindRowTap(row, config); });
      bg.on('pointerover', () => { bg.setFillStyle(highlighted ? 0x1c1c38 : 0x12122a); });
      bg.on('pointerout', () => { bg.setFillStyle(highlighted ? 0x16162c : 0x0a0a18); });
    }
    this.addC(bg);

    if (row.isNoneRow) {
      this.addC(this.add.text(px(SHOP_ITEM_X + 8), y, '— NONE', {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(14))}px`,
        color: cssColor(row.rowState === 'equipped' ? accentColorFor(config.systemKey) : 0x555577),
      }).setOrigin(0, 0.5));
      this.renderKindBadge(row, y);
      return;
    }

    // Unified alpha per rowState across all six systems (visual unification #1 —
    // the old weapon tab used 0.6/0.25 for name/unaffordable while every other
    // system used 1.0/0.4; this table is the single unified target).
    const nameAlpha = locked ? 0.5 : ROW_NAME_ALPHA[row.rowState];
    const iconAlpha = locked ? 0.15 : ROW_ICON_ALPHA[row.rowState];
    this.addC(this.add.image(px(SHOP_ITEM_X + SHOP_ICON_X_OFFSET), y, row.iconKey)
      .setOrigin(0.5).setBlendMode(Phaser.BlendModes.ADD)
      .setScale(row.iconScale).setAlpha(iconAlpha));
    this.addC(this.add.text(px(SHOP_ITEM_X + SHOP_NAME_X_OFFSET), y + px(SHOP_ROW_NAME_DY), row.displayName, {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(14))}px`,
      color: cssColor(locked ? 0x555577 : (row.rowState === 'equipped' ? accentColorFor(config.systemKey) : PALETTE.hullWhite)),
    }).setOrigin(0, 0.5).setAlpha(nameAlpha));
    this.renderKindRowStatLines(row, y, nameAlpha);

    this.renderKindBadge(row, y);
  }

  /** Compact "Lv1 <stat>" (and "LvN <stat>" if equipped elsewhere) lines under the kind name. */
  private renderKindRowStatLines(row: KindRowViewModel, y: number, alpha: number): void {
    row.statLines.forEach((line, i) => {
      this.addC(this.add.text(
        px(SHOP_ITEM_X + SHOP_NAME_X_OFFSET), y + px(SHOP_ROW_STAT_DY + i * SHOP_ROW_STAT_LINE_H), line,
        { fontFamily: UI_FONT, fontSize: `${String(fontPx(9))}px`, color: cssColor(0x8899aa) },
      ).setOrigin(0, 0.5).setAlpha(alpha * 0.85));
    });
  }

  private renderKindBadge(row: KindRowViewModel, y: number): void {
    const badge = row.badge;
    if (badge === null) return;
    const x = px(SHOP_ITEM_X + SHOP_ITEM_W - 4);
    if (badge.kind === 'stars') {
      this.addC(this.add.text(x, y, badge.label, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(12))}px`, color: cssColor(0x556677),
      }).setOrigin(1, 0.5));
      return;
    }
    const color = badge.kind === 'cost'
      ? (badge.affordable ? PALETTE.generatorAmber : 0x556677)
      : PALETTE.shieldBlue; // 'refund'
    this.addC(this.add.text(x, y, badge.label, {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(9))}px`, color: cssColor(color),
    }).setOrigin(1, 0.5).setAlpha(0.85));
  }

  private onKindRowTap(row: KindRowViewModel, config: ShopSystemConfig): void {
    this.uiState = {
      ...this.uiState,
      selectedKindByTab: { ...this.uiState.selectedKindByTab, [config.systemKey]: row.kind },
    };
    if (row.tap.mutation !== null) this.save = this.applyKindMutation(config.systemKey, row.tap.mutation);
    this.rebuildContent();
    this.updatePreview();
  }

  private applyKindMutation(tab: ShopTab, mutation: { type: 'switch-item'; itemId: string } | { type: 'unequip' }): SaveData {
    if (mutation.type === 'unequip') {
      const handler = UNEQUIP_HANDLERS[tab];
      if (handler === undefined) throw new Error(`Tab "${tab}" has no unequip mutation`);
      return handler(this.save);
    }
    const handler = SWITCH_HANDLERS[tab];
    if (handler === undefined) throw new Error(`Tab "${tab}" has no switch-item mutation`);
    return handler(this.save, mutation.itemId);
  }

  private renderLevelChips(chips: LevelChipViewModel[], config: ShopSystemConfig): void {
    const count = chips.length;
    if (count === 0) return;
    const chipW = Math.floor(SHOP_ITEM_W / count);
    const chipH = 32;
    const chipCY = SHOP_ACTION_Y + 20;
    const accent = accentColorFor(config.systemKey);

    chips.forEach((chip, i) => {
      const chipX = SHOP_ITEM_X + i * chipW + chipW / 2;
      const isCurrent = chip.state === 'equipped';
      const rect = this.add.rectangle(px(chipX), px(chipCY), px(chipW - 4), px(chipH), isCurrent ? 0x0c1a2e : 0x0e0e1e).setOrigin(0.5);
      if (isCurrent) rect.setStrokeStyle(px(1), accent, 0.8);
      const dimmed = chip.state === 'locked' || chip.state === 'unaffordable';
      if (!isCurrent) {
        if (dimmed) { rect.setAlpha(0.35); } else {
          rect.setInteractive({ useHandCursor: true });
          rect.on('pointerdown', () => { this.onLevelChipTap(chip, config); });
          rect.on('pointerover', () => { rect.setFillStyle(0x151530); });
          rect.on('pointerout', () => { rect.setFillStyle(0x0e0e1e); });
        }
      }
      this.addC(rect);

      const labelColor = chip.state === 'locked' ? 0x444466 : isCurrent ? accent : (chip.state === 'unaffordable' ? 0x444466 : PALETTE.hullWhite);
      this.addC(this.add.text(px(chipX), px(chipCY - 7), chip.label, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(9))}px`, color: cssColor(labelColor),
      }).setOrigin(0.5));

      const subColor = CHIP_SUB_COLOR[chip.state] === 'accent' ? accent
        : CHIP_SUB_COLOR[chip.state] === 'blue' ? PALETTE.shieldBlue
          : CHIP_SUB_COLOR[chip.state] === 'amber' ? PALETTE.generatorAmber
            : 0x445566;
      this.addC(this.add.text(px(chipX), px(chipCY + 8), chip.subLabel, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(8))}px`, color: cssColor(subColor),
      }).setOrigin(0.5));
    });
  }

  private onLevelChipTap(chip: LevelChipViewModel, config: ShopSystemConfig): void {
    if (chip.mutation === null) return;
    const handler = SWITCH_HANDLERS[config.systemKey];
    if (handler === undefined) throw new Error(`Tab "${config.systemKey}" has no switch-item mutation`);
    this.save = handler(this.save, chip.mutation.itemId);
    this.rebuildContent();
    this.updatePreview();
  }

  // ─── Loadout tab ────────────────────────────────────────────────────────────

  private renderLoadoutTab(): void {
    const { rows, totalShipValue } = computeLoadoutRows(this.save);
    rows.forEach((row, i) => {
      const y = px(CONTENT_TOP + 22 + i * SHOP_ROW_H + SHOP_ROW_H / 2);
      this.addC(this.add.text(px(SHOP_ITEM_X + 4), y, row.slotLabel, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(9))}px`, color: cssColor(accentColorFor(row.systemKey)),
      }).setOrigin(0, 0.5).setAlpha(0.65));
      if (row.iconKey !== '') {
        this.addC(this.add.image(px(SHOP_ITEM_X + LOADOUT_ICON_X_OFFSET), y, row.iconKey)
          .setOrigin(0.5).setBlendMode(Phaser.BlendModes.ADD)
          .setScale(row.iconScale).setAlpha(row.empty ? 0.35 : 1));
      }
      this.addC(this.add.text(px(SHOP_ITEM_X + LOADOUT_NAME_X_OFFSET), y, row.itemName, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(13))}px`, color: cssColor(PALETTE.hullWhite),
      }).setOrigin(0, 0.5).setAlpha(row.empty ? 0.35 : 1));
      if (row.price > 0) {
        this.addC(this.add.text(px(SHOP_ITEM_X + SHOP_ITEM_W - 4), y, `${String(row.price)}⬤`, {
          fontFamily: UI_FONT, fontSize: `${String(fontPx(12))}px`, color: cssColor(PALETTE.generatorAmber),
        }).setOrigin(1, 0.5).setAlpha(0.6));
      }
    });

    const totalLabel = totalShipValue > 0 ? `TOTAL SHIP VALUE  ${String(totalShipValue)}⬤` : 'TOTAL SHIP VALUE  FREE';
    this.addC(this.add.text(px(SHOP_ITEM_X + SHOP_ITEM_W - 4), px(SHOP_ACTION_Y + 24), totalLabel, {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(14))}px`, color: cssColor(PALETTE.generatorAmber),
    }).setOrigin(1, 0));
    this.lastViewModel = { panel: 'loadout', rows, totalShipValue };
  }

  // ─── Supplies tab ───────────────────────────────────────────────────────────

  private renderSuppliesTab(): void {
    const ROW_GAP = SHOP_ROW_H + 22;
    const supplies = computeSupplies(this.save);
    this.lastViewModel = { panel: 'supplies', supplies };
    supplies.forEach((supply, index) => {
      const y = CONTENT_TOP + 22 + index * ROW_GAP;
      const rightX = SHOP_ITEM_X + SHOP_ITEM_W;

      this.addC(addLabel(this, {
        x: px(SHOP_ITEM_X), y: px(y),
        text: `${supply.name}   ×${String(supply.charges)}/${String(supply.maxCharges)}`,
        color: PALETTE.hullWhite, size: 14,
      }));
      this.addC(addLabel(this, { x: px(SHOP_ITEM_X), y: px(y + 20), text: supply.description, color: 0x8888aa, size: 12 }));

      if (supply.canSell) {
        this.addC(addTextButton(this, {
          x: px(rightX - 112), y: px(y + 10),
          label: `-1  ${String(supply.pricePerCharge)}⬤`, color: PALETTE.enemyOrange, size: 13,
          onClick: () => { this.save = sellSupplyCharge(this.save, supply.id); this.rebuildContent(); },
        }));
      }
      if (supply.charges < supply.maxCharges) {
        const buyBtn = addTextButton(this, {
          x: px(rightX - 28), y: px(y + 10),
          label: `+1  ${String(supply.pricePerCharge)}⬤`, color: PALETTE.generatorAmber, size: 13,
          onClick: () => {
            if (!supply.canBuy) return;
            this.save = buySupplyCharge(this.save, supply.id);
            this.rebuildContent();
          },
        });
        if (!supply.canBuy) buyBtn.setAlpha(0.4);
        this.addC(buyBtn);
      }
    });
    this.addC(addLabel(this, { x: px(SHOP_ITEM_X), y: px(SHOP_ACTION_Y + 28), text: 'Charges refill free before every mission.', color: 0x8888aa, size: 13 }));
  }

  // ─── Preview panel wiring ───────────────────────────────────────────────────

  private prospectiveLoadout(current: LoadoutSnapshot): LoadoutSnapshot | null {
    const tab = this.uiState.tab;
    const config = shopSystemFor(tab);
    if (config === null) return null;
    const kind = this.uiState.selectedKindByTab[tab] ?? null;
    if (kind === null) return null;
    const equippedLevel = config.equippedLevelForKind(this.save, kind);
    const previewLevel = equippedLevel > 0 ? equippedLevel : 1;
    return applyProspectiveKind(tab, kind, previewLevel, current, this.save);
  }

  private updatePreview(): void {
    const current = buildLoadout(this.save);
    this.preview.show(current, this.prospectiveLoadout(current));
  }

  // ─── Dispatch Reinforcements ──────────────────────────────────────────────

  private buildDispatchReinforcementsContent(): void {
    this.addC(this.add.rectangle(px(DR_LEFT_W), px(CONTENT_TOP), px(1), px(LOGICAL_HEIGHT - CONTENT_TOP), 0x333355).setOrigin(0, 0));
    const dispatch = computeDispatch(this.save, this.uiState, this.playerStars);
    this.renderDRLeftPanel(dispatch);
    if (dispatch.selectedSubscriptionId !== null) this.renderDRCardsGrid(dispatch);
    this.lastViewModel = { panel: 'dispatch', ...dispatch };
  }

  private renderDRLeftPanel(dispatch: DispatchViewModel): void {
    dispatch.subscriptions.forEach((sub, i) => {
      const rowY = CONTENT_TOP + i * DR_ROW_H;
      const midY = rowY + DR_ROW_H / 2;
      // DR_LEFT_X insets the row from the screen's left edge (mobile safe-zone rule,
      // 04-screens-and-layout.md) — this used to start flush at x=0 (tap-target-audit.ts
      // caught the hit area's left edge at 0px, not eyeballed).
      const bg = this.addC(
        this.add.rectangle(px(DR_LEFT_X), px(rowY), px(DR_LEFT_W - DR_LEFT_X), px(DR_ROW_H - 1), sub.isSelected ? 0x111128 : 0x080818, 0.95)
          .setOrigin(0, 0).setInteractive({ useHandCursor: true }),
      );
      if (sub.isSelected) bg.setStrokeStyle(px(1), sub.color, 0.5);
      bg.on('pointerdown', () => {
        const wasSelected = this.uiState.selectedSubscriptionId === sub.id;
        this.uiState = { ...this.uiState, selectedSubscriptionId: sub.id, dispatchPage: wasSelected ? this.uiState.dispatchPage : 1 };
        this.rebuildContent();
      });
      this.addC(this.add.text(px(DR_LEFT_X + 8), px(midY - 10), sub.name, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(12))}px`,
        color: cssColor(sub.isSelected ? sub.color : (sub.ownedLevel > 0 ? 0x9999bb : 0x555577)),
      }).setOrigin(0, 0.5));
      this.addC(this.add.text(px(DR_LEFT_W - 6), px(midY - 10), sub.dots, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(10))}px`,
        color: cssColor(sub.ownedLevel > 0 ? sub.color : 0x444466),
      }).setOrigin(1, 0.5));
      this.addC(this.add.text(px(DR_LEFT_X + 8), px(midY + 10), sub.statusText, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(9))}px`,
        color: cssColor(sub.ownedLevel > 0 ? 0x778899 : 0x334455),
      }).setOrigin(0, 0.5));
    });
    this.renderDRActionZone(dispatch);
  }

  private renderDRActionZone(dispatch: DispatchViewModel): void {
    const actionY = CONTENT_TOP + DR_ROW_H * 5;
    this.addC(this.add.rectangle(px(0), px(actionY), px(DR_LEFT_W), px(1), 0x333355).setOrigin(0, 0));
    if (dispatch.selectedSubscriptionId === null) return;
    const sub = subscriptionById(dispatch.selectedSubscriptionId);

    this.renderSubLevelChips(dispatch.subLevelChips, sub.color, actionY + 14);

    if (dispatch.tagline !== '') {
      this.addC(this.add.text(px(6), px(actionY + 68), dispatch.tagline, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(9))}px`,
        color: cssColor(0x8888aa), wordWrap: { width: px(DR_LEFT_W - 10) },
      }));
    }
  }

  private renderSubLevelChips(chips: SubLevelChipViewModel[], accentColor: number, topY: number): void {
    const count = chips.length;
    const chipW = Math.floor((DR_LEFT_W - 8) / count);
    const chipH = 32;
    const chipCY = topY + chipH / 2;

    chips.forEach((chip, i) => {
      const isCurrent = chip.state === 'current';
      const dimmed = chip.state === 'locked' || chip.state === 'unaffordable';
      const chipX = 4 + i * chipW + chipW / 2;

      const rect = this.add.rectangle(px(chipX), px(chipCY), px(chipW - 3), px(chipH), isCurrent ? 0x0c1a2e : 0x0e0e1e).setOrigin(0.5);
      if (isCurrent) rect.setStrokeStyle(px(1), accentColor, 0.8);
      if (!isCurrent) {
        if (dimmed) { rect.setAlpha(0.35); } else {
          rect.setInteractive({ useHandCursor: true });
          rect.on('pointerdown', () => { this.onSubLevelChipTap(chip); });
          rect.on('pointerover', () => { rect.setFillStyle(0x151530); });
          rect.on('pointerout', () => { rect.setFillStyle(0x0e0e1e); });
        }
      }
      this.addC(rect);

      const labelColor = chip.state === 'locked' ? 0x444466 : isCurrent ? accentColor : (chip.state === 'unaffordable' ? 0x444466 : PALETTE.hullWhite);
      this.addC(this.add.text(px(chipX), px(chipCY - 7), chip.label, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(9))}px`, color: cssColor(labelColor),
      }).setOrigin(0.5));

      const subColor = chip.state === 'locked' ? 0x445566
        : isCurrent ? accentColor
          : chip.subLabel.startsWith('+') || chip.subLabel === 'FREE' ? PALETTE.shieldBlue
            : chip.state === 'unaffordable' ? 0x445566 : PALETTE.generatorAmber;
      this.addC(this.add.text(px(chipX), px(chipCY + 8), chip.subLabel, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(8))}px`, color: cssColor(subColor),
      }).setOrigin(0.5));
    });
  }

  private onSubLevelChipTap(chip: SubLevelChipViewModel): void {
    if (chip.mutation === null) return;
    const { subId, targetLevel } = chip.mutation;
    const ownedLevel = this.save.ownedSubscriptions[subId] ?? 0;
    let s = this.save;
    if (targetLevel > ownedLevel) {
      for (let step = ownedLevel; step < targetLevel; step++) {
        s = step === 0 ? buySubscription(s, subId) : upgradeSubscription(s, subId);
      }
    } else {
      for (let step = ownedLevel; step > targetLevel; step--) s = downgradeSubscription(s, subId);
    }
    this.save = s;
    this.rebuildContent();
  }

  private renderDRCardsGrid(dispatch: DispatchViewModel): void {
    const rightW = LOGICAL_WIDTH - DR_RIGHT_X;
    const gridW = DR_CARDS_PER_ROW * DR_CARD_W + (DR_CARDS_PER_ROW - 1) * DR_CARD_GAP;
    const cardStartX = DR_RIGHT_X + Math.floor((rightW - gridW) / 2);
    const cardStartY = CONTENT_TOP + 10;

    dispatch.cards.forEach((card, idx) => {
      const col = idx % DR_CARDS_PER_ROW;
      const row = Math.floor(idx / DR_CARDS_PER_ROW);
      const cx = cardStartX + col * (DR_CARD_W + DR_CARD_GAP);
      const cy = cardStartY + row * (DR_CARD_H + DR_CARD_GAP);
      this.renderDRCard(cx, cy, card);
    });

    if (dispatch.totalPages > 1) {
      const paginationY = cardStartY + DR_CARDS_PER_COL * DR_CARD_H + (DR_CARDS_PER_COL - 1) * DR_CARD_GAP + 14;
      const midX = DR_RIGHT_X + Math.floor(rightW / 2);
      this.addC(this.add.text(px(midX), px(paginationY), `${String(dispatch.page)} / ${String(dispatch.totalPages)}`, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(12))}px`, color: cssColor(0x8888aa),
      }).setOrigin(0.5, 0));
      if (dispatch.page > 1) {
        this.addC(addTextButton(this, {
          x: px(midX - 50), y: px(paginationY),
          label: '←', color: PALETTE.hullWhite, size: 14,
          onClick: () => { this.uiState = { ...this.uiState, dispatchPage: dispatch.page - 1 }; this.rebuildContent(); },
        }));
      }
      if (dispatch.page < dispatch.totalPages) {
        this.addC(addTextButton(this, {
          x: px(midX + 50), y: px(paginationY),
          label: '→', color: PALETTE.hullWhite, size: 14,
          onClick: () => { this.uiState = { ...this.uiState, dispatchPage: dispatch.page + 1 }; this.rebuildContent(); },
        }));
      }
    }
  }

  private renderDRCard(x: number, y: number, card: DispatchCardViewModel): void {
    // Locked cards must stay legible enough to preview what a subscription buys before
    // paying for it — 0.35 alpha compounded with a near-black name color (0x334455)
    // made every locked card unreadable, not just "de-emphasized."
    const alpha = card.accessible ? 1.0 : 0.55;
    const lockedNameColor = 0x556677;
    const panel = this.add.rectangle(px(x), px(y), px(DR_CARD_W), px(DR_CARD_H), 0x0a0a18, 0.95)
      .setOrigin(0, 0).setAlpha(alpha).setStrokeStyle(px(1.5), card.companyColor, card.accessible ? 0.75 : 0.4);
    this.addC(panel);
    this.addC(this.add.text(px(x + DR_CARD_W - 4), px(y + 5), `LV${String(card.levelRequired)}`, {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(8))}px`,
      color: cssColor(card.accessible ? card.companyColor : lockedNameColor),
    }).setOrigin(1, 0).setAlpha(alpha));
    const kindColor = card.kindLabel === 'ACTIVE' ? PALETTE.generatorAmber : 0x7788aa;
    this.addC(this.add.text(px(x + 4), px(y + 5), card.kindLabel, {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(7))}px`, color: cssColor(kindColor),
    }).setOrigin(0, 0).setAlpha(alpha));
    const iconX = px(x + DR_CARD_W / 2);
    const iconY = px(y + 28);
    const iconGfx = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD).setAlpha(alpha);
    iconGfx.fillStyle(card.companyColor, card.accessible ? 0.08 : 0.05);
    iconGfx.fillCircle(iconX, iconY, px(14));
    iconGfx.fillStyle(card.companyColor, card.accessible ? 0.22 : 0.12);
    iconGfx.fillCircle(iconX, iconY, px(9));
    iconGfx.fillStyle(card.companyColor, card.accessible ? 0.75 : 0.4);
    iconGfx.fillCircle(iconX, iconY, px(5));
    this.addC(iconGfx);
    this.addC(this.add.text(px(x + DR_CARD_W / 2), px(y + 50), card.name, {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(11))}px`,
      color: cssColor(card.accessible ? card.companyColor : lockedNameColor),
      align: 'center', wordWrap: { width: px(DR_CARD_W - 10) },
    }).setOrigin(0.5, 0).setAlpha(alpha));
    if (card.description) {
      this.addC(this.add.text(px(x + DR_CARD_W / 2), px(y + 100), card.description, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(9))}px`,
        color: cssColor(0x9999bb), align: 'center',
        wordWrap: { width: px(DR_CARD_W - 10) },
      }).setOrigin(0.5, 0).setAlpha(card.accessible ? 0.85 : 0.55));
    }
  }

  // ─── Settings / text ─────────────────────────────────────────────────────

  private buildSettingsContent(): void {
    const settings = computeSettings(this.save, Sound.isMusicMuted(), Sound.isSfxMuted());
    this.lastViewModel = { panel: 'settings', ...settings };
    const baseX = px(CONTENT_PAD + 30);
    const musicLabel = (): string => `MUSIC  ${Sound.isMusicMuted() ? 'OFF' : 'ON'}`;
    const sfxLabel = (): string => `SFX    ${Sound.isSfxMuted() ? 'OFF' : 'ON'}`;
    const devLabel = (): string => `DEV MODE  ${settings.devMode ? 'ON' : 'OFF'}`;

    const musicBtn = addTextButton(this, {
      x: baseX, y: px(CONTENT_TOP + SETTINGS_ROW_1_Y), originX: 0, originY: 0.5, label: musicLabel(),
      color: settings.musicMuted ? 0x666688 : PALETTE.shieldBlue, size: 14,
      onClick: () => {
        Sound.toggleMusic();
        musicBtn.setText(musicLabel());
        musicBtn.setStyle({ color: cssColor(Sound.isMusicMuted() ? 0x666688 : PALETTE.shieldBlue) });
      },
    });
    this.addC(musicBtn);

    const sfxBtn = addTextButton(this, {
      x: baseX, y: px(CONTENT_TOP + SETTINGS_ROW_1_Y + SETTINGS_ROW_PITCH), originX: 0, originY: 0.5, label: sfxLabel(),
      color: settings.sfxMuted ? 0x666688 : PALETTE.shieldBlue, size: 14,
      onClick: () => {
        Sound.toggleSfx();
        sfxBtn.setText(sfxLabel());
        sfxBtn.setStyle({ color: cssColor(Sound.isSfxMuted() ? 0x666688 : PALETTE.shieldBlue) });
      },
    });
    this.addC(sfxBtn);

    const devOn = settings.devMode;
    const devBtn = addTextButton(this, {
      x: baseX, y: px(CONTENT_TOP + SETTINGS_ROW_1_Y + 2 * SETTINGS_ROW_PITCH), originX: 0, originY: 0.5, label: devLabel(),
      color: devOn ? PALETTE.generatorAmber : 0x666688, size: 14,
      onClick: () => {
        this.save = { ...this.save, devMode: devOn ? false : true };
        persistSave(this.save);
        this.scene.restart();
      },
    });
    this.addC(devBtn);

    const howToPlayBtn = addTextButton(this, {
      x: baseX, y: px(CONTENT_TOP + SETTINGS_HOW_TO_PLAY_Y), originX: 0, originY: 0.5, label: 'HOW TO PLAY',
      color: PALETTE.weaponCyan, size: 14,
      onClick: () => { this.showTour(); },
    });
    this.addC(howToPlayBtn);

    // devOff: one row-pitch below HOW TO PLAY. devOn: two row-pitches below the dev
    // tools section's first button (coins, stars, then reset) — both derived from
    // SETTINGS_ROW_PITCH, not hand-copied (a prior version hardcoded +362/+244 as
    // literals with a comment claiming they were "computed" when they weren't —
    // Fable's post-implementation review caught the contradiction).
    const resetY = devOn ? CONTENT_TOP + DEV_TOOLS_START_Y + 2 * SETTINGS_ROW_PITCH : CONTENT_TOP + SETTINGS_HOW_TO_PLAY_Y + SETTINGS_ROW_PITCH;
    let resetPending = false;
    const resetLabel = (): string => resetPending ? '▸ CONFIRM RESET' : 'RESET PROGRESS';
    const resetColor = (): number => resetPending ? 0xff4444 : 0x664444;
    const resetBtn = addTextButton(this, {
      x: baseX, y: px(resetY), originX: 0, originY: 0.5, label: resetLabel(), color: resetColor(), size: 14,
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

    if (devOn) this.buildDevToolsSection(baseX);
  }

  /** Save-mutating dev cheats — visually separated (own header, warning color) from
   * MUSIC/SFX above so they don't read as ordinary player settings a tester might press
   * by habit. */
  private buildDevToolsSection(baseX: number): void {
    this.addC(this.add.rectangle(baseX, px(CONTENT_TOP + DEV_TOOLS_HEADER_Y), px(180), px(1), 0x664422, 0.6).setOrigin(0, 0.5));
    this.addC(addLabel(this, { x: baseX, y: px(CONTENT_TOP + DEV_TOOLS_HEADER_Y + 6), text: 'DEV TOOLS', color: 0xff8844, size: 9 }));

    const coinsBtn = addTextButton(this, {
      x: baseX, y: px(CONTENT_TOP + DEV_TOOLS_START_Y), originX: 0, originY: 0.5, label: 'ADD 999999 COINS',
      color: PALETTE.generatorAmber, size: 14,
      onClick: () => {
        this.save = { ...this.save, coins: this.save.coins + 999999 };
        persistSave(this.save);
        this.scene.restart();
      },
    });
    this.addC(coinsBtn);

    const starsBtn = addTextButton(this, {
      x: baseX, y: px(CONTENT_TOP + DEV_TOOLS_START_Y + SETTINGS_ROW_PITCH), originX: 0, originY: 0.5, label: 'UNLOCK ALL STARS',
      color: PALETTE.generatorAmber, size: 14,
      onClick: () => {
        // Tutorials (forcedLoadout set) never earn missionStars in real play
        // (applyMissionResult, SaveManager.ts) — including them here overcounts
        // totalStars(save) past totalStarsAvailable()'s 50-star total (7 main
        // missions only), producing an impossible "63/50" in the hub header.
        const allStars: Record<string, string[]> = {};
        for (const mission of ALL_MISSIONS) {
          if (mission.forcedLoadout === undefined && mission.stars.length > 0) {
            allStars[mission.id] = mission.stars.map((s) => s.id);
          }
        }
        this.save = { ...this.save, missionStars: allStars };
        persistSave(this.save);
        this.scene.restart();
      },
    });
    this.addC(starsBtn);
  }

}

const ROW_NAME_ALPHA: Record<KindRowState, number> = {
  equipped: 1, purchasable: 1, unaffordable: 0.4, locked: 0.5,
};
const ROW_ICON_ALPHA: Record<KindRowState, number> = {
  equipped: 1, purchasable: 0.5, unaffordable: 0.2, locked: 0.15,
};

const CHIP_SUB_COLOR: Record<LevelChipViewModel['state'], 'accent' | 'blue' | 'amber' | 'grey'> = {
  equipped: 'accent',
  refund: 'blue',
  purchasable: 'amber',
  unaffordable: 'grey',
  locked: 'grey',
};

/** Resolves the prospective (not-yet-purchased) loadout for the currently selected shop kind. */
function applyProspectiveKind(
  tab: ShopTab, kind: string, previewLevel: number, current: LoadoutSnapshot, save: SaveData,
): LoadoutSnapshot | null {
  if (tab === 'ship') {
    const previewId = `ship-${kind}-${String(previewLevel)}`;
    if (save.equipped.ship === previewId) return null;
    return { ...current, ship: shipById(previewId) };
  }
  if (tab === 'weapon') {
    const spec = weaponSpecAtLevel(kind as WeaponKind, previewLevel);
    if (current.weapon?.id === spec.id) return null;
    return { ...current, weapon: spec };
  }
  if (tab === 'rear-weapon') {
    const spec = rearWeaponSpecAtLevel(kind as RearWeaponKind, previewLevel);
    if (current.rearWeapon?.id === spec.id) return null;
    return { ...current, rearWeapon: spec };
  }
  if (tab === 'side-weapon') {
    const spec = sideWeaponSpecAtLevel(kind as SideWeaponKind, previewLevel);
    if (current.sideWeapon?.id === spec.id) return null;
    return { ...current, sideWeapon: spec };
  }
  if (tab === 'shield') {
    const spec = shieldSpecAtLevel(kind as ShieldKind, previewLevel);
    if (save.equipped.shield === spec.id) return null;
    return { ...current, shield: spec };
  }
  if (tab === 'generator') {
    const spec = generatorSpecAtLevel(kind as GeneratorKind, previewLevel);
    if (save.equipped.generator === spec.id) return null;
    return { ...current, generator: spec };
  }
  if (tab === 'motor') {
    const spec = motorSpecAtLevel(kind as MotorKind, previewLevel);
    if (save.equipped.motor === spec.id) return null;
    return { ...current, motor: spec };
  }
  return null;
}
