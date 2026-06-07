// MissionSelectScene.ts
// Daily challenge card at top; TreeCanvas mission map below; info panel at bottom.

import Phaser from 'phaser';
import { NavBar }         from '../ui/NavBar.js';
import { TreeCanvas }     from '../ui/TreeCanvas.js';
import type { TreeNode, TreeEdge, NodeState, EdgeState } from '../ui/TreeCanvas.js';
import { SaveManager }    from '../SaveManager.js';
import { MISSIONS, isMissionUnlocked } from '../data/missions.js';
import { DAILY_MISSION_ID, utcDateString } from '../data/daily.js';
import { MISSION_BRIEFINGS } from '../data/story.js';
import type { SaveData }  from '../SaveManager.js';
import type { MissionDefinition } from '../data/missions.js';

// ─── layout ──────────────────────────────────────────────────────────────────
const DAILY_H     = 76;   // daily card total height
const INFO_H      = 68;   // mission info panel at bottom
const MAP_TOP     = DAILY_H + 8;   // y where TreeCanvas starts

// Each mission uses a fixed accent color in the map.
const MISSION_COLOR: Record<string, number> = {
  tutorial:  0x00ffaa,
  mission_1: 0x00aaff,
  mission_2: 0xff8844,
  mission_3: 0xff2244,
};

export class MissionSelectScene extends Phaser.Scene {
  private selectedMission: MissionDefinition | null = null;

  private infoBg!:        Phaser.GameObjects.Rectangle;
  private infoNameText!:  Phaser.GameObjects.Text;
  private infoStarsText!: Phaser.GameObjects.Text;
  private infoDescText!:  Phaser.GameObjects.Text;
  private infoPlayBg!:    Phaser.GameObjects.Rectangle;
  private infoPlayText!:  Phaser.GameObjects.Text;

  constructor() { super({ key: 'MissionSelectScene' }); }

  // fallow-ignore-next-line unused-class-member
  create(): void {
    const { width: W, height: H } = this.scale;
    const save = SaveManager.load();

    this.add.rectangle(W / 2, H / 2, W, H, 0x060606);

    this.addTitle(W);
    this.addCoinCounter(W, save.coins);
    this.buildDailyCard(W, save);
    this.buildInfoPanel(W, H, save);

    const treeVH = H - NavBar.HEIGHT - INFO_H - MAP_TOP;
    const { nodes, edges } = this.buildMapData(save);
    new TreeCanvas(this, 0, MAP_TOP, W, treeVH, nodes, edges, (id) => this.onMissionTapped(id, save));

    new NavBar(this);
  }

  // ─── title + coin ────────────────────────────────────────────────────────────

  private addTitle(W: number): void {
    this.add.text(W / 2, 14, 'MISSIONS', {
      fontSize: '13px', color: '#555555', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);
  }

  private addCoinCounter(W: number, coins: number): void {
    this.add.text(W - 14, 4, `◈ ${coins}`, {
      fontSize: '13px', color: '#ffcc00', fontFamily: 'monospace',
    }).setOrigin(1, 0);
  }

  // ─── daily card ──────────────────────────────────────────────────────────────

  private isDailyAvailable(save: SaveData): boolean {
    if (!save.daily) return true;
    return save.daily.date !== utcDateString() || !save.daily.attempted;
  }

  private buildDailyCard(W: number, save: SaveData): void {
    const available   = this.isDailyAvailable(save);
    const cardY       = 28 + DAILY_H / 2;
    const cardH       = DAILY_H - 8;
    const borderColor = available ? 0xffaa00 : 0x332200;
    const bgColor     = available ? 0x1a1000 : 0x0d0a00;

    this.add.rectangle(W / 2, cardY, W - 16, cardH, bgColor)
      .setStrokeStyle(1, borderColor);

    this.add.text(16, cardY - cardH / 2 + 8, '⚡ DAILY CHALLENGE', {
      fontSize: '10px', color: available ? '#ffaa00' : '#443300', fontFamily: 'monospace',
    });

    if (available) {
      this.add.text(16, cardY - 2, 'Endless survival · one attempt today', {
        fontSize: '9px', color: '#775500', fontFamily: 'monospace',
      });

      const playBtn = this.add.text(W - 20, cardY + 2, 'PLAY ▶', {
        fontSize: '11px', color: '#ffaa00', fontFamily: 'monospace',
      }).setOrigin(1, 0.5);

      const hit = this.add.rectangle(W / 2, cardY, W - 16, cardH, 0x000000, 0)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerover', () => playBtn.setColor('#ffdd88'));
      hit.on('pointerout',  () => playBtn.setColor('#ffaa00'));
      hit.on('pointerdown', () => this.scene.start('GameScene', { missionId: DAILY_MISSION_ID }));
    } else {
      const rec = save.daily!;
      this.add.text(16, cardY - 4, `Waves cleared: ${rec.wavesCleared}  ·  +${rec.coinsEarned} ◈`, {
        fontSize: '9px', color: '#554400', fontFamily: 'monospace',
      });
      this.add.text(16, cardY + 10, 'Come back tomorrow!', {
        fontSize: '8px', color: '#332200', fontFamily: 'monospace',
      });
      this.add.text(W - 20, cardY, '🔒', { fontSize: '14px' }).setOrigin(1, 0.5);
    }
  }

  // ─── map data ─────────────────────────────────────────────────────────────────

  private buildMapData(save: SaveData): { nodes: TreeNode[]; edges: TreeEdge[] } {
    const nodes: TreeNode[] = [];
    const edges: TreeEdge[] = [];
    const missionList = Object.values(MISSIONS);

    for (const mission of missionList) {
      const record    = save.missions[mission.id];
      const bestStars = record?.bestStars ?? 0;
      const completed = bestStars > 0;
      const unlocked  = isMissionUnlocked(mission.id, save.missions);
      const playable  = unlocked || completed;

      let state: NodeState;
      if (!playable)       state = 'locked';
      else if (completed)  state = 'owned';
      else                 state = 'available';

      const starStr = bestStars > 0 ? `★ ${bestStars}/3` : '☐ ☐ ☐';

      nodes.push({
        id:         mission.id,
        x:          mission.mapX,
        y:          mission.mapY,
        isKeystone: true,
        state,
        label:      mission.name,
        sublabel:   starStr,
        color:      MISSION_COLOR[mission.id] ?? 0x888888,
      });
    }

    // Draw edges based on mapConnectsTo.
    for (const mission of missionList) {
      for (const childId of mission.mapConnectsTo) {
        const parentRecord = save.missions[mission.id];
        const childRecord  = save.missions[childId];
        const parentDone   = (parentRecord?.bestStars ?? 0) > 0;
        const childDone    = (childRecord?.bestStars ?? 0) > 0;
        const edgeState: EdgeState = childDone ? 'gold' : parentDone ? 'lit' : 'dim';
        edges.push({ fromId: mission.id, toId: childId, state: edgeState });
      }
    }

    return { nodes, edges };
  }

  // ─── mission tap ─────────────────────────────────────────────────────────────

  private onMissionTapped(missionId: string, save: SaveData): void {
    const mission = MISSIONS[missionId];
    if (!mission) return;
    this.selectedMission = mission;
    this.refreshInfoPanel(mission, save);
  }

  // ─── info panel ──────────────────────────────────────────────────────────────

  private buildInfoPanel(W: number, H: number, save: SaveData): void {
    const panelY = H - NavBar.HEIGHT - INFO_H / 2;

    this.infoBg = this.add.rectangle(W / 2, panelY, W, INFO_H, 0x0d0d0d)
      .setStrokeStyle(1, 0x1e1e1e).setDepth(5);

    this.infoNameText = this.add.text(14, panelY - INFO_H / 2 + 8, 'Tap a mission to select', {
      fontSize: '12px', color: '#444444', fontFamily: 'monospace', fontStyle: 'bold',
    }).setDepth(6);

    this.infoStarsText = this.add.text(14, panelY - INFO_H / 2 + 24, '', {
      fontSize: '11px', color: '#888800', fontFamily: 'monospace',
    }).setDepth(6);

    this.infoDescText = this.add.text(14, panelY - INFO_H / 2 + 40, '', {
      fontSize: '9px', color: '#444444', fontFamily: 'monospace',
      wordWrap: { width: W - 170 },
    }).setDepth(6);

    const btnX = W - 70;
    const btnY = panelY;
    this.infoPlayBg = this.add.rectangle(btnX, btnY, 120, 32, 0x111111)
      .setStrokeStyle(1, 0x222222)
      .setInteractive({ useHandCursor: false })
      .setDepth(6);

    this.infoPlayText = this.add.text(btnX, btnY, '', {
      fontSize: '11px', color: '#333333', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(7);

    this.infoPlayBg.on('pointerdown', () => {
      if (!this.selectedMission) return;
      this.scene.start('GameScene', { missionId: this.selectedMission.id });
    });

    void save;
  }

  private refreshInfoPanel(mission: MissionDefinition, save: SaveData): void {
    const record    = save.missions[mission.id];
    const bestStars = record?.bestStars ?? 0;
    const unlocked  = isMissionUnlocked(mission.id, save.missions);
    const completed = bestStars > 0;
    const playable  = unlocked || completed;

    this.infoNameText.setText(mission.name.toUpperCase());
    this.infoNameText.setColor(playable ? '#aaaaaa' : '#444444');

    this.infoStarsText.setText(
      bestStars > 0
        ? `★ ${bestStars}/3 stars`
        : 'not yet cleared',
    );

    const briefing = MISSION_BRIEFINGS[mission.id];
    this.infoDescText.setText(briefing ? `"${briefing}"` : mission.description);

    if (!playable) {
      const reqs = Object.entries(mission.unlockRequires ?? {})
        .map(([id, stars]) => `${MISSIONS[id].name} ★${stars}`)
        .join('  ·  ');
      this.infoPlayText.setText(`Locked: need ${reqs}`);
      this.infoPlayText.setColor('#333333');
      this.infoPlayBg.setFillStyle(0x0d0d0d).disableInteractive();
    } else {
      const label = completed ? 'REPLAY ▶' : 'PLAY ▶';
      const color = completed ? '#aaaaff' : '#00ffcc';
      this.infoPlayText.setText(label);
      this.infoPlayText.setColor(color);
      this.infoPlayBg.setFillStyle(0x111122).setInteractive({ useHandCursor: true });
    }
  }
}
