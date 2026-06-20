import Phaser from 'phaser';
import { px, SHIP_GUN_X_OFFSET } from './layout';
import { weaponKindColor } from './textures';

const PALETTE_AMBER = 0xffaa22;
const PALETTE_CYAN = 0x00eeff;

export interface MuzzleFlash { x: number; y: number; life: number }

export interface LaserBolt {
  sprite: Phaser.GameObjects.Image;
  vy: number;
  targetY: number;
}

export interface ThrusterParams {
  speed: number; minBright: number; range: number; hBase: number; hScale: number;
}

/** Per-motor-level animation parameters — keyed by motor level (1|2|3). */
export const THRUSTER_PARAMS: Readonly<Record<1 | 2 | 3, ThrusterParams>> = {
  1: { speed: 0.014, minBright: 0.55, range: 0.45, hBase: 10, hScale: 10 },
  2: { speed: 0.020, minBright: 0.60, range: 0.40, hBase: 18, hScale: 14 },
  3: { speed: 0.030, minBright: 0.62, range: 0.38, hBase: 28, hScale: 22 },
};

export interface ThrusterOpts { flicker: number; motorLevel?: 1 | 2 | 3 }

/** Draws the animated thruster flame pointing DOWN. Clears `g` before drawing. */
export function drawThruster(
  g: Phaser.GameObjects.Graphics,
  cx: number, baseY: number, h: number,
  opts: ThrusterOpts,
): void {
  const { flicker, motorLevel = 1 } = opts;
  g.clear();
  if (motorLevel === 3) {
    // Central nozzle: magenta outer → amber mid → white-hot core
    g.fillStyle(0xff44cc, 0.70 * flicker);
    g.fillTriangle(cx - px(13), baseY, cx + px(13), baseY, cx, baseY + h);
    g.fillStyle(PALETTE_AMBER, 0.55 * flicker);
    g.fillTriangle(cx - px(9), baseY, cx + px(9), baseY, cx, baseY + h * 0.75);
    g.fillStyle(0xffffff, 0.35 * flicker);
    g.fillTriangle(cx - px(5), baseY, cx + px(5), baseY, cx, baseY + px(10) * flicker);
    // Wing exhausts at cx ± 22
    const wOff = px(22);
    g.fillStyle(0xff44cc, 0.45 * flicker);
    g.fillTriangle(cx - wOff - px(5), baseY, cx - wOff + px(5), baseY, cx - wOff, baseY + h * 0.55);
    g.fillTriangle(cx + wOff - px(5), baseY, cx + wOff + px(5), baseY, cx + wOff, baseY + h * 0.55);
    g.fillStyle(0xff8800, 0.30 * flicker);
    g.fillTriangle(cx - wOff - px(3), baseY, cx - wOff + px(3), baseY, cx - wOff, baseY + px(8) * flicker);
    g.fillTriangle(cx + wOff - px(3), baseY, cx + wOff + px(3), baseY, cx + wOff, baseY + px(8) * flicker);
  } else if (motorLevel === 2) {
    // Wider orange outer + bright amber mid + white-hot core
    g.fillStyle(0xff8800, 0.70 * flicker);
    g.fillTriangle(cx - px(10), baseY, cx + px(10), baseY, cx, baseY + h);
    g.fillStyle(0xffcc44, 0.50 * flicker);
    g.fillTriangle(cx - px(6), baseY, cx + px(6), baseY, cx, baseY + h * 0.75);
    g.fillStyle(0xffffff, 0.25 * flicker);
    g.fillTriangle(cx - px(3), baseY, cx + px(3), baseY, cx, baseY + px(8) * flicker);
    // Side micro-exhausts at cx ± 15
    const sOff = px(15);
    g.fillStyle(0xff8800, 0.35 * flicker);
    g.fillTriangle(cx - sOff - px(3), baseY, cx - sOff + px(3), baseY, cx - sOff, baseY + h * 0.45);
    g.fillTriangle(cx + sOff - px(3), baseY, cx + sOff + px(3), baseY, cx + sOff, baseY + h * 0.45);
  } else {
    // Level 1: amber outer + cyan inner
    g.fillStyle(PALETTE_AMBER, 0.65 * flicker);
    g.fillTriangle(cx - px(7), baseY, cx + px(7), baseY, cx, baseY + h);
    g.fillStyle(PALETTE_CYAN, 0.3 * flicker);
    g.fillTriangle(cx - px(4), baseY, cx + px(4), baseY, cx, baseY + px(6) * flicker);
  }
}

/** Draws engine-pod housing geometry on the ship hull. No-op for level 1. Clears `g` before drawing. */
export function drawMotorHousing(
  g: Phaser.GameObjects.Graphics,
  cx: number, shipCY: number, motorLevel: 1 | 2 | 3,
): void {
  g.clear();
  if (motorLevel === 1) return;

  if (motorLevel === 2) {
    // Small nozzle brackets at wing roots — orange glow (expects ADD blend)
    g.lineStyle(px(1.5), 0xff8800, 0.55);
    g.lineBetween(cx - px(19), shipCY + px(12), cx - px(13), shipCY + px(12));
    g.lineBetween(cx - px(19), shipCY + px(12), cx - px(19), shipCY + px(22));
    g.lineBetween(cx - px(13), shipCY + px(12), cx - px(13), shipCY + px(22));
    g.lineBetween(cx + px(13), shipCY + px(12), cx + px(19), shipCY + px(12));
    g.lineBetween(cx + px(13), shipCY + px(12), cx + px(13), shipCY + px(22));
    g.lineBetween(cx + px(19), shipCY + px(12), cx + px(19), shipCY + px(22));
    g.fillStyle(0xff8800, 0.30);
    g.fillRect(cx - px(18), shipCY + px(20), px(4), px(2));
    g.fillRect(cx + px(14), shipCY + px(20), px(4), px(2));
  } else {
    // Level 3: full engine pods with intake channels — magenta glow (expects ADD blend)
    g.lineStyle(px(1.5), 0xff44cc, 0.65);
    g.strokeRect(cx - px(26), shipCY + px(6), px(10), px(18));
    g.lineBetween(cx - px(26), shipCY + px(14), cx - px(16), shipCY + px(14));
    g.strokeRect(cx + px(16), shipCY + px(6), px(10), px(18));
    g.lineBetween(cx + px(16), shipCY + px(14), cx + px(26), shipCY + px(14));
    g.fillStyle(0xff44cc, 0.45);
    g.fillRect(cx - px(24), shipCY + px(22), px(6), px(2));
    g.fillRect(cx + px(18), shipCY + px(22), px(6), px(2));
    g.fillCircle(cx - px(21), shipCY + px(8), px(3));
    g.fillCircle(cx + px(21), shipCY + px(8), px(3));
  }
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

