import type { EnergyManager } from './EnergyManager.js';

const DODGE_SPEED     = 220;
const DODGE_DURATION  = 380;
const DODGE_COOLDOWN  = 600;
const RETURN_SPEED    = 160; // px/s back toward centre; higher = snappier re-centering
const THREAT_X_RADIUS = 60;

export class AutoDodge {
  private dodgingUntil:  number = 0;
  private cooldownUntil: number = 0;
  // Exposed so GameScene can detect a fresh dodge for tutorial tooltip.
  lastDodgeTime = 0;

  update(
    time: number,
    deltaMs: number,
    player: Phaser.Physics.Arcade.Sprite,
    shots: Phaser.Physics.Arcade.Group,
    energy: EnergyManager,
    dodgeCost: number,
    minX: number,
    maxX: number,
    lookaheadMs = 350,
  ): void {
    // Guard: physics body can be null when the scene is tearing down.
    if (!player.body) return;
    if (time < this.dodgingUntil) return;

    const threat = this.findThreat(player, shots, lookaheadMs);

    if (threat !== null && time >= this.cooldownUntil) {
      if (energy.trySpend(dodgeCost)) {
        this.executeDodge(time, player, threat);
        return;
      }
    }

    this.driftToCenter(deltaMs, player, minX, maxX);
  }

  private findThreat(
    player: Phaser.Physics.Arcade.Sprite,
    shots: Phaser.Physics.Arcade.Group,
    lookaheadMs: number,
  ): 'left' | 'right' | null {
    for (const obj of shots.getChildren()) {
      const shot = obj as Phaser.Physics.Arcade.Sprite;
      if (!shot.active || !shot.body) continue;

      const body = shot.body as Phaser.Physics.Arcade.Body;
      if (body.velocity.y <= 0) continue;

      const distX = shot.x - player.x;
      const distY = player.y - shot.y;
      if (Math.abs(distX) > THREAT_X_RADIUS) continue;

      const timeToReach = distY / (body.velocity.y / 1000);
      if (timeToReach > 0 && timeToReach < lookaheadMs) {
        return distX < 0 ? 'right' : 'left';
      }
    }
    return null;
  }

  private executeDodge(
    time: number,
    player: Phaser.Physics.Arcade.Sprite,
    direction: 'left' | 'right',
  ): void {
    const vx = direction === 'left' ? -DODGE_SPEED : DODGE_SPEED;
    (player.body as Phaser.Physics.Arcade.Body).setVelocityX(vx);
    this.dodgingUntil  = time + DODGE_DURATION;
    this.cooldownUntil = time + DODGE_COOLDOWN;
    this.lastDodgeTime = time;
  }

  private driftToCenter(
    deltaMs: number,
    player: Phaser.Physics.Arcade.Sprite,
    minX: number,
    maxX: number,
  ): void {
    const centerX = (minX + maxX) / 2;
    const diff    = centerX - player.x;

    if (Math.abs(diff) < 2) {
      (player.body as Phaser.Physics.Arcade.Body).setVelocityX(0);
      return;
    }

    const speed = Math.min(Math.abs(diff) * 3, RETURN_SPEED);
    (player.body as Phaser.Physics.Arcade.Body).setVelocityX(
      diff > 0 ? speed : -speed,
    );
  }
}
