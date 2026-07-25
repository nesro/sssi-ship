import Phaser from 'phaser';
import { renderSpec, SFX_SPECS } from './synthVoices';

/**
 * Renders every procedural SFX (defined in synthVoices.ts) into the scene's audio cache at
 * boot — the audible counterpart to `src/view/textures.ts`, so no SFX file is fetched or
 * shipped. Music is the one exception: it's a licensed track loaded from a file
 * (BootScene.preload / SoundManager), not synthesised.
 *
 * Buffers are filled sample-by-sample on the live WebAudio context, then handed to Phaser
 * via `cache.audio.add(key, buffer)`. Call once from BootScene.create() before any scene
 * that plays audio starts. No-op (with a warning) if the runtime has no WebAudio context —
 * SFX simply stay silent, never a hard failure.
 */
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
