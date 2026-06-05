import Phaser from 'phaser';

export type EnemyType = 'star' | 'circle' | 'boss';

export type EnemySprite = Phaser.Physics.Arcade.Sprite & {
  enemyType:  EnemyType;
  hp:         number;
  maxHp?:     number;
  lastShot:   number;
  shootMs:    number;
  targetY?:   number;
  stopped?:   boolean;
  spawnTime?: number;
};
