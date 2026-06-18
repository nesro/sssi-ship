import Phaser from 'phaser';
import { resolveCardAction } from '../core/cards';
import { LANE_LENGTH, MS_PER_TICK, TICKS_PER_SECOND } from '../core/constants';
import { buildMissionResult } from '../core/result';
import { createCoreState } from '../core/state';
import { applyBoost } from '../core/supplies';
import { advanceTick } from '../core/tick';
import { activeDamageMult, computeEffectiveStats } from '../core/stats';
import type { CoreState, EnemyState } from '../core/types';
import { ALL_CARDS } from '../data/cards';
import { missionById } from '../data/missions';
import { getStoryLine } from '../data/story';
import { resolveForcedLoadout } from '../data/loadouts';
import { applyMissionResult, buildLoadout, loadSave } from '../save/SaveManager';
import type { SaveData } from '../save/SaveManager';
import { Sound } from '../audio/SoundManager';
import { CardOverlay } from './CardOverlay';
import { CombatHud } from './CombatHud';
import { NarratorBar } from './NarratorBar';
import { SupplyButtons } from './SupplyButtons';
import { fontPx, GAME_WIDTH, GAME_X, LEFT_PANEL_W, LOGICAL_HEIGHT, LOGICAL_WIDTH, px, RIGHT_PANEL_W, SHIP_GUN_X_OFFSET, SHIP_GUN_Y_OFFSET } from './layout';
import { buildGameTextures, laserTextureForWeaponId, splitWeaponId, textureForEnemyKind, TEXTURE_KEYS } from './textures';
import { drawThruster, renderGunIndicator, tickLaserBolts, tickMuzzleFlashes } from './shipRenderers';
import type { LaserBolt, MuzzleFlash } from './shipRenderers';
import { UI_FONT } from './widgets';

// Ship sits at the bottom-centre of the game field; enemies stream from the top.
const SHIP_CENTER_X = GAME_X + Math.floor(GAME_WIDTH / 2); // 480 logical
const SHIP_Y = LOGICAL_HEIGHT - 80;                         // 460 logical
const GAME_TOP_Y = 30;                                      // top margin for progress bar
const LASER_TRAVEL_MS = 180;
const MUZZLE_FLASH_MS = 100;
// Cap per-frame catch-up: if the tab is backgrounded on mobile, deltaMs can spike to many
// seconds. Without this the accumulator would fast-forward dozens of ticks in one frame and
// the mission could resolve the instant the player returns. 250 ms = at most ~3 ticks/frame.
const MAX_CATCH_UP_MS = 250;

// How fast shield hit-flash decays (full fade in ~550ms, matching v1 ShieldVisual).
const SHIELD_FLASH_DECAY = 1.8;
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
  private thrusterPhase = 0;
  private enemySprites = new Map<number, Phaser.GameObjects.Image>();
  private previousDistances = new Map<number, number>();
  private laserBolts: LaserBolt[] = [];
  private enemyBolts: { rect: Phaser.GameObjects.Rectangle; vy: number; targetY: number }[] = [];
  private stars: { rect: Phaser.GameObjects.Rectangle; speed: number }[] = [];
  private muzzleFlashes: MuzzleFlash[] = [];
  private muzzleFlashGfx!: Phaser.GameObjects.Graphics;
  private gunGfx!: Phaser.GameObjects.Graphics;
  private gunToggle = false;
  private hpBarGfx!: Phaser.GameObjects.Graphics;
  private progressGfx!: Phaser.GameObjects.Graphics;
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
  /** DPS / kills / time labels in the right panel. */
  private rightInfoTexts!: Phaser.GameObjects.Text[];
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
    this.core = createCoreState(mission, loadout, seed, ALL_CARDS);

    Sound.attach(this.sound);
    Sound.startMusic();
    buildGameTextures(this);

    // Left panel divider
    this.add.rectangle(px(LEFT_PANEL_W), 0, px(1), px(LOGICAL_HEIGHT), 0x333355).setOrigin(0, 0).setDepth(1);
    // Right panel: progress bar strip replaces the divider line — drawn each frame by progressGfx

    // Right panel info: DPS / kills / time stacked at the bottom
    const infoX = px(LOGICAL_WIDTH - RIGHT_PANEL_W / 2);
    const infoStyle = { fontFamily: UI_FONT, fontSize: `${String(fontPx(8))}px`, color: '#888899' };
    this.rightInfoTexts = [
      this.add.text(infoX, px(496), '', infoStyle).setOrigin(0.5, 0).setDepth(10),
      this.add.text(infoX, px(510), '', infoStyle).setOrigin(0.5, 0).setDepth(10),
      this.add.text(infoX, px(524), '', infoStyle).setOrigin(0.5, 0).setDepth(10),
    ];

    this.hud = new CombatHud(this);
    this.cardOverlay = new CardOverlay(this, (action) => { this.handleCardAction(action); });
    this.supplyButtons = new SupplyButtons(this, this.core, (slot) => { this.handleBoostTap(slot); });
    this.narrator = new NarratorBar(this);

    this.thrusterGfx = this.add.graphics().setDepth(3).setBlendMode(Phaser.BlendModes.ADD);
    this.shieldGfx = this.add.graphics().setDepth(3).setBlendMode(Phaser.BlendModes.ADD);
    this.shieldPulseGfx = this.add.graphics().setDepth(3).setBlendMode(Phaser.BlendModes.ADD);
    this.muzzleFlashGfx = this.add.graphics().setDepth(6).setBlendMode(Phaser.BlendModes.ADD);
    this.gunGfx = this.add.graphics().setDepth(5).setBlendMode(Phaser.BlendModes.ADD);
    this.particleGfx = this.add.graphics().setDepth(5).setBlendMode(Phaser.BlendModes.ADD);
    this.progressGfx = this.add.graphics().setDepth(2);
    this.hpBarGfx = this.add.graphics().setDepth(7);
    this.vignetteGfx = this.add.graphics().setDepth(9);

    this.shipSprite = this.add
      .image(px(SHIP_CENTER_X), px(SHIP_Y), TEXTURE_KEYS.ship)
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
    this.enemyBolts = [];
    this.muzzleFlashes = [];
    this.burstParticles = [];
    this.floatingTexts = [];
    this.shieldPulseRings = [];
    this.stars = [];
    this.shieldHitFlash = 0;
    this.gunToggle = false;
    this.thrusterPhase = 0;
    this.accumulatorMs = 0;
    this.finished = false;
    this.narratorSupportCallShown = false;
    this.narratorBossShown = false;

    // Mission name at top of right panel
    this.add
      .text(px(LOGICAL_WIDTH - RIGHT_PANEL_W / 2), px(8), mission.name, {
        fontFamily: UI_FONT,
        fontSize: `${String(fontPx(8))}px`,
        color: '#888899',
      })
      .setOrigin(0.5, 0)
      .setDepth(10);

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

  private renderProgressOrBossBar(): void {
    this.progressGfx.clear();
    const boss = this.core.enemies.find((e) => e.isBoss);
    if (boss !== undefined) {
      this.renderBossBar(boss);
    } else {
      this.renderProgressBar();
    }
  }

  private renderProgressBar(): void {
    const lastEvent = this.core.mission.events[this.core.mission.events.length - 1];
    if (lastEvent === undefined) return;
    const totalTicks = lastEvent.atTimelineTick * 1.05;
    const progress = Math.min(1, this.core.timelineTick / totalTicks);
    // Vertical strip at the left edge of the right panel (replaces divider line)
    const bx = px(LOGICAL_WIDTH - RIGHT_PANEL_W); const bw = px(4);
    this.progressGfx.fillStyle(0x222244, 0.7);
    this.progressGfx.fillRect(bx, 0, bw, px(LOGICAL_HEIGHT));
    const filledH = progress * LOGICAL_HEIGHT;
    this.progressGfx.fillStyle(PALETTE_CYAN, 0.65);
    this.progressGfx.fillRect(bx, px(LOGICAL_HEIGHT - filledH), bw, px(filledH));
    // Support call markers: horizontal ticks crossing the bar
    for (const tick of this.core.mission.supportCallTicks) {
      const frac = Math.min(1, tick / totalTicks);
      const ty = px(LOGICAL_HEIGHT - LOGICAL_HEIGHT * frac);
      this.progressGfx.fillStyle(PALETTE_AMBER, 0.9);
      this.progressGfx.fillRect(bx - px(2), ty - px(1), bw + px(4), px(2));
    }
  }

  private renderBossBar(boss: EnemyState): void {
    const ratio = boss.hp / boss.maxHp;
    const bx = px(LOGICAL_WIDTH - RIGHT_PANEL_W); const bw = px(4);
    this.progressGfx.fillStyle(0x2a1a00, 0.8);
    this.progressGfx.fillRect(bx, 0, bw, px(LOGICAL_HEIGHT));
    const filledH = ratio * LOGICAL_HEIGHT;
    this.progressGfx.fillStyle(0xff6600, 0.9);
    this.progressGfx.fillRect(bx, px(LOGICAL_HEIGHT - filledH), bw, px(filledH));
    // Bright leading edge at top of fill
    this.progressGfx.fillStyle(0xffaa22, 1.0);
    this.progressGfx.fillRect(bx, px(LOGICAL_HEIGHT - filledH), bw, px(2));
  }

  private renderShield(): void {
    this.shieldGfx.clear();
    const maxShield = this.core.loadout.shield.capacity;
    if (maxShield <= 0 || this.core.ship.shield <= 0) return;
    const frac = this.core.ship.shield / maxShield;
    const flash = this.shieldHitFlash;
    const cx = px(SHIP_CENTER_X) + this.driftX();
    const cy = px(SHIP_Y - 6) + this.bobY();
    const r = px(26 + frac * 6);
    // Soft fill glow — brightens on hit
    this.shieldGfx.fillStyle(0x0044ff, (0.04 + flash * 0.06) * frac);
    this.shieldGfx.fillCircle(cx, cy, r + px(6));
    // Four neon rings: outermost dim halo → innermost bright edge; all brighten on hit
    this.shieldGfx.lineStyle(px(6), 0x0033cc, (0.06 + flash * 0.08) * frac);
    this.shieldGfx.strokeCircle(cx, cy, r + px(10));
    this.shieldGfx.lineStyle(px(3), 0x2255ff, 0.15 * frac + flash * 0.2);
    this.shieldGfx.strokeCircle(cx, cy, r + px(4));
    // Inner rings shift toward white on impact
    const innerColor = flash > 0.5 ? 0xaaddff : 0x44aaff;
    this.shieldGfx.lineStyle(px(1.5), innerColor, Math.min(1, 0.45 + 0.35 * frac + flash * 0.4));
    this.shieldGfx.strokeCircle(cx, cy, r);
    this.shieldGfx.lineStyle(px(0.8), 0xffffff, Math.min(1, 0.6 * frac + flash * 0.5));
    this.shieldGfx.strokeCircle(cx, cy, r - px(2));
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

    // Snapshot pre-tick state for visual effect detection
    const hullBefore = this.core.ship.hull;
    const shieldBefore = this.core.ship.shield;
    const timersBefore = new Map<number, number>();
    for (const e of this.core.enemies) timersBefore.set(e.id, e.shootTimer);

    const shotsBefore = this.core.stats.shotsFired;
    const killsBefore = this.core.stats.kills;
    while (this.accumulatorMs >= MS_PER_TICK) {
      this.accumulatorMs -= MS_PER_TICK;
      this.snapshotDistances();
      advanceTick(this.core);
      this.detectHits();
    }

    // Detect events and trigger visual/audio feedback
    const shotsFired = this.core.stats.shotsFired - shotsBefore;
    for (let i = 0; i < shotsFired; i++) this.spawnLaserBolt();
    if (shotsFired > 0) Sound.fire();
    if (this.core.stats.kills > killsBefore) Sound.kill();

    if (this.core.ship.hull < hullBefore - 0.5) {
      this.cameras.main.shake(120, 0.005);
    }
    if (this.core.ship.shield < shieldBefore - 0.5) {
      this.shieldHitFlash = 1.0;
    }
    if (this.core.ship.shield > shieldBefore + 0.5) {
      Sound.shieldPulse();
      this.shieldPulseRings.push({ radius: px(28), alpha: 0.75 });
    }
    for (const e of this.core.enemies) {
      const before = timersBefore.get(e.id);
      if (before !== undefined && e.shootTimer > before) this.spawnEnemyBolt(e);
    }

    // Decay flash
    this.shieldHitFlash = Math.max(0, this.shieldHitFlash - SHIELD_FLASH_DECAY * deltaMs / 1000);

    this.syncCardOverlay();
    this.syncNarrator();
    const alpha = this.core.pendingOffer !== null ? 1 : this.accumulatorMs / MS_PER_TICK;
    this.updateStars(deltaMs);
    this.renderProgressOrBossBar();
    this.renderThruster();
    this.renderShield();
    this.renderShieldPulseRings(deltaMs);
    this.renderGuns();
    this.renderMuzzleFlashes(deltaMs);
    this.renderLowHullVignette();
    this.shipSprite.setX(px(SHIP_CENTER_X) + this.driftX());
    this.shipSprite.setY(px(SHIP_Y) + this.bobY());
    this.renderEnemies(alpha);
    this.updateLasers(deltaMs);
    this.updateEnemyBolts(deltaMs);
    this.updateBurstParticles(deltaMs);
    this.updateFloatingTexts(deltaMs);
    this.hud.update(this.core);
    this.updateRightInfo();
    this.supplyButtons.update(this.core);
    this.narrator.update(deltaMs);
    this.maybeFinish();
  }

  private handleCardAction(action: number): void {
    resolveCardAction(this.core, action);
    if (this.core.pendingOffer === null) this.cardOverlay.hide();
    else this.cardOverlay.show(this.core.pendingOffer, this.core);
  }

  private handleBoostTap(slot: number): void {
    const supply = this.core.supplies[slot];
    if (supply === undefined || supply.chargesLeft <= 0 || this.core.status !== 'running') return;
    applyBoost(this.core, slot);
    Sound.boost();
  }

  private syncCardOverlay(): void {
    if (this.core.pendingOffer !== null && !this.cardOverlay.visible) {
      this.cardOverlay.show(this.core.pendingOffer, this.core);
    }
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
    const flicker = 0.55 + 0.45 * Math.sin(this.thrusterPhase * 0.014);
    drawThruster(this.thrusterGfx, px(SHIP_CENTER_X) + this.driftX(), px(SHIP_Y + 24) + this.bobY(), px(10 + 10 * flicker), flicker);
  }

  private spawnLaserBolt(): void {
    const weapon = this.core.loadout.weapon;
    if (weapon === null) return;
    const isNova = weapon.kind === 'nova';
    const side = this.gunToggle ? 1 : -1;
    this.gunToggle = !this.gunToggle;
    const gx = px(SHIP_CENTER_X) + this.driftX() + (isNova ? 0 : px(SHIP_GUN_X_OFFSET) * side);
    const gy = px(SHIP_Y - SHIP_GUN_Y_OFFSET) + this.bobY();
    let targetY = px(GAME_TOP_Y);
    if (!isNova) {
      let front: { distance: number } | undefined;
      for (const e of this.core.enemies) {
        if (front === undefined || e.distance < front.distance) front = e;
      }
      if (front === undefined) return;
      targetY = this.laneToY(front.distance);
    }
    if (!isNova && targetY >= gy) return;
    const textureKey = laserTextureForWeaponId(weapon.id);
    const boltScale = boltScaleForLevel(splitWeaponId(weapon.id).level);
    const sprite = this.add
      .image(gx, gy, textureKey)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(boltScale)
      .setDepth(5);
    this.laserBolts.push({ sprite, vy: (targetY - gy) / LASER_TRAVEL_MS, targetY });
    this.muzzleFlashes.push({ x: gx, y: gy, life: MUZZLE_FLASH_MS });
  }

  private renderGuns(): void {
    renderGunIndicator(this.gunGfx, this.core.loadout.weapon,
      px(SHIP_CENTER_X) + this.driftX(), px(SHIP_Y - SHIP_GUN_Y_OFFSET) + this.bobY());
  }

  private renderMuzzleFlashes(deltaMs: number): void {
    this.muzzleFlashes = tickMuzzleFlashes(this.muzzleFlashGfx, this.muzzleFlashes, deltaMs, MUZZLE_FLASH_MS);
  }

  private updateLasers(deltaMs: number): void {
    this.laserBolts = tickLaserBolts(this.laserBolts, deltaMs);
  }

  private spawnEnemyBolt(enemy: EnemyState): void {
    const startY = this.laneToY(enemy.distance) + px(12);
    const targetY = px(SHIP_Y - 20);
    if (startY >= targetY) return;
    const rect = this.add
      .rectangle(px(SHIP_CENTER_X), startY, px(3), px(8), 0xff6600, 0.9)
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
      sprite.setY(this.laneToY(distance));
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
    const bw = px(22); const bh = px(3);
    const bx = sx - bw / 2; const by = sy - px(20);
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
    } else {
      this.tweens.add({ targets: sprite, angle: 360, duration: 2400, repeat: -1, ease: 'Linear', delay });
    }
  }

  /** Maps core distance (0 = at ship, LANE_LENGTH = top) to canvas Y coordinate. */
  private laneToY(distance: number): number {
    const shipY = px(SHIP_Y);
    const topY = px(GAME_TOP_Y);
    return shipY - (distance / LANE_LENGTH) * (shipY - topY);
  }

  private updateRightInfo(): void {
    const stats = computeEffectiveStats(this.core.loadout, this.core.modifiers, activeDamageMult(this.core));
    const dps = stats.weaponEquipped ? (stats.weaponDamage / stats.weaponInterval) * TICKS_PER_SECOND : 0;
    const time = (this.core.tick / TICKS_PER_SECOND).toFixed(1);
    this.rightInfoTexts[0]?.setText(`DPS ${dps.toFixed(1)}`);
    this.rightInfoTexts[1]?.setText(`k${String(this.core.stats.kills)}`);
    this.rightInfoTexts[2]?.setText(`t ${time}s`);
  }

  private maybeFinish(): void {
    if (this.core.status === 'running' || this.finished) return;
    this.finished = true;
    const result = buildMissionResult(this.core);
    const { newStarIds } = applyMissionResult(this.save, result);
    if (this.core.status === 'victory') {
      Sound.victory();
      this.time.delayedCall(600, () => { this.scene.start('ResultScene', { result, newStarIds }); });
    } else {
      this.playDeathAnimation();
      this.time.delayedCall(1400, () => { this.scene.start('ResultScene', { result, newStarIds }); });
    }
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

// Colour constants for thruster (avoid palette import cycle with Graphics API)
const PALETTE_AMBER = 0xffaa22;
const PALETTE_CYAN = 0x00eeff;

function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
}

/** Glow/size multiplier for a laser bolt: level 1 = 0.85×, level 5 = 1.13×. */
function boltScaleForLevel(level: number): number {
  return 0.8 + level * 0.06;
}
