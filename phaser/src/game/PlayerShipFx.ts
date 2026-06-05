// PlayerShipFx.ts
// Animated visual layers drawn on top of (and behind) the static ship sprite.
// Does NOT own the physics body — GameScene.player is still the hitbox.
//
// Depth layout relative to the hull sprite at depth 5:
//   4  engineGfx   — engine pod glow, sits behind the hull
//   6  weaponGfx   — weapon barrel + wing mounts, sits in front of the hull
//
// All offsets are measured from the sprite's centre (64 × 88 texture, origin 0.5/0.5).
// Engine centres: left (−10, +36), right (+10, +36) — derived from texture coords.
// Nose tip: (0, −43).

import Phaser from 'phaser';
import type { ComputedStats } from './computeStats.js';

// ─── texture-derived anchor offsets ──────────────────────────────────────────

const ENGINE_L_X =  -10;  // left engine pod x offset from sprite centre
const ENGINE_R_X =  +10;  // right engine pod x offset
const ENGINE_Y   =  +36;  // shared engine pod y offset (below centre)
const NOSE_Y     =  -43;  // tip of the ship nose (above centre)

// Wing mount positions (mid-wing, for side weapons)
const WING_L_X   =  -22;  // port-wing mount x
const WING_R_X   =  +22;  // starboard mount x
const WING_Y     =   +6;  // mid-wing y

// Wing-tip running light positions relative to sprite centre.
// Left wing tip is at texture (2, 64), centre at (32, 44) → offset (−30, +20).
const LIGHT_L_X = -30;
const LIGHT_R_X = +30;
const LIGHT_Y   = +20;

export class PlayerShipFx {
  private readonly engineGfx: Phaser.GameObjects.Graphics;
  private readonly weaponGfx: Phaser.GameObjects.Graphics;
  private phase      = 0;  // radians; drives the sine-wave animations
  private lightPhase = 0;  // radians; drives the running-light blink

  constructor(
    private readonly scene: Phaser.Scene,
    private stats: ComputedStats,
  ) {
    this.engineGfx = scene.add.graphics().setDepth(4);
    this.weaponGfx = scene.add.graphics().setDepth(6);
  }

  // Called every frame while the game is active.
  update(x: number, y: number, deltaMs: number, energyRatio: number): void {
    this.phase      += deltaMs * 0.006;   // full sine cycle ≈ 1047 ms
    this.lightPhase += deltaMs * 0.0031;  // running-light blink ≈ 2s period
    const flicker = (Math.sin(this.phase) + 1) / 2;  // 0→1

    this.drawEngines(x, y, flicker, energyRatio);
    this.drawWeaponMounts(x, y, flicker);
  }

  // Re-reads equipped stats so mount graphics reflect the current loadout.
  // fallow-ignore-next-line unused-class-member
  applyLoadout(stats: ComputedStats): void {
    this.stats = stats;
  }

  // Fade all layers out over `durationMs` ms (called on player death).
  fadeOut(durationMs: number): void {
    for (const gfx of [this.engineGfx, this.weaponGfx]) {
      this.scene.tweens.add({
        targets: gfx, alpha: 0, duration: durationMs, ease: 'Power2',
      });
    }
  }

  destroy(): void {
    this.engineGfx.destroy();
    this.weaponGfx.destroy();
  }

  // ─── engine glow ───────────────────────────────────────────────────────────

  private drawEngines(x: number, y: number, flicker: number, energyRatio: number): void {
    this.engineGfx.clear();

    const lx = x + ENGINE_L_X;
    const rx = x + ENGINE_R_X;
    const ey = y + ENGINE_Y;

    // Outer halo colour shifts from orange (healthy) to dim red (starving).
    const lowEnergy  = energyRatio < 0.2;
    const outerAlpha = lowEnergy
      ? (Math.random() < 0.4 ? 0.05 : 0.2)   // random flicker when critically low
      : 0.28 + flicker * 0.28;
    const outerColor = lowEnergy ? 0x881100 : 0xff4400;
    const outerR     = lowEnergy ? 5 : 7 + flicker * 3;

    this.engineGfx.fillStyle(outerColor, outerAlpha);
    this.engineGfx.fillCircle(lx, ey, outerR);
    this.engineGfx.fillCircle(rx, ey, outerR);

    // Bright white core — always visible so the pod is readable even at low power.
    const coreAlpha = lowEnergy ? 0.15 + flicker * 0.1 : 0.45 + flicker * 0.35;
    this.engineGfx.fillStyle(0xffffff, coreAlpha);
    this.engineGfx.fillCircle(lx, ey - 1, 2.5);
    this.engineGfx.fillCircle(rx, ey - 1, 2.5);

    this.drawRunningLights(x, y);
    this.drawCockpitGlow(x, y, energyRatio, flicker);
  }

  // Port (left) = red, starboard (right) = green; alternate on a ~2 s blink cycle.
  // Mimics aviation running-light convention so the ship reads clearly at a glance.
  private drawRunningLights(x: number, y: number): void {
    const portOn = Math.sin(this.lightPhase) > 0;

    if (portOn) {
      this.engineGfx.fillStyle(0xff2200, 0.9);
      this.engineGfx.fillCircle(x + LIGHT_L_X, y + LIGHT_Y, 2.5);
      this.engineGfx.fillStyle(0xff4400, 0.28);
      this.engineGfx.fillCircle(x + LIGHT_L_X, y + LIGHT_Y, 5.5);
    } else {
      this.engineGfx.fillStyle(0x00dd44, 0.9);
      this.engineGfx.fillCircle(x + LIGHT_R_X, y + LIGHT_Y, 2.5);
      this.engineGfx.fillStyle(0x00ff44, 0.28);
      this.engineGfx.fillCircle(x + LIGHT_R_X, y + LIGHT_Y, 5.5);
    }
  }

  // Soft blue glow beneath the canopy — intensity scales with available energy.
  // Canopy spans from ≈ y−35 to y−11 (nose-tip is at NOSE_Y = −43).
  private drawCockpitGlow(x: number, y: number, energyRatio: number, flicker: number): void {
    const alpha = energyRatio * (0.07 + flicker * 0.04);
    if (alpha < 0.02) return;  // skip draw call when imperceptible
    this.engineGfx.fillStyle(0x33aaff, alpha);
    this.engineGfx.fillRect(x - 7, y - 35, 14, 24);
  }

  // ─── weapon mounts ─────────────────────────────────────────────────────────

  private drawWeaponMounts(x: number, y: number, flicker: number): void {
    this.weaponGfx.clear();
    this.drawFrontBarrel(x, y, flicker);
    this.drawLeftPod(x, y);
    this.drawRightMount(x, y);
  }

  // Front laser barrel extending above the nose.
  private drawFrontBarrel(x: number, y: number, flicker: number): void {
    const tipY = y + NOSE_Y;

    if (this.stats.hasFrontWeapon) {
      // 4 px wide barrel with a pulsing cyan charge glow at the tip.
      const alpha = 0.65 + flicker * 0.3;
      this.weaponGfx.fillStyle(0x0088aa, 0.8);
      this.weaponGfx.fillRect(x - 2, tipY - 14, 4, 14);  // barrel body

      // Emitter tip — brighter, slightly wider
      this.weaponGfx.fillStyle(0x00ffff, alpha);
      this.weaponGfx.fillRect(x - 3, tipY - 16, 6, 4);
    } else {
      // Dark nub — shows there is a mount point but nothing equipped.
      this.weaponGfx.fillStyle(0x2a2a2a, 0.7);
      this.weaponGfx.fillRect(x - 1, tipY - 5, 2, 5);
    }
  }

  // Port (left) wing — spread-shot pods.
  private drawLeftPod(x: number, y: number): void {
    if (this.stats.leftWeapon !== 'spread') return;

    const px = x + WING_L_X;
    const py = y + WING_Y;

    // Angled pod body
    this.weaponGfx.fillStyle(0xcc5500, 0.85);
    this.weaponGfx.fillRect(px - 12, py - 2, 12, 5);   // horizontal strut
    this.weaponGfx.fillRect(px - 14, py - 4, 5, 9);    // pod block

    // Orange emitter tip
    this.weaponGfx.fillStyle(0xff9900, 0.9);
    this.weaponGfx.fillRect(px - 17, py - 3, 4, 7);
  }

  // Starboard (right) wing — heavy-beam rectangular mount.
  private drawRightMount(x: number, y: number): void {
    if (this.stats.rightWeapon !== 'beam') return;

    const px = x + WING_R_X;
    const py = y + WING_Y;

    // Thick block mount
    this.weaponGfx.fillStyle(0x999999, 0.85);
    this.weaponGfx.fillRect(px, py - 4, 16, 8);

    // White energy core running through the centre
    this.weaponGfx.fillStyle(0xddeeff, 0.9);
    this.weaponGfx.fillRect(px + 2, py - 2, 12, 4);
  }
}
