import { EnergyManager }    from '../../src/game/EnergyManager.js';
import { ShieldSystem }     from '../../src/game/ShieldSystem.js';
import type { ComputedStats } from '../../src/game/computeStats.js';
import type { RunState }    from '../../src/game/CardManager.js';
import {
  SHOT_DAMAGE,
  ENEMY_COLLISION_DAMAGE,
  ASTEROID_DAMAGE,
  ASTEROID_INTERVAL_MS,
  HULL_MAX_HP,
  XP_PER_KILL,
  isReadyToLevelUp,
} from '../../src/game/GameRules.js';
import { WAVE_SPECS, midShootMs, DEFAULT_SPEED } from '../../src/game/WaveSpec.js';
import type { MissionWaveSpec, WaveEvent } from '../../src/game/WaveSpec.js';
import { SimCardManager }   from './SimCardManager.js';
import type { CardStrategy } from './strategies/CardStrategy.js';
import type { SimConfig, SimResult, SimEnemy } from './SimTypes.js';

// ─── simulation-only constants ────────────────────────────────────────────────

const TICK_MS               = 100;
const MAX_TIME_MS           = 180_000;
const ENEMY_JITTER_BASE     = 0.8;
const ENEMY_JITTER_RANGE    = 0.4;
const DODGE_ENERGY_FLOOR    = 0.3;
const DODGE_SCALE           = 0.8;
const OVERCHARGE_MULTIPLIER = 3;

// Star travel model: spawn y ≈ -40, player y ≈ 400 → 440 px to traverse.
// Circles park at targetY (90–160 px) and never reach the player.
const STAR_TRAVEL_PX     = 440;
const ASTEROID_HIT_CHANCE = 0.40; // ~40% of asteroids hit (rest dodged laterally)

// ─── exports ──────────────────────────────────────────────────────────────────

/** Wave specs keyed by missionId — re-exported so simulate.ts can list missions. */
export { WAVE_SPECS as MISSION_SPECS };

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

// ─── helpers ─────────────────────────────────────────────────────────────────

function jitteredInterval(baseMs: number): number {
  return baseMs * (ENEMY_JITTER_BASE + Math.random() * ENEMY_JITTER_RANGE);
}

function spawnFromWaveEvent(wave: WaveEvent, timeMs: number, speedMul: number): SimEnemy {
  const shootMs = midShootMs(wave);
  const speed   = (wave.speed ?? DEFAULT_SPEED[wave.kind]) * speedMul;
  return {
    hp: wave.hp, maxHp: wave.hp,
    shootMs, nextShotMs: timeMs + jitteredInterval(shootMs),
    kind: wave.kind,
    spawnTimeMs: timeMs, speed,
  };
}

function spawnBossEnemy(hp: number, shootMs: number, timeMs: number): SimEnemy {
  return {
    hp, maxHp: hp, shootMs,
    nextShotMs: timeMs + jitteredInterval(shootMs),
    kind: 'boss', spawnTimeMs: timeMs, speed: 0,
  };
}

function findLowestHpEnemy(enemies: SimEnemy[], boss: SimEnemy | null): SimEnemy | null {
  let target: SimEnemy | null = boss;
  for (const e of enemies) {
    if (!target || e.hp < target.hp) target = e;
  }
  return target;
}

// ─── simulation phases ────────────────────────────────────────────────────────

function tickSpawnWaves(
  spec:      MissionWaveSpec,
  timeMs:    number,
  waveIndex: number,
  enemies:   SimEnemy[],
  speedMul:  number,
): number {
  let idx = waveIndex;
  while (idx < spec.waves.length && spec.waves[idx]!.atMs <= timeMs) {
    const wave = spec.waves[idx]!;
    for (let i = 0; i < wave.count; i++) {
      enemies.push(spawnFromWaveEvent(wave, timeMs, speedMul));
    }
    idx++;
  }
  return idx;
}

function tickPlayerFire(
  enemies:    SimEnemy[],
  boss:       SimEnemy | null,
  energy:     EnergyManager,
  stats:      ComputedStats,
  run:        RunState,
  lastShotMs: number,
  timeMs:     number,
): { newLastShotMs: number; xpGained: number; bossKilled: boolean } {
  if (timeMs - lastShotMs < stats.frontFireMs) {
    return { newLastShotMs: lastShotMs, xpGained: 0, bossKilled: false };
  }
  if (enemies.length === 0 && boss === null) {
    return { newLastShotMs: lastShotMs, xpGained: 0, bossKilled: false };
  }
  if (!energy.trySpend(stats.frontEnergyCost)) {
    return { newLastShotMs: lastShotMs, xpGained: 0, bossKilled: false };
  }

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

  if (boss && target === boss && target.hp <= 0) {
    return { newLastShotMs, xpGained: XP_PER_KILL['boss'] ?? 0, bossKilled: true };
  }

  let xpGained = 0;
  if (target !== boss && target.hp <= 0) {
    const idx = enemies.indexOf(target);
    if (idx !== -1) enemies.splice(idx, 1);
    xpGained = XP_PER_KILL[target.kind] ?? 0;
  }

  // Explosive rounds: 20% AoE hit on a second random enemy
  if (run.explosiveRounds && enemies.length > 0 && Math.random() < 0.20) {
    const candidates = target.hp > 0 ? enemies.filter(e => e !== target) : [...enemies];
    if (candidates.length > 0) {
      const secondary = candidates[Math.floor(Math.random() * candidates.length)]!;
      secondary.hp -= damage;
      if (secondary.hp <= 0) {
        const idx = enemies.indexOf(secondary);
        if (idx !== -1) enemies.splice(idx, 1);
        xpGained += XP_PER_KILL[secondary.kind] ?? 0;
      }
      if (run.pickedCardIds.has('energy_recovery')) {
        energy.add(8);
      }
    }
  }

  return { newLastShotMs, xpGained, bossKilled: false };
}

function tickEnemyFire(
  enemies:  SimEnemy[],
  boss:     SimEnemy | null,
  energy:   EnergyManager,
  shields:  ShieldSystem,
  timeMs:   number,
  hullHp:   { value: number },
): void {
  const allShooters = boss ? [...enemies, boss] : enemies;
  for (const enemy of allShooters) {
    if (enemy.nextShotMs > timeMs) continue;

    const dodge = Math.max(0, energy.ratio - DODGE_ENERGY_FLOOR) * DODGE_SCALE;
    if (Math.random() >= dodge) {
      hullHp.value -= shields.absorbHit(SHOT_DAMAGE, energy);
    }
    enemy.nextShotMs = timeMs + jitteredInterval(enemy.shootMs);
  }
}

// Stars travel straight toward the player position. If a star survives long
// enough to cross the field, it collides — damage goes through shields.
function tickStarCollisions(
  enemies:  SimEnemy[],
  energy:   EnergyManager,
  shields:  ShieldSystem,
  timeMs:   number,
  hullHp:   { value: number },
): void {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i]!;
    if (e.kind !== 'star') continue;
    const travelMs = (STAR_TRAVEL_PX / e.speed) * 1000;
    if (timeMs - e.spawnTimeMs < travelMs) continue;
    hullHp.value -= shields.absorbHit(ENEMY_COLLISION_DAMAGE, energy);
    enemies.splice(i, 1);
  }
}

// Asteroid field: periodic direct hull damage that bypasses shields.
function tickAsteroidDamage(
  spec:            MissionWaveSpec,
  timeMs:          number,
  hullHp:          { value: number },
  lastAsteroidMs:  { value: number },
): void {
  if (!spec.asteroidFieldUntilMs || timeMs > spec.asteroidFieldUntilMs) return;
  while (lastAsteroidMs.value + ASTEROID_INTERVAL_MS <= timeMs) {
    lastAsteroidMs.value += ASTEROID_INTERVAL_MS;
    if (Math.random() < ASTEROID_HIT_CHANCE) {
      hullHp.value = Math.max(0, hullHp.value - ASTEROID_DAMAGE);
    }
  }
}

function tickLevelUps(
  run:         RunState,
  stats:       ComputedStats,
  cardManager: SimCardManager,
  strategy:    CardStrategy,
): number {
  let picked = 0;
  while (isReadyToLevelUp(run.xp, run.level)) {
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
  const stats: ComputedStats = { ...config.stats };

  const energy     = new EnergyManager(stats);
  const shields    = new ShieldSystem(stats);
  const cardManager = new SimCardManager(config.chainLevel ?? 0);
  const hullHp     = { value: HULL_MAX_HP };

  const enemies:  SimEnemy[] = [];
  let   boss:     SimEnemy | null = null;

  let timeMs      = 0;
  let lastShotMs  = -stats.frontFireMs;
  let waveIndex   = 0;
  let totalPicked = 0;
  const lastAsteroidMs = { value: -ASTEROID_INTERVAL_MS };

  while (timeMs <= MAX_TIME_MS) {
    const nebulaMul =
      missionSpec.nebulaMul !== undefined && timeMs < (missionSpec.nebulaUntilMs ?? 0)
        ? missionSpec.nebulaMul
        : 1;

    waveIndex = tickSpawnWaves(missionSpec, timeMs, waveIndex, enemies, nebulaMul);

    if (missionSpec.autoWinAtMs !== undefined && timeMs >= missionSpec.autoWinAtMs) {
      return buildResult(true, hullHp.value, timeMs, totalPicked, shields.broken);
    }

    if (!boss && missionSpec.bossAtMs !== undefined && missionSpec.bossHp !== undefined
      && timeMs >= missionSpec.bossAtMs) {
      boss = spawnBossEnemy(missionSpec.bossHp, missionSpec.bossShootMs ?? 320, timeMs);
    }

    const fireResult = tickPlayerFire(enemies, boss, energy, stats, run, lastShotMs, timeMs);
    lastShotMs = fireResult.newLastShotMs;
    run.xp    += fireResult.xpGained;

    if (fireResult.bossKilled) {
      return buildResult(true, hullHp.value, timeMs, totalPicked, shields.broken);
    }

    tickEnemyFire(enemies, boss, energy, shields, timeMs, hullHp);
    tickStarCollisions(enemies, energy, shields, timeMs, hullHp);
    tickAsteroidDamage(missionSpec, timeMs, hullHp, lastAsteroidMs);

    if (hullHp.value <= 0) {
      return buildResult(false, 0, timeMs, totalPicked, shields.broken);
    }

    energy.update(TICK_MS);
    shields.update(TICK_MS, energy);
    totalPicked += tickLevelUps(run, stats, cardManager, strategy);
    timeMs      += TICK_MS;
  }

  return buildResult(false, Math.max(0, hullHp.value), timeMs, totalPicked, shields.broken);
}

function buildResult(
  won:          boolean,
  hullHpLeft:   number,
  timeMs:       number,
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
