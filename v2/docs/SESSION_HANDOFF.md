# Session handoff — audio + visuals rework (apply to latest `v2/`)

This documents **every change made in a working session that started from a possibly-stale
`v2/` tree**. Re-apply these against the real latest version. Nothing here touches
`src/core/` — it's all view/audio/dev-tooling, so it can't affect the deterministic
simulation, balance, replays, or tests. Paths are relative to `v2/`.

Two constraints that shaped everything (keep them):
- **`src/core/` stays pure** — no Phaser/DOM/`Math.random`. All new randomness uses a local
  seeded Mulberry32 PRNG (audio) or `crypto.getRandomValues` (starfield, cosmetic only).
- **Neon look**: procedural textures via multi-pass baked glow + `ADD` blend over near-black.
  Enemy/ship texture **dimensions must not change** (combat couples `ENEMY_VISUAL_RADIUS` /
  ship gun-mount offsets to baked sizes) — only *internal detail* was enriched.

---

## PART A — AUDIO SYSTEM (how sound is now handled)

### Model
- **All SFX are synthesised at runtime** into Phaser's audio cache at boot — the audible
  counterpart to the procedural textures. No SFX files.
- **Music is the ONE licensed audio file** ("Swim below as Leviathans" by Fireproof Babies,
  CC BY — attribution required in Credits). Loaded from `public/audio/music-main.mp3`.
- SFX synthesis lives in a **pure, Phaser-free, data-driven** module (`synthVoices.ts`) so the
  same specs feed both the game and the dev soundboard. Each voice is a `fill(data, sr, params, rng)`
  that writes a mono Float32 buffer; `SFX_SPECS` lists every sound with tunable params + slider ranges.

### Event → sound map (SoundManager methods, current tuned values)
| Event | method | key | volume (×`SFX_VOLUME`=0.5) | detune (cents) |
|---|---|---|---|---|
| Front weapon fired | `fire(kind)` | rotates laser1/2/3 | `0.7 × WEAPON_SFX[kind].vol` | `WEAPON_SFX[kind].detune` |
| Rear weapon fired | `rearFire(kind)` | rotates laser1/2/3 | `REAR_SFX[kind].vol` | `REAR_SFX[kind].detune` |
| Side weapon fired | `sideWeaponFire(kind)` | laser3 | `SIDE_SFX[kind].vol` | `SIDE_SFX[kind].detune` |
| Enemy killed | `kill()` | explosion | `1.1` | **`-1200`** (deep boom) |
| Shield recharged | `shieldPulse()` | shimmer | `0.22` | 0 (throttled — see below) |
| Boss appears | `bossAppear()` | boss-alarm | `0.7` | 0 |
| Hull collision | `collision()` | impact | `0.85` | 0 |
| Card picked | `select()` | ding | `0.5` | 0 |
| **UI button tap** | `uiClick()` | ui-click | `0.18` | 0 |
| Reserve boost | `boost()` | rocket | `0.8` | 0 |
| Mission cleared | `victory()` | victory | `1.0` | 0 |

Per-kind character maps (in `SoundManager.ts`):
```ts
const WEAPON_SFX = { pulse:{detune:0,vol:1}, ion:{detune:-350,vol:1.1}, scatter:{detune:250,vol:0.8}, nova:{detune:-550,vol:1.15}, y2010:{detune:450,vol:0.9} };
const REAR_SFX   = { grenade:{detune:-700,vol:0.8}, flak:{detune:-200,vol:0.6}, plasma:{detune:-500,vol:0.75}, arc:{detune:-100,vol:0.6}, cluster:{detune:-400,vol:0.7} };
const SIDE_SFX   = { focus:{detune:300,vol:0.9}, flechette:{detune:150,vol:0.7}, railgun:{detune:-200,vol:1.0}, orbital:{detune:-400,vol:0.9} };
```

### Wiring in CombatScene (call sites)
```ts
if (shotsFired > 0)      Sound.fire(this.core.loadout.weapon?.kind);
if (rearShotsFired > 0)  Sound.rearFire(this.core.loadout.rearWeapon?.kind);
if (this.core.stats.kills > before.kills) Sound.kill();
// boss appears (once): Sound.bossAppear();
// hull collision:       Sound.collision();
// side weapon tap:       Sound.sideWeaponFire(sideWeapon.kind);
// card picked:           Sound.select();
// SHIELD RECHARGE — THROTTLED so it isn't a constant shimmer:
if (this.core.ship.shield > before.shield + 0.5) {
  if (this.time.now - this.lastShieldSoundMs > SHIELD_SOUND_MIN_MS) { // SHIELD_SOUND_MIN_MS = 1400
    Sound.shieldPulse();
    this.lastShieldSoundMs = this.time.now;
  }
  this.shieldPulseRings.push({ radius: px(28), alpha: 0.75 }); // ring visual NOT throttled
}
```
Add field `private lastShieldSoundMs = -9999;` and module const `const SHIELD_SOUND_MIN_MS = 1400;`.

UI clicks — one central wiring in `widgets.ts` `addTextButton`:
```ts
text.on('pointerdown', () => { Sound.uiClick(); options.onClick(); });
```

### NEW FILE — `src/audio/synthVoices.ts` (pure SFX synth; drop in verbatim)
```ts
/**
 * Procedural SFX voices — pure, Phaser-free, data-driven. Each entry in SFX_SPECS
 * describes one sound: length, seed, default playback gain, and named numeric params
 * (with slider ranges) its `fill` reads. synth.ts renders these into Phaser's cache;
 * dev/soundboard.ts renders them live for tuning. Music is NOT here (licensed file).
 * No Math.random — a seeded Mulberry32 drives every noise burst.
 */
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
function osc(kind: Wave, ph: number): number {
  if (kind === 'sine') return Math.sin(ph);
  if (kind === 'square') return Math.sin(ph) >= 0 ? 1 : -1;
  const frac = (ph / (Math.PI * 2)) % 1;
  return frac * 2 - 1;
}
function pluck(t: number, attack: number, decay: number): number {
  const a = t < attack ? t / attack : 1;
  return a * Math.exp(-t * decay);
}
const clamp = (v: number): number => Math.max(-1, Math.min(1, v));

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
const fillDing: Fill = (data, sr, p) => {
  const base = p.base ?? 680; const ring = p.ring ?? 1;
  const partials = [{ mul: 1, amp: 1.0, decay: 6 }, { mul: 2.76, amp: 0.5, decay: 9 }, { mul: 5.4, amp: 0.25, decay: 14 }];
  for (let i = 0; i < data.length; i++) {
    const t = i / sr; let s = 0;
    for (const q of partials) s += Math.sin(Math.PI * 2 * base * q.mul * t) * q.amp * Math.exp((-t * q.decay) / ring);
    data[i] = clamp(s * 0.4 * (t < 0.003 ? t / 0.003 : 1));
  }
};
const fillUiClick: Fill = (data, sr, p) => {
  const freq = p.freq ?? 720; const decay = p.decay ?? 55;
  for (let i = 0; i < data.length; i++) {
    const t = i / sr;
    const env = (t < 0.004 ? t / 0.004 : 1) * Math.exp(-t * decay);
    const s = Math.sin(Math.PI * 2 * freq * t) * 0.5 + Math.sin(Math.PI * freq * t) * 0.2;
    data[i] = clamp(s * env * 0.6);
  }
};
const fillRocket: Fill = (data, sr, p, rng) => {
  let lp = 0; const decay = p.decay ?? 5.5;
  for (let i = 0; i < data.length; i++) {
    const t = i / sr;
    const rumbleF = (p.rumble ?? 40) + 170 * Math.exp(-t * 3.2);
    const rumble = Math.sin(Math.PI * 2 * rumbleF * t) * 0.55;
    lp += (rng() * 2 - 1 - lp) * (0.05 + 0.5 * Math.exp(-t * 4));
    data[i] = clamp((rumble + lp * 0.7) * pluck(t, 0.01, decay) * 0.9);
  }
};
const fillExplosion: Fill = (data, sr, p, rng) => {
  let lp = 0; const decay = p.decay ?? 13;
  for (let i = 0; i < data.length; i++) {
    const t = i / sr;
    lp += (rng() * 2 - 1 - lp) * (0.05 + 0.6 * Math.exp(-t * 10));
    const thump = Math.sin(Math.PI * 2 * ((p.tone ?? 120) + 300 * Math.exp(-t * 20)) * t) * 0.4;
    data[i] = clamp((lp * 0.9 + thump) * pluck(t, 0.002, decay) * 0.82);
  }
};
const fillImpact: Fill = (data, sr, p, rng) => {
  let lp = 0; const decay = p.decay ?? 8;
  for (let i = 0; i < data.length; i++) {
    const t = i / sr;
    const body = Math.sin(Math.PI * 2 * ((p.base ?? 70) + 130 * Math.exp(-t * 18)) * t) * 0.6;
    lp += (rng() * 2 - 1 - lp) * (0.08 + 0.4 * Math.exp(-t * 22));
    data[i] = clamp((body + lp * 0.5 * Math.exp(-t * 30)) * pluck(t, 0.001, decay) * 0.9);
  }
};
function bellVoice(lt: number, f: number): number {
  if (lt < 0) return 0;
  const attack = lt < 0.003 ? lt / 0.003 : 1;
  return attack * (Math.sin(Math.PI * 2 * f * lt) * Math.exp(-lt * 4) + 0.4 * Math.sin(Math.PI * 2 * 2.76 * f * lt) * Math.exp(-lt * 7));
}
const fillVictory: Fill = (data, sr, p) => {
  const notes = [523.3, 659.3, 784, 1046.5]; const step = p.step ?? 0.13;
  const chordStart = notes.length * step;
  for (let i = 0; i < data.length; i++) {
    const t = i / sr; let s = 0;
    for (let n = 0; n < notes.length; n++) s += bellVoice(t - n * step, notes[n] ?? 523.3);
    for (const f of notes) s += bellVoice(t - chordStart, f) * 0.6;
    data[i] = clamp(s * 0.26);
  }
};
const fillShimmer: Fill = (data, sr, p) => {
  let ph = 0; const decay = p.decay ?? 5;
  for (let i = 0; i < data.length; i++) {
    const t = i / sr;
    const f = (p.startF ?? 380) + (p.span ?? 500) * (1 - Math.exp(-t * 6));
    ph += (Math.PI * 2 * f) / sr;
    const air = Math.sin(ph) * 0.4 + Math.sin(ph * 2.01) * 0.12;
    const env = (t < 0.03 ? t / 0.03 : 1) * Math.exp(-t * decay);
    data[i] = clamp(air * env * 0.7);
  }
};
const fillBossAlarm: Fill = (data, sr, p) => {
  const droneF = p.droneF ?? 110; const throbHz = p.throbHz ?? 4; const decay = p.decay ?? 1.2;
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
export interface SoundSpec { key: string; seconds: number; seed: number; gain: number; params: Params; meta: Record<string, ParamMeta>; fill: Fill; }
const F = (min: number, max: number, step: number): ParamMeta => ({ min, max, step });

export const SFX_SPECS: SoundSpec[] = [
  { key: 'laser1', seconds: 0.22, seed: 1, gain: 0.35, fill: fillLaser('square'),
    params: { base: 880, noise: 0.18, click: 0.12, decay: 24 }, meta: { base: F(200,2000,10), noise: F(0,0.6,0.01), click: F(0,0.6,0.01), decay: F(6,60,1) } },
  { key: 'laser2', seconds: 0.20, seed: 2, gain: 0.35, fill: fillLaser('saw'),
    params: { base: 990, noise: 0.12, click: 0.12, decay: 24 }, meta: { base: F(200,2000,10), noise: F(0,0.6,0.01), click: F(0,0.6,0.01), decay: F(6,60,1) } },
  { key: 'laser3', seconds: 0.24, seed: 3, gain: 0.45, fill: fillLaser('square'),
    params: { base: 760, noise: 0.26, click: 0.12, decay: 24 }, meta: { base: F(200,2000,10), noise: F(0,0.6,0.01), click: F(0,0.6,0.01), decay: F(6,60,1) } },
  { key: 'ui-click', seconds: 0.08, seed: 4, gain: 0.12, fill: fillUiClick,
    params: { freq: 2000, decay: 55 }, meta: { freq: F(300,2000,10), decay: F(20,200,1) } },
  { key: 'ding', seconds: 0.6, seed: 4, gain: 0.5, fill: fillDing,
    params: { base: 680, ring: 1 }, meta: { base: F(200,1600,5), ring: F(0.4,3,0.05) } },
  { key: 'explosion', seconds: 0.35, seed: 5, gain: 1.1, fill: fillExplosion,
    params: { tone: 40, decay: 4 }, meta: { tone: F(40,400,2), decay: F(4,40,0.5) } },
  { key: 'impact', seconds: 0.5, seed: 13, gain: 0.85, fill: fillImpact,
    params: { base: 70, decay: 8 }, meta: { base: F(30,200,1), decay: F(3,30,0.5) } },
  { key: 'victory', seconds: 1.5, seed: 6, gain: 1, fill: fillVictory,
    params: { step: 0.13 }, meta: { step: F(0.06,0.3,0.005) } },
  { key: 'shimmer', seconds: 0.5, seed: 7, gain: 0.25, fill: fillShimmer,
    params: { startF: 380, span: 500, decay: 5 }, meta: { startF: F(200,1200,10), span: F(100,2000,10), decay: F(2,20,0.5) } },
  { key: 'boss-alarm', seconds: 0.9, seed: 8, gain: 0.7, fill: fillBossAlarm,
    params: { droneF: 110, throbHz: 4, decay: 1.2 }, meta: { droneF: F(50,300,2), throbHz: F(1,12,0.5), decay: F(0.4,4,0.1) } },
  { key: 'rocket', seconds: 0.7, seed: 7, gain: 0.8, fill: fillRocket,
    params: { rumble: 40, decay: 5.5 }, meta: { rumble: F(20,200,2), decay: F(2,14,0.5) } },
];

export function renderSpec(spec: SoundSpec, sampleRate: number, params: Params = spec.params): Float32Array {
  const length = Math.max(1, Math.ceil(spec.seconds * sampleRate));
  const data = new Float32Array(length);
  spec.fill(data, sampleRate, params, makeRng(spec.seed));
  return data;
}
```

### NEW FILE — `src/audio/synth.ts` (renders SFX_SPECS into Phaser cache)
```ts
import Phaser from 'phaser';
import { renderSpec, SFX_SPECS } from './synthVoices';
/** Call once from BootScene.create() before any scene that plays audio starts. */
export function buildGameSounds(scene: Phaser.Scene): void {
  const manager = scene.sound;
  if (!(manager instanceof Phaser.Sound.WebAudioSoundManager)) {
    console.warn('No WebAudio context — generated SFX skipped, game runs without effects.');
    return;
  }
  const ctx = manager.context;
  const cache = scene.cache.audio;
  for (const spec of SFX_SPECS) {
    const data = renderSpec(spec, ctx.sampleRate);
    const buffer = ctx.createBuffer(1, data.length, ctx.sampleRate);
    buffer.getChannelData(0).set(data);
    if (cache.exists(spec.key)) cache.remove(spec.key);
    cache.add(spec.key, buffer);
  }
}
```

### `src/audio/SoundManager.ts` — apply these
- `AUDIO` map (module-local, NOT exported) with keys incl. `uiClick:'ui-click'`, `explosion`,
  `impact`, `victory`, `shimmer`, `bossAlarm:'boss-alarm'`, `music:'music-main'`, plus laser1/2/3, ding, rocket.
- Add exported `preloadMusic`:
```ts
export function preloadMusic(scene: Phaser.Scene): void {
  scene.load.audio(AUDIO.music, ['audio/music-main.mp3', 'audio/music-main.ogg']);
}
```
- The WEAPON_SFX/REAR_SFX/SIDE_SFX maps (values above) and the event methods per the table above.
- Make `startMusic()` crash-proof (a missing music file must NOT throw — it once crashed HubScene):
```ts
startMusic(): void {
  if (this.sound === null || this.musicMuted) return;
  if (this.music !== null && this.music.isPlaying) return;
  if (this.music === null) {
    if (!this.sound.game.cache.audio.exists(AUDIO.music)) {
      console.warn(`Music track "${AUDIO.music}" not loaded — running without music.`);
      return;
    }
    this.music = this.sound.add(AUDIO.music, { loop: true, volume: MUSIC_VOLUME });
  }
  this.music.play();
}
```
Constants: `MUSIC_VOLUME = 0.35`, `SFX_VOLUME = 0.5`. `sfx(key, volume=SFX_VOLUME, detune=0)` → `this.sound.play(key, { volume, detune })`.

### `src/view/BootScene.ts` — preload music, generate SFX
```ts
import { preloadMusic, Sound } from '../audio/SoundManager';
import { buildGameSounds } from '../audio/synth';
// preload(): ... existing NESRO NOVA label ...  then:  preloadMusic(this);
// create():  buildGameSounds(this);  Sound.attach(this.sound);  ...rest unchanged
```

### NEW FILE — `tools/provision-audio.ts` (music asset provisioning)
`public/audio/` is gitignored; this copies the licensed track from `../sounds/` so a fresh
clone doesn't 404 at boot. Wire into `package.json`: add `"predev"` and `"prebuild"` scripts
that run `tsx tools/provision-audio.ts` (also a manual `"provision-audio"` script).
```ts
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const v2 = join(here, '..');
const soundsDir = join(v2, '..', 'sounds');   // repo-root sounds/ (has Leviathan.mp3/.ogg)
const outDir = join(v2, 'public', 'audio');
const COPIES: [string, string][] = [['Leviathan.mp3', 'music-main.mp3'], ['Leviathan.ogg', 'music-main.ogg']];
mkdirSync(outDir, { recursive: true });
let copied = 0;
for (const [src, dest] of COPIES) {
  const from = join(soundsDir, src);
  if (!existsSync(from)) { console.warn(`provision-audio: source missing, skipped: ${from}`); continue; }
  copyFileSync(from, join(outDir, dest)); copied += 1;
}
if (copied === 0) console.warn(`provision-audio: no music copied — expected the track in ${soundsDir}`);
else console.log(`provision-audio: copied ${String(copied)} music file(s) into public/audio/`);
```
> If the latest tree keeps music elsewhere, point `soundsDir`/`COPIES` at the real source. The
> only hard requirement: `public/audio/music-main.mp3` (and optionally `.ogg`) must exist.

---

## PART B — VISUALS

### NEW FILE — `src/view/starfield.ts` (shared, richer starfield)
Replaces the flat-white per-scene starfields. Colour-tinted stars, 3 size tiers, ~40% twinkle.
Used by HubScene, CombatScene, ResultScene, AlphaNoticeScene.
```ts
import Phaser from 'phaser';
import { px } from './layout';
export interface Star { rect: Phaser.GameObjects.Rectangle; speed: number; baseAlpha: number; twinklePhase: number; twinkleRate: number; }
export interface StarfieldSpec { count: number; xMin: number; xSpan: number; yMin: number; ySpan: number; depth: number; }
const STAR_TINTS = [0xffffff,0xffffff,0xffffff,0xffffff,0xffffff, 0xcfe0ff,0xd6fbff,0xffe6c0,0xe8d4ff];
export function buildStarfield(scene: Phaser.Scene, spec: StarfieldSpec): Star[] {
  const buf = crypto.getRandomValues(new Uint32Array(spec.count * 4));
  const stars: Star[] = [];
  for (let i = 0; i < spec.count; i++) {
    const rx = buf[i*4] ?? 0, ry = buf[i*4+1] ?? 0, rz = buf[i*4+2] ?? 0, rw = buf[i*4+3] ?? 0;
    const x = spec.xMin + (rx % spec.xSpan), y = spec.yMin + (ry % spec.ySpan);
    const size = rx % 11 === 0 ? 3 : rx % 4 === 0 ? 2 : 1;
    const baseAlpha = (rx % 3 === 0 ? 0.6 : 0.22) * (size === 3 ? 1.1 : 1);
    const color = STAR_TINTS[rw % STAR_TINTS.length] ?? 0xffffff;
    const rect = scene.add.rectangle(px(x), px(y), px(size), px(size), color, baseAlpha).setDepth(spec.depth);
    const twinkleRate = rw % 5 < 2 ? 0.0012 + (rz % 30) * 0.0001 : 0;
    stars.push({ rect, speed: 10 + (rz % 46), baseAlpha, twinklePhase: (rz % 628) / 100, twinkleRate });
  }
  return stars;
}
export function tickStarfield(stars: Star[], deltaMs: number, wrapTopLogical: number, wrapBottomLogical: number): void {
  const bottom = px(wrapBottomLogical), top = px(wrapTopLogical);
  for (const star of stars) {
    star.rect.y += (px(star.speed) * deltaMs) / 1000;
    if (star.rect.y > bottom) star.rect.y = top;
    if (star.twinkleRate > 0) { star.twinklePhase += deltaMs * star.twinkleRate; star.rect.setAlpha(star.baseAlpha * (0.55 + 0.45 * Math.sin(star.twinklePhase))); }
  }
}
```
Wire in each scene: field `private stars: Star[] = [];` (or `scrollingStars`), in `create()`
`this.stars = buildStarfield(this, { count, xMin, xSpan, yMin, ySpan, depth })`, in `update(_, dt)`
`tickStarfield(this.stars, dt, top, bottom)`. Specs used:
- Hub: `count:55, xMin:0, xSpan:LOGICAL_WIDTH, yMin:0, ySpan:LOGICAL_HEIGHT, depth:0` (wrap -2 → LOGICAL_HEIGHT+2)
- Combat: `count:65, xMin:GAME_X, xSpan:GAME_WIDTH, yMin:GAME_TOP_Y, ySpan:LOGICAL_HEIGHT-GAME_TOP_Y, depth:0` (wrap GAME_TOP_Y-2 → LOGICAL_HEIGHT+2)
- Result & AlphaNotice: `count:45, full screen, depth:-1` (add an `update()` that only ticks the starfield)

### `src/view/textures.ts` — enrichment (dimensions unchanged)

Shared helper (add near `strokeDiamond`/`traceStar`):
```ts
interface TickSpec { rOuter: number; rInner: number; count: number; start: number; }
/** `count` short radial ticks between rInner..rOuter around (cx,cy), evenly spaced from `start`. */
function radialTicks(g: Phaser.GameObjects.Graphics, cx: number, cy: number, spec: TickSpec): void {
  for (let i = 0; i < spec.count; i++) {
    const ang = spec.start + (i / spec.count) * Math.PI * 2;
    const cos = Math.cos(ang), sin = Math.sin(ang);
    g.lineBetween(cx + cos * spec.rInner, cy + sin * spec.rInner, cx + cos * spec.rOuter, cy + sin * spec.rOuter);
  }
}
```

**Enemy painters** (module-scope `ShapePainter`s; same `bake(scene, KEY, w, h, painter)` sizes as before —
fodder 48×48, striker 52×52, tank 56×56, swarm 30×30, blocker 64×64, guardian 52×52, turret 60×60,
kamikaze 40×40, booster 52×52, boss 96×96). `w`=lineWidth, `a`=alpha (baked multi-pass):
```ts
const paintFodder = (g,w,a)=>{ g.lineStyle(w,PALETTE.enemyRed,a); strokeDiamond(g,px(24),px(24),px(18)); strokeDiamond(g,px(24),px(24),px(9)); g.fillStyle(PALETTE.enemyRed,a); g.fillCircle(px(24),px(24),w*0.8); };
const paintStriker = (g,w,a)=>{ g.lineStyle(w,PALETTE.enemyOrange,a); traceStar(g,px(26),px(26),px(22),px(9)); g.lineStyle(w*0.7,PALETTE.enemyOrange,a*0.8); traceStar(g,px(26),px(26),px(11),px(4)); g.fillStyle(PALETTE.enemyOrange,a); g.fillCircle(px(26),px(26),w*0.9); };
const paintTank = (g,w,a)=>{ g.lineStyle(w,PALETTE.enemyRed,a); g.strokeRect(px(10),px(10),px(36),px(36)); g.strokeRect(px(19),px(19),px(18),px(18)); g.lineBetween(px(28),px(7),px(28),px(49)); g.lineBetween(px(7),px(28),px(49),px(28)); for (const [cx,cy] of [[14,14],[42,14],[14,42],[42,42]] as const) g.strokeCircle(px(cx),px(cy),px(2.5)); };
const paintSwarm = (g,w,a)=>{ g.lineStyle(w,PALETTE.enemyOrange,a); strokeDiamond(g,px(15),px(15),px(10)); g.fillStyle(PALETTE.enemyOrange,a); g.fillCircle(px(15),px(15),w*0.8); };
const paintBlocker = (g,w,a)=>{ g.lineStyle(w,PALETTE.enemyOrange,a); g.strokeRect(px(9),px(9),px(46),px(46)); strokeDiamond(g,px(32),px(32),px(22)); strokeDiamond(g,px(32),px(32),px(11)); radialTicks(g,px(32),px(32),{rOuter:px(30),rInner:px(26),count:4,start:Math.PI/4}); g.fillStyle(PALETTE.enemyOrange,a); g.fillCircle(px(32),px(32),w); };
const paintGuardian = (g,w,a)=>{ g.lineStyle(w,PALETTE.shieldBlue,a); g.strokeCircle(px(26),px(26),px(20)); g.strokeCircle(px(26),px(26),px(13)); g.strokeCircle(px(26),px(26),px(6)); g.lineBetween(px(26),px(6),px(26),px(46)); g.lineBetween(px(6),px(26),px(46),px(26)); radialTicks(g,px(26),px(26),{rOuter:px(20),rInner:px(16),count:8,start:Math.PI/8}); };
const paintTurret = (g,w,a)=>{ g.lineStyle(w,0xcc8800,a); g.strokeRect(px(12),px(24),px(36),px(27)); g.strokeRect(px(17),px(29),px(26),px(17)); g.lineBetween(px(30),px(3),px(30),px(24)); g.lineBetween(px(26),px(12),px(26),px(24)); g.lineBetween(px(34),px(12),px(34),px(24)); g.lineBetween(px(21),px(12),px(39),px(12)); g.strokeCircle(px(30),px(37),px(8)); g.strokeCircle(px(30),px(37),px(3)); };
const paintKamikaze = (g,w,a)=>{ g.lineStyle(w,0xff2255,a); traceStar(g,px(20),px(20),px(17),px(7)); g.strokeCircle(px(20),px(20),px(5)); g.fillStyle(0xff2255,a); g.fillCircle(px(20),px(20),w*0.9); radialTicks(g,px(20),px(20),{rOuter:px(19),rInner:px(15),count:4,start:0}); };
const paintBooster = (g,w,a)=>{ g.lineStyle(w,PALETTE.generatorAmber,a); g.strokeCircle(px(26),px(16),px(11)); g.strokeCircle(px(26),px(16),px(5)); g.fillStyle(PALETTE.generatorAmber,a); g.fillCircle(px(26),px(16),w*0.8); traceChevronDown(g,px(26),px(32),px(11)); traceChevronDown(g,px(26),px(42),px(11)); g.strokeCircle(px(11),px(16),px(3)); g.strokeCircle(px(41),px(16),px(3)); };
const paintBoss = (g,w,a)=>{ g.lineStyle(w,PALETTE.enemyRed,a); strokeDiamond(g,px(48),px(48),px(40)); strokeDiamond(g,px(48),px(48),px(30)); g.strokeCircle(px(48),px(48),px(22)); g.strokeCircle(px(48),px(48),px(10)); g.lineBetween(px(48),px(27),px(48),px(69)); g.lineBetween(px(27),px(48),px(69),px(48)); radialTicks(g,px(48),px(48),{rOuter:px(22),rInner:px(14),count:8,start:Math.PI/8}); g.lineBetween(px(48),px(8),px(48),px(3)); g.lineBetween(px(48),px(88),px(48),px(93)); g.lineBetween(px(8),px(48),px(3),px(48)); g.lineBetween(px(88),px(48),px(93),px(48)); g.fillStyle(PALETTE.enemyRed,a); g.fillCircle(px(48),px(48),w); };
```

**Ship painters** (5 hulls, all 48×52; keep `drawStandardGunBarrels` mounts at x=7/x=41, tips y=16 — combat depends on them). Each got a cockpit/spine/pod detail pass; the extra strokes per kind:
- interceptor: `+ lineBetween(24,8→24,18); lineBetween(12,40→18,42); lineBetween(36,40→30,42); fillCircle(24,22, w*0.7)`
- tanker: `+ lineBetween(4,34→44,34); lineBetween(4,40→44,40); strokeRect(20,31, 8×10); lineBetween(24,10→24,20)`
- salvager: `+ lineBetween(2,20→4,24); lineBetween(41,30→41,44); strokeCircle(24,20, 3); lineBetween(24,8→24,17)`
- reactor: `+ radialTicks(24,28,{rOuter:10,rInner:7,count:6,start:0}); fillCircle(24,28, w*0.9); strokeCircle(24,14, 3)`
- warship: `+ lineBetween(24,8→24,30); lineBetween(21,20→27,20); lineBetween(7,40→8,43); lineBetween(41,40→40,43)`
(all coords via `px()`, colour = the painter's `c`.)

**Projectile texture polish** (add bright white cores/tips; sizes unchanged):
- `laserPulse1/2`: after the body line add a thinner `0xffffff` inner line + `fillCircle` white tip at the muzzle end.
- `laserIon`: add a white cross-glint (`lineBetween` H+V through centre) + white `fillCircle` core.
- `laserScatter1/2`: add 1–2 trailing sub-pellet `fillCircle`s down the bolt.
- `laserNova1/2`: add a bright detonation core `fillCircle` (nova2 also a 3rd inner ring).

**Icon polish** (weapon + equipment shop icons): add one bright focal accent each — hot muzzle-tip
`fillCircle`s (pulse), charged-core dot (ion/nova/plasma/generator), flow dots (torrent), etc. Purely
additive; icon dimensions unchanged.

### `src/view/shipRenderers.ts`
`MuzzleFlash` gets an optional `color?: number`. Richer flash + generator core:
```ts
// tickMuzzleFlashes inner draw (t = life/flashMs, color = f.color ?? PALETTE_CYAN):
g.fillStyle(color, t*0.35);  g.fillCircle(f.x, f.y, px(8)*t);          // halo
g.fillStyle(0xffffff, t*0.9); g.fillCircle(f.x, f.y, px(2.5)*t);       // white core
g.lineStyle(px(1.2)*t, color, t*0.75);
g.lineBetween(f.x, f.y-px(9)*t, f.x, f.y+px(3)*t);                     // fire-direction streak
g.lineBetween(f.x-px(5)*t, f.y, f.x+px(5)*t, f.y);                     // cross spark

// drawGeneratorCore (alpha = 0.12 + energyFrac*0.32):
g.fillStyle(0xffaa22, alpha*0.5);            g.fillCircle(cx, cy, px(7 + energyFrac*3));   // outer glow
g.fillStyle(0xffaa22, alpha);                g.fillCircle(cx, cy, px(4 + energyFrac*2));   // body
g.fillStyle(0xffee88, Math.min(1, alpha*1.4)); g.fillCircle(cx, cy, px(1.5 + energyFrac)); // white-hot centre
g.lineStyle(px(1), 0xffcc44, alpha*1.2);     g.strokeCircle(cx, cy, px(5));
g.lineStyle(px(0.6), 0xffcc44, alpha*0.7);   g.strokeCircle(cx, cy, px(7.5));
```
Front-gun muzzle flash colour = `weaponKindColor(weapon.kind, weapon.id)`; rear-gun = `0xffaa66`.

### `src/view/combatEffects.ts` — kill-burst particles as motion-streaks
```ts
// tickBurstParticles inner draw (t = life/maxLife), over ADD blend:
const tailX = p.x - p.vx*0.02, tailY = p.y - p.vy*0.02;
g.lineStyle(px(0.4 + 1.4*t), p.color, t*0.9);  g.lineBetween(tailX, tailY, p.x, p.y);  // streak
g.fillStyle(0xffffff, t*0.85);                 g.fillCircle(p.x, p.y, px(0.6 + 1.1*t)); // white spark
```

### `src/view/CombatScene.ts` — combat effects (all cosmetic)

**Enemy bolts — MUCH more visible** (3 additive layers + white-hot core; was a thin rect).
Field: `private enemyBolts: { layers: Phaser.GameObjects.Rectangle[]; vy: number; targetY: number }[] = [];`
```ts
private spawnEnemyBolt(enemy: EnemyState, outcome: 'normal'|'crit'|'miss' = 'normal'): void {
  const startY = this.laneToY(enemy.distance, enemy.kind) + px(12);
  const targetY = px(SHIP_Y - 20);
  if (startY >= targetY) return;
  const x = px(SHIP_CENTER_X);
  const color = outcome === 'crit' ? 0xffbb33 : outcome === 'miss' ? 0x445566 : 0xff5522;
  const dim = outcome === 'miss';
  const layer = (w:number,h:number,c:number,al:number,depth:number) =>
    this.add.rectangle(x, startY, px(w), px(h), c, al).setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);
  const layers = dim
    ? [layer(10,24,color,0.3,4), layer(5,14,color,0.4,5)]
    : [layer(18,40,color,0.32,4), layer(10,26,color,0.95,5), layer(4,14,0xffffff,0.95,6)];
  const travelMs = 360;
  this.enemyBolts.push({ layers, vy: (targetY - startY) / travelMs, targetY });
}
private updateEnemyBolts(deltaMs: number): void {
  this.enemyBolts = this.enemyBolts.filter((bolt) => {
    const y = (bolt.layers[0]?.y ?? bolt.targetY) + bolt.vy * deltaMs;
    for (const l of bolt.layers) l.setY(y);
    if (y >= bolt.targetY) { for (const l of bolt.layers) l.destroy(); return false; }
    return true;
  });
}
```

**Enemy idle animation** — every enemy spins (except turret) AND "breathes" (scale pulse):
```ts
function enemyAnimSpec(enemy: EnemyState): { spinMs: number|null; pulse: number; pulseMs: number } {
  if (enemy.isBoss) return { spinMs: 4000, pulse: 1.18, pulseMs: 1400 };
  switch (enemy.kind) {
    case 'swarm':    return { spinMs: 800, pulse: 1.09, pulseMs: 480 };
    case 'striker':  return { spinMs: 1800, pulse: 1.06, pulseMs: 700 };
    case 'blocker':  return { spinMs: 5000, pulse: 1.05, pulseMs: 1600 };
    case 'tank':     return { spinMs: 3200, pulse: 1.04, pulseMs: 1200 };
    case 'turret':   return { spinMs: null, pulse: 1.08, pulseMs: 600 };
    case 'kamikaze': return { spinMs: 600, pulse: 1.13, pulseMs: 260 };
    default:         return { spinMs: 2400, pulse: 1.06, pulseMs: 900 };
  }
}
// in addEnemyAnimTween(sprite, enemy):
const spec = enemyAnimSpec(enemy); const delay = (enemy.id % 8) * 125;
if (spec.spinMs !== null) this.tweens.add({ targets: sprite, angle: 360, duration: spec.spinMs, repeat: -1, ease: 'Linear', delay });
this.tweens.add({ targets: sprite, scaleX: spec.pulse, scaleY: spec.pulse, duration: spec.pulseMs, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay });
```

**Hit flashes** — enemy flashes white when damaged, ship flashes red on hull loss:
```ts
private flashEnemyHit(s: Phaser.GameObjects.Image): void { s.setTintFill(0xffffff); this.time.delayedCall(60, () => { if (s.active) s.clearTint(); }); }
private flashShipHit(): void { this.shipSprite.setTintFill(0xff4455); this.time.delayedCall(80, () => { if (this.shipSprite.active) this.shipSprite.clearTint(); }); }
```
Call `flashEnemyHit(sprite)` where an enemy's hp drops (alongside the existing hit burst);
`flashShipHit()` where `ship.hull < before.hull - 0.5` (alongside the existing camera shake).

**Shockwave ring** — expanding additive ring on kills / collisions / player death:
```ts
private spawnShockwave(x: number, y: number, color: number, endScale = 4): void {
  const ring = this.add.circle(x, y, px(6), 0x000000, 0).setStrokeStyle(px(2), color, 0.9).setDepth(5).setBlendMode(Phaser.BlendModes.ADD);
  this.tweens.add({ targets: ring, scale: endScale, alpha: 0, duration: 340 + endScale*20, ease: 'Cubic.easeOut', onComplete: () => { ring.destroy(); } });
}
```
- enemy death → `spawnShockwave(x, y, 0xffaa44)` + existing bursts.
- collision → `spawnShockwave(cx, cy, 0xff5522, 6)`.
- player death → staged `spawnShockwave(cx, cy, 0xff6622, 9 - ring*2)` per ring (0..2).

**Damage-number pop** — spawn at scale 1.5 → tween to 1 (`Back.easeOut`, 160ms):
```ts
const txt = this.add.text(...).setScale(1.5);
this.tweens.add({ targets: txt, scale: 1, duration: 160, ease: 'Back.easeOut' });
```

**Player-death burst dots** are additive circles that shrink as they fly (was flat rects):
`this.add.circle(x, y, px(1.6 + (i%3)*0.6), color).setDepth(5).setBlendMode(ADD)` tweened `alpha:0, scale:0.3`.

### `src/view/HubScene.ts`
- Starfield (spec above; field `scrollingStars`).
- Credits `ABOUT_TEXT` — append the required music attribution:
  `'', 'Music: "Swim below as Leviathans"', 'by Fireproof Babies (CC BY).', 'Sound effects are generated in-engine.'`
- Dev-tool links (see PART C).

---

## PART C — DEV CONSOLES (soundboard + gallery)

Two standalone Vite pages, **dev-only** (served in dev, never in the shipped build). They exist
so sounds/visuals can be tuned fast. NEW FILES: `soundboard.html`, `dev/soundboard.ts`,
`gallery.html`, `dev/gallery.ts`.

- **Soundboard** (`/soundboard.html`): imports `SFX_SPECS`/`renderSpec` from `synthVoices.ts`
  (Phaser-free), makes an `AudioContext`, and for each spec renders a live buffer with a Play
  button + `gain`/`detune` playback sliders + one slider per synth param (re-renders on the next
  play). `AudioBufferSourceNode.detune.value` (cents) reproduces the game's per-event detune. Has
  Play-all, an OG-music `<audio>` preview, and an **Export values JSON** dump (`{key:{gain,detune,params}}`)
  to hand tuned numbers back. **Baking a tuned value:** put `params`/`gain` into `SFX_SPECS`, and
  put `gain`/`detune` into the matching `SoundManager` event method's `sfx(...)` call.
- **Gallery** (`/gallery.html`): a tiny Phaser game whose scene calls `buildGameTextures(this)`
  then lays out every `this.textures.getTextureKeys()` in a labelled grid (ADD blend, near-black
  bg). Wheel scrolls, `+`/`-` zoom, `R` toggles spin.

Config needed for these to lint/typecheck/pass fallow (dev-only, low-risk):
- `tsconfig.json`: add `"dev"` to `include`.
- `eslint.config.js`: add an override for `files: ['dev/**']` turning off
  `@typescript-eslint/no-non-null-assertion` and `@typescript-eslint/no-unnecessary-condition`
  (DOM-glue code).
- `.fallowrc.json`: add `"entry": ["soundboard.html", "gallery.html"]` so the dev files count as
  reachable (otherwise flagged as unused).
- Do NOT add these HTMLs to `vite build` input — keep them dev-only so they never ship.

**In-game entry buttons** (hub Settings → DEV TOOLS section, `buildDevToolsSection`), guarded to
dev builds so they never appear in a shipped build (where the pages 404):
```ts
if (import.meta.env.DEV) {
  const linkY = px(CONTENT_TOP + DEV_TOOLS_START_Y + 2 * SETTINGS_ROW_PITCH);
  this.addC(addTextButton(this, { x: baseX, y: linkY, originX: 0, originY: 0.5, label: '♪ SOUNDBOARD', color: PALETTE.shieldBlue, size: 14, onClick: () => { openExternalLink('soundboard.html'); } }));
  this.addC(addTextButton(this, { x: baseX + px(150), y: linkY, originX: 0, originY: 0.5, label: '▦ GALLERY', color: PALETTE.weaponCyan, size: 14, onClick: () => { openExternalLink('gallery.html'); } }));
}
```
Shift the RESET button one row lower in dev builds so it doesn't collide (`devToolRows = import.meta.env.DEV ? 3 : 2`).

---

## PART D — DOCS / CONFIG touched
- `docs/design/11-visuals-and-audio.md` — rewrote the Audio section: procedural SFX + licensed
  music file (attribution required); listed the voices.
- `docs/known-issues.md` — noted `combat-m6-boss` screenshot flakiness (it runs on a fresh random
  seed each run → intermittently dies before the boss spawns; the real fix is a fixed seed for that
  shot). Pre-existing, not caused by this work.
- `package.json` — `predev`/`prebuild`/`provision-audio` scripts.
- `tsconfig.json`, `eslint.config.js`, `.fallowrc.json` — per PART C.

## Verification (all passed at handoff)
```
pnpm build:dry      # tsc --noEmit
pnpm lint
pnpm lint:comments
pnpm test           # 763 passing
pnpm screenshot     # 77/77, no page exceptions
pnpm dlx fallow     # no new dead code (only pre-existing balance-report.* unresolved imports)
```
The dev soundboard verifies audio buffers render non-silent / non-clipping; the gallery verifies
every texture bakes. If `pnpm screenshot`'s `combat-m6-boss` fails once, re-run that one shot — it's
the seed-flakiness noted above, not a regression.
```
