import Phaser from 'phaser';

// Tutorial tooltip text (keyed by trigger id). Exported for future test coverage.
// fallow-ignore-next-line unused-export
export const TUTORIAL_TIPS: Record<string, string> = {
  fire:   'AUTO-FIRE  Your ship targets and shoots automatically',
  energy: 'ENERGY  Powers weapons & shields — recharges over time',
  shield: 'SHIELDS  Absorb damage then recharge from energy',
  cards:  'LEVEL UP  Pick an upgrade card for this run',
  dodge:  'AUTO-DODGE  Your ship evades incoming shots',
};

// Displays one-shot mechanic tooltips during the tutorial mission.
// Each trigger id fires at most once per run.
export class TutorialHUD {
  private shown = new Set<string>();
  private text:  Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, W: number) {
    this.text = scene.add.text(W / 2, 108, '', {
      fontSize:        '12px',
      color:           '#ffffff',
      fontFamily:      'monospace',
      backgroundColor: '#000000cc',
      padding:         { x: 12, y: 7 },
      align:           'center',
    }).setOrigin(0.5).setDepth(20).setAlpha(0);
  }

  trigger(id: string, scene: Phaser.Scene): void {
    if (this.shown.has(id)) return;
    this.shown.add(id);
    this.text.setText(TUTORIAL_TIPS[id] ?? id);
    scene.tweens.killTweensOf(this.text);
    scene.tweens.add({
      targets: this.text, alpha: 1, duration: 300, hold: 3200, yoyo: true,
    });
  }
}
