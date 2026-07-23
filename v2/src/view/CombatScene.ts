import Phaser from 'phaser';
import { resolveAbilityAction } from '../core/cards';
import { activateAbility, fireSideWeapon, nearestEnemyAhead, setPriorityTarget, toggleAutoFire, toggleAutoShield, toggleRearWeapon } from '../core/combat';
import { resolveNarrator } from '../core/narrator';
import { HOLD_CHARGE_TIER_2_TICKS, HOLD_CHARGE_TIER_3_TICKS, LANE_LENGTH, MS_PER_TICK } from '../core/constants';
import { buildMissionResult } from '../core/result';
import { createCoreState } from '../core/state';
import { applyBoost } from '../core/supplies';
import { abandonRun, advanceTick } from '../core/tick';
import type { CoreState, EnemyState, MissionSpec } from '../core/types';
import { abilityById, abilityPoolForLoadout } from '../data/cards';
import { missionById, narratorEventsForAttempt } from '../data/missions';
import { DAILY_MISSION_ID, dailyDateKey } from '../data/dailyMission';
import { getStoryLine } from '../data/story';
import { applyDisableAuxWeapons, applyDisableWeapon, applyGeneratorOverride, neutralizeMotorForDaily, resolveForcedLoadout } from '../data/loadouts';
import { computeSideWeaponButtonViewModel } from '../viewmodel/combat';
import { ABILITY_COMPANY_COLORS } from '../viewmodel/companyColors';
import { applyDailyResult, applyMissionResult, buildLoadout, isDailyAvailable, loadSave, reserveDailyAttempt } from '../save/SaveManager';
import type { SaveData } from '../save/SaveManager';
import { Sound } from '../audio/SoundManager';
import { CardOverlay } from './CardOverlay';
import { CombatHud, HUD_ROW_ENRG, HUD_ROW_SHLD, hudRowScreenBounds } from './CombatHud';
import { NarratorBar } from './NarratorBar';
import { SupplyButtons } from './SupplyButtons';
import { cssColor, PALETTE } from './palette';
import { BTN_PANEL_W, BTN_X, DPR, fontPx, GAME_WIDTH, GAME_X, INFO_PANEL_W, LOGICAL_HEIGHT, LOGICAL_WIDTH, px, SHIP_GUN_X_OFFSET, SHIP_GUN_Y_OFFSET } from './layout';
import { buildGameTextures, laserTextureForWeaponId, rearBoltTextureKey, sideBoltTextureKey, sideWeaponKindColor, textureForEnemyKind } from './textures';
import { iconTextureForSideWeaponId, motorKindColorFromId, motorLevelFromId, splitWeaponId, textureForShipId } from './textureKeys';
import { drawGeneratorCore, drawRearWeaponIndicator, drawShieldRings, drawSideWeaponIndicator, renderGunIndicator, renderThrusterAssembly, tickLaserBolts, tickMuzzleFlashes } from './shipRenderers';
import type { LaserBolt, MuzzleFlash } from './shipRenderers';
import { tickBurstParticles, tickFloatingTexts, tickShieldPulseRings } from './combatEffects';
import type { BurstParticle, FloatingText, ShieldPulseRing } from './combatEffects';
import { CombatCheats } from './CombatCheats';
import { addModalBackdrop, addTextButton, drawDevBorder, drawPointerArrow, ensureMinTapTarget, UI_FONT } from './widgets';
import { ManagedObjectGroup } from './ManagedObjectGroup';

// Ship sits at the bottom-centre of the game field; enemies stream from the top.
const SHIP_CENTER_X = GAME_X + Math.floor(GAME_WIDTH / 2); // 480 logical
const SHIP_Y = LOGICAL_HEIGHT - 80;                         // 460 logical
const GAME_TOP_Y = 30;                                      // top margin for progress bar
// Boss-only floor for the overhead HP bar/label's Y position. Every enemy's sy equals
// exactly GAME_TOP_Y at spawn, and the bar/label sit `sy - offset` above that. For
// ordinary enemies (offset 34) that's a ~4px overshoot, gone within a tick of normal
// movement. For the boss (offset 58, speed 0.25, plus its own APPROACH/STALL cycle —
// conveyor.ts) it's a multi-second window where the bar/label render with a negative Y,
// clipped off-canvas. Deliberately boss-only, not a floor shared by every enemy: a
// shared floor would pin any two closely-spawned regular enemies to the exact same Y
// for their first ~50px of travel (single-lane game, sprite.x is always
// SHIP_CENTER_X), rendering two overprinting, conflicting HP labels. +16 keeps the
// boss overlay clear of the mission-title text's own row.
const MIN_BOSS_HP_OVERLAY_TOP_Y = GAME_TOP_Y + 16;
// Half of the ship's baked 52px-tall texture (textures.ts's buildShipTextures) — used by
// laneToY so a collision (core distance=0) reads as the enemy's edge touching the ship's
// edge, not the two sprites' centers overlapping.
const SHIP_VISUAL_RADIUS = 26;
// Half of each enemy kind's baked texture size (textures.ts's buildEnemyTextures) — same
// edge-touching purpose as SHIP_VISUAL_RADIUS above.
const ENEMY_VISUAL_RADIUS: Record<string, number> = {
  fodder: 24, striker: 26, tank: 28, swarm: 15, blocker: 32,
  guardian: 26, turret: 30, kamikaze: 20, boss: 48, booster: 26,
};
const ENEMY_VISUAL_RADIUS_FALLBACK = ENEMY_VISUAL_RADIUS['fodder'] ?? 24;
const LASER_TRAVEL_MS = 180;
// Slower than LASER_TRAVEL_MS — a manual charged shot should read as heavier than autofire.
const SIDE_BOLT_TRAVEL_MS = 420;
// Guaranteed minimum flight distance (logical px) so a shot at a near enemy still reads as a
// launch rather than an instant flash right at the ship.
const SIDE_BOLT_MIN_TRAVEL = 180;
// Side-weapon bolts are a manual charged shot — bigger and brighter than autofire lasers.
const SIDE_BOLT_SCALE = 1.7;
const MUZZLE_FLASH_MS = 100;
// Cap per-frame catch-up: if the tab is backgrounded on mobile, deltaMs can spike to many
// seconds. Without this the accumulator would fast-forward dozens of ticks in one frame and
// the mission could resolve the instant the player returns. 250 ms = at most ~3 ticks/frame.
const MAX_CATCH_UP_MS = 250;
// Delay before maybeFinish() cuts to ResultScene, per outcome. Long enough to see the
// final HUD state (a floating number's own lifetime is 700ms) before the cut; victory
// gets the longest hold since it's the one outcome worth lingering on. Abandon stays
// short — a voluntary quit should feel snappy, not padded.
const VICTORY_EXIT_DELAY_MS = 2000;
const DEFEAT_EXIT_DELAY_MS = 1400;
const ABANDON_EXIT_DELAY_MS = 600;
// Right button panel: a dynamic top-down layout, not fixed Y offsets — the row count
// varies with loadout (toggle buttons: fire+shield always, rear/side conditional;
// supplies: 0-3 owned types), and fixed offsets already caused one real bug (a
// changelog note: "SupplyButtons' BUTTONS_TOP was never adjusted when the side-weapon
// toggle pushed the ability slots down"). Every row is 44px-pitch (mobile safe-zone
// rule, docs/design/04-screens-and-layout.md — checked at runtime by
// tools/tap-target-audit.ts) so hit areas from adjacent rows never overlap; each row's
// *visual* box renders smaller than the pitch so a small gap reads between rows even
// though hit areas sit pitch-to-pitch with zero gap.
const PANEL_TOP_MARGIN = 20;
const PANEL_BOTTOM_MARGIN = 20;
const ROW_PITCH = 44;
const SECTION_GAP = 8;
const TOGGLE_VISUAL_H = 36;
const ABILITY_SLOT_H = 36;
const EXIT_VISUAL_H = 36;

// Button-panel fill colors — the fill (not just the label text) now signals on/off state,
// since text-color-only feedback was too easy to miss at a glance.
const TOGGLE_OFF_FILL = 0x0a0a1a;
const FIRE_ON_FILL = 0x0a2614;
const REAR_ON_FILL = 0x142c0a;
const SHIELD_ON_FILL = 0x0a1830;
const SIDE_WEAPON_READY_FILL = 0x2a0f1c;
const SIDE_WEAPON_EMPTY_FILL = 0x160a12;
const ABILITY_SLOT_EMPTY_FILL = 0x080818;
const ABILITY_SLOT_READY_FILL = 0x0f3a14;
const ABILITY_SLOT_COOLDOWN_FILL = 0x2a1f0a;

// How fast shield hit-flash decays (full fade in ~550ms, matching v1 ShieldVisual).
const SHIELD_FLASH_DECAY = 1.8;
// Shield ring radius grows with remaining shield fraction — a live, continuous
// reading of `ship.shield`. Contrast with ShopPreviewPanel's discrete per-tier
// radius, which reads a simulated fraction instead — see that file for why.
const SHIELD_BASE_RADIUS = 26;
const SHIELD_RADIUS_PER_FRACTION = 6;

// Ship-side hull/shield bars sit just below the shield ring's own footprint
// (SHIELD_BASE_RADIUS + SHIELD_RADIUS_PER_FRACTION, ~32px) so they never overlap it.
const SHIP_STATUS_BAR_W = 44;
const SHIP_STATUS_BAR_H = 4;
const SHIP_STATUS_BAR_GAP = 3;
const SHIP_STATUS_BAR_Y_OFFSET = 36;
const SHIELD_GLOW_BASE_ALPHA = 0.04;
const SHIELD_GLOW_FLASH_ALPHA = 0.06;
const SHIELD_GLOW_RADIUS_PAD = 6;
// Pulse ring expands this many logical px/s and fades this much alpha/s.
const PULSE_RING_EXPAND_PX_S = 120;
const PULSE_RING_FADE_S = 1.6;
// Hull fraction below which the red vignette starts appearing.
const VIGNETTE_THRESHOLD = 0.35;
// Peak alpha of the death flash — kept low enough that HUD text stays legible under it.
const DEATH_FLASH_ALPHA = 0.4;
// Matches the healthy-tier color in drawEnemyHpBar's own frac>0.55 branch — the booster
// buff line reuses it so "connected to an HP bar" reads as one consistent color language.
const BOOSTER_BUFF_GREEN = 0x22ee44;
// Regen ticks every 100ms; throttle the floating-number feedback to something readable.
const HEAL_FLOAT_INTERVAL_MS = 700;

// Which HUD row (if any) a tutorial's narrator line should point a live arrow at while
// it's shown. Keyed by missionId, then narratorEvents index (a mission's Nth event, 0-
// based — see narratorEventIndex), then line index within that event — a view-only
// presentation choice, deliberately NOT part of core's NarratorEvent (src/core/types.ts
// stays plain text data). The event-index level matters once a mission has more than
// one narratorEvent: narratorLineIdx resets to 0 for every new event, so a flat
// missionId->lineIndex map would ambiguously apply event A's arrow to event B's
// same-numbered line. Keep in sync by hand with T1_NARRATOR_EVENTS/T2_NARRATOR_EVENTS's
// line order (missions.ts).
const NARRATOR_ARROW_TARGETS: Record<string, Record<number, Record<number, number>>> = {
  t1: {
    0: { 1: HUD_ROW_SHLD, 2: HUD_ROW_ENRG, 3: HUD_ROW_SHLD },
    1: { 0: HUD_ROW_SHLD },
  },
  t2: { 0: { 0: HUD_ROW_ENRG, 1: HUD_ROW_ENRG, 2: HUD_ROW_ENRG } },
};

/** Pre-tick core-state snapshot — compared against post-tick state to detect events worth
 * a visual/audio reaction (shots fired, kills, shield/hull deltas, collisions, enemy shots). */
interface PreTickSnapshot {
  hull: number; shield: number; shots: number; rearShots: number; kills: number; collisions: number;
  timers: Map<number, number>;
}

export interface CombatSceneData {
  missionId: string;
}

/**
 * View layer only (V2_HANDOFF.md §2.1): advances the pure core on a fixed 100 ms
 * accumulator and interpolates entity positions between ticks. While a support call
 * is pending the core pauses itself; this scene just shows the card overlay.
 */
export class CombatScene extends Phaser.Scene {
  core!: CoreState; // not private: CombatCheats.ts needs direct access
  private save!: SaveData;
  private hud!: CombatHud;
  private cardOverlay!: CardOverlay;
  private supplyButtons!: SupplyButtons;
  narrator!: NarratorBar; // not private: CombatCheats.ts needs direct access
  private cheats!: CombatCheats;
  private shipSprite!: Phaser.GameObjects.Image;
  private thrusterGfx!: Phaser.GameObjects.Graphics;
  private motorGfx!: Phaser.GameObjects.Graphics;
  private motorLevel: 1 | 2 | 3 = 1;
  private motorKindColor: number = 0xff44cc;
  private thrusterPhase = 0;
  private enemySprites = new Map<number, Phaser.GameObjects.Image>();
  /** Current/max HP text over each enemy's bar. A separate Text-object Map, not drawn
   * on hpBarGfx — Graphics can't render text, and unlike the bar fill (redrawn from
   * scratch every frame) these persist and reposition, same lifecycle as
   * enemySprites. */
  private hpLabels = new Map<number, Phaser.GameObjects.Text>();
  private targetMarkerGfx!: Phaser.GameObjects.Graphics;
  private targetMarkerPhase = 0;
  private boosterBuffGfx!: Phaser.GameObjects.Graphics;
  private previousDistances = new Map<number, number>();
  private laserBolts: LaserBolt[] = [];
  private enemyBolts: { rect: Phaser.GameObjects.Rectangle; glow: Phaser.GameObjects.Rectangle; vy: number; targetY: number }[] = [];
  private stars: { rect: Phaser.GameObjects.Rectangle; speed: number }[] = [];
  private muzzleFlashes: MuzzleFlash[] = [];
  private muzzleFlashGfx!: Phaser.GameObjects.Graphics;
  private gunGfx!: Phaser.GameObjects.Graphics;
  private rearGunGfx!: Phaser.GameObjects.Graphics;
  private sideGunGfx!: Phaser.GameObjects.Graphics;
  private generatorGfx!: Phaser.GameObjects.Graphics;
  private gunToggle = false;
  private rearLaserBolts: LaserBolt[] = [];
  private sideLaserBolts: LaserBolt[] = [];
  private hpBarGfx!: Phaser.GameObjects.Graphics;
  private shipStatusBarGfx!: Phaser.GameObjects.Graphics;

  private shieldGfx!: Phaser.GameObjects.Graphics;
  private accumulatorMs = 0;
  private finished = false;
  /** Set only by confirmAbandon() for the daily mission's voluntary quit path — lets
   * maybeFinish() tell "player chose to leave with a live ship" apart from a real
   * hull-zero defeat, the only OTHER source of core status 'defeat' (resolveOutcome,
   * core/tick.ts — timeline exhaustion always resolves to 'victory', never 'defeat').
   * abandonRun's own doc comment explains why it reuses 'defeat' rather than adding a
   * third core status just for this. Must be reset alongside `finished` below — Phaser
   * reuses this scene instance across scene.start() calls, so a stale `true` here would
   * mislabel a LATER real defeat (e.g. abandon the daily, then later die for real on a
   * campaign mission in the same session) as an abandon. */
  private wasAbandoned = false;
  /** For the daily mission only: the date key captured once at reservation time
   * (CombatScene.create) and reused at payout (maybeFinish) — never recomputed from a
   * fresh `new Date()`, which would risk paying out against the WRONG day on a run long
   * enough to cross local midnight. Null for every non-daily mission. */
  private dailyTodayStr: string | null = null;
  private narratorSupportCallShown = false;
  private narratorBossShown = false;
  private narratorBoosterShown = false;

  // Visual effects — combat feedback
  private particleGfx!: Phaser.GameObjects.Graphics;
  private vignetteGfx!: Phaser.GameObjects.Graphics;
  private deathFlashGfx!: Phaser.GameObjects.Graphics;
  private shieldPulseGfx!: Phaser.GameObjects.Graphics;
  private burstParticles: BurstParticle[] = [];
  private floatingTexts: FloatingText[] = [];
  private shieldPulseRings: ShieldPulseRing[] = [];
  private shieldHitFlash = 0;
  /** "ABILITIES" header — shown after first ability is picked. */
  private cardsHeader!: Phaser.GameObjects.Text;
  /** Ability name + description labels — rebuilt on every new pick. */
  private cardEntries: Phaser.GameObjects.Text[] = [];
  /** Toggle button backgrounds + labels for auto-fire, rear weapon, and auto-shield — the
   * backgrounds are class fields (not locals) so updateAbilityBar() can recolor their fill
   * per on/off state, not just the label text. */
  private fireBg!: Phaser.GameObjects.Rectangle;
  private autoFireLabel!: Phaser.GameObjects.Text;
  private rearBg!: Phaser.GameObjects.Rectangle;
  private rearWeaponLabel!: Phaser.GameObjects.Text;
  private shieldBg!: Phaser.GameObjects.Rectangle;
  private autoShieldLabel!: Phaser.GameObjects.Text;
  /** Manual-fire side weapon button — label shows kind + charges, e.g. "RAILGUN 2/3". */
  private sideWeaponBg!: Phaser.GameObjects.Rectangle;
  private sideWeaponLabel!: Phaser.GameObjects.Text;
  private sideWeaponIcon!: Phaser.GameObjects.Image;
  /** Ability bar slots: up to 3 active ability buttons. `dot` is a small company-color
   * indicator at the slot's left edge — the only "icon" an ability has (no per-ability
   * texture exists, only a per-company color, same as the card-offer overlay). */
  private abilitySlots: Array<{
    bg: Phaser.GameObjects.Rectangle;
    dot: Phaser.GameObjects.Arc;
    nameText: Phaser.GameObjects.Text;
    cooldownText: Phaser.GameObjects.Text;
  }> = [];
  exitConfirmObjects = new ManagedObjectGroup(); // not private: CombatCheats.ts needs direct access
  private narratorModalObjects = new ManagedObjectGroup();
  narratorLineIdx = 0; // not private: CombatCheats.ts needs direct access
  /** Reference to whichever narratorEvents.lines array is currently on screen — tick.ts
   * assigns a fresh array (`[...event.lines]`) each time a new event fires, so `!==`
   * reliably distinguishes "a new event replaced the one still showing" from "the same
   * event, still mid-pagination." Needed because narratorModalObjects.length alone
   * can't tell those apart: it stays > 0 across an instant resolve-then-refire (a real,
   * reproducible bug — cheat-driven testing hit it directly, confirmed via
   * combat.inspect()-equivalent state dumps showing pendingNarrator correctly advanced
   * to event 2 while the view kept rendering event 1 forever). */
  private displayedNarratorLines: string[] | null = null;
  /** Which of mission.narratorEvents is currently showing (0-based) — derived from
   * core.firedNarratorTicks.length once per new event (see syncNarratorModal), since
   * narratorLineIdx alone can't disambiguate "line 1 of event A" from "line 1 of event
   * B" for missions with more than one narratorEvent (t1's post-first-hit follow-up).
   * Feeds NARRATOR_ARROW_TARGETS's per-event lookup. */
  private narratorEventIndex = 0;
  /** True iff this attempt is running missionForThisAttempt's retry-variant
   * narratorEvents instead of the mission's first-attempt script — suppresses
   * NARRATOR_ARROW_TARGETS below, which is only ever authored against the original
   * script's own event/line indices. */
  private usingRetryNarration = false;
  /** Credited coins per enemy id — set only when the core actually emits an
   * 'enemy-killed' visual event (detectHits(), every tick), consumed on death
   * (onEnemyDeath()). Deliberately NOT pre-populated from the enemy's raw spec
   * coinReward at spawn: a collision self-death never credits coins
   * (applyEnemyDeathEffects, core/combat.ts) and must show no coin popup at all, not
   * the enemy's nominal reward. */
  private enemyCoinRewards = new Map<number, number>();
  /** HP snapshot from before the last tick — used to detect mid-tick hits for the hit burst. */
  private previousHps = new Map<number, number>();
  /** Regen (guardian self-heal, booster feed) fires every tick — without throttling, a
   * continuously-healed enemy would spawn a floating number ~10×/s. Accumulates healed hp
   * per enemy and flushes to one floating number every HEAL_FLOAT_INTERVAL_MS. */
  private healAccumulator = new Map<number, number>();
  private healFloatCooldown = new Map<number, number>();

  constructor() {
    super('CombatScene');
  }

  /** Swaps in a shorter retry-aware narratorEvents array (missions.ts's
   * narratorEventsForAttempt) when the matching t1/t2/t3FailedOnce flag is already set
   * — otherwise returns `mission` unchanged, so a mission with no retry variant (or a
   * first attempt) never gets copied needlessly. */
  private missionForThisAttempt(mission: MissionSpec): MissionSpec {
    const narratorEvents = narratorEventsForAttempt(mission, {
      t1: this.save.t1FailedOnce, t2: this.save.t2FailedOnce, t3: this.save.t3FailedOnce,
    });
    if (narratorEvents === undefined || narratorEvents === mission.narratorEvents) return mission;
    return { ...mission, narratorEvents };
  }

  // fallow-ignore-next-line unused-class-member
  create(data: CombatSceneData): void {
    const mission = missionById(data.missionId);
    this.save = loadSave();
    if (mission.id === DAILY_MISSION_ID) {
      const todayStr = dailyDateKey(new Date());
      // Defense in depth, same pattern as HubScene's canStart gating — the hub's own
      // PLAY button already disappears once today's daily is played, so this path is
      // normally only reachable via a stale tab or calling __cheat.startMission('daily')
      // twice. Redirect instead of letting a second attempt build a result at all.
      if (!isDailyAvailable(this.save, todayStr)) {
        this.scene.start('HubScene');
        return;
      }
      // Reserve the attempt NOW, before a single tick runs — not at payout (maybeFinish).
      // Paying out only at the end (the first version of this) left save.daily untouched
      // if the app was force-quit or the tab closed mid-run, letting a player retry
      // indefinitely with a fresh seed until a good roll (found in design review). This
      // closes that: a crash now costs the day's attempt, same as the real thing.
      this.save = reserveDailyAttempt(this.save, todayStr);
      this.dailyTodayStr = todayStr;
    }
    const seed = randomSeed();
    let loadout = mission.forcedLoadout !== undefined
      ? resolveForcedLoadout(mission.forcedLoadout)
      : buildLoadout(this.save);
    if (mission.id === DAILY_MISSION_ID) loadout = neutralizeMotorForDaily(loadout);
    if (mission.disableWeapon === true) loadout = applyDisableWeapon(loadout);
    if (mission.neutralizeGeneratorId !== undefined) loadout = applyGeneratorOverride(loadout, mission.neutralizeGeneratorId);
    if (mission.disableAuxWeapons === true) loadout = applyDisableAuxWeapons(loadout);
    const missionForRun = this.missionForThisAttempt(mission);
    // NARRATOR_ARROW_TARGETS is keyed by [eventIndex][lineIndex], which a retry-variant
    // script can coincidentally share with the first-attempt script (both often start
    // at event 0/line 0) despite pointing at completely different lines — this flag
    // stops showNarratorLine from drawing an arrow that doesn't match what's on screen.
    this.usingRetryNarration = missionForRun.narratorEvents !== mission.narratorEvents;
    this.core = createCoreState(missionForRun, loadout, seed, abilityPoolForLoadout(loadout));
    this.motorLevel = motorLevelFromId(loadout.motor.id);
    this.motorKindColor = motorKindColorFromId(loadout.motor.id);

    Sound.attach(this.sound);
    Sound.startMusic();
    buildGameTextures(this);
    drawDevBorder(this, this.save);

    // Info panel (left) background + divider
    this.add.rectangle(0, 0, px(INFO_PANEL_W), px(LOGICAL_HEIGHT), 0x04040f, 0.82).setOrigin(0, 0).setDepth(0);
    this.add.rectangle(px(INFO_PANEL_W), 0, px(2), px(LOGICAL_HEIGHT), 0x445577).setOrigin(0, 0).setDepth(1);
    // Button panel (right) background + divider
    this.add.rectangle(px(BTN_X), 0, px(BTN_PANEL_W), px(LOGICAL_HEIGHT), 0x04040f, 0.82).setOrigin(0, 0).setDepth(0);
    this.add.rectangle(px(BTN_X - 1), 0, px(2), px(LOGICAL_HEIGHT), 0x445577).setOrigin(0, 0).setDepth(1);

    // Mission name at top of game field — enemies spawn in and grow from
    // GAME_TOP_Y (30px), so a sprite's top edge routinely reaches up into this text's
    // row; rather than reserve dead vertical space for an establishing-shot label,
    // fade it out shortly after it's had time to be read.
    const missionTitle = this.add
      .text(px(GAME_X + GAME_WIDTH / 2), px(10), mission.name.toUpperCase(), {
        fontFamily: UI_FONT,
        fontSize: `${String(fontPx(9))}px`,
        color: '#aabbcc',
      })
      .setOrigin(0.5, 0)
      .setDepth(10);
    this.tweens.add({ targets: missionTitle, alpha: 0, delay: 1800, duration: 700 });

    // "ABILITIES" header — shown after first pick; in left panel below ability slots
    this.cardsHeader = this.add.text(px(INFO_PANEL_W / 2), px(180), '', {
      fontFamily: UI_FONT,
      fontSize: `${String(fontPx(8))}px`,
      color: '#445566',
      align: 'center',
    }).setOrigin(0.5, 0).setDepth(10);

    this.hud = new CombatHud(this);
    this.cardOverlay = new CardOverlay(this, (action) => { this.handleCardAction(action); });
    this.narrator = new NarratorBar(this);
    this.cheats = new CombatCheats(this);

    this.resetPerRunState();
    // Dynamic top-down cursor (see the constants block above) — toggles, then ability
    // slots, then supply buttons flow one after another; only rows actually present
    // advance it, so the panel never reserves dead space for a hidden row and never
    // runs two present rows close enough to overlap once every hit area is a real 44px.
    let cursor = PANEL_TOP_MARGIN;
    cursor = this.buildToggleButtons(cursor);
    cursor = this.buildAbilitySlots(cursor);
    this.supplyButtons = new SupplyButtons(this, this.core, cursor, (slot) => { this.handleBoostTap(slot); });

    // Exit is reserved at the bottom, not flowing — its hit area's bottom edge must sit
    // exactly on the 20px safe-zone floor regardless of how much (or little) content is
    // above it. Previously fixed-position at LOGICAL_HEIGHT-22 with a 24px-tall box, whose
    // real bottom edge measured 10px from the screen edge (tools/tap-target-audit.ts).
    const exitX = px(BTN_X + BTN_PANEL_W / 2);
    const exitY = px(LOGICAL_HEIGHT - PANEL_BOTTOM_MARGIN - ROW_PITCH / 2);
    // Kept visually secondary to the toggles above it (still the dimmest interactive
    // element in the panel) while staying bright enough to read as functional, not
    // disabled.
    const exitBg = this.add
      .rectangle(exitX, exitY, px(BTN_PANEL_W - 40), px(EXIT_VISUAL_H), 0x1a1020, 0.9)
      .setStrokeStyle(px(1), 0x6644aa)
      .setDepth(10);
    ensureMinTapTarget(exitBg);
    exitBg.on('pointerdown', () => { this.showExitConfirm(); });
    this.add.text(exitX, exitY, 'EXIT', {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(8))}px`, color: '#aa88cc',
    }).setOrigin(0.5).setDepth(11);

    this.thrusterGfx   = this.add.graphics().setDepth(3).setBlendMode(Phaser.BlendModes.ADD);
    this.motorGfx      = this.add.graphics().setDepth(4).setBlendMode(Phaser.BlendModes.ADD);
    this.generatorGfx  = this.add.graphics().setDepth(3).setBlendMode(Phaser.BlendModes.ADD);
    this.shieldGfx     = this.add.graphics().setDepth(5).setBlendMode(Phaser.BlendModes.ADD);
    this.shieldPulseGfx = this.add.graphics().setDepth(5).setBlendMode(Phaser.BlendModes.ADD);
    this.muzzleFlashGfx = this.add.graphics().setDepth(6).setBlendMode(Phaser.BlendModes.ADD);
    this.gunGfx        = this.add.graphics().setDepth(5).setBlendMode(Phaser.BlendModes.ADD);
    this.rearGunGfx    = this.add.graphics().setDepth(5).setBlendMode(Phaser.BlendModes.ADD);
    this.sideGunGfx    = this.add.graphics().setDepth(5).setBlendMode(Phaser.BlendModes.ADD);
    this.particleGfx   = this.add.graphics().setDepth(5).setBlendMode(Phaser.BlendModes.ADD);
    this.hpBarGfx = this.add.graphics().setDepth(7);
    this.shipStatusBarGfx = this.add.graphics().setDepth(7);
    this.targetMarkerGfx = this.add.graphics().setDepth(7);
    this.boosterBuffGfx = this.add.graphics().setDepth(7);
    this.vignetteGfx = this.add.graphics().setDepth(9);
    this.deathFlashGfx = this.add.graphics().setDepth(9);

    this.shipSprite = this.add
      .image(px(SHIP_CENTER_X), px(SHIP_Y), textureForShipId(this.core.loadout.ship.id))
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(4);

    // Thruster heartbeat: subtle scale pulse along ship body
    this.tweens.add({
      targets: this.shipSprite,
      scaleY: 1.06,
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.addStarfield();

    const startLine = getStoryLine(mission.id, 'mission-start');
    if (startLine !== undefined) this.narrator.show(startLine);
  }

  /** Every collection create() must clear on a scene restart (mission retry, or
   * __cheat.startMission from an already-active CombatScene) — miss one and its stale
   * entries still reference GameObjects Phaser destroyed during the previous shutdown;
   * touching them the next frame throws (destroyed Text/Image objects have a null
   * texture). abilitySlots hit exactly this before it was added here. */
  private resetPerRunState(): void {
    this.enemySprites.clear();
    this.hpLabels.clear();
    this.previousDistances.clear();
    this.previousHps.clear();
    this.enemyCoinRewards.clear();
    this.healAccumulator.clear();
    this.healFloatCooldown.clear();
    this.laserBolts = [];
    this.sideLaserBolts = [];
    this.enemyBolts = [];
    this.muzzleFlashes = [];
    this.burstParticles = [];
    this.floatingTexts = [];
    this.shieldPulseRings = [];
    this.stars = [];
    this.exitConfirmObjects = new ManagedObjectGroup();
    this.cardEntries = [];
    this.abilitySlots = [];
    this.shieldHitFlash = 0;
    this.gunToggle = false;
    this.thrusterPhase = 0;
    this.targetMarkerPhase = 0;
    this.accumulatorMs = 0;
    this.finished = false;
    this.wasAbandoned = false;
    this.narratorSupportCallShown = false;
    this.narratorBossShown = false;
    this.narratorBoosterShown = false;
    this.narratorModalObjects = new ManagedObjectGroup();
    this.displayedNarratorLines = null;
    this.narratorLineIdx = 0;
    this.narratorEventIndex = 0;
  }

  private addStarfield(): void {
    const COUNT = 65;
    const buf = crypto.getRandomValues(new Uint32Array(COUNT * 3));
    for (let i = 0; i < COUNT; i++) {
      const rx = buf[i * 3] ?? 0;
      const ry = buf[i * 3 + 1] ?? 0;
      const rz = buf[i * 3 + 2] ?? 0;
      const x = GAME_X + (rx % GAME_WIDTH);
      const y = GAME_TOP_Y + (ry % (LOGICAL_HEIGHT - GAME_TOP_Y));
      const alpha = rx % 3 === 0 ? 0.6 : 0.22;
      const size = rx % 7 === 0 ? 2 : 1;
      const speed = 18 + (rz % 50); // logical units / second; parallax spread (scrolls left)
      const rect = this.add.rectangle(px(x), px(y), px(size), px(size), 0xffffff, alpha).setDepth(0);
      this.stars.push({ rect, speed });
    }
  }

  /** Slow sinusoidal x drift — keeps the ship alive without distracting from combat. */
  private driftX(): number {
    return Math.sin(this.thrusterPhase * 0.0008) * px(5);
  }

  /** Subtle y bob — out of phase with x drift so motion feels organic. */
  private bobY(): number {
    return Math.sin(this.thrusterPhase * 0.0005) * px(2);
  }

  private updateStars(deltaMs: number): void {
    for (const star of this.stars) {
      star.rect.y += px(star.speed) * deltaMs / 1000;
      if (star.rect.y > px(LOGICAL_HEIGHT + 2)) star.rect.y = px(GAME_TOP_Y - 2);
    }
  }


  private renderShield(): void {
    this.shieldGfx.clear();
    const maxShield = this.core.loadout.shield?.capacity ?? 0;
    if (maxShield <= 0 || this.core.ship.shield <= 0) return;
    const frac = this.core.ship.shield / maxShield;
    const flash = this.shieldHitFlash;
    const cx = px(SHIP_CENTER_X) + this.driftX();
    const cy = px(SHIP_Y - 6) + this.bobY();
    const r = px(SHIELD_BASE_RADIUS + frac * SHIELD_RADIUS_PER_FRACTION);
    // Soft fill glow — brightens on hit
    this.shieldGfx.fillStyle(0x0044ff, (SHIELD_GLOW_BASE_ALPHA + flash * SHIELD_GLOW_FLASH_ALPHA) * frac);
    this.shieldGfx.fillCircle(cx, cy, r + px(SHIELD_GLOW_RADIUS_PAD));
    // Four neon rings: outermost dim halo → innermost bright edge; all brighten on hit
    drawShieldRings(this.shieldGfx, cx, cy, r, { intensity: frac, flash });
  }

  /** The player's own hull/shield as two small bars below the ship — the same at-a-
   * glance reading enemies already get via drawEnemyHpBar, applied to the ship itself.
   * A dedicated Graphics object (not hpBarGfx): this must stay visible during the
   * post-finish hold, where renderEnemies (and its own hpBarGfx.clear()) never runs. */
  private renderShipStatusBars(): void {
    this.shipStatusBarGfx.clear();
    const cx = px(SHIP_CENTER_X) + this.driftX();
    const topY = px(SHIP_Y) + this.bobY() + px(SHIP_STATUS_BAR_Y_OFFSET);
    const bw = px(SHIP_STATUS_BAR_W);
    const bh = px(SHIP_STATUS_BAR_H);
    const bx = cx - bw / 2;

    const hullFrac = this.core.ship.hull / this.core.ship.maxHull;
    this.shipStatusBarGfx.fillStyle(0x111122, 0.8);
    this.shipStatusBarGfx.fillRect(bx, topY, bw, bh);
    const hullColor = hullFrac > 0.55 ? 0x22ee44 : hullFrac > 0.25 ? 0xffaa00 : 0xff2200;
    this.shipStatusBarGfx.fillStyle(hullColor, 0.9);
    this.shipStatusBarGfx.fillRect(bx, topY, bw * Math.max(0, hullFrac), bh);

    const maxShield = this.core.loadout.shield?.capacity ?? 0;
    if (maxShield <= 0) return;
    const shieldY = topY + bh + px(SHIP_STATUS_BAR_GAP);
    const shieldFrac = this.core.ship.shield / maxShield;
    this.shipStatusBarGfx.fillStyle(0x111122, 0.8);
    this.shipStatusBarGfx.fillRect(bx, shieldY, bw, bh);
    this.shipStatusBarGfx.fillStyle(0x2266ff, 0.9);
    this.shipStatusBarGfx.fillRect(bx, shieldY, bw * Math.max(0, shieldFrac), bh);
  }

  private renderShieldPulseRings(deltaMs: number): void {
    const cx = px(SHIP_CENTER_X) + this.driftX();
    const cy = px(SHIP_Y - 6) + this.bobY();
    this.shieldPulseRings = tickShieldPulseRings(this.shieldPulseGfx, this.shieldPulseRings, deltaMs, {
      cx, cy, expandPxPerSec: PULSE_RING_EXPAND_PX_S, fadePerSec: PULSE_RING_FADE_S,
    });
  }

  private renderLowHullVignette(): void {
    this.vignetteGfx.clear();
    const hull = this.core.ship.hull / this.core.ship.maxHull;
    if (hull >= VIGNETTE_THRESHOLD) return;
    const intensity = (VIGNETTE_THRESHOLD - hull) / VIGNETTE_THRESHOLD;
    const edgeW = Math.max(px(4), px(18) * intensity);
    const vx = px(GAME_X); const vw = px(GAME_WIDTH); const vh = px(LOGICAL_HEIGHT);
    this.vignetteGfx.fillStyle(0xff1100, 0.35 * intensity);
    this.vignetteGfx.fillRect(vx, 0, edgeW, vh);
    this.vignetteGfx.fillRect(vx + vw - edgeW, 0, edgeW, vh);
    this.vignetteGfx.fillRect(vx + edgeW, 0, vw - 2 * edgeW, edgeW);
    this.vignetteGfx.fillRect(vx + edgeW, vh - edgeW, vw - 2 * edgeW, edgeW);
  }

  /** Spawns radial burst particles at (x, y) — rendered via Graphics each frame. */
  private spawnBurst(x: number, y: number, color: number, count: number): void {
    for (let i = 0; i < count; i++) {
      // Slight angular offset per particle so bursts don't look like perfect clock faces.
      const angle = (i / count) * Math.PI * 2 + (i % 3) * 0.18;
      const speed = px(60 + (i % 7) * 18); // 60–168 logical px/s, deterministic spread
      this.burstParticles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color, life: 400, maxLife: 400,
      });
    }
  }

  /** Burst for the death animation — uses tweened Rectangles (runs after update stops). */
  private spawnTweenBurst(x: number, y: number, color: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (i % 4) * 0.15;
      const dist = px(20 + (i % 6) * 10); // 20–70 logical px, deterministic
      const dot = this.add.rectangle(x, y, px(3), px(3), color).setDepth(5);
      this.tweens.add({
        targets: dot,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0, duration: 380, ease: 'Power2',
        onComplete: () => { dot.destroy(); },
      });
    }
  }

  private spawnCoinFloat(x: number, y: number, amount: number): void {
    const txt = this.add.text(x, y - px(8), `+◈${String(amount)}`, {
      fontFamily: UI_FONT,
      fontSize: `${String(fontPx(9))}px`,
      color: '#ffcc00',
    }).setDepth(8).setOrigin(0.5);
    this.floatingTexts.push({ text: txt, vy: -px(57), life: 700, maxLife: 700 });
  }

  /** Deliberately not the coin glyph — a plain green "+HP" number reads as healing next
   * to the coin popup's gold "+◈N" without sharing a symbol with it. */
  private spawnHealFloat(x: number, y: number, amount: number): void {
    if (amount < 0.5) return;
    const txt = this.add.text(x, y - px(8), `+${amount.toFixed(0)} HP`, {
      fontFamily: UI_FONT,
      fontSize: `${String(fontPx(11))}px`,
      color: '#44ff88',
    }).setDepth(8).setOrigin(0.5);
    this.floatingTexts.push({ text: txt, vy: -px(50), life: 700, maxLife: 700 });
  }

  /** Fires for ANY hp drop detectHits() sees — weapon fire (default enemyRed) or the
   * collision shield-burst (caller passes shieldBlue, see detectHits) alike;
   * conveyor.ts's advanceEnemies applies the shield-burst to survivors' `.hp` the same
   * way core/combat.ts's weapon-fire path does, so only the color is caller-supplied,
   * not the underlying hp-drop detection. */
  private spawnDamageFloat(x: number, y: number, amount: number, color: number = PALETTE.enemyRed): void {
    if (amount < 0.5) return;
    const txt = this.add.text(x, y - px(8), `-${amount.toFixed(0)}`, {
      fontFamily: UI_FONT,
      fontSize: `${String(fontPx(12))}px`,
      color: cssColor(color),
      stroke: cssColor(PALETTE.backgroundNearBlack),
      strokeThickness: px(1.2),
    }).setDepth(8).setOrigin(0.5);
    this.floatingTexts.push({ text: txt, vy: -px(50), life: 700, maxLife: 700 });
  }

  private updateBurstParticles(deltaMs: number): void {
    this.burstParticles = tickBurstParticles(this.particleGfx, this.burstParticles, deltaMs);
  }

  private updateFloatingTexts(deltaMs: number): void {
    this.floatingTexts = tickFloatingTexts(this.floatingTexts, deltaMs);
  }

  // fallow-ignore-next-line unused-class-member
  override update(_time: number, deltaMs: number): void {
    if (this.finished) { this.updatePostFinishEffects(deltaMs); return; }
    // A backgrounded tab doesn't reliably stop rAF from firing at all (browsers vary,
    // and some keep calling it throttled rather than paused) — without this, a long
    // background stretch keeps ticking the sim (and its per-tick weapon-fire/hit/kill
    // sounds) the whole time, capped per frame by MAX_CATCH_UP_MS but with no cap on
    // how many such frames fire in total. Whatever sounds those ticks queued then all
    // land at once the moment the tab (and the browser's suspended AudioContext) comes
    // back, instead of playing spread out — the "everything plays as one loud noise on
    // refocus" bug. Skipping simulation entirely while hidden means there's nothing
    // queued to flush in the first place.
    if (document.hidden) return;
    this.accumulatorMs += Math.min(deltaMs, MAX_CATCH_UP_MS);
    this.thrusterPhase += deltaMs;
    this.targetMarkerPhase += deltaMs;

    const before = this.snapshotPreTickState();
    while (this.accumulatorMs >= MS_PER_TICK) {
      this.accumulatorMs -= MS_PER_TICK;
      this.snapshotDistances();
      advanceTick(this.core);
      this.detectHits();
    }
    this.detectCombatFeedback(before);

    // Decay flash
    this.shieldHitFlash = Math.max(0, this.shieldHitFlash - SHIELD_FLASH_DECAY * deltaMs / 1000);
    for (const [id, remaining] of this.healFloatCooldown) this.healFloatCooldown.set(id, remaining - deltaMs);

    this.syncCardOverlay();
    this.syncNarratorModal();
    this.syncNarrator();
    const alpha = this.core.pendingOffer !== null ? 1 : this.accumulatorMs / MS_PER_TICK;
    const boss = this.core.enemies.find((e) => e.isBoss) ?? null;
    this.updateStars(deltaMs);
    this.renderThruster();
    this.renderGenerator();
    this.renderShield();
    this.renderShieldPulseRings(deltaMs);
    this.renderGuns();
    this.renderRearGuns();
    this.renderSideGuns();
    this.renderMuzzleFlashes(deltaMs);
    this.renderLowHullVignette();
    this.shipSprite.setX(px(SHIP_CENTER_X) + this.driftX());
    this.shipSprite.setY(px(SHIP_Y) + this.bobY());
    this.renderEnemies(alpha);
    this.renderShipStatusBars();
    this.updateLasers(deltaMs);
    this.updateRearLasers(deltaMs);
    this.updateSideLasers(deltaMs);
    this.updateEnemyBolts(deltaMs);
    this.updateBurstParticles(deltaMs);
    this.updateFloatingTexts(deltaMs);
    this.hud.update(this.core, boss, this.save.missionStars[this.core.mission.id] ?? []);
    this.supplyButtons.update(this.core);
    this.updateAbilityBar();
    this.narrator.update(deltaMs);
    this.maybeFinish();
  }

  /** Runs instead of the full update() body during the exit-delay hold after
   * maybeFinish() sets `finished` — the core has already stopped advancing, but
   * floating numbers, particles, and idle ship motion would otherwise freeze mid-frame
   * for the whole delay instead of settling naturally. */
  private updatePostFinishEffects(deltaMs: number): void {
    this.thrusterPhase += deltaMs;
    this.targetMarkerPhase += deltaMs;
    this.renderThruster();
    this.renderShieldPulseRings(deltaMs);
    this.shipSprite.setX(px(SHIP_CENTER_X) + this.driftX());
    this.shipSprite.setY(px(SHIP_Y) + this.bobY());
    this.renderShipStatusBars();
    this.updateLasers(deltaMs);
    this.updateRearLasers(deltaMs);
    this.updateSideLasers(deltaMs);
    this.updateEnemyBolts(deltaMs);
    this.updateBurstParticles(deltaMs);
    this.updateFloatingTexts(deltaMs);
    this.updateStars(deltaMs);
  }

  /** Everything `detectCombatFeedback` needs to compare against post-tick state. */
  private snapshotPreTickState(): PreTickSnapshot {
    const timers = new Map<number, number>();
    for (const e of this.core.enemies) timers.set(e.id, e.shootTimer);
    return {
      hull: this.core.ship.hull,
      shield: this.core.ship.shield,
      shots: this.core.stats.shotsFired,
      rearShots: this.core.stats.rearShotsFired,
      kills: this.core.stats.kills,
      collisions: this.core.stats.collisions,
      timers,
    };
  }

  /** Compares the pre-tick snapshot to current core state and triggers the matching
   * visual/audio feedback (bolts, sounds, shield flash, collision burst, enemy shots).
   * Pure side effects — reads core state, never mutates it. */
  private detectCombatFeedback(before: PreTickSnapshot): void {
    const shotsFired = this.core.stats.shotsFired - before.shots;
    const rearShotsFired = this.core.stats.rearShotsFired - before.rearShots;
    const playerBoltKind = this.resolvePlayerBoltKind();
    for (let i = 0; i < shotsFired; i++) this.spawnLaserBolt(playerBoltKind);
    for (let i = 0; i < rearShotsFired; i++) this.spawnRearBolt();
    if (shotsFired > 0) Sound.fire();
    if (rearShotsFired > 0) Sound.rearFire();
    if (this.core.stats.kills > before.kills) Sound.kill();

    if (this.core.ship.hull < before.hull - 0.5) {
      this.cameras.main.shake(120, 0.005);
      // Below the ship, shield's float above (a single collision can drain both in one
      // frame once shield is thin — damageShip routes shield-first then overflows to
      // hull, core/combat.ts) — offset apart so the two numbers never overlap.
      this.spawnDamageFloat(this.shipSprite.x, this.shipSprite.y + px(20), before.hull - this.core.ship.hull, PALETTE.enemyRed);
    }
    if (this.core.ship.shield < before.shield - 0.5) {
      this.shieldHitFlash = 1.0;
      this.spawnDamageFloat(this.shipSprite.x, this.shipSprite.y - px(24), before.shield - this.core.ship.shield, PALETTE.shieldBlue);
    }
    if (this.core.stats.collisions > before.collisions) this.spawnCollisionFeedback();
    if (this.core.ship.shield > before.shield + 0.5) {
      Sound.shieldPulse();
      this.shieldPulseRings.push({ radius: px(28), alpha: 0.75 });
    }

    const enemyMissIds = new Set(
      this.core.pendingVisualEvents
        .filter((e) => e.kind === 'enemy-miss' && e.enemyId !== undefined)
        .map((e) => e.enemyId as number),
    );
    const enemyCritIds = new Set(
      this.core.pendingVisualEvents
        .filter((e) => e.kind === 'enemy-crit' && e.enemyId !== undefined)
        .map((e) => e.enemyId as number),
    );
    for (const e of this.core.enemies) {
      const beforeTimer = before.timers.get(e.id);
      if (beforeTimer !== undefined && e.shootTimer > beforeTimer) {
        const outcome = enemyMissIds.has(e.id) ? 'miss' : enemyCritIds.has(e.id) ? 'crit' : 'normal';
        this.spawnEnemyBolt(e, outcome);
        if (outcome === 'miss') this.spawnDeflectionSpark();
      }
    }
  }

  handleCardAction(action: number): void { // not private: CombatCheats.ts needs direct access
    const prevCount = this.core.pickedAbilityIds.length;
    resolveAbilityAction(this.core, action);
    if (this.core.pickedAbilityIds.length > prevCount) {
      if (prevCount === 0) this.cardsHeader.setText('ABILITIES');
      this.rebuildCardDisplay();
    }
    if (this.core.pendingOffer === null) this.cardOverlay.hide();
    else this.cardOverlay.show(this.core.pendingOffer, this.core);
  }

  /**
   * Rebuilds the picked-card list from scratch on every new pick.
   * ≤6 cards: single column, full (possibly multi-line) descriptions — row height is
   * measured from each description's actual rendered height rather than assumed, since a
   * fixed row height previously let long descriptions overlap the next ability's name.
   * 7+ cards: two columns, single-line descriptions (bounded height, grid-safe).
   */
  private rebuildCardDisplay(): void {
    for (const t of this.cardEntries) t.destroy();
    this.cardEntries = [];

    const total = this.core.pickedAbilityIds.length;
    if (total === 0) return;
    if (total > 6) this.rebuildCardDisplayGrid();
    else this.rebuildCardDisplaySingleColumn();
  }

  private rebuildCardDisplaySingleColumn(): void {
    const namePx = 8;
    const descPx = 7;
    const colW = INFO_PANEL_W - 6;
    const textX = 3 + colW / 2;
    let y = 192;

    this.core.pickedAbilityIds.forEach((abilityId) => {
      const ability = abilityById(abilityId);
      const nameT = this.add.text(px(textX), px(y), ability.name, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(namePx))}px`,
        color: abilityCompanyColor(ability.company), align: 'center',
      }).setOrigin(0.5, 0).setDepth(10);
      y += namePx + 2;

      const descT = this.add.text(px(textX), px(y), ability.description, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(descPx))}px`,
        color: '#668899', align: 'center', wordWrap: { width: px(colW - 4) },
      }).setOrigin(0.5, 0).setDepth(10);

      this.cardEntries.push(nameT, descT);
      y += descT.height / DPR + 6; // descT.height is device px; convert back to logical
    });
  }

  private rebuildCardDisplayGrid(): void {
    const namePx = 7;
    const descPx = 6;
    const rowH = 16;
    const cols = 2;
    const colW = (INFO_PANEL_W - 6) / cols;
    const startX = 3;
    const startY = 192;

    this.core.pickedAbilityIds.forEach((abilityId, i) => {
      const ability = abilityById(abilityId);
      const col = i % cols;
      const row = Math.floor(i / cols);
      const textX = startX + (col + 0.5) * colW;
      const nameY = startY + row * rowH;
      const descY = nameY + namePx + 2;

      const nameT = this.add.text(px(textX), px(nameY), ability.name, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(namePx))}px`,
        color: abilityCompanyColor(ability.company), align: 'center',
      }).setOrigin(0.5, 0).setDepth(10);

      const descT = this.add.text(px(textX), px(descY), ability.description, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(descPx))}px`,
        color: '#668899', align: 'center', wordWrap: { width: px(colW - 4) },
      }).setOrigin(0.5, 0).setDepth(10).setMaxLines(1);

      this.cardEntries.push(nameT, descT);
    });
  }

  /** Returns the Y cursor for whatever comes next (ability slots). All four toggle
   * rows (fire/rear/shield/side) always take a row, in the same fixed order, whether
   * or not rear/side are actually equipped — this panel (and everything below it:
   * ability slots, supply buttons) used to reflow around whichever of rear/side were
   * owned, so the same screen position could be a completely different button between
   * two missions depending on loadout. An unowned system now renders dimmed with its
   * own "NO REAR WEAPON"/"NO SIDE WEAPON" label (updateAbilityBar) instead of
   * disappearing, so muscle memory for "AUTO-FIRE is always row 1" transfers across
   * every mission regardless of loadout. */
  private buildToggleButtons(startY: number): number {
    const cx = px(BTN_X + BTN_PANEL_W / 2);
    const btnW = px(BTN_PANEL_W - 40);
    const btnH = px(TOGGLE_VISUAL_H);
    let cursor = startY;

    // Each row's rectangle is centered in its slot (cursor + half-pitch), not placed at
    // the slot's top edge — placing it at the top made the *first* row's naive center
    // sit at y=20 with a 44px hit area spanning -2..42, which ensureMinTapTarget then
    // clamped down to 20..64 to respect the top margin — silently colliding with
    // whatever row started at the next slot (cursor=64). Centering in the slot up front
    // means no edge-clamp is ever needed for an interior row (caught by
    // tools/tap-target-audit.ts's overlap check, not eyeballed).
    const fireY = cursor + ROW_PITCH / 2; cursor += ROW_PITCH;
    this.fireBg = this.add.rectangle(cx, px(fireY), btnW, btnH, TOGGLE_OFF_FILL)
      .setStrokeStyle(px(1), 0x225533).setDepth(10);
    ensureMinTapTarget(this.fireBg);
    this.fireBg.on('pointerdown', () => { toggleAutoFire(this.core); });
    this.autoFireLabel = this.add.text(cx, px(fireY), 'AUTO-FIRE  ON', {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(7))}px`, color: '#44ff66',
    }).setOrigin(0.5).setDepth(11);

    const rearY = cursor + ROW_PITCH / 2; cursor += ROW_PITCH;
    this.rearBg = this.add.rectangle(cx, px(rearY), btnW, btnH, TOGGLE_OFF_FILL)
      .setStrokeStyle(px(1), 0x336622).setDepth(10);
    ensureMinTapTarget(this.rearBg);
    // A no-op tap on an unequipped rear weapon reads as a disabled control, not a
    // broken one — same guard shape as handleSideWeaponTap's own canFire check below.
    this.rearBg.on('pointerdown', () => { if (this.core.loadout.rearWeapon !== null) toggleRearWeapon(this.core); });
    this.rearWeaponLabel = this.add.text(cx, px(rearY), 'REAR  ON', {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(7))}px`, color: '#88ff44',
    }).setOrigin(0.5).setDepth(11);

    const shieldY = cursor + ROW_PITCH / 2; cursor += ROW_PITCH;
    this.shieldBg = this.add.rectangle(cx, px(shieldY), btnW, btnH, TOGGLE_OFF_FILL)
      .setStrokeStyle(px(1), 0x223355).setDepth(10);
    ensureMinTapTarget(this.shieldBg);
    this.shieldBg.on('pointerdown', () => { toggleAutoShield(this.core); });
    this.autoShieldLabel = this.add.text(cx, px(shieldY), 'AUTO-SHIELD  ON', {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(7))}px`, color: '#4488ff',
    }).setOrigin(0.5).setDepth(11);

    const sideWeapon = this.core.loadout.sideWeapon;
    const sideY = cursor + ROW_PITCH / 2; cursor += ROW_PITCH;
    this.sideWeaponBg = this.add.rectangle(cx, px(sideY), btnW, btnH, TOGGLE_OFF_FILL)
      .setStrokeStyle(px(1), 0x552233).setDepth(10);
    ensureMinTapTarget(this.sideWeaponBg);
    this.sideWeaponBg.on('pointerdown', () => { this.handleSideWeaponTap(); });
    this.sideWeaponIcon = this.add.image(cx - btnW / 2 + px(9), px(sideY), iconTextureForSideWeaponId(sideWeapon?.id ?? 'focus-1'))
      .setOrigin(0.5).setScale(0.4).setDepth(11).setVisible(sideWeapon !== null);
    this.sideWeaponLabel = this.add.text(cx + px(4), px(sideY), '—', {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(7))}px`, color: '#ff6688',
    }).setOrigin(0.5).setDepth(11);

    return cursor + SECTION_GAP;
  }

  /** Returns the Y cursor for whatever comes next (supply buttons). Always 3 slots —
   * unlike loadout toggles, abilities fill in mid-run and aren't known at create(). */
  private buildAbilitySlots(startY: number): number {
    const cx = px(BTN_X + BTN_PANEL_W / 2);
    const slotW = px(BTN_PANEL_W - 40);
    const slotH = px(ABILITY_SLOT_H);
    let cursor = startY;

    // Every other section in this panel (BOOST, the toggle rows) names itself even when
    // empty — this bar didn't, which is exactly why it read as broken on t1 specifically
    // (zero support calls there, so all 3 slots stay in this empty state for the whole
    // mission, not just the first few seconds). Same size/position/alpha pattern as
    // SupplyButtons.ts's "BOOST" label, just above the slot stack instead of the buttons.
    this.add.text(cx, px(startY + 8), 'ABILITIES', {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(8))}px`, color: cssColor(PALETTE.weaponCyan),
    }).setOrigin(0.5, 1).setDepth(12).setAlpha(0.6);

    for (let i = 0; i < 3; i++) {
      const y = px(cursor + ROW_PITCH / 2); cursor += ROW_PITCH;
      const bg = this.add.rectangle(cx, y, slotW, slotH, ABILITY_SLOT_EMPTY_FILL)
        .setStrokeStyle(px(1), 0x334455)
        .setDepth(10);
      ensureMinTapTarget(bg);
      const idx = i;
      bg.on('pointerdown', () => { activateAbility(this.core, idx); });
      const dot = this.add.circle(cx - slotW / 2 + px(9), y, px(3.5), 0x334455).setDepth(11);
      const nameText = this.add.text(cx + px(4), y - px(5), '—', {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(10))}px`, color: '#334455',
      }).setOrigin(0.5).setDepth(11);
      const cooldownText = this.add.text(cx + px(4), y + px(7), '', {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(8))}px`, color: '#556677',
      }).setOrigin(0.5).setDepth(11);
      this.abilitySlots.push({ bg, dot, nameText, cooldownText });
    }

    return cursor + SECTION_GAP;
  }

  private updateAbilityBar(): void {
    this.updateFireToggle();
    this.updateRearToggle();
    this.updateShieldToggle();
    this.updateSideWeaponToggle();
    this.updateAbilitySlots();
  }

  private updateFireToggle(): void {
    this.autoFireLabel.setText(`AUTO-FIRE  ${this.core.autoFireEnabled ? 'ON' : 'OFF'}`);
    this.autoFireLabel.setColor(this.core.autoFireEnabled ? '#44ff66' : '#664422');
    this.fireBg.setFillStyle(this.core.autoFireEnabled ? FIRE_ON_FILL : TOGGLE_OFF_FILL);
  }

  private updateRearToggle(): void {
    const rearEquipped = this.core.loadout.rearWeapon !== null;
    if (rearEquipped) {
      this.rearWeaponLabel.setText(`REAR  ${this.core.rearWeaponEnabled ? 'ON' : 'OFF'}`);
      this.rearWeaponLabel.setColor(this.core.rearWeaponEnabled ? '#88ff44' : '#446622');
      this.rearBg.setFillStyle(this.core.rearWeaponEnabled ? REAR_ON_FILL : TOGGLE_OFF_FILL);
    } else {
      this.rearWeaponLabel.setText('NO REAR WEAPON').setColor('#885566');
      this.rearBg.setFillStyle(TOGGLE_OFF_FILL);
    }
    // Unequipped stays dim but must remain legible — full 0.3 read as an unlabeled
    // broken button, not an empty loadout slot (same reasoning as the side-weapon
    // row's own dimming below).
    this.rearBg.setAlpha(rearEquipped ? 1 : 0.4);
    this.rearWeaponLabel.setAlpha(rearEquipped ? 1 : 0.6);
  }

  private updateShieldToggle(): void {
    this.autoShieldLabel.setText(`AUTO-SHIELD  ${this.core.autoShieldEnabled ? 'ON' : 'OFF'}`);
    this.autoShieldLabel.setColor(this.core.autoShieldEnabled ? '#4488ff' : '#334466');
    this.shieldBg.setFillStyle(this.core.autoShieldEnabled ? SHIELD_ON_FILL : TOGGLE_OFF_FILL);
  }

  private updateSideWeaponToggle(): void {
    const sideWeaponVm = computeSideWeaponButtonViewModel(this.core);
    this.sideWeaponLabel.setText(sideWeaponVm.equipped ? `${sideWeaponVm.label}  ${sideWeaponVm.chargesLabel}` : sideWeaponVm.label);
    this.sideWeaponLabel.setColor(sideWeaponVm.equipped ? (sideWeaponVm.canFire ? '#ff6688' : '#663344') : '#885566');
    this.sideWeaponBg.setFillStyle(sideWeaponVm.canFire ? SIDE_WEAPON_READY_FILL : SIDE_WEAPON_EMPTY_FILL);
    // Unequipped stays dim but must remain legible — full 0.3 read as an unlabeled
    // broken button, not an empty loadout slot.
    this.sideWeaponBg.setAlpha(sideWeaponVm.equipped ? 1 : 0.4);
    this.sideWeaponLabel.setAlpha(sideWeaponVm.equipped ? 1 : 0.6);
    this.sideWeaponIcon.setAlpha(sideWeaponVm.equipped ? 1 : 0.4);
  }

  private updateAbilitySlots(): void {
    this.abilitySlots.forEach((slot, i) => {
      const equipped = this.core.equippedAbilities[i];
      if (equipped === undefined) {
        slot.nameText.setText('—').setColor('#334455');
        slot.cooldownText.setText('');
        slot.bg.setFillStyle(ABILITY_SLOT_EMPTY_FILL);
        slot.dot.setFillStyle(0x334455);
        return;
      }
      const def = abilityById(equipped.abilityId);
      slot.nameText.setText(def.name).setColor(abilityCompanyColor(def.company));
      slot.dot.setFillStyle(ABILITY_COMPANY_COLORS[def.company] ?? 0xaabbcc);
      if (equipped.cooldownLeft > 0) {
        slot.cooldownText.setText(`CD ${String(equipped.cooldownLeft)}`);
        slot.bg.setFillStyle(ABILITY_SLOT_COOLDOWN_FILL);
      } else {
        slot.cooldownText.setText('READY');
        slot.bg.setFillStyle(ABILITY_SLOT_READY_FILL);
      }
    });
  }

  handleBoostTap(slot: number): void { // not private: CombatCheats.ts needs direct access
    const supply = this.core.supplies[slot];
    if (supply === undefined || supply.chargesLeft <= 0 || this.core.status !== 'running') return;
    applyBoost(this.core, slot);
    Sound.boost();
  }

  handleSideWeaponTap(): void { // not private: CombatCheats.ts needs direct access
    if (!computeSideWeaponButtonViewModel(this.core).canFire) return;
    const sideWeapon = this.core.loadout.sideWeapon;
    if (sideWeapon === null) return;
    // Snapshot targets before firing — fireSideWeapon can kill and remove enemies from
    // state.enemies before this function regains control.
    const targets = [...this.core.enemies].sort((a, b) => a.distance - b.distance).slice(0, sideWeapon.maxTargets);
    fireSideWeapon(this.core);
    Sound.sideWeaponFire();
    this.spawnSideWeaponBurst(sideWeaponKindColor(sideWeapon.kind, sideWeapon.id));
    this.spawnSideWeaponBolts(sideWeapon, targets);
  }

  private syncCardOverlay(): void {
    if (this.core.pendingOffer !== null && !this.cardOverlay.visible) {
      this.cardOverlay.show(this.core.pendingOffer, this.core);
    }
  }

  private syncNarratorModal(): void {
    const lines = this.core.pendingNarrator;
    if (lines !== null && lines !== this.displayedNarratorLines) {
      this.narratorLineIdx = 0;
      this.narratorEventIndex = this.core.firedNarratorTicks.length - 1;
      this.displayedNarratorLines = lines;
      this.showNarratorLine(lines, 0);
    }
    if (lines === null && this.narratorModalObjects.length > 0) {
      this.displayedNarratorLines = null;
      this.hideNarratorModal();
    }
  }

  showNarratorLine(lines: string[], idx: number): void { // not private: CombatCheats.ts needs direct access
    this.hideNarratorModal();
    const depth = 35;
    const panelW = 520;
    const panelH = 170;
    const cx = LOGICAL_WIDTH / 2;
    const cy = LOGICAL_HEIGHT / 2;
    this.narratorModalObjects.add(addModalBackdrop(this, depth));
    this.narratorModalObjects.add(
      this.add.rectangle(px(cx), px(cy), px(panelW), px(panelH), 0x080820, 0.97)
        .setStrokeStyle(px(1), 0x334466)
        .setDepth(depth + 1),
    );
    this.narratorModalObjects.add(
      this.add.text(px(cx + panelW / 2 - 8), px(cy - panelH / 2 + 7), `${String(idx + 1)}/${String(lines.length)}`, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(9))}px`, color: '#444466',
      }).setOrigin(1, 0).setDepth(depth + 2),
    );
    this.narratorModalObjects.add(
      this.add.text(px(cx), px(cy - 22), lines[idx] ?? '', {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(16))}px`,
        color: '#ffaa22', wordWrap: { width: px(panelW - 48) }, align: 'center',
      }).setOrigin(0.5).setDepth(depth + 2),
    );
    const isLast = idx >= lines.length - 1;
    this.narratorModalObjects.add(
      addTextButton(this, {
        x: px(isLast ? cx : cx + 70), y: px(cy + 54), label: isLast ? 'CONTINUE' : 'NEXT →',
        color: 0x00ffee, size: 16,
        onClick: () => {
          if (isLast) {
            resolveNarrator(this.core);
          } else {
            this.narratorLineIdx = idx + 1;
            this.showNarratorLine(lines, this.narratorLineIdx);
          }
        },
      }).setDepth(depth + 2),
    );
    // Only offered before the last line — CONTINUE already dismisses the whole popup
    // there, so a separate SKIP would be a redundant second button doing the same thing.
    if (!isLast) {
      this.narratorModalObjects.add(
        addTextButton(this, {
          x: px(cx - 70), y: px(cy + 54), label: 'SKIP', color: 0x556677, size: 13,
          onClick: () => { resolveNarrator(this.core); },
        }).setDepth(depth + 2),
      );
    }
    const arrowRow = this.usingRetryNarration ? undefined : NARRATOR_ARROW_TARGETS[this.core.mission.id]?.[this.narratorEventIndex]?.[idx];
    if (arrowRow !== undefined) {
      const boxBounds = new Phaser.Geom.Rectangle(px(cx - panelW / 2), px(cy - panelH / 2), px(panelW), px(panelH));
      this.narratorModalObjects.add(drawPointerArrow(this, boxBounds, hudRowScreenBounds(arrowRow), 0x00ffee, depth + 2));
    }
  }

  private hideNarratorModal(): void {
    this.narratorModalObjects.destroyAll();
  }

  private syncNarrator(): void {
    const missionId = this.core.mission.id;
    if (!this.narratorSupportCallShown && this.core.supportCallsDone >= 1) {
      this.narratorSupportCallShown = true;
      const line = getStoryLine(missionId, 'first-support-call');
      if (line !== undefined) this.narrator.show(line);
    }
    if (!this.narratorBossShown && this.core.enemies.some((e) => e.isBoss)) {
      this.narratorBossShown = true;
      const line = getStoryLine(missionId, 'boss-appear');
      if (line !== undefined) this.narrator.show(line);
    }
    if (!this.narratorBoosterShown && this.core.enemies.some((e) => e.kind === 'booster')) {
      this.narratorBoosterShown = true;
      const line = getStoryLine(missionId, 'first-booster-appear');
      if (line !== undefined) this.narrator.show(line);
    }
  }

  private renderThruster(): void {
    renderThrusterAssembly(
      this.thrusterGfx, this.motorGfx,
      px(SHIP_CENTER_X) + this.driftX(), px(SHIP_Y) + this.bobY(),
      { motorLevel: this.motorLevel, kindColor: this.motorKindColor, phase: this.thrusterPhase },
    );
  }

  private spawnLaserBolt(boltKind: 'normal' | 'crit' | 'miss' = 'normal'): void {
    const weapon = this.core.loadout.weapon;
    if (weapon === null) return;
    const isNova = weapon.kind === 'nova';
    const side = this.gunToggle ? 1 : -1;
    this.gunToggle = !this.gunToggle;
    const gx = px(SHIP_CENTER_X) + this.driftX() + (isNova ? 0 : px(SHIP_GUN_X_OFFSET) * side);
    const gy = px(SHIP_Y - SHIP_GUN_Y_OFFSET) + this.bobY();
    let targetY = px(GAME_TOP_Y);
    if (!isNova) {
      let front: { distance: number; kind: string } | undefined;
      for (const e of this.core.enemies) {
        if (front === undefined || e.distance < front.distance) front = e;
      }
      if (front === undefined) return;
      targetY = this.laneToY(front.distance, front.kind);
    }
    if (!isNova && targetY >= gy) return;
    const textureKey = laserTextureForWeaponId(weapon.id);
    const boltScale = boltScaleForLevel(splitWeaponId(weapon.id).level);
    const sprite = this.add
      .image(gx, gy, textureKey)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(boltScale)
      .setDepth(5);
    if (boltKind === 'crit') sprite.setTint(0xffffff);
    else if (boltKind === 'miss') { sprite.setTint(0x445566); sprite.setAlpha(0.35); }
    this.laserBolts.push({ sprite, vy: (targetY - gy) / LASER_TRAVEL_MS, targetY });
    this.muzzleFlashes.push({ x: gx, y: gy, life: MUZZLE_FLASH_MS });
  }

  private resolvePlayerBoltKind(): 'normal' | 'crit' | 'miss' {
    const events = this.core.pendingVisualEvents.filter(
      (e) => e.kind === 'player-crit' || e.kind === 'player-miss',
    );
    if (events.some((e) => e.kind === 'player-crit')) return 'crit';
    if (events.length > 0 && events.every((e) => e.kind === 'player-miss')) return 'miss';
    return 'normal';
  }

  private spawnDeflectionSpark(): void {
    const cx = px(SHIP_CENTER_X) + this.driftX();
    const cy = px(SHIP_Y - 6) + this.bobY();
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 + i * 0.2;
      const speed = px(35 + i * 12);
      this.burstParticles.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: 0x44aaff, life: 200, maxLife: 200,
      });
    }
  }

  /** Distinct feedback for a collision + shield burst-back event (GAME_DESIGN.md §6) —
   * bigger and redder than a normal shield hit, and radiates out to every currently
   * visible enemy, so "shield absorbed a hit, then nearby enemies took damage" reads as
   * one causal event instead of an unexplained shield drop plus enemies taking damage
   * from nowhere. Purely visual — the mechanic itself lives in core/conveyor.ts and is
   * not touched here. */
  private spawnCollisionFeedback(): void {
    const cx = px(SHIP_CENTER_X) + this.driftX();
    const cy = px(SHIP_Y - 6) + this.bobY();
    this.cameras.main.shake(180, 0.008);
    this.spawnBurst(cx, cy, 0xff3300, 24);
    for (const sprite of this.enemySprites.values()) {
      this.spawnBurst(sprite.x, sprite.y, 0xff6633, 8);
    }
  }

  /** Wide radial burst marking a manual side-weapon shot — bigger and longer-lived than a deflection spark. */
  private spawnSideWeaponBurst(color: number): void {
    const cx = px(SHIP_CENTER_X) + this.driftX();
    const cy = px(SHIP_Y - 6) + this.bobY();
    const count = 10;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const speed = px(60 + (i % 3) * 20);
      this.burstParticles.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color, life: 320, maxLife: 320,
      });
    }
  }

  private renderGuns(): void {
    renderGunIndicator(this.gunGfx, this.core.loadout.weapon,
      px(SHIP_CENTER_X) + this.driftX(), px(SHIP_Y - SHIP_GUN_Y_OFFSET) + this.bobY());
  }

  private renderRearGuns(): void {
    drawRearWeaponIndicator(this.rearGunGfx, this.core.loadout.rearWeapon,
      px(SHIP_CENTER_X) + this.driftX(), px(SHIP_Y) + this.bobY());
  }

  private renderSideGuns(): void {
    drawSideWeaponIndicator(this.sideGunGfx, this.core.loadout.sideWeapon,
      px(SHIP_CENTER_X) + this.driftX(), px(SHIP_Y) + this.bobY());
  }

  private renderGenerator(): void {
    const genCap = this.core.loadout.generator.capacity;
    const frac = genCap > 0 ? this.core.ship.energy / genCap : 0;
    drawGeneratorCore(this.generatorGfx,
      px(SHIP_CENTER_X) + this.driftX(), px(SHIP_Y) + this.bobY(), frac);
  }

  private renderMuzzleFlashes(deltaMs: number): void {
    this.muzzleFlashes = tickMuzzleFlashes(this.muzzleFlashGfx, this.muzzleFlashes, deltaMs, MUZZLE_FLASH_MS);
  }

  private updateLasers(deltaMs: number): void {
    this.laserBolts = tickLaserBolts(this.laserBolts, deltaMs);
  }

  private updateRearLasers(deltaMs: number): void {
    this.rearLaserBolts = tickLaserBolts(this.rearLaserBolts, deltaMs);
  }

  private updateSideLasers(deltaMs: number): void {
    this.sideLaserBolts = tickLaserBolts(this.sideLaserBolts, deltaMs);
  }

  /** Spawns one traveling bolt per target — targets must be captured before fireSideWeapon()
   * runs, since it can kill and remove them from state.enemies before the view reacts.
   * Always travels at least SIDE_BOLT_MIN_TRAVEL so a shot at a near enemy still reads as a
   * launch, not an instant flash — the exact target position only stretches the flight further. */
  private spawnSideWeaponBolts(sideWeapon: { kind: string; id: string }, targets: EnemyState[]): void {
    const texKey = sideBoltTextureKey(sideWeapon.id);
    const cx = px(SHIP_CENTER_X) + this.driftX();
    const cy = px(SHIP_Y - 6) + this.bobY();
    const nearTargetY = cy - px(SIDE_BOLT_MIN_TRAVEL);
    for (const enemy of targets) {
      const targetY = Math.min(this.laneToY(enemy.distance, enemy.kind), nearTargetY);
      const sprite = this.add
        .image(cx, cy, texKey)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(SIDE_BOLT_SCALE)
        .setDepth(5);
      this.sideLaserBolts.push({ sprite, vy: (targetY - cy) / SIDE_BOLT_TRAVEL_MS, targetY });
    }
  }

  private spawnRearBolt(): void {
    const rearWeapon = this.core.loadout.rearWeapon;
    if (rearWeapon === null) return;
    const texKey = rearBoltTextureKey(rearWeapon.id);
    const cx = px(SHIP_CENTER_X) + this.driftX();
    const cy = px(SHIP_Y) + this.bobY();
    const targetY = px(GAME_TOP_Y);
    for (const side of [-1, 1]) {
      const gx = cx + px(SHIP_GUN_X_OFFSET * 1.4) * side;
      const gy = cy + px(9);
      if (gy <= targetY) continue;
      const sprite = this.add
        .image(gx, gy, texKey)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(5);
      this.rearLaserBolts.push({ sprite, vy: (targetY - gy) / LASER_TRAVEL_MS, targetY });
      this.muzzleFlashes.push({ x: gx, y: gy, life: MUZZLE_FLASH_MS });
    }
  }

  private spawnEnemyBolt(enemy: EnemyState, outcome: 'normal' | 'crit' | 'miss' = 'normal'): void {
    const startY = this.laneToY(enemy.distance, enemy.kind) + px(12);
    const targetY = px(SHIP_Y - 20);
    if (startY >= targetY) return;
    const color = outcome === 'crit' ? 0xff9900 : outcome === 'miss' ? 0x334455 : 0xff6600;
    const alpha = outcome === 'miss' ? 0.35 : 0.9;
    // Bigger and with a soft trailing glow behind the core bolt — the old bare 3x8px
    // rect read as barely-there next to the player's own textured, scaled laser bolts.
    const glow = this.add
      .rectangle(px(SHIP_CENTER_X), startY, px(9), px(22), color, alpha * 0.35)
      .setDepth(4)
      .setBlendMode(Phaser.BlendModes.ADD);
    const rect = this.add
      .rectangle(px(SHIP_CENTER_X), startY, px(5), px(13), color, alpha)
      .setDepth(5)
      .setBlendMode(Phaser.BlendModes.ADD);
    const travelMs = 320;
    const vy = (targetY - startY) / travelMs;
    this.enemyBolts.push({ rect, glow, vy, targetY });
  }

  private updateEnemyBolts(deltaMs: number): void {
    this.enemyBolts = this.enemyBolts.filter((bolt) => {
      bolt.rect.setY(bolt.rect.y + bolt.vy * deltaMs);
      bolt.glow.setY(bolt.rect.y);
      if (bolt.rect.y >= bolt.targetY) {
        bolt.rect.destroy();
        bolt.glow.destroy();
        return false;
      }
      return true;
    });
  }

  private snapshotDistances(): void {
    this.previousDistances.clear();
    this.previousHps.clear();
    for (const enemy of this.core.enemies) {
      this.previousDistances.set(enemy.id, enemy.distance);
      this.previousHps.set(enemy.id, enemy.hp);
    }
  }

  private detectHits(): void {
    // Called once per tick (inside the fixed-timestep loop), not once per rendered
    // frame — pendingVisualEvents is reset at the top of the NEXT advanceTick, so this
    // is the only place that can see every tick's kills, even when several ticks run
    // in one frame (fast-forward / a lagged frame).
    const burstHitEnemyIds = new Set<number>();
    for (const event of this.core.pendingVisualEvents) {
      if (event.kind === 'enemy-killed' && event.enemyId !== undefined) {
        this.enemyCoinRewards.set(event.enemyId, event.coins ?? 0);
      }
      if (event.kind === 'shield-burst' && event.enemyId !== undefined) {
        burstHitEnemyIds.add(event.enemyId);
      }
    }
    for (const enemy of this.core.enemies) {
      const hpBefore = this.previousHps.get(enemy.id);
      if (hpBefore === undefined) continue;
      const sprite = this.enemySprites.get(enemy.id);
      if (sprite === undefined) continue;
      if (enemy.hp < hpBefore - 0.5) {
        this.spawnHitBurst(sprite.x, sprite.y);
        // Shield-burst chip damage (conveyor.ts's advanceEnemies, t1's own mechanic)
        // renders shieldBlue instead of the default enemyRed — the only other source of
        // enemy hp loss, weapon fire, never fires alongside it in the same tick (a
        // burst-killed enemy is pruned before the next weapon-fire phase runs), so there's
        // no case where one enemy needs both colors at once.
        const color = burstHitEnemyIds.has(enemy.id) ? PALETTE.shieldBlue : undefined;
        this.spawnDamageFloat(sprite.x, sprite.y, hpBefore - enemy.hp, color);
      } else if (enemy.hp > hpBefore + 0.5) {
        // regenerateEnemies (guardian self-heal, or a booster feeding the enemy ahead of
        // it) ticks every 100ms and was otherwise silent — accumulate and flush to one
        // floating number every HEAL_FLOAT_INTERVAL_MS rather than spawning ~10/s. Reads
        // unambiguously next to the coin popup's gold "+◈N": green number = HP, gold
        // "◈" = coins, never the same glyph.
        const pending = (this.healAccumulator.get(enemy.id) ?? 0) + (enemy.hp - hpBefore);
        if ((this.healFloatCooldown.get(enemy.id) ?? 0) <= 0) {
          this.spawnHealFloat(sprite.x, sprite.y, pending);
          this.healAccumulator.set(enemy.id, 0);
          this.healFloatCooldown.set(enemy.id, HEAL_FLOAT_INTERVAL_MS);
        } else {
          this.healAccumulator.set(enemy.id, pending);
        }
      }
    }
  }

  private spawnHitBurst(x: number, y: number): void {
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + i * 0.15;
      const speed = px(28 + (i % 3) * 14);
      this.burstParticles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, color: 0xffffff, life: 140, maxLife: 140 });
    }
  }

  /**
   * Two enemies can legitimately end up rendered close together — different speeds
   * closing a gap over time, or two waves close enough in schedule to overlap on
   * screen — even though their underlying `distance` values are perfectly valid core
   * state. Fixed here, in the view, purely as a display-position nudge recomputed
   * fresh from the true distance every frame: sorts by Y (closer to the ship = larger
   * Y = "ahead") and pushes each subsequent, further-back sprite up just enough to
   * clear a gap of half the pair's own average size between their edges. Never
   * touches `enemy.distance` itself, so it can't compound frame-to-frame — an earlier
   * attempt enforced this same gap in core/conveyor.ts instead, and because that
   * correction persisted in `distance` across ticks, a backlog (player can't clear
   * waves fast enough) fed on itself: every new spawn got pushed back by however far
   * the existing pileup had already grown, without bound, until missions couldn't
   * resolve (docs/known-issues.md).
   */
  private separateOverlappingSprites(
    positioned: { enemy: EnemyState; sprite: Phaser.GameObjects.Image; y: number }[],
  ): void {
    positioned.sort((a, b) => b.y - a.y); // descending Y: closest-to-ship first
    for (let i = 1; i < positioned.length; i++) {
      const ahead = positioned[i - 1];
      const behind = positioned[i];
      if (ahead === undefined || behind === undefined) continue;
      const rAhead = ENEMY_VISUAL_RADIUS[ahead.enemy.kind] ?? ENEMY_VISUAL_RADIUS_FALLBACK;
      const rBehind = ENEMY_VISUAL_RADIUS[behind.enemy.kind] ?? ENEMY_VISUAL_RADIUS_FALLBACK;
      const requiredGap = px(1.5 * (rAhead + rBehind));
      const floor = ahead.y - requiredGap;
      if (behind.y > floor) behind.y = floor;
    }
  }

  private renderEnemies(alpha: number): void {
    const liveIds = new Set<number>();
    this.hpBarGfx.clear();
    const positioned: { enemy: EnemyState; sprite: Phaser.GameObjects.Image; y: number }[] = [];
    for (const enemy of this.core.enemies) {
      liveIds.add(enemy.id);
      let sprite = this.enemySprites.get(enemy.id);
      if (sprite === undefined) {
        const enemyId = enemy.id;
        sprite = this.add
          .image(px(SHIP_CENTER_X), px(GAME_TOP_Y), textureForEnemyKind(enemy.kind, enemy.isBoss, enemy.blocksConveyor))
          .setBlendMode(Phaser.BlendModes.ADD)
          // isGameplayEntity: read by tools/tap-target-audit.ts to exclude enemy sprites
          // from the 44x44/20px UI safe-zone rules — they're combat entities sized by
          // gameplay balance, not tap controls, and tap-to-target works at any size.
          .setData('isGameplayEntity', true)
          .setInteractive({ useHandCursor: true });
        // Tap-to-target (front weapon only, fable-fun-review-followup.md Item 4): tapping
        // the already-marked enemy clears it — soft priority, free and instant, never a
        // wasted shot since fireShipWeapon falls back to front-most when unset/invalid.
        sprite.on('pointerdown', () => {
          setPriorityTarget(this.core, this.core.priorityTargetId === enemyId ? null : enemyId);
        });
        this.enemySprites.set(enemy.id, sprite);
        this.addEnemyAnimTween(sprite, enemy);
      }
      const previous = this.previousDistances.get(enemy.id) ?? enemy.distance;
      const distance = previous + (enemy.distance - previous) * alpha;
      positioned.push({ enemy, sprite, y: this.laneToY(distance, enemy.kind) });
    }
    this.separateOverlappingSprites(positioned);
    for (const { enemy, sprite, y } of positioned) {
      sprite.setY(y);
      sprite.setAlpha(0.4 + 0.6 * (enemy.hp / enemy.maxHp));
      // A regular (non-boss) enemy's `distance` can sit above LANE_LENGTH for a real,
      // multi-second stretch (spacing/jitter routinely push a wave's later spawns back
      // that far, not just the ~4px/one-tick overshoot this used to assume) — long
      // enough that sy-34 renders well off the top of the canvas while the sprite
      // itself is already clearly on screen. Skipping the bar/label entirely until
      // they'd land on-canvas (rather than clamping every enemy to one shared floor
      // Y, boss-style) avoids two different enemies' labels ever landing on top of
      // each other at that shared spot.
      const hpOverlayVisible = enemy.isBoss || this.hpOverlayBarTop(sprite.y, false) >= 0;
      if (hpOverlayVisible) {
        this.drawEnemyHpBar(sprite.x, sprite.y, enemy.hp / enemy.maxHp, enemy.isBoss);
        this.updateEnemyHpLabel(enemy, sprite.x, sprite.y);
      } else {
        this.hpLabels.get(enemy.id)?.setVisible(false);
      }
      if (enemy.blocksConveyor && enemy.holdChargeTicks > 0) {
        this.drawHoldChargeRing(sprite.x, sprite.y, enemy.kind, enemy.holdChargeTicks, this.core.enemies.length > 1);
      }
      this.drawEnemyFireTelegraph(sprite.x, sprite.y, enemy.kind, enemy.shootTimer, enemy.ticksBetweenShots);
    }
    // Detect deaths: any id that was alive last frame but isn't now
    for (const [id, sprite] of this.enemySprites) {
      if (!liveIds.has(id)) {
        this.onEnemyDeath(sprite.x, sprite.y, id);
        sprite.destroy();
        this.enemySprites.delete(id);
        this.hpLabels.get(id)?.destroy();
        this.hpLabels.delete(id);
      }
    }
    this.renderTargetMarker();
    this.renderBoosterBuffs();
  }

  /** Item 7's booster mechanic (regenerateEnemies, core/combat.ts) is otherwise invisible
   * — the buff target changes tick-to-tick with no player-facing signal at all. Draws a
   * thin pulsing line from each alive booster to whichever enemy it's currently feeding,
   * using the exact same nearestEnemyAhead() the core uses, so this can never show a
   * connection that doesn't match what's actually happening in the sim. */
  private renderBoosterBuffs(): void {
    this.boosterBuffGfx.clear();
    const boosters = this.core.enemies.filter((e) => e.kind === 'booster');
    if (boosters.length === 0) return;
    const pulse = 0.4 + 0.35 * Math.sin(this.targetMarkerPhase / 260);
    for (const booster of boosters) {
      const target = nearestEnemyAhead(this.core.enemies, booster);
      if (target === null) continue;
      const from = this.enemySprites.get(booster.id);
      const to = this.enemySprites.get(target.id);
      if (from === undefined || to === undefined) continue;
      // Green, not amber — amber is already the enemy-side "energy/coin" hue (hold-charge
      // rings, coin popups); this is a heal, so it reuses the same green the healthy-HP
      // bar fill already uses, reading instantly as "topping up that HP bar" at a glance.
      this.boosterBuffGfx.lineStyle(px(1.6), BOOSTER_BUFF_GREEN, pulse);
      this.boosterBuffGfx.beginPath();
      this.boosterBuffGfx.moveTo(from.x, from.y);
      this.boosterBuffGfx.lineTo(to.x, to.y);
      this.boosterBuffGfx.strokePath();
      const targetRadius = px((ENEMY_VISUAL_RADIUS[target.kind] ?? ENEMY_VISUAL_RADIUS_FALLBACK) + 3);
      this.boosterBuffGfx.lineStyle(px(1.8), BOOSTER_BUFF_GREEN, pulse + 0.2);
      this.boosterBuffGfx.strokeCircle(to.x, to.y, targetRadius);
    }
  }

  /** Corner-bracket reticle on the current priority target — reading this.core directly
   * (not passed in) keeps renderEnemies' signature stable; auto-clears for free the
   * instant the target dies, since enemySprites.get() then returns undefined and nothing
   * draws (no separate "target lost" bookkeeping needed). */
  private renderTargetMarker(): void {
    this.targetMarkerGfx.clear();
    if (this.core.priorityTargetId === null) return;
    const sprite = this.enemySprites.get(this.core.priorityTargetId);
    if (sprite === undefined) return;
    const enemy = this.core.enemies.find((e) => e.id === this.core.priorityTargetId);
    const radius = px((ENEMY_VISUAL_RADIUS[enemy?.kind ?? 'fodder'] ?? ENEMY_VISUAL_RADIUS_FALLBACK) + 6);
    const pulse = 0.7 + 0.3 * Math.sin(this.targetMarkerPhase / 220);
    const armLen = radius * 0.42;
    this.targetMarkerGfx.lineStyle(px(1.4), PALETTE.weaponCyan, pulse);
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      const cx = sprite.x + sx * radius;
      const cy = sprite.y + sy * radius;
      this.targetMarkerGfx.beginPath();
      this.targetMarkerGfx.moveTo(cx - sx * armLen, cy);
      this.targetMarkerGfx.lineTo(cx, cy);
      this.targetMarkerGfx.lineTo(cx, cy - sy * armLen);
      this.targetMarkerGfx.strokePath();
    }
  }

  /** Shared by drawEnemyHpBar/updateEnemyHpLabel so their bar-top math can never drift
   * apart (it used to be copy-pasted in both) — including the boss-only off-canvas
   * clamp (MIN_BOSS_HP_OVERLAY_TOP_Y's own comment has the full reasoning). */
  private hpOverlayBarTop(sy: number, isBoss: boolean): number {
    const raw = sy - px(isBoss ? 58 : 34);
    return isBoss ? Math.max(raw, px(MIN_BOSS_HP_OVERLAY_TOP_Y)) : raw;
  }

  /** A boss reusing a regular enemy's 32×3px overhead bar reads as an afterthought next to
   * its much larger sprite (ENEMY_VISUAL_RADIUS.boss = 48 vs. 24-32 for everything else) —
   * scale the bar with the sprite so a final boss actually looks like one at a glance,
   * without relying solely on the separate BOSS bar in the left info panel. */
  private drawEnemyHpBar(sx: number, sy: number, frac: number, isBoss = false): void {
    const bw = px(isBoss ? 64 : 32); const bh = px(isBoss ? 5 : 3);
    const bx = sx - bw / 2; const by = this.hpOverlayBarTop(sy, isBoss);
    this.hpBarGfx.fillStyle(0x111122, 0.8);
    this.hpBarGfx.fillRect(bx, by, bw, bh);
    const col = frac > 0.55 ? 0x22ee44 : frac > 0.25 ? 0xffaa00 : 0xff2200;
    this.hpBarGfx.fillStyle(col, 0.85);
    this.hpBarGfx.fillRect(bx, by, bw * frac, bh);
    if (isBoss) {
      this.hpBarGfx.lineStyle(px(1), 0x662211, 0.6);
      this.hpBarGfx.strokeRect(bx, by, bw, bh);
    }
  }

  /** Persistent current/max HP text just above each enemy's bar. Reuses
   * drawEnemyHpBar's own bar-top offset and color-tier thresholds so the number always
   * sits directly over its bar and matches its color, regardless of boss scaling.
   * Current HP rounds up (ceil), not down — an enemy on a fractional sliver of hp (e.g.
   * mid-regen) should never flash "0" while still alive. */
  private updateEnemyHpLabel(enemy: EnemyState, sx: number, sy: number): void {
    const barTop = this.hpOverlayBarTop(sy, enemy.isBoss);
    const frac = enemy.hp / enemy.maxHp;
    const col = frac > 0.55 ? 0x22ee44 : frac > 0.25 ? 0xffaa00 : 0xff2200;
    let label = this.hpLabels.get(enemy.id);
    if (label === undefined) {
      label = this.add.text(sx, barTop, '', {
        fontFamily: UI_FONT,
        fontSize: `${String(fontPx(enemy.isBoss ? 9 : 7))}px`,
        color: cssColor(col),
        stroke: cssColor(PALETTE.backgroundNearBlack),
        strokeThickness: px(1.2),
      }).setOrigin(0.5, 1).setDepth(8);
      this.hpLabels.set(enemy.id, label);
    }
    label.setPosition(sx, barTop - px(1));
    label.setColor(cssColor(col));
    label.setText(`${String(Math.ceil(enemy.hp))}/${String(Math.round(enemy.maxHp))}`);
    label.setVisible(true);
  }

  /** The UI signal for "you're holding a blocker and charge is accruing/frozen" — a
   * filling ring around the blocker. Hugs the sprite bounds tightly (not a big halo) —
   * multiple blockers in one wave can still queue up close together on the conveyor
   * (conveyor.ts's minimum-gap enforcement keeps them from actually overlapping, but
   * not far apart), and a wide ring would produce an unreadable venn-diagram overlap
   * between adjacent ones. Color ramps
   * amber→red as charge builds (a "heat" reading, and distinct from the booster-buff
   * line's green); accruing-vs-frozen (pressure present vs. the lane cleared to just this
   * blocker — tick.ts's accrueHoldCharge) reads through alpha/width, not hue, so the two
   * signals never fight each other. A tick mark shows the tier-2 bonus-call threshold. */
  private drawHoldChargeRing(sx: number, sy: number, kind: string, holdChargeTicks: number, accruing: boolean): void {
    const radius = px((ENEMY_VISUAL_RADIUS[kind] ?? ENEMY_VISUAL_RADIUS_FALLBACK) + 6);
    const frac = Math.min(1, holdChargeTicks / HOLD_CHARGE_TIER_3_TICKS);
    this.hpBarGfx.lineStyle(px(1.2), 0x664422, 0.3);
    this.hpBarGfx.strokeCircle(sx, sy, radius);
    const color = lerpColor(PALETTE.generatorAmber, 0xff2200, frac);
    this.hpBarGfx.lineStyle(px(accruing ? 2.4 : 1.6), color, accruing ? 0.9 : 0.45);
    this.hpBarGfx.beginPath();
    this.hpBarGfx.arc(sx, sy, radius, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2, false);
    this.hpBarGfx.strokePath();
    const tickAngle = -Math.PI / 2 + (HOLD_CHARGE_TIER_2_TICKS / HOLD_CHARGE_TIER_3_TICKS) * Math.PI * 2;
    const tx1 = sx + Math.cos(tickAngle) * (radius - px(3));
    const ty1 = sy + Math.sin(tickAngle) * (radius - px(3));
    const tx2 = sx + Math.cos(tickAngle) * (radius + px(3));
    const ty2 = sy + Math.sin(tickAngle) * (radius + px(3));
    this.hpBarGfx.lineStyle(px(1.2), PALETTE.hullWhite, 0.5);
    this.hpBarGfx.beginPath();
    this.hpBarGfx.moveTo(tx1, ty1);
    this.hpBarGfx.lineTo(tx2, ty2);
    this.hpBarGfx.strokePath();
  }

  /** A growing, brightening warning spark at an enemy's own muzzle point (the edge
   * facing the ship) during the last quarter of its fire cadence — advance notice
   * that a shot is coming, not just the bolt itself appearing the instant it fires
   * (spawnEnemyBolt). Scaled to each kind's own `ticksBetweenShots` rather than a
   * fixed tick count, so a slow-firing kind isn't lit up for most of its cycle and a
   * fast one isn't skipped entirely. Bright yellow-white, not a red/orange in the same
   * family as the enemy sprites themselves — needs to read as a distinct warning
   * signal, not blend into the sprite's own outline. */
  private drawEnemyFireTelegraph(sx: number, sy: number, kind: string, shootTimer: number, ticksBetweenShots: number): void {
    if (ticksBetweenShots <= 0) return;
    const windowTicks = Math.max(1, ticksBetweenShots * 0.25);
    if (shootTimer > windowTicks) return;
    const frac = 1 - shootTimer / windowTicks; // 0 at window start → 1 right before firing
    const radius = ENEMY_VISUAL_RADIUS[kind] ?? ENEMY_VISUAL_RADIUS_FALLBACK;
    const muzzleY = sy + px(radius * 0.6); // toward the ship (larger Y = closer)
    const coreRadius = px(3 + frac * 5.5);
    this.hpBarGfx.fillStyle(0xffee44, 0.45 + frac * 0.5);
    this.hpBarGfx.fillCircle(sx, muzzleY, coreRadius);
    this.hpBarGfx.lineStyle(px(1.4), 0xffffff, 0.35 + frac * 0.55);
    this.hpBarGfx.strokeCircle(sx, muzzleY, coreRadius + px(3));
  }

  private onEnemyDeath(x: number, y: number, enemyId: number): void {
    const coinReward = this.enemyCoinRewards.get(enemyId) ?? 0;
    this.enemyCoinRewards.delete(enemyId);
    this.spawnBurst(x, y, 0xff6600, 14);
    this.spawnBurst(x, y, 0xffaa22, 6);
    if (coinReward > 0) this.spawnCoinFloat(x, y, coinReward);
  }

  private addEnemyAnimTween(sprite: Phaser.GameObjects.Image, enemy: EnemyState): void {
    const delay = (enemy.id % 8) * 125;
    if (enemy.isBoss) {
      this.tweens.add({ targets: sprite, scaleX: 1.18, scaleY: 1.18, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay });
      this.tweens.add({ targets: sprite, angle: 360, duration: 4000, repeat: -1, ease: 'Linear', delay });
    } else if (enemy.kind === 'swarm') {
      this.tweens.add({ targets: sprite, angle: 360, duration: 800, repeat: -1, ease: 'Linear', delay });
    } else if (enemy.kind === 'striker') {
      this.tweens.add({ targets: sprite, angle: 360, duration: 1800, repeat: -1, ease: 'Linear', delay });
    } else if (enemy.kind === 'blocker') {
      this.tweens.add({ targets: sprite, angle: 360, duration: 5000, repeat: -1, ease: 'Linear', delay });
    } else if (enemy.kind === 'tank') {
      this.tweens.add({ targets: sprite, angle: 360, duration: 3200, repeat: -1, ease: 'Linear', delay });
    } else if (enemy.kind === 'turret') {
      // Turret oscillates but never rotates fully — it's a stationary emplacement.
      this.tweens.add({ targets: sprite, scaleX: 1.08, scaleY: 1.08, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay });
    } else if (enemy.kind === 'kamikaze') {
      this.tweens.add({ targets: sprite, angle: 360, duration: 600, repeat: -1, ease: 'Linear', delay });
    } else {
      this.tweens.add({ targets: sprite, angle: 360, duration: 2400, repeat: -1, ease: 'Linear', delay });
    }
  }

  /**
   * Maps core distance (0 = collision, LANE_LENGTH = spawn point) to canvas Y
   * coordinate. Core distance is an abstract point value with no notion of sprite
   * size, so distance=0 mapped straight to SHIP_Y would draw an enemy's *center* over
   * the ship's center at the moment of collision — visually the enemy flies into the
   * ship rather than stopping when its edge touches the ship's edge. `enemyKind`
   * (defaults to fodder's radius for callers without one, e.g. hypothetical targets)
   * offsets the effective ship Y by both sprites' baked-texture radii (textures.ts's
   * `buildEnemyTextures`/ship texture, both halved) so distance=0 reads as edge-to-edge
   * contact instead of center-to-center overlap.
   */
  private laneToY(distance: number, enemyKind = 'fodder'): number {
    const edgeOffset = px(SHIP_VISUAL_RADIUS + (ENEMY_VISUAL_RADIUS[enemyKind] ?? ENEMY_VISUAL_RADIUS_FALLBACK));
    const shipY = px(SHIP_Y) - edgeOffset;
    const topY = px(GAME_TOP_Y);
    return shipY - (distance / LANE_LENGTH) * (shipY - topY);
  }


  private maybeFinish(): void {
    if (this.core.status === 'running' || this.finished) return;
    this.finished = true;
    const result = buildMissionResult(this.core);

    let save: SaveData;
    let newStarIds: string[];
    let dailyBonus: { coinsAwarded: number; isNewBest: boolean } | undefined;
    if (this.core.mission.id === DAILY_MISSION_ID) {
      // Not applyMissionResult — the daily never touches completedMissionIds/
      // missionStars (see applyDailyResult's own doc comment). Also reached when the
      // player abandons mid-run (confirmAbandon calls abandonRun() then this method) —
      // buildMissionResult above already has a settled, non-'running' status either way.
      // Reuses the SAME date key captured at reservation time (create()) — recomputing
      // `new Date()` here would risk paying out against the wrong day on a run long
      // enough to cross local midnight (found in design review).
      if (this.dailyTodayStr === null) throw new Error('daily mission finished without a reserved dailyTodayStr');
      const applied = applyDailyResult(this.save, result, this.dailyTodayStr);
      save = applied.save;
      newStarIds = [];
      dailyBonus = { coinsAwarded: applied.coinsAwarded, isNewBest: applied.isNewBest };
    } else {
      const applied = applyMissionResult(this.save, result);
      save = applied.save;
      newStarIds = applied.newStarIds;
    }

    const sceneData = {
      result, newStarIds, save,
      ...(dailyBonus !== undefined ? { dailyBonus } : {}),
      ...(this.wasAbandoned ? { wasAbandoned: true } : {}),
    };
    if (this.core.status === 'victory') {
      Sound.victory();
      this.time.delayedCall(VICTORY_EXIT_DELAY_MS, () => { this.scene.start('ResultScene', sceneData); });
    } else if (this.wasAbandoned) {
      // The player quit voluntarily with a live ship — no death flash/shake/explosion,
      // that visual means "you were destroyed" and this player wasn't.
      this.time.delayedCall(ABANDON_EXIT_DELAY_MS, () => { this.scene.start('ResultScene', sceneData); });
    } else {
      this.playDeathAnimation();
      this.time.delayedCall(DEFEAT_EXIT_DELAY_MS, () => { this.scene.start('ResultScene', sceneData); });
    }
  }

  showExitConfirm(): void { // not private: CombatCheats.ts needs direct access
    if (this.exitConfirmObjects.length > 0) return;
    const cx = px(LOGICAL_WIDTH / 2);
    const cy = px(LOGICAL_HEIGHT / 2);
    const isDaily = this.core.mission.id === DAILY_MISSION_ID;
    this.exitConfirmObjects.add(addModalBackdrop(this, 40));
    this.exitConfirmObjects.add(this.add.text(cx, cy - px(35), 'ABANDON MISSION?', {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(20))}px`, color: '#ddeeff',
    }).setOrigin(0.5).setDepth(41));
    // Daily-only subtitle: abandoning it still banks whatever's been earned so far and
    // ends today's one attempt (via confirmAbandon -> abandonRun + maybeFinish, the same
    // path a real defeat takes) — closing the "quit and try again for a better score"
    // loophole a silent, resultless exit (the campaign's own abandon behavior) would
    // otherwise leave wide open on a once-per-day mode.
    if (isDaily) {
      this.exitConfirmObjects.add(this.add.text(cx, cy - px(12), "Banks coins earned so far. Ends today's attempt.", {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(10))}px`, color: '#8899aa',
      }).setOrigin(0.5).setDepth(41));
    }
    this.exitConfirmObjects.add(addTextButton(this, {
      x: cx - px(60), y: cy + px(20), label: 'ABANDON', color: 0xff4444, size: 13,
      onClick: () => { this.confirmAbandon(); },
    }).setDepth(41));
    this.exitConfirmObjects.add(addTextButton(this, {
      x: cx + px(60), y: cy + px(20), label: 'CANCEL', color: 0xffaa22, size: 13,
      onClick: () => { this.hideExitConfirm(); },
    }).setDepth(41));
  }

  private hideExitConfirm(): void {
    this.exitConfirmObjects.destroyAll();
  }

  /** The real ABANDON button's decision, also called directly by cheatConfirmExit() so
   * the cheat exercises the exact same path a real tap does (same reasoning as
   * handleCardAction/cheatPickCard elsewhere in this class). Campaign missions keep
   * their existing behavior — abandon forfeits all progress, no result is ever built.
   * The daily banks its partial run instead (see showExitConfirm's subtitle above). */
  confirmAbandon(): void { // not private: CombatCheats.ts needs direct access
    // hideExitConfirm() (destroys + clears), not a bare array clear: the daily branch
    // below stays in this scene for maybeFinish()'s 600ms delayedCall before cutting to
    // ResultScene (unlike the campaign branch's immediate scene.start), so a bare clear
    // would leave the backdrop/buttons fully rendered and interactive for that whole
    // window, making CANCEL a silent no-op.
    this.hideExitConfirm();
    if (this.core.mission.id === DAILY_MISSION_ID) {
      this.wasAbandoned = true;
      abandonRun(this.core);
      this.maybeFinish();
    } else {
      this.scene.start('HubScene');
    }
  }

  private playDeathAnimation(): void {
    // Confined to the playfield (not cameras.main.flash(), which also washes out both
    // side panels — the HUD is exactly what a player needs to still read at 0 hull) and
    // driven by a tween rather than update()'s own deltaMs accumulator, since `finished`
    // is set right before this call and update() only runs the cosmetic-effects subset
    // for the rest of the scene (updatePostFinishEffects), not this animation's own state.
    // An edge vignette (matching renderLowHullVignette's own shape), not a flat fill —
    // a solid rectangle over the whole playfield read as a rendering glitch and buried
    // every enemy/effect underneath it.
    const flashState = { alpha: DEATH_FLASH_ALPHA };
    this.tweens.add({
      targets: flashState,
      alpha: 0,
      duration: 550,
      ease: 'Cubic.easeOut',
      onUpdate: () => {
        this.deathFlashGfx.clear();
        if (flashState.alpha <= 0) return;
        const vx = px(GAME_X); const vw = px(GAME_WIDTH); const vh = px(LOGICAL_HEIGHT);
        const edgeW = px(50);
        this.deathFlashGfx.fillStyle(0xff2200, flashState.alpha);
        this.deathFlashGfx.fillRect(vx, 0, edgeW, vh);
        this.deathFlashGfx.fillRect(vx + vw - edgeW, 0, edgeW, vh);
        this.deathFlashGfx.fillRect(vx + edgeW, 0, vw - 2 * edgeW, edgeW * 0.6);
        this.deathFlashGfx.fillRect(vx + edgeW, vh - edgeW * 0.6, vw - 2 * edgeW, edgeW * 0.6);
      },
    });
    this.cameras.main.shake(400, 0.018);
    const cx = px(SHIP_CENTER_X) + this.driftX();
    const cy = px(SHIP_Y) + this.bobY();
    for (let ring = 0; ring < 3; ring++) {
      this.time.delayedCall(ring * 160, () => {
        this.spawnTweenBurst(cx, cy, 0xff4400, 18);
        this.spawnTweenBurst(cx, cy, 0xffcc00, 6);
      });
    }
    // Every other ship-attached visual (thruster/motor glow, gun/rear-gun/side-gun
    // indicators, the generator core, the shield glow ring, the small hull/shield status
    // bars) is its own Graphics object, never parented to shipSprite — fading shipSprite
    // alone left them either frozen in place (most of them, since their own render calls
    // stop once `finished` is set) or, for the thruster and status bars specifically,
    // still fully opaque and visibly redrawn via updatePostFinishEffects's continued
    // calls — an engine glow and a floating 0/0 readout with no ship left to attach to.
    // Graphics.alpha is a multiplier over everything drawn into it regardless of how many
    // more times it's redrawn, so fading it here works whether or not something keeps
    // calling into it afterward.
    this.tweens.add({
      targets: [
        this.shipSprite, this.thrusterGfx, this.motorGfx, this.gunGfx,
        this.rearGunGfx, this.sideGunGfx, this.generatorGfx, this.shieldGfx, this.shipStatusBarGfx,
      ],
      alpha: 0,
      duration: 500,
      delay: 100,
    });
  }

  // ── Dev-only cheats (__cheat.combat.*, main.ts) — implementations live in
  // CombatCheats.ts; these are thin delegates so main.ts's `scene[method]` lookup
  // convention still finds them by name.

  // fallow-ignore-next-line unused-class-member
  cheatFastForward(ticks: number): void { this.cheats.fastForward(ticks); }
  // fallow-ignore-next-line unused-class-member
  cheatFastForwardToOffer(maxTicks: number): void { this.cheats.fastForwardToOffer(maxTicks); }
  // fallow-ignore-next-line unused-class-member
  cheatFastForwardToNarrator(maxTicks: number): void { this.cheats.fastForwardToNarrator(maxTicks); }
  // fallow-ignore-next-line unused-class-member
  cheatMarkTarget(enemyId: number | null): void { this.cheats.markTarget(enemyId); }
  // fallow-ignore-next-line unused-class-member
  cheatSetToggle(system: 'fire' | 'rear' | 'shield', on: boolean): void { this.cheats.setToggle(system, on); }
  // fallow-ignore-next-line unused-class-member
  cheatShowExitConfirm(): void { this.cheats.showExitConfirm(); }
  // fallow-ignore-next-line unused-class-member
  cheatConfirmExit(): void { this.cheats.confirmExit(); }
  // fallow-ignore-next-line unused-class-member
  cheatDismissNarrator(): void { this.cheats.dismissNarrator(); }
  // fallow-ignore-next-line unused-class-member
  cheatNarratorNext(): void { this.cheats.narratorNext(); }
  // fallow-ignore-next-line unused-class-member
  cheatPickCard(index: number): void { this.cheats.pickCard(index); }
  // fallow-ignore-next-line unused-class-member
  cheatRerollCard(): void { this.cheats.rerollCard(); }
  // fallow-ignore-next-line unused-class-member
  cheatSkipCard(): void { this.cheats.skipCard(); }
  // fallow-ignore-next-line unused-class-member
  cheatActivateAbility(slotIndex: number): void { this.cheats.activateAbility(slotIndex); }
  // fallow-ignore-next-line unused-class-member
  cheatFireSideWeapon(): void { this.cheats.fireSideWeapon(); }
  // fallow-ignore-next-line unused-class-member
  cheatActivateSupply(slot: number): void { this.cheats.activateSupply(slot); }
  // fallow-ignore-next-line unused-class-member
  cheatInspect(): unknown { return this.cheats.inspect(); }
}


function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
}

/** Glow/size multiplier for a laser bolt: level 1 = 0.85×, level 5 = 1.13×. */
function boltScaleForLevel(level: number): number {
  return 0.8 + level * 0.06;
}

/** Per-channel RGB lerp between two 0xRRGGBB colors, t clamped to [0, 1]. */
function lerpColor(from: number, to: number, t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  const fr = (from >> 16) & 0xff; const fg = (from >> 8) & 0xff; const fb = from & 0xff;
  const tr = (to >> 16) & 0xff; const tg = (to >> 8) & 0xff; const tb = to & 0xff;
  const r = Math.round(fr + (tr - fr) * clamped);
  const g = Math.round(fg + (tg - fg) * clamped);
  const b = Math.round(fb + (tb - fb) * clamped);
  return (r << 16) | (g << 8) | b;
}


// Derives from the same ABILITY_COMPANY_COLORS map CardOverlay's icon circles use, so the
// two never drift apart (this used to be a separate hardcoded copy of the same 4 colors).
function abilityCompanyColor(company: string): string {
  return cssColor(ABILITY_COMPANY_COLORS[company] ?? 0xaabbcc);
}

