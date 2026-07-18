import Phaser from 'phaser';
import { cssColor, PALETTE } from './palette';
import { fontPx, LOGICAL_WIDTH, px } from './layout';
import { addModalBackdrop, addTextButton, drawPointerArrow, UI_FONT } from './widgets';

export interface TourStep {
  /** Matched against every GameObject sharing this `.setData('tourId', ...)` tag on
   * screen — see HubScene.ts's buildMainMenu (single combined button) or
   * buildShopContent/renderDRLeftPanel (a background rectangle plus one-or-more
   * separate label Texts, all tagged with the SAME tourId so the whole row/tab gets
   * highlighted as one visual unit, not just its background). A step with no matching
   * target on screen just shows the caption and NEXT/SKIP with no highlight ring or
   * arrow, rather than throwing (defensive: a future layout change removing a tagged
   * element shouldn't crash the tour for everyone else). */
  tourId: string;
  caption: string;
}

const DEPTH_BACKDROP = 50;
const DEPTH_TARGET = 51;
const DEPTH_UI = 52;
const RING_PADDING = 8;

// Popup-card style matching the tutorial narrator modal (2026-07-17, playtest
// feedback: "the tutorial is better with the popup windows, I would like to have the
// same style even in the main menu tutorial... maybe with arrows"), not the old plain-
// caption-plus-ring look. Fixed position, not next-to-target: NAV_ITEMS' 5 main-menu
// buttons (HubScene.ts) are stacked vertically 142-398, but only the first 4 are ever
// tour targets (CREDITS, y=398, deliberately isn't — see HubScene.ts's HUB_TOUR_STEPS
// comment) — so y=370-520 is clear of every real target's ring, at any step, without
// needing to dynamically dodge whichever button is currently highlighted.
const PANEL_W = 640;
const PANEL_H = 150;
const PANEL_CX = LOGICAL_WIDTH / 2;
const PANEL_CY = 445;
const BUTTON_ROW_Y = PANEL_CY + 48;

/** Matches ensureMinTapTarget's parameter type (widgets.ts) — the concrete Phaser
 * classes that actually declare setDepth/getBounds/setInteractive/disableInteractive,
 * unlike the generic GameObject base type. */
type Targetable = Phaser.GameObjects.Text | Phaser.GameObjects.Shape | Phaser.GameObjects.Image;

/**
 * Coach-mark tour: dims the screen, highlights the real, currently-on-screen UI
 * element(s) tagged for each step by temporarily raising their depth above the dim
 * backdrop (so they render un-obscured — no visual clone needed) and disabling their
 * input for the tour's duration (so tapping the spotlighted target can't navigate away
 * mid-explanation and destroy the very object(s) the tour is tracking — see
 * docs/plans/first-open-and-tutorial-tour.md's Part B for why this replaced the
 * originally-sketched "just raise the depth" approach). Targets are found at each step
 * by scanning the scene for every GameObject sharing a `.setData('tourId', ...)` tag and
 * reading real `getBounds()` (unioned across all of them for the ring), not by
 * recomputing layout math — one tourId can tag multiple sibling objects (a row's
 * background plus its separate label Text(s)), fixed 2026-07-17/18 after screenshots
 * showed shop/dispatch tour targets rendering as an empty highlighted box with no label
 * inside it, since only the background had ever been tagged. A fixed-position popup
 * card (below the button block, see PANEL_CY's comment) explains the step, connected to
 * the ring by an arrow (drawPointerArrow, widgets.ts) — same visual language as the
 * tutorial narrator modal (CombatScene.ts's showNarratorLine).
 */
export class HubTour {
  private readonly scene: Phaser.Scene;
  private readonly steps: TourStep[];
  private stepIndex = 0;
  private stepObjects: Phaser.GameObjects.GameObject[] = [];
  // One tourId can tag MULTIPLE sibling GameObjects (2026-07-17/18 fix) — a shop tab or
  // dispatch row is a background rectangle plus one-or-more separate label Texts, not a
  // single combined object like the main-menu buttons (addTextButton bakes its
  // background into the Text's own style, so it was never affected). Raising only the
  // tagged rectangle's depth left sibling labels hidden behind the dim backdrop — the
  // highlighted target rendered as an empty box with no text in it. Each entry's own
  // `depth` is its ORIGINAL depth before this step raised it; `wasEnabled` is whether
  // input was actually ENABLED (not just present) before disableInteractive() touched
  // it — distinct from "had an InteractiveObject at all," so a target that was
  // interactive-but-already-disabled before the tour (none currently exist, but a
  // future star-locked/disabled tab could) doesn't get silently force-re-enabled on
  // restore. Both restored in clearStep().
  private currentTargets: { obj: Targetable; depth: number; wasEnabled: boolean }[] = [];

  constructor(scene: Phaser.Scene, steps: TourStep[]) {
    this.scene = scene;
    this.steps = steps;
    this.renderStep();
  }

  private findTargets(tourId: string): Targetable[] {
    return this.scene.children.list.filter((obj) => obj.getData('tourId') === tourId) as Targetable[];
  }

  private clearStep(): void {
    this.stepObjects.forEach((obj) => { obj.destroy(); });
    this.stepObjects = [];
    for (const { obj, depth, wasEnabled } of this.currentTargets) {
      obj.setDepth(depth);
      // Only re-enable input on objects that were actually ENABLED before this step —
      // label Texts were never interactive to begin with; blindly calling
      // setInteractive() on all of them would make plain labels newly clickable with no
      // handler and, since each label renders above its own row's bg at the same depth,
      // would silently swallow taps meant for the row underneath once the tour ends
      // (topOnly input) — a real regression, not a neutral restore. Verified via a
      // post-tour click on a shop tab's LABEL TEXT (not just its background) confirming
      // the tab still switches.
      if (wasEnabled) obj.setInteractive();
    }
    this.currentTargets = [];
  }

  private renderStep(): void {
    this.clearStep();
    const step = this.steps[this.stepIndex];
    if (step === undefined) { return; }

    this.stepObjects.push(addModalBackdrop(this.scene, DEPTH_BACKDROP));

    let targetRingBounds: Phaser.Geom.Rectangle | null = null;
    const targets = this.findTargets(step.tourId);
    if (targets.length > 0) {
      // Depth ties (all raised to DEPTH_TARGET) break by display-list order, which this
      // doesn't change — a row/tab's label Text is always added after its own
      // background rectangle at the call site, so labels keep rendering on top, same as
      // in normal (non-tour) rendering.
      const first = targets[0] as Targetable;
      this.currentTargets.push({ obj: first, depth: first.depth, wasEnabled: first.input?.enabled ?? false });
      first.setDepth(DEPTH_TARGET);
      first.disableInteractive();
      let bounds = first.getBounds();
      for (const target of targets.slice(1)) {
        this.currentTargets.push({ obj: target, depth: target.depth, wasEnabled: target.input?.enabled ?? false });
        target.setDepth(DEPTH_TARGET);
        target.disableInteractive();
        bounds = Phaser.Geom.Rectangle.Union(bounds, target.getBounds());
      }
      const pad = px(RING_PADDING);
      targetRingBounds = new Phaser.Geom.Rectangle(bounds.x - pad, bounds.y - pad, bounds.width + pad * 2, bounds.height + pad * 2);
      const ring = this.scene.add.graphics().setDepth(DEPTH_TARGET);
      ring.lineStyle(px(2), PALETTE.weaponCyan, 1);
      ring.strokeRect(targetRingBounds.x, targetRingBounds.y, targetRingBounds.width, targetRingBounds.height);
      this.stepObjects.push(ring);
    }

    // Same dark bordered-card look as the tutorial narrator modal (CombatScene.ts's
    // showNarratorLine) — the whole point of this restyle.
    const panelBounds = new Phaser.Geom.Rectangle(
      px(PANEL_CX - PANEL_W / 2), px(PANEL_CY - PANEL_H / 2), px(PANEL_W), px(PANEL_H),
    );
    this.stepObjects.push(
      // Fully opaque (not narrator-modal's 0.97) — this panel's y-range overlaps the
      // CREDITS nav button (NAV_ITEMS' 5th entry, y=398, not a tour target but still
      // present and dimmed-but-visible under the backdrop like every other button), and
      // 0.97 let a faint ghost of it bleed through right at the panel's top edge.
      this.scene.add.rectangle(px(PANEL_CX), px(PANEL_CY), px(PANEL_W), px(PANEL_H), 0x080820, 1)
        .setStrokeStyle(px(1), 0x334466)
        .setDepth(DEPTH_UI),
    );
    this.stepObjects.push(
      this.scene.add.text(px(PANEL_CX + PANEL_W / 2 - 8), px(PANEL_CY - PANEL_H / 2 + 7),
        `${String(this.stepIndex + 1)}/${String(this.steps.length)}`, {
          fontFamily: UI_FONT, fontSize: `${String(fontPx(9))}px`, color: '#444466',
        }).setOrigin(1, 0).setDepth(DEPTH_UI + 1),
    );
    this.stepObjects.push(
      this.scene.add.text(px(PANEL_CX), px(PANEL_CY - 32), step.caption, {
        fontFamily: UI_FONT, fontSize: `${String(fontPx(14))}px`, color: cssColor(PALETTE.hullWhite),
        align: 'center', wordWrap: { width: px(PANEL_W - 60) },
      }).setOrigin(0.5, 0).setDepth(DEPTH_UI + 1),
    );

    if (targetRingBounds !== null) {
      this.stepObjects.push(drawPointerArrow(this.scene, panelBounds, targetRingBounds, PALETTE.weaponCyan, DEPTH_UI + 1));
    }

    const isLast = this.stepIndex === this.steps.length - 1;
    const nextBtn = addTextButton(this.scene, {
      x: px(isLast ? PANEL_CX : PANEL_CX + 90), y: px(BUTTON_ROW_Y), size: 14,
      label: isLast ? 'DONE' : 'NEXT →', color: PALETTE.weaponCyan,
      onClick: () => { this.advance(); },
    }).setDepth(DEPTH_UI + 1);
    this.stepObjects.push(nextBtn);

    if (!isLast) {
      const skipBtn = addTextButton(this.scene, {
        x: px(PANEL_CX - 90), y: px(BUTTON_ROW_Y), size: 14,
        label: 'SKIP TOUR', color: 0x8888aa,
        onClick: () => { this.end(); },
      }).setDepth(DEPTH_UI + 1);
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
