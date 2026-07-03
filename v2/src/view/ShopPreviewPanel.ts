import Phaser from 'phaser';
import { MS_PER_TICK } from '../core/constants';
import { computeEffectiveStats, defaultModifiers } from '../core/stats';
import type { EffectiveStats } from '../core/stats';
import { computeLoadoutReport } from '../core/report';
import type { LoadoutSnapshot, RearWeaponKind, WeaponKind } from '../core/types';
import { cssColor, PALETTE } from './palette';
import { fontPx, px, SHIP_GUN_X_OFFSET, SHIP_GUN_Y_OFFSET } from './layout';
import { laserTextureForWeaponId, rearBoltTextureKey, TEXTURE_KEYS, textureForShipId } from './textures';
import { drawGeneratorCore, drawMotorHousing, drawRearWeaponIndicator, drawShieldRings, drawThruster, motorKindColorFromId, motorLevelFromId, renderGunIndicator, tickLaserBolts, tickMuzzleFlashes, THRUSTER_PARAMS } from './shipRenderers';
import type { LaserBolt, MuzzleFlash } from './shipRenderers';
import { UI_FONT } from './widgets';

// Geometry constants (logical units)
const BAR_SPACING = 30;     // energy-bar top → shield-bar top
const BAR_HEIGHT = 12;      // logical bar height
const LASER_RISE = 70;      // how far laser bolts travel up before recycling

const PALETTE_AMBER = 0xffaa22;
const LASER_TRAVEL_MS = 280;
const MUZZLE_FLASH_MS = 100;
// Sim runs faster than real-time so the charge cycle is clearly visible
const SIM_SPEED_MULT = 4;

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
  private muzzleFlashes: MuzzleFlash[] = [];
  private visualFireTimer = 0;
  private rearVisualFireTimer = 0;

  // Active weapons — null when the equipped loadout has none
  private currentWeapon: { id: string; kind: WeaponKind | RearWeaponKind } | null = null;
  private currentRearWeapon: { id: string; kind: RearWeaponKind } | null = null;

  // Simulation state (resets on each show() call)
  // The sim shows generator vs shield regen efficiency without weapon drain — the player
  // can read weapon DPS from the label. Running at SIM_SPEED_MULT×, looping when shield fills.
  private simStats: EffectiveStats | null = null;
  private simEnergy = 0;
  private simShield = 0;

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
    this.generatorGfx.setVisible(v);
    this.shieldGfx.setVisible(v);
    this.gunGfx.setVisible(v);
    this.rearGunGfx.setVisible(v);
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
      this.laserBolts = [];
      this.rearLaserBolts = [];
      this.muzzleFlashes = [];
      this.muzzleFlashGfx.clear();
    }
  }

  /** Call when the loadout selection changes — resets the energy/shield simulation from zero. */
  show(current: LoadoutSnapshot, prospective: LoadoutSnapshot | null): void {
    const activeLoadout = prospective ?? current;
    this.motorLevel = motorLevelFromId(activeLoadout.motor.id);
    this.motorKindColor = motorKindColorFromId(activeLoadout.motor.id);
    this.ship.setTexture(textureForShipId(activeLoadout.ship.id));
    const stats = computeEffectiveStats(activeLoadout, defaultModifiers());
    this.simStats = stats;
    this.simEnergy = 0;
    this.simShield = stats.shieldCapacity * 0.5; // start at half so the ring is immediately visible
    this.visualFireTimer = 0;
    this.rearVisualFireTimer = 0;
    this.gunToggle = false;
    this.currentWeapon = activeLoadout.weapon !== null
      ? { id: activeLoadout.weapon.id, kind: activeLoadout.weapon.kind }
      : null;
    this.currentRearWeapon = activeLoadout.rearWeapon !== null
      ? { id: activeLoadout.rearWeapon.id, kind: activeLoadout.rearWeapon.kind as RearWeaponKind }
      : null;

    const report = computeLoadoutReport(activeLoadout);
    this.dpsLabel.setText(stats.weaponEquipped ? `DPS  ${report.dpsSingleTarget.toFixed(1)}` : 'NO WEAPON');
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
    this.renderBars();
    this.renderMuzzleFlashes(deltaMs);
    this.updateLasers(deltaMs);
  }

  /**
   * Simulates generator→shield pulse flow at SIM_SPEED_MULT× real-time.
   * Mirrors the discrete pulse mechanic from energy.ts: generator fills to 100%,
   * fires a pulse into the shield, then drops by pulseDrainFraction.
   * Shield climbs to full and stays there — player resets by changing loadout.
   */
  private stepSim(deltaMs: number): void {
    const stats = this.simStats as EffectiveStats;
    const dt = (deltaMs * SIM_SPEED_MULT) / MS_PER_TICK;

    // Charge generator first — capture whether it hit the cap BEFORE motor draw.
    // Motor draw applied after charging means energy can never equal capacity in the
    // same step unless we check the cap separately.
    const recharged = Math.min(stats.generatorCapacity, this.simEnergy + stats.generatorOutput * dt);
    const hitCap = recharged >= stats.generatorCapacity;
    this.simEnergy = Math.max(0, recharged - stats.motorDraw * dt);

    // Shield pulse fires exactly when the generator hits full (mirrors energy.ts pulseShield)
    if (hitCap && stats.shieldCapacity > 0 && this.simShield < stats.shieldCapacity) {
      const gain = Math.min(
        stats.shieldPulseFraction * stats.shieldCapacity,
        stats.shieldCapacity - this.simShield,
      );
      this.simShield += gain;
      this.simEnergy = Math.max(0, this.simEnergy - stats.generatorPulseDrain);
    }

    this.simShield = Math.min(this.simShield, stats.shieldCapacity);
    // Loop: restart the charge cycle so the ring keeps pulsing
    if (stats.shieldCapacity > 0 && this.simShield >= stats.shieldCapacity) {
      this.simEnergy = 0;
      this.simShield = 0;
    }
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
  }

  private renderBars(): void {
    this.barGfx.clear();
    const stats = this.simStats;
    if (stats === null) return;

    const bx = this.barsLeftX;
    const bw = this.barWidthPx;
    const bh = px(BAR_HEIGHT);
    const ey = this.barsTopY;
    const sy = ey + px(BAR_SPACING);

    // Energy bar track + fill
    this.barGfx.fillStyle(0x111122, 0.8);
    this.barGfx.fillRect(bx, ey, bw, bh);
    const eFrac = stats.generatorCapacity > 0 ? this.simEnergy / stats.generatorCapacity : 0;
    this.barGfx.fillStyle(PALETTE_AMBER, 0.85);
    this.barGfx.fillRect(bx, ey, bw * eFrac, bh);

    // Shield bar track + fill
    this.barGfx.fillStyle(0x111122, 0.8);
    this.barGfx.fillRect(bx, sy, bw, bh);
    const sFrac = stats.shieldCapacity > 0 ? this.simShield / stats.shieldCapacity : 0;
    this.barGfx.fillStyle(0x2255ff, 0.85);
    this.barGfx.fillRect(bx, sy, bw * sFrac, bh);

    // Live numeric values
    this.energyLabel.setText(`${String(Math.ceil(this.simEnergy))} / ${String(Math.ceil(stats.generatorCapacity))}`);
    this.shieldLabel.setText(`${String(Math.ceil(this.simShield))} / ${String(Math.ceil(stats.shieldCapacity))}`);
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

  private renderGenerator(): void {
    const stats = this.simStats;
    const frac = stats !== null && stats.generatorCapacity > 0 ? this.simEnergy / stats.generatorCapacity : 0;
    drawGeneratorCore(this.generatorGfx, this.shipX, this.shipY, frac);
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

  private renderThruster(): void {
    const p = THRUSTER_PARAMS[this.motorLevel];
    const flicker = p.minBright + p.range * Math.sin(this.phase * p.speed);
    drawThruster(this.thrusterGfx, this.shipX, this.shipY + px(24), px(p.hBase + p.hScale * flicker), { flicker, motorLevel: this.motorLevel, kindColor: this.motorKindColor });
    drawMotorHousing(this.motorGfx, this.shipX, this.shipY, this.motorLevel, this.motorKindColor);
  }

  private renderShield(): void {
    this.shieldGfx.clear();
    const stats = this.simStats;
    if (stats === null || stats.shieldCapacity <= 0) return;
    const frac = this.simShield / stats.shieldCapacity;
    if (frac <= 0.01) return;

    const cx = this.shipX;
    const cy = this.shipY - px(6);
    // One ring per tier so the player can visually read shield strength at a glance.
    // Thresholds match the three shield specs: Deflector I (<40), Deflector II (<65), Aegis (≥65).
    const tier = stats.shieldCapacity >= 65 ? 3 : stats.shieldCapacity >= 40 ? 2 : 1;
    const baseR = px(22 + tier * 5 + frac * 4); // bigger shields occupy more space

    // Core fill glow — denser for higher-tier shields
    this.shieldGfx.fillStyle(0x0044ff, 0.03 * frac * tier);
    this.shieldGfx.fillCircle(cx, cy, baseR + px(10));

    // Draw one ring layer per tier, stepping inward
    for (let i = 0; i < tier; i++) {
      const r = baseR - i * px(9);
      if (r <= 0) continue;
      drawShieldRings(this.shieldGfx, cx, cy, r, { intensity: frac * (1 - i * 0.2) });
    }
  }
}


