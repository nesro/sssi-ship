// Runtime touch-target auditor — checks every interactive element on a given screen
// against docs/design/04-screens-and-layout.md's mobile safe-zone rule: minimum 44×44
// logical-px tap area, and never closer than 20px to any screen edge. Also checks that
// no two hit areas overlap (a bigger box tapped at the wrong moment is a worse bug than
// a small one — see docs/plans/touch-target-and-polish-pass.md).
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
  bootToHub, cheat, flushPendingOffer, SETTLE_MS, VIEWPORT, waitForMissionReady, waitForSceneActive,
} from './playwrightHarness';

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
}

const STATES: AuditState[] = [
  { name: 'Hub: main menu', sceneKey: 'HubScene', setup: (p) => cheat(p, 'navTo', null) },
  { name: 'Hub: missions map', sceneKey: 'HubScene', setup: (p) => cheat(p, 'navTo', 'missions') },
  { name: 'Hub: shop weapon tab', sceneKey: 'HubScene', setup: (p) => cheat(p, 'navShop', 'weapon') },
  { name: 'Hub: shop loadout tab', sceneKey: 'HubScene', setup: (p) => cheat(p, 'navShop', 'loadout') },
  { name: 'Hub: shop supplies tab', sceneKey: 'HubScene', setup: (p) => cheat(p, 'navShop', 'supplies') },
  { name: 'Hub: dispatch reinforcements', sceneKey: 'HubScene', setup: (p) => cheat(p, 'selectSubscription', 'sub-offensive') },
  { name: 'Hub: settings', sceneKey: 'HubScene', setup: (p) => cheat(p, 'navTo', 'settings') },
  // Only step 1 audited, not all 4 — each step's NEXT/SKIP TOUR controls share the same
  // layout/depth pattern (HubTour.ts), so one step is representative; the actual per-
  // step content (which button is highlighted) is verified visually via
  // tools/screenshot.ts's hub-tour-step-1..4 shots instead.
  { name: 'Hub: button tour, step 1', sceneKey: 'HubScene', setup: (p) => cheat(p, 'hub.showTour') },
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
      await p.waitForTimeout(1600);
    },
  },
  {
    // reset() wipes the save — must run last, same convention as screenshot.ts's
    // onboarding-prompt shot (every other state above assumes unlockAll()'s state).
    name: 'Onboarding: tutorials-or-skip prompt',
    sceneKey: 'OnboardingScene',
    setup: async (p) => {
      await cheat(p, 'reset');
      await waitForSceneActive(p, 'OnboardingScene');
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

async function auditState(page: Page, state: AuditState): Promise<number> {
  if (state.setup) await state.setup(page);
  await page.waitForTimeout(SETTLE_MS);
  await flushPendingOffer(page);

  const active = await page.evaluate((key) => {
    const g = window as unknown as { __game?: { scene: { isActive: (k: string) => boolean } } };
    return g.__game?.scene.isActive(key) === true;
  }, state.sceneKey);
  if (!active) {
    console.log(`\n=== ${state.name}: ${state.sceneKey} not active, skipping ===`);
    return 0;
  }

  const allBoxes = await evaluateHitBoxes(page);
  // addModalBackdrop (widgets.ts) is a full-screen click-catcher by design — it exists to
  // swallow taps *around* a modal, not to be tapped itself, so the 44×44/20px-edge rules
  // (written for discrete controls) don't apply to it. Anything covering ≥90% of the
  // screen in both dimensions is treated as a backdrop and excluded, not just from size/
  // edge checks but from the overlap check too (a modal's own buttons legitimately sit
  // "inside" it).
  const isBackdrop = (b: HitBox): boolean =>
    (b.right - b.left) >= LOGICAL_WIDTH * 0.9 && (b.bottom - b.top) >= LOGICAL_HEIGHT * 0.9;
  const backdropCount = allBoxes.filter(isBackdrop).length;
  const boxes = allBoxes.filter((b) => !isBackdrop(b));
  console.log(`\n=== ${state.name} (${String(boxes.length)} interactive elements`
    + `${backdropCount > 0 ? `, ${String(backdropCount)} full-screen backdrop(s) excluded` : ''}) ===`);
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

  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]; const b = boxes[j];
      if (a !== undefined && b !== undefined && boxesOverlap(a, b)) {
        failures += 1;
        console.log(`FAIL  overlap: "${a.label}" × "${b.label}"`);
      }
    }
  }

  if (failures === 0) console.log('ok — all elements pass');
  return failures;
}

async function main(): Promise<void> {
  const requested = process.argv.slice(2);
  const states = requested.length > 0 ? STATES.filter((s) => requested.includes(s.name)) : STATES;
  if (states.length === 0) {
    console.error(`No matching states. Known:\n${STATES.map((s) => `  ${s.name}`).join('\n')}`);
    process.exit(1);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: VIEWPORT });
  page.on('pageerror', (err) => { console.error(`[page exception] ${err.stack ?? err.message}`); });
  await bootToHub(page);
  await cheat(page, 'unlockAll');

  let totalFailures = 0;
  for (const state of states) {
    try {
      totalFailures += await auditState(page, state);
    } catch (err) {
      console.error(`✗ ${state.name} errored:`, err instanceof Error ? err.message : err);
      totalFailures += 1;
    }
  }

  await browser.close();
  console.log(`\n${totalFailures === 0 ? '✓' : '✗'} ${String(totalFailures)} failure(s) across ${String(states.length)} state(s).`);
  process.exit(totalFailures === 0 ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
