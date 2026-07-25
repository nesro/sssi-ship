import Phaser from 'phaser';
import { preloadMusic, Sound } from '../audio/SoundManager';
import { buildGameSounds } from '../audio/synth';
import { loadSave } from '../save/SaveManager';
import { cssColor, PALETTE } from './palette';
import { fontPx, SCREEN_HEIGHT, SCREEN_WIDTH } from './layout';
import { UI_FONT } from './widgets';

/**
 * First scene: loads the licensed music track (the only audio file — SFX are synthesised
 * at runtime like the textures), then hands off to `AlphaNoticeScene` — every save, fresh or
 * returning, every launch (that screen has no save-flag gate of its own; it's a
 * standing dev/alpha reminder, not a first-run-only prompt). There is no separate
 * tutorials-or-skip prompt scene: the choice lives on the galaxy map itself (HubScene's
 * missions screen renders a one-time "skip tutorials" link there when no tutorial has
 * been completed yet, and t1 is always the one glowing, unlocked node on an otherwise-
 * dim map). A fresh save (`!onboardingSeen`) gets `{ showTour: true }`, forwarded
 * unchanged through `AlphaNoticeScene` to `HubScene`, so the hub button coach-mark tour
 * still plays once on a genuinely new save — that question is orthogonal to both the
 * tutorial choice and the alpha notice, not gated behind either.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  // fallow-ignore-next-line unused-class-member
  preload(): void {
    this.add
      .text(SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2, 'NESRO NOVA', {
        fontFamily: UI_FONT,
        fontSize: `${String(fontPx(28))}px`,
        color: cssColor(PALETTE.weaponCyan),
      })
      .setOrigin(0.5);
    preloadMusic(this);
  }

  // fallow-ignore-next-line unused-class-member
  create(): void {
    buildGameSounds(this);
    Sound.attach(this.sound);
    // `onboardingSeen` is persisted by AlphaNoticeScene itself, only once the player
    // actually reaches HubScene via CONTINUE — not here. Persisting it this early would
    // mean a player who quits/crashes on the (unskippable, every-launch) alpha notice
    // before ever tapping CONTINUE permanently loses the one-time hub button tour on
    // their next real launch, despite never having seen it.
    const isFirstLaunch = loadSave().onboardingSeen !== true;
    this.scene.start('AlphaNoticeScene', { showTour: isFirstLaunch });
  }
}
