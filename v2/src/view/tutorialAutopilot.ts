import Phaser from 'phaser';
import { resetSave } from '../save/SaveManager';
import { CARD_HEIGHT_LOGICAL, CARD_WIDTH_LOGICAL } from './CardOverlay';
import type { HubScene } from './HubScene';
import { px } from './layout';

/**
 * Dev-only: plays through the real, documented new-player journey (docs/design/
 * 15-new-player-experience.md) end to end using synthetic taps on the actual game
 * canvas — the same coordinates a real tap would land on, driving the same
 * `setInteractive()`/`pointerdown` handlers every scene already wires up for a human
 * player. No fastForward/instant-win cheats anywhere in the mission-playing logic:
 * combat runs at real time so the whole thing can be watched like a movie. Mirrors
 * `tools/onboarding-audit.ts`'s journey logic and
 * `findTextButtonCenter`'s technique, ported from Playwright to run directly inside
 * the live game against `this.game` instead of a headless page.
 *
 * t1 always fails its first real attempt (0% clear on starter gear) and t3's card
 * order is fixed, so both are scripted deterministically (t3 taps a wrong card first,
 * then the right one on retry). t2 only fails ~90% of the time — the run checks which
 * result screen actually appeared and adapts instead of assuming a fail.
 */
export async function playTutorialAutopilot(game: Phaser.Game): Promise<void> {
  log('starting fresh save…');
  resetSave();
  game.scene.getScenes(true).forEach((s) => { game.scene.stop(s.scene.key); });
  game.scene.start('BootScene');
  await sleep(600);
  await waitForScene(game, 'AlphaNoticeScene');
  await tapText(game, 'AlphaNoticeScene', (t) => t.includes('I ACCEPT THE TERMS'));
  await tapText(game, 'AlphaNoticeScene', (t) => t === 'CONTINUE WITH LAST SAVE');
  await waitForScene(game, 'HubScene');
  await sleep(800);
  (game.scene.getScene('HubScene') as HubScene | null)?.cheatTourSkip();

  log('t1: first attempt (no weapon, real generator)…');
  await startMissionByLabel(game, 'Shield Basics');
  await waitForResult(game);
  log('t1 failed as expected — shop: torrent → surge…');
  await fixInShop(game, 'GENERATOR', 'Surge');
  log('t1 retry with the fix…');
  await startMissionByLabel(game, 'Shield Basics');
  await waitForResult(game);
  await tapText(game, 'ResultScene', (t) => t === 'NEXT MISSION ▸');
  await waitForScene(game, 'CombatScene');

  log('t2: first attempt (real starter weapon)…');
  await waitForResult(game);
  if (hasText(game, 'ResultScene', 'GO TO SHOP ▸')) {
    log('t2 failed as expected — shop: pulse → scatter…');
    await fixInShop(game, 'FRONT\nWEAPON', 'Scatter Beam');
    log('t2 retry with the fix…');
    await startMissionByLabel(game, 'Weapon Systems');
    await waitForResult(game);
  } else {
    log('t2 won on the first real attempt (the ~10% lucky case) — nothing to fix.');
  }
  await tapText(game, 'ResultScene', (t) => t === 'NEXT MISSION ▸');
  await waitForScene(game, 'CombatScene');

  log('t3: first attempt, picking a wrong card on purpose…');
  await tapCard(game, 1); // s-cap-20 — doesn't break the guardian's regen
  await waitForResult(game);
  log('t3 failed as expected — retrying with the right pick…');
  await tapText(game, 'ResultScene', (t) => t === 'RETRY');
  await waitForScene(game, 'CombatScene');
  await tapCard(game, 0); // w-dmg-30 — the only card that actually works
  await waitForResult(game);
  await tapText(game, 'ResultScene', (t) => t === 'NEXT MISSION ▸');
  await waitForScene(game, 'CombatScene');

  log('t4: no-fail practice round with two gifted supplies…');
  await waitForResult(game);
  log('tutorial chain complete — m1 is now unlocked. Stopping here.');
}

function log(msg: string): void {
  console.log(`%c[autopilot] ${msg}`, 'color:#6cf');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

function dpr(game: Phaser.Game): number {
  const zoom = game.config.zoom;
  return typeof zoom === 'number' && zoom !== 0 ? 1 / zoom : 1;
}

async function waitForScene(game: Phaser.Game, key: string, timeoutMs = 20_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (game.scene.isActive(key)) return;
    await sleep(120);
  }
  throw new Error(`tutorialAutopilot: timed out waiting for scene "${key}"`);
}

function findTextCenter(game: Phaser.Game, sceneKey: string, predicate: (text: string) => boolean): { x: number; y: number } | null {
  // getScene's own type signature claims a non-nullable return, but it really does
  // return null/undefined for an unregistered or not-yet-created scene key at runtime.
  const scene = game.scene.getScene(sceneKey) as Phaser.Scene | null;
  if (scene === null) return null;
  const obj = scene.children.list.find(
    (o): o is Phaser.GameObjects.Text => o instanceof Phaser.GameObjects.Text && predicate(o.text),
  );
  if (obj === undefined) return null;
  const bounds = obj.getBounds();
  const d = dpr(game);
  return { x: (bounds.x + bounds.width / 2) / d, y: (bounds.y + bounds.height / 2) / d };
}

function hasText(game: Phaser.Game, sceneKey: string, text: string): boolean {
  return findTextCenter(game, sceneKey, (t) => t === text) !== null;
}

/** t3's card offer (`CardOverlay.ts`) renders each pick as an interactive Rectangle,
 * left to right in offer order — no text label distinguishes them, so this locates
 * them by shape/interactivity instead, mirroring how a real tap only cares about
 * position. Skip/reroll are Text buttons, not Rectangles, so they don't leak in, but
 * the modal's own full-screen backdrop and the HUD's toggle buttons (AUTO-FIRE/REAR/
 * AUTO-SHIELD) are also interactive Rectangles — filtering by `CardOverlay.ts`'s own
 * exported card size (comfortably bracketed) is what isolates the 3 cards from
 * everything else sharing the same shape/interactivity. */
function findCardCenters(game: Phaser.Game, sceneKey: string): { x: number; y: number }[] {
  const scene = game.scene.getScene(sceneKey) as Phaser.Scene | null;
  if (scene === null) return [];
  const d = dpr(game);
  const tolerance = 30;
  const minW = px(CARD_WIDTH_LOGICAL - tolerance);
  const maxW = px(CARD_WIDTH_LOGICAL + tolerance);
  const minH = px(CARD_HEIGHT_LOGICAL - tolerance);
  const maxH = px(CARD_HEIGHT_LOGICAL + tolerance);
  return scene.children.list
    .filter((o): o is Phaser.GameObjects.Rectangle => o instanceof Phaser.GameObjects.Rectangle && (o.input?.enabled ?? false))
    .map((o) => o.getBounds())
    .filter((b) => b.width >= minW && b.width <= maxW && b.height >= minH && b.height <= maxH)
    .map((b) => ({ x: (b.x + b.width / 2) / d, y: (b.y + b.height / 2) / d }))
    .sort((a, b) => a.x - b.x);
}

// A real viewer needs to actually see each tap register before the next one fires —
// baked into tapAt itself (the one place every tap in this file passes through)
// rather than scattered ad-hoc sleeps after each call site, so the pacing is uniform
// and can't be accidentally skipped by a new call site that forgets to add one. 500ms
// read as too fast to actually watch/follow (Tomáš: "the autoclicker is too fast") —
// long enough to read a button label and register the tap landed, not just a blur.
const ACTION_DELAY_MS = 1100;

/** Phaser's default MouseManager listens for real `mousedown`/`mouseup` MouseEvents on
 * the canvas, not PointerEvents — a synthetic PointerEvent dispatch is silently
 * ignored. MouseEvent is what a real click/tap actually reaches the canvas as. */
async function tapAt(game: Phaser.Game, x: number, y: number): Promise<void> {
  const canvas = game.canvas;
  const rect = canvas.getBoundingClientRect();
  const opts: MouseEventInit = {
    bubbles: true, cancelable: true, button: 0,
    clientX: rect.left + x, clientY: rect.top + y,
  };
  canvas.dispatchEvent(new MouseEvent('mousedown', opts));
  canvas.dispatchEvent(new MouseEvent('mouseup', opts));
  await sleep(ACTION_DELAY_MS);
}

async function tapText(game: Phaser.Game, sceneKey: string, predicate: (text: string) => boolean, timeoutMs = 10_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const pos = findTextCenter(game, sceneKey, predicate);
    if (pos !== null) { await tapAt(game, pos.x, pos.y); return; }
    await sleep(150);
  }
  throw new Error(`tutorialAutopilot: text not found on ${sceneKey}`);
}

/** `core/tick.ts` freezes the entire sim (`state.pendingNarrator !== null`) until this
 * modal's own CONTINUE/NEXT → button is tapped — it does NOT auto-hide like the
 * separate bottom NarratorBar does. Every mission's tick-0 intro line (and t3's
 * mid-mission hint) goes through this same blocking modal, so anything that waits on
 * combat progressing has to keep dismissing it, not just wait for time to pass. */
async function dismissNarratorIfPresent(game: Phaser.Game): Promise<boolean> {
  const pos = findTextCenter(game, 'CombatScene', (t) => t === 'CONTINUE' || t === 'NEXT →');
  if (pos === null) return false;
  await tapAt(game, pos.x, pos.y);
  return true;
}

async function tapCard(game: Phaser.Game, index: number, timeoutMs = 20_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const centers = findCardCenters(game, 'CombatScene');
    if (centers.length >= 3) {
      const center = centers[index];
      if (center !== undefined) { await tapAt(game, center.x, center.y); return; }
    }
    await dismissNarratorIfPresent(game);
    await sleep(200);
  }
  throw new Error('tutorialAutopilot: card overlay not found');
}

/** t4 also has a `supportCallTicks` card offer (any pick is fine — its whole point is
 * "no wrong pick this time") — `pendingOffer !== null` blocks the tick loop exactly
 * like `pendingNarrator` does, so waiting for a result has to clear this too, not just
 * narrator modals. t3's own offer is already resolved by its own `tapCard` call before
 * `waitForResult` runs, so this never double-picks there. */
async function dismissCardOfferIfPresent(game: Phaser.Game): Promise<boolean> {
  const centers = findCardCenters(game, 'CombatScene');
  const first = centers[0];
  if (first === undefined) return false;
  await tapAt(game, first.x, first.y);
  return true;
}

async function waitForResult(game: Phaser.Game, timeoutMs = 180_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (game.scene.isActive('ResultScene')) { await sleep(500); return; }
    await dismissNarratorIfPresent(game);
    await dismissCardOfferIfPresent(game);
    await sleep(200);
  }
  throw new Error('tutorialAutopilot: timed out waiting for ResultScene');
}

async function startMissionByLabel(game: Phaser.Game, label: string): Promise<void> {
  await tapText(game, 'HubScene', (t) => t === 'EXPLORE NEARBY SPACE');
  await tapText(game, 'HubScene', (t) => t === label);
  await tapText(game, 'HubScene', (t) => t === '▶  START');
  await waitForScene(game, 'CombatScene');
}

async function fixInShop(game: Phaser.Game, tabLabel: string, itemLabel: string): Promise<void> {
  await tapText(game, 'ResultScene', (t) => t === 'GO TO SHOP ▸');
  await waitForScene(game, 'HubScene');
  await sleep(400);
  // The shop screen has its own one-time coach-mark tour, separate from the hub
  // main-menu tour already skipped above — its blocking backdrop otherwise swallows
  // the tab tap below on a genuinely first shop visit. cheatTourSkip() is written to
  // skip whichever tour is currently active, hub or screen, so this call is a safe
  // no-op if the shop tour has already been seen.
  (game.scene.getScene('HubScene') as HubScene | null)?.cheatTourSkip();
  await sleep(200);
  await tapText(game, 'HubScene', (t) => t === tabLabel);
  await tapText(game, 'HubScene', (t) => t === itemLabel);
  // The main-menu strip ('EXPLORE NEARBY SPACE' etc.) only renders on the dashboard
  // (`uiState.nav === null`) — any nav panel, including this shop screen, shows
  // '‹ BACK' in its place (HubScene.ts's rebuildContent). Back out to the dashboard so
  // startMissionByLabel's own first tap has something to land on.
  await tapText(game, 'HubScene', (t) => t === '‹ BACK');
}
