// Plays through the real, documented new-player journey (docs/design/
// 15-new-player-experience.md) in a real headless browser and asserts every structural
// beat still holds: t1/t2/t3 each fail on real starter gear, redirect to the shop, fix
// via a free switch (or, for t3, a corrected card pick), show different narration on
// retry, and unlock the next mission on a real win; t4 completes regardless of outcome.
//
// Unlike tap-target-audit.ts/screenshot.ts (independent states, each reachable fresh
// from a blank slate), this is one continuous JOURNEY through real save persistence —
// "does the new-player experience work" is inherently sequential, not a single frozen
// state. Assertions read real ground truth, not rendered pixels: `combat.inspect()` for
// mid-mission state, HubScene/CombatScene's own live objects (same `window.__game`
// technique tap-target-audit.ts already uses for `uiState`), and the real persisted save
// (localStorage, `SaveManager.ts`'s own storage key) — cross-checked against the actual
// pure functions (`isMissionUnlocked`, `isShopNavLocked`, `computeKindRows`) rather than
// hardcoded expected values, so a legitimate future rebalance doesn't require also
// updating duplicated constants here.
//
// Usage: pnpm onboarding   (requires the dev server running — pnpm dev)

import { chromium, type Page } from 'playwright';
import {
  bootToHub, cheat, driveThroughOnboardingIfShown, VIEWPORT, DEVICE_SCALE_FACTOR,
  waitForMissionReady, waitForSceneActive, type CombatSnapshot,
} from './playwrightHarness';
import { isMissionUnlocked, totalStars } from '../src/save/SaveManager';
import type { SaveData } from '../src/save/SaveManager';
import { computeKindRows, isShopNavLocked } from '../src/viewmodel/hub';
import { GENERATOR_SYSTEM } from '../src/viewmodel/shopSystems';

// Must match SaveManager.ts's own STORAGE_KEY — that constant isn't exported (save
// access is meant to go through SaveManager's own functions everywhere else), so this
// tool reads it directly the same way it reads any other browser-side ground truth.
const STORAGE_KEY = 'nesro-nova-v2-save';

async function readSave(page: Page): Promise<SaveData> {
  const raw = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  if (raw === null) throw new Error('readSave: no save found in localStorage');
  return JSON.parse(raw) as SaveData;
}

/** The mission actually loaded into the running core this attempt — narratorEvents
 * reflects `missionForThisAttempt`'s retry substitution, so reading it live (rather
 * than re-deriving from missions.ts) confirms the real mechanism fired, not just that
 * it theoretically should have. */
async function readLiveNarratorFirstLine(page: Page): Promise<string | undefined> {
  /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment,
     @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return,
     @typescript-eslint/no-unsafe-call -- runs inside page.evaluate against untyped Phaser internals */
  return page.evaluate(() => {
    const g = window as any;
    const scene = g.__game.scene.getScene('CombatScene');
    return scene?.core?.mission?.narratorEvents?.[0]?.lines?.[0];
  });
  /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment,
     @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return,
     @typescript-eslint/no-unsafe-call */
}

/** Finds a Text object's on-screen center by its exact rendered string — same technique
 * tap-target-audit.ts's checkShopTabLabelClickableAfterTourEnds uses for a tagged
 * label, generalized to any scene/text since this tool needs it for ResultScene's
 * GO TO SHOP button, which carries no tourId tag. */
async function findTextButtonCenter(page: Page, sceneKey: string, text: string): Promise<{ x: number; y: number } | null> {
  /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment,
     @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call,
     @typescript-eslint/restrict-plus-operands -- runs inside page.evaluate against untyped Phaser internals */
  return page.evaluate(({ sceneKey, text }) => {
    const g = window as any;
    const scene = g.__game.scene.getScene(sceneKey);
    if (!scene) return null;
    const obj = scene.children.list.find((o: any) => o.text === text);
    if (!obj) return null;
    const bounds = obj.getBounds();
    const dpr = g.__game.config.zoom ? 1 / g.__game.config.zoom : 1;
    return { x: (bounds.x + bounds.width / 2) / dpr, y: (bounds.y + bounds.height / 2) / dpr };
  }, { sceneKey, text });
  /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment,
     @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call,
     @typescript-eslint/restrict-plus-operands */
}

const failures: string[] = [];
function check(condition: boolean, label: string): void {
  if (condition) console.log(`  ✓ ${label}`);
  else { console.log(`  ✗ ${label}`); failures.push(label); }
}

/** Runs a mission to its natural end (win or lose), no card/narrator auto-resolution
 * shortcuts beyond fastForward's own (index-0 picks, auto-dismissed narrators) — the
 * same real end-state every player reaches. Waits for ResultScene itself, not just a
 * fixed sleep: maybeFinish() holds on the finished combat frame for a real delay
 * (DEFEAT_EXIT_DELAY_MS/VICTORY_EXIT_DELAY_MS, CombatScene.ts) before the scene
 * transition actually happens, so reading save/ResultScene state too early would race. */
async function playToEnd(page: Page): Promise<CombatSnapshot> {
  await cheat(page, 'combat.fastForward', 6000);
  const snap = await cheat<CombatSnapshot>(page, 'combat.inspect');
  await waitForSceneActive(page, 'ResultScene', 10_000);
  return snap;
}

async function clickResultButton(page: Page, text: string): Promise<void> {
  const button = await findTextButtonCenter(page, 'ResultScene', text);
  if (button === null) throw new Error(`clickResultButton: "${text}" not found on ResultScene`);
  await page.mouse.click(button.x, button.y);
}

async function stepFreshSave(page: Page): Promise<void> {
  console.log('--- Fresh save ---');
  const save = await readSave(page);
  check(isMissionUnlocked(save, 't1'), 't1 is unlocked from a fresh save');
  check(!isMissionUnlocked(save, 't2'), 't2 is locked from a fresh save');
  check(!isMissionUnlocked(save, 'm1'), 'm1 is locked from a fresh save');
  check(isShopNavLocked(save), 'shop nav is locked from a fresh save (nothing to shop for yet)');
}

async function stepT1(page: Page): Promise<void> {
  console.log('--- t1: first attempt (real starter gear) ---');
  const before = await readSave(page);
  await cheat(page, 'startMission', 't1');
  await waitForMissionReady(page, 't1');
  const firstLine = await readLiveNarratorFirstLine(page);
  check(
    firstLine === 'Your ship runs on four core modules, Commander: WEAPON, SHIELD, GENERATOR, MOTOR — swap and upgrade each one from the shop between missions.',
    't1 first attempt shows the full first-time narration',
  );
  const snap = await playToEnd(page);
  check(snap.status === 'defeat', 't1 fails on real starter gear (torrent-1)');
  await page.waitForTimeout(300);
  const after = await readSave(page);
  check(after.coins === before.coins, 't1 defeat earns 0 coins');
  check(after.t1FailedOnce === true, 't1FailedOnce is set after the real defeat');
  const goToShop = await findTextButtonCenter(page, 'ResultScene', 'GO TO SHOP ▸');
  check(goToShop !== null, 't1 defeat screen shows a GO TO SHOP button (defeat-shop-redirect)');

  console.log('--- t1: shop shows a legible, gated choice ---');
  await clickResultButton(page, 'GO TO SHOP ▸');
  await page.waitForTimeout(300);
  const save = await readSave(page);
  const stars = totalStars(save);
  const rows = computeKindRows({ config: GENERATOR_SYSTEM, save, playerStars: stars }, null);
  const rowState = (kind: string) => rows.find((r) => r.kind === kind)?.rowState;
  check(rowState('torrent') !== 'locked', 'shop: torrent (real starter default) is not locked');
  check(rowState('surge') !== 'locked', 'shop: surge (t1\'s fix) is not locked');
  check(rowState('reserve') === 'locked', 'shop: reserve is locked on a fresh 0-star save');
  check(rowState('steady') === 'locked', 'shop: steady is locked on a fresh 0-star save');
  await cheat(page, 'equip', 'generator-surge-1');

  console.log('--- t1: retry with the fix ---');
  const beforeRetry = await readSave(page);
  await cheat(page, 'startMission', 't1');
  await waitForMissionReady(page, 't1');
  const retryLine = await readLiveNarratorFirstLine(page);
  check(
    retryLine === "Same wave, new generator. Let's see if it can keep the shield charged this time.",
    't1 retry shows the shorter, retry-aware narration',
  );
  const retrySnap = await playToEnd(page);
  check(retrySnap.status === 'victory', 't1 clears with the generator switched to surge');
  await page.waitForTimeout(300);
  const afterRetry = await readSave(page);
  check(afterRetry.coins === beforeRetry.coins + 45, 't1 win pays 45 coins (30 completion + 15 real kill)');
  check(isMissionUnlocked(afterRetry, 't2'), 't2 unlocks after a real t1 win');
}

// Every mission (re)start below goes through the startMission cheat directly, not a
// NEXT MISSION/RETRY button click — startMission stops every active scene first
// (main.ts), so it's safe to call from wherever the previous step left off, and
// avoids a real click racing a cheat-driven restart on the very next loop iteration.
// The one real click this tool cares about is GO TO SHOP — that button's existence
// and the navigation it performs (ResultViewModel's `defeat-shop-redirect`) IS the
// thing under test, unlike ordinary mission-to-mission progression.
async function stepT2(page: Page): Promise<void> {
  console.log('--- t2: first attempt (real starter gear, ~90% fail rate — retried until a real loss) ---');
  let sawDefeat = false;
  for (let attempt = 0; attempt < 10; attempt++) {
    await cheat(page, 'startMission', 't2');
    await waitForMissionReady(page, 't2');
    const snap = await playToEnd(page);
    if (snap.status === 'defeat') { sawDefeat = true; break; }
  }
  check(sawDefeat, 't2 loses on real starter gear (pulse-1) within 10 attempts');
  const save = await readSave(page);
  check(save.t2FailedOnce === true, 't2FailedOnce is set after a real defeat');
  const goToShop = await findTextButtonCenter(page, 'ResultScene', 'GO TO SHOP ▸');
  check(goToShop !== null, 't2 defeat screen shows a GO TO SHOP button (defeat-shop-redirect)');
  await clickResultButton(page, 'GO TO SHOP ▸');
  await page.waitForTimeout(300);
  await cheat(page, 'equip', 'scatter-1');

  console.log('--- t2: retry with the fix ---');
  const before = await readSave(page);
  await cheat(page, 'startMission', 't2');
  await waitForMissionReady(page, 't2');
  const firstLine = await readLiveNarratorFirstLine(page);
  check(
    firstLine === 'New weapon loaded. Let\'s see if it breaks through this wall.',
    't2 retry shows the shorter, retry-aware narration',
  );
  const snap = await playToEnd(page);
  check(snap.status === 'victory', 't2 clears with the weapon switched to scatter');
  await page.waitForTimeout(300);
  const after = await readSave(page);
  check(after.coins > before.coins, 't2 win pays real coins');
  check(isMissionUnlocked(after, 't3'), 't3 unlocks after a real t2 win');
}

async function stepT3(page: Page): Promise<void> {
  console.log('--- t3: first attempt, a real wrong pick ---');
  await cheat(page, 'startMission', 't3');
  await waitForMissionReady(page, 't3');
  const firstLine = await readLiveNarratorFirstLine(page);
  check(
    firstLine === 'That guardian regenerates faster than your base damage.',
    't3 first attempt shows the full first-time narration',
  );
  await cheat(page, 'combat.fastForwardToOffer', 100);
  await cheat(page, 'combat.pickCard', 1); // s-cap-20 — a real wrong pick (w-dmg-30 is the fix, at index 0)
  const snap = await playToEnd(page);
  check(snap.status === 'defeat', 't3 fails on a wrong card pick');
  const save = await readSave(page);
  check(save.t3FailedOnce === true, 't3FailedOnce is set after the real defeat');
  check(!isMissionUnlocked(save, 't4'), 't4 stays locked after a t3 defeat');

  console.log('--- t3: retry with the correct pick ---');
  await cheat(page, 'startMission', 't3');
  await waitForMissionReady(page, 't3');
  const retryLine = await readLiveNarratorFirstLine(page);
  check(
    retryLine === "Different pick this time — that guardian's regen still won't wait for you.",
    't3 retry shows the shorter, retry-aware narration',
  );
  await cheat(page, 'combat.fastForwardToOffer', 100);
  await cheat(page, 'combat.pickCard', 0); // w-dmg-30 — the real fix
  const retrySnap = await playToEnd(page);
  check(retrySnap.status === 'victory', 't3 clears with the correct card pick');
  const afterRetry = await readSave(page);
  check(isMissionUnlocked(afterRetry, 't4'), 't4 unlocks after a real t3 win');
}

async function stepT4(page: Page): Promise<void> {
  console.log('--- t4: a no-fail practice round, not another fail/fix mission ---');
  await cheat(page, 'startMission', 't4');
  await waitForMissionReady(page, 't4');
  await playToEnd(page);
  await page.waitForTimeout(300);
  const redirectButton = await findTextButtonCenter(page, 'ResultScene', 'GO TO SHOP ▸');
  check(redirectButton === null, 't4 result screen is standard (RETRY/MISSIONS/SHOP), never a defeat-shop-redirect');
  const save = await readSave(page);
  check(isMissionUnlocked(save, 'm1'), 'm1 unlocks after t4 regardless of outcome (completesOnDefeat)');
}

async function main(): Promise<void> {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: DEVICE_SCALE_FACTOR });
  await bootToHub(page);
  await cheat(page, 'reset');
  await driveThroughOnboardingIfShown(page);

  await stepFreshSave(page);
  await stepT1(page);
  await stepT2(page);
  await stepT3(page);
  await stepT4(page);

  await browser.close();
  console.log(`\n${failures.length === 0 ? '✓' : '✗'} ${String(failures.length)} failure(s) across the new-player journey.`);
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error('onboarding-audit crashed:', err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
