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

/** Draws the animated thruster flame pointing DOWN (used by ShopPreviewPanel). Clears `g` before drawing. */
export function drawThruster(
  g: Phaser.GameObjects.Graphics,
  cx: number, baseY: number, h: number, flicker: number,
): void {
  g.clear();
  g.fillStyle(PALETTE_AMBER, 0.65 * flicker);
  g.fillTriangle(cx - px(7), baseY, cx + px(7), baseY, cx, baseY + h);
  g.fillStyle(PALETTE_CYAN, 0.3 * flicker);
  g.fillTriangle(cx - px(4), baseY, cx + px(4), baseY, cx, baseY + px(6) * flicker);
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

