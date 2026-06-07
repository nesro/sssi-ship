/// <reference types="vite/client" />
// main.ts
// Entry point. Registers all scenes and boots the game.
// WelcomeScene runs first — it redirects to MenuScene if already seen.

import Phaser from 'phaser';
import { WelcomeScene }       from './scenes/WelcomeScene.js';
import { MenuScene }          from './scenes/MenuScene.js';
import { MissionSelectScene } from './scenes/MissionSelectScene.js';
import { GameScene }          from './scenes/GameScene.js';
import { ResultScene }        from './scenes/ResultScene.js';
import { ShopScene }          from './scenes/ShopScene.js';
import { TalentScene }        from './scenes/TalentScene.js';
import { RunHistoryScene }    from './scenes/RunHistoryScene.js';

const game = new Phaser.Game({
  type:            Phaser.AUTO,
  width:           800,
  height:          480,
  backgroundColor: '#000000',
  parent:          'game-container',

  scene: [
    WelcomeScene,       // boots first; skips to MenuScene if welcomeSeen
    MenuScene,
    MissionSelectScene,
    GameScene,
    ResultScene,
    ShopScene,
    TalentScene,
    RunHistoryScene,
  ],

  physics: {
    default: 'arcade',
    arcade:  { gravity: { x: 0, y: 0 }, debug: false },
  },

  scale: {
    mode:       Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
});

// Development helper — jump to any scene from the browser console:
//   window.__game.scene.start('GameScene', { missionId: 'mission_1' })
// Stripped from production bundles by Vite's dead-code elimination.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__game = game;
}
