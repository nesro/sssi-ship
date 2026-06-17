// System-coded palette (V2_HANDOFF.md §4.3): HUD stats color-match the ship part they describe.

export const PALETTE = {
  weaponCyan: 0x00ffee,
  shieldBlue: 0x3388ff,
  generatorAmber: 0xffaa22,
  motorMagenta: 0xff44cc,
  enemyRed: 0xff3344,
  enemyOrange: 0xff8833,
  hullWhite: 0xe8e8f0,
  backgroundNearBlack: 0x04040a,
} as const;

/** Per-weapon colours — each kind has a distinct hue so players learn the visual language. */
export const WEAPON_PALETTE = {
  pulse1: 0x00eeff,     // cyan (starter)
  pulse2: 0xaaffff,     // white-hot cyan (upgraded)
  ion: 0x9933ff,        // violet/purple
  scatter1: 0x33ff88,   // green
  scatter2: 0x99ff44,   // lime
  nova1: 0xffcc44,      // orange-gold
  nova2: 0xffeeaa,      // white-gold
} as const;

/** CSS string form for Phaser text styles. */
export function cssColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
