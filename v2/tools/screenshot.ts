// Headless visual-verification harness — launches chromium against the dev server and
// drives the game entirely through __cheat (main.ts), never real clicks or hardcoded
// pixel coordinates. __cheat.startMission/navTo/combat.fastForward reach any state in
// one call, and combat.inspect() lets this script *read the state back* and adaptively
// step forward until a real condition holds (e.g. "a booster is on screen") instead of
// guessing a tick number and hoping.
//
// Usage: pnpm screenshot                            # runs every shot in SHOTS below
//        pnpm screenshot hub-missions m3b-booster    # runs only the named shots
//
// Requires the dev server running (pnpm dev) and reachable at SCREENSHOT_BASE_URL
// (default http://localhost:5174).

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import type { Page } from 'playwright';
import {
  advanceUntil, bootToHub, cheat, DEVICE_SCALE_FACTOR, driveThroughOnboardingIfShown, flushPendingOffer, hasKind,
  SETTLE_MS, VIEWPORT, waitForMissionReady, waitForSceneActive,
} from './playwrightHarness';
import type { CombatSnapshot } from './playwrightHarness';

// Repo-relative, not a sandbox scratchpad path — the latter is only valid for the agent
// session that happened to create it and is gone (or belongs to someone else) by the
// next run. SCREENSHOT_OUT_DIR still overrides for anyone who wants a scratch location.
// A DPR_SCALE_FACTOR!=1 run gets its own subdirectory so it can't silently clobber the
// DPR=1 baseline screenshots — the two are meant to be compared, not overwrite each other.
const OUT_DIR = process.env.SCREENSHOT_OUT_DIR
  ?? new URL(DEVICE_SCALE_FACTOR === 1 ? '../screenshots' : `../screenshots-dpr${String(DEVICE_SCALE_FACTOR)}`, import.meta.url).pathname;

interface Shot {
  name: string;
  setup: (page: Page) => Promise<void>;
  /** Skip the automatic flushPendingOffer() before the screenshot — for the one shot
   * whose whole point is capturing a pending offer (flushing it would dismiss the very
   * thing being screenshotted). Every other shot wants the flush (a stray offer opening
   * during the real-time settle wait is noise, not signal, for them). */
  skipFlush?: boolean;
  /** Runs after this shot's own screenshot is captured, before the next shot's setup —
   * for shots that call __cheat.reset() to restore the unlockAll() baseline every OTHER
   * shot assumes. Ordering discipline ("reset shots go at the end of the array") is not
   * enough: a reset shot placed mid-array silently leaves later shots running on a
   * fresh/locked save instead of the intended baseline. This makes every shot
   * order-independent for real, not by convention. */
  cleanup?: (page: Page) => Promise<void>;
}

/** Shared cleanup for every shot whose setup calls __cheat.reset() — restores the
 * unlockAll() baseline so whichever shot runs next sees the same state regardless of
 * where in the array either shot sits. unlockAll() itself sets onboardingSeen:true and
 * forces its own transition to HubScene (main.ts), so it works standalone no matter
 * which scene the preceding shot's setup left active. */
async function restoreBaseline(page: Page): Promise<void> {
  await cheat(page, 'unlockAll');
}

const SHOTS: Shot[] = [
  {
    name: 'hub-main-menu',
    setup: async (page) => {
      await waitForSceneActive(page, 'HubScene');
      await cheat(page, 'navTo', null);
    },
  },
  // Hub button tour — each shot independently re-starts the tour then advances to its
  // own step via hub.tourNext(), so ordering relative to other shots doesn't matter.
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
    name: 'hub-tour-step-5',
    setup: async (page) => {
      await cheat(page, 'hub.showTour');
      await cheat(page, 'hub.tourNext'); await cheat(page, 'hub.tourNext');
      await cheat(page, 'hub.tourNext'); await cheat(page, 'hub.tourNext');
    },
  },
  // Shop/Dispatch screen tours — same restyled popup+arrow style as HUB_TOUR_STEPS
  // above, forced via their own showXTour() cheat (bypasses shopTourSeen/
  // dispatchTourSeen, same reasoning as hub.showTour() above: real first-visit
  // detection alone isn't repeatable once an earlier shot in this same run has already
  // visited that screen).
  { name: 'hub-shop-tour-step-1', setup: async (page) => { await cheat(page, 'hub.showShopTour'); } },
  {
    // Every step needs its own shot — HubTour.ts's multi-target rendering (a
    // highlighted target with no label inside it) can regress on just one step while
    // its siblings still look fine.
    name: 'hub-shop-tour-step-2',
    setup: async (page) => { await cheat(page, 'hub.showShopTour'); await cheat(page, 'hub.tourNext'); },
  },
  {
    name: 'hub-shop-tour-step-3',
    setup: async (page) => {
      await cheat(page, 'hub.showShopTour'); await cheat(page, 'hub.tourNext'); await cheat(page, 'hub.tourNext');
    },
  },
  { name: 'hub-dispatch-tour-step-1', setup: async (page) => { await cheat(page, 'hub.showDispatchTour'); } },
  {
    name: 'hub-dispatch-tour-step-2',
    setup: async (page) => { await cheat(page, 'hub.showDispatchTour'); await cheat(page, 'hub.tourNext'); },
  },
  {
    name: 'hub-missions',
    setup: async (page) => {
      await cheat(page, 'navTo', 'missions');
    },
  },
  // Mission info panel — never previously screenshot-tested, no __cheat existed to
  // reach it before this round. m1 (8 stars, the main-mission max) and t1 (tutorial,
  // no star list) are the two structurally different content shapes it renders.
  { name: 'hub-mission-detail-main', setup: async (page) => { await cheat(page, 'selectMission', 'm1'); } },
  { name: 'hub-mission-detail-tutorial', setup: async (page) => { await cheat(page, 'selectMission', 't1'); } },
  {
    // The daily's galaxy node + "available today" detail panel (best score, PLAY
    // button) — its own distinct color/marker (motor magenta) and layout, never
    // rendered before this feature.
    name: 'hub-daily-available',
    setup: async (page) => {
      await cheat(page, 'daily.clear');
      await cheat(page, 'selectMission', 'daily');
    },
  },
  {
    // "Already played today" state — best score + reset countdown replacing the
    // PLAY button, the one branch renderMissionInfoPanel's generic "LOCKED" text
    // deliberately does NOT handle (see HubScene.ts's renderDailyInfoPanel).
    name: 'hub-daily-played',
    setup: async (page) => {
      await cheat(page, 'daily.markPlayed', 1234);
      await cheat(page, 'selectMission', 'daily');
    },
    cleanup: async (page) => { await cheat(page, 'daily.clear'); },
  },
  {
    name: 'hub-shop-weapon',
    setup: async (page) => {
      await cheat(page, 'navShop', 'weapon');
      // This is the first real (non-forced) shop-tab visit in the run, so the
      // first-visit shop coach-mark tour auto-fires and would otherwise cover the
      // panel this shot exists to show.
      await cheat(page, 'hub.tourSkip');
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
      // This is the first real (non-forced) visit to dispatch-reinforcements in the
      // run — hub-dispatch-tour-step-1/2 force the tour via showDispatchTour(), which
      // deliberately passes skipScreenTour=true and so never sets dispatchTourSeen
      // (see HubScene.ts's cheatShowDispatchTour comment) — so the real first-visit
      // tour auto-fires here and covers the cards grid this shot exists to show. Same
      // fix as hub-shop-weapon/hub-shop-ship-star-gated above.
      await cheat(page, 'hub.tourSkip');
    },
  },
  {
    name: 'hub-settings',
    setup: async (page) => {
      await cheat(page, 'navTo', 'settings');
    },
  },
  {
    // MUSIC/SFX OFF label + dimmed-color states — every prior settings shot ran with
    // both on (the default), so these labels/colors had never actually been rendered.
    name: 'hub-settings-audio-off',
    setup: async (page) => {
      await cheat(page, 'navTo', 'settings');
      await cheat(page, 'hub.toggleAudio', 'music');
      await cheat(page, 'hub.toggleAudio', 'sfx');
    },
  },
  {
    // The "Hi, I am Nesro..." developer note lives in its own nav panel.
    name: 'hub-credits',
    setup: async (page) => {
      await cheat(page, 'navTo', 'credits');
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
    // The starter loadout reliably loses to m6 well before its boss spawns
    // (timelineTick reaches seconds(254)=2540 — missions.ts), so this equips a real
    // loadout instead. maxTicks is raised well past 2540 since m6 also has
    // turret/blocker waves (blocksConveyor) that freeze timelineTick along the way, so
    // the attempted-tick count needed to REACH timelineTick=2540 exceeds 2540 itself.
    name: 'combat-m6-boss',
    setup: async (page) => {
      await cheat(page, 'equip', 'pulse-4');
      await cheat(page, 'equip', 'shield-wall-3');
      await cheat(page, 'startMission', 'm6');
      await waitForMissionReady(page, 'm6');
      await advanceUntil(page, (s) => hasKind(s, 'boss'), 5000);
    },
  },
  {
    // The starter ship dies to m3b's own strikers before a booster ever spawns, so
    // this equips a real loadout instead.
    name: 'combat-m3b-booster',
    setup: async (page) => {
      await cheat(page, 'equip', 'pulse-3');
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
  // ---- Phase 2: remaining missions,
  // indexed by enemy kind rather than mission id — each targets a kind with zero prior
  // coverage anywhere, not just "some enemies present" on a fixed tick count. Loadouts
  // upgraded past starter gear where a probe run showed the starter loadout loses before
  // the target kind ever appears (m2, m3) — m2/m3 are balanced around real progression,
  // not the bare tutorial-tier weapon, confirmed via probe, not assumed. ----
  {
    name: 'combat-m2-tank',
    setup: async (page) => {
      await cheat(page, 'equip', 'pulse-3');
      await cheat(page, 'startMission', 'm2');
      await waitForMissionReady(page, 'm2');
      await advanceUntil(page, (s) => hasKind(s, 'tank'));
    },
  },
  {
    name: 'combat-m3-blocker',
    setup: async (page) => {
      await cheat(page, 'equip', 'pulse-3');
      await cheat(page, 'startMission', 'm3');
      await waitForMissionReady(page, 'm3');
      await advanceUntil(page, (s) => hasKind(s, 'blocker'));
    },
  },
  {
    name: 'combat-m4-turret',
    setup: async (page) => {
      await cheat(page, 'startMission', 'm4');
      await waitForMissionReady(page, 'm4');
      await advanceUntil(page, (s) => hasKind(s, 'turret'));
    },
  },
  {
    name: 'combat-m5-swarm',
    setup: async (page) => {
      await cheat(page, 'startMission', 'm5');
      await waitForMissionReady(page, 'm5');
      // hasKind(s, 'swarm') alone stops the instant a single swarm enemy exists,
      // capturing a near-empty field rather than the dense cluster this shot's name and
      // purpose promise. m5's own swarm waves (missions.ts) run 8-12 per event; require
      // a real cluster on screen before capturing.
      await advanceUntil(page, (s) => s.enemies.filter((e) => e.kind === 'swarm').length >= 5);
    },
  },
  // ---- Phase 3: interaction states with
  // no prior __cheat hook — card reroll-exhausted, side-weapon manual fire, supply
  // boost activation. Ability-bar ACTIVE/CD states skipped: the weighted draw makes an
  // active-kind ability rare enough that this isn't a tractable state to reach
  // deterministically. ----
  {
    // showReroll:false branch (CardOverlay.ts) — SKIP alone, centered, no REROLL
    // button. Never rendered before (no reroll cheat existed).
    name: 'combat-card-reroll-exhausted',
    skipFlush: true, // the whole point of this shot IS the pending offer
    setup: async (page) => {
      await cheat(page, 'startMission', 'm1');
      await waitForMissionReady(page, 'm1');
      await cheat(page, 'combat.fastForwardToOffer', 300);
      // fastForwardToOffer stops silently at maxTicks if no offer ever opened — same
      // guard as combat-card-overlay above, so a miss fails loudly instead of
      // screenshotting two no-op rerolls against ordinary combat.
      const snap = await cheat<CombatSnapshot>(page, 'combat.inspect');
      if (!snap.hasPendingOffer) throw new Error('combat-card-reroll-exhausted: no offer opened within 300 ticks');
      await cheat(page, 'combat.rerollCard'); // REROLLS_PER_MISSION = 2
      await cheat(page, 'combat.rerollCard');
    },
  },
  {
    // The picked-ability sidebar (rebuildCardDisplay's ≤6-entry single-column layout,
    // CombatScene.ts): cheatFastForward/flushPendingOffer resolve offers via the core
    // function directly, which never calls rebuildCardDisplay, so every OTHER shot in
    // this file shows an empty sidebar regardless of how long it fast-forwards. Routes
    // through the real cheatPickCard (→ handleCardAction, the same path a real tap
    // uses), not fastForward's auto-pick, specifically so the view actually rebuilds.
    name: 'combat-card-picked',
    setup: async (page) => {
      await cheat(page, 'startMission', 'm1');
      await waitForMissionReady(page, 'm1');
      for (let i = 0; i < 3; i++) {
        await cheat(page, 'combat.fastForwardToOffer', 400);
        const snap = await cheat<CombatSnapshot>(page, 'combat.inspect');
        if (!snap.hasPendingOffer) break; // mission ended or ran out of offers — take what we got
        await cheat(page, 'combat.pickCard', 0);
      }
    },
  },
  {
    // Bolt-travel visual + charge-decrement label — shipped recently (side weapons),
    // zero verification since; no fire cheat existed before this round.
    name: 'combat-side-weapon-fire',
    setup: async (page) => {
      await cheat(page, 'equip', 'focus-3');
      await cheat(page, 'startMission', 'm1');
      await waitForMissionReady(page, 'm1');
      await advanceUntil(page, (s) => s.enemies.length > 0);
      await cheat(page, 'combat.fireSideWeapon');
    },
  },
  {
    // Supply BOOST activation mid-combat — no activation cheat existed before this
    // round (tap-only).
    name: 'combat-supply-activate',
    setup: async (page) => {
      await cheat(page, 'buySupply', 'sup-shield');
      await cheat(page, 'startMission', 'm1');
      await waitForMissionReady(page, 'm1');
      await advanceUntil(page, (s) => s.enemies.length > 0);
      await cheat(page, 'combat.activateSupply', 0);
    },
  },
  {
    // Low-hull red edge vignette (VIGNETTE_THRESHOLD = 0.35, CombatScene.ts) — a
    // transient/intensity-scaled visual, never deliberately captured before. m6 with
    // starter loadout reliably burns hull down through this range on the way to a
    // confirmed defeat (result-scene-defeat's own probe).
    //
    // Threshold at hull=0.15 gives vignette intensity ~= 0.57, a clearly visible edge
    // (0.3 would only give ~0.14, an ~4px sliver invisible in the actual screenshot).
    // Not tightened further: m6's boss deals ~37.5% of max hull per collision
    // (COLLISION_DAMAGE_MULTIPLIER=3 x its 10 shotDamage on an 80-max-hull starter
    // ship) and a single collision can jump straight past a narrow window in one tick —
    // advanceUntil's predicate is only checked between 20-tick batches, so a much lower
    // target risks the run reaching defeat before ever satisfying it. Not a problem
    // even then: advanceUntil checks the predicate BEFORE its mission-ended guard, and
    // hull=0 at defeat still satisfies `< 0.15` (an even stronger vignette, not a
    // failure) — this shot succeeds via the predicate either way.
    name: 'combat-low-hull-vignette',
    setup: async (page) => {
      await cheat(page, 'reset');
      await driveThroughOnboardingIfShown(page);
      await cheat(page, 'startMission', 'm6');
      await waitForMissionReady(page, 'm6');
      await advanceUntil(page, (s) => s.ship.hull / s.ship.maxHull < 0.15);
    },
    cleanup: restoreBaseline,
  },
  {
    // Mid-mission abandon-to-hub transition, via the confirmExit cheat — the exact
    // class of scene-transition that caused a prior WebGL-restart crash (see
    // docs/known-issues.md). A regression here fails the whole run outright (via the
    // fail-on-pageerror check), which is the actual point: this is a regression guard
    // as much as a visual-coverage shot.
    name: 'hub-after-abandon',
    setup: async (page) => {
      await cheat(page, 'startMission', 'm1');
      await waitForMissionReady(page, 'm1');
      await cheat(page, 'combat.fastForward', 30);
      await cheat(page, 'combat.confirmExit');
      await waitForSceneActive(page, 'HubScene', 5000);
    },
  },
  {
    // Retry-from-defeat transition (ResultScene's RETRY button restarts the same
    // missionId while its own CombatScene instance is still the active scene) — same
    // WebGL-restart crash class, a distinct path from hub-after-abandon above (through
    // ResultScene, not straight from CombatScene).
    name: 'combat-after-retry-from-defeat',
    setup: async (page) => {
      await cheat(page, 'reset');
      await driveThroughOnboardingIfShown(page);
      await cheat(page, 'startMission', 'm6');
      await waitForMissionReady(page, 'm6');
      await cheat(page, 'combat.fastForward', 6000); // confirmed via probe: m6 starter loadout loses
      await page.waitForTimeout(1600);
      await waitForSceneActive(page, 'ResultScene', 5000);
      await cheat(page, 'startMission', 'm6'); // what RETRY does: same missionId, while ResultScene (not CombatScene) is active
      await waitForMissionReady(page, 'm6');
      await cheat(page, 'combat.fastForward', 30);
    },
    cleanup: restoreBaseline,
  },
  {
    // Forced pulse-1 (low-level weapon) — the mission's own teaching moment (energy/
    // brownout) didn't actually trigger a real brownout within a probed 300s run at
    // this forced loadout; not chased further here (a balance/pacing question, out of
    // scope for a visual-polish sweep) — this shot verifies the HUD/layout renders
    // correctly for t2's specific forced state, not that brownout is demonstrated.
    // t2's mission-start line lives in the modal (see combat-t2-narrator-modal below)
    // and is auto-dismissed by advanceUntil's own fastForward calls, so there's no
    // bottom-bar text pending here yet — 'first-support-call' only fires once an offer
    // opens, which this shot deliberately doesn't trigger (that's what
    // combat-card-overlay and combat-t4 below are for).
    name: 'combat-t2',
    setup: async (page) => {
      await cheat(page, 'startMission', 't2');
      await waitForMissionReady(page, 't2');
      await advanceUntil(page, (s) => s.enemies.length > 0);
    },
  },
  {
    // t3's teaching moment: an unkillable-by-design regenerating guardian. Same
    // mission-start-moved-to-modal reasoning as combat-t2 above — no bottom-bar wait
    // needed here either.
    name: 'combat-t3',
    setup: async (page) => {
      await cheat(page, 'startMission', 't3');
      await waitForMissionReady(page, 't3');
      await advanceUntil(page, (s) => hasKind(s, 'guardian'));
    },
  },
  {
    // t4's teaching moment (gifted reserve supplies) isn't enemy-kind-gated — any
    // on-screen enemy is representative of the forced loadout's right-panel state.
    name: 'combat-t4',
    setup: async (page) => {
      await cheat(page, 'startMission', 't4');
      await waitForMissionReady(page, 't4');
      await advanceUntil(page, (s) => s.enemies.length > 0);
      // t4's support-call hint used to co-display as a bottom-bar NarratorBar line
      // alongside the still-open card offer; it's now a second blocking modal event
      // (missions.ts's T4_NARRATOR_EVENTS) that fires and must be dismissed BEFORE the
      // offer can open at all — advanceUntil's own fastForward steps already
      // auto-dismiss it along the way (fastForward's documented behavior), so there's
      // nothing left here to wait on beyond the offer itself.
      await flushPendingOffer(page);
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
    // Energy brownout (06-combat.md: fire-rate stretches below 30% energy, never fully
    // stops) — CombatHud recolors the ENRG bar+label to BROWNOUT_COLOR
    // (viewmodel/combat.ts) below that threshold, a real, working, documented mechanic
    // never permanently screenshotted before this round. The starter loadout (torrent
    // generator) doesn't naturally brownout under normal auto-fire play within a
    // reasonable tick budget — confirmed via live probe, not assumed — so this
    // deliberately equips reserve generator (known low-output tier,
    // docs/known-issues.md's Reserve-generator history) + ion weapon (a genuinely
    // energy-hungry per-shot cost) specifically to reach it quickly and reliably.
    name: 'combat-brownout',
    setup: async (page) => {
      await cheat(page, 'equip', 'generator-reserve-1');
      await cheat(page, 'equip', 'ion-1');
      await cheat(page, 'startMission', 'm1');
      await waitForMissionReady(page, 'm1');
      // reserve-1's capacity is 100 (items.ts's GENERATOR_BASE) — BROWNOUT_THRESHOLD is
      // 0.3, so <30 is the real trigger; verified live this lands within ~25 ticks.
      await advanceUntil(page, (s) => s.ship.energy < 30 && s.enemies.length > 0, 200);
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
    // The daily's exit-confirm modal gets an extra subtitle campaign missions don't
    // show ("banks coins earned so far... ends today's attempt") — a distinct render
    // path (showExitConfirm's isDaily branch, CombatScene.ts), never screenshotted.
    name: 'combat-daily-exit-confirm',
    setup: async (page) => {
      await cheat(page, 'daily.clear');
      await cheat(page, 'startMission', 'daily');
      await waitForMissionReady(page, 'daily');
      await cheat(page, 'combat.fastForward', 30);
      await cheat(page, 'combat.showExitConfirm');
    },
    cleanup: async (page) => { await cheat(page, 'daily.clear'); },
  },
  {
    // Result screen after abandoning the daily — confirms the abandon-consumes-attempt
    // path actually banks coins and reaches ResultScene (not just HubScene, unlike the
    // campaign's abandon), the 'daily' button set (MISSIONS only, no RETRY/SHOP),
    // dailyBonus.coinsAwarded (DAILY_COIN_MULT applied) rather than the raw run score,
    // and the amber "MISSION ABANDONED" title with no death-flash — a voluntary quit
    // with a live ship must never render as a red "SHIP DESTROYED" over "HULL 100%".
    name: 'result-scene-daily',
    setup: async (page) => {
      await cheat(page, 'daily.clear');
      await cheat(page, 'startMission', 'daily');
      await waitForMissionReady(page, 'daily');
      await cheat(page, 'combat.fastForward', 80);
      await cheat(page, 'combat.confirmExit');
      await page.waitForTimeout(1600);
      await waitForSceneActive(page, 'ResultScene', 5000);
    },
    cleanup: async (page) => { await cheat(page, 'daily.clear'); },
  },
  {
    name: 'combat-card-overlay',
    skipFlush: true, // the whole point of this shot IS the pending offer — don't flush it
    setup: async (page) => {
      // Every other combat shot deliberately fast-forwards PAST support-call offers
      // (flushPendingOffer) — this is the one shot that actually stops on one, via
      // fastForwardToOffer, so CardOverlay's own text/buttons get checked at all.
      // m1's first support call is scheduled at seconds(20) = tick 200 (missions.ts).
      await cheat(page, 'startMission', 'm1');
      await waitForMissionReady(page, 'm1');
      await cheat(page, 'combat.fastForwardToOffer', 300);
      // fastForwardToOffer stops silently at maxTicks if no offer ever opened (e.g. m1
      // gains a blocker that stalls the timeline past supportCallTicks' schedule) — read
      // state back and fail loudly rather than silently screenshotting ordinary combat
      // mislabeled as the card overlay.
      const snap = await cheat<CombatSnapshot>(page, 'combat.inspect');
      if (!snap.hasPendingOffer) throw new Error('combat-card-overlay: no offer opened within 300 ticks');
    },
  },
  {
    // The narrator MODAL (blocking, its own CONTINUE/NEXT button) — not the passive
    // bottom NarratorBar strip, which never pauses the sim and needs no dedicated shot.
    // Only w0 defines narratorEvents, and w0 has no galaxy-map node (known-issues.md) —
    // reachable here only via startMission('w0'), same as any other mission id.
    name: 'combat-narrator-modal',
    // w0 has no scheduled support-call offers today (supportCallTicks: []), so this is
    // currently a no-op either way — set anyway so it stays correct if that ever
    // changes (flushPendingOffer would otherwise resolve a co-pending narrator first,
    // per docs/known-issues.md's narrator-desync entry).
    skipFlush: true,
    setup: async (page) => {
      await cheat(page, 'startMission', 'w0');
      await waitForMissionReady(page, 'w0');
      await cheat(page, 'combat.fastForwardToNarrator', 300);
      // fastForwardToNarrator stops silently at maxTicks if no narrator ever opened —
      // fail loudly instead of screenshotting plain combat mislabeled as the modal.
      const snap = await cheat<CombatSnapshot>(page, 'combat.inspect');
      if (!snap.hasPendingNarrator) throw new Error('combat-narrator-modal: no narrator opened within 300 ticks');
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
      // this.time.delayedCall (600-2000ms, outcome-dependent) that only fires once
      // genuine per-frame ticking resumes — fastForward's own tick loop doesn't run it.
      await page.waitForTimeout(1600);
      await waitForSceneActive(page, 'ResultScene', 5000);
    },
  },
  // ---- Phase 1: first-run coverage ----
  // These are literally what "I start the game" means — the actual starting state a
  // brand-new player sees, which every shot above this point assumes is already past
  // (they all run on the globally-unlockAll'd save). All reset() first and are grouped
  // here with the other reset()-based shots at the end for the same reason
  // result-scene-defeat already is.
  {
    name: 'hub-main-menu-fresh',
    setup: async (page) => {
      await cheat(page, 'reset');
      await driveThroughOnboardingIfShown(page);
      await cheat(page, 'navTo', null);
    },
    cleanup: restoreBaseline,
  },
  {
    name: 'hub-missions-fresh',
    setup: async (page) => {
      await cheat(page, 'reset');
      await driveThroughOnboardingIfShown(page);
      await cheat(page, 'navTo', 'missions');
    },
    cleanup: restoreBaseline,
  },
  {
    // Also closes known-issues.md's top open item (locked-mission START button isn't
    // gated on canStart) — this is the actual screen that question is about.
    name: 'hub-mission-detail-locked',
    setup: async (page) => {
      await cheat(page, 'reset');
      await driveThroughOnboardingIfShown(page);
      await cheat(page, 'selectMission', 'm5'); // only t1 is unlocked on a fresh save
    },
    cleanup: restoreBaseline,
  },
  {
    // The daily's m1-completion gate: on a fresh save the daily node must render as a
    // dim "???" like any locked
    // campaign node (not the bright always-on magenta marker that used to outshine t1),
    // and cheat-selecting it must show the generic LOCKED panel — no name, no best
    // score, no PLAY. `hub-daily-available` (earlier in this array, unlockAll baseline)
    // still covers the unlocked panel.
    name: 'hub-daily-locked-fresh',
    setup: async (page) => {
      await cheat(page, 'reset');
      await driveThroughOnboardingIfShown(page);
      await cheat(page, 'daily.clear');
      await cheat(page, 'selectMission', 'daily');
    },
    cleanup: restoreBaseline,
  },
  {
    name: 'hub-missions-mid-progression',
    setup: async (page) => {
      await cheat(page, 'reset');
      await driveThroughOnboardingIfShown(page);
      await cheat(page, 'setProgress', ['t1', 't2', 'm1']);
      await cheat(page, 'navTo', 'missions');
    },
    cleanup: restoreBaseline,
  },
  {
    // Forced weaponId: null — an AUTO-FIRE-with-no-weapon rendering, and the mission's
    // real teaching moment (shield/collision kills, not weapon fire). t1's
    // mission-start narration lives in a blocking modal, auto-dismissed by
    // advanceUntil's own combat.fastForward calls (cheatFastForward already resolves
    // pendingNarrator, same as pendingOffer), and t1 has no support calls at all, so
    // there's no bottom-bar text left to wait out here.
    name: 'combat-t1',
    setup: async (page) => {
      await cheat(page, 'reset');
      await driveThroughOnboardingIfShown(page);
      await cheat(page, 'startMission', 't1');
      await waitForMissionReady(page, 't1');
      await advanceUntil(page, (s) => hasKind(s, 'sentinel'));
    },
    cleanup: restoreBaseline,
  },
  {
    // The blocking narrator MODAL at each tutorial's mission start. skipFlush because
    // the whole point is the still-pending narrator; fastForwardToNarrator stops the
    // instant one is showing instead of auto-resolving it like fastForward does.
    name: 'combat-t1-narrator-modal',
    skipFlush: true,
    setup: async (page) => {
      await cheat(page, 'startMission', 't1');
      await waitForMissionReady(page, 't1');
      await cheat(page, 'combat.fastForwardToNarrator', 30);
      // fastForwardToNarrator stops silently at maxTicks if no narrator ever opened —
      // fail loudly instead of screenshotting plain combat mislabeled as the modal.
      const snap = await cheat<CombatSnapshot>(page, 'combat.inspect');
      if (!snap.hasPendingNarrator) throw new Error('combat-t1-narrator-modal: no narrator opened within 30 ticks');
    },
  },
  {
    // t1's SECOND narrator event — pauses right after the first guardian collision so
    // its lines can point at real, freshly-changed SHLD/ENRG numbers instead of
    // describing the shield-burst mechanic before it's ever been seen (missions.ts's
    // T1_NARRATOR_EVENTS comment has the exact tick derivation). waitForMissionReady
    // returns before event 1 has actually opened (tick still 0 — checkNarratorEvents
    // only runs inside advanceTick), so the first fastForwardToNarrator call is what
    // reveals event 1; dismissNarrator resolves it, then the second
    // fastForwardToNarrator call reaches event 2.
    name: 'combat-t1-narrator-modal-2',
    skipFlush: true,
    setup: async (page) => {
      await cheat(page, 'startMission', 't1');
      await waitForMissionReady(page, 't1');
      await cheat(page, 'combat.fastForwardToNarrator', 5);
      await cheat(page, 'combat.dismissNarrator');
      await cheat(page, 'combat.fastForwardToNarrator', 70);
      const snap = await cheat<CombatSnapshot>(page, 'combat.inspect');
      if (!snap.hasPendingNarrator) throw new Error('combat-t1-narrator-modal-2: no second narrator opened within 70 ticks');
    },
  },
  {
    name: 'combat-t2-narrator-modal',
    skipFlush: true,
    setup: async (page) => {
      await cheat(page, 'startMission', 't2');
      await waitForMissionReady(page, 't2');
      await cheat(page, 'combat.fastForwardToNarrator', 30);
      const snap = await cheat<CombatSnapshot>(page, 'combat.inspect');
      if (!snap.hasPendingNarrator) throw new Error('combat-t2-narrator-modal: no narrator opened within 30 ticks');
    },
  },
  {
    name: 'combat-t3-narrator-modal',
    skipFlush: true,
    setup: async (page) => {
      await cheat(page, 'startMission', 't3');
      await waitForMissionReady(page, 't3');
      await cheat(page, 'combat.fastForwardToNarrator', 30);
      const snap = await cheat<CombatSnapshot>(page, 'combat.inspect');
      if (!snap.hasPendingNarrator) throw new Error('combat-t3-narrator-modal: no narrator opened within 30 ticks');
    },
  },
  {
    name: 'combat-t4-narrator-modal',
    skipFlush: true,
    setup: async (page) => {
      await cheat(page, 'startMission', 't4');
      await waitForMissionReady(page, 't4');
      await cheat(page, 'combat.fastForwardToNarrator', 30);
      const snap = await cheat<CombatSnapshot>(page, 'combat.inspect');
      if (!snap.hasPendingNarrator) throw new Error('combat-t4-narrator-modal: no narrator opened within 30 ticks');
    },
  },
  {
    // t1's defeat-shop-redirect screen — a real new player's first-ever result screen.
    // Unlike t2's version of this shot below, this one IS sim-guaranteed (torrent-1,
    // the real starter generator, fails t1's wave 0% of the time — no live-seed
    // variance to caveat).
    name: 'result-scene-t1-shop-redirect',
    setup: async (page) => {
      await cheat(page, 'reset');
      await driveThroughOnboardingIfShown(page);
      await cheat(page, 'startMission', 't1');
      await waitForMissionReady(page, 't1');
      await cheat(page, 'combat.fastForward', 6000);
      // t1 has a defeatHint (missions.ts) — the transition to ResultScene now waits on
      // its own popup (showDefeatHintPopup, CombatScene.ts) instead of a fixed timer.
      await page.waitForTimeout(900);
      await cheat(page, 'combat.dismissDefeatHintPopup');
      await waitForSceneActive(page, 'ResultScene', 5000);
    },
    cleanup: restoreBaseline,
  },
  {
    // w0 combat, not just its narrator modal (already covered by combat-narrator-modal)
    // — dismiss every scripted narrator first so this actually shows ordinary mid-
    // mission combat, not another narrator popup.
    name: 'combat-w0',
    setup: async (page) => {
      await cheat(page, 'reset');
      await driveThroughOnboardingIfShown(page);
      await cheat(page, 'startMission', 'w0');
      await waitForMissionReady(page, 'w0');
      await cheat(page, 'combat.fastForward', 250); // past w0's narrator events, well before its ~34.5s victory
    },
    cleanup: restoreBaseline,
  },
  // ---- Phase 4: save-state x shop-chip-
  // state matrix. Every prior shop shot ran on the same unlockAll() baseline (50/50
  // stars, ~0 coins), which structurally can never show the star-"locked" chip state
  // (needs <50 stars) or the "affordable at a real price" state distinctly from
  // "unaffordable" (needs meaningfully more coins than the baseline's near-zero). ----
  {
    // Level chips star-gated (Lv2 ★3 .. Lv5 ★26) — the "locked" chip state
    // (HubScene.ts's four-state alpha table) never rendered by the 50/50-star baseline.
    name: 'hub-shop-ship-star-gated',
    setup: async (page) => {
      await cheat(page, 'reset');
      await driveThroughOnboardingIfShown(page);
      await cheat(page, 'navShop', 'ship');
      // Fresh save (reset() above) means shopTourSeen is false, so the first-visit shop
      // tour auto-fires here too and covers the star-locked level-chip row this shot
      // exists to demonstrate — same fix as hub-shop-weapon above.
      await cheat(page, 'hub.tourSkip');
    },
    cleanup: restoreBaseline,
  },
  {
    // setCoins(999999), nothing equipped beyond starter gear — "affordable, real price"
    // for every level tier, distinct from the baseline's "already 0-cost" (equipped
    // system priced the same as Lv1) and from unaffordable (near-zero coins).
    name: 'hub-shop-weapon-rich-unspent',
    setup: async (page) => {
      await cheat(page, 'setCoins', 999999);
      await cheat(page, 'navShop', 'weapon');
    },
  },
  {
    // Every level of the current kind already owned — trade-in prices at "0⬤ (this is
    // what you have)" rather than a buyable price; the fully-maxed end state.
    name: 'hub-shop-weapon-maxed',
    setup: async (page) => {
      await cheat(page, 'setCoins', 999999);
      await cheat(page, 'equip', 'pulse-5');
      await cheat(page, 'navShop', 'weapon');
    },
  },
  {
    // Top-bar coin readout is plain dynamic-width text, no fixed box (HubScene.ts) —
    // never checked past 6 digits for crowding the title/BACK button to its left. The
    // top bar only renders once nav !== null (it's absent from the plain main menu).
    name: 'hub-missions-huge-coins',
    setup: async (page) => {
      await cheat(page, 'setCoins', 12345678);
      await cheat(page, 'navTo', 'missions');
    },
  },
  {
    // "SHIP DESTROYED" (red title) vs "MISSION COMPLETE" — never screenshotted before;
    // every existing result-scene coverage only ever captures a victory. reset() first
    // to guarantee the starter loadout regardless of what earlier shots in this run
    // equipped — m6 (hardest mission) reliably loses to it (confirmed via probe: hull
    // 0/80). startMission bypasses hub unlock-gating, so m6 is reachable even on a
    // fresh/locked save. `cleanup` restores the unlockAll() baseline afterward.
    name: 'result-scene-defeat',
    setup: async (page) => {
      await cheat(page, 'reset');
      await driveThroughOnboardingIfShown(page);
      await cheat(page, 'startMission', 'm6');
      await waitForMissionReady(page, 'm6');
      await cheat(page, 'combat.fastForward', 6000);
      await page.waitForTimeout(1600);
      await waitForSceneActive(page, 'ResultScene', 5000);
    },
    cleanup: restoreBaseline,
  },
  {
    // t2's defeat-shop-redirect screen — a real gear loss (not sim-guaranteed like
    // m6 above, since t2's own difficulty is a real ~90% first-attempt fail rate, not
    // a deliberately unwinnable stat check): live-seeded, so an occasional re-run of
    // this fixture could land on the rare victory instead. Fine as a one-off visual
    // check; not something to chase determinism for.
    name: 'result-scene-t2-shop-redirect',
    setup: async (page) => {
      await cheat(page, 'reset');
      await driveThroughOnboardingIfShown(page);
      await cheat(page, 'startMission', 't2');
      await waitForMissionReady(page, 't2');
      await cheat(page, 'combat.fastForward', 6000);
      // t2 also has a defeatHint — same popup-gated transition as t1 above.
      await page.waitForTimeout(900);
      await cheat(page, 'combat.dismissDefeatHintPopup');
      await waitForSceneActive(page, 'ResultScene', 5000);
    },
    cleanup: restoreBaseline,
  },
  {
    // AlphaNoticeScene shows on EVERY launch, no save-flag gate, so a plain reset()
    // (which routes through BootScene) is enough to land back on it; no
    // driveThroughOnboardingIfShown() here since dismissing it IS the point of this
    // shot.
    name: 'alpha-notice',
    setup: async (page) => {
      await cheat(page, 'reset');
      await waitForSceneActive(page, 'AlphaNoticeScene');
    },
    cleanup: restoreBaseline,
  },
];

// A page exception during a shot's setup (e.g. the WebGL-restart crash known-issues.md
// documents) used to only print a console line — the shot still got a screenshot of
// whatever half-broken frame was on screen and reported ✓, and the whole run always
// exited 0 regardless of any failure. Tracked here and checked before/after every shot,
// and the run now exits 1 if anything failed, so CI/scripted use can actually trust the
// exit code instead of needing a human to read the log.
// Read/write through functions, not a bare variable/property — TypeScript's
// control-flow narrowing persists a `!== null` check through `await` points even
// though the pageerror listener can reassign the underlying variable asynchronously in
// between; wrapping the read behind a function call defeats that (a call's return type
// isn't narrowed by the caller's prior flow analysis the same way a direct reference is).
let lastPageError: string | null = null;
function setPageError(message: string): void { lastPageError = message; }
function takePageError(): string | null { const m = lastPageError; lastPageError = null; return m; }

function resolvePendingShots(): Shot[] {
  const requested = process.argv.slice(2);
  const shots = requested.length > 0 ? SHOTS.filter((s) => requested.includes(s.name)) : SHOTS;
  if (shots.length === 0) {
    console.error(`No matching shots. Known: ${SHOTS.map((s) => s.name).join(', ')}`);
    process.exit(1);
  }
  return shots;
}

/** Checked, not blindly cleared: an error landing after the PREVIOUS shot's own check
 * (during its page.screenshot() or cleanup()) must be surfaced against the shot it
 * actually happened after, not silently discarded and attributed to nobody. `context`
 * is either "before <next shot> started" or "run ending" (the final post-loop check).
 * Returns the failure count (0 or 1) to add to the running total. */
function reportStrayError(previousShotName: string, context: string): number {
  const strayError = takePageError();
  if (strayError === null) return 0;
  console.error(`✗ page exception after ${previousShotName} (${context}):`, strayError);
  return 1;
}

async function runShotSetupAndCapture(page: Page, shot: Shot): Promise<void> {
  await shot.setup(page);
  await page.waitForTimeout(SETTLE_MS);
  if (shot.skipFlush !== true) await flushPendingOffer(page);
  const errorDuringSetup = takePageError();
  if (errorDuringSetup !== null) {
    throw new Error(`page exception during setup: ${errorDuringSetup}`);
  }
  // Re-check right before capturing, not just once after setup: real time keeps passing
  // between flushPendingOffer's return above and this screenshot call (this same
  // takePageError() check included), long enough for a support call scheduled close to
  // this shot's own stopping point to open in that gap — confirmed via
  // combat-m4-turret capturing the card overlay intermittently. flushPendingOffer is a
  // no-op when nothing is pending, so this costs nothing on every other shot.
  if (shot.skipFlush !== true) await flushPendingOffer(page);
  const outPath = join(OUT_DIR, `${shot.name}.png`);
  await page.screenshot({ path: outPath });
  console.log(`✓ ${shot.name} -> ${outPath}`);
}

/** Cleanup must run in `finally` at the call site, not only on success: a setup throw
 * that skips cleanup entirely leaves reset-based shots (cleanup: restoreBaseline) on
 * whatever broken/mid-mission state the failed setup produced, and EVERY LATER shot in
 * the batch would then silently render against that wrong state while still reporting
 * ✓. A cleanup failure is itself reported, not swallowed, but doesn't stop the batch. */
async function runShotCleanup(page: Page, shot: Shot): Promise<number> {
  if (!shot.cleanup) return 0;
  try {
    await shot.cleanup(page);
    return 0;
  } catch (cleanupErr) {
    console.error(`✗ ${shot.name} cleanup failed:`, cleanupErr instanceof Error ? cleanupErr.message : cleanupErr);
    return 1;
  }
}

async function runOneShot(page: Page, shot: Shot, previousShotName: string): Promise<number> {
  let failures = reportStrayError(previousShotName, `before ${shot.name} started`);
  try {
    await runShotSetupAndCapture(page, shot);
  } catch (err) {
    failures += 1;
    console.error(`✗ ${shot.name} failed:`, err instanceof Error ? err.message : err);
  } finally {
    failures += await runShotCleanup(page, shot);
  }
  return failures;
}

async function launchPage(): Promise<{ browser: Awaited<ReturnType<typeof chromium.launch>>; page: Page }> {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: DEVICE_SCALE_FACTOR });
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error(`[page error] ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    const message = err.stack ?? err.message;
    console.error(`[page exception] ${message}`);
    setPageError(message);
  });
  return { browser, page };
}

async function main(): Promise<void> {
  const shots = resolvePendingShots();

  mkdirSync(OUT_DIR, { recursive: true });
  const { browser, page } = await launchPage();

  await bootToHub(page);
  // Applied globally, not inside any one shot's setup — a selective run
  // (`pnpm screenshot hub-shop-weapon`) used to render a different (mostly-locked)
  // shop than a full-batch run, since unlockAll() previously only ever ran as a side
  // effect of hub-main-menu happening to run first. Matches tap-target-audit.ts's
  // main(), which already did this correctly.
  await cheat(page, 'unlockAll');

  let failures = 0;
  let previousShotName = 'boot';
  for (const shot of shots) {
    failures += await runOneShot(page, shot, previousShotName);
    previousShotName = shot.name;
  }
  // Same check, once more after the loop — an error during the LAST shot's own
  // screenshot()/cleanup() would otherwise never be looked at at all.
  failures += reportStrayError(previousShotName, 'run ending');

  await browser.close();
  console.log(`\nDone. ${String(shots.length)} shot(s) in ${OUT_DIR}. ${String(failures)} failure(s).`);
  if (failures > 0) process.exit(1);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
