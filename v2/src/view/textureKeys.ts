// Pure texture-key lookups — zero Phaser import. Kept separate from textures.ts (which
// imports Phaser to bake the actual textures) so src/viewmodel/** can depend on icon-key
// resolution without transitively pulling Phaser into a layer that must stay Phaser-free.

export const TEXTURE_KEYS = {
  ship: 'ship', // interceptor (default / backward compat)
  shipInterceptor: 'ship-interceptor-tex',
  shipTanker: 'ship-tanker-tex',
  shipSalvager: 'ship-salvager-tex',
  shipReactor: 'ship-reactor-tex',
  shipWarship: 'ship-warship-tex',
  fodder: 'enemy-fodder',
  striker: 'enemy-striker',
  tank: 'enemy-tank',
  swarm: 'enemy-swarm',
  blocker: 'enemy-blocker',
  boss: 'enemy-boss',
  guardian: 'enemy-guardian',
  turret: 'enemy-turret',
  kamikaze: 'enemy-kamikaze',
  booster: 'enemy-booster',
  // Projectiles — one per weapon kind+tier
  laserPulse1: 'laser-pulse-1',
  laserPulse2: 'laser-pulse-2',
  laserIon: 'laser-ion',
  laserScatter1: 'laser-scatter-1',
  laserScatter2: 'laser-scatter-2',
  laserNova1: 'laser-nova-1',
  laserNova2: 'laser-nova-2',
  laserY2010: 'laser-y2010', // secret Easter egg weapon — the retired v1 zigzag shape
  // Weapon icons for shop list
  iconPulse1: 'icon-pulse-1',
  iconPulse2: 'icon-pulse-2',
  iconIon: 'icon-ion',
  iconScatter1: 'icon-scatter-1',
  iconScatter2: 'icon-scatter-2',
  iconNova1: 'icon-nova-1',
  iconNova2: 'icon-nova-2',
  iconY2010: 'icon-y2010',
  // Rear weapon projectiles — one per kind
  rearGrenade: 'rear-grenade',
  rearFlak:    'rear-flak',
  rearPlasma:  'rear-plasma',
  rearArc:     'rear-arc',
  rearCluster: 'rear-cluster',
  // Side weapon projectiles — one per kind
  sideFocusBolt: 'side-focus-bolt',
  sideFlechetteBolt: 'side-flechette-bolt',
  sideRailgunBolt: 'side-railgun-bolt',
  sideOrbitalBolt: 'side-orbital-bolt',
  // Rear weapon icons (one per kind; level suffix appended at runtime)
  iconGrenade1: 'icon-grenade-1',
  iconGrenade2: 'icon-grenade-2',
  iconFlak1: 'icon-flak-1',
  iconFlak2: 'icon-flak-2',
  iconPlasma1: 'icon-plasma-1',
  iconPlasma2: 'icon-plasma-2',
  iconArc1: 'icon-arc-1',
  iconArc2: 'icon-arc-2',
  iconCluster1: 'icon-cluster-1',
  iconCluster2: 'icon-cluster-2',
  // Side weapon icons (one per kind; level suffix appended at runtime)
  iconFocus1: 'icon-focus-1',
  iconFocus2: 'icon-focus-2',
  iconFlechette1: 'icon-flechette-1',
  iconFlechette2: 'icon-flechette-2',
  iconRailgun1: 'icon-railgun-1',
  iconRailgun2: 'icon-railgun-2',
  iconOrbital1: 'icon-orbital-1',
  iconOrbital2: 'icon-orbital-2',
  // Shield kind icons
  iconShieldWall:    'icon-shield-wall',
  iconShieldReflex:  'icon-shield-reflex',
  iconShieldBulwark: 'icon-shield-bulwark',
  iconShieldFlux:    'icon-shield-flux',
  // Generator kind icons
  iconGeneratorTorrent: 'icon-generator-torrent',
  iconGeneratorReserve: 'icon-generator-reserve',
  iconGeneratorSurge:   'icon-generator-surge',
  iconGeneratorSteady:  'icon-generator-steady',
  // Motor kind icons
  iconMotorRush:      'icon-motor-rush',
  iconMotorTactical:  'icon-motor-tactical',
  iconMotorSentinel:  'icon-motor-sentinel',
  iconMotorOverdrive: 'icon-motor-overdrive',
} as const;

const SHIP_KIND_NAMES = ['interceptor', 'tanker', 'salvager', 'reactor', 'warship'] as const;
export type ShipKindName = typeof SHIP_KIND_NAMES[number];

/** Returns the level-specific baked texture key for a ship id like "ship-interceptor-3". */
export function textureForShipId(shipId: string): string {
  const match = /^ship-(\w+)-(\d+)$/.exec(shipId);
  if (match === null) return TEXTURE_KEYS.ship;
  const kind = match[1] ?? '';
  const level = Math.max(1, Math.min(5, parseInt(match[2] ?? '1', 10)));
  if (!(SHIP_KIND_NAMES as readonly string[]).includes(kind)) return TEXTURE_KEYS.ship;
  return `ship-${kind}-lv${String(level)}`;
}

/** Extracts kind and level from a weapon ID like 'pulse-3' or 'scatter-5'. */
export function splitWeaponId(weaponId: string): { kind: string; level: number } {
  const lastDash = weaponId.lastIndexOf('-');
  const level = lastDash >= 0 ? parseInt(weaponId.slice(lastDash + 1), 10) : 1;
  const kind = lastDash >= 0 ? weaponId.slice(0, lastDash) : weaponId;
  return { kind, level: isNaN(level) ? 1 : level };
}

/** Maps rear weapon item id to its shop icon texture key. Levels 1–2 = base, 3+ = upgraded. */
export function iconTextureForRearWeaponId(rearWeaponId: string): string {
  const { kind, level } = splitWeaponId(rearWeaponId);
  const upgraded = level >= 3;
  if (kind === 'grenade') return upgraded ? TEXTURE_KEYS.iconGrenade2 : TEXTURE_KEYS.iconGrenade1;
  if (kind === 'flak')    return upgraded ? TEXTURE_KEYS.iconFlak2    : TEXTURE_KEYS.iconFlak1;
  if (kind === 'plasma')  return upgraded ? TEXTURE_KEYS.iconPlasma2  : TEXTURE_KEYS.iconPlasma1;
  if (kind === 'arc')     return upgraded ? TEXTURE_KEYS.iconArc2     : TEXTURE_KEYS.iconArc1;
  if (kind === 'cluster') return upgraded ? TEXTURE_KEYS.iconCluster2 : TEXTURE_KEYS.iconCluster1;
  return TEXTURE_KEYS.iconGrenade1;
}

/** Maps side weapon item id to its shop icon texture key. Levels 1–2 = base, 3+ = upgraded. */
export function iconTextureForSideWeaponId(sideWeaponId: string): string {
  const { kind, level } = splitWeaponId(sideWeaponId);
  const upgraded = level >= 3;
  if (kind === 'focus')     return upgraded ? TEXTURE_KEYS.iconFocus2     : TEXTURE_KEYS.iconFocus1;
  if (kind === 'flechette') return upgraded ? TEXTURE_KEYS.iconFlechette2 : TEXTURE_KEYS.iconFlechette1;
  if (kind === 'railgun')   return upgraded ? TEXTURE_KEYS.iconRailgun2   : TEXTURE_KEYS.iconRailgun1;
  if (kind === 'orbital')   return upgraded ? TEXTURE_KEYS.iconOrbital2   : TEXTURE_KEYS.iconOrbital1;
  return TEXTURE_KEYS.iconFocus1;
}

/** Maps weapon item id to its shop icon texture key. */
export function iconTextureForShipKind(kind: string): string {
  const map: Record<string, string> = {
    interceptor: TEXTURE_KEYS.shipInterceptor,
    tanker:      TEXTURE_KEYS.shipTanker,
    salvager:    TEXTURE_KEYS.shipSalvager,
    reactor:     TEXTURE_KEYS.shipReactor,
    warship:     TEXTURE_KEYS.shipWarship,
  };
  return map[kind] ?? TEXTURE_KEYS.ship;
}

export function iconTextureForShieldKind(kind: string): string {
  const map: Record<string, string> = {
    wall:    TEXTURE_KEYS.iconShieldWall,
    reflex:  TEXTURE_KEYS.iconShieldReflex,
    bulwark: TEXTURE_KEYS.iconShieldBulwark,
    flux:    TEXTURE_KEYS.iconShieldFlux,
  };
  return map[kind] ?? TEXTURE_KEYS.iconShieldWall;
}

export function iconTextureForGeneratorKind(kind: string): string {
  const map: Record<string, string> = {
    torrent: TEXTURE_KEYS.iconGeneratorTorrent,
    reserve: TEXTURE_KEYS.iconGeneratorReserve,
    surge:   TEXTURE_KEYS.iconGeneratorSurge,
    steady:  TEXTURE_KEYS.iconGeneratorSteady,
  };
  return map[kind] ?? TEXTURE_KEYS.iconGeneratorTorrent;
}

export function iconTextureForMotorKind(kind: string): string {
  const map: Record<string, string> = {
    rush:      TEXTURE_KEYS.iconMotorRush,
    tactical:  TEXTURE_KEYS.iconMotorTactical,
    sentinel:  TEXTURE_KEYS.iconMotorSentinel,
    overdrive: TEXTURE_KEYS.iconMotorOverdrive,
  };
  return map[kind] ?? TEXTURE_KEYS.iconMotorRush;
}

export function iconTextureForWeaponId(weaponId: string): string {
  const { kind, level } = splitWeaponId(weaponId);
  const upgraded = level >= 3;
  if (kind === 'pulse')   return upgraded ? TEXTURE_KEYS.iconPulse2   : TEXTURE_KEYS.iconPulse1;
  if (kind === 'ion')     return TEXTURE_KEYS.iconIon;
  if (kind === 'scatter') return upgraded ? TEXTURE_KEYS.iconScatter2 : TEXTURE_KEYS.iconScatter1;
  if (kind === 'nova')    return upgraded ? TEXTURE_KEYS.iconNova2    : TEXTURE_KEYS.iconNova1;
  if (kind === 'y2010')   return TEXTURE_KEYS.iconY2010;
  console.warn(`Unknown weapon kind "${kind}" in iconTextureForWeaponId — falling back to pulse1`);
  return TEXTURE_KEYS.iconPulse1;
}

/** Outer-flame color per motor kind. Inner flame is always amber/white (heat). */
const MOTOR_KIND_COLORS: Readonly<Record<string, number>> = {
  rush:      0x00eeff,
  tactical:  0x44ff88,
  sentinel:  0xaaaaff,
  overdrive: 0xff2244,
};

/** Extracts the outer-flame color from a motor item ID like 'motor-rush-3'. */
export function motorKindColorFromId(motorId: string): number {
  const kind = motorId.split('-')[1] ?? '';
  return MOTOR_KIND_COLORS[kind] ?? 0xff44cc;
}

/** Extracts the visual tier (1|2|3) from a motor item ID like 'motor-rush-4'. Levels 3–5 all map to tier 3. */
export function motorLevelFromId(motorId: string): 1 | 2 | 3 {
  const parts = motorId.split('-');
  const lv = parseInt(parts[parts.length - 1] ?? '1', 10);
  if (lv >= 3) return 3;
  if (lv === 2) return 2;
  return 1;
}
