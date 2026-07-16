import Phaser from 'phaser';
import { acceptOnboarding, loadSave, persistSave, skipTutorials } from '../save/SaveManager';
import type { SaveData } from '../save/SaveManager';
import { cssColor, PALETTE } from './palette';
import { fontPx, LOGICAL_WIDTH, px } from './layout';
import { addTextButton, UI_FONT } from './widgets';

/**
 * Shown once, on a fresh save, between BootScene and HubScene — a lightweight
 * "tutorials or skip?" choice, decoupled from the not-yet-built WelcomeScene's story
 * content (docs/plans/tutorial-minimalism-and-onboarding.md; docs/design/14-status.md
 * lists WelcomeScene's Captain Nesro portrait + developer message as blocked on Tomáš's
 * own writing — this scene carries none of that content on purpose).
 *
 * Both choices hand off to HubScene with `{ showTour: true }` — the tutorials-or-skip
 * question is about *combat* tutorials; the hub button tour is orthogonal and every new
 * player needs it regardless of which combat-tutorial path they picked.
 */
export class OnboardingScene extends Phaser.Scene {
  constructor() { super('OnboardingScene'); }

  // fallow-ignore-next-line unused-class-member
  create(): void {
    this.add.text(px(LOGICAL_WIDTH / 2), px(120), 'NESRO  NOVA', {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(24))}px`, color: cssColor(PALETTE.weaponCyan),
    }).setOrigin(0.5);

    const bodyLines = [
      'Commander. Before you launch — four short training runs',
      'teach the basics: shields, energy, support cards, supplies.',
      'You can play them now, or skip straight to the campaign.',
    ];
    this.add.text(px(LOGICAL_WIDTH / 2), px(180), bodyLines, {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(13))}px`, color: cssColor(0xaaaacc), align: 'center', lineSpacing: px(6),
    }).setOrigin(0.5, 0);

    addTextButton(this, {
      x: px(LOGICAL_WIDTH / 2), y: px(300), size: 18,
      label: 'START WITH TUTORIALS', color: PALETTE.weaponCyan,
      onClick: () => { this.choose(acceptOnboarding); },
    });
    addTextButton(this, {
      x: px(LOGICAL_WIDTH / 2), y: px(360), size: 18,
      label: 'SKIP TUTORIALS', color: 0x8888aa,
      onClick: () => { this.choose(skipTutorials); },
    });
  }

  private choose(mutate: (save: SaveData) => SaveData): void {
    persistSave(mutate(loadSave()));
    this.scene.start('HubScene', { showTour: true });
  }

  /** __cheat.onboarding.choose('tutorials'|'skip') — headless equivalent of tapping
   * either button, for the Playwright harness (never real clicks/coordinates). */
  // fallow-ignore-next-line unused-class-member
  cheatChoose(choice: 'tutorials' | 'skip'): void {
    this.choose(choice === 'skip' ? skipTutorials : acceptOnboarding);
  }
}
