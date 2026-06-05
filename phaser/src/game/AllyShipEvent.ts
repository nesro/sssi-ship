import Phaser from 'phaser';
import type { CardDefinition } from '../data/cards.js';
import type { RunState } from './CardManager.js';
import type { CardManager } from './CardManager.js';

const ALLY_SPEED      = 180;   // px/sec horizontal
const ALLY_Y_FRACTION = 0.25;  // appears at 25% from top

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

    // Nose must face the direction of travel.
    if (!fromLeft) ally.setFlipX(true);

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
}
