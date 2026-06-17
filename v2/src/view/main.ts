import Phaser from 'phaser';
import { BootScene } from './BootScene';
import { CombatScene } from './CombatScene';
import { MenuScene } from './MenuScene';
import { ResultScene } from './ResultScene';
import { ShopScene } from './ShopScene';
import { PALETTE } from './palette';
import { DPR, SCREEN_HEIGHT, SCREEN_WIDTH } from './layout';
import { defaultSave, loadSave, persistSave, resetSave } from '../save/SaveManager';

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
  scene: [BootScene, MenuScene, CombatScene, ResultScene, ShopScene],
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
    coins: (amount: number) => { persistSave({ ...loadSave(), coins: loadSave().coins + amount }); goTo('ShopScene'); },
    /** Set coins to an exact amount. Usage: __cheat.setCoins(9999) */
    setCoins: (amount: number) => { persistSave({ ...loadSave(), coins: amount }); goTo('ShopScene'); },
    /** Unlock all missions by granting stars. Usage: __cheat.unlockAll() */
    unlockAll: () => {
      const save = loadSave();
      persistSave({ ...save, missionStars: { ...save.missionStars, 'smoke-1': ['smoke-1-hull', 'smoke-1-kills', 'smoke-1-time'] } });
      goTo('MenuScene');
    },
    /** Reset save to factory defaults. Usage: __cheat.reset() */
    reset: () => { resetSave(); goTo('MenuScene'); },
    /** Print current save to console. Usage: __cheat.inspect() */
    inspect: () => { console.log(JSON.stringify(loadSave(), null, 2)); },
    /** Load a rich save for full shop testing. Usage: __cheat.richSave() */
    richSave: () => { persistSave({ ...defaultSave(), coins: 99999 }); goTo('ShopScene'); },
  };
  console.info('[dev] __cheat available: coins(n) · setCoins(n) · richSave() · unlockAll() · reset() · inspect()');
}
