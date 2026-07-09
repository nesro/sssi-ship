import Phaser from 'phaser';
import { BootScene } from './BootScene';
import { CombatScene } from './CombatScene';
import { HubScene } from './HubScene';
import { ResultScene } from './ResultScene';
import { PALETTE } from './palette';
import { DPR, SCREEN_HEIGHT, SCREEN_WIDTH } from './layout';
import { defaultSave, loadSave, persistSave, resetSave, switchItem, switchShip, switchRearWeapon, switchSideWeapon } from '../save/SaveManager';

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
  scene: [BootScene, HubScene, CombatScene, ResultScene],
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
    /** Unlock all missions by granting hull/kill/shield stars. Usage: __cheat.unlockAll() */
    unlockAll: () => {
      const save = loadSave();
      const allStars: Record<string, string[]> = {
        t1: ['t1-hull-50', 't1-all-kills'],
        t2: ['t2-hull-50', 't2-hull-90', 't2-all-kills', 't2-shield'],
        t3: ['t3-hull-50', 't3-all-kills', 't3-shield'],
        t4: ['t4-hull-50', 't4-hull-90', 't4-all-kills', 't4-shield'],
        m1: ['m1-hull-50', 'm1-hull-90', 'm1-all-kills', 'm1-shield'],
        m2: ['m2-hull-50', 'm2-hull-90', 'm2-all-kills', 'm2-shield'],
        m3: ['m3-hull-50', 'm3-hull-90', 'm3-all-kills', 'm3-shield'],
        m4: ['m4-hull-50', 'm4-hull-90', 'm4-all-kills', 'm4-shield'],
        m5: ['m5-hull-50', 'm5-hull-90', 'm5-all-kills', 'm5-shield'],
        m6: ['m6-hull-50', 'm6-all-kills', 'm6-shield'],
      };
      persistSave({ ...save, missionStars: { ...save.missionStars, ...allStars } });
      goTo('HubScene');
    },
    /** Reset save to factory defaults. Usage: __cheat.reset() */
    reset: () => { resetSave(); goTo('HubScene'); },
    /** Print current save to console. Usage: __cheat.inspect() */
    inspect: () => { console.log(JSON.stringify(loadSave(), null, 2)); },
    /** Load a rich save for full shop testing. Usage: __cheat.richSave() */
    richSave: () => { persistSave({ ...defaultSave(), coins: 99999, w0Completed: true }); goTo('HubScene'); },
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
  };
  console.info('[dev] __cheat available: coins(n) · setCoins(n) · richSave() · unlockAll() · reset() · inspect() · equip(id) · navShop(tab)');
}
