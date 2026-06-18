import Phaser from 'phaser';
import { TICKS_PER_SECOND } from '../core/constants';
import type { MissionResult } from '../core/result';
import { missionById } from '../data/missions';
import { cssColor, PALETTE } from './palette';
import { fontPx, px, SCREEN_WIDTH } from './layout';
import { addLabel, addTextButton, UI_FONT } from './widgets';

export interface ResultSceneData {
  result: MissionResult;
  newStarIds: string[];
}

/** Post-mission summary: stars (new vs repeat), coins, and the next move. */
export class ResultScene extends Phaser.Scene {
  constructor() {
    super('ResultScene');
  }

  // fallow-ignore-next-line unused-class-member
  create(data: ResultSceneData): void {
    const { result, newStarIds } = data;
    const mission = missionById(result.missionId);
    const victory = result.status === 'victory';

    this.add
      .text(SCREEN_WIDTH / 2, px(70), victory ? 'MISSION COMPLETE' : 'SHIP DESTROYED', {
        fontFamily: UI_FONT,
        fontSize: `${String(fontPx(30))}px`,
        color: cssColor(victory ? PALETTE.weaponCyan : PALETTE.enemyRed),
      })
      .setOrigin(0.5);

    const seconds = (result.durationTicks / TICKS_PER_SECOND).toFixed(1);
    const isTutorial = mission.forcedLoadout !== undefined;
    const lines = [
      `${mission.name} — ${seconds}s`,
      '',
      `COINS EARNED   +${String(result.coins)}`,
      `KILLS          ${String(result.weaponKills)}/${String(result.spawned)}` +
        (result.collisions > 0 ? `   (${String(result.collisions)} collided)` : ''),
      `HULL           ${String(Math.round(result.hullFraction * 100))}%`,
      '',
      ...(isTutorial
        ? ['TRAINING MISSION', 'No stars awarded']
        : starLines(mission.stars.map((s) => s.id), result.earnedStarIds, newStarIds)),
    ];
    addLabel(this, {
      x: SCREEN_WIDTH / 2 - px(220),
      y: px(120),
      text: lines.join('\n'),
      color: PALETTE.hullWhite,
      size: 16,
    });

    const buttonY = px(460);
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

function starLines(allIds: string[], earnedNow: string[], newIds: string[]): string[] {
  return allIds.map((id) => {
    const shortName = id.split('-').slice(1).join('-').toUpperCase();
    if (newIds.includes(id)) return `★ ${shortName}  NEW!`;
    if (earnedNow.includes(id)) return `★ ${shortName}`;
    return `☆ ${shortName}`;
  });
}
