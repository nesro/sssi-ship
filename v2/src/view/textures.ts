import Phaser from 'phaser';
import { PALETTE, WEAPON_PALETTE } from './palette';
import { px } from './layout';

// Baked glow (V2_HANDOFF.md §4.3): paint each shape several times with increasing
// thickness and decreasing alpha ONCE at startup, then rely on ADD blend at runtime.
// Never per-object PostFX — it melts mid-tier Android WebViews.

const GLOW_PASSES = [
  { widthMultiplier: 4, alpha: 0.14 },
  { widthMultiplier: 2.6, alpha: 0.25 },
  { widthMultiplier: 1.6, alpha: 0.45 },
  { widthMultiplier: 1, alpha: 1 },
];

export const TEXTURE_KEYS = {
  ship: 'ship',
  fodder: 'enemy-fodder',
  striker: 'enemy-striker',
  tank: 'enemy-tank',
  swarm: 'enemy-swarm',
  blocker: 'enemy-blocker',
  boss: 'enemy-boss',
  guardian: 'enemy-guardian',
  // Projectiles — one per weapon kind+tier
  laserPulse1: 'laser-pulse-1',
  laserPulse2: 'laser-pulse-2',
  laserIon: 'laser-ion',
  laserScatter1: 'laser-scatter-1',
  laserScatter2: 'laser-scatter-2',
  laserNova1: 'laser-nova-1',
  laserNova2: 'laser-nova-2',
  // Weapon icons for shop list
  iconPulse1: 'icon-pulse-1',
  iconPulse2: 'icon-pulse-2',
  iconIon: 'icon-ion',
  iconScatter1: 'icon-scatter-1',
  iconScatter2: 'icon-scatter-2',
  iconNova1: 'icon-nova-1',
  iconNova2: 'icon-nova-2',
} as const;

/** Maps a core enemy kind to its texture; logs a warning for unknown kinds. */
export function textureForEnemyKind(kind: string, isBoss: boolean, blocks: boolean): string {
  if (isBoss) return TEXTURE_KEYS.boss;
  if (blocks) return TEXTURE_KEYS.blocker;
  const known: Record<string, string> = {
    fodder: TEXTURE_KEYS.fodder,
    striker: TEXTURE_KEYS.striker,
    tank: TEXTURE_KEYS.tank,
    swarm: TEXTURE_KEYS.swarm,
    guardian: TEXTURE_KEYS.guardian,
  };
  const texture = known[kind];
  if (texture === undefined) {
    console.warn(`Unknown enemy kind "${kind}" — falling back to fodder texture`);
    return TEXTURE_KEYS.fodder;
  }
  return texture;
}

/** Primary glow colour for a weapon kind + id combo. Shared by CombatScene and ShopPreviewPanel. */
export function weaponKindColor(kind: string, weaponId: string): number {
  const { level } = splitWeaponId(weaponId);
  const upgraded = level >= 3;
  if (kind === 'ion') return WEAPON_PALETTE.ion;
  if (kind === 'scatter') return upgraded ? WEAPON_PALETTE.scatter2 : WEAPON_PALETTE.scatter1;
  if (kind === 'nova') return upgraded ? WEAPON_PALETTE.nova2 : WEAPON_PALETTE.nova1;
  return upgraded ? WEAPON_PALETTE.pulse2 : WEAPON_PALETTE.pulse1;
}

/** Extracts kind and level from a weapon ID like 'pulse-3' or 'scatter-5'. */
export function splitWeaponId(weaponId: string): { kind: string; level: number } {
  const lastDash = weaponId.lastIndexOf('-');
  const level = lastDash >= 0 ? parseInt(weaponId.slice(lastDash + 1), 10) : 1;
  const kind = lastDash >= 0 ? weaponId.slice(0, lastDash) : weaponId;
  return { kind, level: isNaN(level) ? 1 : level };
}

/** Maps weapon item id to its projectile texture key. Levels 1-2 use the base texture; 3+ use the upgraded one. */
export function laserTextureForWeaponId(weaponId: string): string {
  const { kind, level } = splitWeaponId(weaponId);
  const upgraded = level >= 3;
  if (kind === 'pulse')   return upgraded ? TEXTURE_KEYS.laserPulse2   : TEXTURE_KEYS.laserPulse1;
  if (kind === 'ion')     return TEXTURE_KEYS.laserIon;
  if (kind === 'scatter') return upgraded ? TEXTURE_KEYS.laserScatter2 : TEXTURE_KEYS.laserScatter1;
  if (kind === 'nova')    return upgraded ? TEXTURE_KEYS.laserNova2    : TEXTURE_KEYS.laserNova1;
  return TEXTURE_KEYS.laserPulse1;
}

/** Maps weapon item id to its shop icon texture key. */
export function iconTextureForWeaponId(weaponId: string): string {
  const { kind, level } = splitWeaponId(weaponId);
  const upgraded = level >= 3;
  if (kind === 'pulse')   return upgraded ? TEXTURE_KEYS.iconPulse2   : TEXTURE_KEYS.iconPulse1;
  if (kind === 'ion')     return TEXTURE_KEYS.iconIon;
  if (kind === 'scatter') return upgraded ? TEXTURE_KEYS.iconScatter2 : TEXTURE_KEYS.iconScatter1;
  if (kind === 'nova')    return upgraded ? TEXTURE_KEYS.iconNova2    : TEXTURE_KEYS.iconNova1;
  return TEXTURE_KEYS.iconPulse1;
}

type ShapePainter = (g: Phaser.GameObjects.Graphics, lineWidth: number, alpha: number) => void;

export function buildGameTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEXTURE_KEYS.ship)) return; // textures are global; bake once
  buildShipTexture(scene);
  buildEnemyTextures(scene);
  buildProjectileTextures(scene);
  buildWeaponIconTextures(scene);
}

function buildShipTexture(scene: Phaser.Scene): void {
  bake(scene, TEXTURE_KEYS.ship, px(48), px(52), (g, w, a) => {
    g.lineStyle(w, PALETTE.weaponCyan, a);
    g.strokeTriangle(px(24), px(4), px(8), px(48), px(40), px(48));
    g.lineBetween(px(8), px(32), px(1), px(48));
    g.lineBetween(px(40), px(32), px(47), px(48));
    // Left gun barrel (muzzle at y=16, matches SHIP_GUN_Y_OFFSET = 10 from origin y=26)
    g.lineBetween(px(7), px(36), px(7), px(16));
    g.lineBetween(px(5), px(16), px(9), px(16));
    // Right gun barrel
    g.lineBetween(px(41), px(36), px(41), px(16));
    g.lineBetween(px(39), px(16), px(43), px(16));
    g.strokeCircle(px(24), px(22), px(4));
    g.lineBetween(px(18), px(30), px(16), px(48));
    g.lineBetween(px(30), px(30), px(32), px(48));
  });
}

function buildEnemyTextures(scene: Phaser.Scene): void {
  bake(scene, TEXTURE_KEYS.fodder, px(28), px(28), (g, w, a) => {
    g.lineStyle(w, PALETTE.enemyRed, a);
    strokeDiamond(g, px(14), px(14), px(9));
  });
  bake(scene, TEXTURE_KEYS.striker, px(32), px(32), (g, w, a) => {
    g.lineStyle(w, PALETTE.enemyOrange, a);
    traceStar(g, px(16), px(16), px(14), px(6));
  });
  bake(scene, TEXTURE_KEYS.tank, px(36), px(36), (g, w, a) => {
    g.lineStyle(w, PALETTE.enemyRed, a);
    g.strokeRect(px(8), px(8), px(20), px(20));
    g.lineBetween(px(18), px(5), px(18), px(31));
    g.lineBetween(px(5), px(18), px(31), px(18));
  });
  bake(scene, TEXTURE_KEYS.swarm, px(16), px(16), (g, w, a) => {
    g.lineStyle(w, PALETTE.enemyOrange, a);
    strokeDiamond(g, px(8), px(8), px(4));
  });
  bake(scene, TEXTURE_KEYS.blocker, px(44), px(44), (g, w, a) => {
    g.lineStyle(w, PALETTE.enemyOrange, a);
    g.strokeRect(px(8), px(8), px(28), px(28));
    strokeDiamond(g, px(22), px(22), px(14));
  });
  bake(scene, TEXTURE_KEYS.guardian, px(32), px(32), (g, w, a) => {
    g.lineStyle(w, PALETTE.shieldBlue, a);
    g.strokeCircle(px(16), px(16), px(12));
    g.strokeCircle(px(16), px(16), px(6));
    g.lineBetween(px(16), px(4), px(16), px(28));
    g.lineBetween(px(4), px(16), px(28), px(16));
  });
  bake(scene, TEXTURE_KEYS.boss, px(72), px(72), (g, w, a) => {
    g.lineStyle(w, PALETTE.enemyRed, a);
    strokeDiamond(g, px(36), px(36), px(30));
    g.strokeCircle(px(36), px(36), px(16));
    g.lineBetween(px(36), px(20), px(36), px(52));
    g.lineBetween(px(20), px(36), px(52), px(36));
    g.lineBetween(px(36), px(6), px(36), px(2));
    g.lineBetween(px(36), px(66), px(36), px(70));
    g.lineBetween(px(6), px(36), px(2), px(36));
    g.lineBetween(px(66), px(36), px(70), px(36));
  });
}

function buildProjectileTextures(scene: Phaser.Scene): void {
  // Zigzag lightning bolt — ported from v1's iconic laserTex shape, with v2 multi-pass glow.
  bake(scene, TEXTURE_KEYS.laserPulse1, px(8), px(40), (g, w, a) => {
    g.lineStyle(w, WEAPON_PALETTE.pulse1, a);
    traceZigzag(g, [[4,1],[1,9],[7,17],[1,25],[7,33],[4,39]]);
  });
  bake(scene, TEXTURE_KEYS.laserPulse2, px(10), px(40), (g, w, a) => {
    g.lineStyle(w, WEAPON_PALETTE.pulse2, a);
    traceZigzag(g, [[5,1],[1,9],[9,17],[1,25],[9,33],[5,39]]);
  });
  bake(scene, TEXTURE_KEYS.laserIon, px(14), px(20), (g, w, a) => {
    g.fillStyle(WEAPON_PALETTE.ion, a * 0.6);
    g.fillCircle(px(7), px(7), px(5));
    g.lineStyle(w, WEAPON_PALETTE.ion, a);
    g.strokeCircle(px(7), px(7), px(5));
  });
  bake(scene, TEXTURE_KEYS.laserScatter1, px(6), px(28), (g, w, a) => {
    g.lineStyle(w, WEAPON_PALETTE.scatter1, a);
    g.lineBetween(px(3), px(2), px(3), px(26));
    g.fillStyle(WEAPON_PALETTE.scatter1, a);
    g.fillCircle(px(3), px(3), w * 0.6);
  });
  bake(scene, TEXTURE_KEYS.laserScatter2, px(6), px(28), (g, w, a) => {
    g.lineStyle(w, WEAPON_PALETTE.scatter2, a);
    g.lineBetween(px(3), px(2), px(3), px(26));
    g.fillStyle(WEAPON_PALETTE.scatter2, a);
    g.fillCircle(px(3), px(3), w * 0.7);
  });
  bake(scene, TEXTURE_KEYS.laserNova1, px(40), px(40), (g, w, a) => {
    g.lineStyle(w, WEAPON_PALETTE.nova1, a);
    g.strokeCircle(px(20), px(20), px(16));
    g.lineStyle(w * 0.5, WEAPON_PALETTE.nova1, a * 0.4);
    g.strokeCircle(px(20), px(20), px(10));
  });
  bake(scene, TEXTURE_KEYS.laserNova2, px(52), px(52), (g, w, a) => {
    g.lineStyle(w, WEAPON_PALETTE.nova2, a);
    g.strokeCircle(px(26), px(26), px(22));
    g.lineStyle(w * 0.5, WEAPON_PALETTE.nova2, a * 0.4);
    g.strokeCircle(px(26), px(26), px(14));
  });
}

function buildWeaponIconTextures(scene: Phaser.Scene): void {
  bake(scene, TEXTURE_KEYS.iconPulse1, px(24), px(32), (g, w, a) => {
    g.lineStyle(w, WEAPON_PALETTE.pulse1, a);
    g.lineBetween(px(7), px(28), px(7), px(6));
    g.lineBetween(px(5), px(6), px(9), px(6));
    g.lineBetween(px(17), px(28), px(17), px(6));
    g.lineBetween(px(15), px(6), px(19), px(6));
  });
  bake(scene, TEXTURE_KEYS.iconPulse2, px(24), px(32), (g, w, a) => {
    g.lineStyle(w, WEAPON_PALETTE.pulse2, a);
    g.lineBetween(px(7), px(28), px(7), px(4));
    g.lineBetween(px(4), px(4), px(10), px(4));
    g.lineBetween(px(17), px(28), px(17), px(4));
    g.lineBetween(px(14), px(4), px(20), px(4));
  });
  bake(scene, TEXTURE_KEYS.iconIon, px(24), px(32), (g, w, a) => {
    g.lineStyle(w * 1.5, WEAPON_PALETTE.ion, a);
    g.lineBetween(px(12), px(28), px(12), px(4));
    g.lineBetween(px(8), px(4), px(16), px(4));
    g.lineStyle(w, WEAPON_PALETTE.ion, a);
    g.strokeRect(px(9), px(14), px(6), px(10));
  });
  bake(scene, TEXTURE_KEYS.iconScatter1, px(28), px(32), (g, w, a) => {
    g.lineStyle(w, WEAPON_PALETTE.scatter1, a);
    g.lineBetween(px(14), px(28), px(14), px(6));
    g.lineBetween(px(12), px(6), px(16), px(6));
    g.lineBetween(px(7), px(28), px(5), px(8));
    g.lineBetween(px(3), px(8), px(7), px(8));
    g.lineBetween(px(21), px(28), px(23), px(8));
    g.lineBetween(px(21), px(8), px(25), px(8));
  });
  bake(scene, TEXTURE_KEYS.iconScatter2, px(28), px(32), (g, w, a) => {
    g.lineStyle(w, WEAPON_PALETTE.scatter2, a);
    g.lineBetween(px(14), px(28), px(14), px(5));
    g.lineBetween(px(11), px(5), px(17), px(5));
    g.lineBetween(px(7), px(28), px(3), px(7));
    g.lineBetween(px(1), px(7), px(5), px(7));
    g.lineBetween(px(21), px(28), px(25), px(7));
    g.lineBetween(px(23), px(7), px(27), px(7));
  });
  bake(scene, TEXTURE_KEYS.iconNova1, px(28), px(32), (g, w, a) => {
    g.lineStyle(w, WEAPON_PALETTE.nova1, a);
    g.strokeCircle(px(14), px(20), px(8));
    g.lineBetween(px(14), px(12), px(14), px(4));
  });
  bake(scene, TEXTURE_KEYS.iconNova2, px(28), px(32), (g, w, a) => {
    g.lineStyle(w, WEAPON_PALETTE.nova2, a);
    g.strokeCircle(px(14), px(20), px(10));
    g.lineBetween(px(14), px(10), px(14), px(2));
    g.lineBetween(px(6), px(14), px(22), px(14));
  });
}

function bake(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  paint: ShapePainter,
): void {
  const g = scene.add.graphics();
  const baseLineWidth = Math.max(1, px(1.5));
  for (const pass of GLOW_PASSES) {
    paint(g, baseLineWidth * pass.widthMultiplier, pass.alpha);
  }
  g.generateTexture(key, Math.ceil(width), Math.ceil(height));
  g.destroy();
}

function strokeDiamond(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  radius: number,
): void {
  g.beginPath();
  g.moveTo(cx, cy - radius);
  g.lineTo(cx + radius, cy);
  g.lineTo(cx, cy + radius);
  g.lineTo(cx - radius, cy);
  g.closePath();
  g.strokePath();
}

/** Strokes a zigzag polyline through logical-pixel coordinate pairs. */
function traceZigzag(g: Phaser.GameObjects.Graphics, points: [number, number][]): void {
  g.beginPath();
  points.forEach(([x, y], i) => {
    if (i === 0) { g.moveTo(px(x), px(y)); } else { g.lineTo(px(x), px(y)); }
  });
  g.strokePath();
}

/** 5-pointed star outline — ported from v1's traceStar helper. */
function traceStar(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
): void {
  const pts = 5;
  g.beginPath();
  for (let i = 0; i < pts * 2; i++) {
    const angle = (i * Math.PI / pts) - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    if (i === 0) {
      g.moveTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
    } else {
      g.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
    }
  }
  g.closePath();
  g.strokePath();
}
