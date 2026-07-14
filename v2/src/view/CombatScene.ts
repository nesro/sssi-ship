import Phaser from 'phaser';
import { resolveAbilityAction } from '../core/cards';
import { activateAbility, fireSideWeapon, toggleAutoFire, toggleAutoShield, toggleRearWeapon } from '../core/combat';
import { resolveNarrator } from '../core/narrator';
import { LANE_LENGTH, MS_PER_TICK } from '../core/constants';
import { buildMissionResult } from '../core/result';
import { createCoreState } from '../core/state';
import { applyBoost } from '../core/supplies';
import { advanceTick } from '../core/tick';
import type { CoreState, EnemyState } from '../core/types';
import { abilityById, abilityPoolForLoadout } from '../data/cards';
import { missionById } from '../data/missions';
import { getStoryLine } from '../data/story';
import { resolveForcedLoadout } from '../data/loadouts';
import { computeSideWeaponButtonViewModel } from '../viewmodel/combat';
import { ABILITY_COMPANY_COLORS } from '../viewmodel/companyColors';
import { applyMissionResult, buildLoadout, loadSave } from '../save/SaveManager';
import type { SaveData } from '../save/SaveManager';
import { Sound } from '../audio/SoundManager';
import { CardOverlay } from './CardOverlay';
import { CombatHud } from './CombatHud';
import { NarratorBar } from './NarratorBar';
import { SupplyButtons } from './SupplyButtons';
import { cssColor } from './palette';
import { BTN_PANEL_W, BTN_X, DPR, fontPx, GAME_WIDTH, GAME_X, INFO_PANEL_W, LOGICAL_HEIGHT, LOGICAL_WIDTH, px, SHIP_GUN_X_OFFSET, SHIP_GUN_Y_OFFSET } from './layout';
import { buildGameTextures, laserTextureForWeaponId, rearBoltTextureKey, sideBoltTextureKey, sideWeaponKindColor, textureForEnemyKind } from './textures';
import { iconTextureForSideWeaponId, motorKindColorFromId, motorLevelFromId, splitWeaponId, textureForShipId } from './textureKeys';
import { drawGeneratorCore, drawRearWeaponIndicator, drawShieldRings, drawSideWeaponIndicator, renderGunIndicator, renderThrusterAssembly, tickLaserBolts, tickMuzzleFlashes } from './shipRenderers';
import type { LaserBolt, MuzzleFlash } from './shipRenderers';
import { addModalBackdrop, addTextButton, drawDevBorder, UI_FONT } from './widgets';

// Ship sits at the bottom-centre of the game field; enemies stream from the top.
const SHIP_CENTER_X = GAME_X + Math.floor(GAME_WIDTH / 2); // 480 logical
const SHIP_Y = LOGICAL_HEIGHT - 80;                         // 460 logical
const GAME_TOP_Y = 30;                                      // top margin for progress bar
// Half of the ship's baked 52px-tall texture (textures.ts's buildShipTextures) — used by
// laneToY so a collision (core distance=0) reads as the enemy's edge touching the ship's
// edge, not the two sprites' centers overlapping.
const SHIP_VISUAL_RADIUS = 26;
// Half of each enemy kind's baked texture size (textures.ts's buildEnemyTextures) — same
// edge-touching purpose as SHIP_VISUAL_RADIUS above.
const ENEMY_VISUAL_RADIUS: Record<string, number> = {
  fodder: 24, striker: 26, tank: 28, swarm: 15, blocker: 32,
  guardian: 26, turret: 30, kamikaze: 20, boss: 48,
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
// Ability activation slots — must clear the 4 toggle buttons above (last one, side weapon,
// ends at y≈83) and leave room below for SupplyButtons.BUTTONS_TOP.
const ABILITY_SLOTS_TOP = 100;
const ABILITY_SLOT_GAP = 34;
const ABILITY_SLOT_H = 28;

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
const SHIELD_GLOW_BASE_ALPHA = 0.04;
const SHIELD_GLOW_FLASH_ALPHA = 0.06;
const SHIELD_GLOW_RADIUS_PAD = 6;
// Pulse ring expands this many logical px/s and fades this much alpha/s.
const PULSE_RING_EXPAND_PX_S = 120;
const PULSE_RING_FADE_S = 1.6;
// Hull fraction below which the red vignette starts appearing.
const VIGNETTE_THRESHOLD = 0.35;

interface BurstParticle {
  x: number; y: number; vx: number; vy: number;
  color: number; life: number; maxLife: number;
}
interface FloatingText { text: Phaser.GameObjects.Text; vy: number; life: number; maxLife: number }
interface ShieldPulseRing { radius: number; alpha: number }
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
  private core!: CoreState;
  private save!: SaveData;
  private hud!: CombatHud;
  private cardOverlay!: CardOverlay;
  private supplyButtons!: SupplyButtons;
  private narrator!: NarratorBar;
  private shipSprite!: Phaser.GameObjects.Image;
  private thrusterGfx!: Phaser.GameObjects.Graphics;
  private motorGfx!: Phaser.GameObjects.Graphics;
  private motorLevel: 1 | 2 | 3 = 1;
  private motorKindColor: number = 0xff44cc;
  private thrusterPhase = 0;
  private enemySprites = new Map<number, Phaser.GameObjects.Image>();
  private previousDistances = new Map<number, number>();
  private laserBolts: LaserBolt[] = [];
  private enemyBolts: { rect: Phaser.GameObjects.Rectangle; vy: number; targetY: number }[] = [];
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

  private shieldGfx!: Phaser.GameObjects.Graphics;
  private accumulatorMs = 0;
  private finished = false;
  private narratorSupportCallShown = false;
  private narratorBossShown = false;

  // Visual effects — combat feedback
  private particleGfx!: Phaser.GameObjects.Graphics;
  private vignetteGfx!: Phaser.GameObjects.Graphics;
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
  private exitConfirmObjects: Phaser.GameObjects.GameObject[] = [];
  private narratorModalObjects: Phaser.GameObjects.GameObject[] = [];
  private narratorLineIdx = 0;
  /** Coin reward per enemy id — stored at spawn, consumed on death. */
  private enemyCoinRewards = new Map<number, number>();
  /** HP snapshot from before the last tick — used to detect mid-tick hits for the hit burst. */
  private previousHps = new Map<number, number>();

  constructor() {
    super('CombatScene');
  }

  // fallow-ignore-next-line unused-class-member
  create(data: CombatSceneData): void {
    const mission = missionById(data.missionId);
    this.save = loadSave();
    const seed = randomSeed();
    const loadout = mission.forcedLoadout !== undefined
      ? resolveForcedLoadout(mission.forcedLoadout)
      : buildLoadout(this.save);
    this.core = createCoreState(mission, loadout, seed, abilityPoolForLoadout(loadout));
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

    // Mission name at top of game field
    this.add
      .text(px(GAME_X + GAME_WIDTH / 2), px(10), mission.name.toUpperCase(), {
        fontFamily: UI_FONT,
        fontSize: `${String(fontPx(9))}px`,
        color: '#aabbcc',
      })
      .setOrigin(0.5, 0)
      .setDepth(10);

    // "ABILITIES" header — shown after first pick; in left panel below ability slots
    this.cardsHeader = this.add.text(px(INFO_PANEL_W / 2), px(180), '', {
      fontFamily: UI_FONT,
      fontSize: `${String(fontPx(8))}px`,
      color: '#445566',
      align: 'center',
    }).setOrigin(0.5, 0).setDepth(10);

    this.hud = new CombatHud(this);
    this.cardOverlay = new CardOverlay(this, (action) => { this.handleCardAction(action); });
    this.supplyButtons = new SupplyButtons(this, this.core, (slot) => { this.handleBoostTap(slot); });
    this.narrator = new NarratorBar(this);

    this.buildToggleButtons();
    this.buildAbilitySlots();

    const exitX = px(BTN_X + BTN_PANEL_W / 2);
    const exitY = px(LOGICAL_HEIGHT - 22);
    const exitBg = this.add
      .rectangle(exitX, exitY, px(BTN_PANEL_W - 40), px(24), 0x110a14, 0.9)
      .setStrokeStyle(px(1), 0x443355)
      .setDepth(10)
      .setInteractive({ useHandCursor: true });
    exitBg.on('pointerdown', () => { this.showExitConfirm(); });
    this.add.text(exitX, exitY, 'EXIT', {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(8))}px`, color: '#665577',
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
    this.vignetteGfx = this.add.graphics().setDepth(9);

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

    this.enemySprites.clear();
    this.previousDistances.clear();
    this.previousHps.clear();
    this.enemyCoinRewards.clear();
    this.laserBolts = [];
    this.sideLaserBolts = [];
    this.enemyBolts = [];
    this.muzzleFlashes = [];
    this.burstParticles = [];
    this.floatingTexts = [];
    this.shieldPulseRings = [];
    this.stars = [];
    this.exitConfirmObjects = [];
    this.cardEntries = [];
    this.shieldHitFlash = 0;
    this.gunToggle = false;
    this.thrusterPhase = 0;
    this.accumulatorMs = 0;
    this.finished = false;
    this.narratorSupportCallShown = false;
    this.narratorBossShown = false;
    this.narratorModalObjects = [];
    this.narratorLineIdx = 0;

    this.addStarfield();

    const startLine = getStoryLine(mission.id, 'mission-start');
    if (startLine !== undefined) this.narrator.show(startLine);
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

  private renderShieldPulseRings(deltaMs: number): void {
    this.shieldPulseGfx.clear();
    const cx = px(SHIP_CENTER_X) + this.driftX();
    const cy = px(SHIP_Y - 6) + this.bobY();
    this.shieldPulseRings = this.shieldPulseRings.filter((ring) => {
      ring.radius += px(PULSE_RING_EXPAND_PX_S) * deltaMs / 1000;
      ring.alpha -= PULSE_RING_FADE_S * deltaMs / 1000;
      if (ring.alpha <= 0) return false;
      this.shieldPulseGfx.lineStyle(px(1.5), 0x44aaff, ring.alpha);
      this.shieldPulseGfx.strokeCircle(cx, cy, ring.radius);
      this.shieldPulseGfx.lineStyle(px(0.8), 0x88ddff, ring.alpha * 0.5);
      this.shieldPulseGfx.strokeCircle(cx, cy, ring.radius + px(4));
      return true;
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

  private updateBurstParticles(deltaMs: number): void {
    this.particleGfx.clear();
    this.burstParticles = this.burstParticles.filter((p) => {
      p.x += p.vx * deltaMs / 1000;
      p.y += p.vy * deltaMs / 1000;
      p.life -= deltaMs;
      if (p.life <= 0) return false;
      const t = p.life / p.maxLife;
      this.particleGfx.fillStyle(p.color, t * 0.9);
      this.particleGfx.fillRect(p.x - px(1.5), p.y - px(1.5), px(3), px(3));
      return true;
    });
  }

  private updateFloatingTexts(deltaMs: number): void {
    this.floatingTexts = this.floatingTexts.filter((ft) => {
      ft.text.y += ft.vy * deltaMs / 1000;
      ft.life -= deltaMs;
      ft.text.setAlpha(ft.life / ft.maxLife);
      if (ft.life <= 0) { ft.text.destroy(); return false; }
      return true;
    });
  }

  // fallow-ignore-next-line unused-class-member
  override update(_time: number, deltaMs: number): void {
    if (this.finished) return;
    this.accumulatorMs += Math.min(deltaMs, MAX_CATCH_UP_MS);
    this.thrusterPhase += deltaMs;

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

    this.syncCardOverlay();
    this.syncNarratorModal();
    this.syncNarrator();
    const alpha = this.core.pendingOffer !== null ? 1 : this.accumulatorMs / MS_PER_TICK;
    const boss = this.core.enemies.find((e) => e.isBoss) ?? null;
    const lastEvent = this.core.mission.events[this.core.mission.events.length - 1];
    const totalTicks = lastEvent !== undefined ? lastEvent.atTimelineTick * 1.05 : 1;
    const progressFrac = boss === null ? Math.min(1, this.core.timelineTick / totalTicks) : 0;
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
    this.updateLasers(deltaMs);
    this.updateRearLasers(deltaMs);
    this.updateSideLasers(deltaMs);
    this.updateEnemyBolts(deltaMs);
    this.updateBurstParticles(deltaMs);
    this.updateFloatingTexts(deltaMs);
    this.hud.update(this.core, boss, progressFrac);
    this.supplyButtons.update(this.core);
    this.updateAbilityBar();
    this.narrator.update(deltaMs);
    this.maybeFinish();
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
    }
    if (this.core.ship.shield < before.shield - 0.5) {
      this.shieldHitFlash = 1.0;
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

  private handleCardAction(action: number): void {
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

  private buildToggleButtons(): void {
    const cx = px(BTN_X + BTN_PANEL_W / 2);
    const btnW = px(BTN_PANEL_W - 40);
    const btnH = px(14);

    this.fireBg = this.add.rectangle(cx, px(22), btnW, btnH, TOGGLE_OFF_FILL)
      .setStrokeStyle(px(1), 0x225533).setDepth(10).setInteractive({ useHandCursor: true });
    this.fireBg.on('pointerdown', () => { toggleAutoFire(this.core); });
    this.autoFireLabel = this.add.text(cx, px(22), 'AUTO-FIRE  ON', {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(7))}px`, color: '#44ff66',
    }).setOrigin(0.5).setDepth(11);

    this.rearBg = this.add.rectangle(cx, px(40), btnW, btnH, TOGGLE_OFF_FILL)
      .setStrokeStyle(px(1), 0x336622).setDepth(10).setInteractive({ useHandCursor: true });
    this.rearBg.on('pointerdown', () => { toggleRearWeapon(this.core); });
    this.rearWeaponLabel = this.add.text(cx, px(40), 'REAR  ON', {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(7))}px`, color: '#88ff44',
    }).setOrigin(0.5).setDepth(11);
    if (this.core.loadout.rearWeapon === null) { this.rearBg.setAlpha(0.3); this.rearWeaponLabel.setAlpha(0.3); }

    this.shieldBg = this.add.rectangle(cx, px(58), btnW, btnH, TOGGLE_OFF_FILL)
      .setStrokeStyle(px(1), 0x223355).setDepth(10).setInteractive({ useHandCursor: true });
    this.shieldBg.on('pointerdown', () => { toggleAutoShield(this.core); });
    this.autoShieldLabel = this.add.text(cx, px(58), 'AUTO-SHIELD  ON', {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(7))}px`, color: '#4488ff',
    }).setOrigin(0.5).setDepth(11);

    this.sideWeaponBg = this.add.rectangle(cx, px(76), btnW, btnH, TOGGLE_OFF_FILL)
      .setStrokeStyle(px(1), 0x552233).setDepth(10).setInteractive({ useHandCursor: true });
    this.sideWeaponBg.on('pointerdown', () => { this.handleSideWeaponTap(); });
    const sideWeapon = this.core.loadout.sideWeapon;
    // Fall back to a always-baked icon key when unequipped — the image just stays hidden.
    this.sideWeaponIcon = this.add.image(cx - btnW / 2 + px(9), px(76), iconTextureForSideWeaponId(sideWeapon?.id ?? 'focus-1'))
      .setOrigin(0.5).setScale(0.4).setDepth(11).setVisible(sideWeapon !== null);
    this.sideWeaponLabel = this.add.text(cx + px(4), px(76), '—', {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(7))}px`, color: '#ff6688',
    }).setOrigin(0.5).setDepth(11);
    if (sideWeapon === null) { this.sideWeaponBg.setAlpha(0.3); this.sideWeaponLabel.setAlpha(0.3); }
  }

  private buildAbilitySlots(): void {
    const cx = px(BTN_X + BTN_PANEL_W / 2);
    const slotW = px(BTN_PANEL_W - 40);
    const slotH = px(ABILITY_SLOT_H);

    for (let i = 0; i < 3; i++) {
      const y = px(ABILITY_SLOTS_TOP + i * ABILITY_SLOT_GAP);
      const bg = this.add.rectangle(cx, y, slotW, slotH, ABILITY_SLOT_EMPTY_FILL)
        .setStrokeStyle(px(1), 0x334455)
        .setDepth(10)
        .setInteractive({ useHandCursor: true });
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
  }

  private updateAbilityBar(): void {
    this.autoFireLabel.setText(`AUTO-FIRE  ${this.core.autoFireEnabled ? 'ON' : 'OFF'}`);
    this.autoFireLabel.setColor(this.core.autoFireEnabled ? '#44ff66' : '#664422');
    this.fireBg.setFillStyle(this.core.autoFireEnabled ? FIRE_ON_FILL : TOGGLE_OFF_FILL);
    if (this.core.loadout.rearWeapon !== null) {
      this.rearWeaponLabel.setText(`REAR  ${this.core.rearWeaponEnabled ? 'ON' : 'OFF'}`);
      this.rearWeaponLabel.setColor(this.core.rearWeaponEnabled ? '#88ff44' : '#446622');
      this.rearBg.setFillStyle(this.core.rearWeaponEnabled ? REAR_ON_FILL : TOGGLE_OFF_FILL);
    }
    this.autoShieldLabel.setText(`AUTO-SHIELD  ${this.core.autoShieldEnabled ? 'ON' : 'OFF'}`);
    this.autoShieldLabel.setColor(this.core.autoShieldEnabled ? '#4488ff' : '#334466');
    this.shieldBg.setFillStyle(this.core.autoShieldEnabled ? SHIELD_ON_FILL : TOGGLE_OFF_FILL);

    const sideWeaponVm = computeSideWeaponButtonViewModel(this.core);
    this.sideWeaponLabel.setText(sideWeaponVm.equipped ? `${sideWeaponVm.label}  ${sideWeaponVm.chargesLabel}` : '—');
    this.sideWeaponLabel.setColor(sideWeaponVm.canFire ? '#ff6688' : '#663344');
    this.sideWeaponBg.setFillStyle(sideWeaponVm.canFire ? SIDE_WEAPON_READY_FILL : SIDE_WEAPON_EMPTY_FILL);
    this.sideWeaponBg.setAlpha(sideWeaponVm.equipped ? 1 : 0.3);
    this.sideWeaponLabel.setAlpha(sideWeaponVm.equipped ? 1 : 0.3);
    this.sideWeaponIcon.setAlpha(sideWeaponVm.equipped ? 1 : 0.3);

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

  private handleBoostTap(slot: number): void {
    const supply = this.core.supplies[slot];
    if (supply === undefined || supply.chargesLeft <= 0 || this.core.status !== 'running') return;
    applyBoost(this.core, slot);
    Sound.boost();
  }

  private handleSideWeaponTap(): void {
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
    if (lines !== null && this.narratorModalObjects.length === 0) {
      this.narratorLineIdx = 0;
      this.showNarratorLine(lines, 0);
    }
    if (lines === null && this.narratorModalObjects.length > 0) {
      this.hideNarratorModal();
    }
  }

  private showNarratorLine(lines: string[], idx: number): void {
    this.hideNarratorModal();
    const depth = 35;
    const panelW = 520;
    const panelH = 170;
    const cx = LOGICAL_WIDTH / 2;
    const cy = LOGICAL_HEIGHT / 2;
    this.narratorModalObjects.push(addModalBackdrop(this, depth));
    this.narratorModalObjects.push(
      this.add.rectangle(px(cx), px(cy), px(panelW), px(panelH), 0x080820, 0.97)
        .setStrokeStyle(px(1), 0x334466)
        .setDepth(depth + 1),
    );
    this.narratorModalObjects.push(
      this.add.text(px(cx + panelW / 2 - 8), px(cy - panelH / 2 + 7), `${String(idx + 1)}/${String(lines.length)}`, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(9))}px`, color: '#444466',
      }).setOrigin(1, 0).setDepth(depth + 2),
    );
    this.narratorModalObjects.push(
      this.add.text(px(cx), px(cy - 22), lines[idx] ?? '', {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(16))}px`,
        color: '#ffaa22', wordWrap: { width: px(panelW - 48) }, align: 'center',
      }).setOrigin(0.5).setDepth(depth + 2),
    );
    const isLast = idx >= lines.length - 1;
    this.narratorModalObjects.push(
      addTextButton(this, {
        x: px(cx), y: px(cy + 54), label: isLast ? 'CONTINUE' : 'NEXT →',
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
  }

  private hideNarratorModal(): void {
    this.narratorModalObjects.forEach((o) => { o.removeInteractive(); o.destroy(); });
    this.narratorModalObjects = [];
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
    const rect = this.add
      .rectangle(px(SHIP_CENTER_X), startY, px(3), px(8), color, alpha)
      .setDepth(5)
      .setBlendMode(Phaser.BlendModes.ADD);
    const travelMs = 240;
    const vy = (targetY - startY) / travelMs;
    this.enemyBolts.push({ rect, vy, targetY });
  }

  private updateEnemyBolts(deltaMs: number): void {
    this.enemyBolts = this.enemyBolts.filter((bolt) => {
      bolt.rect.setY(bolt.rect.y + bolt.vy * deltaMs);
      if (bolt.rect.y >= bolt.targetY) {
        bolt.rect.destroy();
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
    for (const enemy of this.core.enemies) {
      const hpBefore = this.previousHps.get(enemy.id);
      if (hpBefore !== undefined && enemy.hp < hpBefore - 0.5) {
        const sprite = this.enemySprites.get(enemy.id);
        if (sprite !== undefined) this.spawnHitBurst(sprite.x, sprite.y);
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

  private renderEnemies(alpha: number): void {
    const liveIds = new Set<number>();
    this.hpBarGfx.clear();
    for (const enemy of this.core.enemies) {
      liveIds.add(enemy.id);
      let sprite = this.enemySprites.get(enemy.id);
      if (sprite === undefined) {
        sprite = this.add
          .image(px(SHIP_CENTER_X), px(GAME_TOP_Y), textureForEnemyKind(enemy.kind, enemy.isBoss, enemy.blocksConveyor))
          .setBlendMode(Phaser.BlendModes.ADD);
        this.enemySprites.set(enemy.id, sprite);
        this.addEnemyAnimTween(sprite, enemy);
        this.enemyCoinRewards.set(enemy.id, enemy.coinReward);
      }
      const previous = this.previousDistances.get(enemy.id) ?? enemy.distance;
      const distance = previous + (enemy.distance - previous) * alpha;
      sprite.setY(this.laneToY(distance, enemy.kind));
      sprite.setAlpha(0.4 + 0.6 * (enemy.hp / enemy.maxHp));
      this.drawEnemyHpBar(sprite.x, sprite.y, enemy.hp / enemy.maxHp);
    }
    // Detect deaths: any id that was alive last frame but isn't now
    for (const [id, sprite] of this.enemySprites) {
      if (!liveIds.has(id)) {
        this.onEnemyDeath(sprite.x, sprite.y, id);
        sprite.destroy();
        this.enemySprites.delete(id);
      }
    }
  }

  private drawEnemyHpBar(sx: number, sy: number, frac: number): void {
    const bw = px(32); const bh = px(3);
    const bx = sx - bw / 2; const by = sy - px(34);
    this.hpBarGfx.fillStyle(0x111122, 0.8);
    this.hpBarGfx.fillRect(bx, by, bw, bh);
    const col = frac > 0.55 ? 0x22ee44 : frac > 0.25 ? 0xffaa00 : 0xff2200;
    this.hpBarGfx.fillStyle(col, 0.85);
    this.hpBarGfx.fillRect(bx, by, bw * frac, bh);
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
    const { save, newStarIds } = applyMissionResult(this.save, result);
    if (this.core.status === 'victory') {
      Sound.victory();
      this.time.delayedCall(600, () => { this.scene.start('ResultScene', { result, newStarIds, save }); });
    } else {
      this.playDeathAnimation();
      this.time.delayedCall(1400, () => { this.scene.start('ResultScene', { result, newStarIds, save }); });
    }
  }

  private showExitConfirm(): void {
    if (this.exitConfirmObjects.length > 0) return;
    const cx = px(LOGICAL_WIDTH / 2);
    const cy = px(LOGICAL_HEIGHT / 2);
    const backdrop = addModalBackdrop(this, 40);
    const title = this.add.text(cx, cy - px(35), 'ABANDON MISSION?', {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(20))}px`, color: '#ddeeff',
    }).setOrigin(0.5).setDepth(41);
    const confirmBtn = addTextButton(this, {
      x: cx - px(60), y: cy + px(20), label: 'ABANDON', color: 0xff4444, size: 13,
      onClick: () => { this.exitConfirmObjects = []; this.scene.start('HubScene'); },
    }).setDepth(41);
    const cancelBtn = addTextButton(this, {
      x: cx + px(60), y: cy + px(20), label: 'CANCEL', color: 0xffaa22, size: 13,
      onClick: () => { this.hideExitConfirm(); },
    }).setDepth(41);
    this.exitConfirmObjects = [backdrop, title, confirmBtn, cancelBtn];
  }

  private hideExitConfirm(): void {
    this.exitConfirmObjects.forEach((obj) => { obj.removeInteractive(); obj.destroy(); });
    this.exitConfirmObjects = [];
  }

  private playDeathAnimation(): void {
    this.cameras.main.flash(300, 255, 30, 30);
    this.cameras.main.shake(400, 0.018);
    const cx = px(SHIP_CENTER_X) + this.driftX();
    const cy = px(SHIP_Y) + this.bobY();
    for (let ring = 0; ring < 3; ring++) {
      this.time.delayedCall(ring * 160, () => {
        this.spawnTweenBurst(cx, cy, 0xff4400, 18);
        this.spawnTweenBurst(cx, cy, 0xffcc00, 6);
      });
    }
    this.tweens.add({ targets: this.shipSprite, alpha: 0, duration: 500, delay: 100 });
  }
}


function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
}

/** Glow/size multiplier for a laser bolt: level 1 = 0.85×, level 5 = 1.13×. */
function boltScaleForLevel(level: number): number {
  return 0.8 + level * 0.06;
}


// Derives from the same ABILITY_COMPANY_COLORS map CardOverlay's icon circles use, so the
// two never drift apart (this used to be a separate hardcoded copy of the same 4 colors).
function abilityCompanyColor(company: string): string {
  return cssColor(ABILITY_COMPANY_COLORS[company] ?? 0xaabbcc);
}

