import { EnergyManager } from '../../src/game/EnergyManager.js';
import { ShieldSystem } from '../../src/game/ShieldSystem.js';
import type { ComputedStats } from '../../src/game/computeStats.js';
import type { RunState } from '../../src/game/CardManager.js';
import { SimCardManager } from './SimCardManager.js';
import type { CardStrategy } from './strategies/CardStrategy.js';
import type { SimConfig, SimResult, SimEnemy, MissionSpec } from './SimTypes.js';

// ─── simulation constants ────────────────────────────────────────────────────

const TICK_MS       = 100;
const MAX_TIME_MS   = 120_000;
const HULL_MAX_HP   = 100;
const SHOT_DAMAGE   = 5;

// XP to reach each level (index = level, so index 0 means XP needed for level 1).
const XP_THRESHOLDS = [80, 200, 380, 600, 900] as const;

// XP granted per kill.
const XP_STAR_ENEMY = 15;
const XP_BOSS_KILL  = 300;

// Seconds after last wave before boss spawns.
const BOSS_SPAWN_DELAY_MS = 10_000;

// Jitter range for enemy shot timing (±20%).
const ENEMY_JITTER_BASE  = 0.8;
const ENEMY_JITTER_RANGE = 0.4; // total range: 0.8 – 1.2

// Dodge probability formula constants.
const DODGE_ENERGY_FLOOR = 0.3;
const DODGE_SCALE        = 0.8;

// Overcharge damage multiplier.
const OVERCHARGE_MULTIPLIER = 3;

// ─── mission specs (no Phaser imports) ───────────────────────────────────────

export const MISSION_SPECS: Record<string, MissionSpec> = {
  tutorial: {
    id: 'tutorial',
    waves: [
      { atMs: 3000,  count: 2, enemySpec: { hp: 5, shootMs: 4000, xp: XP_STAR_ENEMY } },
      { atMs: 12000, count: 2, enemySpec: { hp: 5, shootMs: 4000, xp: XP_STAR_ENEMY } },
      { atMs: 25000, count: 3, enemySpec: { hp: 5, shootMs: 4000, xp: XP_STAR_ENEMY } },
      { atMs: 40000, count: 3, enemySpec: { hp: 5, shootMs: 4000, xp: XP_STAR_ENEMY } },
    ],
    // Tutorial has no boss — it auto-wins when the player survives 60 seconds.
    autoWinAtMs: 60_000,
  },
  mission_1: {
    id: 'mission_1',
    waves: [
      { atMs: 2000,  count: 5,  enemySpec: { hp: 10, shootMs: 2600, xp: XP_STAR_ENEMY } },
      { atMs: 12000, count: 6,  enemySpec: { hp: 10, shootMs: 2600, xp: XP_STAR_ENEMY } },
      { atMs: 22000, count: 7,  enemySpec: { hp: 10, shootMs: 2400, xp: XP_STAR_ENEMY } },
      { atMs: 32000, count: 8,  enemySpec: { hp: 10, shootMs: 2200, xp: XP_STAR_ENEMY } },
      { atMs: 44000, count: 10, enemySpec: { hp: 10, shootMs: 2000, xp: XP_STAR_ENEMY } },
    ],
    bossSpec: { hp: 200, shootMs: 320, xp: XP_BOSS_KILL },
  },
  mission_2: {
    id: 'mission_2',
    waves: [
      { atMs: 5000,  count: 4, enemySpec: { hp: 10, shootMs: 2400, xp: XP_STAR_ENEMY } },
      { atMs: 15000, count: 5, enemySpec: { hp: 20, shootMs: 3000, xp: 40 } },
      { atMs: 28000, count: 6, enemySpec: { hp: 10, shootMs: 2000, xp: XP_STAR_ENEMY } },
      { atMs: 40000, count: 4, enemySpec: { hp: 20, shootMs: 2800, xp: 40 } },
      { atMs: 60000, count: 8, enemySpec: { hp: 10, shootMs: 1800, xp: XP_STAR_ENEMY } },
      { atMs: 80000, count: 5, enemySpec: { hp: 20, shootMs: 2500, xp: 40 } },
    ],
    bossSpec: { hp: 120, shootMs: 500, xp: XP_BOSS_KILL },
  },
  mission_3: {
    id: 'mission_3',
    waves: [
      { atMs: 3000,  count: 8,  enemySpec: { hp: 10, shootMs: 1600, xp: XP_STAR_ENEMY } },
      { atMs: 12000, count: 5,  enemySpec: { hp: 20, shootMs: 2500, xp: 40 } },
      { atMs: 22000, count: 10, enemySpec: { hp: 10, shootMs: 1400, xp: XP_STAR_ENEMY } },
      { atMs: 35000, count: 6,  enemySpec: { hp: 20, shootMs: 2200, xp: 40 } },
      { atMs: 50000, count: 12, enemySpec: { hp: 10, shootMs: 1200, xp: XP_STAR_ENEMY } },
      { atMs: 70000, count: 7,  enemySpec: { hp: 20, shootMs: 2000, xp: 40 } },
    ],
    bossSpec: { hp: 300, shootMs: 200, xp: XP_BOSS_KILL },
  },
};

// ─── helpers ─────────────────────────────────────────────────────────────────

export function makeInitialRun(): RunState {
  return {
    pickedCardIds:        new Set<string>(),
    rerollsLeft:          5,
    xp:                   0,
    level:                1,
    explosiveRounds:      false,
    chainLightning:       false,
    overcharge:           false,
    shotsSinceOvercharge: 0,
    overchargeEvery:      8,
  };
}

function jitteredInterval(baseMs: number): number {
  return baseMs * (ENEMY_JITTER_BASE + Math.random() * ENEMY_JITTER_RANGE);
}

function spawnEnemy(hp: number, shootMs: number, timeMs: number): SimEnemy {
  return {
    hp,
    maxHp:      hp,
    shootMs,
    nextShotMs: timeMs + jitteredInterval(shootMs),
  };
}

function findLowestHpEnemy(enemies: SimEnemy[], boss: SimEnemy | null): SimEnemy | null {
  let target: SimEnemy | null = boss;
  for (const e of enemies) {
    if (!target || e.hp < target.hp) target = e;
  }
  return target;
}

// Game starts at level 1; XP_THRESHOLDS[0] is the XP needed to reach level 2.
function isReadyToLevelUp(run: RunState): boolean {
  return run.level <= XP_THRESHOLDS.length && run.xp >= XP_THRESHOLDS[run.level - 1];
}

// ─── simulation phases ────────────────────────────────────────────────────────

function tickSpawnWaves(
  spec: MissionSpec,
  timeMs: number,
  waveIndex: number,
  enemies: SimEnemy[],
): number {
  let idx = waveIndex;
  while (idx < spec.waves.length && spec.waves[idx].atMs <= timeMs) {
    const wave = spec.waves[idx];
    for (let i = 0; i < wave.count; i++) {
      enemies.push(spawnEnemy(wave.enemySpec.hp, wave.enemySpec.shootMs, timeMs));
    }
    idx++;
  }
  return idx;
}

function tickPlayerFire(
  enemies: SimEnemy[],
  boss: SimEnemy | null,
  energy: EnergyManager,
  stats: ComputedStats,
  run: RunState,
  lastShotMs: number,
  timeMs: number,
): { newLastShotMs: number; xpGained: number; bossKilled: boolean } {
  if (timeMs - lastShotMs < stats.frontFireMs) {
    return { newLastShotMs: lastShotMs, xpGained: 0, bossKilled: false };
  }

  const hasTargets = enemies.length > 0 || boss !== null;
  if (!hasTargets) return { newLastShotMs: lastShotMs, xpGained: 0, bossKilled: false };
  if (!energy.trySpend(stats.frontEnergyCost)) return { newLastShotMs: lastShotMs, xpGained: 0, bossKilled: false };

  const newLastShotMs = timeMs;

  if (run.overcharge) run.shotsSinceOvercharge++;

  let damage = stats.frontDamage;
  if (run.overcharge && run.shotsSinceOvercharge >= run.overchargeEvery) {
    damage *= OVERCHARGE_MULTIPLIER;
    run.shotsSinceOvercharge = 0;
  }

  const target = findLowestHpEnemy(enemies, boss);
  if (!target) return { newLastShotMs, xpGained: 0, bossKilled: false };

  target.hp -= damage;

  if (target.hp > 0) return { newLastShotMs, xpGained: 0, bossKilled: false };

  // Target died.
  if (boss && target === boss) {
    return { newLastShotMs, xpGained: XP_BOSS_KILL, bossKilled: true };
  }

  // Regular enemy died — remove it from the array.
  const idx = enemies.indexOf(target);
  if (idx !== -1) enemies.splice(idx, 1);

  return { newLastShotMs, xpGained: target.maxHp <= 10 ? XP_STAR_ENEMY : target.maxHp * 2, bossKilled: false };
}

function tickEnemyFire(
  enemies: SimEnemy[],
  boss: SimEnemy | null,
  energy: EnergyManager,
  shields: ShieldSystem,
  timeMs: number,
  hullHp: { value: number },
): void {
  const allShooters = boss ? [...enemies, boss] : enemies;
  for (const enemy of allShooters) {
    if (enemy.nextShotMs > timeMs) continue;

    const dodge = Math.max(0, energy.ratio - DODGE_ENERGY_FLOOR) * DODGE_SCALE;
    if (Math.random() >= dodge) {
      // Hit — apply shield absorption then hull damage.
      const passThrough  = shields.absorbHit(SHOT_DAMAGE, energy);
      hullHp.value      -= passThrough;
    }

    enemy.nextShotMs = timeMs + jitteredInterval(enemy.shootMs);
  }
}

function tickLevelUps(
  run: RunState,
  stats: ComputedStats,
  cardManager: SimCardManager,
  strategy: CardStrategy,
): number {
  let picked = 0;
  while (isReadyToLevelUp(run)) {
    run.level++;
    const drawn = cardManager.draw(run);
    if (drawn.length > 0) {
      const choice = strategy.pick(drawn, stats, run);
      cardManager.pick(choice, stats, run);
      picked++;
    }
  }
  return picked;
}

// ─── public entry point ───────────────────────────────────────────────────────

export function runSimulation(config: SimConfig, strategy: CardStrategy, run: RunState): SimResult {
  const { missionSpec } = config;

  // Clone stats so card picks in this run don't mutate the caller's object.
  const stats: ComputedStats = { ...config.stats };

  const energy     = new EnergyManager(stats);
  const shields    = new ShieldSystem(stats);
  const cardManager = new SimCardManager();

  const hullHp = { value: HULL_MAX_HP };

  const enemies:    SimEnemy[]    = [];
  let   boss:       SimEnemy | null = null;

  const lastWave       = missionSpec.waves[missionSpec.waves.length - 1];
  const bossSpawnMs    = (lastWave?.atMs ?? 0) + BOSS_SPAWN_DELAY_MS;

  let timeMs       = 0;
  let lastShotMs   = -stats.frontFireMs; // allow firing immediately at t=0
  let waveIndex    = 0;
  let totalPicked  = 0;

  while (timeMs <= MAX_TIME_MS) {
    // 1. Spawn due waves.
    waveIndex = tickSpawnWaves(missionSpec, timeMs, waveIndex, enemies);

    // 2. Auto-win for missions without a boss (e.g. tutorial).
    if (missionSpec.autoWinAtMs !== undefined && timeMs >= missionSpec.autoWinAtMs) {
      return buildResult(true, hullHp.value, timeMs, totalPicked, shields.broken);
    }

    // 3. Spawn boss when all waves are done and delay has elapsed.
    if (!boss && missionSpec.bossSpec && waveIndex >= missionSpec.waves.length && timeMs >= bossSpawnMs) {
      boss = spawnEnemy(missionSpec.bossSpec.hp, missionSpec.bossSpec.shootMs, timeMs);
    }

    // 4. Player fires front laser (mutates enemies / boss in place).
    const fireResult = tickPlayerFire(enemies, boss, energy, stats, run, lastShotMs, timeMs);
    lastShotMs = fireResult.newLastShotMs;
    run.xp    += fireResult.xpGained;

    if (fireResult.bossKilled) {
      boss = null;
      return buildResult(true, hullHp.value, timeMs, totalPicked, shields.broken);
    }

    // 5. Enemies return fire.
    tickEnemyFire(enemies, boss, energy, shields, timeMs, hullHp);

    if (hullHp.value <= 0) {
      return buildResult(false, 0, timeMs, totalPicked, shields.broken);
    }

    // 6. Regen systems.
    energy.update(TICK_MS);
    shields.update(TICK_MS, energy);

    // 7. Level-up card picks.
    totalPicked += tickLevelUps(run, stats, cardManager, strategy);

    timeMs += TICK_MS;
  }

  // Timeout — mission failure.
  return buildResult(false, Math.max(0, hullHp.value), timeMs, totalPicked, shields.broken);
}

function buildResult(
  won: boolean,
  hullHpLeft: number,
  timeMs: number,
  cardsPickedN: number,
  shieldBroken: boolean,
): SimResult {
  return {
    won,
    hullHpLeft,
    hullMaxHp:    HULL_MAX_HP,
    secondsTaken: timeMs / 1000,
    cardsPickedN,
    shieldBroken,
  };
}
