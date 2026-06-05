// GameScene.ts
// The combat screen. All ship actions are autonomous.
// Phase 2: energy, shields, auto-aim, auto-dodge, cards, ally ships, side weapons.

import Phaser from 'phaser';
import type { EnemySprite } from '../game/enemy.js';
import type { ComputedStats } from '../game/computeStats.js';
import type { RunState } from '../game/CardManager.js';
import type { CardDefinition } from '../data/cards.js';
import type { MissionResult } from '../data/missions.js';
import { DebugConfig }          from '../debug/DebugConfig.js';
import { EnergyManager }        from '../game/EnergyManager.js';
import { ShieldSystem }         from '../game/ShieldSystem.js';
import { AutoDodge }            from '../game/AutoDodge.js';
import { findNearestEnemy, aimVelocity } from '../game/AutoAim.js';
import { CardManager }          from '../game/CardManager.js';
import { AllyShipEvent }        from '../game/AllyShipEvent.js';
import { TutorialHUD }          from '../game/TutorialHUD.js';
import { PlayerShipFx }        from '../game/PlayerShipFx.js';
import { buildGameTextures }    from '../game/textures.js';
import { Starfield }            from '../game/Starfield.js';
import { LevelUpOverlay }       from '../ui/LevelUpOverlay.js';
import { SideWeaponButton }     from '../ui/SideWeaponButton.js';
import { CombatHUD, PLAY_W }    from '../hud/CombatHUD.js';
import { ShieldVisual }         from '../hud/ShieldVisual.js';
import { EnemyHpBars }          from '../hud/EnemyHpBars.js';
import { MISSIONS }             from '../data/missions.js';
import { generateDailyWaves, todayDailySeed, DAILY_MISSION_ID, DAILY_WAVE_INTERVAL_MS } from '../data/daily.js';
import type { DailyWaveSpec }   from '../data/daily.js';
import { SaveManager }          from '../SaveManager.js';
import { computeStats }         from '../game/computeStats.js';
import { talentLevel }          from '../data/talents.js';

// ─── module-level constants ───────────────────────────────────────────────────

// Cumulative XP needed to reach level 2, 3, 4, 5, 6 (index = target level - 2).
const XP_THRESHOLDS = [80, 200, 380, 600, 900];
const XP_PER_KILL: Record<string, number> = { star: 15, circle: 40, boss: 300 };

// Damage each enemy projectile deals before shield/hull absorption.
const SHOT_DAMAGE = 5;

// Asteroid field (Mission 2) — asteroids bypass shields and hit hull directly.
const ASTEROID_DAMAGE      = 5;
const ASTEROID_SPEED       = 180;   // px/s downward
const ASTEROID_INTERVAL_MS = 2500;  // ms between spawns

// Nebula speed multiplier applied to all enemies in Mission 3 for the first 60 s.
const NEBULA_SPEED_MUL       = 1.6;
const NEBULA_DURATION_MS     = 60_000;

// Hull damage when an enemy sprite physically collides with the player.
const ENEMY_COLLISION_DAMAGE = 20;

// Duration of the death animation sequence before ResultScene loads.
const DEATH_ANIM_MS = 1200;

// ─── scene ────────────────────────────────────────────────────────────────────

export class GameScene extends Phaser.Scene {
  private W = 0;
  private H = 0;

  private missionId    = 'mission_1';
  private chainLevel   = 0;
  private isGameActive = true;
  private isPaused     = false;
  private pendingAllyCard: CardDefinition | null = null;

  // Result tracking
  private hullHp            = 100;
  private hullMaxHp         = 100;
  private score             = 0;
  private enemiesKilled     = 0;
  private missionStartMs    = 0;
  private sideWeaponsUsed   = false;
  // Daily mission tracking — waves completed before death.
  private dailyWavesCleared = 0;

  // Systems
  private stats!:          ComputedStats;
  private run!:            RunState;
  private energy!:         EnergyManager;
  private shields!:        ShieldSystem;
  private autoDodge!:      AutoDodge;
  private cardManager!:    CardManager;
  private levelUpOverlay!: LevelUpOverlay;
  private leftButton:      SideWeaponButton | null = null;
  private rightButton:     SideWeaponButton | null = null;

  // Physics
  private player!:       Phaser.Physics.Arcade.Sprite;
  private playerLasers!: Phaser.Physics.Arcade.Group;
  private spreadShots!:  Phaser.Physics.Arcade.Group;
  private enemyShots!:   Phaser.Physics.Arcade.Group;
  private enemies!:      Phaser.Physics.Arcade.Group;

  // HUD / visuals
  private starfield!:     Starfield;
  private combatHUD!:     CombatHUD;
  private shieldVisual!:  ShieldVisual;
  private enemyHpBars!:   EnemyHpBars;
  private playerShipFx!:  PlayerShipFx;

  private waveLabelText: Phaser.GameObjects.Text | null = null;
  private bossRef:       EnemySprite | null = null;
  private bossBarGfx:    Phaser.GameObjects.Graphics | null = null;
  private bossBarLabel:  Phaser.GameObjects.Text | null = null;

  private tutorial:         TutorialHUD | null = null;
  private lastReportedDodge = 0;
  private autoFireTimer:    Phaser.Time.TimerEvent | null = null;
  private asteroidGroup:    Phaser.Physics.Arcade.Group | null = null;
  private asteroidTimer:    Phaser.Time.TimerEvent | null = null;

  constructor() { super({ key: 'GameScene' }); }

  // fallow-ignore-next-line unused-class-member
  init(data?: { missionId?: string }): void {
    this.missionId = data?.missionId ?? 'mission_1';
  }

  // ─── setup ────────────────────────────────────────────────────────────────

  // fallow-ignore-next-line unused-class-member
  create(): void {
    const { width: W, height: H } = this.scale;
    this.W = W;
    this.H = H;

    this.initStats();
    this.initRun();
    buildGameTextures(this);
    this.starfield    = new Starfield(this, W, H);
    this.buildPhysicsGroups();
    this.buildPlayer();
    this.initSystems();
    this.combatHUD    = new CombatHUD(this, W, H);
    this.shieldVisual = new ShieldVisual(this);
    this.enemyHpBars  = new EnemyHpBars(this);
    this.playerShipFx = new PlayerShipFx(this, this.stats);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.playerShipFx.destroy());
    if (this.missionId === 'tutorial') this.tutorial = new TutorialHUD(this, W);
    this.buildSideButtons();
    this.setupCollisions();
    // Tutorial mission has no front weapon — player must survive on shields alone.
    if (this.missionId !== 'tutorial') this.startAutoFire();
    this.startEnemyWaves();
    this.scheduleAllyEvents();
    this.setupDebugToggle();
  }

  private initStats(): void {
    const save = SaveManager.load();
    this.stats = computeStats(save);
    this.chainLevel = Math.max(
      talentLevel(save.talents, 'chain_pool_1') > 0 ? 1 : 0,
      talentLevel(save.talents, 'chain_pool_2') > 0 ? 2 : 0,
    );
  }

  private initRun(): void {
    this.hullHp          = this.hullMaxHp;
    this.score           = 0;
    this.enemiesKilled   = 0;
    this.missionStartMs  = 0;
    this.sideWeaponsUsed = false;
    this.isGameActive    = true;
    this.isPaused        = false;
    this.pendingAllyCard = null;
    this.run = {
      pickedCardIds:        new Set(),
      rerollsLeft:          5,
      xp:                   0,
      level:                1,
      explosiveRounds:      false,
      chainLightning:       false,
      overcharge:           false,
      shotsSinceOvercharge: 0,
      overchargeEvery:      0,
    };
  }

  // ─── physics setup ────────────────────────────────────────────────────────

  private buildPhysicsGroups(): void {
    this.playerLasers = this.physics.add.group();
    this.spreadShots  = this.physics.add.group();
    this.enemyShots   = this.physics.add.group();
    this.enemies      = this.physics.add.group();
  }

  private buildPlayer(): void {
    // Centre of the 560 px play field, 80 px above the bottom edge.
    this.player = this.physics.add.sprite(PLAY_W / 2, this.H - 80, 'shipTex');
    this.player.setDepth(5);
    // Auto-dodge drives the player horizontally — gravity must be off.
    (this.player.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
  }

  // ─── systems init ─────────────────────────────────────────────────────────

  private initSystems(): void {
    this.energy         = new EnergyManager(this.stats);
    this.shields        = new ShieldSystem(this.stats);
    this.autoDodge      = new AutoDodge();
    this.cardManager    = new CardManager(this.chainLevel);
    this.levelUpOverlay = new LevelUpOverlay(this);
  }

  // ─── side buttons ─────────────────────────────────────────────────────────

  private buildSideButtons(): void {
    // Side-weapon buttons live inside the right HUD panel (x > PLAY_W = 560).
    // Left button at 560+60=620, right button at 560+180=740, both at y=300.
    const btnY = 300;
    if (this.stats.leftWeapon) {
      this.leftButton = new SideWeaponButton(
        this, PLAY_W + 60, btnY, this.stats.leftWeapon,
        this.stats.sideWeaponCooldownMs,
        () => this.fireSideWeapon('left'),
      );
    }
    if (this.stats.rightWeapon) {
      this.rightButton = new SideWeaponButton(
        this, PLAY_W + 180, btnY, this.stats.rightWeapon,
        this.stats.sideWeaponCooldownMs,
        () => this.fireSideWeapon('right'),
      );
    }
  }

  // ─── collisions ───────────────────────────────────────────────────────────

  private setupCollisions(): void {
    this.physics.add.overlap(
      this.playerLasers, this.enemies,
      this.onLaserHitsEnemy as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this,
    );
    this.physics.add.overlap(
      this.spreadShots, this.enemies,
      this.onSpreadHitsEnemy as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this,
    );
    this.physics.add.overlap(
      this.enemyShots, this.player,
      this.onShotHitsPlayer as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this,
    );
    // Enemy body reaches the player — destroy the enemy and damage the player.
    this.physics.add.overlap(
      this.enemies, this.player,
      this.onEnemyHitsPlayer as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this,
    );
  }

  private onLaserHitsEnemy(laser: Phaser.GameObjects.GameObject, enemy: Phaser.GameObjects.GameObject): void {
    const l = laser as Phaser.Physics.Arcade.Sprite;
    const e = enemy as unknown as EnemySprite;
    if (!l.active || !e.active) return;
    l.destroy();
    this.spawnBurst(e.x, e.y, 0x00ffff, 5);
    this.damageEnemy(e, this.stats.frontDamage);

    if (this.run.overcharge && e.active) {
      this.run.shotsSinceOvercharge++;
      if (this.run.shotsSinceOvercharge >= this.run.overchargeEvery) {
        this.run.shotsSinceOvercharge = 0;
        this.spawnBurst(e.x, e.y, 0xffff00, 10);
        this.damageEnemy(e, this.stats.frontDamage * 2, true);  // 3× total, shown as crit
        if (this.run.pickedCardIds.has('overcharge_regen')) {
          this.energy.energy = Math.min(this.energy.capacity, this.energy.energy + 5);
        }
      }
    }

    if (this.run.explosiveRounds && Math.random() < 0.2) {
      this.triggerExplosion(e.x, e.y);
    }
  }

  private triggerExplosion(x: number, y: number, isSecondary = false): void {
    const radius = this.run.pickedCardIds.has('blast_radius') ? 70 : 40;
    this.spawnBurst(x, y, 0xff6600, 12);

    // Snapshot positions before damaging so secondary explosions fire at the
    // original hit locations even if enemies die during the loop.
    const hitPositions: Array<{ x: number; y: number }> = [];
    for (const obj of this.enemies.getChildren()) {
      const e = obj as unknown as EnemySprite;
      if (!e.active) continue;
      if (Math.hypot(e.x - x, e.y - y) > radius) continue;
      hitPositions.push({ x: e.x, y: e.y });
      this.damageEnemy(e, this.stats.frontDamage * 0.5);
    }

    if (!isSecondary && this.run.pickedCardIds.has('energy_recovery')) {
      this.energy.energy = Math.min(this.energy.capacity, this.energy.energy + 8);
    }

    if (!isSecondary && this.run.pickedCardIds.has('chain_reaction')) {
      for (const pos of hitPositions) {
        this.time.delayedCall(150, () => {
          if (!this.isGameActive) return;
          this.triggerExplosion(pos.x, pos.y, true);
        });
      }
    }
  }

  private onSpreadHitsEnemy(shot: Phaser.GameObjects.GameObject, enemy: Phaser.GameObjects.GameObject): void {
    const s = shot as Phaser.Physics.Arcade.Sprite;
    const e = enemy as unknown as EnemySprite;
    if (!s.active || !e.active) return;
    s.destroy();
    this.spawnBurst(e.x, e.y, 0xff8800, 4);
    this.damageEnemy(e, 15);

    if (this.run.chainLightning && Math.random() < 0.15) {
      const arcsLeft = this.run.pickedCardIds.has('storm_chains') ? 2 : 1;
      this.triggerChainLightning(e.x, e.y, 8, arcsLeft, e);
    }
  }

  // Arc damage to the nearest enemy (excluding the source), then chain further if arcsLeft > 1.
  private triggerChainLightning(
    sourceX: number,
    sourceY: number,
    damage: number,
    arcsLeft: number,
    excludedEnemy: EnemySprite | null,
  ): void {
    let target: EnemySprite | null = null;
    let targetDist = Infinity;
    for (const obj of this.enemies.getChildren()) {
      const e = obj as unknown as EnemySprite;
      if (!e.active || e === excludedEnemy) continue;
      const d = Math.hypot(e.x - sourceX, e.y - sourceY);
      if (d < targetDist) { target = e; targetDist = d; }
    }
    if (!target) return;

    this.drawLightningArc(sourceX, sourceY, target.x, target.y);
    this.damageEnemy(target, damage);

    if (arcsLeft > 1) {
      const nextX = target.x, nextY = target.y;
      const nextExcluded = target;
      this.time.delayedCall(80, () => {
        if (!this.isGameActive) return;
        this.triggerChainLightning(nextX, nextY, damage * 0.6, arcsLeft - 1, nextExcluded);
      });
    }
  }

  private drawLightningArc(x1: number, y1: number, x2: number, y2: number): void {
    const gfx = this.add.graphics().setDepth(8);
    gfx.lineStyle(2, 0x44ffff, 0.9);
    gfx.beginPath();
    gfx.moveTo(x1, y1);
    // One zigzag midpoint for a jagged look.
    gfx.lineTo(
      (x1 + x2) / 2 + Phaser.Math.Between(-18, 18),
      (y1 + y2) / 2 + Phaser.Math.Between(-18, 18),
    );
    gfx.lineTo(x2, y2);
    gfx.strokePath();
    this.tweens.add({ targets: gfx, alpha: 0, duration: 180, onComplete: () => gfx.destroy() });
  }

  private damageEnemy(enemy: EnemySprite, damage: number, isCrit = false): void {
    enemy.hp -= damage;
    this.spawnDamageNumber(enemy.x, enemy.y, Math.round(damage), isCrit);
    if (enemy.hp <= 0) {
      this.onEnemyDestroyed(enemy);
    } else if (enemy === this.bossRef) {
      this.updateBossHealthBar();
    }
  }

  private spawnDamageNumber(x: number, y: number, amount: number, isCrit = false): void {
    const label = isCrit ? `${amount}!` : `${amount}`;
    const color = isCrit ? '#ffff00' : '#00ffff';
    const txt   = this.add.text(
      x + Phaser.Math.Between(-8, 8), y - 10, label,
      { fontSize: '12px', color, fontFamily: 'monospace', fontStyle: isCrit ? 'bold' : 'normal' },
    ).setDepth(8).setOrigin(0.5);

    this.tweens.add({
      targets: txt, y: txt.y - 40, alpha: 0,
      duration: 600, ease: 'Power1',
      onComplete: () => txt.destroy(),
    });
  }

  private onEnemyDestroyed(enemy: EnemySprite): void {
    this.score        += this.pointsForType(enemy.enemyType);
    this.enemiesKilled++;
    this.run.xp       += XP_PER_KILL[enemy.enemyType] ?? 0;
    this.combatHUD.updateScore(this.score);
    this.spawnBurst(enemy.x, enemy.y, 0xff8800, 18);
    const isBoss = enemy === this.bossRef;
    enemy.destroy();
    if (isBoss) { this.removeBossHealthBar(); this.endMission(true); }
  }

  private pointsForType(type: EnemySprite['enemyType']): number {
    if (type === 'boss')   return 5000;
    if (type === 'circle') return 500;
    return 50;
  }

  // Phaser's collideSpriteVsGroup always calls the callback as (sprite, groupMember),
  // so the player sprite arrives as the first arg and the enemy shot as the second.
  private onShotHitsPlayer(
    _player: Phaser.GameObjects.GameObject,
    shot:    Phaser.GameObjects.GameObject,
  ): void {
    const s = shot as Phaser.Physics.Arcade.Sprite;
    if (!s.active) return;
    s.destroy();

    this.tutorial?.trigger('shield', this);

    const hullDmg = this.shields.absorbHit(SHOT_DAMAGE, this.energy);
    if (hullDmg > 0) {
      this.hullHp -= hullDmg;
      this.spawnBurst(this.player.x, this.player.y, 0xff2200, 8);
      this.cameras.main.shake(80, 0.006);
      if (this.hullHp <= 0) this.endMission(false);
    } else {
      // Shield absorbed the full hit — flash the shield ring.
      this.shieldVisual.onHit();
      this.spawnBurst(this.player.x, this.player.y, 0x00aaff, 4);
    }
  }

  // ─── burst particles ──────────────────────────────────────────────────────

  private spawnBurst(x: number, y: number, color: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const dist  = Phaser.Math.Between(20, 80);
      const dot   = this.add.rectangle(x, y, 3, 3, color).setDepth(5);
      this.tweens.add({
        targets: dot, x: x + Math.cos(angle) * dist, y: y + Math.sin(angle) * dist,
        alpha: 0, duration: 380, ease: 'Power2', onComplete: () => dot.destroy(),
      });
    }
  }

  // ─── auto-fire ────────────────────────────────────────────────────────────

  private startAutoFire(): void {
    this.autoFireTimer = this.time.addEvent({
      delay: this.stats.frontFireMs, callback: this.firePlayerLaser,
      callbackScope: this, loop: true,
    });
  }

  // Restart the auto-fire timer after a card changes frontFireMs.
  // Called only from onCardPicked when the card has a frontFireMs delta.
  private restartAutoFireTimer(): void {
    this.autoFireTimer?.remove(false);
    this.startAutoFire();
  }

  // Single place that applies a card pick and handles any timer side-effects.
  private onCardPicked(picked: CardDefinition): void {
    this.cardManager.pick(picked, this.stats, this.run);
    this.combatHUD.showCard(picked.name);
    if (picked.statDelta?.frontFireMs !== undefined) {
      this.restartAutoFireTimer();
    }
  }

  private firePlayerLaser(): void {
    if (!this.isGameActive || this.isPaused) return;
    // Don't waste energy firing when nothing is on screen.
    if (this.enemies.countActive() === 0) return;
    if (!this.energy.trySpend(this.stats.frontEnergyCost)) return;

    const laser  = this.playerLasers.create(this.player.x, this.player.y - 44, 'laserTex') as Phaser.Physics.Arcade.Sprite;
    const target = findNearestEnemy(this.player.x, this.player.y, this.enemies);
    if (target) {
      const { vx, vy } = aimVelocity(this.player.x, this.player.y, target.x, target.y, 530);
      laser.setVelocity(vx, vy);
    } else {
      laser.setVelocityY(-530);
    }
  }

  // ─── side weapons ─────────────────────────────────────────────────────────

  private fireSideWeapon(side: 'left' | 'right'): void {
    if (!this.isGameActive || this.isPaused) return;
    const weapon = side === 'left' ? this.stats.leftWeapon : this.stats.rightWeapon;
    if (!weapon) return;
    const cost = weapon === 'spread' ? this.stats.spreadShotCost : this.stats.heavyBeamCost;
    if (!this.energy.trySpend(cost)) return;
    this.sideWeaponsUsed = true;
    weapon === 'spread' ? this.fireSpreadShot() : this.fireBeamShot();
  }

  private fireSpreadShot(): void {
    const speed = 480;
    for (const deg of [-40, -20, 0, 20, 40]) {
      const rad  = Phaser.Math.DegToRad(deg - 90);
      const shot = this.spreadShots.create(this.player.x, this.player.y - 44, 'spreadTex') as Phaser.Physics.Arcade.Sprite;
      shot.setVelocity(Math.cos(rad) * speed, Math.sin(rad) * speed);
    }
  }

  private fireBeamShot(): void {
    const beam   = this.spreadShots.create(this.player.x, this.player.y - 44, 'beamTex') as Phaser.Physics.Arcade.Sprite;
    const target = findNearestEnemy(this.player.x, this.player.y, this.enemies);
    if (target) {
      const { vx, vy } = aimVelocity(this.player.x, this.player.y, target.x, target.y, 600);
      beam.setVelocity(vx, vy);
    } else {
      beam.setVelocityY(-600);
    }
  }

  // ─── enemy waves ──────────────────────────────────────────────────────────

  private startEnemyWaves(): void {
    this.time.delayedCall(1000, () => { this.missionStartMs = this.time.now; });

    if (this.missionId === 'tutorial')         { this.startTutorialWaves();  return; }
    if (this.missionId === DAILY_MISSION_ID)   { this.startDailyWaves();     return; }
    if (this.missionId === 'mission_2')        { this.startMission2Waves();  return; }
    if (this.missionId === 'mission_3')        { this.startMission3Waves();  return; }
    this.startMission1Waves();
  }

  private startMission1Waves(): void {
    this.at(2000,  () => this.spawnStarWave(5,  'WAVE 1'));
    this.at(12000, () => this.spawnStarWave(6,  'WAVE 2'));
    this.at(22000, () => this.spawnStarWave(7,  'WAVE 3'));
    this.at(32000, () => this.spawnStarWave(8,  'WAVE 4'));
    this.at(44000, () => this.spawnStarWave(10, 'WAVE 5'));
    this.at(55000, () => this.spawnBoss());
  }

  private startMission2Waves(): void {
    // Asteroid field runs from mission start until the boss spawns at 90 s.
    this.startAsteroidField(90_000);
    this.at(5000,  () => this.spawnStarWave(4,   'WAVE 1'));
    this.at(18000, () => { this.spawnStarWave(3, 'WAVE 2'); this.spawnCircleWave(2, 20); });
    this.at(35000, () => this.spawnStarWave(5,   'WAVE 3'));
    this.at(50000, () => { this.spawnStarWave(2, 'WAVE 4'); this.spawnCircleWave(3, 20); });
    this.at(68000, () => { this.spawnStarWave(6, 'WAVE 5'); this.spawnCircleWave(2, 20); });
    this.at(90000, () => this.spawnBoss(120, 500));
  }

  private startMission3Waves(): void {
    // The speed nebula accelerates all enemies spawned in the first 60 s.
    const nebStar  = Math.round(85 * NEBULA_SPEED_MUL);   // 136 px/s
    const nebCirc  = Math.round(60 * NEBULA_SPEED_MUL);   // 96 px/s
    this.at(3000,  () => this.spawnStarWave(8,   'WAVE 1', nebStar));
    this.at(14000, () => this.spawnCircleWave(4, 30, 'WAVE 2', nebCirc));
    this.at(26000, () => this.spawnStarWave(10,  'WAVE 3', nebStar));
    this.at(40000, () => this.spawnCircleWave(5, 30, 'WAVE 4', nebCirc));
    // Wave 5 spawns at 55 s — still inside the NEBULA_DURATION_MS window.
    this.at(55000, () => this.spawnStarWave(12,  'WAVE 5', nebStar));
    // Nebula ends at 60 s; wave 6 at 73 s uses standard speeds.
    this.at(73000, () => { this.spawnStarWave(4, 'WAVE 6'); this.spawnCircleWave(6, 30); });
    this.at(95000, () => this.spawnBoss(300, 200));
  }

  private startDailyWaves(): void {
    const specs = generateDailyWaves(todayDailySeed());
    specs.forEach((spec, i) => {
      this.at(i * DAILY_WAVE_INTERVAL_MS, () => {
        if (!this.isGameActive) return;
        this.dailyWavesCleared = i;
        this.spawnDailyWave(spec);
      });
    });
  }

  private spawnDailyWave(spec: DailyWaveSpec): void {
    if (!this.isGameActive) return;
    this.showWaveLabel(`WAVE ${spec.waveIndex + 1}`);

    if (spec.isBossWave) {
      // Scaled War Circle mini-boss — no dedicated boss bar, uses regular HP bar.
      this.makeCircleEnemy(PLAY_W / 2, -40, 55, spec.enemyHp * 3, spec.shootMs);
    } else {
      const spacing = PLAY_W / (spec.count + 1);
      // Enemy descent speed grows gently with wave depth.
      const speed = Math.min(55 + spec.waveIndex * 2, 130);
      for (let i = 0; i < spec.count; i++) {
        this.time.delayedCall(i * 200, () => {
          if (!this.isGameActive) return;
          this.makeStarEnemy(spacing * (i + 1), -20, speed, spec.enemyHp, spec.shootMs);
        });
      }
    }
  }

  private startTutorialWaves(): void {
    // Survival mission — no weapons. Four slow waves over 60 s, then auto-win.
    this.at(1500,  () => this.tutorial?.trigger('energy', this));
    this.at(3000,  () => this.spawnTutorialStars(2, 'WAVE 1'));
    this.at(10000, () => this.tutorial?.trigger('shield', this));
    this.at(12000, () => this.spawnTutorialStars(2, 'WAVE 2'));
    this.at(25000, () => this.spawnTutorialStars(3, 'WAVE 3'));
    this.at(40000, () => this.spawnTutorialStars(3, 'WAVE 4'));
    // Auto-win after 60 s — player has survived the gauntlet.
    this.at(60000, () => this.endMission(true));
  }

  private spawnTutorialStars(count: number, label: string): void {
    if (!this.isGameActive) return;
    this.showWaveLabel(label);
    const spacing = PLAY_W / (count + 1);
    for (let i = 0; i < count; i++) {
      this.time.delayedCall(i * 350, () => {
        if (!this.isGameActive) return;
        this.makeStarEnemy(spacing * (i + 1), -20, 55, 5, Phaser.Math.Between(3000, 5000));
      });
    }
  }

  // ─── asteroid field (Mission 2) ───────────────────────────────────────────────

  private startAsteroidField(stopAtMs: number): void {
    this.asteroidGroup = this.physics.add.group();

    // Asteroids bypass the shield system — direct hull damage.
    this.physics.add.overlap(
      this.asteroidGroup, this.player,
      this.onAsteroidHitsPlayer as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined, this,
    );

    this.asteroidTimer = this.time.addEvent({
      delay: ASTEROID_INTERVAL_MS, callback: this.spawnAsteroid,
      callbackScope: this, loop: true,
    });

    this.time.delayedCall(stopAtMs, () => {
      this.asteroidTimer?.remove(false);
      this.asteroidTimer = null;
    });
  }

  private spawnAsteroid(): void {
    if (!this.isGameActive || !this.asteroidGroup) return;
    // Clamp to play field only — don't spawn asteroids over the HUD panel.
    const x = Phaser.Math.Between(30, PLAY_W - 30);
    const a  = this.asteroidGroup.create(x, -20, 'asteroidTex') as Phaser.Physics.Arcade.Sprite;
    a.setVelocityY(ASTEROID_SPEED);
    (a.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
  }

  // Same arg-order swap as onShotHitsPlayer — player is first, asteroid is second.
  private onAsteroidHitsPlayer(
    _player:  Phaser.GameObjects.GameObject,
    asteroid: Phaser.GameObjects.GameObject,
  ): void {
    const a = asteroid as Phaser.Physics.Arcade.Sprite;
    if (!a.active) return;
    a.destroy();
    this.hullHp -= ASTEROID_DAMAGE;
    this.spawnBurst(this.player.x, this.player.y, 0xff6600, 6);
    this.cameras.main.shake(80, 0.006);
    if (this.hullHp <= 0) this.endMission(false);
  }

  // Enemy sprite physically reaches the player — the enemy explodes and the
  // player absorbs the impact through shields first, then hull.
  // Arg order: Phaser collideSpriteVsGroup always passes (sprite, groupMember).
  private onEnemyHitsPlayer(
    _player: Phaser.GameObjects.GameObject,
    enemy:   Phaser.GameObjects.GameObject,
  ): void {
    const e = enemy as unknown as EnemySprite;
    if (!e.active) return;
    // Destroy the enemy (awards XP, score, burst effect).
    this.onEnemyDestroyed(e);
    // Deal collision damage — shields absorb first.
    const hullDmg = this.shields.absorbHit(ENEMY_COLLISION_DAMAGE, this.energy);
    if (hullDmg > 0) {
      this.hullHp -= hullDmg;
      this.cameras.main.shake(120, 0.012);
      if (this.hullHp <= 0) this.endMission(false);
    } else {
      this.shieldVisual.onHit();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────

  private at(ms: number, fn: () => void): void {
    this.time.delayedCall(ms, fn, [], this);
  }

  private spawnStarWave(count: number, label?: string, speed = 85): void {
    if (!this.isGameActive) return;
    if (label) this.showWaveLabel(label);
    const spacing = PLAY_W / (count + 1);
    for (let i = 0; i < count; i++) {
      this.time.delayedCall(i * 200, () => {
        if (!this.isGameActive) return;
        this.makeStarEnemy(
          spacing * (i + 1), -20, speed, 10,
          Phaser.Math.Between(1800, 3500),
        );
      });
    }
  }

  private spawnCircleWave(count: number, hp: number, label?: string, speed = 60): void {
    if (!this.isGameActive) return;
    if (label) this.showWaveLabel(label);
    const spacing = PLAY_W / (count + 1);
    for (let i = 0; i < count; i++) {
      this.time.delayedCall(i * 400, () => {
        if (!this.isGameActive) return;
        this.makeCircleEnemy(
          spacing * (i + 1), -40, speed, hp,
          Phaser.Math.Between(2000, 3000),
        );
      });
    }
  }

  // ─── enemy factory helpers ────────────────────────────────────────────────

  private makeStarEnemy(x: number, y: number, speed: number, hp: number, shootMs: number): EnemySprite {
    const e = this.enemies.create(x, y, 'starTex') as unknown as EnemySprite;
    e.setVelocityY(speed);
    e.enemyType = 'star';
    e.hp = hp; e.maxHp = hp;
    e.lastShot = 0; e.shootMs = shootMs;
    return e;
  }

  private makeCircleEnemy(x: number, y: number, speed: number, hp: number, shootMs: number): EnemySprite {
    const e = this.enemies.create(x, y, 'circleTex') as unknown as EnemySprite;
    e.setVelocityY(speed);
    e.enemyType = 'circle';
    e.hp = hp; e.maxHp = hp;
    e.targetY = Phaser.Math.Between(90, 160); e.stopped = false;
    e.lastShot = 0; e.shootMs = shootMs;
    return e;
  }

  private spawnBoss(hp = 200, shootMs = 320): void {
    if (!this.isGameActive) return;
    this.showWaveLabel('⚠ BOSS');
    const boss = this.enemies.create(PLAY_W / 2, -70, 'bossTex') as unknown as EnemySprite;
    boss.setVelocityY(45);
    boss.enemyType = 'boss'; boss.hp = hp; boss.maxHp = hp;
    boss.targetY = 90; boss.stopped = false;
    boss.lastShot = 0; boss.shootMs = shootMs; boss.spawnTime = this.time.now;
    this.bossRef = boss;
    this.buildBossHealthBar(boss);
  }

  // ─── enemy AI ─────────────────────────────────────────────────────────────

  private tickEnemy(enemy: EnemySprite, time: number): void {
    enemy.angle += enemy.enemyType === 'boss' ? 0.5 : 1.4;
    // Both the boss and circle enemies park at a fixed Y, then shoot from there.
    if ((enemy.enemyType === 'boss' || enemy.enemyType === 'circle') && !enemy.stopped && enemy.y >= (enemy.targetY ?? 0)) {
      enemy.setVelocityY(0);
      enemy.stopped = true;
    }
    if (time - enemy.lastShot > enemy.shootMs) {
      enemy.lastShot = time;
      this.fireEnemyShot(enemy);
    }
  }

  private fireEnemyShot(enemy: EnemySprite): void {
    if (!this.isGameActive) return;
    // Never fire from below the player — that produces an upward-travelling shot
    // that AutoDodge won't detect and that re-enters the play area unexpectedly.
    if (enemy.y >= this.player.y) return;
    const tx = this.player.x + Phaser.Math.Between(-15, 15);
    const ty = this.player.y + Phaser.Math.Between(-15, 15);
    const dx = tx - enemy.x; const dy = ty - enemy.y;
    const len = Math.hypot(dx, dy);
    const speed = enemy.enemyType === 'boss' ? 260 : 180;
    const shot = this.enemyShots.create(enemy.x, enemy.y + 18, 'shotTex') as Phaser.Physics.Arcade.Sprite;
    shot.setVelocity((dx / len) * speed, (dy / len) * speed);
    shot.rotation = Math.atan2(dy, dx);
  }

  // ─── boss bar ─────────────────────────────────────────────────────────────

  private buildBossHealthBar(boss: EnemySprite): void {
    this.bossBarGfx   = this.add.graphics().setDepth(10);
    this.bossBarLabel = this.add.text(PLAY_W / 2, 168, 'BOSS', {
      fontSize: '11px', color: '#ff8800', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(10);
    this.updateBossHealthBar();
  }

  private updateBossHealthBar(): void {
    if (!this.bossRef || !this.bossBarGfx) return;
    const ratio = this.bossRef.hp / (this.bossRef.maxHp ?? 1);
    this.bossBarGfx.clear();
    this.bossBarGfx.fillStyle(0x2a1a00, 1); this.bossBarGfx.fillRect(PLAY_W / 2 - 80, 182, 160, 10);
    this.bossBarGfx.fillStyle(0xff6600, 1); this.bossBarGfx.fillRect(PLAY_W / 2 - 80, 182, 160 * ratio, 10);
  }

  private removeBossHealthBar(): void {
    this.bossBarGfx?.destroy(); this.bossBarLabel?.destroy();
  }

  // ─── wave label ───────────────────────────────────────────────────────────

  private showWaveLabel(text: string): void {
    if (!this.waveLabelText) {
      this.waveLabelText = this.add.text(PLAY_W / 2, 60, '', {
        fontSize: '19px', color: '#ffff00', fontFamily: 'monospace',
      }).setOrigin(0.5).setDepth(10);
    }
    this.tweens.killTweensOf(this.waveLabelText);
    this.waveLabelText.setText(text).setAlpha(1);
    this.tweens.add({ targets: this.waveLabelText, alpha: 0, delay: 1400, duration: 700 });
  }

  // ─── ally ship events ─────────────────────────────────────────────────────

  private scheduleAllyEvents(): void {
    const mission = MISSIONS[this.missionId];
    if (!mission) return;
    AllyShipEvent.scheduleAll(
      this, mission.allyEventTimes,
      this.cardManager, this.run,
      (card) => this.onAllyDrop(card),
    );
  }

  private onAllyDrop(card: CardDefinition | null): void {
    if (!card) return;
    if (this.isPaused) { this.pendingAllyCard = card; return; }
    this.showAllyDropPicker(card);
  }

  private showAllyDropPicker(card: CardDefinition): void {
    this.pauseCombat();
    this.levelUpOverlay.show(
      [card], this.run.rerollsLeft, 'ALLY DROP',
      (picked) => { this.onCardPicked(picked); this.resumeCombat(); },
      null,
      () => this.resumeCombat(),
    );
  }

  // ─── card picker (level-up) ────────────────────────────────────────────────

  private checkLevelUp(): void {
    if (this.run.level > XP_THRESHOLDS.length) return;
    const threshold = XP_THRESHOLDS[this.run.level - 1];
    if (this.run.xp >= threshold) {
      this.run.level++;
      this.combatHUD.updateLevel(this.run.level);
      const cards = this.cardManager.draw(this.run);
      if (cards.length > 0) this.showLevelUpPickerWithCards(cards);
    }
  }

  private showLevelUpPickerWithCards(cards: CardDefinition[]): void {
    this.tutorial?.trigger('cards', this);
    this.pauseCombat();
    this.levelUpOverlay.show(
      cards, this.run.rerollsLeft, 'LEVEL UP!',
      (picked) => { this.onCardPicked(picked); this.resumeCombat(); },
      () => {
        const rerolled = this.cardManager.reroll(this.run);
        if (rerolled && rerolled.length > 0) {
          this.levelUpOverlay.hide();
          this.showLevelUpPickerWithCards(rerolled);
        }
        // If no rerolls left, do nothing — player must pick from current cards.
      },
      null,
    );
  }

  private pauseCombat(): void {
    this.physics.pause();
    this.isPaused = true;
  }

  private resumeCombat(): void {
    this.levelUpOverlay.hide();
    this.physics.resume();
    this.isPaused = false;
    if (this.pendingAllyCard) {
      const card = this.pendingAllyCard;
      this.pendingAllyCard = null;
      this.showAllyDropPicker(card);
    }
  }

  // ─── tutorial triggers ────────────────────────────────────────────────────

  private checkTutorialTriggers(): void {
    if (!this.tutorial) return;
    // Energy drain: show tip when generator first goes below 85%.
    if (this.energy.ratio < 0.85) this.tutorial.trigger('energy', this);
    // Dodge: show tip when AutoDodge fires for the first time.
    if (this.autoDodge.lastDodgeTime > this.lastReportedDodge) {
      this.lastReportedDodge = this.autoDodge.lastDodgeTime;
      this.tutorial.trigger('dodge', this);
    }
  }

  // ─── mission end ──────────────────────────────────────────────────────────

  private endMission(bossBeaten: boolean): void {
    if (!this.isGameActive) return;
    this.isGameActive = false;
    this.physics.pause();
    const secondsTaken = (this.time.now - this.missionStartMs) / 1000;

    if (!bossBeaten) {
      this.playDeathAnimation();
    }

    const delay = bossBeaten ? 800 : DEATH_ANIM_MS;
    this.time.delayedCall(delay, () => {
      const result: MissionResult = {
        missionId:       this.missionId,
        bossBeaten,
        hullPercent:     (this.hullHp / this.hullMaxHp) * 100,
        hullHpRemaining: this.hullHp,
        secondsTaken:    Math.max(0, secondsTaken),
        enemiesKilled:   this.enemiesKilled,
        shieldBroken:    this.shields.broken,
        sideWeaponsUsed: this.sideWeaponsUsed,
        wavesCleared:    this.missionId === DAILY_MISSION_ID ? this.dailyWavesCleared : undefined,
      };
      this.scene.start('ResultScene', result);
    });
  }

  private playDeathAnimation(): void {
    // Immediate impact: red camera flash + heavy shake.
    this.cameras.main.flash(300, 255, 30, 30);
    this.cameras.main.shake(400, 0.018);

    // Three expanding burst rings, staggered in time.
    for (let i = 0; i < 3; i++) {
      this.time.delayedCall(i * 180, () => {
        this.spawnBurst(this.player.x, this.player.y, 0xff4400, 20);
        this.spawnBurst(this.player.x, this.player.y, 0xffcc00, 8);
      });
    }

    // Fade out the ship hull and all FX layers.
    this.tweens.add({
      targets: this.player, alpha: 0,
      duration: 500, delay: 100, ease: 'Power2',
    });
    this.playerShipFx.fadeOut(500);
  }

  // ─── cleanup ──────────────────────────────────────────────────────────────

  private removeOffscreenObjects(): void {
    const gone = (o: { x: number; y: number }) =>
      o.y < -100 || o.y > this.H + 100 || o.x < -100 || o.x > this.W + 100;

    for (const o of [...this.playerLasers.getChildren(), ...this.spreadShots.getChildren()])
      if (gone(o as Phaser.Physics.Arcade.Sprite)) o.destroy();

    for (const o of this.enemyShots.getChildren())
      if (gone(o as Phaser.Physics.Arcade.Sprite)) o.destroy();

    for (const o of this.enemies.getChildren())
      if ((o as Phaser.Physics.Arcade.Sprite).y > this.H + 80) o.destroy();

    if (this.asteroidGroup) {
      for (const o of this.asteroidGroup.getChildren())
        if (gone(o as Phaser.Physics.Arcade.Sprite)) o.destroy();
    }
  }

  // ─── debug ────────────────────────────────────────────────────────────────

  private setupDebugToggle(): void {
    this.input.keyboard?.on('keydown-F1', () => {
      DebugConfig.toggle();
      if (DebugConfig.enabled) { this.combatHUD.enableDebugOverlay(this); }
      else                     { this.combatHUD.disableDebugOverlay(); }
    });
  }

  // ─── update loop ──────────────────────────────────────────────────────────

  // fallow-ignore-next-line unused-class-member
  update(time: number, delta: number): void {
    if (!this.isGameActive) return;

    this.starfield.update();

    if (!this.isPaused) {
      this.energy.update(delta);
      this.shields.update(delta, this.energy);
      this.autoDodge.update(
        time, delta, this.player, this.enemyShots,
        this.energy, this.stats.dodgeCost, 40, PLAY_W - 40,
        this.stats.dodgeLookaheadMs,
      );
      this.player.x = Phaser.Math.Clamp(this.player.x, 40, PLAY_W - 40);

      for (const e of this.enemies.getChildren())
        this.tickEnemy(e as unknown as EnemySprite, time);

      this.removeOffscreenObjects();
      // Tutorial has no cards — skip level-up checks entirely.
      if (this.missionId !== 'tutorial') this.checkLevelUp();
      this.checkTutorialTriggers();
    }

    this.combatHUD.update(
      this.hullHp, this.hullMaxHp,
      this.energy.energy, this.energy.capacity, this.energy.ratio,
      this.shields.shieldHp, this.shields.maxShieldHp, this.shields.ratio,
      this.run.xp, this.run.level,
    );
    this.enemyHpBars.update(this.enemies);
    this.shieldVisual.update(delta, this.player.x, this.player.y, this.shields.ratio);
    this.playerShipFx.update(this.player.x, this.player.y, delta, this.energy.ratio);
    this.leftButton?.update(time, this.energy.ratio);
    this.rightButton?.update(time, this.energy.ratio);

    if (this.combatHUD.hasDebugOverlay) {
      this.combatHUD.updateDebugOverlay({
        fps:    Math.round(this.game.loop.actualFps),
        hp:     `${this.hullHp}/${this.hullMaxHp}`,
        shield: `${Math.round(this.shields.shieldHp)}/${this.shields.maxShieldHp}`,
        energy: `${Math.round(this.energy.energy)}/${this.energy.capacity}`,
        xp:     `${this.run.xp} lv${this.run.level}`,
        cards:  this.run.pickedCardIds.size,
        time:   `${Math.floor((time - this.missionStartMs) / 1000)}s`,
      });
    }
  }
}
