// Shared Playwright plumbing for every headless view-layer tool (screenshot.ts,
// tap-target-audit.ts, and whatever else the polish-loop needs next) — drives the game
// entirely through __cheat (main.ts), never real clicks or hardcoded pixel coordinates.
// One copy of this logic so every tool in the loop stays consistent and a fix (like the
// scene-transition race condition below) only needs to land once.

import type { Page } from 'playwright';

export const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:5173';
export const VIEWPORT = { width: 960, height: 540 }; // LOGICAL_WIDTH/HEIGHT, src/view/layout.ts
export const BOOT_TIMEOUT_MS = 20_000; // BootScene fetches a ~9MB music track on first load
export const SETTLE_MS = 150; // let one real Phaser frame run after a state change before capture

export interface EnemySnapshot {
  id: number; kind: string; distance: number; hp: number; maxHp: number;
  holdChargeTicks: number; blocksConveyor: boolean;
}
export interface CombatSnapshot {
  missionId: string; tick: number; status: string; priorityTargetId: number | null;
  hasPendingOffer: boolean;
  ship: { hull: number; maxHull: number; shield: number; energy: number };
  enemies: EnemySnapshot[];
}

/** Calls window.__cheat[...path](...args) inside the page — a dotted path (e.g.
 * "combat.fastForward") walked at call time, never a stringified/eval'd expression,
 * so args pass through Playwright's normal structured-clone serialization. */
export async function cheat<T = unknown>(page: Page, path: string, ...args: unknown[]): Promise<T> {
  /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment,
     @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call,
     @typescript-eslint/no-unsafe-return -- crossing into the page's untyped window.__cheat */
  return page.evaluate(
    ({ path, args }) => {
      const parts = path.split('.');
      let obj: any = (window as any).__cheat;
      for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i] ?? ''];
      const fnName = parts[parts.length - 1] ?? '';
      return obj[fnName](...args);
    },
    { path, args },
  ) as Promise<T>;
  /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment,
     @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call,
     @typescript-eslint/no-unsafe-return */
}

export async function waitForSceneActive(page: Page, sceneKey: string, timeoutMs = 10_000): Promise<void> {
  await page.waitForFunction(
    (key) => {
      const g = window as unknown as { __game?: { scene: { isActive: (k: string) => boolean } } };
      return g.__game?.scene.isActive(key) === true;
    },
    sceneKey,
    { timeout: timeoutMs },
  );
}

/** Polls combat.inspect() until CombatScene reports the *expected* mission at tick 0
 * — game.scene.isActive('CombatScene') alone isn't a safe readiness signal here:
 * Phaser can mark a scene active before create() has actually rebuilt `this.core`,
 * so a check that only looks at isActive() can race and read the *previous*
 * mission's still-live state (caught during this harness's own development: a
 * mid-transition page exception left a "m6" shot's screenshot showing m1's HUD). */
export async function waitForMissionReady(page: Page, missionId: string, timeoutMs = 10_000): Promise<CombatSnapshot> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const snap = await cheat<CombatSnapshot>(page, 'combat.inspect');
      if (snap.missionId === missionId && snap.tick === 0) return snap;
    } catch {
      // CombatScene not active yet, or mid-transition — keep polling.
    }
    if (Date.now() > deadline) {
      throw new Error(`waitForMissionReady("${missionId}") timed out after ${String(timeoutMs)}ms`);
    }
    await page.waitForTimeout(30);
  }
}

/** Fast-forwards combat in small steps, re-reading state after each, until `predicate`
 * is true or `maxTicks` is exhausted — the "read state back and adapt" alternative to
 * a hardcoded tick number that may drift the moment mission data changes again. */
export async function advanceUntil(
  page: Page,
  predicate: (snap: CombatSnapshot) => boolean,
  maxTicks = 3000,
  stepTicks = 20,
): Promise<CombatSnapshot> {
  let advanced = 0;
  for (;;) {
    const snap = await cheat<CombatSnapshot>(page, 'combat.inspect');
    if (predicate(snap) || snap.status !== 'running' || advanced >= maxTicks) return snap;
    await cheat(page, 'combat.fastForward', stepTicks);
    advanced += stepTicks;
  }
}

/** cheatFastForward auto-resolves any pending card offer before ticking, but the real
 * per-frame update() loop (driven by SETTLE_MS's real-time wait, not fastForward) does
 * not — a support call can open the real, non-auto-resolving CardOverlay in that window
 * and get captured mid-shot, unrelated to whatever the caller actually wants to show.
 * Call right before every screenshot/measurement; a no-op unless an offer is actually open.
 *
 * A single check-and-flush isn't enough (confirmed: combat-m4-hold-charge.png shipped
 * showing the DISPATCH REINFORCEMENTS card instead of the requested state). Two distinct
 * races both need a loop: (1) fastForward(1) resolves the *core*-level offer, but the
 * CardOverlay is a real Phaser display object that only tears itself down on a
 * subsequent rendered frame — with no wait after the flush, the screenshot could still
 * capture the overlay mid-teardown; (2) real time keeps passing between our own awaits,
 * so a fresh offer can open again right after we thought we were clear. Re-checking up
 * to maxAttempts times, with a real wait each round, closes both gaps. */
export async function flushPendingOffer(page: Page, maxAttempts = 5): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    const snap = await cheat<CombatSnapshot | undefined>(page, 'combat.inspect');
    if (snap?.hasPendingOffer !== true) return;
    await cheat(page, 'combat.fastForward', 1);
    await page.waitForTimeout(80); // let the view render the now-resolved core state
  }
}

export function hasKind(snap: CombatSnapshot, kind: string): boolean {
  return snap.enemies.some((e) => e.kind === kind);
}

/** Boots the page to HubScene, ready for cheat() calls — the common prefix every tool
 * in this harness needs before it can do anything else. A fresh Playwright browser
 * context has no localStorage, so BootScene routes it to OnboardingScene first (same as
 * a real fresh install) — this waits for either scene, then drives straight through
 * OnboardingScene via cheat() (never a real click) if that's where it landed, so every
 * caller downstream can keep assuming "after bootToHub, HubScene is active." Either
 * onboarding choice hands off to HubScene with the button tour already showing
 * (OnboardingScene.ts) — dismissed here via hub.tourSkip() so downstream tools land on
 * a clean, predictable HubScene, not an active coach-mark overlay dimming everything. */
export async function bootToHub(page: Page): Promise<void> {
  await page.goto(BASE_URL);
  await page.waitForFunction(
    () => {
      const g = window as unknown as { __game?: { scene: { isActive: (k: string) => boolean } } };
      return g.__game?.scene.isActive('HubScene') === true || g.__game?.scene.isActive('OnboardingScene') === true;
    },
    null,
    { timeout: BOOT_TIMEOUT_MS },
  );
  const onOnboarding = await page.evaluate(() => {
    const g = window as unknown as { __game?: { scene: { isActive: (k: string) => boolean } } };
    return g.__game?.scene.isActive('OnboardingScene') === true;
  });
  if (onOnboarding) {
    await cheat(page, 'onboarding.choose', 'tutorials');
    await waitForSceneActive(page, 'HubScene', BOOT_TIMEOUT_MS);
    await cheat(page, 'hub.tourSkip');
  }
  await page.waitForTimeout(SETTLE_MS);
}
