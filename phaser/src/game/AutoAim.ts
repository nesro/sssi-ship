import type { EnemySprite } from './enemy.js';

export function findNearestEnemy(
  playerX: number,
  playerY: number,
  enemies: Phaser.Physics.Arcade.Group,
): EnemySprite | null {
  let nearest: EnemySprite | null = null;
  let bestDist = Infinity;

  for (const obj of enemies.getChildren()) {
    const e    = obj as unknown as EnemySprite;
    const dist = Math.hypot(e.x - playerX, e.y - playerY);
    if (dist < bestDist) {
      bestDist = dist;
      nearest  = e;
    }
  }

  return nearest;
}

export function aimVelocity(
  fx: number, fy: number,
  tx: number, ty: number,
  speed: number,
): { vx: number; vy: number } {
  const dx  = tx - fx;
  const dy  = ty - fy;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { vx: 0, vy: -speed };
  return { vx: (dx / len) * speed, vy: (dy / len) * speed };
}
