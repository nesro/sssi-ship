import type {
  GeneratorSpec,
  MotorSpec,
  RearWeaponKind,
  ShieldSpec,
  ShipSpec,
  SideWeaponKind,
  SupplySpec,
  WeaponKind,
  WeaponSpec,
} from '../core/types';

// The shop catalog. Starter items cost 0 and are owned from the first launch.
// Prices are demo-tuned; final tuning happens via the simulator sweep.

export type CatalogItem =
  | { system: 'weapon'; name: string; price: number; starsRequired?: number; blurb: string; spec: WeaponSpec }
  | { system: 'shield'; name: string; price: number; starsRequired?: number; blurb: string; spec: ShieldSpec }
  | { system: 'generator'; name: string; price: number; starsRequired?: number; blurb: string; spec: GeneratorSpec }
  | { system: 'motor'; name: string; price: number; starsRequired?: number; blurb: string; spec: MotorSpec };

// ---------- Weapon level system ----------

export const WEAPON_KINDS: WeaponKind[] = ['pulse', 'scatter', 'ion', 'nova', 'y2010'];
export const MAX_WEAPON_LEVEL = 5;

/** Display info and base-level-1 stats for each weapon type. */
const WEAPON_BASE: Record<WeaponKind, {
  displayName: string;
  blurb: string;
  damage: number;
  ticks: number;
  energy: number;
  targets: number;
  falloff: number;
}> = {
  pulse:   { displayName: 'Pulse Laser',  blurb: 'Reliable single-target fire.',            damage: 10, ticks: 5, energy: 6,  targets: 1,        falloff: 1.0 },
  ion:     { displayName: 'Ion Lance',    blurb: 'Heavy single hits. Feed it energy.',       damage: 28, ticks: 7, energy: 14, targets: 1,        falloff: 1.0 },
  scatter: { displayName: 'Scatter Beam', blurb: 'Pierces multiple enemies. Crowd killer.',  damage: 7,  ticks: 5, energy: 9,  targets: 3,        falloff: 0.7 },
  nova:    { displayName: 'Nova Wave',    blurb: 'Hits every enemy. Swarm destroyer.',       damage: 5,  ticks: 7, energy: 6,  targets: Infinity, falloff: 1.0 },
  // Secret Easter egg (hidden until campaign completion or dev mode — see
  // WEAPON_SYSTEM.isKindVisible below). Deliberately absurd, not tuned: it exists purely
  // as a nostalgia nod to the 2010 original, not as a real balance option.
  y2010:   { displayName: '2010 ORIGINAL', blurb: "Looks terrible. Feels like 2010. Somehow still destroys everything.", damage: 500, ticks: 2, energy: 1, targets: Infinity, falloff: 1.0 },
  // Rebalanced 2026-07-11 (docs/plans/nova-weapon-and-campaign-tension-review.md) — old
  // base (damage 3 / ticks 9 / energy 16) cleared 0% on m1/m2/m3/m4 at the intended
  // loadout's own level: its energy cost sat nova permanently in brownout (energy.ts's
  // trough-sampling), and its base damage was too low to matter even with energy fixed.
  // New base fixes the energy trough problem across the board and raises damage/fire
  // rate enough to make nova viable on fodder/swarm missions (m1/m2/m5/m6) and on m4's
  // mixed composition, while leaving it deliberately weak on m3 — the campaign's
  // hardest pure-blocker gauntlet — mirroring ion's own accepted collapse on m5's
  // swarm. See the plan doc's sim sweep for the full grid this was picked from.
};

// Redesigned 2026-07-10 (docs/plans/game-identity-and-design-review-followup.md):
// kinds are situational sidegrades, not a tier ladder — every kind costs the same
// coins/stars to reach a given level. Price reuses pulse's own already-tuned ladder
// (11,200 top end, ~15.6x cheaper than the old 175,000 nova-only ceiling) rather than
// inventing new numbers; the old design priced nova ~15x higher than pulse for the
// exact same level, which is a late-game reward structure, not a sidegrade one.
// Stars stay a separate, deliberately modest gate (not reused from pulse's near-zero
// curve) so performance-based progression still means something even as coin cost
// compresses — 26 stars for the ceiling item, not 44 (all mission stars) as before.

/** Stars required per weapon level (index = level − 1) — identical across every kind. */
const WEAPON_STARS_BY_LEVEL: [number, number, number, number, number] = [0, 3, 8, 16, 26];
// y2010's real gate is isKindVisible (campaign completion / dev mode), not stars — once
// visible, it's already "earned" by finishing the game, so no additional star cost.
const WEAPON_STARS_Y2010: [number, number, number, number, number] = [0, 0, 0, 0, 0];
const WEAPON_STARS: Record<WeaponKind, [number, number, number, number, number]> = {
  pulse: WEAPON_STARS_BY_LEVEL, scatter: WEAPON_STARS_BY_LEVEL,
  ion: WEAPON_STARS_BY_LEVEL, nova: WEAPON_STARS_BY_LEVEL, y2010: WEAPON_STARS_Y2010,
};

// Coin cost per level (index = level − 1) — identical across every kind (see comment
// above). Weapon has a NONE option, so level 1 — the mandatory starter — is priced
// low but never 0, or it would be indistinguishable from NONE.
const WEAPON_PRICES_BY_LEVEL: [number, number, number, number, number] = [100, 1050, 2300, 5100, 11200];
// A flat, thematic joke price rather than a tuned ladder — see y2010's WEAPON_BASE comment.
const WEAPON_PRICES_Y2010: [number, number, number, number, number] = [2010, 2010, 2010, 2010, 2010];
const WEAPON_PRICES: Record<WeaponKind, [number, number, number, number, number]> = {
  pulse: WEAPON_PRICES_BY_LEVEL, scatter: WEAPON_PRICES_BY_LEVEL,
  ion: WEAPON_PRICES_BY_LEVEL, nova: WEAPON_PRICES_BY_LEVEL, y2010: WEAPON_PRICES_Y2010,
};

/** Computes a weapon spec at a given upgrade level (1 = base, 5 = max). */
export function weaponSpecAtLevel(kind: WeaponKind, level: number): WeaponSpec {
  const base = WEAPON_BASE[kind];
  const t = level - 1; // 0 at level 1, 4 at level 5
  const maxT = kind === 'scatter' ? Math.floor(t / 2) : 0;
  return {
    id: `${kind}-${String(level)}`,
    kind,
    damagePerShot: Math.round(base.damage * Math.pow(1.22, t) * 10) / 10,
    ticksBetweenShots: Math.max(2, Math.round(base.ticks * Math.pow(0.91, t))),
    energyPerShot: Math.round(base.energy * Math.pow(1.15, t) * 10) / 10,
    maxTargets: kind === 'nova' ? Infinity : base.targets + maxT,
    falloffPerTarget: base.falloff,
    critChance: 0,
    missChance: 0,
    critMult: 2.0,
  };
}

/** Human-readable display name for a weapon type and level. */
function weaponDisplayName(kind: WeaponKind, level: number): string {
  return `${WEAPON_BASE[kind].displayName} Lv${String(level)}`;
}

/** Returns the base display name (without level suffix) for a weapon kind. */
export function weaponKindDisplayName(kind: WeaponKind): string {
  return WEAPON_BASE[kind].displayName;
}

// Build weapon catalog entries programmatically — one entry per (kind, level) pair.
const WEAPON_ITEMS: Record<string, CatalogItem> = Object.fromEntries(
  WEAPON_KINDS.flatMap((kind) =>
    Array.from({ length: MAX_WEAPON_LEVEL }, (_, i) => {
      const level = i + 1;
      const id = `${kind}-${String(level)}`;
      const base = WEAPON_BASE[kind];
      return [id, {
        system: 'weapon' as const,
        name: weaponDisplayName(kind, level),
        price: WEAPON_PRICES[kind][i] ?? 0,
        starsRequired: WEAPON_STARS[kind][i] ?? 0,
        blurb: base.blurb,
        spec: weaponSpecAtLevel(kind, level),
      }];
    }),
  ),
);

// ---------- Rear weapon system ----------

export const REAR_WEAPON_KINDS: RearWeaponKind[] = ['grenade', 'cluster', 'flak', 'arc', 'plasma'];
export const MAX_REAR_WEAPON_LEVEL = 5;

export interface RearWeaponCatalogItem {
  system: 'rear-weapon';
  name: string;
  price: number;
  starsRequired?: number;
  blurb: string;
  spec: WeaponSpec;
}

const REAR_WEAPON_BASE: Record<RearWeaponKind, {
  displayName: string;
  blurb: string;
  damage: number;
  ticks: number;
  energy: number;
  targets: number;
  falloff: number;
}> = {
  grenade: { displayName: 'Grenade Launcher', blurb: 'Balanced mid-queue burst. Hits a cluster of 3 enemies.',   damage: 12, ticks: 10, energy: 10, targets: 3, falloff: 0.80 },
  flak:    { displayName: 'Flak Turret',      blurb: 'Wide shrapnel spray. Anti-swarm specialist.',              damage:  5, ticks:  8, energy: 12, targets: 5, falloff: 0.70 },
  plasma:  { displayName: 'Plasma Cannon',    blurb: 'Slow charge, massive blast. Punishes high-HP targets.',    damage: 25, ticks: 14, energy: 18, targets: 2, falloff: 0.60 },
  arc:     { displayName: 'Arc Discharger',   blurb: 'Electric chain between two enemies. Reliable AoE.',        damage: 15, ticks:  9, energy: 11, targets: 2, falloff: 0.85 },
  cluster: { displayName: 'Cluster Bomb',     blurb: 'Submunition scatter. Max spread, thin per-target damage.', damage:  3, ticks:  7, energy: 11, targets: 6, falloff: 0.65 },
};

// Redesigned 2026-07-10 — kinds are situational sidegrades, not a tier ladder; see
// WEAPON_STARS's comment above for the full reasoning. Price reuses grenade's own
// already-tuned ladder (3,350 top end, ~38.8x cheaper than the old 130,000 plasma-only
// ceiling). Stars are a separate, modest gate — 15 for the ceiling item.

/** Stars required per rear weapon level (index = level − 1) — identical across every kind. */
const REAR_WEAPON_STARS_BY_LEVEL: [number, number, number, number, number] = [0, 2, 4, 8, 15];
const REAR_WEAPON_STARS: Record<RearWeaponKind, [number, number, number, number, number]> = {
  grenade: REAR_WEAPON_STARS_BY_LEVEL, cluster: REAR_WEAPON_STARS_BY_LEVEL,
  flak: REAR_WEAPON_STARS_BY_LEVEL, arc: REAR_WEAPON_STARS_BY_LEVEL, plasma: REAR_WEAPON_STARS_BY_LEVEL,
};

// Coin cost per level (index = level − 1) — identical across every kind. Rear weapon
// has a NONE option, so grenade level 1 is priced low but never 0, or it would be
// indistinguishable from NONE.
const REAR_WEAPON_PRICES_BY_LEVEL: [number, number, number, number, number] = [30, 310, 690, 1500, 3350];
const REAR_WEAPON_PRICES: Record<RearWeaponKind, [number, number, number, number, number]> = {
  grenade: REAR_WEAPON_PRICES_BY_LEVEL, cluster: REAR_WEAPON_PRICES_BY_LEVEL,
  flak: REAR_WEAPON_PRICES_BY_LEVEL, arc: REAR_WEAPON_PRICES_BY_LEVEL, plasma: REAR_WEAPON_PRICES_BY_LEVEL,
};

export function rearWeaponSpecAtLevel(kind: RearWeaponKind, level: number): WeaponSpec {
  const base = REAR_WEAPON_BASE[kind];
  const t = level - 1;
  const extraTargets =
    kind === 'grenade' && level >= 3 ? 1 :
    kind === 'cluster' && level >= 5 ? 1 : 0;
  return {
    id: `${kind}-${String(level)}`,
    kind,
    damagePerShot: Math.round(base.damage * Math.pow(1.22, t) * 10) / 10,
    ticksBetweenShots: Math.max(2, Math.round(base.ticks * Math.pow(0.91, t))),
    energyPerShot: Math.round(base.energy * Math.pow(1.15, t) * 10) / 10,
    maxTargets: base.targets + extraTargets,
    falloffPerTarget: base.falloff,
    critChance: 0,
    missChance: 0,
    critMult: 2.0,
  };
}

function rearWeaponDisplayName(kind: RearWeaponKind, level: number): string {
  return `${REAR_WEAPON_BASE[kind].displayName} Lv${String(level)}`;
}

export function rearWeaponKindDisplayName(kind: RearWeaponKind): string {
  return REAR_WEAPON_BASE[kind].displayName;
}

export const REAR_WEAPON_ITEMS: Record<string, RearWeaponCatalogItem> = Object.fromEntries(
  REAR_WEAPON_KINDS.flatMap((kind) =>
    Array.from({ length: MAX_REAR_WEAPON_LEVEL }, (_, i) => {
      const level = i + 1;
      const id = `${kind}-${String(level)}`;
      return [id, {
        system: 'rear-weapon' as const,
        name: rearWeaponDisplayName(kind, level),
        price: REAR_WEAPON_PRICES[kind][i] ?? 0,
        starsRequired: REAR_WEAPON_STARS[kind][i] ?? 0,
        blurb: REAR_WEAPON_BASE[kind].blurb,
        spec: rearWeaponSpecAtLevel(kind, level),
      }];
    }),
  ),
);

export function rearWeaponSpecById(id: string): WeaponSpec {
  const item = REAR_WEAPON_ITEMS[id];
  if (item === undefined) throw new Error(`Unknown rear weapon "${id}"`);
  return item.spec;
}

// ---------- Side weapon system ----------
// Manual-fire, limited-ammo (§5): the player taps a button to consume one charge for
// an immediate burst. Charges refill to maxCharges every mission — never auto-fire,
// never drains energy. Kinds span single-target and AOE roles, mirroring the front
// weapon's pulse/scatter/ion/nova spread so the new slot feels consistent with the rest
// of the loadout. See docs/plans/side-weapons.md.

export const SIDE_WEAPON_KINDS: SideWeaponKind[] = ['focus', 'flechette', 'railgun', 'orbital'];
export const MAX_SIDE_WEAPON_LEVEL = 5;

export interface SideWeaponCatalogItem {
  system: 'side-weapon';
  name: string;
  price: number;
  starsRequired?: number;
  blurb: string;
  spec: WeaponSpec;
}

const SIDE_WEAPON_BASE: Record<SideWeaponKind, {
  displayName: string;
  blurb: string;
  damage: number;
  targets: number;
  falloff: number;
  charges: [number, number, number, number, number];
}> = {
  focus:     { displayName: 'Focus Beam',      blurb: 'Charged single-target burst. Reliable starter nuke.',      damage: 40, targets: 1,        falloff: 1.0,  charges: [3, 4, 5, 6, 7] },
  flechette: { displayName: 'Flechette Spread', blurb: 'Manual burst across a front cluster. Anti-swarm opener.', damage: 18, targets: 3,        falloff: 0.75, charges: [3, 4, 5, 6, 7] },
  railgun:   { displayName: 'Railgun',         blurb: 'Devastating single hit. Save it for a blocker or boss.',   damage: 90, targets: 1,        falloff: 1.0,  charges: [2, 2, 3, 3, 4] },
  orbital:   { displayName: 'Orbital Strike',  blurb: 'Calls down damage on every enemy on screen. Rare and huge.', damage: 12, targets: Infinity, falloff: 1.0,  charges: [1, 2, 2, 3, 3] },
};

// Redesigned 2026-07-10 — kinds are situational sidegrades, not a tier ladder; see
// WEAPON_STARS's comment above for the full reasoning. Price reuses focus's own
// already-tuned ladder (8,300 top end, ~15.7x cheaper than the old 130,000
// orbital-only ceiling). Stars are a separate, modest gate — 15 for the ceiling item.

/** Stars required per side weapon level (index = level − 1) — identical across every kind. */
const SIDE_WEAPON_STARS_BY_LEVEL: [number, number, number, number, number] = [0, 2, 4, 8, 15];
const SIDE_WEAPON_STARS: Record<SideWeaponKind, [number, number, number, number, number]> = {
  focus: SIDE_WEAPON_STARS_BY_LEVEL, flechette: SIDE_WEAPON_STARS_BY_LEVEL,
  railgun: SIDE_WEAPON_STARS_BY_LEVEL, orbital: SIDE_WEAPON_STARS_BY_LEVEL,
};

// Coin cost per level (index = level − 1) — identical across every kind. Side weapon
// has a NONE option, so focus level 1 is priced low but never 0, or it would be
// indistinguishable from NONE.
const SIDE_WEAPON_PRICES_BY_LEVEL: [number, number, number, number, number] = [80, 780, 1700, 3750, 8300];
const SIDE_WEAPON_PRICES: Record<SideWeaponKind, [number, number, number, number, number]> = {
  focus: SIDE_WEAPON_PRICES_BY_LEVEL, flechette: SIDE_WEAPON_PRICES_BY_LEVEL,
  railgun: SIDE_WEAPON_PRICES_BY_LEVEL, orbital: SIDE_WEAPON_PRICES_BY_LEVEL,
};

export function sideWeaponSpecAtLevel(kind: SideWeaponKind, level: number): WeaponSpec {
  const base = SIDE_WEAPON_BASE[kind];
  const t = level - 1;
  return {
    id: `${kind}-${String(level)}`,
    kind,
    damagePerShot: Math.round(base.damage * Math.pow(1.22, t) * 10) / 10,
    ticksBetweenShots: 0, // manual-fire has no interval
    energyPerShot: 0, // manual-fire costs a charge, never energy
    maxTargets: base.targets,
    falloffPerTarget: base.falloff,
    critChance: 0,
    missChance: 0,
    critMult: 2.0,
    maxCharges: base.charges[t] ?? base.charges[0],
  };
}

function sideWeaponDisplayName(kind: SideWeaponKind, level: number): string {
  return `${SIDE_WEAPON_BASE[kind].displayName} Lv${String(level)}`;
}

export function sideWeaponKindDisplayName(kind: SideWeaponKind): string {
  return SIDE_WEAPON_BASE[kind].displayName;
}

export const SIDE_WEAPON_ITEMS: Record<string, SideWeaponCatalogItem> = Object.fromEntries(
  SIDE_WEAPON_KINDS.flatMap((kind) =>
    Array.from({ length: MAX_SIDE_WEAPON_LEVEL }, (_, i) => {
      const level = i + 1;
      const id = `${kind}-${String(level)}`;
      return [id, {
        system: 'side-weapon' as const,
        name: sideWeaponDisplayName(kind, level),
        price: SIDE_WEAPON_PRICES[kind][i] ?? 0,
        starsRequired: SIDE_WEAPON_STARS[kind][i] ?? 0,
        blurb: SIDE_WEAPON_BASE[kind].blurb,
        spec: sideWeaponSpecAtLevel(kind, level),
      }];
    }),
  ),
);

export function sideWeaponSpecById(id: string): WeaponSpec {
  const item = SIDE_WEAPON_ITEMS[id];
  if (item === undefined) throw new Error(`Unknown side weapon "${id}"`);
  return item.spec;
}

// ---------- Shield system ----------

export type ShieldKind = 'wall' | 'reflex' | 'bulwark' | 'flux';
export const SHIELD_KINDS: readonly ShieldKind[] = ['wall', 'reflex', 'flux', 'bulwark'];
export const MAX_SHIELD_LEVEL = 5;

const SHIELD_BASE: Record<ShieldKind, {
  displayName: string; blurb: string;
  caps: [number, number, number, number, number];
  fractions: [number, number, number, number, number];
  prices: [number, number, number, number, number];
  stars: [number, number, number, number, number];
// Redesigned 2026-07-10 — kinds are situational sidegrades, not a tier ladder; see
// WEAPON_STARS's comment (in the weapon section above) for the full reasoning. Price
// reuses wall's own already-tuned ladder (8,300 top end, ~15.7x cheaper than the old
// 130,000 bulwark-only ceiling) for every kind; caps/fractions (the actual combat
// stats making each kind situational) are untouched. Stars are a separate, modest
// gate shared with generator/motor/rear-weapon/side-weapon — 15 for the ceiling item.
}> = {
  // Shield has a NONE option, so wall level 1 (mandatory starter) is priced low but never 0,
  // or it would be indistinguishable from NONE.
  wall:    { displayName: 'Wall',    blurb: 'Thick plate — survives hits, slow recharge.',         caps: [ 30,  60, 100, 150, 220], fractions: [0.08, 0.09, 0.10, 0.12, 0.14], prices: [  80,  780,  1700,  3750,  8300], stars: [ 0, 2, 4, 8, 15] },
  reflex:  { displayName: 'Reflex',  blurb: 'Thin plate, instant snap-back. Loves fast pulses.',   caps: [ 15,  22,  30,  40,  55], fractions: [0.35, 0.42, 0.52, 0.62, 0.75], prices: [  80,  780,  1700,  3750,  8300], stars: [ 0, 2, 4, 8, 15] },
  flux:    { displayName: 'Flux',    blurb: 'Balanced cap and pulse rate. Works with anything.',   caps: [ 40,  70, 105, 150, 210], fractions: [0.18, 0.22, 0.26, 0.32, 0.38], prices: [  80,  780,  1700,  3750,  8300], stars: [ 0, 2, 4, 8, 15] },
  bulwark: { displayName: 'Bulwark', blurb: 'Extreme capacity, minimal regen. True tank armour.',  caps: [ 60, 100, 155, 225, 320], fractions: [0.05, 0.06, 0.07, 0.08, 0.10], prices: [  80,  780,  1700,  3750,  8300], stars: [ 0, 2, 4, 8, 15] },
};

export function shieldKindDisplayName(kind: ShieldKind): string { return SHIELD_BASE[kind].displayName; }

export function shieldSpecAtLevel(kind: ShieldKind, level: number): ShieldSpec {
  const base = SHIELD_BASE[kind];
  const i = level - 1;
  return { id: `shield-${kind}-${String(level)}`, capacity: base.caps[i] ?? 30, pulseShieldFraction: base.fractions[i] ?? 0.08 };
}

const SHIELD_ITEMS: Record<string, CatalogItem> = Object.fromEntries(
  SHIELD_KINDS.flatMap((kind) =>
    Array.from({ length: MAX_SHIELD_LEVEL }, (_, i) => {
      const level = i + 1;
      const base = SHIELD_BASE[kind];
      return [`shield-${kind}-${String(level)}`, {
        system: 'shield' as const,
        name: `${base.displayName} Lv${String(level)}`,
        price: base.prices[i] ?? 0,
        starsRequired: base.stars[i] ?? 0,
        blurb: base.blurb,
        spec: shieldSpecAtLevel(kind, level),
      }];
    }),
  ),
);

// ---------- Generator system ----------

export type GeneratorKind = 'torrent' | 'reserve' | 'surge' | 'steady';
export const GENERATOR_KINDS: readonly GeneratorKind[] = ['torrent', 'reserve', 'steady', 'surge'];
export const MAX_GENERATOR_LEVEL = 5;

const GENERATOR_BASE: Record<GeneratorKind, {
  displayName: string; blurb: string;
  outputs: [number, number, number, number, number];
  caps: [number, number, number, number, number];
  drains: [number, number, number, number, number];
  prices: [number, number, number, number, number];
  stars: [number, number, number, number, number];
// Redesigned 2026-07-10 — kinds are situational sidegrades, not a tier ladder; see
// WEAPON_STARS's comment (in the weapon section above) for the full reasoning. Price
// reuses torrent's own already-tuned ladder (8,300 top end, ~15.7x cheaper than the
// old 130,000 surge-only ceiling) for every kind; outputs/caps/drains (the actual
// combat stats making each kind situational) are untouched. Stars share the same
// modest gate as shield/motor/rear-weapon/side-weapon — 15 for the ceiling item.
}> = {
  torrent: { displayName: 'Torrent', blurb: 'High output, small buffer. Feeds fast-cycling weapons.',        outputs: [ 2,  4,  7, 11, 16], caps: [50, 45, 40, 38, 35], drains: [0.50, 0.55, 0.60, 0.65, 0.70], prices: [   0,  780,  1700,  3750,  8300], stars: [ 0, 2, 4, 8, 15] },
  // Blurb rewritten 2026-07-11 (docs/plans/overdrive-and-reserve-trap-fixes.md) — old
  // text ("Charge then unleash") recommended pairing Reserve with expensive-per-shot
  // weapons (ion/nova), but the trough-sampled brownout (energy.ts) punishes exactly
  // that pairing hardest — reserve+nova measured 0.0% clear this session. New text is
  // honest about the actual niche: low-drain weapons and burst-ability/supply synergy
  // with the huge capacity, not "charge up for a big weapon hit."
  // Outputs rebalanced 2026-07-15 (docs/known-issues.md, `pnpm tune`'s "dominant kind"
  // check, flagged on every run this session and never chased) — the 2026-07-11 pass
  // above only fixed the *text*, not the stats: reserve+pulse still cleared m1 at 13%
  // (vs. 87-100% for every other generator) and reserve+scatter cleared m3 at 0.0%,
  // a real trap, not a situational tradeoff. +30% output at every level keeps the
  // "vast tank, slow trickle" identity (still meaningfully behind torrent's output at
  // every level, caps/drains untouched) while turning a near-guaranteed loss into a
  // real but survivable disadvantage — m1 pulse+reserve 13%→73%, m5 scatter+reserve
  // 13%→87.8%. Cases that stayed weak after the buff (e.g. m3+nova, m3+scatter) were
  // confirmed to already be weak *weapon-vs-mission* pairings even with a full-output
  // generator (nova clears m3 at only 18-21% with torrent/steady/surge) — a situational
  // weapon weakness this fix doesn't touch, not a remaining generator trap.
  reserve: { displayName: 'Reserve', blurb: 'Vast tank, slow trickle. Feeds efficient weapons.',             outputs: [1.95, 3.25, 4.55, 6.5, 9.1], caps: [100, 160, 240, 340, 480], drains: [0.28, 0.24, 0.20, 0.17, 0.14], prices: [   0,  780,  1700,  3750,  8300], stars: [ 0, 2, 4, 8, 15] },
  steady:  { displayName: 'Steady',  blurb: 'Reliable mid-range. Pairs well with any loadout.',              outputs: [2.5,  4,  6,  9, 13], caps: [70, 82, 95, 110, 128], drains: [0.38, 0.34, 0.30, 0.26, 0.22], prices: [   0,  780,  1700,  3750,  8300], stars: [ 0, 2, 4, 8, 15] },
  surge:   { displayName: 'Surge',   blurb: 'Maximum output, tiny battery. Ion and nova goldmine.',          outputs: [ 3,  5,  9, 14, 20], caps: [30, 28, 26, 25, 25], drains: [0.72, 0.78, 0.83, 0.88, 0.92], prices: [   0,  780,  1700,  3750,  8300], stars: [ 0, 2, 4, 8, 15] },
};

export function generatorKindDisplayName(kind: GeneratorKind): string { return GENERATOR_BASE[kind].displayName; }

export function generatorSpecAtLevel(kind: GeneratorKind, level: number): GeneratorSpec {
  const base = GENERATOR_BASE[kind];
  const i = level - 1;
  return { id: `generator-${kind}-${String(level)}`, outputPerTick: base.outputs[i] ?? 2, capacity: base.caps[i] ?? 50, pulseDrainFraction: base.drains[i] ?? 0.5 };
}

const GENERATOR_ITEMS: Record<string, CatalogItem> = Object.fromEntries(
  GENERATOR_KINDS.flatMap((kind) =>
    Array.from({ length: MAX_GENERATOR_LEVEL }, (_, i) => {
      const level = i + 1;
      const base = GENERATOR_BASE[kind];
      return [`generator-${kind}-${String(level)}`, {
        system: 'generator' as const,
        name: `${base.displayName} Lv${String(level)}`,
        price: base.prices[i] ?? 0,
        starsRequired: base.stars[i] ?? 0,
        blurb: base.blurb,
        spec: generatorSpecAtLevel(kind, level),
      }];
    }),
  ),
);

// ---------- Motor system ----------

export type MotorKind = 'rush' | 'tactical' | 'sentinel' | 'overdrive';
export const MOTOR_KINDS: readonly MotorKind[] = ['rush', 'sentinel', 'tactical', 'overdrive'];
export const MAX_MOTOR_LEVEL = 5;

const MOTOR_BASE: Record<MotorKind, {
  displayName: string; blurb: string;
  mults: [number, number, number, number, number];
  draws: [number, number, number, number, number];
  prices: [number, number, number, number, number];
  stars: [number, number, number, number, number];
  bonusCards?: [number, number, number, number, number];
  bonusRerolls?: [number, number, number, number, number];
// Redesigned 2026-07-10 — kinds are situational sidegrades, not a tier ladder; see
// WEAPON_STARS's comment (in the weapon section above) for the full reasoning. Price
// reuses rush's own already-tuned ladder (8,300 top end, ~15.7x cheaper than the old
// 130,000 overdrive-only ceiling) for every kind; mults/draws/bonusCards/bonusRerolls
// (the actual combat stats making each kind situational) are untouched. Stars share
// the same modest gate as shield/generator/rear-weapon/side-weapon — 15 for the
// ceiling item (down from tactical/overdrive's old 27/30 starting points).
}> = {
  rush:      { displayName: 'Rush',      blurb: 'Fast timeline, high draw. Time-star goldmine.',                     mults: [1.0, 2.0, 3.0, 4.2, 5.8], draws: [0.30, 1.20, 2.20, 3.80,  6.0], prices: [   0,  780,  1700,  3750,  8300], stars: [ 0, 2, 4, 8, 15] },
  sentinel:  { displayName: 'Sentinel',  blurb: 'Slow timeline — enemies crawl. Very low energy draw.',             mults: [1.0, 0.7, 0.55, 0.45, 0.35], draws: [0.30, 0.08, 0.05, 0.03, 0.01], prices: [   0,  780,  1700,  3750,  8300], stars: [ 0, 2, 4, 8, 15] },
  tactical:  { displayName: 'Tactical',  blurb: 'Normal speed, extra card draws each support call.',                 mults: [1.0, 1.0, 1.1, 1.1, 1.2], draws: [0.30, 0.10, 0.12, 0.15, 0.18], prices: [   0,  780,  1700,  3750,  8300], stars: [ 0, 2, 4, 8, 15], bonusCards: [0, 1, 2, 3, 4], bonusRerolls: [0, 0, 1, 2, 3] },
  overdrive: { displayName: 'Overdrive', blurb: 'Fastest timeline, heaviest draw. Maximum coins/minute for players who can feed it.', mults: [1.0, 2.6, 4.0, 5.6, 7.5], draws: [0.30, 2.00, 3.50, 6.0, 9.0], prices: [   0,  780,  1700,  3750,  8300], stars: [ 0, 2, 4, 8, 15] },
  // Rebalanced 2026-07-11 (docs/plans/overdrive-and-reserve-trap-fixes.md) — old base
  // (mults [3,5,7.5,10.5,14] / draws [3.5,7,12,18,26]) was a free (price 0, stars 0),
  // unmarked trap: its draw exceeded every generator's max output (surge tops out at
  // 20/tick) at every level, so a new player switching for free went from ~90% clear to
  // 0% — permanent brownout lock (2x stretch) plus a shield that never pulses (energy.ts's
  // pulseShield only fires at full capacity). New base gives overdrive Lv1 the same
  // safe stats as rush/sentinel/tactical's own Lv1 (mult 1.0, draw 0.30 — the
  // established "free tap is always safe" pattern), then scales to a real speed/coin
  // premium over rush at every level ≥2 while keeping draws below torrent's output
  // (2/4/7/11/16) at every level, so overdrive is brutal-but-survivable, never
  // mathematically dead. `pnpm tune`'s tuning-report.md flagged the old values via its
  // dominant-kind check (100pp spread, m1-m5) — this fixes that finding.
};

export function motorKindDisplayName(kind: MotorKind): string { return MOTOR_BASE[kind].displayName; }

export function motorSpecAtLevel(kind: MotorKind, level: number): MotorSpec {
  const base = MOTOR_BASE[kind];
  const i = level - 1;
  const spec: MotorSpec = {
    id: `motor-${kind}-${String(level)}`,
    timelineMultiplier: base.mults[i] ?? 1,
    powerDrawPerTick: base.draws[i] ?? 0.3,
  };
  const bonus = base.bonusCards?.[i] ?? 0;
  const rerolls = base.bonusRerolls?.[i] ?? 0;
  if (bonus > 0) spec.bonusCardsPerSupportCall = bonus;
  if (rerolls > 0) spec.bonusRerollsPerMission = rerolls;
  return spec;
}

const MOTOR_ITEMS: Record<string, CatalogItem> = Object.fromEntries(
  MOTOR_KINDS.flatMap((kind) =>
    Array.from({ length: MAX_MOTOR_LEVEL }, (_, i) => {
      const level = i + 1;
      const base = MOTOR_BASE[kind];
      return [`motor-${kind}-${String(level)}`, {
        system: 'motor' as const,
        name: `${base.displayName} Lv${String(level)}`,
        price: base.prices[i] ?? 0,
        starsRequired: base.stars[i] ?? 0,
        blurb: base.blurb,
        spec: motorSpecAtLevel(kind, level),
      }];
    }),
  ),
);

const ITEMS: Record<string, CatalogItem> = {
  ...WEAPON_ITEMS,
  ...SHIELD_ITEMS,
  ...GENERATOR_ITEMS,
  ...MOTOR_ITEMS,
};


export function itemById(id: string): CatalogItem {
  const item = ITEMS[id];
  if (item === undefined) throw new Error(`Unknown shop item "${id}"`);
  return item;
}

export function weaponSpecById(id: string): WeaponSpec {
  const item = itemById(id);
  if (item.system !== 'weapon') throw new Error(`Item "${id}" is not a weapon`);
  return item.spec;
}

export function shieldSpecById(id: string): ShieldSpec {
  const item = itemById(id);
  if (item.system !== 'shield') throw new Error(`Item "${id}" is not a shield`);
  return item.spec;
}

export function generatorSpecById(id: string): GeneratorSpec {
  const item = itemById(id);
  if (item.system !== 'generator') throw new Error(`Item "${id}" is not a generator`);
  return item.spec;
}

export function motorSpecById(id: string): MotorSpec {
  const item = itemById(id);
  if (item.system !== 'motor') throw new Error(`Item "${id}" is not a motor`);
  return item.spec;
}

// ---------- Reserve supplies (§3.7): permanent purchase, charges refill every mission ----------

export interface SupplyCatalogEntry {
  spec: SupplySpec;
  pricePerCharge: number;
}

export const SUPPLIES: Record<string, SupplyCatalogEntry> = {
  'sup-shield': {
    pricePerCharge: 120,
    spec: {
      id: 'sup-shield', name: 'SHIELD BOOST', description: 'Instantly restore 20 shield',
      kind: 'shield-restore', magnitude: 20, durationTicks: 0, maxCharges: 3,
    },
  },
  'sup-energy': {
    pricePerCharge: 150,
    spec: {
      id: 'sup-energy', name: 'ENERGY FLUSH', description: 'Instantly refill energy',
      kind: 'energy-refill', magnitude: 0, durationTicks: 0, maxCharges: 2,
    },
  },
  'sup-damage': {
    pricePerCharge: 200,
    spec: {
      id: 'sup-damage', name: 'RAGE PROTOCOL', description: 'Double damage for 5 s',
      kind: 'damage-boost', magnitude: 2, durationTicks: 50, maxCharges: 2,
    },
  },
};

export function supplyById(id: string): SupplyCatalogEntry {
  const entry = SUPPLIES[id];
  if (entry === undefined) throw new Error(`Unknown supply "${id}"`);
  return entry;
}

// ---------- Ships ----------

export type ShipKind = 'interceptor' | 'salvager' | 'reactor' | 'tanker' | 'warship';
export const SHIP_KINDS: readonly ShipKind[] = ['interceptor', 'salvager', 'reactor', 'tanker', 'warship'] as const;
export const MAX_SHIP_LEVEL = 5;

export const DEFAULT_SHIP_ID = 'ship-interceptor-1';

/** Flavor line shown in the shop detail panel — one per kind, shared by every level. */
const SHIP_BLURBS: Record<ShipKind, string> = {
  interceptor: 'Nimble scout hull, cheap and hard to hit.',
  salvager: 'Cargo hauler that skims extra coin from kills.',
  reactor: 'Overbuilt core feeding your generator hard.',
  tanker: 'Armored hauler that shrugs off collisions.',
  warship: 'Stripped gunship built around one big gun.',
};

// Redesigned 2026-07-10 — kinds are situational sidegrades, not a tier ladder; see
// WEAPON_STARS's comment above for the full reasoning. Price reuses interceptor's own
// already-tuned ladder (4,500 top end, ~38.9x cheaper than the old 175,000
// warship-only ceiling) for every kind; hull and each kind's passive (the actual
// combat stats making each kind situational) are untouched. Stars reuse weapon's
// "premium" ladder (0/3/8/16/26), since ship and weapon were the two systems anchored
// to the old 175,000 ceiling.
export const SHIPS: Record<string, ShipSpec> = {
  'ship-interceptor-1': { id: 'ship-interceptor-1', kind: 'interceptor', level: 1, name: 'Interceptor', hull: 80,  price: 0,    starsRequired: 0, passiveKind: 'enemy-miss-bonus',        passiveValue: 0.10, passiveDescription: 'Enemies miss +10% more often', blurb: SHIP_BLURBS.interceptor },
  'ship-interceptor-2': { id: 'ship-interceptor-2', kind: 'interceptor', level: 2, name: 'Interceptor', hull: 96,  price: 420,  starsRequired: 3, passiveKind: 'enemy-miss-bonus',        passiveValue: 0.12, passiveDescription: 'Enemies miss +12% more often', blurb: SHIP_BLURBS.interceptor },
  'ship-interceptor-3': { id: 'ship-interceptor-3', kind: 'interceptor', level: 3, name: 'Interceptor', hull: 115, price: 930,  starsRequired: 8, passiveKind: 'enemy-miss-bonus',        passiveValue: 0.15, passiveDescription: 'Enemies miss +15% more often', blurb: SHIP_BLURBS.interceptor },
  'ship-interceptor-4': { id: 'ship-interceptor-4', kind: 'interceptor', level: 4, name: 'Interceptor', hull: 140, price: 2050, starsRequired: 16, passiveKind: 'enemy-miss-bonus',        passiveValue: 0.18, passiveDescription: 'Enemies miss +18% more often', blurb: SHIP_BLURBS.interceptor },
  'ship-interceptor-5': { id: 'ship-interceptor-5', kind: 'interceptor', level: 5, name: 'Interceptor', hull: 170, price: 4500, starsRequired: 26, passiveKind: 'enemy-miss-bonus',        passiveValue: 0.22, passiveDescription: 'Enemies miss +22% more often', blurb: SHIP_BLURBS.interceptor },

  'ship-salvager-1': { id: 'ship-salvager-1', kind: 'salvager', level: 1, name: 'Salvager', hull: 100, price: 0,    starsRequired: 0,  passiveKind: 'coin-bonus', passiveValue: 1.5, passiveDescription: '+50% coins from kills', blurb: SHIP_BLURBS.salvager },
  'ship-salvager-2': { id: 'ship-salvager-2', kind: 'salvager', level: 2, name: 'Salvager', hull: 120, price: 420,  starsRequired: 3,  passiveKind: 'coin-bonus', passiveValue: 1.7, passiveDescription: '+70% coins from kills', blurb: SHIP_BLURBS.salvager },
  'ship-salvager-3': { id: 'ship-salvager-3', kind: 'salvager', level: 3, name: 'Salvager', hull: 145, price: 930,  starsRequired: 8,  passiveKind: 'coin-bonus', passiveValue: 2.0, passiveDescription: '+100% coins from kills', blurb: SHIP_BLURBS.salvager },
  'ship-salvager-4': { id: 'ship-salvager-4', kind: 'salvager', level: 4, name: 'Salvager', hull: 175, price: 2050, starsRequired: 16, passiveKind: 'coin-bonus', passiveValue: 2.4, passiveDescription: '+140% coins from kills', blurb: SHIP_BLURBS.salvager },
  'ship-salvager-5': { id: 'ship-salvager-5', kind: 'salvager', level: 5, name: 'Salvager', hull: 215, price: 4500, starsRequired: 26, passiveKind: 'coin-bonus', passiveValue: 3.0, passiveDescription: '+200% coins from kills', blurb: SHIP_BLURBS.salvager },

  'ship-reactor-1': { id: 'ship-reactor-1', kind: 'reactor', level: 1, name: 'Reactor', hull: 90,  price: 0,    starsRequired: 0, passiveKind: 'generator-capacity-bonus', passiveValue: 1.5, passiveDescription: 'Generator capacity +50%', blurb: SHIP_BLURBS.reactor },
  'ship-reactor-2': { id: 'ship-reactor-2', kind: 'reactor', level: 2, name: 'Reactor', hull: 108, price: 420,  starsRequired: 3, passiveKind: 'generator-capacity-bonus', passiveValue: 1.7, passiveDescription: 'Generator capacity +70%', blurb: SHIP_BLURBS.reactor },
  'ship-reactor-3': { id: 'ship-reactor-3', kind: 'reactor', level: 3, name: 'Reactor', hull: 130, price: 930,  starsRequired: 8, passiveKind: 'generator-capacity-bonus', passiveValue: 2.0, passiveDescription: 'Generator capacity +100%', blurb: SHIP_BLURBS.reactor },
  'ship-reactor-4': { id: 'ship-reactor-4', kind: 'reactor', level: 4, name: 'Reactor', hull: 157, price: 2050, starsRequired: 16, passiveKind: 'generator-capacity-bonus', passiveValue: 2.4, passiveDescription: 'Generator capacity +140%', blurb: SHIP_BLURBS.reactor },
  'ship-reactor-5': { id: 'ship-reactor-5', kind: 'reactor', level: 5, name: 'Reactor', hull: 190, price: 4500, starsRequired: 26, passiveKind: 'generator-capacity-bonus', passiveValue: 3.0, passiveDescription: 'Generator capacity +200%', blurb: SHIP_BLURBS.reactor },

  'ship-tanker-1': { id: 'ship-tanker-1', kind: 'tanker', level: 1, name: 'Tanker', hull: 150, price: 0,    starsRequired: 0, passiveKind: 'collision-reduction', passiveValue: 0.50, passiveDescription: 'Collision damage −50%', blurb: SHIP_BLURBS.tanker },
  'ship-tanker-2': { id: 'ship-tanker-2', kind: 'tanker', level: 2, name: 'Tanker', hull: 180, price: 420,  starsRequired: 3, passiveKind: 'collision-reduction', passiveValue: 0.60, passiveDescription: 'Collision damage −60%', blurb: SHIP_BLURBS.tanker },
  'ship-tanker-3': { id: 'ship-tanker-3', kind: 'tanker', level: 3, name: 'Tanker', hull: 218, price: 930,  starsRequired: 8, passiveKind: 'collision-reduction', passiveValue: 0.70, passiveDescription: 'Collision damage −70%', blurb: SHIP_BLURBS.tanker },
  'ship-tanker-4': { id: 'ship-tanker-4', kind: 'tanker', level: 4, name: 'Tanker', hull: 264, price: 2050, starsRequired: 16, passiveKind: 'collision-reduction', passiveValue: 0.80, passiveDescription: 'Collision damage −80%', blurb: SHIP_BLURBS.tanker },
  'ship-tanker-5': { id: 'ship-tanker-5', kind: 'tanker', level: 5, name: 'Tanker', hull: 320, price: 4500, starsRequired: 26, passiveKind: 'collision-reduction', passiveValue: 0.90, passiveDescription: 'Collision damage −90%', blurb: SHIP_BLURBS.tanker },

  'ship-warship-1': { id: 'ship-warship-1', kind: 'warship', level: 1, name: 'Warship', hull: 110, price: 0,    starsRequired: 0, passiveKind: 'crit-mult-override', passiveValue: 3.0, passiveDescription: 'Crits deal ×3 instead of ×2', blurb: SHIP_BLURBS.warship },
  'ship-warship-2': { id: 'ship-warship-2', kind: 'warship', level: 2, name: 'Warship', hull: 132, price: 420,  starsRequired: 3, passiveKind: 'crit-mult-override', passiveValue: 3.5, passiveDescription: 'Crits deal ×3.5 instead of ×2', blurb: SHIP_BLURBS.warship },
  'ship-warship-3': { id: 'ship-warship-3', kind: 'warship', level: 3, name: 'Warship', hull: 159, price: 930,  starsRequired: 8, passiveKind: 'crit-mult-override', passiveValue: 4.0, passiveDescription: 'Crits deal ×4 instead of ×2', blurb: SHIP_BLURBS.warship },
  'ship-warship-4': { id: 'ship-warship-4', kind: 'warship', level: 4, name: 'Warship', hull: 191, price: 2050, starsRequired: 16, passiveKind: 'crit-mult-override', passiveValue: 5.0, passiveDescription: 'Crits deal ×5 instead of ×2', blurb: SHIP_BLURBS.warship },
  'ship-warship-5': { id: 'ship-warship-5', kind: 'warship', level: 5, name: 'Warship', hull: 230, price: 4500, starsRequired: 26, passiveKind: 'crit-mult-override', passiveValue: 6.0, passiveDescription: 'Crits deal ×6 instead of ×2', blurb: SHIP_BLURBS.warship },
};

export function shipById(id: string): ShipSpec {
  const ship = SHIPS[id];
  if (ship === undefined) throw new Error(`Unknown ship "${id}"`);
  return ship;
}

export function shipKindDisplayName(kind: ShipKind): string {
  return SHIPS[`ship-${kind}-1`]?.name ?? kind;
}
