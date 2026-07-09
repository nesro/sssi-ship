import Phaser from 'phaser';
import type { MissionResult } from '../core/result';
import { persistSave } from '../save/SaveManager';
import type { SaveData } from '../save/SaveManager';
import { computeResultViewModel } from '../viewmodel/result';
import type { StarResultViewModel } from '../viewmodel/result';
import { cssColor, PALETTE } from './palette';
import { fontPx, px, SCREEN_WIDTH } from './layout';
import { addLabel, addTextButton, drawDevBorder, UI_FONT } from './widgets';

export interface ResultSceneData {
  result: MissionResult;
  newStarIds: string[];
  save: SaveData;
}

/** Post-mission summary: stars (new vs repeat), coins, and the next move. */
export class ResultScene extends Phaser.Scene {
  constructor() {
    super('ResultScene');
  }

  // fallow-ignore-next-line unused-class-member
  create(data: ResultSceneData): void {
    drawDevBorder(this, data.save);
    const { result, newStarIds, save } = data;
    const vm = computeResultViewModel(result, newStarIds);
    const victory = vm.status === 'victory';

    this.add
      .text(SCREEN_WIDTH / 2, px(70), victory ? 'MISSION COMPLETE' : 'SHIP DESTROYED', {
        fontFamily: UI_FONT,
        fontSize: `${String(fontPx(30))}px`,
        color: cssColor(victory ? PALETTE.weaponCyan : PALETTE.enemyRed),
      })
      .setOrigin(0.5);

    const lines = [
      `${vm.missionName} — ${vm.durationLabel}`,
      '',
      `COINS EARNED   +${String(vm.coinsEarned)}`,
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

    addTextButton(this, {
      x: SCREEN_WIDTH / 2 - px(160), y: buttonY, label: 'RETRY',
      color: PALETTE.weaponCyan,
      onClick: () => { this.scene.start('CombatScene', { missionId: result.missionId }); },
    });
    addTextButton(this, {
      x: SCREEN_WIDTH / 2, y: buttonY, label: 'MISSIONS',
      color: PALETTE.hullWhite,
      onClick: () => { this.scene.start('HubScene'); },
    });
    addTextButton(this, {
      x: SCREEN_WIDTH / 2 + px(160), y: buttonY, label: 'SHOP',
      color: PALETTE.motorMagenta,
      onClick: () => { this.scene.start('HubScene'); },
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
