// Runtime touch-target auditor — checks every interactive element on a given screen
// against docs/design/04-screens-and-layout.md's mobile safe-zone rule: minimum 44×44
// logical-px tap area, and never closer than 20px to any screen edge. Also checks that
// no two hit areas overlap — a bigger box tapped at the wrong moment is a worse bug
// than a small one.
//
// Usage: pnpm audit-taps                      # every STATE below
//        pnpm audit-taps "Combat: m1 early"   # only the named state(s)
//
// Assumption (documented, not yet a real constraint): every audited object is unscaled
// and unrotated. True for every current UI element; if a scaled/rotated interactive
// object is ever added, this tool's world-bounds math needs to grow with it.
//
// Enemy sprites are excluded via the isGameplayEntity data tag (CombatScene.ts's
// renderEnemies) rather than by luck-of-timing — combat states below deliberately
// advance far enough that enemies are on screen during the audit, so this exclusion
// is actually exercised, not just theoretically present.

import { chromium } from 'playwright';
import type { Page } from 'playwright';
import {
  bootToHub, cheat, DEVICE_SCALE_FACTOR, driveThroughOnboardingIfShown, flushPendingOffer, SETTLE_MS, VIEWPORT,
  waitForMissionReady, waitForSceneActive,
} from './playwrightHarness';
import type { CombatSnapshot } from './playwrightHarness';

const MIN_TAP = 44;
const EDGE_MARGIN = 20;
const LOGICAL_WIDTH = 960;
const LOGICAL_HEIGHT = 540;

interface HitBox {
  label: string;
  left: number; top: number; right: number; bottom: number;
}

interface AuditState {
  name: string;
  sceneKey: string;
  setup?: (page: Page) => Promise<void>;
  /** Skip the automatic flushPendingOffer() — for the one state whose whole point is a
   * pending offer (see screenshot.ts's identical Shot.skipFlush). */
  skipFlush?: boolean;
}

const STATES: AuditState[] = [
  { name: 'Hub: main menu', sceneKey: 'HubScene', setup: (p) => cheat(p, 'navTo', null) },
  { name: 'Hub: missions map', sceneKey: 'HubScene', setup: (p) => cheat(p, 'navTo', 'missions') },
  { name: 'Hub: mission detail panel', sceneKey: 'HubScene', setup: (p) => cheat(p, 'selectMission', 'm1') },
  // The trailing tourSkip on the shop/dispatch states: a first visit auto-fires that
  // screen's coach-mark tour (setNav, HubScene.ts), whose SKIP TOUR/NEXT buttons sit
  // right on top of the level-chip row — so without it these states audited
  // "screen + tour" (flagging chip×tour-button overlaps that the tour's own backdrop
  // makes unreachable in practice) instead of the plain screen their names claim.
  // The tours themselves keep their own dedicated states below. Null-safe when no
  // tour fired (cheatTourSkip is `this.hubTour?.`).
  { name: 'Hub: shop weapon tab', sceneKey: 'HubScene', setup: async (p) => { await cheat(p, 'navShop', 'weapon'); await cheat(p, 'hub.tourSkip'); } },
  { name: 'Hub: shop loadout tab', sceneKey: 'HubScene', setup: async (p) => { await cheat(p, 'navShop', 'loadout'); await cheat(p, 'hub.tourSkip'); } },
  { name: 'Hub: shop supplies tab', sceneKey: 'HubScene', setup: async (p) => { await cheat(p, 'navShop', 'supplies'); await cheat(p, 'hub.tourSkip'); } },
  { name: 'Hub: dispatch reinforcements', sceneKey: 'HubScene', setup: async (p) => { await cheat(p, 'selectSubscription', 'sub-offensive'); await cheat(p, 'hub.tourSkip'); } },
  { name: 'Hub: settings', sceneKey: 'HubScene', setup: (p) => cheat(p, 'navTo', 'settings') },
  { name: 'Hub: credits', sceneKey: 'HubScene', setup: (p) => cheat(p, 'navTo', 'credits') },
  // Only step 1 audited, not all 5 — each step's NEXT/SKIP TOUR controls share the same
  // layout/depth pattern (HubTour.ts), so one step is representative; the actual per-
  // step content (which button is highlighted) is verified visually via
  // tools/screenshot.ts's hub-tour-step-1..5 shots instead.
  { name: 'Hub: button tour, step 1', sceneKey: 'HubScene', setup: (p) => cheat(p, 'hub.showTour') },
  // Same reasoning as above — one step each is representative of the shared HubTour
  // layout; per-step content covered visually by screenshot.ts's hub-shop-tour-step-*/
  // hub-dispatch-tour-step-* shots.
  { name: 'Hub: shop tour, step 1', sceneKey: 'HubScene', setup: (p) => cheat(p, 'hub.showShopTour') },
  { name: 'Hub: dispatch tour, step 1', sceneKey: 'HubScene', setup: (p) => cheat(p, 'hub.showDispatchTour') },
  {
    name: 'Combat: m1 early (minimal loadout)',
    sceneKey: 'CombatScene',
    setup: async (p) => {
      await cheat(p, 'startMission', 'm1');
      await waitForMissionReady(p, 'm1');
      await cheat(p, 'combat.fastForward', 30);
    },
  },
  {
    name: 'Combat: m1 endgame loadout (rear+side+3 supplies)',
    sceneKey: 'CombatScene',
    setup: async (p) => {
      await cheat(p, 'equip', 'pulse-4');
      await cheat(p, 'equip', 'grenade-3');
      await cheat(p, 'equip', 'focus-3');
      await cheat(p, 'buySupply', 'sup-shield');
      await cheat(p, 'buySupply', 'sup-energy');
      await cheat(p, 'buySupply', 'sup-damage');
      await cheat(p, 'startMission', 'm1');
      await waitForMissionReady(p, 'm1');
      await cheat(p, 'combat.fastForward', 30);
    },
  },
  {
    name: 'Combat: card offer overlay',
    sceneKey: 'CombatScene',
    skipFlush: true, // the whole point of this state IS the pending offer
    setup: async (p) => {
      await cheat(p, 'startMission', 'm1');
      await waitForMissionReady(p, 'm1');
      await cheat(p, 'combat.fastForwardToOffer', 300);
      // See tools/screenshot.ts's identical check on its combat-card-overlay shot: fail
      // loudly if no offer opened, rather than silently auditing ordinary combat.
      const snap = await cheat<CombatSnapshot>(p, 'combat.inspect');
      if (!snap.hasPendingOffer) throw new Error('Combat: card offer overlay: no offer opened within 300 ticks');
    },
  },
  {
    // showReroll:false branch (CardOverlay.ts) — SKIP alone, centered, a genuinely
    // different hit-area layout than the SKIP+REROLL pair above, never audited before.
    name: 'Combat: card offer, rerolls exhausted',
    sceneKey: 'CombatScene',
    skipFlush: true,
    setup: async (p) => {
      await cheat(p, 'startMission', 'm1');
      await waitForMissionReady(p, 'm1');
      await cheat(p, 'combat.fastForwardToOffer', 300);
      await cheat(p, 'combat.rerollCard'); // REROLLS_PER_MISSION = 2
      await cheat(p, 'combat.rerollCard');
      const snap = await cheat<CombatSnapshot>(p, 'combat.inspect');
      if (!snap.hasPendingOffer) throw new Error('Combat: card offer, rerolls exhausted: no offer pending after reroll');
    },
  },
  {
    name: 'Combat: narrator modal',
    sceneKey: 'CombatScene',
    // See tools/screenshot.ts's identical combat-narrator-modal shot: a no-op today
    // (w0 has no supportCallTicks) but cheap insurance against a future co-pending
    // offer racing this narrator via flushPendingOffer.
    skipFlush: true,
    setup: async (p) => {
      await cheat(p, 'startMission', 'w0');
      await waitForMissionReady(p, 'w0');
      await cheat(p, 'combat.fastForwardToNarrator', 300);
    },
  },
  {
    name: 'Combat: exit-confirm modal',
    sceneKey: 'CombatScene',
    setup: async (p) => {
      await cheat(p, 'startMission', 'm1');
      await waitForMissionReady(p, 'm1');
      await cheat(p, 'combat.fastForward', 30);
      await cheat(p, 'combat.showExitConfirm');
    },
  },
  {
    name: 'Result scene',
    sceneKey: 'ResultScene',
    setup: async (p) => {
      await cheat(p, 'equip', 'pulse-4');
      await cheat(p, 'equip', 'shield-wall-3');
      await cheat(p, 'startMission', 'm1');
      await waitForMissionReady(p, 'm1');
      await cheat(p, 'combat.fastForward', 6000);
      await waitForSceneActive(p, 'ResultScene', 5000);
    },
  },
  {
    // reset() wipes the save — must run last, same convention this file has always
    // used for its one reset()-based state (every state above assumes unlockAll()'s
    // baseline). Audits the missions map's tap targets on a genuinely fresh save.
    name: 'Hub: missions map, fresh save',
    sceneKey: 'HubScene',
    setup: async (p) => {
      await cheat(p, 'reset');
      await driveThroughOnboardingIfShown(p);
      await cheat(p, 'navTo', 'missions');
    },
  },
  {
    // AlphaNoticeScene's own CONTINUE/RESET PROGRESS buttons — a second, self-contained
    // reset()-based state, safe to run in any order relative to the one above since
    // both wipe the save themselves rather than depending on a prior state's baseline.
    name: 'Alpha/dev-build notice screen',
    sceneKey: 'AlphaNoticeScene',
    setup: async (p) => {
      await cheat(p, 'reset');
      await waitForSceneActive(p, 'AlphaNoticeScene');
    },
  },
];

/** World-space hit-area bounds for an unscaled, unrotated GameObject — see the file
 * header's documented assumption. Phaser's hitArea rectangle is defined in the object's
 * local frame with (0,0) at the un-origin-shifted top-left; this reverses that offset.
 *
 * page.evaluate() serializes its callback via `.toString()` and runs it in the browser
 * with no access to the Node process. tsx's esbuild transform injects a `__name(...)`
 * helper call to preserve `.name` on *any* named function binding — a `function`
 * declaration, or even `const x = () => {}` — which then throws ReferenceError in the
 * browser (confirmed by hitting exactly this). Only a fully anonymous function
 * *expression*, passed inline with no identifier for esbuild to want to preserve,
 * survives serialization — hence this stays inlined at its one call site (auditState)
 * rather than factored out, and uses an explicit stack instead of named recursion. */
function evaluateHitBoxes(page: Page): Promise<HitBox[]> {
  return page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment,
       @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call,
       @typescript-eslint/no-unsafe-argument, @typescript-eslint/restrict-plus-operands
       -- runs inside page.evaluate against untyped Phaser internals */
    const g = window as any;
    const results: { label: string; left: number; top: number; right: number; bottom: number }[] = [];
    const stack: any[] = [...g.__game.scene.getScenes(true)[0].children.list];
    while (stack.length > 0) {
      const obj = stack.pop();
      if (obj.list) stack.push(...obj.list); // Containers (none exist today, but future-proof)
      // Enemy sprites (CombatScene.ts's renderEnemies) are tap-to-target combat entities,
      // not UI controls — sized by gameplay balance, not the mobile safe-zone rule. Tagged
      // with isGameplayEntity at creation so this exclusion is real code, not prose.
      const isGameplayEntity = typeof obj.getData === 'function' && obj.getData('isGameplayEntity') === true;
      if (!isGameplayEntity && obj.input && obj.input.enabled && obj.input.hitArea) {
        const ha = obj.input.hitArea;
        const originX = obj.originX ?? 0;
        const originY = obj.originY ?? 0;
        const w = obj.displayWidth ?? obj.width ?? 0;
        const h = obj.displayHeight ?? obj.height ?? 0;
        const left = obj.x - originX * w + ha.x;
        const top = obj.y - originY * h + ha.y;
        results.push({
          label: obj.text ? String(obj.text).slice(0, 24) : `${String(obj.type)}@${String(Math.round(obj.x))},${String(Math.round(obj.y))}`,
          left, top, right: left + ha.width, bottom: top + ha.height,
        });
      }
    }
    const dpr = g.__game.config.zoom ? 1 / g.__game.config.zoom : 1;
    return results.map((r) => ({
      label: r.label, left: r.left / dpr, top: r.top / dpr, right: r.right / dpr, bottom: r.bottom / dpr,
    }));
    /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment,
       @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call,
       @typescript-eslint/no-unsafe-argument, @typescript-eslint/restrict-plus-operands */
  });
}

function boxesOverlap(a: HitBox, b: HitBox): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

// Set by main()'s pageerror handler via setPageError(), reset/read via takePageError()
// before/after each state's setup — a page exception during setup (e.g. the
// WebGL-restart crash known-issues.md documents) used to only print a console line
// while the state was still audited (and likely reported spuriously clean, since a
// crashed frame often has zero live interactive elements) and the run always exited 0
// regardless. See screenshot.ts's identical pattern, including why these are functions
// rather than a bare variable (TypeScript's control-flow narrowing persists a `!== null`
// check through `await` points even though the pageerror listener can reassign the
// underlying variable asynchronously in between; a function call's return type isn't
// narrowed by the caller's prior flow analysis the same way a direct reference is).
let lastPageError: string | null = null;
function setPageError(message: string): void { lastPageError = message; }
function takePageError(): string | null { const m = lastPageError; lastPageError = null; return m; }

/** Runs a state's own setup, settling the page and flushing any pending offer twice —
 * once after setup, once again right before the caller reads the DOM (real time passes
 * between the two; see combat-m4-turret's race in known-issues.md for why one check
 * isn't enough). Throws if a page exception happened anywhere in this window. */
async function runStateSetup(page: Page, state: AuditState): Promise<void> {
  if (state.setup) await state.setup(page);
  await page.waitForTimeout(SETTLE_MS);
  if (state.skipFlush !== true) await flushPendingOffer(page);
  const errorDuringSetup = takePageError();
  if (errorDuringSetup !== null) {
    throw new Error(`page exception during setup: ${errorDuringSetup}`);
  }
  if (state.skipFlush !== true) await flushPendingOffer(page);
}

function isSceneActive(page: Page, sceneKey: string): Promise<boolean> {
  return page.evaluate((key) => {
    const g = window as unknown as { __game?: { scene: { isActive: (k: string) => boolean } } };
    return g.__game?.scene.isActive(key) === true;
  }, sceneKey);
}

// addModalBackdrop (widgets.ts) is a full-screen click-catcher by design — it exists to
// swallow taps *around* a modal, not to be tapped itself, so the 44×44/20px-edge rules
// (written for discrete controls) don't apply to it. Anything covering ≥90% of the
// screen in both dimensions is treated as a backdrop and excluded, not just from size/
// edge checks but from the overlap check too (a modal's own buttons legitimately sit
// "inside" it).
function isBackdrop(b: HitBox): boolean {
  return (b.right - b.left) >= LOGICAL_WIDTH * 0.9 && (b.bottom - b.top) >= LOGICAL_HEIGHT * 0.9;
}

function checkTapTargetSizesAndEdges(boxes: HitBox[]): number {
  let failures = 0;
  for (const box of boxes) {
    const w = box.right - box.left;
    const h = box.bottom - box.top;
    const problems: string[] = [];
    if (w < MIN_TAP - 0.5 || h < MIN_TAP - 0.5) problems.push(`size ${w.toFixed(0)}x${h.toFixed(0)} < ${String(MIN_TAP)}`);
    if (box.left < EDGE_MARGIN) problems.push(`left edge ${box.left.toFixed(0)}px < ${String(EDGE_MARGIN)}`);
    if (box.top < EDGE_MARGIN) problems.push(`top edge ${box.top.toFixed(0)}px < ${String(EDGE_MARGIN)}`);
    if (LOGICAL_WIDTH - box.right < EDGE_MARGIN) problems.push(`right edge ${(LOGICAL_WIDTH - box.right).toFixed(0)}px < ${String(EDGE_MARGIN)}`);
    if (LOGICAL_HEIGHT - box.bottom < EDGE_MARGIN) problems.push(`bottom edge ${(LOGICAL_HEIGHT - box.bottom).toFixed(0)}px < ${String(EDGE_MARGIN)}`);
    if (problems.length > 0) {
      failures += 1;
      console.log(`FAIL  ${box.label}  —  ${problems.join('; ')}`);
    }
  }
  return failures;
}

function checkOverlaps(boxes: HitBox[]): number {
  let failures = 0;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]; const b = boxes[j];
      if (a !== undefined && b !== undefined && boxesOverlap(a, b)) {
        failures += 1;
        console.log(`FAIL  overlap: "${a.label}" × "${b.label}"`);
      }
    }
  }
  return failures;
}

async function auditState(page: Page, state: AuditState): Promise<number> {
  await runStateSetup(page, state);

  if (!(await isSceneActive(page, state.sceneKey))) {
    console.log(`\n=== ${state.name}: ${state.sceneKey} not active, skipping ===`);
    return 0;
  }

  const allBoxes = await evaluateHitBoxes(page);
  const backdropCount = allBoxes.filter(isBackdrop).length;
  const boxes = allBoxes.filter((b) => !isBackdrop(b));
  console.log(`\n=== ${state.name} (${String(boxes.length)} interactive elements`
    + `${backdropCount > 0 ? `, ${String(backdropCount)} full-screen backdrop(s) excluded` : ''}) ===`);

  const failures = checkTapTargetSizesAndEdges(boxes) + checkOverlaps(boxes);
  if (failures === 0) console.log('ok — all elements pass');
  return failures;
}

/** Regression guard for `HubTour.ts`'s `clearStep()`: a target's label Text (never
 * interactive before the tour — only tagged so the tour can raise/dim it, same tourId
 * as its background rectangle) must not become clickable-with-no-handler once the
 * tour ends. `clearStep()` only calls `setInteractive()` on targets that were actually
 * enabled beforehand for exactly this reason — a mistaken blanket re-enable would make
 * the label swallow taps meant for the row underneath it (same depth, rendered on top).
 * Verified once via a discarded manual probe (docs/known-issues.md); promoted into a
 * permanent, automated check here so a regression can't land silently. Drives a REAL
 * click (not just an internal-state read) at the label's own on-screen position, on a
 * shop tab that ISN'T already active, and confirms the tab actually switches.
 *
 * Targets `shop-tab-loadout` specifically, not the last step in `SHOP_TOUR_STEPS` —
 * `tourSkip()` right after `showShopTour()` ends the tour on its FIRST step (loadout);
 * a later step's targets are never added to `clearStep()`'s own list at all in that
 * flow, so checking one would pass regardless of whether the fix this guards is even
 * present (confirmed by deliberately reintroducing the bug during development — this
 * check only caught it once retargeted to the step actually visited before skipping). */
async function checkShopTabLabelClickableAfterTourEnds(page: Page): Promise<number> {
  await cheat(page, 'navShop', 'weapon');
  await cheat(page, 'hub.showShopTour');
  await cheat(page, 'hub.tourSkip');

  const label = await page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment,
       @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call,
       @typescript-eslint/restrict-plus-operands -- runs inside page.evaluate against untyped Phaser internals */
    const g = window as any;
    const scene = g.__game.scene.getScene('HubScene');
    const obj = scene.children.list.find(
      (o: any) => o.getData('tourId') === 'shop-tab-loadout' && typeof o.text === 'string',
    );
    if (!obj) return null;
    const bounds = obj.getBounds();
    const dpr = g.__game.config.zoom ? 1 / g.__game.config.zoom : 1;
    return { x: (bounds.x + bounds.width / 2) / dpr, y: (bounds.y + bounds.height / 2) / dpr };
    /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment,
       @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call,
       @typescript-eslint/restrict-plus-operands */
  });
  if (label === null) {
    console.error('✗ Hub tour regression: shop-tab-loadout label Text not found');
    return 1;
  }

  await page.mouse.click(label.x, label.y);
  await page.waitForTimeout(SETTLE_MS);
  const tabAfterClick = await page.evaluate(() => {
    const g = window as unknown as { __game?: { scene: { getScene: (k: string) => Record<string, unknown> } } };
    const scene = g.__game?.scene.getScene('HubScene');
    return (scene?.['uiState'] as { tab?: string } | undefined)?.tab;
  });
  if (tabAfterClick !== 'loadout') {
    console.error(
      `✗ Hub tour regression: clicking the MY LOADOUT tab's label text after the shop tour ended did not switch tabs ` +
      `(tab is "${String(tabAfterClick)}") — a stale interactive label may be swallowing the tap`,
    );
    return 1;
  }
  return 0;
}

async function main(): Promise<void> {
  const requested = process.argv.slice(2);
  const states = requested.length > 0 ? STATES.filter((s) => requested.includes(s.name)) : STATES;
  if (states.length === 0) {
    console.error(`No matching states. Known:\n${STATES.map((s) => `  ${s.name}`).join('\n')}`);
    process.exit(1);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: DEVICE_SCALE_FACTOR });
  page.on('pageerror', (err) => {
    const message = err.stack ?? err.message;
    console.error(`[page exception] ${message}`);
    setPageError(message);
  });
  await bootToHub(page);
  await cheat(page, 'unlockAll');
  // Coins too, not just unlockAll's stars/completions: with 0 coins every shop/dispatch
  // level chip renders 'unaffordable' → dimmed → never setInteractive — so the chip
  // grids would be structurally invisible to this audit and their sub-44px hit areas
  // would go unflagged. A rich save makes the chips purchasable and therefore audited.
  await cheat(page, 'setCoins', 999999);

  let totalFailures = 0;
  let previousStateName = 'boot';
  for (const state of states) {
    // Checked, not blindly cleared: an error landing after the PREVIOUS state's own
    // check must be surfaced against the state it actually happened after, not
    // silently discarded and attributed to nobody.
    const strayError = takePageError();
    if (strayError !== null) {
      totalFailures += 1;
      console.error(`✗ page exception after ${previousStateName} (before ${state.name} started): ${strayError}`);
    }
    try {
      totalFailures += await auditState(page, state);
    } catch (err) {
      console.error(`✗ ${state.name} errored:`, err instanceof Error ? err.message : err);
      totalFailures += 1;
    }
    previousStateName = state.name;
  }
  // Same check, once more after the loop — an error during the LAST state's own
  // measurement pass would otherwise never be looked at at all.
  const trailingError = takePageError();
  if (trailingError !== null) {
    totalFailures += 1;
    console.error(`✗ page exception after ${previousStateName} (run ending): ${trailingError}`);
  }

  // Always runs, independent of any state-name filter on the command line — this is a
  // standing regression guard, not one of the per-screen STATES above.
  totalFailures += await checkShopTabLabelClickableAfterTourEnds(page);

  await browser.close();
  console.log(`\n${totalFailures === 0 ? '✓' : '✗'} ${String(totalFailures)} failure(s) across ${String(states.length)} state(s).`);
  process.exit(totalFailures === 0 ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
