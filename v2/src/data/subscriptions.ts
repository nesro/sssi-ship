// Subscription catalog — GAME_DESIGN §5.
// Each owned subscription contributes its card pool (up to the owned level) to support call draws.
// cardIds at each level are ADDITIVE: Lv2 pool = Lv1.cardIds ∪ Lv2.cardIds.

export interface SubscriptionLevel {
  /** Additional coin cost to reach this level from the previous (Lv1 = buy price). */
  price: number;
  starsRequired?: number;
  tagline: string;
  /** Card IDs added to the draw pool at exactly this level. */
  cardIds: string[];
}

export interface SubscriptionSpec {
  id: string;
  name: string;
  color: number;
  /** true = free, always owned Lv1, cannot be sold (Basic). */
  permanent: boolean;
  levels: [SubscriptionLevel, SubscriptionLevel, SubscriptionLevel];
}

// ─── Card pool partition ──────────────────────────────────────────────────────
// Every card ID from cards.ts + abilities.ts is assigned to exactly one subscription pool.
// Levels are additive: if you own Lv2, you draw from Lv1 + Lv2 card lists.

export const SUBSCRIPTIONS: Record<string, SubscriptionSpec> = {

  'sub-basic': {
    id: 'sub-basic',
    name: 'Basic',
    color: 0xffaa22,   // generatorAmber
    permanent: true,
    levels: [
      {
        price: 0,
        tagline: 'Generator and motor fundamentals.',
        cardIds: [
          'g-out-04',         // SPARE CELL
          'g-cap-15',         // BUFFER BANK
          'm-over-20',        // OVERDRIVE
          'm-eff-50',         // FRICTIONLESS HUB
          'meta-reroll-cache', // REROLL CACHE
        ],
      },
      {
        price: 600,
        tagline: 'Better output, more energy tricks.',
        cardIds: [
          'g-out-08',               // FUSION TAP
          'g-cap-30',               // DEEP CELL
          'cnt-windmill',           // WINDMILL
          'eco-blood-money',        // BLOOD MONEY
          'meta-windfall',          // WINDFALL
          'quantum-energy-overdrive', // ENERGY OVERDRIVE (active ×2 gen)
          'comet-motor-efficiency', // MOTOR EFFICIENCY
        ],
      },
      {
        price: 1200,
        starsRequired: 18,
        tagline: 'Maximum generator dominance.',
        cardIds: [
          'g-out-12',             // PLASMA TAP
          'm-over-35',            // AFTERBURNER
          'cnt-power-sink',       // POWER SINK
          'cnt-breaker-bonus',    // BREAKER BONUS
          'eco-blood-money-2',    // GOLD BATTERY
          'mile-windmill-2',      // GALE FORCE
          'quantum-power-surge',  // POWER SURGE (active ×3 gen)
        ],
      },
    ],
  },

  'sub-offensive': {
    id: 'sub-offensive',
    name: 'Offensive',
    color: 0x00ffee,  // weaponCyan
    permanent: false,
    levels: [
      {
        price: 350,
        tagline: 'Weapon damage, fire rate, energy efficiency.',
        cardIds: [
          'w-dmg-15',               // FOCUS LENS
          'w-rate-13',              // RAPID CYCLER
          'w-cost-25',              // COOL BARREL
          'sit-early-bird',         // EARLY BIRD
          'sit-demolisher',         // DEMOLISHER
          'quantum-efficiency-core', // EFFICIENCY CORE (energy cost ×0.8)
          'comet-early-assault',    // EARLY ASSAULT
        ],
      },
      {
        price: 600,
        tagline: 'Pierce, overcharge, and burst fire.',
        cardIds: [
          'w-dmg-30',           // PRISM CORE
          'w-rate-20',          // TWIN ACTUATOR
          'w-cost-40',          // ICE BARREL
          'oc-core',            // OVERCHARGE
          'pierce-lance',       // PIERCE LANCE
          'cond-full-energy',   // FULL CHARGE
          'sit-boss-hunter',    // BOSS HUNTER
          'nexus-barrage',      // BARRAGE MODE (active ×2 fire rate)
          'nexus-armour-breaker', // ARMOUR BREAKER
          'comet-speed-burst',  // SPEED BURST (active ×2 fire rate)
          'quantum-full-charge', // FULL CHARGE BONUS
        ],
      },
      {
        price: 1000,
        starsRequired: 18,
        tagline: 'Elite damage — overcharge, pierce, and burst mastery.',
        cardIds: [
          'w-dmg-50',           // SNIPER CORE
          'w-rate-30',          // TRIPLE ACTUATOR
          'oc-refund',          // CAPACITOR REFUND
          'oc-super',           // SUPERCHARGE
          'pierce-leech',       // LEECH ROUNDS
          'pierce-shrapnel',    // SHRAPNEL
          'sit-armor-pierce',   // ARMOR PIERCE
          'sit-swarm-killer',   // SWARM KILLER
          'mile-endgame',       // ENDGAME
          'mile-earlybird-2',   // LIGHTNING START
          'mile-boss-2',        // APEX PREDATOR
          'cond-full-energy-2', // OVERCHARGED
          'cond-single-enemy',  // FOCUS FIRE
          'nexus-overload',     // NEXUS OVERLOAD (active ×2 damage)
          'mile-prismatic',     // PRISMATIC BURST
          'mile-overcharge-2',  // RAPID OVERCHARGE
          'mile-armor-2',       // EXECUTION
        ],
      },
    ],
  },

  'sub-defensive': {
    id: 'sub-defensive',
    name: 'Defensive',
    color: 0x3388ff,  // shieldBlue
    permanent: false,
    levels: [
      {
        price: 350,
        tagline: 'Shield pulses, capacity, hull recovery.',
        cardIds: [
          's-pulse-25',           // HARMONIC TUNER
          's-cap-15',             // WIDE PROJECTOR
          'cnt-bounty',           // BOUNTY
          'cnt-drain-cycle',      // DRAIN CYCLE
          'cond-high-hull-gen',   // PRISTINE HULL
          'aegis-shield-resonance', // SHIELD RESONANCE (+40% pulse)
          'quantum-pulse-amplifier', // PULSE AMPLIFIER
        ],
      },
      {
        price: 600,
        tagline: 'Resonance chain and kill-triggered healing.',
        cardIds: [
          's-pulse-40',          // FIELD WEAVER
          's-cap-20',            // HEAVY PLATING
          'res-sync',            // SHIELD SYNC
          'acc-leech',           // LEECH HULL
          'mile-chain-shot',     // BOUNTY SHIELD
          'cond-boss-gen',       // BOSS FOCUS
          'mile-full-shield-dmg', // PEAK CONDITION
          'aegis-resonance-pulse', // RESONANCE PULSE (active invuln 1s)
          'aegis-hull-recovery', // HULL RECOVERY
          'aegis-guardian-sync', // GUARDIAN SYNC
        ],
      },
      {
        price: 1000,
        starsRequired: 18,
        tagline: 'Invulnerability, resonance mastery, generator synergies.',
        cardIds: [
          's-pulse-60',          // RESONANCE WEAVER
          's-cap-30',            // MEGA PLATING
          'res-pulse-amp',       // PULSE AMP
          'res-pulse-nova',      // PULSE NOVA
          'mile-drain-cycle-2',  // BATTERY CYCLE
          'mile-hull-leech-2',   // VAMPIRE ROUNDS
          'mile-pulse-2',        // PULSE STORM
          'mile-overclock-gen',  // OVERCLOCK
          'mile-pulse-energy',   // PULSE HARVEST
          'mile-energy-leech',   // ENERGY LEECH
          'aegis-barrier',       // AEGIS BARRIER (active invuln 2s)
        ],
      },
    ],
  },

  'sub-risk': {
    id: 'sub-risk',
    name: 'High-risk',
    color: 0xff8833,  // enemyOrange
    permanent: false,
    levels: [
      {
        price: 400,
        tagline: 'Visible costs, extreme payoffs.',
        cardIds: [
          'trd-glass-cannon',  // GLASS CANNON
          'trd-bloodfire',     // BLOODFIRE
          'cond-low-hull',     // LAST STAND
          'trap-gambler',      // GAMBLER
          'brs-adrenaline',    // ADRENALINE
        ],
      },
      {
        price: 700,
        tagline: 'Volatile shields, warp drives, and spite.',
        cardIds: [
          'trd-hungry-shield', // HUNGRY SHIELD
          'trd-warp-drive',    // WARP DRIVE
          'trap-entropy',      // ENTROPY
          'brs-spite',         // SPITE
          'mile-no-shield-dmg', // ZERO BARRIER
          'cond-no-shield',    // DESPERATE FIRE
        ],
      },
      {
        price: 1100,
        starsRequired: 28,
        tagline: 'Berserker mastery and total system chaos.',
        cardIds: [
          'trd-volatile-core',   // VOLATILE CORE
          'trd-berserker-trade', // BERSERKER OATH
          'trap-haywire',        // HAYWIRE
          'brs-frenzy',          // FRENZY
          'mile-desperate-dmg',  // CORNERED
          'mile-glass-cannon-2', // TOTAL FOCUS
        ],
      },
    ],
  },

  'sub-accumulating': {
    id: 'sub-accumulating',
    name: 'Accumulating',
    color: 0xff44cc,  // motorMagenta
    permanent: false,
    levels: [
      {
        price: 350,
        tagline: 'Kill stacks, momentum, economy.',
        cardIds: [
          'acc-killcount',      // KILLCOUNT
          'acc-momentum',       // MOMENTUM
          'eco-greed',          // GREED
          'sit-swarm-sense',    // SWARM SENSE
          'cnt-phantom-shot',   // PHANTOM SHOT
          'comet-timeline-rush', // TIMELINE RUSH
        ],
      },
      {
        price: 600,
        tagline: 'Extinction, pillage, and swarm control.',
        cardIds: [
          'acc-killcount-2',    // EXTINCTION
          'eco-bounty-hunter',  // BOUNTY HUNTER
          'mile-blocker-coin',  // PILLAGER
          'cond-many-enemies',  // SWARM MIND
          'sit-final-push',     // FINAL PUSH
          'nexus-blocker-bane', // BLOCKER BANE
          'comet-last-lap',     // LAST LAP PUSH
        ],
      },
      {
        price: 1000,
        starsRequired: 18,
        tagline: 'Genocide, chain explosions, unstoppable momentum.',
        cardIds: [
          'mile-kill-2',        // GENOCIDE
          'mile-momentum-2',    // UNSTOPPABLE
          'mile-swarm-3',       // CROWD CONTROL
          'mile-blocker-nuke',  // CORE BREACH
          'mile-refund',        // ENERGY BANK
          'mile-free-shot-2',   // GHOST ROUNDS
          'sit-demolisher-2',   // HEAVY DEMO
          'nexus-shrapnel',     // SHRAPNEL KILL
        ],
      },
    ],
  },
};

export function subscriptionById(id: string): SubscriptionSpec {
  const sub = SUBSCRIPTIONS[id];
  if (sub === undefined) throw new Error(`Unknown subscription "${id}"`);
  return sub;
}

/** Returns all card IDs available at a given subscription level (cumulative: 1..level). */
export function cardIdsAtLevel(spec: SubscriptionSpec, level: number): string[] {
  const ids: string[] = [];
  for (let l = 1; l <= level && l <= spec.levels.length; l++) {
    const lvl = spec.levels[l - 1];
    if (lvl !== undefined) ids.push(...lvl.cardIds);
  }
  return ids;
}
