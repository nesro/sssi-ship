import Phaser from 'phaser';
import type { MissionResult } from '../core/result';
import { persistSave } from '../save/SaveManager';
import type { SaveData } from '../save/SaveManager';
import { computeResultViewModel } from '../viewmodel/result';
import type { ResultViewModel, StarResultViewModel } from '../viewmodel/result';
import { cssColor, PALETTE } from './palette';
import { fontPx, px, SCREEN_WIDTH } from './layout';
import { addLabel, addTextButton, drawDevBorder, UI_FONT } from './widgets';

export interface ResultSceneData {
  result: MissionResult;
  newStarIds: string[];
  save: SaveData;
  /** Daily-mission-only — CombatScene passes SaveManager.applyDailyResult's actual
   * output through unchanged so this scene never needs to know DAILY_COIN_MULT itself. */
  dailyBonus?: { coinsAwarded: number; isNewBest: boolean };
  /** Daily-mission-only — true iff this result came from the player voluntarily tapping
   * ABANDON (confirmAbandon) rather than a real hull-zero defeat (the only other source
   * of a 'defeat' status). See computeResultViewModel's `outcome` field, which this flag
   * feeds. */
  wasAbandoned?: boolean;
}

const TITLE_BY_OUTCOME: Record<ResultViewModel['outcome'], string> = {
  victory: 'MISSION COMPLETE', defeat: 'SHIP DESTROYED', abandoned: 'MISSION ABANDONED',
};
const TITLE_COLOR_BY_OUTCOME: Record<ResultViewModel['outcome'], number> = {
  victory: PALETTE.weaponCyan, defeat: PALETTE.enemyRed, abandoned: PALETTE.generatorAmber,
};

/** Post-mission summary: stars (new vs repeat), coins, and the next move. */
export class ResultScene extends Phaser.Scene {
  constructor() {
    super('ResultScene');
  }

  // fallow-ignore-next-line unused-class-member
  create(data: ResultSceneData): void {
    drawDevBorder(this, data.save);
    const { result, newStarIds, save, dailyBonus, wasAbandoned } = data;
    const vm = computeResultViewModel(result, newStarIds, dailyBonus, wasAbandoned);

    this.add
      .text(SCREEN_WIDTH / 2, px(70), TITLE_BY_OUTCOME[vm.outcome], {
        fontFamily: UI_FONT,
        fontSize: `${String(fontPx(30))}px`,
        color: cssColor(TITLE_COLOR_BY_OUTCOME[vm.outcome]),
      })
      .setOrigin(0.5);

    const lines = [
      `${vm.missionName} — ${vm.durationLabel}`,
      '',
      `COINS EARNED   +${String(vm.coinsEarned)}`,
      ...(vm.daily?.isNewBest === true ? ['NEW BEST!'] : []),
      `KILLS          ${vm.killsLine}`,
      `HULL           ${String(vm.hullPercent)}%`,
      '',
      ...(vm.isTutorial ? ['TRAINING MISSION', 'No stars awarded'] : starLines(vm.stars)),
    ];
    addLabel(this, {
      x: SCREEN_WIDTH / 2 - px(220),
      y: px(120),
      text: lines.join('\n'),
      color: PALETTE.hullWhite,
      size: 16,
    });

    const buttonY = px(460);

    if (vm.buttons.kind === 'w0-branch') {
      addLabel(this, {
        x: SCREEN_WIDTH / 2, y: px(390),
        text: 'WHERE DO YOU WANT TO START?',
        color: PALETTE.generatorAmber, size: 14,
      });
      addTextButton(this, {
        x: SCREEN_WIDTH / 2 - px(140), y: buttonY, label: 'TUTORIAL',
        color: PALETTE.generatorAmber, size: 16,
        onClick: () => {
          persistSave({ ...save, firstBranchChoice: 'tutorial' });
          this.scene.start('HubScene');
        },
      });
      addTextButton(this, {
        x: SCREEN_WIDTH / 2 + px(140), y: buttonY, label: 'EXPLORE',
        color: PALETTE.weaponCyan, size: 16,
        onClick: () => {
          persistSave({ ...save, firstBranchChoice: 'missions' });
          this.scene.start('HubScene');
        },
      });
      return;
    }

    if (vm.buttons.kind === 'daily') {
      // No RETRY — one attempt per day, and CombatScene's own missionId==='daily'
      // guard would refuse to start a second run today anyway (defense in depth, not
      // relied on here: this button simply doesn't exist for the daily).
      addTextButton(this, {
        x: SCREEN_WIDTH / 2, y: buttonY, label: 'MISSIONS',
        color: PALETTE.hullWhite,
        onClick: () => { this.scene.start('HubScene'); },
      });
      return;
    }

    // nextMissionId is computed in computeResultViewModel (Phase C, moved out of this
    // scene — the graph-walking logic is now tested there, see result.test.ts).
    const buttons: { label: string; color: number; onClick: () => void }[] = [];
    if (vm.nextMissionId !== null) {
      const nextMissionId = vm.nextMissionId;
      buttons.push({
        label: 'NEXT MISSION ▸', color: PALETTE.generatorAmber,
        onClick: () => { this.scene.start('CombatScene', { missionId: nextMissionId }); },
      });
    }
    buttons.push(
      { label: 'RETRY', color: PALETTE.weaponCyan, onClick: () => { this.scene.start('CombatScene', { missionId: result.missionId }); } },
      { label: 'MISSIONS', color: PALETTE.hullWhite, onClick: () => { this.scene.start('HubScene'); } },
      { label: 'SHOP', color: PALETTE.motorMagenta, onClick: () => { this.scene.start('HubScene', { initialNav: 'shop' }); } },
    );
    const gap = px(170);
    const startX = SCREEN_WIDTH / 2 - (buttons.length - 1) * gap / 2;
    buttons.forEach((b, i) => {
      addTextButton(this, { x: startX + i * gap, y: buttonY, label: b.label, color: b.color, onClick: b.onClick });
    });
  }
}

function starLines(stars: StarResultViewModel[]): string[] {
  return stars.map((star) => {
    if (star.state === 'new') return `★ ${star.shortName}  NEW!`;
    if (star.state === 'earned') return `★ ${star.shortName}`;
    return `☆ ${star.shortName}`;
  });
}
