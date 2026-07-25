// Copies the licensed music track into public/audio/ so Vite serves it in dev and bundles
// it in the production build. SFX are synthesised at runtime (src/audio/synth.ts) and need
// no files — music is the one audio asset the game fetches. public/audio/ is gitignored
// (the source of truth is ../sounds/), so this runs from `predev`/`prebuild` to guarantee
// the file exists on a fresh clone instead of 404ing at boot.

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const v2 = join(here, '..');
const soundsDir = join(v2, '..', 'sounds');
const outDir = join(v2, 'public', 'audio');

const COPIES: [src: string, dest: string][] = [
  ['Leviathan.mp3', 'music-main.mp3'],
  ['Leviathan.ogg', 'music-main.ogg'],
];

mkdirSync(outDir, { recursive: true });
let copied = 0;
for (const [src, dest] of COPIES) {
  const from = join(soundsDir, src);
  if (!existsSync(from)) {
    console.warn(`provision-audio: source missing, skipped: ${from}`);
    continue;
  }
  copyFileSync(from, join(outDir, dest));
  copied += 1;
}
if (copied === 0) console.warn(`provision-audio: no music copied — expected the track in ${soundsDir}`);
else console.log(`provision-audio: copied ${String(copied)} music file(s) into public/audio/`);
