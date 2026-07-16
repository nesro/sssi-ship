// Headless visual-verification harness (Phase B) — launches chromium against the dev
// server and drives the game entirely through __cheat (main.ts), never real clicks or
// hardcoded pixel coordinates. That's the actual fix for "trouble navigating through
// the game": __cheat.startMission/navTo/combat.fastForward reach any state in one
// call, and combat.inspect() lets this script *read the state back* and adaptively
// step forward until a real condition holds (e.g. "a booster is on screen") instead of
// guessing a tick number and hoping.
//
// Usage: pnpm screenshot                            # runs every shot in SHOTS below
//        pnpm screenshot hub-missions m3b-booster    # runs only the named shots
//
// Requires the dev server running (pnpm dev) and reachable at SCREENSHOT_BASE_URL
// (default http://localhost:5173).

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import type { Page } from 'playwright';
import {
  advanceUntil, bootToHub, cheat, flushPendingOffer, hasKind, SETTLE_MS, VIEWPORT,
  waitForMissionReady, waitForSceneActive,
} from './playwrightHarness';

// Repo-relative, not a sandbox scratchpad path — the latter is only valid for the agent
// session that happened to create it and is gone (or belongs to someone else) by the
// next run. SCREENSHOT_OUT_DIR still overrides for anyone who wants a scratch location.
const OUT_DIR = process.env.SCREENSHOT_OUT_DIR
  ?? new URL('../screenshots', import.meta.url).pathname;

interface Shot {
  name: string;
  setup: (page: Page) => Promise<void>;
}

const SHOTS: Shot[] = [
  {
    name: 'hub-main-menu',
    setup: async (page) => {
      await cheat(page, 'unlockAll');
      await waitForSceneActive(page, 'HubScene');
      await cheat(page, 'navTo', null);
    },
  },
  // Hub button tour (docs/plans/first-open-and-tutorial-tour.md) — each shot
  // independently re-starts the tour then advances to its own step via
  // hub.tourNext(), so ordering relative to other shots doesn't matter (unlike
  // onboarding-prompt below, which resets the save and must run last).
  { name: 'hub-tour-step-1', setup: async (page) => { await cheat(page, 'hub.showTour'); } },
  {
    name: 'hub-tour-step-2',
    setup: async (page) => { await cheat(page, 'hub.showTour'); await cheat(page, 'hub.tourNext'); },
  },
  {
    name: 'hub-tour-step-3',
    setup: async (page) => {
      await cheat(page, 'hub.showTour'); await cheat(page, 'hub.tourNext'); await cheat(page, 'hub.tourNext');
    },
  },
  {
    name: 'hub-tour-step-4',
    setup: async (page) => {
      await cheat(page, 'hub.showTour');
      await cheat(page, 'hub.tourNext'); await cheat(page, 'hub.tourNext'); await cheat(page, 'hub.tourNext');
    },
  },
  {
    name: 'hub-missions',
    setup: async (page) => {
      await cheat(page, 'navTo', 'missions');
    },
  },
  {
    name: 'hub-shop-weapon',
    setup: async (page) => {
      await cheat(page, 'navShop', 'weapon');
    },
  },
  { name: 'hub-shop-ship', setup: async (page) => { await cheat(page, 'navShop', 'ship'); } },
  { name: 'hub-shop-rear-weapon', setup: async (page) => { await cheat(page, 'navShop', 'rear-weapon'); } },
  { name: 'hub-shop-side-weapon', setup: async (page) => { await cheat(page, 'navShop', 'side-weapon'); } },
  { name: 'hub-shop-shield', setup: async (page) => { await cheat(page, 'navShop', 'shield'); } },
  { name: 'hub-shop-generator', setup: async (page) => { await cheat(page, 'navShop', 'generator'); } },
  { name: 'hub-shop-motor', setup: async (page) => { await cheat(page, 'navShop', 'motor'); } },
  { name: 'hub-shop-loadout', setup: async (page) => { await cheat(page, 'navShop', 'loadout'); } },
  { name: 'hub-shop-supplies', setup: async (page) => { await cheat(page, 'navShop', 'supplies'); } },
  {
    name: 'hub-dispatch-reinforcements',
    setup: async (page) => {
      // The cards grid only renders once a subscription tier is selected — a real
      // click on the left-panel row navTo alone can't reach.
      await cheat(page, 'selectSubscription', 'sub-offensive');
    },
  },
  {
    name: 'hub-settings',
    setup: async (page) => {
      await cheat(page, 'navTo', 'settings');
    },
  },
  {
    name: 'combat-m1-early',
    setup: async (page) => {
      await cheat(page, 'startMission', 'm1');
      await waitForMissionReady(page, 'm1');
      await cheat(page, 'combat.fastForward', 60);
    },
  },
  {
    name: 'combat-m6-boss',
    setup: async (page) => {
      await cheat(page, 'startMission', 'm6');
      await waitForMissionReady(page, 'm6');
      await advanceUntil(page, (s) => hasKind(s, 'boss'));
    },
  },
  {
    name: 'combat-m3b-booster',
    setup: async (page) => {
      await cheat(page, 'startMission', 'm3b');
      await waitForMissionReady(page, 'm3b');
      await advanceUntil(page, (s) => hasKind(s, 'booster'));
    },
  },
  {
    name: 'combat-m4-blocker-pressure',
    setup: async (page) => {
      await cheat(page, 'startMission', 'm4');
      await waitForMissionReady(page, 'm4');
      await advanceUntil(page, (s) => hasKind(s, 'blocker') && s.enemies.length > 1);
    },
  },
  {
    name: 'combat-m1-tap-target',
    setup: async (page) => {
      await cheat(page, 'startMission', 'm1');
      await waitForMissionReady(page, 'm1');
      const snap = await advanceUntil(page, (s) => s.enemies.length > 0);
      const target = snap.enemies[0];
      if (target !== undefined) await cheat(page, 'combat.markTarget', target.id);
    },
  },
  {
    name: 'combat-m4-hold-charge',
    setup: async (page) => {
      await cheat(page, 'startMission', 'm4');
      await waitForMissionReady(page, 'm4');
      // holdChargeTicks only accrues while >1 enemy is alive (tick.ts's accrueHoldCharge)
      // — wait for real, sustained pressure, not just a blocker's first tick of charge.
      await advanceUntil(page, (s) => s.enemies.some((e) => e.blocksConveyor && e.holdChargeTicks > 40));
    },
  },
  {
    name: 'combat-endgame-loadout',
    setup: async (page) => {
      // Rear+side+3-supplies is the tightest right-panel case the dynamic-cursor layout
      // has to fit — the plan doc claims this "looks intentionally full, not overlapping"
      // but no screenshot in the permanent record actually showed it. This is that shot.
      await cheat(page, 'equip', 'pulse-4');
      await cheat(page, 'equip', 'grenade-3');
      await cheat(page, 'equip', 'focus-3');
      await cheat(page, 'buySupply', 'sup-shield');
      await cheat(page, 'buySupply', 'sup-energy');
      await cheat(page, 'buySupply', 'sup-damage');
      await cheat(page, 'startMission', 'm1');
      await waitForMissionReady(page, 'm1');
      await cheat(page, 'combat.fastForward', 30);
    },
  },
  {
    name: 'combat-exit-confirm',
    setup: async (page) => {
      await cheat(page, 'startMission', 'm1');
      await waitForMissionReady(page, 'm1');
      await cheat(page, 'combat.fastForward', 30);
      await cheat(page, 'combat.showExitConfirm');
    },
  },
  {
    name: 'result-scene',
    setup: async (page) => {
      // A well-equipped loadout for a fast, reliable clear — the shot is about
      // ResultScene's own layout, not which mission or how close a call it was.
      await cheat(page, 'equip', 'pulse-4');
      await cheat(page, 'equip', 'shield-wall-3');
      await cheat(page, 'startMission', 'm1');
      await waitForMissionReady(page, 'm1');
      // cheatFastForward stops as soon as status leaves 'running' (victory/defeat) —
      // 6000 ticks (10 min) comfortably covers m1's real length either way.
      await cheat(page, 'combat.fastForward', 6000);
      // maybeFinish() defers the actual scene.start('ResultScene', ...) behind a real
      // this.time.delayedCall (600-1400ms) that only fires once genuine per-frame
      // ticking resumes — fastForward's own tick loop doesn't run it.
      await page.waitForTimeout(1600);
      await waitForSceneActive(page, 'ResultScene', 5000);
    },
  },
  {
    name: 'onboarding-prompt',
    setup: async (page) => {
      // reset() wipes the save to a fresh state and routes through BootScene, which
      // lands on OnboardingScene for any save that hasn't seen it — must be the LAST
      // shot in this array, since every other shot assumes richer state built up by
      // earlier shots in this same run (hub-main-menu's unlockAll(), etc.).
      await cheat(page, 'reset');
      await waitForSceneActive(page, 'OnboardingScene');
    },
  },
];

async function main(): Promise<void> {
  const requested = process.argv.slice(2);
  const shots = requested.length > 0 ? SHOTS.filter((s) => requested.includes(s.name)) : SHOTS;
  if (shots.length === 0) {
    console.error(`No matching shots. Known: ${SHOTS.map((s) => s.name).join(', ')}`);
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: VIEWPORT });
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error(`[page error] ${msg.text()}`);
  });
  page.on('pageerror', (err) => { console.error(`[page exception] ${err.stack ?? err.message}`); });

  await bootToHub(page);

  for (const shot of shots) {
    try {
      await shot.setup(page);
      await page.waitForTimeout(SETTLE_MS);
      await flushPendingOffer(page);
      const outPath = join(OUT_DIR, `${shot.name}.png`);
      await page.screenshot({ path: outPath });
      console.log(`✓ ${shot.name} -> ${outPath}`);
    } catch (err) {
      console.error(`✗ ${shot.name} failed:`, err instanceof Error ? err.message : err);
    }
  }

  await browser.close();
  console.log(`\nDone. ${String(shots.length)} shot(s) in ${OUT_DIR}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
