import Phaser from 'phaser';
import { PALETTE, WEAPON_PALETTE } from './palette';
import { px } from './layout';
import { splitWeaponId, TEXTURE_KEYS } from './textureKeys';
import type { ShipKindName } from './textureKeys';

// Baked glow (V2_HANDOFF.md §4.3): paint each shape several times with increasing
// thickness and decreasing alpha ONCE at startup, then rely on ADD blend at runtime.
// Never per-object PostFX — it melts mid-tier Android WebViews.

const GLOW_PASSES = [
  { widthMultiplier: 4, alpha: 0.14 },
  { widthMultiplier: 2.6, alpha: 0.25 },
  { widthMultiplier: 1.6, alpha: 0.45 },
  { widthMultiplier: 1, alpha: 1 },
];

/** Maps a core enemy kind to its texture; logs a warning for unknown kinds. */
export function textureForEnemyKind(kind: string, isBoss: boolean, blocks: boolean): string {
  if (isBoss) return TEXTURE_KEYS.boss;
  const known: Record<string, string> = {
    fodder: TEXTURE_KEYS.fodder,
    striker: TEXTURE_KEYS.striker,
    tank: TEXTURE_KEYS.tank,
    swarm: TEXTURE_KEYS.swarm,
    blocker: TEXTURE_KEYS.blocker,
    guardian: TEXTURE_KEYS.guardian,
    turret: TEXTURE_KEYS.turret,
    kamikaze: TEXTURE_KEYS.kamikaze,
    booster: TEXTURE_KEYS.booster,
  };
  // Unnamed blockers (kind not in map) fall back to the blocker texture.
  if (blocks && !(kind in known)) return TEXTURE_KEYS.blocker;
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

/** Burst colour for a side weapon kind + id combo — matches each kind's shop icon hue. */
export function sideWeaponKindColor(kind: string, sideWeaponId: string): number {
  const { level } = splitWeaponId(sideWeaponId);
  const upgraded = level >= 3;
  if (kind === 'flechette') return upgraded ? 0xffaa88 : 0xff7755;
  if (kind === 'railgun') return upgraded ? 0xff88aa : 0xff3355;
  if (kind === 'orbital') return upgraded ? 0xddaaff : 0xaa66ff;
  return upgraded ? 0xccf0ff : 0x99ddff; // focus
}

/** Maps weapon item id to its projectile texture key. Levels 1-2 use the base texture; 3+ use the upgraded one. */
export function laserTextureForWeaponId(weaponId: string): string {
  const { kind, level } = splitWeaponId(weaponId);
  const upgraded = level >= 3;
  if (kind === 'pulse')   return upgraded ? TEXTURE_KEYS.laserPulse2   : TEXTURE_KEYS.laserPulse1;
  if (kind === 'ion')     return TEXTURE_KEYS.laserIon;
  if (kind === 'scatter') return upgraded ? TEXTURE_KEYS.laserScatter2 : TEXTURE_KEYS.laserScatter1;
  if (kind === 'nova')    return upgraded ? TEXTURE_KEYS.laserNova2    : TEXTURE_KEYS.laserNova1;
  if (kind === 'y2010')   return TEXTURE_KEYS.laserY2010;
  console.warn(`Unknown weapon kind "${kind}" in laserTextureForWeaponId — falling back to pulse1`);
  return TEXTURE_KEYS.laserPulse1;
}

type ShapePainter = (g: Phaser.GameObjects.Graphics, lineWidth: number, alpha: number) => void;

export function buildGameTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEXTURE_KEYS.shipInterceptor)) return; // textures are global; bake once
  buildShipTextures(scene);
  buildEnemyTextures(scene);
  buildProjectileTextures(scene);
  buildRearProjectileTextures(scene);
  buildSideProjectileTextures(scene);
  buildWeaponIconTextures(scene);
  buildRearWeaponIconTextures(scene);
  buildSideWeaponIconTextures(scene);
  buildEquipmentIconTextures(scene);
}

/** Returns the bolt texture key for a rear weapon id like 'grenade-2'. */
export function rearBoltTextureKey(rearWeaponId: string): string {
  const kind = rearWeaponId.split('-')[0] ?? 'grenade';
  switch (kind) {
    case 'flak':    return TEXTURE_KEYS.rearFlak;
    case 'plasma':  return TEXTURE_KEYS.rearPlasma;
    case 'arc':     return TEXTURE_KEYS.rearArc;
    case 'cluster': return TEXTURE_KEYS.rearCluster;
    default:        return TEXTURE_KEYS.rearGrenade;
  }
}

// All ships: 48×52 logical px. Gun barrels at x=7 and x=41, muzzle tips at y=16.
// This keeps SHIP_GUN_X_OFFSET=17 and SHIP_GUN_Y_OFFSET=10 valid for every skin.
/** Standard dual gun barrels at x=7 and x=41, muzzle tips at y=16. Used by 4 of 5 ships. */
function drawStandardGunBarrels(g: Phaser.GameObjects.Graphics): void {
  g.lineBetween(px(7), px(36), px(7), px(16));
  g.lineBetween(px(5), px(16), px(9), px(16));
  g.lineBetween(px(41), px(36), px(41), px(16));
  g.lineBetween(px(39), px(16), px(43), px(16));
}

/**
 * Blend a ship's base color toward dim (low levels) or blazing white (Lv5).
 * Lv1=40% • Lv2=60% • Lv3=80% • Lv4=100% • Lv5=100%+40% white
 */
function shipLevelColor(base: number, lv: number): number {
  const r = (base >> 16) & 0xff;
  const g = (base >> 8) & 0xff;
  const b = base & 0xff;
  const bright = [0.40, 0.60, 0.80, 1.00, 1.00][lv - 1] ?? 1.0;
  const white  = [0.00, 0.00, 0.00, 0.00, 0.40][lv - 1] ?? 0.0;
  return (Math.min(255, Math.round(r * bright + 255 * white)) << 16) |
         (Math.min(255, Math.round(g * bright + 255 * white)) << 8)  |
          Math.min(255, Math.round(b * bright + 255 * white));
}

type KindPainter = (color: number) => ShapePainter;

function buildShipTextures(scene: Phaser.Scene): void {
  const interceptor: KindPainter = (c) => (g, w, a) => {
    g.lineStyle(w, c, a);
    g.strokeTriangle(px(24), px(4), px(8), px(48), px(40), px(48));
    g.lineBetween(px(8), px(32), px(1), px(48));
    g.lineBetween(px(40), px(32), px(47), px(48));
    drawStandardGunBarrels(g);
    g.strokeCircle(px(24), px(22), px(4));
    g.lineBetween(px(18), px(30), px(16), px(48));
    g.lineBetween(px(30), px(30), px(32), px(48));
  };
  const tanker: KindPainter = (c) => (g, w, a) => {
    g.lineStyle(w, c, a);
    g.strokeTriangle(px(24), px(6), px(10), px(28), px(38), px(28));
    g.strokeRect(px(4), px(28), px(40), px(18));
    g.lineBetween(px(0), px(28), px(0), px(48));
    g.lineBetween(px(48), px(28), px(48), px(48));
    g.lineBetween(px(0), px(48), px(4), px(46));
    g.lineBetween(px(48), px(48), px(44), px(46));
    drawStandardGunBarrels(g);
    g.lineBetween(px(14), px(28), px(14), px(46));
    g.lineBetween(px(34), px(28), px(34), px(46));
  };
  const salvager: KindPainter = (c) => (g, w, a) => {
    g.lineStyle(w, c, a);
    g.strokeTriangle(px(24), px(4), px(14), px(48), px(36), px(48));
    drawStandardGunBarrels(g);
    g.lineBetween(px(14), px(30), px(2), px(20));
    g.lineBetween(px(2), px(20), px(0), px(12));
    g.lineBetween(px(2), px(20), px(6), px(14));
    g.strokeRect(px(36), px(30), px(10), px(14));
    g.lineBetween(px(36), px(37), px(46), px(37));
  };
  const reactor: KindPainter = (c) => (g, w, a) => {
    g.lineStyle(w, c, a);
    g.strokeTriangle(px(24), px(4), px(16), px(48), px(32), px(48));
    g.strokeCircle(px(24), px(28), px(10));
    g.strokeCircle(px(24), px(28), px(4));
    drawStandardGunBarrels(g);
    g.lineBetween(px(14), px(28), px(8), px(28));
    g.lineBetween(px(34), px(28), px(40), px(28));
  };
  const warship: KindPainter = (c) => (g, w, a) => {
    g.lineStyle(w, c, a);
    g.strokeTriangle(px(24), px(4), px(20), px(48), px(28), px(48));
    g.lineBetween(px(20), px(32), px(2), px(44));
    g.lineBetween(px(2), px(44), px(4), px(48));
    g.lineBetween(px(4), px(48), px(20), px(40));
    g.lineBetween(px(28), px(32), px(46), px(44));
    g.lineBetween(px(46), px(44), px(44), px(48));
    g.lineBetween(px(44), px(48), px(28), px(40));
    g.lineBetween(px(7), px(38), px(7), px(16));
    g.lineBetween(px(4), px(16), px(10), px(16));
    g.lineBetween(px(41), px(38), px(41), px(16));
    g.lineBetween(px(38), px(16), px(44), px(16));
    g.strokeRect(px(5), px(32), px(5), px(8));
    g.strokeRect(px(38), px(32), px(5), px(8));
  };

  // Legacy single-texture keys (full color = Lv4 equivalent)
  bake(scene, TEXTURE_KEYS.ship,          px(48), px(52), interceptor(PALETTE.weaponCyan));
  bake(scene, TEXTURE_KEYS.shipInterceptor, px(48), px(52), interceptor(PALETTE.weaponCyan));
  bake(scene, TEXTURE_KEYS.shipTanker,    px(48), px(52), tanker(PALETTE.motorMagenta));
  bake(scene, TEXTURE_KEYS.shipSalvager,  px(48), px(52), salvager(PALETTE.generatorAmber));
  bake(scene, TEXTURE_KEYS.shipReactor,   px(48), px(52), reactor(PALETTE.shieldBlue));
  bake(scene, TEXTURE_KEYS.shipWarship,   px(48), px(52), warship(PALETTE.enemyOrange));

  // Level-specific textures: ship-{kind}-lv{1..5}
  const kinds: Array<[ShipKindName, number, KindPainter]> = [
    ['interceptor', PALETTE.weaponCyan,      interceptor],
    ['tanker',      PALETTE.motorMagenta,    tanker],
    ['salvager',    PALETTE.generatorAmber,  salvager],
    ['reactor',     PALETTE.shieldBlue,      reactor],
    ['warship',     PALETTE.enemyOrange,     warship],
  ];
  for (const [name, base, make] of kinds) {
    for (let lv = 1; lv <= 5; lv++) {
      bake(scene, `ship-${name}-lv${String(lv)}`, px(48), px(52), make(shipLevelColor(base, lv)));
    }
  }
}

function buildEnemyTextures(scene: Phaser.Scene): void {
  bake(scene, TEXTURE_KEYS.fodder, px(48), px(48), (g, w, a) => {
    g.lineStyle(w, PALETTE.enemyRed, a);
    strokeDiamond(g, px(24), px(24), px(18));
  });
  bake(scene, TEXTURE_KEYS.striker, px(52), px(52), (g, w, a) => {
    g.lineStyle(w, PALETTE.enemyOrange, a);
    traceStar(g, px(26), px(26), px(22), px(9));
  });
  bake(scene, TEXTURE_KEYS.tank, px(56), px(56), (g, w, a) => {
    g.lineStyle(w, PALETTE.enemyRed, a);
    g.strokeRect(px(10), px(10), px(36), px(36));
    g.lineBetween(px(28), px(7), px(28), px(49));
    g.lineBetween(px(7), px(28), px(49), px(28));
  });
  bake(scene, TEXTURE_KEYS.swarm, px(30), px(30), (g, w, a) => {
    g.lineStyle(w, PALETTE.enemyOrange, a);
    strokeDiamond(g, px(15), px(15), px(10));
  });
  bake(scene, TEXTURE_KEYS.blocker, px(64), px(64), (g, w, a) => {
    g.lineStyle(w, PALETTE.enemyOrange, a);
    g.strokeRect(px(9), px(9), px(46), px(46));
    strokeDiamond(g, px(32), px(32), px(22));
  });
  bake(scene, TEXTURE_KEYS.guardian, px(52), px(52), (g, w, a) => {
    g.lineStyle(w, PALETTE.shieldBlue, a);
    g.strokeCircle(px(26), px(26), px(20));
    g.strokeCircle(px(26), px(26), px(9));
    g.lineBetween(px(26), px(6), px(26), px(46));
    g.lineBetween(px(6), px(26), px(46), px(26));
  });
  bake(scene, TEXTURE_KEYS.turret, px(60), px(60), (g, w, a) => {
    g.lineStyle(w, 0xcc8800, a);
    g.strokeRect(px(12), px(24), px(36), px(27));
    g.lineBetween(px(30), px(3), px(30), px(24));
    g.lineBetween(px(21), px(12), px(39), px(12));
    g.strokeCircle(px(30), px(34), px(8));
  });
  bake(scene, TEXTURE_KEYS.kamikaze, px(40), px(40), (g, w, a) => {
    g.lineStyle(w, 0xff2255, a);
    traceStar(g, px(20), px(20), px(17), px(7));
    g.strokeCircle(px(20), px(20), px(5));
  });
  // Booster (fable-fun-review-followup.md Item 7): a core ring feeding two forward
  // chevrons — "forward" meaning toward the ship (enemies move top→bottom down the
  // lane, so distance-toward-0 is *down*), matching its actual mechanic of buffing
  // whichever enemy is nearest-ahead of it (combat.ts's regenerateEnemies). Previously
  // had no entry here at all, so it silently fell back to the fodder texture — a
  // buff-support unit rendering identically to weak filler enemies.
  bake(scene, TEXTURE_KEYS.booster, px(52), px(52), (g, w, a) => {
    g.lineStyle(w, PALETTE.generatorAmber, a);
    g.strokeCircle(px(26), px(16), px(11));
    traceChevronDown(g, px(26), px(32), px(11));
    traceChevronDown(g, px(26), px(42), px(11));
  });
  bake(scene, TEXTURE_KEYS.boss, px(96), px(96), (g, w, a) => {
    g.lineStyle(w, PALETTE.enemyRed, a);
    strokeDiamond(g, px(48), px(48), px(40));
    g.strokeCircle(px(48), px(48), px(22));
    g.lineBetween(px(48), px(27), px(48), px(69));
    g.lineBetween(px(27), px(48), px(69), px(48));
    g.lineBetween(px(48), px(8), px(48), px(3));
    g.lineBetween(px(48), px(88), px(48), px(93));
    g.lineBetween(px(8), px(48), px(3), px(48));
    g.lineBetween(px(88), px(48), px(93), px(48));
  });
}

function buildProjectileTextures(scene: Phaser.Scene): void {
  // A crisp elongated bolt — bright core + soft additive glow, via the same multi-pass
  // bake() every other texture uses. Replaces the original zigzag shape, which read as a
  // rendering glitch rather than a laser (Fable's 2nd visual-polish pass); the retired
  // zigzag survives on as laserY2010 below — a deliberate nostalgia callback, not a bug.
  bake(scene, TEXTURE_KEYS.laserPulse1, px(8), px(40), (g, w, a) => {
    g.lineStyle(w, WEAPON_PALETTE.pulse1, a);
    g.lineBetween(px(4), px(4), px(4), px(38));
  });
  bake(scene, TEXTURE_KEYS.laserPulse2, px(10), px(40), (g, w, a) => {
    g.lineStyle(w, WEAPON_PALETTE.pulse2, a);
    g.lineBetween(px(5), px(3), px(5), px(38));
  });
  // v1's iconic laserTex shape, preserved verbatim — the secret 2010 Easter egg weapon's
  // projectile. Deliberately unpolished; that's the joke.
  bake(scene, TEXTURE_KEYS.laserY2010, px(8), px(40), (g, w, a) => {
    g.lineStyle(w, WEAPON_PALETTE.y2010, a);
    traceZigzag(g, [[4,1],[1,9],[7,17],[1,25],[7,33],[4,39]]);
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

function buildRearProjectileTextures(scene: Phaser.Scene): void {
  // Grenade: orange filled circle — slow heavy round
  bake(scene, TEXTURE_KEYS.rearGrenade, px(16), px(16), (g, w, a) => {
    g.fillStyle(0xff6622, a * 0.5);
    g.fillCircle(px(8), px(8), px(5));
    g.lineStyle(w, 0xff6622, a);
    g.strokeCircle(px(8), px(8), px(4));
  });
  // Flak: blue-gray stub — small fast pellet
  bake(scene, TEXTURE_KEYS.rearFlak, px(6), px(18), (g, w, a) => {
    g.lineStyle(w, 0xaabbdd, a);
    g.lineBetween(px(3), px(2), px(3), px(16));
    g.fillStyle(0xaabbdd, a);
    g.fillCircle(px(3), px(3), w * 0.7);
  });
  // Plasma: magenta orb — large slow blob
  bake(scene, TEXTURE_KEYS.rearPlasma, px(20), px(20), (g, w, a) => {
    g.fillStyle(0xff44ff, a * 0.4);
    g.fillCircle(px(10), px(10), px(7));
    g.lineStyle(w, 0xff44ff, a);
    g.strokeCircle(px(10), px(10), px(6));
  });
  // Arc: bright teal lightning bolt
  bake(scene, TEXTURE_KEYS.rearArc, px(8), px(30), (g, w, a) => {
    g.lineStyle(w, 0x44eeff, a);
    traceZigzag(g, [[4,1],[2,9],[6,15],[2,21],[4,29]]);
  });
  // Cluster: amber diamond — spread sub-munition
  bake(scene, TEXTURE_KEYS.rearCluster, px(14), px(14), (g, w, a) => {
    g.lineStyle(w, 0xffaa22, a);
    strokeDiamond(g, px(7), px(7), px(4));
    g.fillStyle(0xffaa22, a * 0.6);
    g.fillCircle(px(7), px(7), px(2));
  });
}

function buildSideProjectileTextures(scene: Phaser.Scene): void {
  // Focus: bright cyan beam — thick core, wide glow, bright flare at the tip
  bake(scene, TEXTURE_KEYS.sideFocusBolt, px(16), px(36), (g, w, a) => {
    g.lineStyle(w * 1.8, 0x99ddff, a);
    g.lineBetween(px(8), px(4), px(8), px(34));
    g.fillStyle(0xffffff, a);
    g.fillCircle(px(8), px(6), w * 1.1);
    g.lineStyle(w, 0xffffff, a * 0.8);
    g.lineBetween(px(3), px(6), px(13), px(6));
  });
  // Flechette: orange dart — bigger head, double-line tail for a sense of motion
  bake(scene, TEXTURE_KEYS.sideFlechetteBolt, px(20), px(32), (g, w, a) => {
    g.fillStyle(0xff7755, a * 0.95);
    g.fillTriangle(px(10), px(0), px(2), px(20), px(18), px(20));
    g.fillStyle(0xffffff, a * 0.8);
    g.fillTriangle(px(10), px(4), px(6), px(16), px(14), px(16));
    g.lineStyle(w, 0xff7755, a * 0.7);
    g.lineBetween(px(5), px(18), px(3), px(30));
    g.lineBetween(px(15), px(18), px(17), px(30));
  });
  // Railgun: bright red-pink streak — long thick slug with a hot white core
  bake(scene, TEXTURE_KEYS.sideRailgunBolt, px(10), px(46), (g, w, a) => {
    g.lineStyle(w * 2.2, 0xff3355, a);
    g.lineBetween(px(5), px(4), px(5), px(42));
    g.lineStyle(w * 0.8, 0xffffff, a);
    g.lineBetween(px(5), px(4), px(5), px(30));
    g.fillStyle(0xffffff, a);
    g.fillCircle(px(5), px(5), w * 0.9);
  });
  // Orbital: purple bombardment charge — big ring, bright core, faint outer halo ring
  bake(scene, TEXTURE_KEYS.sideOrbitalBolt, px(28), px(28), (g, w, a) => {
    g.lineStyle(w * 0.6, 0xaa66ff, a * 0.5);
    g.strokeCircle(px(14), px(14), px(13));
    g.fillStyle(0xaa66ff, a * 0.55);
    g.fillCircle(px(14), px(14), px(9));
    g.lineStyle(w, 0xaa66ff, a);
    g.strokeCircle(px(14), px(14), px(8));
    g.fillStyle(0xddaaff, a);
    g.fillCircle(px(14), px(14), px(3.5));
  });
}

/** Returns the bolt texture key for a side weapon id like 'orbital-2'. */
export function sideBoltTextureKey(sideWeaponId: string): string {
  const kind = sideWeaponId.split('-')[0] ?? 'focus';
  switch (kind) {
    case 'flechette': return TEXTURE_KEYS.sideFlechetteBolt;
    case 'railgun':   return TEXTURE_KEYS.sideRailgunBolt;
    case 'orbital':   return TEXTURE_KEYS.sideOrbitalBolt;
    default:          return TEXTURE_KEYS.sideFocusBolt;
  }
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
  // The old zigzag, shrunk to icon size — the shop row's own little nostalgia wink.
  bake(scene, TEXTURE_KEYS.iconY2010, px(24), px(32), (g, w, a) => {
    g.lineStyle(w, WEAPON_PALETTE.y2010, a);
    traceZigzag(g, [[12,3],[5,13],[15,17],[6,27],[15,29]]);
  });
}

function buildRearWeaponIconTextures(scene: Phaser.Scene): void {
  const amber   = 0xffaa22;
  const amber2  = 0xffcc44;
  const yellow  = 0xffee44;
  const yellow2 = 0xffff88;
  const mag     = 0xff44cc;
  const mag2    = 0xff88ee;
  const cyan    = 0x44ffee;
  const cyan2   = 0x88ffff;
  const green   = 0x44ff88;
  const green2  = 0x88ffcc;

  // Grenade — round bomb with fuse
  bake(scene, TEXTURE_KEYS.iconGrenade1, px(28), px(32), (g, w, a) => {
    g.lineStyle(w, amber, a);
    g.strokeCircle(px(14), px(20), px(8));
    g.lineBetween(px(14), px(12), px(17), px(6));
    g.lineBetween(px(17), px(6), px(20), px(4));
  });
  bake(scene, TEXTURE_KEYS.iconGrenade2, px(28), px(32), (g, w, a) => {
    g.lineStyle(w, amber2, a);
    g.strokeCircle(px(14), px(20), px(9));
    g.lineBetween(px(14), px(11), px(18), px(5));
    g.lineBetween(px(18), px(5), px(22), px(2));
    g.lineStyle(w * 0.7, amber2, a);
    g.strokeCircle(px(14), px(20), px(5));
  });

  // Flak — wide horizontal spread burst
  bake(scene, TEXTURE_KEYS.iconFlak1, px(32), px(28), (g, w, a) => {
    g.lineStyle(w, yellow, a);
    g.lineBetween(px(16), px(26), px(16), px(14));
    g.lineBetween(px(16), px(14), px(4),  px(6));
    g.lineBetween(px(16), px(14), px(10), px(4));
    g.lineBetween(px(16), px(14), px(16), px(2));
    g.lineBetween(px(16), px(14), px(22), px(4));
    g.lineBetween(px(16), px(14), px(28), px(6));
  });
  bake(scene, TEXTURE_KEYS.iconFlak2, px(32), px(28), (g, w, a) => {
    g.lineStyle(w, yellow2, a);
    g.lineBetween(px(16), px(26), px(16), px(14));
    g.lineBetween(px(16), px(14), px(2),  px(8));
    g.lineBetween(px(16), px(14), px(8),  px(2));
    g.lineBetween(px(16), px(14), px(16), px(1));
    g.lineBetween(px(16), px(14), px(24), px(2));
    g.lineBetween(px(16), px(14), px(30), px(8));
    g.lineStyle(w * 0.6, yellow2, a);
    g.lineBetween(px(16), px(14), px(4), px(14));
    g.lineBetween(px(16), px(14), px(28), px(14));
  });

  // Plasma — blob / filled circle core
  bake(scene, TEXTURE_KEYS.iconPlasma1, px(28), px(32), (g, w, a) => {
    g.lineStyle(w * 1.8, mag, a);
    g.strokeCircle(px(14), px(18), px(9));
    g.lineStyle(w, mag, a);
    g.strokeCircle(px(14), px(18), px(4));
    g.lineBetween(px(14), px(9), px(14), px(3));
  });
  bake(scene, TEXTURE_KEYS.iconPlasma2, px(28), px(32), (g, w, a) => {
    g.lineStyle(w * 2, mag2, a);
    g.strokeCircle(px(14), px(18), px(10));
    g.lineStyle(w, mag2, a);
    g.strokeCircle(px(14), px(18), px(5));
    g.lineBetween(px(14), px(8), px(14), px(2));
    g.lineBetween(px(5), px(14), px(23), px(14));
  });

  // Arc — forked lightning bolt
  bake(scene, TEXTURE_KEYS.iconArc1, px(28), px(32), (g, w, a) => {
    g.lineStyle(w, cyan, a);
    traceZigzag(g, [[14, 28], [8, 18], [14, 16], [7, 4]]);
    traceZigzag(g, [[14, 16], [20, 6]]);
  });
  bake(scene, TEXTURE_KEYS.iconArc2, px(28), px(32), (g, w, a) => {
    g.lineStyle(w * 1.2, cyan2, a);
    traceZigzag(g, [[14, 28], [7, 17], [14, 15], [6, 2]]);
    traceZigzag(g, [[14, 15], [22, 5]]);
    g.lineStyle(w * 0.6, cyan2, a);
    traceZigzag(g, [[14, 28], [18, 20], [13, 18], [19, 8]]);
  });

  // Cluster — hexagonal scatter pattern
  bake(scene, TEXTURE_KEYS.iconCluster1, px(28), px(32), (g, w, a) => {
    g.lineStyle(w, green, a);
    strokeDiamond(g, px(14), px(16), px(5));
    g.strokeCircle(px(6),  px(8),  px(3));
    g.strokeCircle(px(22), px(8),  px(3));
    g.strokeCircle(px(6),  px(24), px(3));
    g.strokeCircle(px(22), px(24), px(3));
  });
  bake(scene, TEXTURE_KEYS.iconCluster2, px(28), px(32), (g, w, a) => {
    g.lineStyle(w, green2, a);
    strokeDiamond(g, px(14), px(16), px(5));
    g.strokeCircle(px(4),  px(8),  px(3));
    g.strokeCircle(px(24), px(8),  px(3));
    g.strokeCircle(px(4),  px(24), px(3));
    g.strokeCircle(px(24), px(24), px(3));
    g.strokeCircle(px(14), px(4),  px(2));
    g.strokeCircle(px(14), px(28), px(2));
  });
}

function buildSideWeaponIconTextures(scene: Phaser.Scene): void {
  const ice    = 0x99ddff;
  const ice2   = 0xccf0ff;
  const coral  = 0xff7755;
  const coral2 = 0xffaa88;
  const red    = 0xff3355;
  const red2   = 0xff88aa;
  const violet = 0xaa66ff;
  const violet2 = 0xddaaff;

  // Focus — targeting reticle: circle, four ticks, center dot
  bake(scene, TEXTURE_KEYS.iconFocus1, px(28), px(32), (g, w, a) => {
    g.lineStyle(w, ice, a);
    g.strokeCircle(px(14), px(18), px(7));
    g.lineBetween(px(14), px(7), px(14), px(11));
    g.lineBetween(px(14), px(25), px(14), px(29));
    g.lineBetween(px(3), px(18), px(7), px(18));
    g.lineBetween(px(21), px(18), px(25), px(18));
    g.fillStyle(ice, a * 0.8);
    g.fillCircle(px(14), px(18), px(2));
  });
  bake(scene, TEXTURE_KEYS.iconFocus2, px(28), px(32), (g, w, a) => {
    g.lineStyle(w * 1.2, ice2, a);
    g.strokeCircle(px(14), px(18), px(9));
    g.lineBetween(px(14), px(5), px(14), px(10));
    g.lineBetween(px(14), px(26), px(14), px(31));
    g.lineBetween(px(1), px(18), px(6), px(18));
    g.lineBetween(px(22), px(18), px(27), px(18));
    g.fillStyle(ice2, a * 0.9);
    g.fillCircle(px(14), px(18), px(3));
  });

  // Flechette — fan of three darts converging at the tail
  bake(scene, TEXTURE_KEYS.iconFlechette1, px(28), px(32), (g, w, a) => {
    g.lineStyle(w, coral, a);
    g.lineBetween(px(14), px(28), px(14), px(6));
    g.lineBetween(px(14), px(6), px(11), px(2));
    g.lineBetween(px(14), px(28), px(6), px(10));
    g.lineBetween(px(6), px(10), px(2), px(6));
    g.lineBetween(px(14), px(28), px(22), px(10));
    g.lineBetween(px(22), px(10), px(26), px(6));
  });
  bake(scene, TEXTURE_KEYS.iconFlechette2, px(28), px(32), (g, w, a) => {
    g.lineStyle(w * 1.2, coral2, a);
    g.lineBetween(px(14), px(29), px(14), px(4));
    g.lineBetween(px(14), px(4), px(10), px(1));
    g.lineBetween(px(14), px(29), px(4), px(8));
    g.lineBetween(px(4), px(8), px(1), px(4));
    g.lineBetween(px(14), px(29), px(24), px(8));
    g.lineBetween(px(24), px(8), px(27), px(4));
  });

  // Railgun — single heavy piercing rail with an arrow tip
  bake(scene, TEXTURE_KEYS.iconRailgun1, px(28), px(32), (g, w, a) => {
    g.lineStyle(w * 1.6, red, a);
    g.lineBetween(px(14), px(29), px(14), px(4));
    g.lineStyle(w, red, a);
    g.lineBetween(px(9), px(9), px(14), px(2));
    g.lineBetween(px(19), px(9), px(14), px(2));
  });
  bake(scene, TEXTURE_KEYS.iconRailgun2, px(28), px(32), (g, w, a) => {
    g.lineStyle(w * 2, red2, a);
    g.lineBetween(px(14), px(30), px(14), px(2));
    g.lineStyle(w, red2, a);
    g.lineBetween(px(7), px(8), px(14), px(0));
    g.lineBetween(px(21), px(8), px(14), px(0));
    g.lineStyle(w * 0.6, red2, a * 0.7);
    g.lineBetween(px(10), px(20), px(18), px(20));
  });

  // Orbital — converging chevron marking a strike called down from above
  bake(scene, TEXTURE_KEYS.iconOrbital1, px(28), px(32), (g, w, a) => {
    g.lineStyle(w, violet, a);
    g.lineBetween(px(6), px(6), px(14), px(14));
    g.lineBetween(px(22), px(6), px(14), px(14));
    g.lineBetween(px(14), px(14), px(14), px(24));
    g.strokeCircle(px(14), px(27), px(3));
  });
  bake(scene, TEXTURE_KEYS.iconOrbital2, px(28), px(32), (g, w, a) => {
    g.lineStyle(w * 1.2, violet2, a);
    g.lineBetween(px(4), px(4), px(14), px(14));
    g.lineBetween(px(24), px(4), px(14), px(14));
    g.lineBetween(px(14), px(14), px(14), px(25));
    g.strokeCircle(px(14), px(28), px(4));
    g.lineStyle(w * 0.6, violet2, a * 0.7);
    g.lineBetween(px(8), px(9), px(20), px(9));
  });
}

function buildEquipmentIconTextures(scene: Phaser.Scene): void {
  const sb = PALETTE.shieldBlue;
  const ga = PALETTE.generatorAmber;
  const mm = PALETTE.motorMagenta;

  // ── Shield icons (24×24) ─────────────────────────────────────────────────
  // Wall: three stacked horizontal bars
  bake(scene, TEXTURE_KEYS.iconShieldWall, px(24), px(24), (g, w, a) => {
    g.lineStyle(w, sb, a);
    g.lineBetween(px(3), px(7),  px(21), px(7));
    g.lineBetween(px(3), px(12), px(21), px(12));
    g.lineBetween(px(6), px(17), px(18), px(17));
  });
  // Reflex: chevron pointing right (reflects)
  bake(scene, TEXTURE_KEYS.iconShieldReflex, px(24), px(24), (g, w, a) => {
    g.lineStyle(w, sb, a);
    g.lineBetween(px(5), px(5),  px(19), px(12));
    g.lineBetween(px(19), px(12), px(5), px(19));
  });
  // Bulwark: hexagon (solid fortress)
  bake(scene, TEXTURE_KEYS.iconShieldBulwark, px(24), px(24), (g, w, a) => {
    g.lineStyle(w, sb, a);
    traceZigzag(g, [[12,2],[20,7],[20,17],[12,22],[4,17],[4,7],[12,2]]);
  });
  // Flux: wavy energy line
  bake(scene, TEXTURE_KEYS.iconShieldFlux, px(24), px(24), (g, w, a) => {
    g.lineStyle(w, sb, a);
    traceZigzag(g, [[3,12],[7,6],[11,18],[15,6],[21,12]]);
    g.strokeCircle(px(12), px(12), px(3));
  });

  // ── Generator icons (24×28) ──────────────────────────────────────────────
  // Torrent: three vertical flow lines
  bake(scene, TEXTURE_KEYS.iconGeneratorTorrent, px(24), px(28), (g, w, a) => {
    g.lineStyle(w, ga, a);
    g.lineBetween(px(7),  px(4), px(7),  px(24));
    g.lineBetween(px(12), px(4), px(12), px(24));
    g.lineBetween(px(17), px(4), px(17), px(24));
  });
  // Reserve: battery shape (large capacity)
  bake(scene, TEXTURE_KEYS.iconGeneratorReserve, px(24), px(28), (g, w, a) => {
    g.lineStyle(w, ga, a);
    g.strokeRect(px(5), px(7), px(14), px(18));
    g.lineBetween(px(9), px(5), px(15), px(5));
    g.lineBetween(px(9), px(7), px(9),  px(14));
    g.lineBetween(px(15), px(7), px(15), px(14));
    g.lineBetween(px(9), px(14), px(15), px(14));
  });
  // Surge: lightning bolt
  bake(scene, TEXTURE_KEYS.iconGeneratorSurge, px(24), px(28), (g, w, a) => {
    g.lineStyle(w, ga, a);
    traceZigzag(g, [[15,3],[9,14],[14,14],[8,25]]);
  });
  // Steady: flat line with pulse circle
  bake(scene, TEXTURE_KEYS.iconGeneratorSteady, px(24), px(28), (g, w, a) => {
    g.lineStyle(w, ga, a);
    g.lineBetween(px(3), px(14), px(21), px(14));
    g.strokeCircle(px(12), px(14), px(5));
    g.lineBetween(px(12), px(9),  px(12), px(4));
    g.lineBetween(px(12), px(19), px(12), px(24));
  });

  // ── Motor icons (24×24) ──────────────────────────────────────────────────
  // Rush: two right-pointing chevrons (speed)
  bake(scene, TEXTURE_KEYS.iconMotorRush, px(24), px(24), (g, w, a) => {
    g.lineStyle(w, mm, a);
    traceZigzag(g, [[4,5],[12,12],[4,19]]);
    traceZigzag(g, [[12,5],[20,12],[12,19]]);
  });
  // Tactical: square crosshair (precision)
  bake(scene, TEXTURE_KEYS.iconMotorTactical, px(24), px(24), (g, w, a) => {
    g.lineStyle(w, mm, a);
    g.strokeRect(px(8), px(8), px(8), px(8));
    g.lineBetween(px(12), px(3),  px(12), px(8));
    g.lineBetween(px(12), px(16), px(12), px(21));
    g.lineBetween(px(3),  px(12), px(8),  px(12));
    g.lineBetween(px(16), px(12), px(21), px(12));
  });
  // Sentinel: circle with inner diamond (watchful)
  bake(scene, TEXTURE_KEYS.iconMotorSentinel, px(24), px(24), (g, w, a) => {
    g.lineStyle(w, mm, a);
    g.strokeCircle(px(12), px(12), px(9));
    strokeDiamond(g, px(12), px(12), px(4));
  });
  // Overdrive: three right-pointing chevrons (max thrust)
  bake(scene, TEXTURE_KEYS.iconMotorOverdrive, px(24), px(24), (g, w, a) => {
    g.lineStyle(w, mm, a);
    traceZigzag(g, [[2,5],[8,12],[2,19]]);
    traceZigzag(g, [[9,5],[15,12],[9,19]]);
    traceZigzag(g, [[16,5],[22,12],[16,19]]);
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

/** Open "v" chevron pointing down — used by the booster texture to signal "pushes
 * forward," where forward means toward the ship (down the lane). Args already in
 * baked-canvas pixel space, matching strokeDiamond/traceStar's convention. */
function traceChevronDown(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  halfWidth: number,
): void {
  g.beginPath();
  g.moveTo(cx - halfWidth, cy - halfWidth * 0.6);
  g.lineTo(cx, cy + halfWidth * 0.6);
  g.lineTo(cx + halfWidth, cy - halfWidth * 0.6);
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
