import Phaser from 'phaser';
import { cssColor, PALETTE } from './palette';
import { fontPx, LOGICAL_HEIGHT, LOGICAL_WIDTH, px } from './layout';
import { addTextButton, UI_FONT } from './widgets';

export interface TourStep {
  /** Matched against a target's `.setData('tourId', ...)` tag — see HubScene.ts's
   * buildMainMenu. A step with no matching target on screen just shows the caption and
   * NEXT/SKIP with no highlight ring, rather than throwing (defensive: a future layout
   * change removing a tagged button shouldn't crash the tour for everyone else). */
  tourId: string;
  caption: string;
}

const DEPTH_BACKDROP = 50;
const DEPTH_TARGET = 51;
const DEPTH_UI = 52;
const RING_PADDING = 8;
const CAPTION_Y = 440;
const BUTTON_ROW_Y = 500;

/** Matches ensureMinTapTarget's parameter type (widgets.ts) — the concrete Phaser
 * classes that actually declare setDepth/getBounds/setInteractive/disableInteractive,
 * unlike the generic GameObject base type. */
type Targetable = Phaser.GameObjects.Text | Phaser.GameObjects.Shape | Phaser.GameObjects.Image;

/**
 * Coach-mark tour: dims the screen, highlights one real, currently-on-screen UI element
 * per step by temporarily raising its depth above the dim backdrop (so it renders
 * un-obscured — no visual clone needed) and disabling its input for the tour's
 * duration (so tapping the spotlighted button can't navigate away mid-explanation and
 * destroy the very object the tour is tracking — see
 * docs/plans/first-open-and-tutorial-tour.md's Part B for why this replaced the
 * originally-sketched "just raise the depth" approach). Targets are found at each step
 * by scanning the scene for a `.setData('tourId', ...)` tag and reading real
 * `getBounds()`, not by recomputing layout math.
 */
export class HubTour {
  private readonly scene: Phaser.Scene;
  private readonly steps: TourStep[];
  private stepIndex = 0;
  private stepObjects: Phaser.GameObjects.GameObject[] = [];
  private currentTarget: Targetable | null = null;
  private currentTargetDepth = 0;

  constructor(scene: Phaser.Scene, steps: TourStep[]) {
    this.scene = scene;
    this.steps = steps;
    this.renderStep();
  }

  private findTarget(tourId: string): Targetable | undefined {
    return this.scene.children.list.find((obj) => obj.getData('tourId') === tourId) as Targetable | undefined;
  }

  private clearStep(): void {
    this.stepObjects.forEach((obj) => { obj.destroy(); });
    this.stepObjects = [];
    if (this.currentTarget !== null) {
      this.currentTarget.setDepth(this.currentTargetDepth);
      this.currentTarget.setInteractive();
      this.currentTarget = null;
    }
  }

  private renderStep(): void {
    this.clearStep();
    const step = this.steps[this.stepIndex];
    if (step === undefined) { return; }

    const backdrop = this.scene.add
      .rectangle(px(LOGICAL_WIDTH / 2), px(LOGICAL_HEIGHT / 2), px(LOGICAL_WIDTH), px(LOGICAL_HEIGHT), 0x000000, 0.75)
      .setDepth(DEPTH_BACKDROP)
      .setInteractive(); // swallow clicks around the highlighted target too
    this.stepObjects.push(backdrop);

    const target = this.findTarget(step.tourId);
    if (target !== undefined) {
      this.currentTargetDepth = target.depth;
      this.currentTarget = target;
      target.setDepth(DEPTH_TARGET);
      target.disableInteractive();

      const bounds = target.getBounds();
      const pad = px(RING_PADDING);
      const ring = this.scene.add.graphics().setDepth(DEPTH_TARGET);
      ring.lineStyle(px(2), PALETTE.weaponCyan, 1);
      ring.strokeRect(bounds.x - pad, bounds.y - pad, bounds.width + pad * 2, bounds.height + pad * 2);
      this.stepObjects.push(ring);
    }

    const caption = this.scene.add
      .text(px(LOGICAL_WIDTH / 2), px(CAPTION_Y), step.caption, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(14))}px`, color: cssColor(PALETTE.hullWhite),
        align: 'center', wordWrap: { width: px(LOGICAL_WIDTH - 120) },
      })
      .setOrigin(0.5)
      .setDepth(DEPTH_UI);
    this.stepObjects.push(caption);

    const isLast = this.stepIndex === this.steps.length - 1;
    const nextBtn = addTextButton(this.scene, {
      x: px(isLast ? LOGICAL_WIDTH / 2 : LOGICAL_WIDTH / 2 + 90), y: px(BUTTON_ROW_Y), size: 14,
      label: isLast ? 'DONE' : 'NEXT', color: PALETTE.weaponCyan,
      onClick: () => { this.advance(); },
    }).setDepth(DEPTH_UI);
    this.stepObjects.push(nextBtn);

    if (!isLast) {
      const skipBtn = addTextButton(this.scene, {
        x: px(LOGICAL_WIDTH / 2 - 90), y: px(BUTTON_ROW_Y), size: 14,
        label: 'SKIP TOUR', color: 0x8888aa,
        onClick: () => { this.end(); },
      }).setDepth(DEPTH_UI);
      this.stepObjects.push(skipBtn);
    }
  }

  private advance(): void {
    this.stepIndex += 1;
    if (this.stepIndex >= this.steps.length) { this.end(); return; }
    this.renderStep();
  }

  /** Ends the tour immediately — safe to call at any step, including mid-tour. */
  end(): void {
    this.clearStep();
  }

  /** __cheat.hub.tourNext() — headless equivalent of tapping NEXT/DONE. */
  cheatNext(): void { this.advance(); }

  /** __cheat.hub.tourSkip() — headless equivalent of tapping SKIP TOUR. */
  cheatSkip(): void { this.end(); }
}
