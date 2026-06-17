// Mulberry32 seeded PRNG — copied verbatim from phaser/src/utils/rng.ts per V2_HANDOFF.md §9.
// All randomness in the core flows through this; Math.random() is forbidden (ESLint-enforced).

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
