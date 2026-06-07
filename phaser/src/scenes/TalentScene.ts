// TalentScene.ts
// PoE-style talent tree: all branches visible at once in a pannable 2D canvas.
// Tap a node to inspect it; tap UNLOCK to spend stars.

import Phaser from 'phaser';
import type { SaveData } from '../SaveManager.js';
import type { TalentNode } from '../data/talents.js';
import { NavBar }       from '../ui/NavBar.js';
import { TreeCanvas }   from '../ui/TreeCanvas.js';
import type { TreeNode, TreeEdge, NodeState, EdgeState } from '../ui/TreeCanvas.js';
import { SaveManager }  from '../SaveManager.js';
import { TALENT_TREE, talentLevel, nextLevelCost, starsSpentOnNode } from '../data/talents.js';

// ─── layout ──────────────────────────────────────────────────────────────────
const HEADER_H  = 28;   // star balance row
const INFO_H    = 88;   // bottom info panel
const RESPEC_H  = 26;   // respec button

export class TalentScene extends Phaser.Scene {
  private selectedNode: TalentNode | null = null;

  private infoNameText!:  Phaser.GameObjects.Text;
  private infoDescText!:  Phaser.GameObjects.Text;
  private infoBtnBg!:     Phaser.GameObjects.Rectangle;
  private infoBtnText!:   Phaser.GameObjects.Text;

  constructor() { super({ key: 'TalentScene' }); }

  // fallow-ignore-next-line unused-class-member
  init(): void {
    this.selectedNode = null;
  }

  // fallow-ignore-next-line unused-class-member
  create(): void {
    const { width: W, height: H } = this.scale;
    const save = SaveManager.load();

    this.add.rectangle(W / 2, H / 2, W, H, 0x060606);

    this.buildHeader(W, save);

    const treeVY = HEADER_H;
    const treeVH = H - NavBar.HEIGHT - RESPEC_H - 4 - INFO_H - HEADER_H;

    const { nodes, edges } = this.buildTreeData(save);
    const tree = new TreeCanvas(
      this, 0, treeVY, W, treeVH,
      nodes, edges,
      (id) => this.onNodeTapped(id, save),
    );

    this.addBranchDecorations(tree.container, treeVH);
    this.buildInfoPanel(W, H, save);
    this.buildRespecButton(W, H, save);
    new NavBar(this);
  }

  // ─── header ──────────────────────────────────────────────────────────────────

  private buildHeader(W: number, save: SaveData): void {
    this.add.text(W / 2, HEADER_H / 2, 'TALENT TREE', {
      fontSize: '12px', color: '#666666', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add.text(W - 12, 4, `★ ${save.spendableStars}`, {
      fontSize: '12px', color: '#ffcc00', fontFamily: 'monospace',
    }).setOrigin(1, 0);
  }

  // ─── branch decorations (added to TreeCanvas container) ──────────────────────

  private addBranchDecorations(container: Phaser.GameObjects.Container, treeVH: number): void {
    for (const branch of TALENT_TREE) {
      // Determine column bounds from node positions.
      const xs = branch.nodes.map(n => n.x);
      const colMin = Math.min(...xs) - 30;
      const colMax = Math.max(...xs) + 30;
      const colCX  = (colMin + colMax) / 2;

      // Subtle tinted background column.
      const bg = this.add.rectangle(colCX, treeVH / 2, colMax - colMin, treeVH - 4, branch.color, 0.03)
        .setOrigin(0.5);
      container.add(bg);

      // Branch label at top.
      const lbl = this.add.text(colCX, 8, branch.name.toUpperCase(), {
        fontSize: '9px', color: Phaser.Display.Color.IntegerToColor(branch.color).rgba,
        fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0.5, 0).setAlpha(0.6);
      container.add(lbl);
    }
  }

  // ─── tree data ────────────────────────────────────────────────────────────────

  private buildTreeData(save: SaveData): { nodes: TreeNode[]; edges: TreeEdge[] } {
    const nodes: TreeNode[] = [];
    const edges: TreeEdge[] = [];

    for (const branch of TALENT_TREE) {
      for (const node of branch.nodes) {
        const curLevel  = talentLevel(save.talents, node.id);
        const isOwned   = curLevel > 0;
        const isMaxed   = curLevel >= node.levels.length;
        const prereqMet = !node.requiresNode || talentLevel(save.talents, node.requiresNode) > 0;

        let state: NodeState;
        if (isMaxed)         state = 'maxed';
        else if (isOwned)    state = 'owned';
        else if (prereqMet)  state = 'available';
        else                 state = 'locked';

        const cost      = nextLevelCost(node, curLevel);
        const levelStr  = isMaxed ? '★ MAX' : `${curLevel}/${node.levels.length}`;

        nodes.push({
          id: node.id, x: node.x, y: node.y,
          isKeystone: node.isKeystone, state,
          label:      node.name,
          sublabel:   levelStr,
          costLabel:  cost !== null && !isMaxed ? `★${cost}` : undefined,
          color:      branch.color,
        });

        if (node.requiresNode) {
          const prereqLevel = talentLevel(save.talents, node.requiresNode);
          const edgeState: EdgeState =
            isOwned || isMaxed ? 'gold' : prereqLevel > 0 ? 'lit' : 'dim';
          edges.push({ fromId: node.requiresNode, toId: node.id, state: edgeState });
        }
      }
    }

    return { nodes, edges };
  }

  // ─── node tap ────────────────────────────────────────────────────────────────

  private onNodeTapped(nodeId: string, save: SaveData): void {
    const node = TALENT_TREE.flatMap(b => b.nodes).find(n => n.id === nodeId);
    if (!node) return;
    this.selectedNode = node;
    this.refreshInfoPanel(node, save);
  }

  // ─── info panel ──────────────────────────────────────────────────────────────

  private buildInfoPanel(W: number, H: number, save: SaveData): void {
    const panelY  = H - NavBar.HEIGHT - RESPEC_H - 4 - INFO_H / 2;
    const panelBG = this.add.rectangle(W / 2, panelY, W, INFO_H, 0x0d0d0d)
      .setStrokeStyle(1, 0x222222);
    panelBG.setDepth(5);

    this.infoNameText = this.add.text(12, panelY - INFO_H / 2 + 10, 'Tap a node to inspect', {
      fontSize: '12px', color: '#555555', fontFamily: 'monospace', fontStyle: 'bold',
    }).setDepth(6);

    this.infoDescText = this.add.text(12, panelY - INFO_H / 2 + 28, '', {
      fontSize: '10px', color: '#444444', fontFamily: 'monospace',
      wordWrap: { width: W - 170 },
    }).setDepth(6);

    const btnX = W - 78;
    const btnY = panelY + 4;
    this.infoBtnBg = this.add.rectangle(btnX, btnY, 140, 28, 0x1a1a1a)
      .setStrokeStyle(1, 0x333333)
      .setInteractive({ useHandCursor: false })
      .setDepth(6);

    this.infoBtnText = this.add.text(btnX, btnY, '', {
      fontSize: '10px', color: '#333333', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(7);

    this.infoBtnBg.on('pointerdown', () => {
      if (!this.selectedNode) return;
      const freshSave = SaveManager.load();
      const node      = this.selectedNode;
      const curLevel  = talentLevel(freshSave.talents, node.id);
      const cost      = nextLevelCost(node, curLevel);
      if (cost === null || freshSave.spendableStars < cost) return;
      if (node.requiresNode && talentLevel(freshSave.talents, node.requiresNode) < 1) return;
      this.handleUnlock(node.id, cost, freshSave);
    });

    void save;
  }

  private refreshInfoPanel(node: TalentNode, save: SaveData): void {
    const curLevel  = talentLevel(save.talents, node.id);
    const maxLevel  = node.levels.length;
    const isMaxed   = curLevel >= maxLevel;
    const cost      = nextLevelCost(node, curLevel);
    const prereqMet = !node.requiresNode || talentLevel(save.talents, node.requiresNode) > 0;
    const canAfford = cost !== null && save.spendableStars >= cost;

    const typeTag = node.isKeystone ? '[Keystone]' : '[Travel]';
    this.infoNameText.setText(`${node.name}  ${typeTag}`);
    this.infoNameText.setColor(node.isKeystone ? '#ffcc00' : '#aaaaaa');

    const descIdx = Math.min(curLevel, maxLevel - 1);
    const desc    = node.levels[descIdx]!.description;
    this.infoDescText.setText(isMaxed ? `${desc}  (MAXED)` : `Next: ${desc}`);

    if (isMaxed) {
      this.infoBtnText.setText('MAXED');
      this.infoBtnText.setColor('#555500');
      this.infoBtnBg.setFillStyle(0x0d0d0d).disableInteractive();
    } else if (!prereqMet) {
      const prereqName = TALENT_TREE.flatMap(b => b.nodes).find(n => n.id === node.requiresNode)?.name ?? node.requiresNode;
      this.infoBtnText.setText(`Requires: ${prereqName}`);
      this.infoBtnText.setColor('#444444');
      this.infoBtnBg.setFillStyle(0x0d0d0d).disableInteractive();
    } else if (!canAfford) {
      this.infoBtnText.setText(`UNLOCK ★${cost}  (need ${cost! - save.spendableStars} more)`);
      this.infoBtnText.setColor('#444444');
      this.infoBtnBg.setFillStyle(0x0d0d0d).disableInteractive();
    } else {
      this.infoBtnText.setText(`UNLOCK  ★${cost}`);
      this.infoBtnText.setColor('#aaccaa');
      this.infoBtnBg.setFillStyle(0x223322).setInteractive({ useHandCursor: true });
    }
  }

  // ─── respec button ───────────────────────────────────────────────────────────

  private static respecCost(starsSpent: number): number {
    return starsSpent > 0 ? Math.max(10, starsSpent * 5) : 0;
  }

  private buildRespecButton(W: number, H: number, save: SaveData): void {
    const spent     = this.totalStarsSpent(save);
    const coinCost  = TalentScene.respecCost(spent);
    const canAfford = save.coins >= coinCost;
    const btnY      = H - NavBar.HEIGHT - RESPEC_H / 2 + 2;
    const active    = spent > 0 && canAfford;

    const label = spent > 0
      ? `RESPEC  ◈${coinCost}  →  refund ★${spent}`
      : 'RESPEC';

    const btnW = Math.min(W - 36, label.length * 7 + 24);
    const bg = this.add.rectangle(W / 2, btnY, btnW, 22, active ? 0x440011 : 0x111111)
      .setStrokeStyle(1, active ? 0x662233 : 0x1a1a1a)
      .setInteractive({ useHandCursor: active })
      .setDepth(6);

    const labelColor = active ? '#cc4466' : spent > 0 ? '#552233' : '#2a2a2a';
    const txt = this.add.text(W / 2, btnY, label, {
      fontSize: '11px', color: labelColor, fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(7);

    if (active) {
      bg.on('pointerover', () => txt.setColor('#ff6688'));
      bg.on('pointerout',  () => txt.setColor('#cc4466'));
      bg.on('pointerdown', () => this.handleRespec(save, coinCost));
    }

    if (spent > 0 && !canAfford) {
      this.add.text(W / 2, btnY + 14, `Need ◈${coinCost - save.coins} more coins`, {
        fontSize: '9px', color: '#441122', fontFamily: 'monospace',
      }).setOrigin(0.5).setDepth(7);
    }
  }

  // ─── actions ─────────────────────────────────────────────────────────────────

  private handleUnlock(nodeId: string, cost: number, save: SaveData): void {
    save.spendableStars     -= cost;
    save.talents[nodeId]     = (save.talents[nodeId] ?? 0) + 1;
    SaveManager.save(save);
    this.scene.restart();
  }

  private handleRespec(save: SaveData, coinCost: number): void {
    if (save.coins < coinCost) return;
    const refund        = this.totalStarsSpent(save);
    save.coins         -= coinCost;
    save.spendableStars += refund;
    save.talents         = {};
    SaveManager.save(save);
    this.scene.restart();
  }

  // ─── helpers ─────────────────────────────────────────────────────────────────

  private totalStarsSpent(save: SaveData): number {
    return TALENT_TREE.reduce((sum, branch) =>
      sum + branch.nodes.reduce(
        (s, node) => s + starsSpentOnNode(node, talentLevel(save.talents, node.id)),
        0,
      ), 0,
    );
  }
}
