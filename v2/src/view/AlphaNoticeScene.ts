import Phaser from 'phaser';
import { acceptOnboarding, loadSave, persistSave, resetSave } from '../save/SaveManager';
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

  constructor() { super('AlphaNoticeScene'); }

  // fallow-ignore-next-line unused-class-member
  create(data: { showTour?: boolean }): void {
    this.forwardData = { ...data };

    this.add.text(px(LOGICAL_WIDTH / 2), px(110), '⚠  EARLY DEV / ALPHA BUILD', {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(20))}px`, color: cssColor(PALETTE.generatorAmber),
    }).setOrigin(0.5);

    const bodyLines = [
      'Nesro Nova is still in early development.',
      'Balance, content, and save data can all change between builds —',
      'your progress may be reset without notice as the game evolves.',
    ];
    this.add.text(px(LOGICAL_WIDTH / 2), px(170), bodyLines, {
      fontFamily: UI_FONT, fontSize: `${String(fontPx(13))}px`, color: cssColor(0xaaaacc),
      align: 'center', lineSpacing: px(6),
    }).setOrigin(0.5, 0);

    addTextButton(this, {
      x: px(LOGICAL_WIDTH / 2), y: px(300), size: 18,
      label: 'CONTINUE WITH LAST SAVE', color: PALETTE.weaponCyan,
      onClick: () => { this.continueToHub(); },
    });

    // Same two-tap confirm pattern as Settings' own RESET PROGRESS button
    // (HubScene.ts) — deliberately not a separate modal, matching the existing
    // established UX for this exact destructive action elsewhere in the app.
    let resetPending = false;
    const resetLabel = (): string => (resetPending ? '▸ CONFIRM ERASE' : 'ERASE PROGRESS AND START OVER');
    const resetColor = (): number => (resetPending ? 0xff4444 : 0x664444);
    const resetBtn = addTextButton(this, {
      x: px(LOGICAL_WIDTH / 2), y: px(360), size: 14,
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
      x: px(LOGICAL_WIDTH / 2), y: px(410), size: 14,
      label: devLabel(), color: devColor(),
      onClick: () => {
        devOn = !devOn;
        persistSave({ ...loadSave(), devMode: devOn });
        devBtn.setText(devLabel());
        devBtn.setStyle({ color: cssColor(devColor()) });
      },
    });

    this.add.text(px(LOGICAL_WIDTH / 2), px(LOGICAL_HEIGHT - 30), 'v2 — pre-release', {
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
   * depends on this cheat to ever reach HubScene at all. */
  // fallow-ignore-next-line unused-class-member
  cheatContinue(): void {
    this.continueToHub();
  }
}
