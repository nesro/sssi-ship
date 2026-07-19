import { resolveAbilityAction } from '../core/cards';
import { activateAbility, setPriorityTarget, toggleAutoFire, toggleAutoShield, toggleRearWeapon } from '../core/combat';
import { CARD_ACTION_REROLL, CARD_ACTION_SKIP } from '../core/constants';
import { resolveNarrator } from '../core/narrator';
import { advanceTick } from '../core/tick';
import type { CombatScene } from './CombatScene';

/**
 * Dev-only `__cheat.combat.*` implementations (main.ts) — extracted from CombatScene.ts
 * (Phase C, fable-review-fixes-2026-07-18.md), a screenshot/test harness needs to reach
 * any point in a mission instantly rather than waiting through it or clicking. Sprite
 * sync happens for free: renderEnemies() (called every real frame from
 * CombatScene.update()) rebuilds its sprite map purely by diffing `scene.core.enemies`
 * against what's already on screen, so it's safe to call these mid-fast-forward and let
 * the next natural frame catch the view up — no manual re-sync needed.
 *
 * Holds a plain reference to the owning scene rather than duplicating its state — every
 * method here reads/writes `this.scene.core` (and a handful of other scene members
 * widened from `private` specifically so this class can reach them) exactly as the
 * original in-class methods did. CombatScene.ts's own `cheatXxx` methods are now thin
 * one-line delegates to this class, so `main.ts`'s `scene[method]` lookup convention
 * (unchanged) still finds them.
 */
export class CombatCheats {
  constructor(private readonly scene: CombatScene) {}

  /** __cheat.combat.fastForward(ticks) — advances the core simulation instantly,
   * auto-dismissing narrator lines and always picking the first card offer so a
   * support call or story beat along the way can't stall the jump. Guarded against
   * runaway loops (e.g. ticks requested past mission end). */
  fastForward(ticks: number): void {
    const { scene } = this;
    let advanced = 0;
    let guard = 0;
    const guardLimit = ticks * 20 + 1000;
    while (advanced < ticks && scene.core.status === 'running' && guard < guardLimit) {
      guard += 1;
      if (scene.core.pendingNarrator !== null) { resolveNarrator(scene.core); continue; }
      if (scene.core.pendingOffer !== null) { resolveAbilityAction(scene.core, 0); continue; }
      advanceTick(scene.core);
      advanced += 1;
    }
  }

  /** __cheat.combat.fastForwardToOffer(maxTicks) — like fastForward, but stops the
   * instant a support-call card offer opens instead of auto-resolving it, so the
   * Playwright harness can actually reach and verify CardOverlay's own hit areas/text
   * (every other tool deliberately fast-forwards *past* offers via flushPendingOffer).
   * Narrator popups still auto-resolve — they're not what this is for.
   * Returns immediately without advancing at all if an offer is ALREADY pending when
   * called — this finds the next *fresh* offer, it doesn't wait one out. To inspect one
   * offer then move to the next, resolve the current one first (fastForward(1)
   * auto-picks card 0 and moves past it — there's no separate dismiss-offer cheat, since
   * only the narrator modal needed one to reach its later scripted events one at a time,
   * see dismissNarrator). */
  fastForwardToOffer(maxTicks: number): void {
    const { scene } = this;
    let advanced = 0;
    let guard = 0;
    const guardLimit = maxTicks * 20 + 1000;
    while (advanced < maxTicks && scene.core.status === 'running' && guard < guardLimit) {
      guard += 1;
      if (scene.core.pendingOffer !== null) return;
      if (scene.core.pendingNarrator !== null) { resolveNarrator(scene.core); continue; }
      advanceTick(scene.core);
      advanced += 1;
    }
  }

  /** __cheat.combat.fastForwardToNarrator(maxTicks) — the narrator-modal mirror of
   * fastForwardToOffer: stops the instant a MissionSpec.narratorEvents popup opens
   * (the blocking modal with its own CONTINUE/NEXT button — not the passive bottom
   * NarratorBar strip, which never pauses the sim and needs no cheat to see) instead of
   * auto-resolving it. Also returns immediately without advancing if a narrator is
   * ALREADY pending — call dismissNarrator first to reach the next scripted event.
   * Currently only w0 defines narratorEvents, and w0 has no galaxy-map node
   * (docs/known-issues.md) — reachable here only via startMission('w0'), which bypasses
   * hub navigation same as any other mission id. */
  fastForwardToNarrator(maxTicks: number): void {
    const { scene } = this;
    let advanced = 0;
    let guard = 0;
    const guardLimit = maxTicks * 20 + 1000;
    while (advanced < maxTicks && scene.core.status === 'running' && guard < guardLimit) {
      guard += 1;
      if (scene.core.pendingNarrator !== null) return;
      if (scene.core.pendingOffer !== null) { resolveAbilityAction(scene.core, 0); continue; }
      advanceTick(scene.core);
      advanced += 1;
    }
  }

  /** __cheat.combat.markTarget(enemyId) — sets/clears the front weapon's priority
   * target without a real pointer click on the (possibly still-animating) sprite. */
  markTarget(enemyId: number | null): void {
    setPriorityTarget(this.scene.core, enemyId);
  }

  /** __cheat.combat.setToggle('fire'|'rear'|'shield', on) — sets a toggle to an exact
   * state (the real toggle functions just flip, which needs the current state to be
   * read first from JS anyway — this is the one-call version). */
  setToggle(system: 'fire' | 'rear' | 'shield', on: boolean): void {
    const { core } = this.scene;
    if (system === 'fire' && core.autoFireEnabled !== on) toggleAutoFire(core);
    if (system === 'rear' && core.rearWeaponEnabled !== on) toggleRearWeapon(core);
    if (system === 'shield' && core.autoShieldEnabled !== on) toggleAutoShield(core);
  }

  /** __cheat.combat.showExitConfirm() — opens the "ABANDON MISSION?" modal without a
   * real tap on the EXIT button, for screenshot/touch-target coverage of that state. */
  showExitConfirm(): void {
    this.scene.showExitConfirm();
  }

  /** __cheat.combat.confirmExit() — headless equivalent of tapping ABANDON on the exit-
   * confirm modal (opens it first if not already showing), for verifying the mid-
   * mission-abandon-to-hub transition doesn't regress the WebGL-restart crash class
   * (docs/known-issues.md, "CombatScene crashed... on any mission restart"). */
  confirmExit(): void {
    const { scene } = this;
    if (scene.exitConfirmObjects.length === 0) scene.showExitConfirm();
    scene.confirmAbandon();
  }

  /** __cheat.combat.dismissNarrator() — resolves the current narrator-modal event in
   * one shot (same core call the real CONTINUE button makes on its last line), so a
   * multi-event test (fastForwardToNarrator → dismissNarrator → fastForwardToNarrator)
   * can inspect each scripted narrator popup in a mission without pagination through
   * every line by hand. */
  dismissNarrator(): void {
    if (this.scene.core.pendingNarrator !== null) resolveNarrator(this.scene.core);
  }

  /** __cheat.combat.narratorNext() — headless equivalent of tapping NEXT → on the
   * narrator modal: advances to the next line WITHOUT resolving the whole popup (unlike
   * dismissNarrator). Line pagination lives entirely in the view (narratorLineIdx), not
   * core state, so this is the only way to reach a multi-line event's 2nd+ line
   * headlessly — e.g. to screenshot t1/t2's HUD-bar-callout lines specifically. Calling
   * it on the last line resolves the popup, same as a real tap on CONTINUE. */
  narratorNext(): void {
    const { scene } = this;
    const lines = scene.core.pendingNarrator;
    if (lines === null) return;
    if (scene.narratorLineIdx >= lines.length - 1) { resolveNarrator(scene.core); return; }
    scene.narratorLineIdx += 1;
    scene.showNarratorLine(lines, scene.narratorLineIdx);
  }

  /** __cheat.combat.pickCard(index) / rerollCard() / skipCard() — headless equivalents
   * of tapping a card in the offer overlay. Routes through the same handleCardAction()
   * the real click handler uses (not resolveAbilityAction directly), so the picked-
   * ability sidebar and overlay hide/show stay in sync exactly like a real pick would —
   * calling the core function directly here would silently desync the view the same way
   * fastForward's auto-pick-0 already does (docs/plans/comprehensive-coverage-sweep.md). */
  pickCard(index: number): void {
    this.scene.handleCardAction(index);
  }

  rerollCard(): void {
    this.scene.handleCardAction(CARD_ACTION_REROLL);
  }

  skipCard(): void {
    this.scene.handleCardAction(CARD_ACTION_SKIP);
  }

  /** __cheat.combat.activateAbility(slotIndex) — headless equivalent of tapping an
   * equipped ability's slot in the right panel. */
  activateAbility(slotIndex: number): void {
    activateAbility(this.scene.core, slotIndex);
  }

  /** __cheat.combat.fireSideWeapon() — headless equivalent of tapping the side-weapon
   * button. No-op (matching the real tap handler) if the weapon can't currently fire. */
  fireSideWeapon(): void {
    this.scene.handleSideWeaponTap();
  }

  /** __cheat.combat.activateSupply(slot) — headless equivalent of tapping a BOOST
   * button. No-op (matching the real tap handler) if that slot has no charges left. */
  activateSupply(slot: number): void {
    this.scene.handleBoostTap(slot);
  }

  /** __cheat.combat.inspect() — a JSON-safe snapshot of ship/enemy state for a
   * screenshot harness to read back and decide what to do next (e.g. which enemy id
   * to pass to markTarget). */
  inspect(): unknown {
    const { core, narrator } = this.scene;
    return {
      missionId: core.mission.id,
      tick: core.tick,
      // Added 2026-07-17/18 (polish-loop, Fable's review of the advanceUntil silent-
      // timeout fix) — `tick` alone can't distinguish "genuinely still early in the
      // mission" from "stuck behind a blocksConveyor freeze": timeline.ts's
      // advanceTimeline stalls timelineTick entirely while any blocker/turret/boss/
      // booster is alive, so `tick` (the real per-advance counter) keeps climbing while
      // `timelineTick` (what wave-spawn schedules are checked against) doesn't move at
      // all — exactly the gap that made combat-m6-boss's advanceUntil predicate never
      // fire within its tick budget. Surfaced in advanceUntil's timeout error message.
      timelineTick: core.timelineTick,
      status: core.status,
      priorityTargetId: core.priorityTargetId,
      hasPendingOffer: core.pendingOffer !== null,
      // Lets the screenshot harness poll for "the bottom NarratorBar's current line has
      // finished its typewriter reveal" instead of sleeping a fixed duration — see
      // NarratorBar.isFullyRevealed's own doc comment.
      narratorFullyRevealed: narrator.isFullyRevealed(),
      ship: {
        hull: core.ship.hull, maxHull: core.ship.maxHull,
        shield: core.ship.shield, energy: core.ship.energy,
      },
      enemies: core.enemies.map((e) => ({
        id: e.id, kind: e.kind, distance: e.distance, hp: e.hp, maxHp: e.maxHp,
        holdChargeTicks: e.holdChargeTicks, blocksConveyor: e.blocksConveyor,
      })),
    };
  }
}
