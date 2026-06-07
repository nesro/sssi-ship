// GameSession.ts
// Pure game state machine — no Phaser imports.
// Holds all mutable game-state that lives between frames and feeds into
// the end-of-mission MissionResult. GameScene creates one session per run
// and delegates all state mutations to it.

import type { RunState }       from './CardManager.js';
import type { EnergyManager }  from './EnergyManager.js';
import type { ShieldSystem }   from './ShieldSystem.js';
import {
  SHOT_DAMAGE,
  ENEMY_COLLISION_DAMAGE,
  ASTEROID_DAMAGE,
  HULL_MAX_HP,
  XP_PER_KILL,
  COINS_PER_KILL,
  pointsForEnemyType,
  isReadyToLevelUp,
} from './GameRules.js';

export interface HitResult {
  hullDamage: number;
  /** true when the shield absorbed the full hit */
  absorbed: boolean;
}

export class GameSession {
  hullHp:         number;
  readonly hullMaxHp: number;
  score           = 0;
  enemiesKilled   = 0;
  sideWeaponsUsed = false;
  /** Phaser scene timer timestamp — set once when the first wave fires. */
  missionStartMs  = 0;

  constructor(readonly run: RunState, hullMaxHp = HULL_MAX_HP) {
    this.hullMaxHp = hullMaxHp;
    this.hullHp    = hullMaxHp;
  }

  // ─── damage resolution ───────────────────────────────────────────────────────

  resolveShot(shields: ShieldSystem, energy: EnergyManager): HitResult {
    const hullDamage = shields.absorbHit(SHOT_DAMAGE, energy);
    if (hullDamage > 0) this.hullHp -= hullDamage;
    return { hullDamage, absorbed: hullDamage === 0 };
  }

  resolveEnemyCollision(shields: ShieldSystem, energy: EnergyManager): HitResult {
    const hullDamage = shields.absorbHit(ENEMY_COLLISION_DAMAGE, energy);
    if (hullDamage > 0) this.hullHp -= hullDamage;
    return { hullDamage, absorbed: hullDamage === 0 };
  }

  /** Asteroids bypass shields — direct hull damage. Returns damage dealt. */
  resolveAsteroid(): number {
    this.hullHp -= ASTEROID_DAMAGE;
    return ASTEROID_DAMAGE;
  }

  // ─── kill accounting ─────────────────────────────────────────────────────────

  /** Mutates score, enemiesKilled, run.xp. Returns coins earned for this kill. */
  recordKill(enemyType: string): number {
    this.score        += pointsForEnemyType(enemyType);
    this.enemiesKilled++;
    this.run.xp       += XP_PER_KILL[enemyType] ?? 0;
    return COINS_PER_KILL[enemyType] ?? 0;
  }

  // ─── level-up ────────────────────────────────────────────────────────────────

  /**
   * Checks whether accumulated XP crosses the next level threshold.
   * If yes, increments run.level and returns true — caller should draw cards.
   */
  checkLevelUp(): boolean {
    if (!isReadyToLevelUp(this.run.xp, this.run.level)) return false;
    this.run.level++;
    return true;
  }

  // ─── helpers ─────────────────────────────────────────────────────────────────

  isAlive(): boolean {
    return this.hullHp > 0;
  }

  hullPercent(): number {
    return (this.hullHp / this.hullMaxHp) * 100;
  }
}
