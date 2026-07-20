import Phaser from 'phaser';
import { acceptOnboarding, loadSave, persistSave, resetSave } from '../save/SaveManager';
import { DISCORD_LABEL, DISCORD_URL, openExternalLink } from './externalLinks';
import { cssColor, PALETTE } from './palette';
import { fontPx, LOGICAL_HEIGHT, LOGICAL_WIDTH, px } from './layout';
import { addTextButton, UI_FONT } from './widgets';

/**
 * Shown on EVERY launch — no save-flag gate, unlike the one-time hub button tour. A
 * standing reminder that this is an early/alpha build, with three independent actions:
 * CONTINUE, ERASE PROGRESS (two-tap, as destructive as Settings' own reset button), and
 * a DEV MODE toggle. Settings keeps its own reset + dev-mode toggle too (`HubScene.ts`,
 * unchanged) — this is an additional, more visible surface before the player even
 * reaches the hub, not a replacement.
 *
 * Forwards whatever `data` BootScene passed it straight through to HubScene on
 * CONTINUE, so the one-time hub tour (`{ showTour: true }` on a genuinely fresh save)
 * still fires correctly — this screen sits in front of that flow without altering it.
 */
export class AlphaNoticeScene extends Phaser.Scene {
  private forwardData: { showTour?: boolean } = {};
  private termsAccepted = false;
  private termsHint!: Phaser.GameObjects.Text;

  constructor() { super('AlphaNoticeScene'); }

  // fallow-ignore-next-line unused-class-member
  create(data: { showTour?: boolean }): void {
    this.forwardData = { ...data };
    this.termsAccepted = loadSave().termsAccepted === true;

    this.add.text(px(LOGICAL_WIDTH / 2), px(100), '⚠  EARLY DEV / ALPHA BUILD', {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(20))}px`, color: cssColor(PALETTE.generatorAmber),
    }).setOrigin(0.5);

    const bodyLines = [
      'Nesro Nova is still in early development.',
      'Balance, content, and save data can all change between builds —',
      'your progress may be reset without notice as the game evolves.',
    ];
    this.add.text(px(LOGICAL_WIDTH / 2), px(150), bodyLines, {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(13))}px`, color: cssColor(0xaaaacc),
      align: 'center', lineSpacing: px(6),
    }).setOrigin(0.5, 0);

    const termsLabel = (): string => (this.termsAccepted ? '☑ I ACCEPT THE TERMS & PRIVACY NOTICE' : '☐ I ACCEPT THE TERMS & PRIVACY NOTICE');
    const termsBtn = addTextButton(this, {
      x: px(LOGICAL_WIDTH / 2), y: px(232), size: 12,
      label: termsLabel(), color: this.termsAccepted ? PALETTE.weaponCyan : 0x8899bb,
      onClick: () => {
        this.termsAccepted = !this.termsAccepted;
        persistSave({ ...loadSave(), termsAccepted: this.termsAccepted });
        termsBtn.setText(termsLabel());
        termsBtn.setStyle({ color: cssColor(this.termsAccepted ? PALETTE.weaponCyan : 0x8899bb) });
        if (this.termsAccepted) this.termsHint.setVisible(false);
      },
    });
    const noticeLines = [
      'Account sync/login (starting with Google) is planned but not live yet.',
      'This game is, and always will be, free — no ads, ever.',
    ];
    this.add.text(px(LOGICAL_WIDTH / 2), px(254), noticeLines, {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(10))}px`, color: cssColor(0x778899),
      align: 'center', lineSpacing: px(4),
    }).setOrigin(0.5, 0);
    this.termsHint = this.add.text(px(LOGICAL_WIDTH / 2), px(298), 'Please accept the terms above first.', {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(11))}px`, color: '#ff6666',
    }).setOrigin(0.5).setVisible(false);

    addTextButton(this, {
      x: px(LOGICAL_WIDTH / 2), y: px(328), size: 18,
      label: 'CONTINUE WITH LAST SAVE', color: PALETTE.weaponCyan,
      onClick: () => {
        if (!this.termsAccepted) { this.termsHint.setVisible(true); return; }
        this.continueToHub();
      },
    });

    // Same two-tap confirm pattern as Settings' own RESET PROGRESS button
    // (HubScene.ts) — deliberately not a separate modal, matching the existing
    // established UX for this exact destructive action elsewhere in the app.
    let resetPending = false;
    const resetLabel = (): string => (resetPending ? '▸ CONFIRM ERASE' : 'ERASE PROGRESS AND START OVER');
    const resetColor = (): number => (resetPending ? 0xff4444 : 0x664444);
    const resetBtn = addTextButton(this, {
      x: px(LOGICAL_WIDTH / 2), y: px(378), size: 14,
      label: resetLabel(), color: resetColor(),
      onClick: () => {
        if (!resetPending) {
          resetPending = true;
          resetBtn.setText(resetLabel());
          resetBtn.setStyle({ color: cssColor(resetColor()) });
        } else {
          resetSave();
          window.location.reload();
        }
      },
    });

    // Same toggle semantics as Settings' own DEV MODE button (HubScene.ts) — not
    // destructive, so a single tap (not a two-tap confirm like ERASE above) and no
    // auto-navigation, since this is meant to sit alongside CONTINUE/ERASE as an
    // independent action, not replace pressing CONTINUE afterward.
    let devOn = loadSave().devMode === true;
    const devLabel = (): string => (devOn ? 'DEV MODE: ON' : 'UNLOCK DEV MODE');
    const devColor = (): number => (devOn ? PALETTE.generatorAmber : 0x666688);
    const devBtn = addTextButton(this, {
      x: px(LOGICAL_WIDTH / 2), y: px(422), size: 14,
      label: devLabel(), color: devColor(),
      onClick: () => {
        devOn = !devOn;
        persistSave({ ...loadSave(), devMode: devOn });
        devBtn.setText(devLabel());
        devBtn.setStyle({ color: cssColor(devColor()) });
      },
    });

    addTextButton(this, {
      x: px(LOGICAL_WIDTH / 2), y: px(466), size: 12,
      label: DISCORD_LABEL, color: 0x8899ff,
      onClick: () => { openExternalLink(DISCORD_URL); },
    });

    this.add.text(px(LOGICAL_WIDTH / 2), px(LOGICAL_HEIGHT - 22), 'v2 — pre-release', {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(9))}px`, color: '#445566',
    }).setOrigin(0.5);
  }

  private continueToHub(): void {
    // Persisted here, not in BootScene, and gated on the same `showTour` flag BootScene
    // computed from `!onboardingSeen` — so a player who never actually taps CONTINUE
    // (quits/crashes on this screen) doesn't silently burn their one-time hub tour.
    if (this.forwardData.showTour === true) persistSave(acceptOnboarding(loadSave()));
    this.scene.start('HubScene', this.forwardData);
  }

  /** __cheat.alpha.continue() — headless equivalent of tapping CONTINUE. Every
   * automated boot hits this screen (no save-flag gate), so the Playwright harness
   * depends on this cheat to ever reach HubScene at all. Accepts terms first (a
   * headless run has no way to tap the checkbox, and isn't testing that gate). */
  // fallow-ignore-next-line unused-class-member
  cheatContinue(): void {
    if (!this.termsAccepted) {
      this.termsAccepted = true;
      persistSave({ ...loadSave(), termsAccepted: true });
    }
    this.continueToHub();
  }
}
