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

/** Playwright's default deviceScaleFactor is 1 — every prior run of these tools has
 * therefore only ever exercised src/view/layout.ts's DPR=1 code path, never the
 * dpr-sharp rendering (`zoom: 1/DPR`, `px()`/`fontPx()` device-pixel rounding) the whole
 * canvas-sizing scheme exists to protect, and never actually exercised
 * tap-target-audit.ts's `world-px / DPR` conversion at a real non-1 value (it's
 * algebraically DPR-agnostic, but "algebraically correct" and "actually verified" are
 * different claims). Set DPR_SCALE_FACTOR=2 (or any value) to run a real pass at that
 * scale — docs/plans/comprehensive-coverage-sweep.md's Phase 0. */
export const DEVICE_SCALE_FACTOR = Number(process.env.DPR_SCALE_FACTOR ?? '1');

export interface EnemySnapshot {
  id: number; kind: string; distance: number; hp: number; maxHp: number;
  holdChargeTicks: number; blocksConveyor: boolean;
}
export interface CombatSnapshot {
  missionId: string; tick: number; timelineTick: number; status: string; priorityTargetId: number | null;
  hasPendingOffer: boolean;
  narratorFullyRevealed: boolean;
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

/** Polls combat.inspect() until the bottom NarratorBar's current line has finished its
 * typewriter reveal (NarratorBar.isFullyRevealed) — the "read state back, don't guess a
 * fixed sleep" alternative to a hardcoded wait sized off today's longest story.ts line,
 * which would silently under-shoot if a future line got longer or over-shoot into the
 * bar's own 5000ms auto-hide window for a short line (docs/known-issues.md's now-
 * resolved NarratorBar reveal-timing entry). Real-time polling is correct here — the
 * typewriter reveal runs off wall-clock deltaMs every rendered frame
 * (CombatScene.update's narrator.update call), unaffected by the sim's own tick pause
 * under a pending card offer. THROWS on timeout or if the mission ends before a line
 * ever finishes revealing (matching advanceUntil's own fail-loud precedent) — a bare
 * cheat() rejection after the scene has gone away would be a much worse message. */
export async function waitForNarratorFullyRevealed(page: Page, timeoutMs = 15_000): Promise<CombatSnapshot> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const snap = await cheat<CombatSnapshot>(page, 'combat.inspect');
    if (snap.narratorFullyRevealed) return snap;
    const context = `mission=${snap.missionId} tick=${String(snap.tick)} status=${snap.status}`;
    if (snap.status !== 'running') {
      throw new Error(`waitForNarratorFullyRevealed: mission ended before a narrator line finished revealing (${context})`);
    }
    if (Date.now() > deadline) {
      throw new Error(`waitForNarratorFullyRevealed: timed out after ${String(timeoutMs)}ms (${context})`);
    }
    await page.waitForTimeout(100);
  }
}

/** Fast-forwards combat in small steps, re-reading state after each, until `predicate`
 * is true or `maxTicks` is exhausted — the "read state back and adapt" alternative to
 * a hardcoded tick number that may drift the moment mission data changes again.
 *
 * THROWS if the predicate never becomes true — added 2026-07-17/18 (polish-loop,
 * Fable's review) after this used to silently RETURN the best-effort snapshot on both
 * a mission ending early and a timeout, with no way for a caller to tell success from
 * failure short of re-checking the predicate themselves. None of this file's 17 real
 * call sites (tools/screenshot.ts) did that check — `combat-m6-boss`'s shot had been
 * silently capturing a boss-less frame for who knows how long, reported as a clean "0
 * failures" the whole time. The predicate is still checked FIRST, before the
 * mission-ended guard — load-bearing for combat-low-hull-vignette's own setup, which
 * deliberately wants a hull=0 defeat snapshot to still count as success (its own
 * threshold, hull/maxHull < 0.15, is still true at hull=0). `timelineTick` is included
 * because it's often the actual smoking gun (CombatSnapshot's own field, added
 * alongside this fix) — a blocksConveyor enemy freezes it entirely while `tick` (real
 * per-advance count) keeps climbing, so a predicate waiting on a timeline-scheduled
 * spawn can time out on `tick` while `timelineTick` shows it never got anywhere close. */
export async function advanceUntil(
  page: Page,
  predicate: (snap: CombatSnapshot) => boolean,
  maxTicks = 3000,
  stepTicks = 20,
): Promise<CombatSnapshot> {
  let advanced = 0;
  for (;;) {
    const snap = await cheat<CombatSnapshot>(page, 'combat.inspect');
    if (predicate(snap)) return snap;
    const context = `mission=${snap.missionId} tick=${String(snap.tick)} timelineTick=${String(snap.timelineTick)} ` +
      `status=${snap.status} hull=${String(snap.ship.hull)}/${String(snap.ship.maxHull)} ` +
      `energy=${String(Math.round(snap.ship.energy))} enemies=[${snap.enemies.map((e) => e.kind).join(',')}]`;
    if (snap.status !== 'running') {
      throw new Error(`advanceUntil: mission ended before predicate was satisfied (${context})`);
    }
    if (advanced >= maxTicks) {
      throw new Error(`advanceUntil: timed out after ${String(maxTicks)} attempted ticks without satisfying predicate (${context})`);
    }
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

/** Drives through every screen BootScene puts in front of HubScene, so every caller can
 * keep assuming "after this, HubScene is active with no overlay dimming everything."
 * Two steps today: (1) `AlphaNoticeScene` (added 2026-07-17) — shown on EVERY launch,
 * no save-flag gate, so this always has to be dismissed via `alpha.continue()` before
 * HubScene ever becomes active at all; (2) the one-time hub button tour, dismissed via
 * `hub.tourSkip()` (a safe no-op when no tour is active — HubScene.ts's
 * `cheatTourSkip`) in case a fresh save's first launch triggered it. Shared by
 * bootToHub() (first page load) and any tool that calls __cheat.reset() mid-run, which
 * also routes through BootScene → AlphaNoticeScene again. */
export async function driveThroughOnboardingIfShown(page: Page): Promise<void> {
  await waitForSceneActive(page, 'AlphaNoticeScene', BOOT_TIMEOUT_MS);
  await cheat(page, 'alpha.continue');
  await waitForSceneActive(page, 'HubScene', BOOT_TIMEOUT_MS);
  await cheat(page, 'hub.tourSkip');
}

/** Boots the page to HubScene, ready for cheat() calls — the common prefix every tool
 * in this harness needs before it can do anything else. */
export async function bootToHub(page: Page): Promise<void> {
  await page.goto(BASE_URL);
  await driveThroughOnboardingIfShown(page);
  await page.waitForTimeout(SETTLE_MS);
}
