// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { defaultSave, resetSave, switchItem, switchRearWeapon } from '../save/SaveManager';
import {
  GENERATOR_SYSTEM, MOTOR_SYSTEM, REAR_WEAPON_SYSTEM, SHIELD_SYSTEM, SHIP_SYSTEM, SIDE_WEAPON_SYSTEM, WEAPON_SYSTEM,
} from './shopSystems';
import type { ShopSystemConfig } from './shopSystems';
import {
  computeCumulativeCost, computeDispatch, computeGalaxyMap, computeKindRows, computeKindRowTrace,
  computeLevelChips, computeLoadoutRows, computeMissionDetail, computeSettings, computeSupplies,
  DEFAULT_HUB_UI_STATE, resolveUiState,
} from './hub';
import type { HubUIState } from './hub';
import { SUBSCRIPTIONS } from '../data/subscriptions';

beforeEach(() => {
  resetSave();
});

function uiState(overrides: Partial<HubUIState> = {}): HubUIState {
  return { ...DEFAULT_HUB_UI_STATE, ...overrides };
}

describe('resolveUiState', () => {
  it('undefined selection defaults to the equipped kind', () => {
    const save = defaultSave(); // weapon.pulse-1 equipped by default
    const resolved = resolveUiState(save, uiState({ tab: 'weapon' }));
    expect(resolved.selectedKindByTab.weapon).toBe('pulse');
  });

  it('shield, nothing equipped, defaults to null (NONE row)', () => {
    let save = defaultSave();
    save = { ...save, equipped: { ...save.equipped, shield: null } };
    const resolved = resolveUiState(save, uiState({ tab: 'shield' }));
    expect(resolved.selectedKindByTab.shield).toBeNull();
  });

  it('generator, nothing selected, defaults to the equipped kind (never null)', () => {
    const save = defaultSave(); // generator-torrent-1 equipped by default
    const resolved = resolveUiState(save, uiState({ tab: 'generator' }));
    expect(resolved.selectedKindByTab.generator).toBe('torrent');
  });

  it('an existing null or string selection is kept as-is', () => {
    const save = defaultSave();
    const raw = uiState({ tab: 'weapon', selectedKindByTab: { weapon: null } });
    expect(resolveUiState(save, raw).selectedKindByTab.weapon).toBeNull();
    const raw2 = uiState({ tab: 'weapon', selectedKindByTab: { weapon: 'ion' } });
    expect(resolveUiState(save, raw2).selectedKindByTab.weapon).toBe('ion');
  });
});

describe('computeKindRows — states', () => {
  it('equipped: rowState equipped, badge null, mutation null, selectKind set', () => {
    const save = defaultSave();
    const rows = computeKindRows({ config: WEAPON_SYSTEM, save, playerStars: 0 }, 'pulse');
    const pulse = rows.find((r) => r.kind === 'pulse');
    expect(pulse?.rowState).toBe('equipped');
    expect(pulse?.badge).toBeNull();
    expect(pulse?.tap.mutation).toBeNull();
    expect(pulse?.tap.selectKind).toBe('pulse');
  });

  it('tapping the equipped kind still sets selectKind (selection always fires)', () => {
    const save = defaultSave();
    const rows = computeKindRows({ config: WEAPON_SYSTEM, save, playerStars: 0 }, null);
    const pulse = rows.find((r) => r.kind === 'pulse');
    expect(pulse?.tap.selectKind).toBe('pulse');
  });

  it('switching away and back always uses the trade-in formula — nothing is remembered as owned', () => {
    let save = { ...defaultSave(), coins: 5000 };
    save = switchItem(save, 'ion-1'); // buy+equip ion (3000); pulse-1 is gone, not "kept owned"
    const rows = computeKindRows({ config: WEAPON_SYSTEM, save, playerStars: 0 }, 'ion');
    const pulse = rows.find((r) => r.kind === 'pulse');
    expect(pulse?.rowState).toBe('purchasable');
    // pulse-1 costs 100, ion-1 equipped at 3000 → refund 2900
    expect(pulse?.badge).toEqual({ kind: 'refund', label: '+2900⬤', coins: 2900 });
    expect(pulse?.tap.mutation).toEqual({ type: 'switch-item', itemId: 'pulse-1' });
  });

  it('purchasable: badge cost, affordable true', () => {
    const save = { ...defaultSave(), coins: 5000 };
    const rows = computeKindRows({ config: WEAPON_SYSTEM, save, playerStars: 20 }, null);
    const ion = rows.find((r) => r.kind === 'ion');
    expect(ion?.rowState).toBe('purchasable');
    // ion-1 (3000) - pulse-1 equipped (100) = 2900
    expect(ion?.badge).toEqual({ kind: 'cost', label: '-2900⬤', coins: 2900, affordable: true });
  });

  it('unaffordable: badge cost, affordable false', () => {
    const save = { ...defaultSave(), coins: 10 };
    const rows = computeKindRows({ config: WEAPON_SYSTEM, save, playerStars: 20 }, null);
    const ion = rows.find((r) => r.kind === 'ion');
    expect(ion?.rowState).toBe('unaffordable');
    expect(ion?.badge).toEqual({ kind: 'cost', label: '-2900⬤', coins: 2900, affordable: false });
  });

  it('locked: rowState locked, badge stars', () => {
    const save = defaultSave(); // 0 stars
    const rows = computeKindRows({ config: MOTOR_SYSTEM, save, playerStars: 0 }, null);
    const overdrive = rows.find((r) => r.kind === 'overdrive'); // starsRequired 30 at Lv1
    expect(overdrive?.rowState).toBe('locked');
    expect(overdrive?.badge).toEqual({ kind: 'stars', label: '★30', stars: 30 });
  });

  it('refund: badge refund with correct label', () => {
    let save = { ...defaultSave(), coins: 5000 };
    save = switchItem(save, 'ion-1'); // equip pricier ion (3000)
    // scatter-1 (1200) is cheaper than the equipped ion-1 (3000) → refund path
    const rows = computeKindRows({ config: WEAPON_SYSTEM, save, playerStars: 20 }, 'ion');
    const scatter = rows.find((r) => r.kind === 'scatter');
    expect(scatter?.rowState).toBe('purchasable');
    expect(scatter?.badge).toEqual({ kind: 'refund', label: '+1800⬤', coins: 1800 });
  });

  it('free item + nothing equipped: badge still shows the real "0 coins" — never a blank that looks the same as NONE', () => {
    const save = defaultSave(); // rear weapon: nothing equipped
    // Real catalog prices never hit 0 outside of NONE itself (a system with a NONE option
    // never prices a real item at 0 — see SIDE_WEAPON_PRICES etc.) — force it here to
    // exercise the zero-cost badge path directly.
    const freeItemConfig: ShopSystemConfig = { ...REAR_WEAPON_SYSTEM, itemPrice: () => 0 };
    const rows = computeKindRows({ config: freeItemConfig, save, playerStars: 0 }, null);
    const grenade = rows.find((r) => r.kind === 'grenade');
    expect(grenade?.badge).toEqual({ kind: 'cost', label: '0⬤', coins: 0, affordable: true });
  });

  it('NONE row: isNoneRow true, kind null', () => {
    const save = defaultSave();
    const rows = computeKindRows({ config: WEAPON_SYSTEM, save, playerStars: 0 }, null);
    const none = rows[0];
    expect(none?.isNoneRow).toBe(true);
    expect(none?.kind).toBeNull();
  });

  it('NONE row badge shows the real refund for the equipped item — never a blank "looks free" badge', () => {
    let save = { ...defaultSave(), coins: 5000 };
    save = switchItem(save, 'ion-1'); // equip ion-1 (3000)
    const rows = computeKindRows({ config: WEAPON_SYSTEM, save, playerStars: 0 }, 'ion');
    const none = rows.find((r) => r.isNoneRow);
    expect(none?.badge).toEqual({ kind: 'refund', label: '+3000⬤', coins: 3000 });
  });

  it('NONE row badge shows the real "0 coins" when the equipped item is free — never a blank that looks like the current-state blank', () => {
    const save = defaultSave(); // pulse-1 equipped
    // Real catalog data never leaves a NONE-having system's equipped item priced at 0 —
    // force it here to exercise the zero-cost NONE-row badge path directly.
    const freeEquippedConfig: ShopSystemConfig = { ...WEAPON_SYSTEM, equippedPrice: () => 0 };
    const rows = computeKindRows({ config: freeEquippedConfig, save, playerStars: 0 }, 'pulse');
    const none = rows.find((r) => r.isNoneRow);
    expect(none?.badge).toEqual({ kind: 'cost', label: '0⬤', coins: 0, affordable: true });
  });

  it('NONE row badge is null when NONE is already the current selection', () => {
    const save = { ...defaultSave(), equipped: { ...defaultSave().equipped, weapon: null } };
    const rows = computeKindRows({ config: WEAPON_SYSTEM, save, playerStars: 0 }, null);
    const none = rows.find((r) => r.isNoneRow);
    expect(none?.rowState).toBe('equipped');
    expect(none?.badge).toBeNull();
  });
});

describe('computeKindRows — tap targets', () => {
  it('not owned: tap target is always Lv1', () => {
    const save = { ...defaultSave(), coins: 5000 };
    const rows = computeKindRows({ config: WEAPON_SYSTEM, save, playerStars: 0 }, null);
    const ion = rows.find((r) => r.kind === 'ion');
    expect(ion?.tap.mutation).toEqual({ type: 'switch-item', itemId: 'ion-1' });
  });

  it('previously equipped at a higher level: switching back still targets Lv1, not the old level', () => {
    let save = { ...defaultSave(), coins: 10000 };
    save = switchItem(save, 'ion-2'); // equip ion at Lv2 (6550)
    save = switchItem(save, 'pulse-1'); // switch to pulse — ion-2 is gone, nothing remembers Lv2
    const rows = computeKindRows({ config: WEAPON_SYSTEM, save, playerStars: 20 }, 'pulse');
    const ion = rows.find((r) => r.kind === 'ion');
    expect(ion?.rowState).toBe('purchasable');
    expect(ion?.tap.mutation).toEqual({ type: 'switch-item', itemId: 'ion-1' });
  });
});

describe('computeKindRowTrace — debug cost breakdown', () => {
  it('exposes every intermediate value the badge/rowState math is built from', () => {
    let save = { ...defaultSave(), coins: 5000 };
    save = switchItem(save, 'ion-1'); // equip ion-1 (3000)
    const trace = computeKindRowTrace({ config: WEAPON_SYSTEM, save, kind: 'scatter', playerStars: 20 });
    expect(trace).toEqual({
      kind: 'scatter',
      equippedLevel: 0,
      equipped: false,
      starsNeeded: 5,
      locked: false,
      targetLevel: 1,
      entryPrice: 1200,
      equippedPriceValue: 3000,
      netCost: -1800,
      affordable: true,
      displayLevel: 1,
    });
  });

  it('does not special-case a kind that was previously equipped — netCost is always the plain trade-in formula', () => {
    let save = { ...defaultSave(), coins: 10000 };
    save = switchItem(save, 'ion-2'); // equip ion at Lv2 (6550)
    save = switchItem(save, 'pulse-1'); // switch to pulse (100) — ion-2 is gone
    const trace = computeKindRowTrace({ config: WEAPON_SYSTEM, save, kind: 'ion', playerStars: 0 });
    expect(trace.targetLevel).toBe(1); // always Lv1 for a kind that isn't currently equipped
    expect(trace.entryPrice).toBe(3000); // ion-1's price, not ion-2's 6550
    expect(trace.netCost).toBe(2900); // 3000 - pulse-1's 100 — no discount for having owned it before
    expect(trace.affordable).toBe(true);
  });

  it('the trace is exactly what computeKindRow/computeKindBadge derive their output from — no drift possible', () => {
    const save = { ...defaultSave(), coins: 10 };
    const trace = computeKindRowTrace({ config: WEAPON_SYSTEM, save, kind: 'ion', playerStars: 20 });
    const rows = computeKindRows({ config: WEAPON_SYSTEM, save, playerStars: 20 }, null);
    const ionRow = rows.find((r) => r.kind === 'ion');
    expect(ionRow?.badge).toEqual({ kind: 'cost', label: `-${String(trace.netCost)}⬤`, coins: trace.netCost, affordable: trace.affordable });
  });
});

describe('reachable-state matrix corrections', () => {
  it('rear-weapon: after unequip, switching to a different kind pays its full price — nothing is remembered as owned', () => {
    let save = { ...defaultSave(), coins: 5000 };
    save = switchRearWeapon(save, 'grenade-3'); // cost 690
    save = switchRearWeapon(save, null); // unequip via NONE, refunds 690
    const rows = computeKindRows({ config: REAR_WEAPON_SYSTEM, save, playerStars: 15 }, null);
    const flak = rows.find((r) => r.kind === 'flak'); // flak-1 price 890
    expect(flak?.rowState).toBe('purchasable');
    expect(flak?.badge).toEqual({ kind: 'cost', label: '-890⬤', coins: 890, affordable: true });
  });

  it('rear-weapon: non-starter kinds are locked at 0 stars now that star gates ramp per kind', () => {
    const save = defaultSave(); // 0 stars
    const rows = computeKindRows({ config: REAR_WEAPON_SYSTEM, save, playerStars: 0 }, null);
    const grenade = rows.find((r) => r.kind === 'grenade');
    const cluster = rows.find((r) => r.kind === 'cluster');
    expect(grenade?.rowState).not.toBe('locked'); // starter kind, 0★ at Lv1
    expect(cluster?.rowState).toBe('locked'); // cluster-1 requires 5★
  });
});

describe('cross-system consistency', () => {
  it('weapon, rear-weapon, and shield all produce a NONE row as the first entry', () => {
    const save = defaultSave();
    for (const config of [WEAPON_SYSTEM, REAR_WEAPON_SYSTEM, SHIELD_SYSTEM]) {
      const rows = computeKindRows({ config, save, playerStars: 0 }, null);
      expect(rows[0]?.isNoneRow).toBe(true);
    }
  });

  it('generator and motor have no NONE row', () => {
    const save = defaultSave();
    for (const config of [GENERATOR_SYSTEM, MOTOR_SYSTEM]) {
      const rows = computeKindRows({ config, save, playerStars: 0 }, null);
      expect(rows.every((r) => !r.isNoneRow)).toBe(true);
    }
  });

  it('ship iconScale is fixed at 0.6 for every level; other systems scale with level', () => {
    expect(SHIP_SYSTEM.iconScale(1)).toBe(0.6);
    expect(SHIP_SYSTEM.iconScale(5)).toBe(0.6);
    expect(WEAPON_SYSTEM.iconScale(1)).toBeCloseTo(1.2);
    expect(WEAPON_SYSTEM.iconScale(5)).toBeCloseTo(1.2 + 4 * 0.07);
  });
});

describe('computeLevelChips', () => {
  it('equipped level: state equipped, mutation null', () => {
    const save = defaultSave();
    const chips = computeLevelChips({ config: WEAPON_SYSTEM, save, kind: 'pulse', playerStars: 0 });
    expect(chips[0]).toMatchObject({ itemId: 'pulse-1', state: 'equipped', mutation: null });
  });

  it('locked: state locked, subLabel is the star requirement', () => {
    const save = defaultSave(); // 0 stars
    const chips = computeLevelChips({ config: WEAPON_SYSTEM, save, kind: 'pulse', playerStars: 0 });
    const lv3 = chips.find((c) => c.itemId === 'pulse-3'); // starsRequired 2
    expect(lv3?.state).toBe('locked');
    expect(lv3?.subLabel).toBe('★2');
  });

  it('refund: a different kind cheaper than the currently equipped item', () => {
    let save = { ...defaultSave(), coins: 5000 };
    save = switchItem(save, 'ion-1'); // equip ion-1 (3000)
    const chips = computeLevelChips({ config: WEAPON_SYSTEM, save, kind: 'scatter', playerStars: 100 });
    const scatter1 = chips.find((c) => c.itemId === 'scatter-1'); // price 1200 < 3000
    expect(scatter1?.state).toBe('refund');
    expect(scatter1?.subLabel).toBe('+1800⬤');
  });

  it('purchasable vs unaffordable', () => {
    const richSave = { ...defaultSave(), coins: 5000 };
    const poorSave = { ...defaultSave(), coins: 0 };
    const richChip = computeLevelChips({ config: WEAPON_SYSTEM, save: richSave, kind: 'pulse', playerStars: 100 }).find((c) => c.itemId === 'pulse-2');
    const poorChip = computeLevelChips({ config: WEAPON_SYSTEM, save: poorSave, kind: 'pulse', playerStars: 100 }).find((c) => c.itemId === 'pulse-2');
    expect(richChip?.state).toBe('purchasable');
    expect(poorChip?.state).toBe('unaffordable');
  });
});

// A price tie within a system would let a switch land on a coincidental net-zero
// cost that isn't a genuine price match — the earlier "switching is free" bug came
// from exactly this. These invariants guard the whole catalog, not just one pair.
describe('price and star table invariants', () => {
  const ALL_SYSTEMS = [WEAPON_SYSTEM, REAR_WEAPON_SYSTEM, SIDE_WEAPON_SYSTEM, SHIELD_SYSTEM, GENERATOR_SYSTEM, MOTOR_SYSTEM, SHIP_SYSTEM];

  it('every price within a system is unique across all kinds and levels', () => {
    for (const config of ALL_SYSTEMS) {
      const prices = config.kinds.flatMap((kind) =>
        Array.from({ length: config.maxLevel }, (_, i) => config.itemPrice(kind, i + 1)));
      expect(new Set(prices).size).toBe(prices.length);
    }
  });

  it('every kind\'s price and star requirement strictly increase level to level', () => {
    for (const config of ALL_SYSTEMS) {
      for (const kind of config.kinds) {
        for (let level = 2; level <= config.maxLevel; level++) {
          expect(config.itemPrice(kind, level)).toBeGreaterThan(config.itemPrice(kind, level - 1));
          expect(config.itemStarsRequired(kind, level)).toBeGreaterThan(config.itemStarsRequired(kind, level - 1));
        }
      }
    }
  });
});

describe('computeLoadoutRows', () => {
  it('all slots show "Name LvN" with no space before the digit', () => {
    const save = defaultSave();
    const { rows } = computeLoadoutRows(save);
    const ship = rows.find((r) => r.slotLabel === 'SHIP');
    expect(ship?.itemName).toMatch(/Lv\d+$/);
    expect(ship?.itemName).not.toMatch(/Lv\s+\d/);
  });

  it('unequipped optional slots are marked empty', () => {
    let save = defaultSave();
    save = { ...save, equipped: { ...save.equipped, weapon: null } };
    const { rows } = computeLoadoutRows(save);
    const weapon = rows.find((r) => r.slotLabel === 'FRONT WEAPON');
    expect(weapon?.empty).toBe(true);
    expect(weapon?.itemName).toBe('None');
  });

  it('totalShipValue equals the sum of all row prices', () => {
    const save = defaultSave();
    const { rows, totalShipValue } = computeLoadoutRows(save);
    expect(totalShipValue).toBe(rows.reduce((sum, r) => sum + r.price, 0));
  });

  it('every equipped slot has a non-empty icon key; empty slots (e.g. no rear weapon by default) do not', () => {
    const save = defaultSave();
    const { rows } = computeLoadoutRows(save);
    for (const row of rows) {
      expect(row.iconKey === '').toBe(row.empty);
    }
  });

  it('an unequipped optional slot has a blank icon key', () => {
    let save = defaultSave();
    save = { ...save, equipped: { ...save.equipped, weapon: null } };
    const { rows } = computeLoadoutRows(save);
    const weapon = rows.find((r) => r.slotLabel === 'FRONT WEAPON');
    expect(weapon?.iconKey).toBe('');
  });
});

describe('computeCumulativeCost', () => {
  const sub = SUBSCRIPTIONS['sub-offensive'];
  if (sub === undefined) throw new Error('sub-offensive must exist in the catalog');

  it('Lv0 → Lv1 costs exactly level 1s price', () => {
    expect(computeCumulativeCost(sub, 0, 1)).toBe(sub.levels[0].price);
  });

  it('Lv0 → Lv3 costs the sum of all three levels', () => {
    const expected = sub.levels[0].price + sub.levels[1].price + sub.levels[2].price;
    expect(computeCumulativeCost(sub, 0, 3)).toBe(expected);
  });

  it('Lv3 → Lv1 refunds levels 2 and 3 (negated)', () => {
    const expected = -(sub.levels[1].price + sub.levels[2].price);
    expect(computeCumulativeCost(sub, 3, 1)).toBe(expected);
  });

  it('same level costs nothing', () => {
    expect(computeCumulativeCost(sub, 2, 2)).toBe(0);
  });
});

describe('computeDispatch', () => {
  it('no subscription selected: empty chips and cards, single page', () => {
    const save = defaultSave();
    const result = computeDispatch(save, uiState({ selectedSubscriptionId: null }), 0);
    expect(result.subLevelChips).toEqual([]);
    expect(result.cards).toEqual([]);
    expect(result.totalPages).toBe(1);
  });

  it('selecting sub-basic (permanent, always Lv1) marks the current chip and pagination', () => {
    const save = defaultSave(); // ownedSubscriptions: { 'sub-basic': 1 }
    const result = computeDispatch(save, uiState({ selectedSubscriptionId: 'sub-basic' }), 0);
    expect(result.subscriptions.find((s) => s.id === 'sub-basic')?.ownedLevel).toBe(1);
    expect(result.subLevelChips[0]).toMatchObject({ level: 1, state: 'current' });
    expect(result.page).toBeGreaterThanOrEqual(1);
    expect(result.page).toBeLessThanOrEqual(result.totalPages);
  });

  it('card accessible iff levelRequired <= ownedLevel', () => {
    const save = defaultSave();
    const result = computeDispatch(save, uiState({ selectedSubscriptionId: 'sub-basic' }), 0);
    for (const card of result.cards) {
      expect(card.accessible).toBe(card.levelRequired <= 1);
    }
  });
});

describe('computeSupplies', () => {
  it('canBuy requires both under max charges and enough coins', () => {
    const save = { ...defaultSave(), coins: 0 };
    const supplies = computeSupplies(save);
    expect(supplies.every((s) => !s.canBuy)).toBe(true);
  });

  it('canSell is false when no charges are owned', () => {
    const save = defaultSave();
    const supplies = computeSupplies(save);
    expect(supplies.every((s) => !s.canSell)).toBe(true);
  });
});

describe('computeSettings', () => {
  it('devMode is true unless explicitly false', () => {
    const save = defaultSave();
    expect(computeSettings(save, false, false).devMode).toBe(true);
    expect(computeSettings({ ...save, devMode: false }, false, false).devMode).toBe(false);
  });

  it('musicMuted/sfxMuted pass through the given values', () => {
    const save = defaultSave();
    expect(computeSettings(save, true, false)).toEqual({ musicMuted: true, sfxMuted: false, devMode: true });
  });
});

describe('computeGalaxyMap / computeMissionDetail', () => {
  it('m1 is unlocked from the start; m3 is locked', () => {
    const save = defaultSave();
    const map = computeGalaxyMap(save, null);
    expect(map.missions.find((m) => m.id === 'm1')?.unlocked).toBe(true);
    expect(map.missions.find((m) => m.id === 'm3')?.unlocked).toBe(false);
  });

  it('a locked mission shows "???" as its label', () => {
    const save = defaultSave();
    const map = computeGalaxyMap(save, null);
    expect(map.missions.find((m) => m.id === 'm3')?.label).toBe('???');
  });

  it('missionDetail is null when nothing is selected', () => {
    const save = defaultSave();
    expect(computeMissionDetail(save, null)).toBeNull();
  });

  it('tutorial missions have no star list', () => {
    const save = defaultSave();
    const detail = computeMissionDetail(save, 't1');
    expect(detail?.isTutorial).toBe(true);
    expect(detail?.stars).toEqual([]);
  });

  it('a non-tutorial mission lists its stars with descriptions', () => {
    const save = defaultSave();
    const detail = computeMissionDetail(save, 'm1');
    expect(detail?.isTutorial).toBe(false);
    expect(detail?.stars.length).toBeGreaterThan(0);
    expect(detail?.stars[0]?.description).toBeTruthy();
  });
});

