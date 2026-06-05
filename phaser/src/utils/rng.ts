// utils/rng.ts
// Mulberry32 seeded PRNG + UTC date helpers.
// Zero Phaser dependencies — safe to import from tools/ as well.

/** Mulberry32: fast, seedable, statistically good. Returns a function in [0, 1). */
export function mulberry32(seed: number): () => number {
  let s = seed;
  return function () {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** Today's UTC date as an integer, e.g. 20260605. Used as a daily wave seed. */
export function utcDateInt(): number {
  const d = new Date();
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

/** Today's UTC date as "YYYY-MM-DD". Used for save record comparison. */
export function utcDateString(): string {
  const d  = new Date();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
}
