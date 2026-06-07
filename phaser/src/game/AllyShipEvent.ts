import Phaser from 'phaser';
import type { CardDefinition } from '../data/cards.js';
import type { RunState } from './CardManager.js';
import type { CardManager } from './CardManager.js';
import { ALLY_SHIPS } from '../data/story.js';

const ALLY_SPEED      = 180;   // px/sec horizontal
const ALLY_Y_FRACTION = 0.25;  // appears at 25% from top
const LINE_FADE_MS    = 2400;  // how long the dialogue line stays visible

export class AllyShipEvent {
  static scheduleAll(
    scene: Phaser.Scene,
    eventTimesMs: number[],
    cardManager: CardManager,
    run: RunState,
    onDrop: (card: CardDefinition | null) => void,
  ): void {
    for (const t of eventTimesMs) {
      scene.time.delayedCall(t, () => {
        AllyShipEvent.spawn(scene, cardManager, run, onDrop);
      });
    }
  }

  private static spawn(
    scene: Phaser.Scene,
    cardManager: CardManager,
    run: RunState,
    onDrop: (card: CardDefinition | null) => void,
  ): void {
    const { width: W, height: H } = scene.scale;
    const y        = H * ALLY_Y_FRACTION;
    const fromLeft = Math.random() < 0.5;
    const startX   = fromLeft ? -40 : W + 40;
    const endX     = fromLeft ? W + 40 : -40;

    const ally = scene.add.image(startX, y, 'allyShipTex').setDepth(4);
    if (!fromLeft) ally.setFlipX(true);

    const allyInfo = ALLY_SHIPS[Math.floor(Math.random() * ALLY_SHIPS.length)]!;
    AllyShipEvent.showAllyDialogue(scene, W, y, allyInfo.name, allyInfo.line);

    const durationMs = (W + 80) / ALLY_SPEED * 1000;

    scene.tweens.add({
      targets:    ally,
      x:          endX,
      duration:   durationMs,
      ease:       'Linear',
      onComplete: () => {
        ally.destroy();
        const drawn = cardManager.draw(run);
        onDrop(drawn[0] ?? null);
      },
    });
  }

  private static showAllyDialogue(
    scene: Phaser.Scene,
    W: number,
    shipY: number,
    name: string,
    line: string,
  ): void {
    const nameText = scene.add.text(W / 2, shipY - 26, name, {
      fontSize: '10px', color: '#88ccff', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(15).setAlpha(0);

    const lineText = scene.add.text(W / 2, shipY - 12, `"${line}"`, {
      fontSize: '10px', color: '#aaaaaa', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(15).setAlpha(0);

    scene.tweens.add({
      targets: [nameText, lineText], alpha: 1,
      duration: 300, ease: 'Power1',
      onComplete: () => {
        scene.tweens.add({
          targets: [nameText, lineText], alpha: 0,
          delay: LINE_FADE_MS - 300, duration: 400, ease: 'Power1',
          onComplete: () => { nameText.destroy(); lineText.destroy(); },
        });
      },
    });
  }
}
