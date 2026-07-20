import Phaser from 'phaser';
import type { LoadoutSnapshot } from '../core/types';
import { ALL_MISSIONS, missionById, setDailyMission, totalStarsAvailable } from '../data/missions';
import { DAILY_MISSION_ID, dailyDateKey, dailySeedForDate, generateDailyMission, timeUntilNextMidnight } from '../data/dailyMission';
import {
  buildLoadout, buySubscription, buySupplyCharge, dailyBestScore, downgradeSubscription,
  isDailyAvailable, loadSave, persistSave, resetSave, sellSupplyCharge, switchItem,
  switchRearWeapon, switchShip, switchSideWeapon, totalStars, unequipShield, unequipWeapon, upgradeSubscription,
} from '../save/SaveManager';
import type { SaveData } from '../save/SaveManager';
import { subscriptionById } from '../data/subscriptions';
import { DISCORD_LABEL, DISCORD_URL, openExternalLink } from './externalLinks';
import { cssColor, PALETTE } from './palette';
import { fontPx, HUB_LEFT_W, LOGICAL_HEIGHT, LOGICAL_WIDTH, px } from './layout';
import { ShopPreviewPanel } from './ShopPreviewPanel';
import type { PreviewLayout } from './ShopPreviewPanel';
import { buildGameTextures } from './textures';
import { addLabel, addTextButton, drawDevBorder, ensureMinTapTarget, UI_FONT } from './widgets';
import { ManagedObjectGroup } from './ManagedObjectGroup';
import { HubTour } from './HubTour';
import type { TourStep } from './HubTour';
import { Sound } from '../audio/SoundManager';
import {
  DEFAULT_HUB_UI_STATE, computeDetailHint, computeDispatch, computeGalaxyMap,
  computeKindRows, computeKindRowTrace, computeLevelChips, computeLoadoutRows, computeMissionDetail,
  computeSettings, computeSupplies, isShopNavLocked, resolveUiState,
} from '../viewmodel/hub';
import type {
  DailyPanelInput, DispatchCardViewModel, DispatchViewModel, GalaxyMapViewModel, HubNav, HubUIState,
  KindRowState, KindRowViewModel, LevelChipViewModel, MissionDetailViewModel, SubLevelChipViewModel,
} from '../viewmodel/hub';
import { shopSystemFor } from '../viewmodel/shopSystems';
import { applyProspectiveKind } from '../viewmodel/preview';
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
// Every row offset below must stay derived from these two, never hand-copied as its own
// literal — that desyncs silently on the next row insertion. MUSIC/SFX/DEV MODE/HOW TO
// PLAY sit on SETTINGS_ROW_PITCH;
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
  { key: 'credits',                 label: 'CREDITS',                 color: 0x8888aa },
];

// Main-menu button tour — one step per NAV_ITEMS key, matched at runtime via
// .setData('tourId', ...) in buildMainMenu. Voice matches W0_NARRATOR_EVENTS's direct
// "Commander…" briefing tone (missions.ts). CREDITS (the 5th NAV_ITEMS entry)
// deliberately has no step here: supplementary content, not core navigation, same call
// already made for DAILY MISSION's galaxy-map node.
const HUB_TOUR_STEPS: TourStep[] = [
  // No tagged target on screen matches this id on purpose — HubTour.ts's own doc
  // comment confirms a step with no match just shows its caption and NEXT/SKIP with no
  // ring or arrow, which is exactly what a general welcome (not about any one button)
  // needs.
  {
    tourId: 'welcome',
    caption: 'Welcome to Nesro Nova, Commander. This is Command — your hub between runs. A quick tour of the essentials, then you\'re free to fly.',
  },
  {
    tourId: 'missions',
    caption: 'This is your galaxy map, Commander. Pick a mission to fly — each one pays out coins and stars, and higher stars unlock better gear.',
  },
  {
    tourId: 'shop',
    caption: 'Outfit your ship here: weapon, shield, generator, motor, and more. Spend coins earned from missions to upgrade or switch systems.',
  },
  {
    tourId: 'dispatch-reinforcements',
    caption: 'Choose your reinforcements here — they shape which support cards you\'re offered mid-mission.',
  },
  {
    tourId: 'settings',
    caption: 'Audio, dev tools, and this tour again — any time. Credits, right next to it, has the developer\'s note.',
  },
];

// Screen-specific coach-mark tours — each fires once, the first time its own screen
// opens (SaveData's shopTourSeen/dispatchTourSeen), independent of HUB_TOUR_STEPS
// above and of each other. Targets are tagged onto SHOP_TABS' tab buttons and the
// Dispatch subscription rows — both always rendered regardless of what's selected, so
// (unlike the shop's kind-row list or the dispatch cards grid, which only exist once a
// kind/subscription is picked) these are safe, stable first-visit anchors.
const SHOP_TOUR_STEPS: TourStep[] = [
  {
    tourId: 'shop-tab-loadout',
    caption: 'MY LOADOUT shows your whole ship at a glance — every system you currently have equipped.',
  },
  {
    tourId: 'shop-tab-ship',
    caption: 'Every other tab works the same way: browse kinds and levels, then buy or switch — spend coins earned from missions.',
  },
  {
    tourId: 'shop-tab-supplies',
    caption: 'SUPPLIES are consumables you carry into a mission and trigger manually — stock up here before you fly.',
  },
];

const DISPATCH_TOUR_STEPS: TourStep[] = [
  {
    tourId: 'dispatch-sub-0',
    caption: 'Each reinforcement type shapes which support cards you get offered mid-mission — pick the one that matches how you like to play.',
  },
  {
    tourId: 'dispatch-sub-1',
    caption: 'Tap one to see its cards, then spend stars to upgrade its tier for a wider pool.',
  },
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
  private contentObjects = new ManagedObjectGroup();
  private preview!: ShopPreviewPanel;
  private uiState: HubUIState = DEFAULT_HUB_UI_STATE;
  /** The viewmodel object most recently computed for whatever panel is on screen —
   * inspectable via the dev-mode DEBUG button so bugs can be diagnosed from the
   * printed data itself, without reading pixels off a screenshot. */
  private lastViewModel: unknown = null;
  private hubTour: HubTour | null = null;
  private showTourOnCreate = false;
  private initialNavOnCreate: HubNav = null;

  constructor() { super('HubScene'); }

  /** Phaser calls init(data) before create() when the scene is started with data —
   * BootScene passes { showTour: true } on a save's first-ever launch; ResultScene's
   * SHOP button passes { initialNav: 'shop' } to land on the shop tab instead of the
   * main menu.
   *
   * Must consume both flags by mutating `data` in place, not just read them: Phaser's
   * SceneManager only overwrites `scene.sys.settings.data` when a *later* start() call
   * passes a truthy data object (Systems.start) — every subsequent bare
   * `scene.start('HubScene')` / `scene.restart()` (ResultScene's MISSIONS button,
   * CombatScene's exit-confirm, the settings panel's DEV MODE/ADD COINS/UNLOCK STARS
   * buttons — none of them pass data) keeps re-delivering this SAME retained object to
   * init() forever, replaying the tour (or re-landing on the shop tab) after every
   * mission and every dev-tools restart for the rest of the session.
   * Setting `data.showTour = false`/`data.initialNav = null` mutates the retained object
   * itself, so the next bare start() sees both already cleared. */
  // fallow-ignore-next-line unused-class-member
  init(data: { showTour?: boolean; initialNav?: HubNav }): void {
    this.showTourOnCreate = data.showTour === true;
    data.showTour = false;
    this.initialNavOnCreate = data.initialNav ?? null;
    data.initialNav = null;
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
    this.contentObjects = new ManagedObjectGroup();
    this.scrollingStars = [];
    // Generated once per HubScene lifetime (not per rebuildContent — it's a real cost
    // to regenerate ~80 rounds of data on every navigation/click), registered into
    // missions.ts's small daily-mission registry so CombatScene/buildMissionResult/the
    // result viewmodel can all resolve 'daily' through the one missionById() path they
    // already use for every other mission. This is the one place in the daily-mission
    // feature that reads `new Date()` — src/core/ and src/viewmodel/ both stay clock-free.
    setDailyMission(generateDailyMission(dailySeedForDate(new Date())));
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

    // showTour() always forces the main menu first (see its own comment) — if a
    // requested initialNav ran first instead, showTour()'s setNav(null) would tear the
    // just-created screen tour down before a single frame ever showed it, while
    // maybeShowScreenTour had already persisted its seen-flag: a real coach-mark burned
    // with nothing shown. Unreachable today (showTour only follows BootScene's
    // first-ever-launch flag; initialNav only follows ResultScene's SHOP button, which a
    // first-launch player can't press yet) but cheap to keep mutually exclusive.
    if (this.showTourOnCreate) this.showTour();
    else this.setNav(this.initialNavOnCreate);
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

  /** __cheat.hub.showShopTour()/showDispatchTour() — force-launch a screen tour
   * regardless of its seen-flag, mirroring cheatShowTour above. Needed for repeatable
   * screenshot/audit-tap coverage: by the time any of those tools' shots reach shop or
   * dispatch, an earlier shot in the same run has typically already visited that screen
   * once and set its seen-flag, so relying on real first-visit detection alone
   * wouldn't reliably re-trigger the tour on demand. cheatTourNext/cheatTourSkip above
   * already work generically against whichever tour is active, main-menu or screen.
   *
   * setNav's own skipScreenTour=true is required here, not optional: setNav would
   * otherwise auto-launch its OWN HubTour the moment shopTourSeen/dispatchTourSeen is
   * still false (e.g. right after reset()), and the forced instance created below would
   * silently replace it — orphaning the first instance's already-depth-raised,
   * already-disableInteractive()'d target with nothing left to ever restore it. */
  // fallow-ignore-next-line unused-class-member
  cheatShowShopTour(): void {
    this.setNav('shop', true);
    this.hubTour = new HubTour(this, SHOP_TOUR_STEPS);
  }

  // fallow-ignore-next-line unused-class-member
  cheatShowDispatchTour(): void {
    this.setNav('dispatch-reinforcements', true);
    this.hubTour = new HubTour(this, DISPATCH_TOUR_STEPS);
  }

  // fallow-ignore-next-line unused-class-member
  override update(_time: number, deltaMs: number): void {
    for (const star of this.scrollingStars) {
      star.rect.y += px(star.speed) * deltaMs / 1000;
      if (star.rect.y > px(LOGICAL_HEIGHT + 2)) star.rect.y = -px(2);
    }
    this.preview.update(deltaMs);
  }

  /** skipScreenTour: only ever true from cheatShowShopTour/cheatShowDispatchTour below,
   * which construct their own forced HubTour immediately after calling this — without
   * it, a still-unseen screen tour would auto-launch here AND get silently replaced by
   * the forced one, orphaning the first instance's depth-raised, disabled-interactive
   * target (see those cheats' own comment for the full failure mode). */
  private setNav(nav: HubNav, skipScreenTour = false): void {
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
    if (!skipScreenTour) this.maybeShowScreenTour(nav);
  }

  /** Screen-specific coach-mark tours — each fires once, the first time its own screen
   * is opened (SHOP_TOUR_STEPS/DISPATCH_TOUR_STEPS' targets are tagged in
   * buildShopContent/renderDRLeftPanel, both already rendered by the rebuildContent()
   * call just above). Independent of HUB_TOUR_STEPS (the main-menu button tour) and of
   * each other — a player can see all three, none, or any subset depending on which
   * screens they've actually visited. */
  private maybeShowScreenTour(nav: HubNav): void {
    if (nav === 'shop' && this.save.shopTourSeen !== true) {
      this.save = { ...this.save, shopTourSeen: true };
      persistSave(this.save);
      this.hubTour = new HubTour(this, SHOP_TOUR_STEPS);
    } else if (nav === 'dispatch-reinforcements' && this.save.dispatchTourSeen !== true) {
      this.save = { ...this.save, dispatchTourSeen: true };
      persistSave(this.save);
      this.hubTour = new HubTour(this, DISPATCH_TOUR_STEPS);
    }
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

  /** Dev-only: called by __cheat.selectMission(id) — the mission info panel (name,
   * stars, START button) only renders once a galaxy node is selected (a real click on
   * the node), which navTo('missions') alone can't reach. */
  // fallow-ignore-next-line unused-class-member
  cheatSelectMission(id: string): void {
    this.uiState = { ...this.uiState, selectedMissionId: id };
    this.setNav('missions');
  }

  /** Dev-only: called by __cheat.toggleAudio('music'|'sfx') — headless equivalent of
   * tapping the Settings panel's MUSIC/SFX button (real click handlers call
   * Sound.toggle*() directly without a full rebuild; re-running setNav('settings') here
   * instead gets the same result through the normal render path, which is simpler than
   * duplicating the real onClick's manual label/style patch for a dev-only entry point). */
  // fallow-ignore-next-line unused-class-member
  cheatToggleAudio(kind: 'music' | 'sfx'): void {
    if (kind === 'music') Sound.toggleMusic();
    else Sound.toggleSfx();
    this.setNav('settings');
  }

  /** Dev-only: called by __cheat.navShop(tab) to jump directly to a shop tab. */
  // fallow-ignore-next-line unused-class-member
  cheatNavShop(tab: string): void {
    this.uiState = resolveUiState(this.save, { ...this.uiState, tab: tab as ShopTab });
    this.setNav('shop');
  }

  private rebuildContent(): void {
    this.contentObjects.destroyAll();

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
      case 'credits':                 this.buildCreditsContent(); break;
    }
  }

  private addC<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    return this.contentObjects.add(obj);
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

    // Above the nav buttons, not below them: HubTour's popup card (PANEL_CY=445,
    // HubTour.ts) occupies a fixed y=370-520 band on every step regardless of which nav
    // button is highlighted, and the 5 nav buttons already fill the space up to y=398 —
    // there's no room below them that isn't also the tour's own footprint.
    this.addC(addTextButton(this, {
      x: px(LOGICAL_WIDTH / 2), y: px(98), size: 11,
      label: DISCORD_LABEL, color: 0x8899ff,
      onClick: () => { openExternalLink(DISCORD_URL); },
    }));

    const BTN_GAP = 64;
    const totalH = (NAV_ITEMS.length - 1) * BTN_GAP;
    const startY = Math.round((LOGICAL_HEIGHT - totalH) / 2);
    const shopLocked = isShopNavLocked(this.save);
    NAV_ITEMS.forEach((item, i) => {
      const locked = item.key === 'shop' && shopLocked;
      const btn = this.addC(addTextButton(this, {
        x: px(LOGICAL_WIDTH / 2), y: px(startY + i * BTN_GAP),
        label: locked ? `${item.label} (LOCKED)` : item.label,
        color: locked ? 0x555577 : item.color, size: 22,
        onClick: () => {
          // Ship Configuration always opens on My Loadout — cheatNavShop sets its
          // own tab right before calling setNav, so this only affects real clicks.
          if (item.key === 'shop') this.uiState = { ...this.uiState, tab: 'loadout' };
          this.setNav(item.key);
        },
      }).setData('tourId', item.key)); // matched by HUB_TOUR_STEPS/HubTour.ts
      if (locked) {
        // disableInteractive (not just the onClick guard above) also suppresses
        // addTextButton's own pointerover/pointerout hover handlers, which would
        // otherwise flash the button back to full alpha on touch/hover.
        btn.disableInteractive();
        btn.setAlpha(0.5);
      }
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

  /** Freshly computed on every call (cheap) rather than cached — "available today" and
   * the reset countdown are both functions of the current moment, not just the save. */
  private computeDailyPanelInput(): DailyPanelInput {
    const now = new Date();
    const available = isDailyAvailable(this.save, dailyDateKey(now));
    return {
      spec: missionById(DAILY_MISSION_ID),
      available,
      bestScore: dailyBestScore(this.save),
      resetInLabel: available ? '' : timeUntilNextMidnight(now),
    };
  }

  private buildMissionsContent(): void {
    // The top nav bar (setNav()) already shows ★/coins for every screen — this used to
    // repeat it a second time, top-left, directly under the top-right original.
    const daily = this.computeDailyPanelInput();
    const map = computeGalaxyMap(this.save, this.uiState.selectedMissionId, daily);
    const gfx = this.addC(this.add.graphics().setDepth(2));
    this.renderGalaxyConnections(gfx, map);
    map.missions.forEach((mission) => { this.renderGalaxyNode(gfx, mission); });
    this.renderCampaignLabels();

    this.addC(this.add.rectangle(0, px(INFO_PANEL_TOP - 1), px(LOGICAL_WIDTH), px(1), 0x222244).setOrigin(0, 0));
    const missionDetail = computeMissionDetail(this.save, this.uiState.selectedMissionId, daily);
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

  /** Static section captions above the two node clusters — GALAXY_NODES positions t1-t4
   * top-left and m1-m6 to the right, so fixed coordinates (not per-mission math) are
   * enough for this minimal grouping; a future multi-act campaign would need real
   * layout logic instead. */
  private renderCampaignLabels(): void {
    this.addC(this.add.text(px(115), px(82), 'TUTORIAL', {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(10))}px`, color: cssColor(PALETTE.generatorAmber),
    }).setOrigin(0.5, 0.5));
    this.addC(this.add.text(px(370), px(82), 'ACT 1', {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(10))}px`, color: cssColor(PALETTE.weaponCyan),
    }).setOrigin(0.5, 0.5));
  }

  private renderGalaxyNode(gfx: Phaser.GameObjects.Graphics, mission: GalaxyMapViewModel['missions'][number]): void {
    // Motor magenta is otherwise unused by galaxy nodes (tutorial=amber, main=cyan) —
    // reusing it here for the daily keeps it inside the existing system-coded palette
    // (v2/CLAUDE.md) instead of inventing a new hex value for one node.
    const nodeColor = mission.isDaily ? PALETTE.motorMagenta : (mission.isTutorial ? PALETTE.generatorAmber : PALETTE.weaponCyan);
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
    const labelColor = !mission.unlocked ? 0x445566 : (mission.isSelected ? nodeColor : (mission.isDaily ? 0xcc88bb : (mission.isTutorial ? 0xaa8833 : 0x99aacc)));
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
      // Onboarding lives here, not a separate blocking scene — this is the very first
      // thing a new player's eye lands on once they open the missions screen, and it's
      // empty space otherwise.
      this.addC(this.add.text(px(LOGICAL_WIDTH / 2), px(INFO_PANEL_TOP + INFO_PANEL_H / 2), 'Select a mission', {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(11))}px`, color: cssColor(0x445566),
      }).setOrigin(0.5));
      return;
    }

    // Checked before the generic canStart/"LOCKED" branch below. When `daily` is
    // present the node has passed its m1-completion gate (computeMissionDetail omits
    // the field entirely while locked, falling through to the generic LOCKED panel), so
    // detail.canStart here means "available today," which needs its own copy (best
    // score + reset countdown), not the campaign's bare "LOCKED" message.
    if (detail.daily !== undefined) {
      this.renderDailyInfoPanel(detail, detail.daily);
      return;
    }

    // Same defense-in-depth as the START button below (only cheat-reachable — real taps
    // can't select a locked node, HubScene.ts's renderMissionNode): never print the real
    // name, duration, or full star list for a locked mission — that's exactly the
    // information the "???" galaxy-map label exists to hide.
    if (!detail.canStart) {
      this.addC(this.add.text(px(LOGICAL_WIDTH / 2), px(INFO_PANEL_TOP + INFO_PANEL_H / 2), 'LOCKED', {
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
      // Two columns of up to 4, not one column of up to 8 — a single column at 18px/row
      // ran to topY+22+18(duration)+8*18=192px past the 152px-tall info panel (and off
      // the bottom of the 540px screen entirely for the last 2 of 8 stars on every main
      // mission). Never screenshot-tested before (no __cheat reached this panel), found
      // via tools/screenshot.ts's hub-mission-detail-main shot, not eyeballed.
      const STAR_ROWS_PER_COL = 4;
      const STAR_COL_GAP = 230;
      const STAR_ROW_H = 18;
      detail.stars.forEach((star, i) => {
        const col = Math.floor(i / STAR_ROWS_PER_COL);
        const row = i % STAR_ROWS_PER_COL;
        this.addC(this.add.text(px(panelX + col * STAR_COL_GAP), px(detailY + row * STAR_ROW_H), `${star.earned ? '★' : '☆'}  ${star.description}`, {
          fontFamily: UI_FONT, fontSize: `${String(fontPx(10))}px`,
          color: cssColor(star.earned ? PALETTE.generatorAmber : 0x556677),
        }));
      });
    }

    const missionId = this.uiState.selectedMissionId;
    if (missionId === null) return;
    // detail.canStart is unconditionally true past this point — the early "LOCKED"
    // return above already handles the false case for the whole panel, name/stars
    // included, not just this button.
    this.addC(addTextButton(this, {
      x: px(Math.round(LOGICAL_WIDTH * 0.76)), y: px(INFO_PANEL_TOP + INFO_PANEL_H / 2),
      label: '▶  START', color: PALETTE.weaponCyan, size: 14,
      onClick: () => { this.scene.start('CombatScene', { missionId }); },
    }));
  }

  /** Same layout skeleton as renderMissionInfoPanel (name/duration/button row), swapping
   * the campaign's star list for a best-score line and PLAY/"already played" state —
   * the daily is never locked (isMissionUnlocked always true, no incoming unlock edge),
   * so this never needs the generic "LOCKED" branch at all. */
  private renderDailyInfoPanel(detail: MissionDetailViewModel, daily: NonNullable<MissionDetailViewModel['daily']>): void {
    const nodeColor = PALETTE.motorMagenta;
    const panelX = CONTENT_PAD + 4;
    const topY = INFO_PANEL_TOP + 16;

    this.addC(this.add.text(px(panelX), px(topY), detail.name, {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(15))}px`, color: cssColor(nodeColor),
    }));

    const durationY = topY + 22;
    this.addC(this.add.text(px(panelX), px(durationY), detail.duration, {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(10))}px`, color: cssColor(0x667788),
    }));

    const bestScoreY = durationY + 18;
    this.addC(this.add.text(px(panelX), px(bestScoreY), `Best: ${String(daily.bestScore)} coins`, {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(11))}px`, color: cssColor(PALETTE.generatorAmber),
    }));

    // Motor is neutralized to Lv1 for this mission only (neutralizeMotorForDaily,
    // src/data/loadouts.ts) — a faster motor otherwise scores worse here, so the copy
    // says so rather than let a player wonder why their upgraded motor did nothing.
    const motorNoteY = bestScoreY + 16;
    this.addC(this.add.text(px(panelX), px(motorNoteY), 'Motor governed to baseline here', {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(9))}px`, color: cssColor(0x667788),
    }));

    const missionId = this.uiState.selectedMissionId;
    if (missionId === null) return;
    if (daily.available) {
      this.addC(addTextButton(this, {
        x: px(Math.round(LOGICAL_WIDTH * 0.76)), y: px(INFO_PANEL_TOP + INFO_PANEL_H / 2),
        label: '▶  PLAY', color: nodeColor, size: 14,
        onClick: () => { this.scene.start('CombatScene', { missionId }); },
      }));
    } else {
      this.addC(this.add.text(
        px(Math.round(LOGICAL_WIDTH * 0.76)), px(INFO_PANEL_TOP + INFO_PANEL_H / 2),
        `Played today\nresets in ${daily.resetInLabel}`,
        { fontFamily: UI_FONT, fontSize: `${String(fontPx(10))}px`, color: cssColor(0x556677), align: 'center' },
      ).setOrigin(0.5));
    }
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
          .setOrigin(0, 0.5).setInteractive({ useHandCursor: true })
          .setData('tourId', `shop-tab-${tab.key}`), // matched by SHOP_TOUR_STEPS
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
        }).setOrigin(0.5).setAlpha(active ? 1 : 0.8)
          // Same tourId as this tab's own bg rectangle above — HubTour.ts raises every
          // GameObject sharing a tourId, not just one; tagging only the bg leaves this
          // label hidden behind the tour's dim backdrop.
          .setData('tourId', `shop-tab-${tab.key}`),
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

  /** Shared cell renderer for renderLevelChips/renderSubLevelChips below — the
   * background rectangle + label + sub-label skeleton is identical between the two.
   * Everything genuinely different (hit-area strategy, dimmed/interactive logic, tap
   * handler) stays in each caller, not merged in here — see each caller's own comments.
   * Returns the rectangle so the caller can still attach its own interactivity. */
  private renderChipCell(opts: {
    x: number; y: number; width: number; height: number;
    isCurrent: boolean; accentColor: number;
    label: string; labelColor: number; subLabel: string; subColor: number;
  }): Phaser.GameObjects.Rectangle {
    const { x, y, width, height, isCurrent, accentColor, label, labelColor, subLabel, subColor } = opts;
    const rect = this.add.rectangle(px(x), px(y), px(width), px(height), isCurrent ? 0x0c1a2e : 0x0e0e1e).setOrigin(0.5);
    if (isCurrent) rect.setStrokeStyle(px(1), accentColor, 0.8);
    this.addC(this.add.text(px(x), px(y - 7), label, {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(9))}px`, color: cssColor(labelColor),
    }).setOrigin(0.5));
    this.addC(this.add.text(px(x), px(y + 8), subLabel, {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(8))}px`, color: cssColor(subColor),
    }).setOrigin(0.5));
    return rect;
  }

  private renderLevelChips(chips: LevelChipViewModel[], config: ShopSystemConfig): void {
    const count = chips.length;
    if (count === 0) return;
    const chipW = Math.floor(SHOP_ITEM_W / count);
    const chipH = 32;
    // A 6-row kind list (rear weapon always; weapon once y2010 unlocks) bottoms out at
    // y=438 (CONTENT_TOP+22+6*SHOP_ROW_H) — the +28 offset here keeps the chip top
    // clear of that row's tap area.
    const chipCY = SHOP_ACTION_Y + 28;
    const accent = accentColorFor(config.systemKey);

    chips.forEach((chip, i) => {
      const chipX = SHOP_ITEM_X + i * chipW + chipW / 2;
      const isCurrent = chip.state === 'equipped';
      const labelColor = chip.state === 'locked' ? 0x444466 : isCurrent ? accent : (chip.state === 'unaffordable' ? 0x444466 : PALETTE.hullWhite);
      const subColor = CHIP_SUB_COLOR[chip.state] === 'accent' ? accent
        : CHIP_SUB_COLOR[chip.state] === 'blue' ? PALETTE.shieldBlue
          : CHIP_SUB_COLOR[chip.state] === 'amber' ? PALETTE.generatorAmber
            : 0x445566;
      const rect = this.renderChipCell({
        x: chipX, y: chipCY, width: chipW - 4, height: chipH, isCurrent, accentColor: accent,
        label: chip.label, labelColor, subLabel: chip.subLabel, subColor,
      });
      const dimmed = chip.state === 'locked' || chip.state === 'unaffordable';
      if (!isCurrent) {
        if (dimmed) { rect.setAlpha(0.35); } else {
          // 44px-tall hit area: the 32px chip visual is below the mobile tap-target
          // floor. Extended DOWNWARD only (hitArea local (0,0) = the rect's top-left),
          // not centered via ensureMinTapTarget — a centered expansion would overlap the
          // kind-row list directly above the chips. Width (≥55px at the widest chip
          // count) already clears the floor.
          rect.setInteractive({
            hitArea: new Phaser.Geom.Rectangle(0, 0, rect.width, Math.max(rect.height, px(44))),
            hitAreaCallback: (r: Phaser.Geom.Rectangle, x: number, y: number) => Phaser.Geom.Rectangle.Contains(r, x, y),
            useHandCursor: true,
          });
          rect.on('pointerdown', () => { this.onLevelChipTap(chip, config); });
          rect.on('pointerover', () => { rect.setFillStyle(0x151530); });
          rect.on('pointerout', () => { rect.setFillStyle(0x0e0e1e); });
        }
      }
      this.addC(rect);
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
          .setOrigin(0, 0).setInteractive({ useHandCursor: true })
          .setData('tourId', `dispatch-sub-${String(i)}`), // matched by DISPATCH_TOUR_STEPS
      );
      if (sub.isSelected) bg.setStrokeStyle(px(1), sub.color, 0.5);
      bg.on('pointerdown', () => {
        const wasSelected = this.uiState.selectedSubscriptionId === sub.id;
        this.uiState = { ...this.uiState, selectedSubscriptionId: sub.id, dispatchPage: wasSelected ? this.uiState.dispatchPage : 1 };
        this.rebuildContent();
      });
      // Same tourId as this row's own bg rectangle above, on all three label Texts —
      // HubTour.ts raises every GameObject sharing a tourId, not just one; tagging only
      // the bg leaves these labels hidden behind the tour's dim backdrop. Tagged on
      // every row (not just the two DISPATCH_TOUR_STEPS actually target), matching the
      // bg's own tagging — harmless, since HubTour only ever searches for tourIds its
      // current steps list mentions.
      const rowTourId = `dispatch-sub-${String(i)}`;
      this.addC(this.add.text(px(DR_LEFT_X + 8), px(midY - 10), sub.name, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(12))}px`,
        color: cssColor(sub.isSelected ? sub.color : (sub.ownedLevel > 0 ? 0x9999bb : 0x555577)),
      }).setOrigin(0, 0.5).setData('tourId', rowTourId));
      this.addC(this.add.text(px(DR_LEFT_W - 6), px(midY - 10), sub.dots, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(10))}px`,
        color: cssColor(sub.ownedLevel > 0 ? sub.color : 0x444466),
      }).setOrigin(1, 0.5).setData('tourId', rowTourId));
      this.addC(this.add.text(px(DR_LEFT_X + 8), px(midY + 10), sub.statusText, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(9))}px`,
        color: cssColor(sub.ownedLevel > 0 ? 0x778899 : 0x334455),
      }).setOrigin(0, 0.5).setData('tourId', rowTourId));
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
    // DR_LEFT_X, not a hardcoded 4: this row used to start inside the 20px mobile
    // safe-zone its own sibling subscription rows already respect (B5) — which also
    // made ensureMinTapTarget's edge-shift push chip 1's hit area into chip 2's.
    const chipW = Math.floor((DR_LEFT_W - DR_LEFT_X - 4) / count);
    const chipH = 32;
    const chipCY = topY + chipH / 2;

    chips.forEach((chip, i) => {
      const isCurrent = chip.state === 'current';
      const dimmed = chip.state === 'locked' || chip.state === 'unaffordable';
      const chipX = DR_LEFT_X + i * chipW + chipW / 2;
      const labelColor = chip.state === 'locked' ? 0x444466 : isCurrent ? accentColor : (chip.state === 'unaffordable' ? 0x444466 : PALETTE.hullWhite);
      const subColor = chip.state === 'locked' ? 0x445566
        : isCurrent ? accentColor
          : chip.subLabel.startsWith('+') || chip.subLabel === 'FREE' ? PALETTE.shieldBlue
            : chip.state === 'unaffordable' ? 0x445566 : PALETTE.generatorAmber;

      const rect = this.renderChipCell({
        x: chipX, y: chipCY, width: chipW - 3, height: chipH, isCurrent, accentColor,
        label: chip.label, labelColor, subLabel: chip.subLabel, subColor,
      });
      if (!isCurrent) {
        if (dimmed) { rect.setAlpha(0.35); } else {
          // Same 44px tap-target floor as renderLevelChips above (B5) — see the
          // comment there. Centered expansion is safe here: the subscription rows
          // above end 9px clear of the expanded area and only inert text sits below.
          ensureMinTapTarget(rect);
          rect.on('pointerdown', () => { this.onSubLevelChipTap(chip); });
          rect.on('pointerover', () => { rect.setFillStyle(0x151530); });
          rect.on('pointerout', () => { rect.setFillStyle(0x0e0e1e); });
        }
      }
      this.addC(rect);
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
    // tools section's first button (coins, stars, then reset) — both must stay derived
    // from SETTINGS_ROW_PITCH, never hand-copied as their own literal.
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

    if (devOn) this.buildDevToolsSection(baseX);
  }

  /** The "Hi, I am Nesro..." developer note lives in its own nav panel, single centered
   * column since there's nothing else on this screen to split against. */
  private buildCreditsContent(): void {
    this.lastViewModel = { panel: 'credits' };
    const colX = Math.round(LOGICAL_WIDTH / 2) - 160;
    const colW = 320;
    this.addC(addLabel(this, { x: px(colX), y: px(CONTENT_TOP + 8), text: 'ABOUT', color: PALETTE.shieldBlue, size: 11 }));
    this.addC(this.add.text(px(colX), px(CONTENT_TOP + 26), ABOUT_TEXT, {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(11))}px`,
      color: cssColor(0x8888aa), lineSpacing: px(4),
      wordWrap: { width: px(colW) },
    }));
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

