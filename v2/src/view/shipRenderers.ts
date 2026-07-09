import Phaser from 'phaser';
import { px, SHIP_GUN_X_OFFSET, SHIP_GUN_Y_OFFSET } from './layout';
import { sideWeaponKindColor, weaponKindColor } from './textures';

/** Horizontal offset from ship centre to each side-weapon wing mount — wider than the
 * front (±SHIP_GUN_X_OFFSET) and rear mounts so it reads as its own hardpoint. Exported so
 * bolt-spawning code (CombatScene, ShopPreviewPanel) launches from the same hardpoint the
 * indicator is drawn at. */
export const SIDE_WEAPON_MOUNT_X_OFFSET = 24;

const PALETTE_AMBER = 0xffaa22;
const PALETTE_CYAN = 0x00eeff;

export interface MuzzleFlash { x: number; y: number; life: number }

export interface LaserBolt {
  sprite: Phaser.GameObjects.Image;
  vy: number;
  targetY: number;
}

interface ThrusterParams {
  speed: number; minBright: number; range: number; hBase: number; hScale: number;
}

/** Per-motor-level animation parameters — keyed by motor level (1|2|3). */
const THRUSTER_PARAMS: Readonly<Record<1 | 2 | 3, ThrusterParams>> = {
  1: { speed: 0.014, minBright: 0.55, range: 0.45, hBase: 10, hScale: 10 },
  2: { speed: 0.020, minBright: 0.60, range: 0.40, hBase: 18, hScale: 14 },
  3: { speed: 0.030, minBright: 0.62, range: 0.38, hBase: 28, hScale: 22 },
};

interface ThrusterOpts { flicker: number; motorLevel?: 1 | 2 | 3; kindColor?: number }

export interface ShieldRingOpts { intensity: number; flash?: number }

/**
 * Draws four concentric neon shield rings around (cx, cy) at radius r.
 * intensity: 0–1 alpha scale (shield frac, or frac×tier-falloff for multi-ring previews).
 * flash: 0–1 hit-flash additive boost (pass 0 or omit for static preview contexts).
 */
export function drawShieldRings(
  g: Phaser.GameObjects.Graphics,
  cx: number, cy: number, r: number,
  opts: ShieldRingOpts,
): void {
  const { intensity, flash = 0 } = opts;
  const innerColor = flash > 0.5 ? 0xaaddff : 0x44aaff;
  g.lineStyle(px(5), 0x0033cc, (0.06 + flash * 0.08) * intensity);
  g.strokeCircle(cx, cy, r + px(8));
  g.lineStyle(px(2.5), 0x2255ff, 0.18 * intensity + flash * 0.2);
  g.strokeCircle(cx, cy, r + px(3));
  g.lineStyle(px(1.5), innerColor, Math.min(1, 0.45 * intensity + 0.1 + flash * 0.4));
  g.strokeCircle(cx, cy, r);
  g.lineStyle(px(0.8), 0xaaddff, Math.min(1, 0.55 * intensity + flash * 0.5));
  g.strokeCircle(cx, cy, r - px(2.5));
}

/** Draws the animated thruster flame pointing DOWN. Clears `g` before drawing. */
function drawThruster(
  g: Phaser.GameObjects.Graphics,
  cx: number, baseY: number, h: number,
  opts: ThrusterOpts,
): void {
  const { flicker, motorLevel = 1, kindColor = 0xff44cc } = opts;
  g.clear();
  if (motorLevel === 3) {
    // kind-colored outer → amber mid → white-hot core
    g.fillStyle(kindColor, 0.70 * flicker);
    g.fillTriangle(cx - px(13), baseY, cx + px(13), baseY, cx, baseY + h);
    g.fillStyle(PALETTE_AMBER, 0.55 * flicker);
    g.fillTriangle(cx - px(9), baseY, cx + px(9), baseY, cx, baseY + h * 0.75);
    g.fillStyle(0xffffff, 0.35 * flicker);
    g.fillTriangle(cx - px(5), baseY, cx + px(5), baseY, cx, baseY + px(10) * flicker);
    // Wing exhausts at cx ± 22
    const wOff = px(22);
    g.fillStyle(kindColor, 0.45 * flicker);
    g.fillTriangle(cx - wOff - px(5), baseY, cx - wOff + px(5), baseY, cx - wOff, baseY + h * 0.55);
    g.fillTriangle(cx + wOff - px(5), baseY, cx + wOff + px(5), baseY, cx + wOff, baseY + h * 0.55);
    g.fillStyle(PALETTE_AMBER, 0.30 * flicker);
    g.fillTriangle(cx - wOff - px(3), baseY, cx - wOff + px(3), baseY, cx - wOff, baseY + px(8) * flicker);
    g.fillTriangle(cx + wOff - px(3), baseY, cx + wOff + px(3), baseY, cx + wOff, baseY + px(8) * flicker);
  } else if (motorLevel === 2) {
    // kind-colored outer + bright amber mid + white-hot core
    g.fillStyle(kindColor, 0.70 * flicker);
    g.fillTriangle(cx - px(10), baseY, cx + px(10), baseY, cx, baseY + h);
    g.fillStyle(0xffcc44, 0.50 * flicker);
    g.fillTriangle(cx - px(6), baseY, cx + px(6), baseY, cx, baseY + h * 0.75);
    g.fillStyle(0xffffff, 0.25 * flicker);
    g.fillTriangle(cx - px(3), baseY, cx + px(3), baseY, cx, baseY + px(8) * flicker);
    // Side micro-exhausts at cx ± 15
    const sOff = px(15);
    g.fillStyle(kindColor, 0.35 * flicker);
    g.fillTriangle(cx - sOff - px(3), baseY, cx - sOff + px(3), baseY, cx - sOff, baseY + h * 0.45);
    g.fillTriangle(cx + sOff - px(3), baseY, cx + sOff + px(3), baseY, cx + sOff, baseY + h * 0.45);
  } else {
    // Level 1: kind-colored outer + white-hot inner
    g.fillStyle(kindColor, 0.65 * flicker);
    g.fillTriangle(cx - px(7), baseY, cx + px(7), baseY, cx, baseY + h);
    g.fillStyle(0xffffff, 0.30 * flicker);
    g.fillTriangle(cx - px(4), baseY, cx + px(4), baseY, cx, baseY + px(6) * flicker);
  }
}

/** Draws engine-pod housing geometry on the ship hull. No-op for level 1. Clears `g` before drawing. */
function drawMotorHousing(
  g: Phaser.GameObjects.Graphics,
  cx: number, shipCY: number, motorLevel: 1 | 2 | 3,
  kindColor = 0xff44cc,
): void {
  g.clear();
  if (motorLevel === 1) return;

  if (motorLevel === 2) {
    // Small nozzle brackets at wing roots (expects ADD blend)
    g.lineStyle(px(1.5), kindColor, 0.55);
    g.lineBetween(cx - px(19), shipCY + px(12), cx - px(13), shipCY + px(12));
    g.lineBetween(cx - px(19), shipCY + px(12), cx - px(19), shipCY + px(22));
    g.lineBetween(cx - px(13), shipCY + px(12), cx - px(13), shipCY + px(22));
    g.lineBetween(cx + px(13), shipCY + px(12), cx + px(19), shipCY + px(12));
    g.lineBetween(cx + px(13), shipCY + px(12), cx + px(13), shipCY + px(22));
    g.lineBetween(cx + px(19), shipCY + px(12), cx + px(19), shipCY + px(22));
    g.fillStyle(kindColor, 0.30);
    g.fillRect(cx - px(18), shipCY + px(20), px(4), px(2));
    g.fillRect(cx + px(14), shipCY + px(20), px(4), px(2));
  } else {
    // Level 3: full engine pods with intake channels (expects ADD blend)
    g.lineStyle(px(1.5), kindColor, 0.65);
    g.strokeRect(cx - px(26), shipCY + px(6), px(10), px(18));
    g.lineBetween(cx - px(26), shipCY + px(14), cx - px(16), shipCY + px(14));
    g.strokeRect(cx + px(16), shipCY + px(6), px(10), px(18));
    g.lineBetween(cx + px(16), shipCY + px(14), cx + px(26), shipCY + px(14));
    g.fillStyle(kindColor, 0.45);
    g.fillRect(cx - px(24), shipCY + px(22), px(6), px(2));
    g.fillRect(cx + px(18), shipCY + px(22), px(6), px(2));
    g.fillCircle(cx - px(21), shipCY + px(8), px(3));
    g.fillCircle(cx + px(21), shipCY + px(8), px(3));
  }
}

/** Vertical offset from ship center to the thruster flame's base — shared by every scene. */
const THRUSTER_FLAME_Y_OFFSET = 24;

export interface ThrusterAssemblyOpts { motorLevel: 1 | 2 | 3; kindColor: number; phase: number }

/**
 * Draws the full thruster assembly (flame + housing) for a ship at (shipCenterX,
 * shipCenterY). The only thing that differs between scenes is how they track the
 * ship's own position (animated drift/bob in combat, static in the shop preview) —
 * everything past that position is identical, so it lives here once.
 */
export function renderThrusterAssembly(
  thrusterGfx: Phaser.GameObjects.Graphics,
  motorGfx: Phaser.GameObjects.Graphics,
  shipCenterX: number, shipCenterY: number,
  opts: ThrusterAssemblyOpts,
): void {
  const { motorLevel, kindColor, phase } = opts;
  const p = THRUSTER_PARAMS[motorLevel];
  const flicker = p.minBright + p.range * Math.sin(phase * p.speed);
  drawThruster(
    thrusterGfx, shipCenterX, shipCenterY + px(THRUSTER_FLAME_Y_OFFSET),
    px(p.hBase + p.hScale * flicker), { flicker, motorLevel, kindColor },
  );
  drawMotorHousing(motorGfx, shipCenterX, shipCenterY, motorLevel, kindColor);
}

/** Draws the weapon-kind indicator at the gun hardpoints. Clears `g` before drawing. */
export function renderGunIndicator(
  g: Phaser.GameObjects.Graphics,
  weapon: { kind: string; id: string } | null,
  cx: number, cy: number,
): void {
  g.clear();
  if (weapon === null) return;
  const color = weaponKindColor(weapon.kind, weapon.id);
  g.lineStyle(px(1.5), color, 0.7);
  if (weapon.kind === 'ion') {
    g.strokeCircle(cx, cy - px(2), px(3));
  } else if (weapon.kind === 'scatter') {
    g.lineBetween(cx - px(10), cy + px(2), cx - px(13), cy - px(6));
    g.lineBetween(cx, cy, cx, cy - px(8));
    g.lineBetween(cx + px(10), cy + px(2), cx + px(13), cy - px(6));
  } else if (weapon.kind === 'nova') {
    g.strokeCircle(cx, cy + px(4), px(8));
  } else {
    g.fillStyle(color, 0.6);
    g.fillCircle(cx - px(SHIP_GUN_X_OFFSET), cy, px(2));
    g.fillCircle(cx + px(SHIP_GUN_X_OFFSET), cy, px(2));
  }
}

/**
 * Draws a pulsing amber energy-core glow at the ship's center — the generator indicator.
 * energyFrac: 0–1 (current energy / capacity). Clears `g` before drawing.
 */
export function drawGeneratorCore(
  g: Phaser.GameObjects.Graphics,
  cx: number, cy: number,
  energyFrac: number,
): void {
  g.clear();
  if (energyFrac <= 0) return;
  const alpha = 0.12 + energyFrac * 0.32;
  g.fillStyle(0xffaa22, alpha);
  g.fillCircle(cx, cy, px(4 + energyFrac * 2));
  g.lineStyle(px(1), 0xffcc44, alpha * 1.2);
  g.strokeCircle(cx, cy, px(5));
}

const REAR_WEAPON_KIND_COLORS: Readonly<Record<string, number>> = {
  grenade: 0xff6622,
  flak:    0xaabbdd,
  plasma:  0xff44ff,
  arc:     0x44eeff,
  cluster: 0xffaa22,
};

/** Draws rear-weapon mount indicators on the ship's aft hull — shape varies by kind. Clears `g` before drawing. */
export function drawRearWeaponIndicator(
  g: Phaser.GameObjects.Graphics,
  rearWeapon: { kind: string } | null,
  cx: number, cy: number,
): void {
  g.clear();
  if (rearWeapon === null) return;
  const color = REAR_WEAPON_KIND_COLORS[rearWeapon.kind] ?? 0xff8833;
  const mountY = cy + px(SHIP_GUN_Y_OFFSET);
  const lx = cx - px(SHIP_GUN_X_OFFSET);
  const rx = cx + px(SHIP_GUN_X_OFFSET);

  if (rearWeapon.kind === 'grenade') {
    // Round bomb: filled circle + outer ring
    g.fillStyle(color, 0.80);
    g.fillCircle(lx, mountY, px(3));
    g.fillCircle(rx, mountY, px(3));
    g.lineStyle(px(1), color, 0.9);
    g.strokeCircle(lx, mountY, px(4.5));
    g.strokeCircle(rx, mountY, px(4.5));
  } else if (rearWeapon.kind === 'flak') {
    // Barrel stub: short thick rect pointing aft
    g.fillStyle(color, 0.85);
    g.fillRect(lx - px(2), mountY - px(2), px(4), px(6));
    g.fillRect(rx - px(2), mountY - px(2), px(4), px(6));
  } else if (rearWeapon.kind === 'plasma') {
    // Glowing orb: bright fill + wide ring
    g.fillStyle(color, 0.85);
    g.fillCircle(lx, mountY, px(2.5));
    g.fillCircle(rx, mountY, px(2.5));
    g.lineStyle(px(1.5), color, 0.55);
    g.strokeCircle(lx, mountY, px(5));
    g.strokeCircle(rx, mountY, px(5));
  } else if (rearWeapon.kind === 'arc') {
    // Zigzag lightning bolt
    g.lineStyle(px(1.5), color, 0.90);
    g.lineBetween(lx - px(2), mountY - px(3), lx + px(2), mountY);
    g.lineBetween(lx + px(2), mountY, lx - px(2), mountY + px(3));
    g.lineBetween(rx - px(2), mountY - px(3), rx + px(2), mountY);
    g.lineBetween(rx + px(2), mountY, rx - px(2), mountY + px(3));
  } else if (rearWeapon.kind === 'cluster') {
    // Triangle of three dots (scatter pattern)
    g.fillStyle(color, 0.85);
    for (const bx of [lx, rx]) {
      g.fillCircle(bx, mountY - px(3), px(1.5));
      g.fillCircle(bx - px(2.5), mountY + px(2), px(1.5));
      g.fillCircle(bx + px(2.5), mountY + px(2), px(1.5));
    }
  } else {
    g.fillStyle(color, 0.75);
    g.fillCircle(lx, mountY, px(2.5));
    g.fillCircle(rx, mountY, px(2.5));
    g.lineStyle(px(1.5), color, 0.9);
    g.strokeCircle(lx, mountY, px(3.5));
    g.strokeCircle(rx, mountY, px(3.5));
  }
}

/** Draws side-weapon wing-mount indicators — shape varies by kind. Clears `g` before drawing. */
export function drawSideWeaponIndicator(
  g: Phaser.GameObjects.Graphics,
  sideWeapon: { kind: string; id: string } | null,
  cx: number, cy: number,
): void {
  g.clear();
  if (sideWeapon === null) return;
  const color = sideWeaponKindColor(sideWeapon.kind, sideWeapon.id);
  const lx = cx - px(SIDE_WEAPON_MOUNT_X_OFFSET);
  const rx = cx + px(SIDE_WEAPON_MOUNT_X_OFFSET);

  if (sideWeapon.kind === 'focus') {
    // Focused lens: ring + crosshair
    for (const bx of [lx, rx]) {
      g.lineStyle(px(1.2), color, 0.85);
      g.strokeCircle(bx, cy, px(3.5));
      g.lineBetween(bx - px(5), cy, bx + px(5), cy);
      g.lineBetween(bx, cy - px(5), bx, cy + px(5));
    }
  } else if (sideWeapon.kind === 'flechette') {
    // Small diverging fan of darts
    for (const bx of [lx, rx]) {
      g.lineStyle(px(1.3), color, 0.85);
      g.lineBetween(bx, cy, bx - px(4), cy - px(4));
      g.lineBetween(bx, cy, bx, cy - px(5));
      g.lineBetween(bx, cy, bx + px(4), cy - px(4));
    }
  } else if (sideWeapon.kind === 'railgun') {
    // Long thin barrel stub pointing outward
    g.fillStyle(color, 0.85);
    g.fillRect(lx - px(6), cy - px(1.2), px(6), px(2.4));
    g.fillRect(rx, cy - px(1.2), px(6), px(2.4));
    g.fillStyle(0xffffff, 0.6);
    g.fillCircle(lx - px(6), cy, px(1.3));
    g.fillCircle(rx + px(6), cy, px(1.3));
  } else {
    // Orbital: planet ring with a small orbiting satellite dot
    for (const bx of [lx, rx]) {
      g.lineStyle(px(1), color, 0.6);
      g.strokeCircle(bx, cy, px(4.5));
      g.fillStyle(color, 0.9);
      g.fillCircle(bx, cy - px(4.5), px(1.2));
    }
  }
}

/** Advances and redraws muzzle flashes; returns the surviving entries. Clears `g` before drawing. */
export function tickMuzzleFlashes(
  g: Phaser.GameObjects.Graphics,
  flashes: MuzzleFlash[],
  deltaMs: number,
  flashMs: number,
): MuzzleFlash[] {
  g.clear();
  return flashes.filter((f) => {
    f.life -= deltaMs;
    if (f.life <= 0) return false;
    const t = f.life / flashMs;
    g.fillStyle(PALETTE_CYAN, t * 0.85);
    g.fillCircle(f.x, f.y, px(5) * t);
    return true;
  });
}

/** Advances laser bolts; destroys expired sprites and returns the surviving entries. */
export function tickLaserBolts(bolts: LaserBolt[], deltaMs: number): LaserBolt[] {
  return bolts.filter((bolt) => {
    bolt.sprite.setY(bolt.sprite.y + bolt.vy * deltaMs);
    if (bolt.sprite.y <= bolt.targetY) { bolt.sprite.destroy(); return false; }
    return true;
  });
}

