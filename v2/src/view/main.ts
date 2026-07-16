import Phaser from 'phaser';
import { BootScene } from './BootScene';
import { CombatScene } from './CombatScene';
import { HubScene } from './HubScene';
import { OnboardingScene } from './OnboardingScene';
import { ResultScene } from './ResultScene';
import { PALETTE } from './palette';
import { DPR, SCREEN_HEIGHT, SCREEN_WIDTH } from './layout';
import { buySupplyCharge, defaultSave, loadSave, persistSave, resetSave, switchItem, switchShip, switchRearWeapon, switchSideWeapon } from '../save/SaveManager';
import { ALL_MISSIONS } from '../data/missions';

// dpr-sharp canvas (V2_HANDOFF.md §4.2): render at native resolution, zoom back to
// logical CSS size. Never Scale.FIT on a small canvas — that was v1's blurry-text bug.
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: SCREEN_WIDTH,
  height: SCREEN_HEIGHT,
  zoom: 1 / DPR,
  backgroundColor: PALETTE.backgroundNearBlack,
  render: { roundPixels: true },
  scene: [BootScene, OnboardingScene, HubScene, CombatScene, ResultScene],
});

// Dev/debug handle (v1 convention): drive scenes from the browser console.
const g = globalThis as Record<string, unknown>;
g.__game = game;

if (import.meta.env.DEV) {
  const goTo = (key: string) => {
    game.scene.getScenes(true).forEach((s) => { game.scene.stop(s.scene.key); });
    game.scene.start(key);
  };
  g.__cheat = {
    /** Add coins to the current save. Usage: __cheat.coins(5000) */
    coins: (amount: number) => { persistSave({ ...loadSave(), coins: loadSave().coins + amount }); goTo('HubScene'); },
    /** Set coins to an exact amount. Usage: __cheat.setCoins(9999) */
    setCoins: (amount: number) => { persistSave({ ...loadSave(), coins: amount }); goTo('HubScene'); },
    /** Unlock every mission by marking each one completed. Usage: __cheat.unlockAll()
     * Star ids are derived from each mission's own `stars` array (src/data/missions.ts)
     * rather than hand-listed here — a hardcoded copy is exactly what let m3b silently
     * fall through this cheat (and GALAXY_NODES, viewmodel/hub.ts) when it was added:
     * nothing failed, the new mission just never showed up.
     * Tutorials (t1-t4, forcedLoadout set) and w0 are excluded from missionStars, matching
     * applyMissionResult's real-play behavior (SaveManager.ts) — they never earn stars,
     * so totalStarsAvailable()'s 50-star total (7 main missions only) stays the correct
     * denominator against totalStars(save). Including them here previously produced an
     * impossible "63/50" in the hub header. */
    unlockAll: () => {
      const save = loadSave();
      const starredMissions = ALL_MISSIONS.filter((m) => m.forcedLoadout === undefined);
      const allStars: Record<string, string[]> = Object.fromEntries(
        starredMissions.map((m) => [m.id, m.stars.map((s) => s.id)]),
      );
      persistSave({
        ...save,
        missionStars: { ...save.missionStars, ...allStars },
        completedMissionIds: ALL_MISSIONS.map((m) => m.id),
        onboardingSeen: true,
      });
      goTo('HubScene');
    },
    /** Reset save to factory defaults. Usage: __cheat.reset()
     * Routes through BootScene (not straight to HubScene) so a reset save exercises the
     * same onboardingSeen check a real fresh install would — including landing on
     * OnboardingScene, same as any other fresh save. */
    reset: () => { resetSave(); goTo('BootScene'); },
    /** Print current save to console. Usage: __cheat.inspect() */
    inspect: () => { console.log(JSON.stringify(loadSave(), null, 2)); },
    /** Load a rich save for full shop testing. Usage: __cheat.richSave() */
    richSave: () => { persistSave({ ...defaultSave(), coins: 99999, w0Completed: true, onboardingSeen: true }); goTo('HubScene'); },
    /**
     * Equip any item by ID without clicking — skips coin deduction.
     * Usage: __cheat.equip('shield-reflex-3')
     * Works for weapons, rear-weapons, side-weapons, shields, generators, motors, ships.
     */
    equip: (id: string) => {
      let save = loadSave();
      if (id.startsWith('ship-')) {
        save = switchShip({ ...save, coins: 999999 }, id);
      } else if (id.match(/^(grenade|flak|plasma|arc|cluster)-\d/)) {
        save = switchRearWeapon({ ...save, coins: 999999 }, id);
      } else if (id.match(/^(focus|flechette|railgun|orbital)-\d/)) {
        save = switchSideWeapon({ ...save, coins: 999999 }, id);
      } else {
        save = switchItem({ ...save, coins: 999999 }, id);
      }
      persistSave(save);
      goTo('HubScene');
    },
    /**
     * Buy one charge of a reserve supply without clicking or a real coin check.
     * Usage: __cheat.buySupply('sup-shield')  // sup-shield | sup-energy | sup-damage
     */
    buySupply: (id: string) => {
      const save = buySupplyCharge({ ...loadSave(), coins: 999999 }, id);
      persistSave(save);
      goTo('HubScene');
    },
    /**
     * Navigate to a shop tab without clicking.
     * Usage: __cheat.navShop('motor')   // weapon | rear-weapon | side-weapon | shield | generator | motor | ship | supplies | loadout
     */
    navShop: (tab: string) => {
      const scene = game.scene.getScene('HubScene') as unknown as Record<string, unknown> | null;
      if (scene && typeof scene['cheatNavShop'] === 'function') {
        (scene['cheatNavShop'] as (t: string) => void)(tab);
      } else {
        goTo('HubScene');
      }
    },
    /**
     * Navigate to any top-level hub section without clicking — navShop only ever
     * reaches 'shop'; this covers the rest.
     * Usage: __cheat.navTo('dispatch-reinforcements')  // missions | shop | dispatch-reinforcements | settings | null
     */
    navTo: (nav: string | null) => {
      const scene = game.scene.getScene('HubScene') as unknown as Record<string, unknown> | null;
      if (scene && typeof scene['cheatNavTo'] === 'function') {
        (scene['cheatNavTo'] as (n: string | null) => void)(nav);
      } else {
        goTo('HubScene');
      }
    },
    /**
     * Select a Dispatch Reinforcements subscription tier without clicking — the cards
     * grid only renders once one is selected, which navTo alone can't reach.
     * Usage: __cheat.selectSubscription('sub-offensive')
     */
    selectSubscription: (id: string) => {
      const scene = game.scene.getScene('HubScene') as unknown as Record<string, unknown> | null;
      if (scene && typeof scene['cheatSelectSubscription'] === 'function') {
        (scene['cheatSelectSubscription'] as (i: string) => void)(id);
      }
    },
    /**
     * Jump straight into combat for any mission id, bypassing hub navigation entirely.
     * Usage: __cheat.startMission('m3b')
     */
    startMission: (missionId: string) => {
      game.scene.getScenes(true).forEach((s) => { game.scene.stop(s.scene.key); });
      game.scene.start('CombatScene', { missionId });
    },
    /**
     * Combat-scene-only cheats — no-op (logged) if CombatScene isn't currently active.
     * Usage: __cheat.combat.fastForward(400) · __cheat.combat.markTarget(7) ·
     *        __cheat.combat.setToggle('rear', false) · __cheat.combat.inspect()
     */
    combat: {
      fastForward: (ticks: number) => callCombatCheat('cheatFastForward', ticks),
      markTarget: (enemyId: number | null) => callCombatCheat('cheatMarkTarget', enemyId),
      setToggle: (system: string, on: boolean) => callCombatCheat('cheatSetToggle', system, on),
      inspect: (): unknown => callCombatCheat('cheatInspect'),
      showExitConfirm: () => callCombatCheat('cheatShowExitConfirm'),
    },
    /**
     * OnboardingScene-only cheat — no-op (logged) if it isn't currently active.
     * Usage: __cheat.onboarding.choose('tutorials' | 'skip')
     */
    onboarding: {
      choose: (choice: 'tutorials' | 'skip') => {
        if (!game.scene.isActive('OnboardingScene')) {
          console.warn('[dev] __cheat.onboarding.choose — OnboardingScene isn\'t active right now');
          return;
        }
        (game.scene.getScene('OnboardingScene') as unknown as { cheatChoose: (c: 'tutorials' | 'skip') => void }).cheatChoose(choice);
      },
    },
    /**
     * HubScene-only cheats — no-op (logged) if it isn't currently active.
     * Usage: __cheat.hub.showTour() · __cheat.hub.tourNext() · __cheat.hub.tourSkip()
     */
    hub: {
      showTour: () => { callHubCheat('cheatShowTour'); },
      tourNext: () => { callHubCheat('cheatTourNext'); },
      tourSkip: () => { callHubCheat('cheatTourSkip'); },
    },
  };
  console.info(
    '[dev] __cheat available: coins(n) · setCoins(n) · richSave() · unlockAll() · reset() · ' +
      'inspect() · equip(id) · buySupply(id) · navShop(tab) · navTo(nav) · selectSubscription(id) · startMission(id) · ' +
      'combat.{fastForward,markTarget,setToggle,inspect,showExitConfirm} · onboarding.choose(choice) · ' +
      'hub.{showTour,tourNext,tourSkip}',
  );
}

/** Looks up HubScene and invokes a cheatXxx method on it by name — same shared-plumbing
 * pattern as callCombatCheat below. */
function callHubCheat(method: string, ...args: unknown[]): unknown {
  const g = globalThis as Record<string, unknown>;
  const game = g.__game as Phaser.Game | undefined;
  if (game === undefined || !game.scene.isActive('HubScene')) {
    console.warn(`[dev] __cheat.hub.${method} — HubScene isn't active right now`);
    return undefined;
  }
  const scene = game.scene.getScene('HubScene') as unknown as Record<string, unknown>;
  if (typeof scene[method] !== 'function') {
    console.warn(`[dev] __cheat.hub.${method} — no such method`);
    return undefined;
  }
  return (scene[method] as (...a: unknown[]) => unknown)(...args);
}

/** Looks up the active CombatScene and invokes a cheatXxx method on it by name — the
 * shared plumbing behind every __cheat.combat.* entry above. Logs and returns
 * undefined (instead of throwing) when CombatScene isn't currently running, since a
 * screenshot harness driving this from outside the page can't otherwise tell why a
 * call silently did nothing. */
function callCombatCheat(method: string, ...args: unknown[]): unknown {
  const g = globalThis as Record<string, unknown>;
  const game = g.__game as Phaser.Game | undefined;
  // Phaser instantiates every registered scene at Game construction, so getScene()
  // alone would return a CombatScene object even when create() has never run on it
  // (this.core still undefined) — isActive() is the real "is this scene running" check.
  if (game === undefined || !game.scene.isActive('CombatScene')) {
    console.warn(`[dev] __cheat.combat.${method} — CombatScene isn't active right now`);
    return undefined;
  }
  const scene = game.scene.getScene('CombatScene') as unknown as Record<string, unknown>;
  if (typeof scene[method] !== 'function') {
    console.warn(`[dev] __cheat.combat.${method} — no such method`);
    return undefined;
  }
  return (scene[method] as (...a: unknown[]) => unknown)(...args);
}
