import type {
  EnemyGeneratorModule,
  EnemyMotorModule,
  EnemySpec,
  EnemyShieldModule,
  EnemyWeaponModule,
} from './types';

/** Everything about a composed enemy that isn't one of the four modules — the display
 * identity and the handful of independent traits (blocksConveyor, isBoss,
 * holdBonusTiered) that a designer sets per composition rather than deriving from a
 * module kind (see EnemySpec's own field comments for why each stays independent). */
export interface ComposedEnemyBase {
  kind: string;
  hp: number;
  coinReward: number;
  isBoss?: boolean;
  blocksConveyor?: boolean;
  holdBonusTiered?: boolean;
  /** Real identity shown to the player — see EnemySpec.displayName's own doc. */
  displayName?: string;
  /** A second, independent gun — see EnemySpec.rearWeaponKind's own doc. Bundled into
   * `base` (not a 6th positional param — ESLint's max-params caps at 5) rather than
   * alongside weapon/shield/generator/motor: unlike those four, most enemies don't
   * have one at all, matching how `isBoss`/`holdBonusTiered` are also base-level
   * "does this specific enemy opt into an extra thing" traits, not core module slots. */
  rearWeapon?: EnemyWeaponModule | null;
}

/** The rear-weapon slice of a composed EnemySpec — `null` collapses to the same
 * all-zero/null shape timeline.ts's spawnEnemy already defaults an unset spec to,
 * so a hand-written const that never mentions rear fields at all and one composed
 * with `rearWeapon: null` are indistinguishable. Split out of composeEnemy purely to
 * keep that function's own branching count down. */
function rearWeaponFields(rearWeapon: EnemyWeaponModule | null): Pick<
  EnemySpec, 'rearWeaponKind' | 'rearShotDamage' | 'rearTicksBetweenShots' | 'rearCritChance' | 'rearMissChance' | 'rearCritMult'
> {
  if (rearWeapon === null) {
    return { rearWeaponKind: null, rearShotDamage: 0, rearTicksBetweenShots: 0, rearCritChance: 0, rearMissChance: 0, rearCritMult: 2.0 };
  }
  return {
    rearWeaponKind: rearWeapon.kind,
    rearShotDamage: rearWeapon.shotDamage,
    rearTicksBetweenShots: rearWeapon.ticksBetweenShots,
    rearCritChance: rearWeapon.critChance,
    rearMissChance: rearWeapon.missChance,
    rearCritMult: rearWeapon.critMult,
  };
}

/** Folds four-plus-one concrete module objects into the flat EnemySpec shape every
 * enemy has always had (docs/plans/modular-enemies.md). Spawn-agnostic on purpose:
 * callable at data-definition time for hand-authored consts (a static, one-time
 * composition, no different in effect from writing the flat literal directly) or at
 * real spawn time for a per-instance randomized pick (timeline.ts) — both resolve
 * through this same function so there is only one place that defines what a module
 * combination means. */
export function composeEnemy(
  weapon: EnemyWeaponModule,
  shield: EnemyShieldModule | null,
  generator: EnemyGeneratorModule,
  motor: EnemyMotorModule,
  base: ComposedEnemyBase,
): EnemySpec {
  const spec: EnemySpec = {
    kind: base.kind,
    hp: base.hp,
    speed: motor.speed,
    shotDamage: weapon.shotDamage,
    ticksBetweenShots: weapon.ticksBetweenShots,
    blocksConveyor: base.blocksConveyor ?? false,
    coinReward: base.coinReward,
    // 'none' never regenerates anything; every other kind's regenPerTick is
    // meaningful (see EnemyGeneratorModule's own doc for the per-kind unit).
    regenPerTick: generator.kind === 'none' ? 0 : generator.regenPerTick,
    critChance: weapon.critChance,
    missChance: weapon.missChance,
    critMult: weapon.critMult,
    weaponKind: weapon.kind,
    shieldKind: shield === null ? null : shield.kind,
    generatorKind: generator.kind,
    motorKind: motor.kind,
    shieldCapacity: shield === null ? 0 : shield.capacity,
    holdBonusTiered: base.holdBonusTiered ?? false,
    ...rearWeaponFields(base.rearWeapon ?? null),
  };
  if (base.isBoss !== undefined) spec.isBoss = base.isBoss;
  if (base.displayName !== undefined) spec.displayName = base.displayName;
  return spec;
}
