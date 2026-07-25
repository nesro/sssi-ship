/**
 * Procedural SFX voices — pure, Phaser-free, data-driven. Each entry in SFX_SPECS
 * describes one sound: its length, seed, default playback gain, and a set of named numeric
 * params (with slider ranges) that its `fill` reads. `src/audio/synth.ts` renders these
 * into Phaser's audio cache for the game; `dev/soundboard.ts` renders them live so the
 * params can be auditioned and tuned. Music is NOT here — it's a licensed track loaded
 * from a file (see BootScene / SoundManager).
 *
 * No `Math.random` (ESLint-enforced, and it would make noise vary run-to-run): a seeded
 * Mulberry32 PRNG drives every noise burst.
 */

/** Seeded Mulberry32 — one instance per render so noise is stable across launches. */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Wave = 'sine' | 'square' | 'saw';
type Params = Record<string, number>;

/** −1..1 waveform at accumulated phase `ph` (radians). */
function osc(kind: Wave, ph: number): number {
  if (kind === 'sine') return Math.sin(ph);
  if (kind === 'square') return Math.sin(ph) >= 0 ? 1 : -1;
  const frac = (ph / (Math.PI * 2)) % 1; // saw
  return frac * 2 - 1;
}

/** Short attack ramp (declick) × exponential decay. */
function pluck(t: number, attack: number, decay: number): number {
  const a = t < attack ? t / attack : 1;
  return a * Math.exp(-t * decay);
}

const clamp = (v: number): number => Math.max(-1, Math.min(1, v));

/** A downward-swept "pew": pitch drops fast, quick decay, a touch of noise for grit. */
function fillLaser(wave: Wave): Fill {
  return (data, sr, p, rng) => {
    let ph = 0;
    for (let i = 0; i < data.length; i++) {
      const t = i / sr;
      const f = (p.base ?? 880) * (0.28 + 0.72 * Math.exp(-t * 20));
      ph += (Math.PI * 2 * f) / sr;
      const tone = osc(wave, ph) * 0.5;
      const grit = (rng() * 2 - 1) * (p.noise ?? 0.18) * Math.exp(-t * 55);
      const click = (rng() * 2 - 1) * (p.click ?? 0.3) * Math.exp(-t * 400);
      data[i] = clamp((tone + grit + click) * pluck(t, 0.002, p.decay ?? 24));
    }
  };
}

/** A metallic bell: three inharmonic sine partials with independent decays. */
const fillDing: Fill = (data, sr, p) => {
  const base = p.base ?? 680;
  const ring = p.ring ?? 1;
  const partials = [{ mul: 1, amp: 1.0, decay: 6 }, { mul: 2.76, amp: 0.5, decay: 9 }, { mul: 5.4, amp: 0.25, decay: 14 }];
  for (let i = 0; i < data.length; i++) {
    const t = i / sr;
    let s = 0;
    for (const q of partials) s += Math.sin(Math.PI * 2 * base * q.mul * t) * q.amp * Math.exp((-t * q.decay) / ring);
    data[i] = clamp(s * 0.4 * (t < 0.003 ? t / 0.003 : 1));
  }
};

/** A soft, airy UI tick — a gentle sine blip with a sub-octave for body and an eased
 * attack/decay, so a button tap reads as a quiet "space" blip, not a sharp click. */
const fillUiClick: Fill = (data, sr, p) => {
  const freq = p.freq ?? 720;
  const decay = p.decay ?? 55;
  for (let i = 0; i < data.length; i++) {
    const t = i / sr;
    const env = (t < 0.004 ? t / 0.004 : 1) * Math.exp(-t * decay);
    const s = Math.sin(Math.PI * 2 * freq * t) * 0.5 + Math.sin(Math.PI * freq * t) * 0.2;
    data[i] = clamp(s * env * 0.6);
  }
};

/** A rocket whoosh: low pitch-swept rumble under one-pole-filtered noise. */
const fillRocket: Fill = (data, sr, p, rng) => {
  let lp = 0;
  const decay = p.decay ?? 5.5;
  for (let i = 0; i < data.length; i++) {
    const t = i / sr;
    const rumbleF = (p.rumble ?? 40) + 170 * Math.exp(-t * 3.2);
    const rumble = Math.sin(Math.PI * 2 * rumbleF * t) * 0.55;
    const cutoff = 0.05 + 0.5 * Math.exp(-t * 4);
    lp += (rng() * 2 - 1 - lp) * cutoff;
    data[i] = clamp((rumble + lp * 0.7) * pluck(t, 0.01, decay) * 0.9);
  }
};

/** A short, snappy kill pop: a bright noise burst that darkens fast, over a downward thump. */
const fillExplosion: Fill = (data, sr, p, rng) => {
  let lp = 0;
  const decay = p.decay ?? 13;
  for (let i = 0; i < data.length; i++) {
    const t = i / sr;
    lp += (rng() * 2 - 1 - lp) * (0.05 + 0.6 * Math.exp(-t * 10));
    const thump = Math.sin(Math.PI * 2 * ((p.tone ?? 120) + 300 * Math.exp(-t * 20)) * t) * 0.4;
    data[i] = clamp((lp * 0.9 + thump) * pluck(t, 0.002, decay) * 0.82);
  }
};

/** Hull-collision impact: a heavy low thud with a short noisy crunch — a real body blow. */
const fillImpact: Fill = (data, sr, p, rng) => {
  let lp = 0;
  const decay = p.decay ?? 8;
  for (let i = 0; i < data.length; i++) {
    const t = i / sr;
    const body = Math.sin(Math.PI * 2 * ((p.base ?? 70) + 130 * Math.exp(-t * 18)) * t) * 0.6;
    lp += (rng() * 2 - 1 - lp) * (0.08 + 0.4 * Math.exp(-t * 22));
    data[i] = clamp((body + lp * 0.5 * Math.exp(-t * 30)) * pluck(t, 0.001, decay) * 0.9);
  }
};

/** Bell partials (fundamental + inharmonic overtone) struck at local time `lt`. */
function bellVoice(lt: number, f: number): number {
  if (lt < 0) return 0;
  const attack = lt < 0.003 ? lt / 0.003 : 1;
  return attack * (Math.sin(Math.PI * 2 * f * lt) * Math.exp(-lt * 4) + 0.4 * Math.sin(Math.PI * 2 * 2.76 * f * lt) * Math.exp(-lt * 7));
}

/** Victory jingle: a rising C-major arpeggio resolving into a sustained triad. */
const fillVictory: Fill = (data, sr, p) => {
  const notes = [523.3, 659.3, 784, 1046.5];
  const step = p.step ?? 0.13;
  const chordStart = notes.length * step;
  for (let i = 0; i < data.length; i++) {
    const t = i / sr;
    let s = 0;
    for (let n = 0; n < notes.length; n++) s += bellVoice(t - n * step, notes[n] ?? 523.3);
    for (const f of notes) s += bellVoice(t - chordStart, f) * 0.6;
    data[i] = clamp(s * 0.26);
  }
};

/** Shield-pulse shimmer: a soft, airy upward swell with a faint octave partial and an eased
 * attack — a gentle "space" surge, not a chirpy bell (it plays repeatedly as the shield
 * recharges, so it must stay unobtrusive). */
const fillShimmer: Fill = (data, sr, p) => {
  let ph = 0;
  const decay = p.decay ?? 5;
  for (let i = 0; i < data.length; i++) {
    const t = i / sr;
    const f = (p.startF ?? 380) + (p.span ?? 500) * (1 - Math.exp(-t * 6));
    ph += (Math.PI * 2 * f) / sr;
    const air = Math.sin(ph) * 0.4 + Math.sin(ph * 2.01) * 0.12;
    const env = (t < 0.03 ? t / 0.03 : 1) * Math.exp(-t * decay);
    data[i] = clamp(air * env * 0.7);
  }
};

/** Boss-arrival alarm: a throbbing low drone under a slowly rising tension sweep. */
const fillBossAlarm: Fill = (data, sr, p) => {
  const droneF = p.droneF ?? 110;
  const throbHz = p.throbHz ?? 4;
  const decay = p.decay ?? 1.2;
  for (let i = 0; i < data.length; i++) {
    const t = i / sr;
    const drone = Math.sin(Math.PI * 2 * droneF * t) * 0.32 + Math.sin(Math.PI * 2 * droneF * 2.51 * t) * 0.1;
    const throb = 0.5 + 0.5 * Math.sin(Math.PI * 2 * throbHz * t);
    const rise = Math.sin(Math.PI * 2 * (200 + 320 * Math.min(1, t / 0.8)) * t) * 0.09;
    data[i] = clamp((drone * throb + rise) * (t < 0.02 ? t / 0.02 : 1) * Math.exp(-t * decay));
  }
};

type Fill = (data: Float32Array, sr: number, p: Params, rng: () => number) => void;
interface ParamMeta { min: number; max: number; step: number; }
export interface SoundSpec {
  key: string;
  seconds: number;
  seed: number;
  gain: number;
  params: Params;
  meta: Record<string, ParamMeta>;
  fill: Fill;
}

const F = (min: number, max: number, step: number): ParamMeta => ({ min, max, step });

/** Every game SFX, in play order. Keys match AUDIO in SoundManager.ts. */
export const SFX_SPECS: SoundSpec[] = [
  { key: 'laser1', seconds: 0.22, seed: 1, gain: 0.35, fill: fillLaser('square'),
    params: { base: 880, noise: 0.18, click: 0.12, decay: 24 }, meta: { base: F(200, 2000, 10), noise: F(0, 0.6, 0.01), click: F(0, 0.6, 0.01), decay: F(6, 60, 1) } },
  { key: 'laser2', seconds: 0.20, seed: 2, gain: 0.35, fill: fillLaser('saw'),
    params: { base: 990, noise: 0.12, click: 0.12, decay: 24 }, meta: { base: F(200, 2000, 10), noise: F(0, 0.6, 0.01), click: F(0, 0.6, 0.01), decay: F(6, 60, 1) } },
  { key: 'laser3', seconds: 0.24, seed: 3, gain: 0.45, fill: fillLaser('square'),
    params: { base: 760, noise: 0.26, click: 0.12, decay: 24 }, meta: { base: F(200, 2000, 10), noise: F(0, 0.6, 0.01), click: F(0, 0.6, 0.01), decay: F(6, 60, 1) } },
  { key: 'ui-click', seconds: 0.08, seed: 4, gain: 0.12, fill: fillUiClick,
    params: { freq: 2000, decay: 55 }, meta: { freq: F(300, 2000, 10), decay: F(20, 200, 1) } },
  { key: 'ding', seconds: 0.6, seed: 4, gain: 0.5, fill: fillDing,
    params: { base: 680, ring: 1 }, meta: { base: F(200, 1600, 5), ring: F(0.4, 3, 0.05) } },
  { key: 'explosion', seconds: 0.35, seed: 5, gain: 1.1, fill: fillExplosion,
    params: { tone: 40, decay: 4 }, meta: { tone: F(40, 400, 2), decay: F(4, 40, 0.5) } },
  { key: 'impact', seconds: 0.5, seed: 13, gain: 0.85, fill: fillImpact,
    params: { base: 70, decay: 8 }, meta: { base: F(30, 200, 1), decay: F(3, 30, 0.5) } },
  { key: 'victory', seconds: 1.5, seed: 6, gain: 1, fill: fillVictory,
    params: { step: 0.13 }, meta: { step: F(0.06, 0.3, 0.005) } },
  { key: 'shimmer', seconds: 0.5, seed: 7, gain: 0.25, fill: fillShimmer,
    params: { startF: 380, span: 500, decay: 5 }, meta: { startF: F(200, 1200, 10), span: F(100, 2000, 10), decay: F(2, 20, 0.5) } },
  { key: 'boss-alarm', seconds: 0.9, seed: 8, gain: 0.7, fill: fillBossAlarm,
    params: { droneF: 110, throbHz: 4, decay: 1.2 }, meta: { droneF: F(50, 300, 2), throbHz: F(1, 12, 0.5), decay: F(0.4, 4, 0.1) } },
  { key: 'rocket', seconds: 0.7, seed: 7, gain: 0.8, fill: fillRocket,
    params: { rumble: 40, decay: 5.5 }, meta: { rumble: F(20, 200, 2), decay: F(2, 14, 0.5) } },
];

/** Fills a fresh mono Float32Array for a spec at `sampleRate` using the given params. */
export function renderSpec(spec: SoundSpec, sampleRate: number, params: Params = spec.params): Float32Array {
  const length = Math.max(1, Math.ceil(spec.seconds * sampleRate));
  const data = new Float32Array(length);
  spec.fill(data, sampleRate, params, makeRng(spec.seed));
  return data;
}
