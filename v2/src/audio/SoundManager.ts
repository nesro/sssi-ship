import Phaser from 'phaser';

/**
 * Thin wrapper over Phaser's game-level sound system (V2_HANDOFF.md §audio).
 *
 * Phaser's `scene.sound` is shared across every scene, so a single module-level
 * instance is the right model: SFX are fire-and-forget; the music track is created
 * once and keeps playing across scene transitions. SFX buffers are synthesised into the
 * audio cache by `buildGameSounds` (src/audio/synth.ts) at boot — nothing is fetched for
 * them. Music is the one licensed asset: `preloadMusic` loads the track from a file in
 * BootScene.preload, so `startMusic` here plays a ready cache entry.
 *
 * Browser autoplay policy: audio stays locked until the first user gesture. Phaser
 * unlocks automatically on the first pointer/key event, after which queued music
 * begins. We never force playback before that.
 */

/** SFX keys the synthesiser fills (src/audio/synthVoices.ts) + the file-loaded music key. */
const AUDIO = {
  laser1: 'laser1',
  laser2: 'laser2',
  laser3: 'laser3',
  uiClick: 'ui-click',
  ding: 'ding',
  explosion: 'explosion',
  impact: 'impact',
  victory: 'victory',
  shimmer: 'shimmer',
  bossAlarm: 'boss-alarm',
  rocket: 'rocket',
  music: 'music-main',
} as const;

/** Loads the licensed music track. Call from BootScene.preload(). SFX are generated at
 * boot instead (buildGameSounds), so music is the only audio file the game fetches. */
export function preloadMusic(scene: Phaser.Scene): void {
  scene.load.audio(AUDIO.music, ['audio/music-main.mp3', 'audio/music-main.ogg']);
}

const MUSIC_MUTE_KEY = 'nesro-nova-v2-music-muted';
const SFX_MUTE_KEY = 'nesro-nova-v2-sfx-muted';
const MUSIC_VOLUME = 0.35;
const SFX_VOLUME = 0.5;
const LASER_KEYS = [AUDIO.laser1, AUDIO.laser2, AUDIO.laser3];

/** Per-weapon-kind fire character (detune in cents, volume scale) so each weapon sounds
 * distinct while sharing the three base laser samples — ion deep, scatter quick/light,
 * nova a heavy boom, y2010 a thin retro zap. */
const WEAPON_SFX: Record<string, { detune: number; vol: number }> = {
  pulse:   { detune: 0, vol: 1 },
  ion:     { detune: -350, vol: 1.1 },
  scatter: { detune: 250, vol: 0.8 },
  nova:    { detune: -550, vol: 1.15 },
  y2010:   { detune: 450, vol: 0.9 },
};

/** Per-rear-weapon-kind character — all pitched below the front weapon so the aft gun
 * reads as heavier/lower, with each kind still distinct. */
const REAR_SFX: Record<string, { detune: number; vol: number }> = {
  grenade: { detune: -700, vol: 0.8 },
  flak:    { detune: -200, vol: 0.6 },
  plasma:  { detune: -500, vol: 0.75 },
  arc:     { detune: -100, vol: 0.6 },
  cluster: { detune: -400, vol: 0.7 },
};

/** Per-side-weapon-kind character for the manual charged shot. */
const SIDE_SFX: Record<string, { detune: number; vol: number }> = {
  focus:     { detune: 300, vol: 0.9 },
  flechette: { detune: 150, vol: 0.7 },
  railgun:   { detune: -200, vol: 1.0 },
  orbital:   { detune: -400, vol: 0.9 },
};

class SoundManager {
  private sound: Phaser.Sound.BaseSoundManager | null = null;
  private music: Phaser.Sound.BaseSound | null = null;
  private musicMuted = readFlag(MUSIC_MUTE_KEY);
  private sfxMuted = readFlag(SFX_MUTE_KEY);
  private laserIndex = 0;
  // Belt-and-suspenders alongside CombatScene's own "skip ticking while document.hidden"
  // fix for the backgrounded-tab noise burst: a sound already mid-flight in the
  // browser's audio pipeline at the exact instant the tab backgrounds isn't covered by
  // that fix (nothing new gets queued, but that one call may already be in-flight), so
  // this silences the *output* side too for the duration.
  private suspended = false;

  /** Bind to the game-level sound manager. Safe to call from every scene's create(). */
  attach(sound: Phaser.Sound.BaseSoundManager): void {
    this.sound = sound;
    // Phaser's own pauseOnBlur (default true) is a SEPARATE mechanism from the
    // suspend()/resume() mute pair below — on tab blur it PAUSES every currently-
    // playing sound (freezing playback position), then RESUMES all of them on
    // focus, each continuing from wherever it was paused. That resume is itself a
    // burst: any sfx that happened to be mid-flight the instant the tab backgrounded
    // (easy during active combat — several laser/ding one-shots overlapping) all
    // become audible again at the exact same instant on refocus, on top of whatever
    // our own mute-based fix does. Disabling it here leaves suspend()/resume() as
    // the only visibility-driven audio behavior: sounds keep playing (silently,
    // muted) to their own short natural completion instead of freezing and later
    // resuming in a batch.
    sound.pauseOnBlur = false;
    this.applyMusicMute();
  }

  /** Tab went hidden — silence output without touching the user's own mute prefs, so
   * `resume()` restores exactly what was playing before. */
  suspend(): void {
    this.suspended = true;
    if (this.sound !== null) this.sound.mute = true;
  }

  /** Tab is visible again — restore whatever mute state the user actually chose. */
  resume(): void {
    this.suspended = false;
    if (this.sound !== null) this.sound.mute = false;
  }

  private applyMusicMute(): void {
    if (this.music === null) return;
    if (this.musicMuted) {
      this.music.pause();
    } else if (!this.music.isPlaying) {
      this.music.resume();
    }
  }

  /** Plays a one-shot SFX. No-ops if audio isn't attached, SFX is muted, or the tab is
   * currently backgrounded. */
  private sfx(key: string, volume = SFX_VOLUME, detune = 0): void {
    if (this.sound === null || this.sfxMuted || this.suspended) return;
    this.sound.play(key, { volume, detune });
  }

  /** Player weapon fired — rotates through the three laser samples so it doesn't drone,
   * pitched/leveled per weapon kind so weapons are audibly distinct. */
  fire(weaponKind = 'pulse'): void {
    const key = LASER_KEYS[this.laserIndex % LASER_KEYS.length] ?? AUDIO.laser1;
    this.laserIndex += 1;
    const c = WEAPON_SFX[weaponKind] ?? WEAPON_SFX.pulse;
    this.sfx(key, SFX_VOLUME * 0.7 * (c?.vol ?? 1), c?.detune ?? 0);
  }

  /** Rear weapon fired — same laser rotation as the front weapon, but pitched per rear-kind
   * (all below the front weapon) so the aft gun is audibly its own, heavier slot. */
  rearFire(rearKind = 'grenade'): void {
    const key = LASER_KEYS[this.laserIndex % LASER_KEYS.length] ?? AUDIO.laser1;
    this.laserIndex += 1;
    const c = REAR_SFX[rearKind] ?? REAR_SFX.grenade;
    this.sfx(key, SFX_VOLUME * (c?.vol ?? 0.7), c?.detune ?? -350);
  }

  /** Side weapon manually fired — distinct from both autofire weapons and reserve-supply
   * boosts (which reuse `rocket`) so a manual charged shot reads as its own action, with
   * per-kind character (focus bright, railgun a heavy crack, orbital deep). */
  sideWeaponFire(sideKind = 'focus'): void {
    const c = SIDE_SFX[sideKind] ?? SIDE_SFX.focus;
    this.sfx(AUDIO.laser3, SFX_VOLUME * (c?.vol ?? 0.9), c?.detune ?? 200);
  }

  /** An enemy was destroyed by weapon fire — a loud, octave-down deep boom (tuned in the
   * soundboard: gain 1.1, detune -1200). */
  kill(): void {
    this.sfx(AUDIO.explosion, SFX_VOLUME * 1.1, -1200);
  }

  /** Generator fired a shield pulse (shield jumped up) — a soft, airy surge. Kept quiet
   * because the shield recharges often; the caller also throttles how frequently this
   * fires so it never machine-guns. */
  shieldPulse(): void {
    this.sfx(AUDIO.shimmer, SFX_VOLUME * 0.22);
  }

  /** A boss just entered the field — a throbbing low alarm sting. */
  bossAppear(): void {
    this.sfx(AUDIO.bossAlarm, SFX_VOLUME * 0.7);
  }

  /** An enemy collided with the player's hull — a heavy body-blow thud. */
  collision(): void {
    this.sfx(AUDIO.impact, SFX_VOLUME * 0.85);
  }

  /** A support-call card was picked — a soft confirmation chime. */
  select(): void {
    this.sfx(AUDIO.ding, SFX_VOLUME * 0.5);
  }

  /** A UI button was tapped — a deliberately quiet, airy tick (menus fire this on every
   * press, so it must stay subtle, not a musical chime). */
  uiClick(): void {
    this.sfx(AUDIO.uiClick, SFX_VOLUME * 0.18);
  }

  /** A reserve supply boost was activated. */
  boost(): void {
    this.sfx(AUDIO.rocket, SFX_VOLUME * 0.8);
  }

  /** Mission cleared. */
  victory(): void {
    this.sfx(AUDIO.victory, SFX_VOLUME);
  }

  /** Starts the looping background track if it isn't already playing. No-ops (never throws)
   * if the music file failed to load — a missing asset must never take down the scene the
   * way it once did (`Audio key "music-main" not found in cache` crashing HubScene). */
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
