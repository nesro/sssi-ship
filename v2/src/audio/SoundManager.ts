import Phaser from 'phaser';

/**
 * Thin wrapper over Phaser's game-level sound system (V2_HANDOFF.md §audio).
 *
 * Phaser's `scene.sound` is shared across every scene, so a single module-level
 * instance is the right model: SFX are fire-and-forget; the music track is created
 * once and keeps playing across scene transitions. All assets are preloaded by
 * BootScene before MenuScene starts, so `play()` here never blocks on a load.
 *
 * Browser autoplay policy: audio stays locked until the first user gesture. Phaser
 * unlocks automatically on the first pointer/key event, after which queued music
 * begins. We never force playback before that.
 */

/** Asset keys — must match the keys registered in preloadAudio(). */
const AUDIO = {
  laser1: 'laser1',
  laser2: 'laser2',
  laser3: 'laser3',
  ding: 'ding',
  rocket: 'rocket',
  music: 'music-main',
} as const;

const MUSIC_MUTE_KEY = 'nesro-nova-v2-music-muted';
const SFX_MUTE_KEY = 'nesro-nova-v2-sfx-muted';
const MUSIC_VOLUME = 0.35;
const SFX_VOLUME = 0.5;
const LASER_KEYS = [AUDIO.laser1, AUDIO.laser2, AUDIO.laser3];

/** Registers every audio file on a scene's loader. Call from BootScene.preload(). */
export function preloadAudio(scene: Phaser.Scene): void {
  scene.load.audio(AUDIO.laser1, ['audio/LaserShot1.ogg', 'audio/LaserShot1.mp3']);
  scene.load.audio(AUDIO.laser2, ['audio/LaserShot2.ogg', 'audio/LaserShot2.mp3']);
  scene.load.audio(AUDIO.laser3, ['audio/LaserShot3.ogg', 'audio/LaserShot3.mp3']);
  scene.load.audio(AUDIO.ding, ['audio/Ding.ogg', 'audio/Ding.mp3']);
  scene.load.audio(AUDIO.rocket, ['audio/Rocket.ogg', 'audio/Rocket.mp3']);
  scene.load.audio(AUDIO.music, ['audio/music-main.mp3']);
}

class SoundManager {
  private sound: Phaser.Sound.BaseSoundManager | null = null;
  private music: Phaser.Sound.BaseSound | null = null;
  private musicMuted = readFlag(MUSIC_MUTE_KEY);
  private sfxMuted = readFlag(SFX_MUTE_KEY);
  private laserIndex = 0;

  /** Bind to the game-level sound manager. Safe to call from every scene's create(). */
  attach(sound: Phaser.Sound.BaseSoundManager): void {
    this.sound = sound;
    this.applyMusicMute();
  }

  private applyMusicMute(): void {
    if (this.music === null) return;
    if (this.musicMuted) {
      this.music.pause();
    } else if (!this.music.isPlaying) {
      this.music.resume();
    }
  }

  /** Plays a one-shot SFX. No-ops if audio isn't attached or SFX is muted. */
  private sfx(key: string, volume = SFX_VOLUME, detune = 0): void {
    if (this.sound === null || this.sfxMuted) return;
    this.sound.play(key, { volume, detune });
  }

  /** Player weapon fired — rotates through the three laser samples so it doesn't drone. */
  fire(): void {
    const key = LASER_KEYS[this.laserIndex % LASER_KEYS.length] ?? AUDIO.laser1;
    this.laserIndex += 1;
    this.sfx(key, SFX_VOLUME * 0.7);
  }

  /** An enemy was destroyed by weapon fire. */
  kill(): void {
    this.sfx(AUDIO.ding, SFX_VOLUME * 0.6);
  }

  /** Generator fired a shield pulse (shield jumped up). Detuned ding for a softer "charge" feel. */
  shieldPulse(): void {
    this.sfx(AUDIO.ding, SFX_VOLUME * 0.35, -600);
  }

  /** A reserve supply boost was activated. */
  boost(): void {
    this.sfx(AUDIO.rocket, SFX_VOLUME * 0.8);
  }

  /** Mission cleared. */
  victory(): void {
    this.sfx(AUDIO.ding, SFX_VOLUME);
  }

  /** Starts the looping background track if it isn't already playing. */
  startMusic(): void {
    if (this.sound === null || this.musicMuted) return;
    if (this.music !== null && this.music.isPlaying) return;
    if (this.music === null) {
      this.music = this.sound.add(AUDIO.music, { loop: true, volume: MUSIC_VOLUME });
    }
    this.music.play();
  }

  isMusicMuted(): boolean { return this.musicMuted; }

  /** Flips music mute and persists it. Returns the new muted state. */
  toggleMusic(): boolean {
    this.musicMuted = !this.musicMuted;
    localStorage.setItem(MUSIC_MUTE_KEY, JSON.stringify(this.musicMuted));
    if (this.musicMuted) {
      this.music?.pause();
    } else {
      this.startMusic();
    }
    return this.musicMuted;
  }

  isSfxMuted(): boolean { return this.sfxMuted; }

  /** Flips SFX mute and persists it. Returns the new muted state. */
  toggleSfx(): boolean {
    this.sfxMuted = !this.sfxMuted;
    localStorage.setItem(SFX_MUTE_KEY, JSON.stringify(this.sfxMuted));
    return this.sfxMuted;
  }
}

function readFlag(key: string): boolean {
  const raw = localStorage.getItem(key);
  if (raw === null) return false;
  try {
    return JSON.parse(raw) === true;
  } catch {
    return false;
  }
}

/** Game-wide singleton — Phaser's sound system is itself a singleton per game. */
export const Sound = new SoundManager();
