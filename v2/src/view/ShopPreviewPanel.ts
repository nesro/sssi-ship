import Phaser from 'phaser';
import { MS_PER_TICK } from '../core/constants';
import type { EffectiveStats } from '../core/stats';
import type { LoadoutSnapshot, RearWeaponKind, SideWeaponKind, WeaponKind } from '../core/types';
import { computePreviewStatic, initPreviewSim, stepPreviewSim } from '../viewmodel/preview';
import type { PreviewSimState, PreviewSimStep } from '../viewmodel/preview';
import { cssColor, PALETTE } from './palette';
import { fontPx, px, SHIP_GUN_X_OFFSET, SHIP_GUN_Y_OFFSET } from './layout';
import { laserTextureForWeaponId, rearBoltTextureKey, sideBoltTextureKey } from './textures';
import { TEXTURE_KEYS } from './textureKeys';
import { drawGeneratorCore, drawRearWeaponIndicator, drawShieldRings, drawSideWeaponIndicator, renderGunIndicator, renderThrusterAssembly, SIDE_WEAPON_MOUNT_X_OFFSET, tickLaserBolts, tickMuzzleFlashes } from './shipRenderers';
import type { LaserBolt, MuzzleFlash } from './shipRenderers';
import { UI_FONT } from './widgets';

// Geometry constants (logical units)
const BAR_SPACING = 30;     // energy-bar top → shield-bar top
const BAR_HEIGHT = 12;      // logical bar height
const LASER_RISE = 130;     // how far laser bolts travel up before recycling — stays clear of CONTENT_TOP (48) above shipY (220)

const PALETTE_AMBER = 0xffaa22;
const LASER_TRAVEL_MS = 420;
const MUZZLE_FLASH_MS = 100;
// Manual-fire side weapons have no natural interval stat — demo-fire on a fixed cadence instead.
const SIDE_DEMO_INTERVAL_MS = 1500;
const SIDE_BOLT_SCALE = 1.5;
// Sim runs faster than real-time so the charge cycle is clearly visible
const SIM_SPEED_MULT = 4;

// Preview shows a discrete per-tier shield radius (vs CombatScene's continuous
// fraction-based radius) so a glance at the preview reads "which shield class is
// this" rather than "what's my shield % right now". Tier cutoffs are capacity
// thresholds, not tied to specific shield kinds — recheck against src/data/items.ts
// SHIELD_BASE if shield capacities are rebalanced.
const SHIELD_TIER_HIGH_CAPACITY = 65;
const SHIELD_TIER_MID_CAPACITY = 40;
const SHIELD_BASE_RADIUS = 22;
const SHIELD_RADIUS_PER_TIER = 5;
const SHIELD_RADIUS_PER_FRACTION = 4;
const SHIELD_GLOW_ALPHA_SCALE = 0.03;
const SHIELD_GLOW_RADIUS_PAD = 10;
const SHIELD_RING_RADIUS_STEP = 9;
const SHIELD_RING_INTENSITY_FALLOFF_PER_RING = 0.2;

/** Explicit placement for the preview band — lets the ship and bars sit side by side. */
export interface PreviewLayout {
  shipX: number;      // logical ship centre x
  shipY: number;      // logical ship centre y
  barsLeftX: number;  // logical left edge of the energy/shield bars
  barsTopY: number;   // logical top of the energy bar
  barWidth: number;   // logical bar width
  dpsX: number;       // logical DPS label centre x
  dpsY: number;       // logical DPS label y
}

/**
 * Right-column live preview (§3.8): the ship fires at its actual weapon interval, energy
 * drains from each shot and motor draw, generator refills it, and shield charges as energy
 * becomes available. On each show() call the simulation restarts from empty (shield=0,
 * energy=0) so the player can watch the recharge cycle for the selected loadout.
 */
export class ShopPreviewPanel {
  // Scene objects
  private readonly ship: Phaser.GameObjects.Image;
  private readonly thrusterGfx: Phaser.GameObjects.Graphics;
  private readonly motorGfx: Phaser.GameObjects.Graphics;
  private readonly generatorGfx: Phaser.GameObjects.Graphics;
  private readonly shieldGfx: Phaser.GameObjects.Graphics;
  private readonly gunGfx: Phaser.GameObjects.Graphics;
  private readonly rearGunGfx: Phaser.GameObjects.Graphics;
  private readonly sideGunGfx: Phaser.GameObjects.Graphics;
  private readonly muzzleFlashGfx: Phaser.GameObjects.Graphics;
  private readonly barGfx: Phaser.GameObjects.Graphics;
  private readonly energyLabel: Phaser.GameObjects.Text;
  private readonly shieldLabel: Phaser.GameObjects.Text;
  private readonly dpsLabel: Phaser.GameObjects.Text;
  private readonly enrgStaticLabel: Phaser.GameObjects.Text;
  private readonly shldStaticLabel: Phaser.GameObjects.Text;
  private panelVisible = true;
  private motorLevel: 1 | 2 | 3 = 1;
  private motorKindColor: number = 0xff44cc;

  // Animation
  private phase = 0;
  private gunToggle = false;
  private laserBolts: LaserBolt[] = [];
  private rearLaserBolts: LaserBolt[] = [];
  private sideLaserBolts: LaserBolt[] = [];
  private muzzleFlashes: MuzzleFlash[] = [];
  private visualFireTimer = 0;
  private rearVisualFireTimer = 0;
  private sideVisualFireTimer = 0;

  // Active weapons — null when the equipped loadout has none
  private currentWeapon: { id: string; kind: WeaponKind | RearWeaponKind | SideWeaponKind } | null = null;
  private currentRearWeapon: { id: string; kind: RearWeaponKind } | null = null;
  private currentSideWeapon: { id: string; kind: SideWeaponKind } | null = null;

  // Simulation state (resets on each show() call)
  // The sim shows generator vs shield regen efficiency without weapon drain — the player
  // can read weapon DPS from the label. Running at SIM_SPEED_MULT×, looping when shield fills.
  private simStats: EffectiveStats | null = null;
  private simState: PreviewSimState = { energy: 0, shield: 0 };
  private simStep: PreviewSimStep | null = null;

  // Resolved pixel geometry (from the logical PreviewLayout)
  private readonly shipX: number;
  private readonly shipY: number;
  private readonly barsLeftX: number;
  private readonly barsTopY: number;
  private readonly barWidthPx: number;

  constructor(
    private readonly scene: Phaser.Scene,
    layout: PreviewLayout,
  ) {
    this.shipX = px(layout.shipX);
    this.shipY = px(layout.shipY);
    this.barsLeftX = px(layout.barsLeftX);
    this.barsTopY = px(layout.barsTopY);
    this.barWidthPx = px(layout.barWidth);

    this.thrusterGfx = scene.add.graphics().setDepth(3).setBlendMode(Phaser.BlendModes.ADD);
    this.motorGfx    = scene.add.graphics().setDepth(4).setBlendMode(Phaser.BlendModes.ADD);
    this.generatorGfx = scene.add.graphics().setDepth(3).setBlendMode(Phaser.BlendModes.ADD);
    this.shieldGfx   = scene.add.graphics().setDepth(5).setBlendMode(Phaser.BlendModes.ADD);
    this.gunGfx      = scene.add.graphics().setDepth(5).setBlendMode(Phaser.BlendModes.ADD);
    this.rearGunGfx  = scene.add.graphics().setDepth(5).setBlendMode(Phaser.BlendModes.ADD);
    this.sideGunGfx  = scene.add.graphics().setDepth(5).setBlendMode(Phaser.BlendModes.ADD);
    this.muzzleFlashGfx = scene.add.graphics().setDepth(6).setBlendMode(Phaser.BlendModes.ADD);
    this.barGfx      = scene.add.graphics().setDepth(8);

    this.ship = scene.add
      .image(this.shipX, this.shipY, TEXTURE_KEYS.ship)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(4);

    scene.tweens.add({
      targets: this.ship,
      scaleY: 1.06,
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    const valRightX = this.barsLeftX + this.barWidthPx;
    const labelStyle = { fontFamily: UI_FONT, fontSize: `${String(fontPx(11))}px`, color: cssColor(PALETTE.hullWhite) };
    const ey = this.barsTopY;
    const sy = ey + px(BAR_SPACING);

    // Value labels sit just above the right end of each bar
    this.energyLabel = scene.add.text(valRightX, ey - px(3), '', { ...labelStyle, color: cssColor(PALETTE.generatorAmber) }).setOrigin(1, 1).setDepth(9);
    this.shieldLabel = scene.add.text(valRightX, sy - px(3), '', { ...labelStyle, color: cssColor(PALETTE.shieldBlue) }).setOrigin(1, 1).setDepth(9);

    // Static ENRG / SHLD prefix labels above the left end of each bar
    this.enrgStaticLabel = scene.add.text(this.barsLeftX, ey - px(3), 'ENRG', { ...labelStyle, color: cssColor(PALETTE.generatorAmber) }).setOrigin(0, 1).setDepth(9);
    this.shldStaticLabel = scene.add.text(this.barsLeftX, sy - px(3), 'SHLD', { ...labelStyle, color: cssColor(PALETTE.shieldBlue) }).setOrigin(0, 1).setDepth(9);

    this.dpsLabel = scene.add.text(px(layout.dpsX), px(layout.dpsY), '', { ...labelStyle, fontSize: `${String(fontPx(13))}px`, color: cssColor(PALETTE.weaponCyan) }).setOrigin(0.5, 0.5).setDepth(9);
  }

  setVisible(v: boolean): void {
    this.panelVisible = v;
    this.ship.setVisible(v);
    this.thrusterGfx.setVisible(v);
    this.motorGfx.setVisible(v);
    this.generatorGfx.setVisible(v);
    this.shieldGfx.setVisible(v);
    this.gunGfx.setVisible(v);
    this.rearGunGfx.setVisible(v);
    this.sideGunGfx.setVisible(v);
    this.muzzleFlashGfx.setVisible(v);
    this.barGfx.setVisible(v);
    this.energyLabel.setVisible(v);
    this.shieldLabel.setVisible(v);
    this.dpsLabel.setVisible(v);
    this.enrgStaticLabel.setVisible(v);
    this.shldStaticLabel.setVisible(v);
    if (!v) {
      this.barGfx.clear();
      for (const bolt of this.laserBolts) { bolt.sprite.destroy(); }
      for (const bolt of this.rearLaserBolts) { bolt.sprite.destroy(); }
      for (const bolt of this.sideLaserBolts) { bolt.sprite.destroy(); }
      this.laserBolts = [];
      this.rearLaserBolts = [];
      this.sideLaserBolts = [];
      this.muzzleFlashes = [];
      this.muzzleFlashGfx.clear();
    }
  }

  /** Call when the loadout selection changes — resets the energy/shield simulation from zero. */
  show(current: LoadoutSnapshot, prospective: LoadoutSnapshot | null): void {
    const vm = computePreviewStatic(current, prospective);
    const activeLoadout = prospective ?? current;
    this.motorLevel = vm.motorLevel;
    this.motorKindColor = vm.motorKindColor;
    this.ship.setTexture(vm.shipTextureId);
    this.simStats = vm.stats;
    this.simState = initPreviewSim(vm.stats);
    this.visualFireTimer = 0;
    this.rearVisualFireTimer = 0;
    this.sideVisualFireTimer = 0;
    this.gunToggle = false;
    this.currentWeapon = activeLoadout.weapon !== null
      ? { id: activeLoadout.weapon.id, kind: activeLoadout.weapon.kind }
      : null;
    this.currentRearWeapon = activeLoadout.rearWeapon !== null
      ? { id: activeLoadout.rearWeapon.id, kind: activeLoadout.rearWeapon.kind as RearWeaponKind }
      : null;
    this.currentSideWeapon = activeLoadout.sideWeapon !== null
      ? { id: activeLoadout.sideWeapon.id, kind: activeLoadout.sideWeapon.kind as SideWeaponKind }
      : null;

    this.dpsLabel.setText(vm.dpsLabel);
  }

  /** Driven by HubScene.update(). */
  update(deltaMs: number): void {
    if (!this.panelVisible) return;
    this.phase += deltaMs;
    if (this.simStats !== null) {
      this.stepSim(deltaMs);
      this.stepVisualFire(deltaMs);
    }
    this.renderThruster();
    this.renderGenerator();
    this.renderShield();
    this.renderGuns();
    this.renderRearGuns();
    this.renderSideGuns();
    this.renderBars();
    this.renderMuzzleFlashes(deltaMs);
    this.updateLasers(deltaMs);
  }

  /** Advances the pure sim stepper at SIM_SPEED_MULT× real-time (see viewmodel/preview.ts). */
  private stepSim(deltaMs: number): void {
    const stats = this.simStats as EffectiveStats;
    const dt = (deltaMs * SIM_SPEED_MULT) / MS_PER_TICK;
    this.simStep = stepPreviewSim(this.simState, stats, dt);
    this.simState = this.simStep.next;
  }

  /** Spawns visual laser bolts at the real (unscaled) weapon interval. */
  private stepVisualFire(deltaMs: number): void {
    const stats = this.simStats as EffectiveStats;
    if (stats.weaponEquipped) {
      this.visualFireTimer -= deltaMs;
      if (this.visualFireTimer <= 0) {
        this.visualFireTimer += stats.weaponInterval * MS_PER_TICK;
        this.spawnLaserBolt();
      }
    }
    if (this.currentRearWeapon !== null && stats.rearWeaponEquipped) {
      this.rearVisualFireTimer -= deltaMs;
      if (this.rearVisualFireTimer <= 0) {
        this.rearVisualFireTimer += stats.rearWeaponInterval * MS_PER_TICK;
        this.spawnRearBolt();
      }
    }
    if (this.currentSideWeapon !== null && stats.sideWeaponEquipped) {
      this.sideVisualFireTimer -= deltaMs;
      if (this.sideVisualFireTimer <= 0) {
        this.sideVisualFireTimer += SIDE_DEMO_INTERVAL_MS;
        this.spawnSideBolt();
      }
    }
  }

  private renderBars(): void {
    this.barGfx.clear();
    const step = this.simStep;
    if (step === null) return;

    const bx = this.barsLeftX;
    const bw = this.barWidthPx;
    const bh = px(BAR_HEIGHT);
    const ey = this.barsTopY;
    const sy = ey + px(BAR_SPACING);

    // Energy bar track + fill
    this.barGfx.fillStyle(0x111122, 0.8);
    this.barGfx.fillRect(bx, ey, bw, bh);
    this.barGfx.fillStyle(PALETTE_AMBER, 0.85);
    this.barGfx.fillRect(bx, ey, bw * step.energyFraction, bh);

    // Shield bar track + fill
    this.barGfx.fillStyle(0x111122, 0.8);
    this.barGfx.fillRect(bx, sy, bw, bh);
    this.barGfx.fillStyle(0x2255ff, 0.85);
    this.barGfx.fillRect(bx, sy, bw * step.shieldFraction, bh);

    // Live numeric values
    this.energyLabel.setText(step.energyLabel);
    this.shieldLabel.setText(step.shieldLabel);
  }

  private spawnLaserBolt(): void {
    const weapon = this.currentWeapon;
    if (weapon === null) return;
    const isNova = weapon.kind === 'nova';
    const side = this.gunToggle ? 1 : -1;
    this.gunToggle = !this.gunToggle;
    const gx = this.shipX + (isNova ? 0 : px(SHIP_GUN_X_OFFSET) * side);
    const gy = this.shipY - px(SHIP_GUN_Y_OFFSET);
    const targetY = this.shipY - px(LASER_RISE);
    if (!isNova && gy <= targetY) return;
    const sprite = this.scene.add
      .image(gx, gy, laserTextureForWeaponId(weapon.id))
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(5);
    this.laserBolts.push({ sprite, vy: (targetY - gy) / LASER_TRAVEL_MS, targetY });
    this.muzzleFlashes.push({ x: gx, y: gy, life: MUZZLE_FLASH_MS });
  }

  private updateLasers(deltaMs: number): void {
    this.laserBolts = tickLaserBolts(this.laserBolts, deltaMs);
    this.rearLaserBolts = tickLaserBolts(this.rearLaserBolts, deltaMs);
    this.sideLaserBolts = tickLaserBolts(this.sideLaserBolts, deltaMs);
  }

  private renderMuzzleFlashes(deltaMs: number): void {
    this.muzzleFlashes = tickMuzzleFlashes(this.muzzleFlashGfx, this.muzzleFlashes, deltaMs, MUZZLE_FLASH_MS);
  }

  private renderGuns(): void {
    renderGunIndicator(this.gunGfx, this.currentWeapon, this.shipX, this.shipY - px(SHIP_GUN_Y_OFFSET));
  }

  private renderRearGuns(): void {
    drawRearWeaponIndicator(this.rearGunGfx, this.currentRearWeapon, this.shipX, this.shipY);
  }

  private renderSideGuns(): void {
    drawSideWeaponIndicator(this.sideGunGfx, this.currentSideWeapon, this.shipX, this.shipY);
  }

  private renderGenerator(): void {
    drawGeneratorCore(this.generatorGfx, this.shipX, this.shipY, this.simStep?.energyFraction ?? 0, this.phase);
  }

  private spawnRearBolt(): void {
    if (this.currentRearWeapon === null) return;
    const texKey = rearBoltTextureKey(this.currentRearWeapon.id);
    const targetY = this.shipY - px(LASER_RISE);
    for (const side of [-1, 1]) {
      const gx = this.shipX + px(SHIP_GUN_X_OFFSET * 1.4) * side;
      const gy = this.shipY + px(9);
      if (gy <= targetY) continue;
      const sprite = this.scene.add
        .image(gx, gy, texKey)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(5);
      this.rearLaserBolts.push({ sprite, vy: (targetY - gy) / LASER_TRAVEL_MS, targetY });
      this.muzzleFlashes.push({ x: gx, y: gy, life: MUZZLE_FLASH_MS });
    }
  }

  /** Demo-fires the side weapon from its wing mounts — periodic, not charge-limited (§2.4 preview). */
  private spawnSideBolt(): void {
    if (this.currentSideWeapon === null) return;
    const texKey = sideBoltTextureKey(this.currentSideWeapon.id);
    const targetY = this.shipY - px(LASER_RISE);
    for (const side of [-1, 1]) {
      const gx = this.shipX + px(SIDE_WEAPON_MOUNT_X_OFFSET) * side;
      const gy = this.shipY;
      if (gy <= targetY) continue;
      const sprite = this.scene.add
        .image(gx, gy, texKey)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(SIDE_BOLT_SCALE)
        .setDepth(5);
      this.sideLaserBolts.push({ sprite, vy: (targetY - gy) / LASER_TRAVEL_MS, targetY });
      this.muzzleFlashes.push({ x: gx, y: gy, life: MUZZLE_FLASH_MS });
    }
  }

  private renderThruster(): void {
    renderThrusterAssembly(
      this.thrusterGfx, this.motorGfx, this.shipX, this.shipY,
      { motorLevel: this.motorLevel, kindColor: this.motorKindColor, phase: this.phase },
    );
  }

  private renderShield(): void {
    this.shieldGfx.clear();
    const stats = this.simStats;
    if (stats === null || stats.shieldCapacity <= 0 || this.simStep === null) return;
    const frac = this.simStep.shieldFraction;
    if (frac <= 0.01) return;

    const cx = this.shipX;
    const cy = this.shipY - px(6);
    // One ring per tier so the player can visually read shield strength at a glance.
    const tier = stats.shieldCapacity >= SHIELD_TIER_HIGH_CAPACITY ? 3
      : stats.shieldCapacity >= SHIELD_TIER_MID_CAPACITY ? 2 : 1;
    const baseR = px(SHIELD_BASE_RADIUS + tier * SHIELD_RADIUS_PER_TIER + frac * SHIELD_RADIUS_PER_FRACTION); // bigger shields occupy more space

    // Core fill glow — denser for higher-tier shields
    this.shieldGfx.fillStyle(0x0044ff, SHIELD_GLOW_ALPHA_SCALE * frac * tier);
    this.shieldGfx.fillCircle(cx, cy, baseR + px(SHIELD_GLOW_RADIUS_PAD));

    // Draw one ring layer per tier, stepping inward
    for (let i = 0; i < tier; i++) {
      const r = baseR - i * px(SHIELD_RING_RADIUS_STEP);
      if (r <= 0) continue;
      drawShieldRings(this.shieldGfx, cx, cy, r, { intensity: frac * (1 - i * SHIELD_RING_INTENSITY_FALLOFF_PER_RING) });
    }
  }
}


