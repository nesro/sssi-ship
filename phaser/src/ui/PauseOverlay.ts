import Phaser from 'phaser';

export class PauseOverlay {
  private readonly scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  show(
    onResume:  () => void,
    onRestart: () => void,
    onAbandon: () => void,
  ): void {
    this.hide();

    const { width: W, height: H } = this.scene.scale;
    const items: Phaser.GameObjects.GameObject[] = [];

    // Darkened backdrop — eat all pointer events so nothing behind triggers.
    items.push(
      this.scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.78).setInteractive(),
    );

    items.push(
      this.scene.add.text(W / 2, H * 0.22, 'PAUSED', {
        fontSize: '24px', color: '#cccccc', fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0.5),
    );

    const buttons: { label: string; color: number; textColor: string; cb: () => void }[] = [
      { label: 'RESUME',  color: 0x112211, textColor: '#44cc44', cb: onResume  },
      { label: 'RESTART', color: 0x111122, textColor: '#4488ff', cb: onRestart },
      { label: 'ABANDON', color: 0x220011, textColor: '#cc4444', cb: onAbandon },
    ];

    const btnW = 200;
    const btnH = 44;
    const btnGap = 14;
    const totalH = buttons.length * btnH + (buttons.length - 1) * btnGap;
    const startY = H / 2 - totalH / 2 + 20;

    for (let i = 0; i < buttons.length; i++) {
      const b = buttons[i]!;
      const y = startY + i * (btnH + btnGap) + btnH / 2;

      const bg = this.scene.add.rectangle(W / 2, y, btnW, btnH, b.color)
        .setStrokeStyle(1, 0x333333)
        .setInteractive({ useHandCursor: true })
        .on('pointerover', () => bg.setStrokeStyle(2, 0x888888))
        .on('pointerout',  () => bg.setStrokeStyle(1, 0x333333))
        .on('pointerdown', b.cb);
      items.push(bg);

      items.push(
        this.scene.add.text(W / 2, y, b.label, {
          fontSize: '14px', color: b.textColor, fontFamily: 'monospace', fontStyle: 'bold',
        }).setOrigin(0.5),
      );
    }

    this.container = this.scene.add.container(0, 0, items).setDepth(60);
  }

  hide(): void {
    this.container?.destroy();
    this.container = null;
  }

  get visible(): boolean {
    return this.container !== null;
  }
}
