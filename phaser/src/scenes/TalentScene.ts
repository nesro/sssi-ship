import Phaser from 'phaser';
import type { SaveData } from '../SaveManager.js';
import type { TalentBranch, TalentNode } from '../data/talents.js';
import { NavBar }       from '../ui/NavBar.js';
import { SaveManager }  from '../SaveManager.js';
import { TALENT_TREE, talentLevel, nextLevelCost, starsSpentOnNode } from '../data/talents.js';

// ─── grid constants ───────────────────────────────────────────────────────────
const TAB_H        = 40;
const TAB_Y        = TAB_H / 2;
const COL_STRIDE   = 130;
const ROW_STRIDE   = 100;
const ORIGIN_X     = 30;
const ORIGIN_Y     = TAB_H + 16;   // below tab bar
const NODE_R       = 32;           // travel node circle radius
const KEY_W        = 90;           // keystone half-width
const KEY_H        = 40;           // keystone half-height
const INFO_H       = 90;           // bottom info panel height

export class TalentScene extends Phaser.Scene {
  private selectedBranch = 0;
  private selectedNode: TalentNode | null = null;

  // Info panel text objects — updated by selectNode()
  private infoNameText!:  Phaser.GameObjects.Text;
  private infoDescText!:  Phaser.GameObjects.Text;
  private infoBtnBg!:     Phaser.GameObjects.Rectangle;
  private infoBtnText!:   Phaser.GameObjects.Text;

  constructor() { super({ key: 'TalentScene' }); }

  // fallow-ignore-next-line unused-class-member
  init(data?: { branch?: number }): void {
    this.selectedBranch = data?.branch ?? 0;
    this.selectedNode   = null;
  }

  // fallow-ignore-next-line unused-class-member
  create(): void {
    const { width: W, height: H } = this.scale;
    const save = SaveManager.load();

    this.add.rectangle(W / 2, H / 2, W, H, 0x080808);
    this.buildTabs(W, save);
    this.buildBranchContent(W, H, save);
    this.buildInfoPanel(W, H, save);
    this.buildRespecButton(W, H, save);
    new NavBar(this);
  }

  // ─── tabs ────────────────────────────────────────────────────────────────────

  private buildTabs(W: number, save: SaveData): void {
    const count    = TALENT_TREE.length;
    const tabWidth = W / count;

    this.add.rectangle(W / 2, TAB_Y, W, TAB_H, 0x0d0d0d);
    this.add.rectangle(W / 2, TAB_H, W, 1, 0x333333);

    TALENT_TREE.forEach((branch, i) => {
      const x        = tabWidth * i + tabWidth / 2;
      const isActive = i === this.selectedBranch;
      const spent    = this.branchStarsSpent(branch, save.talents);

      this.add.rectangle(x, TAB_Y, tabWidth - 2, TAB_H, isActive ? 0x1a1a1a : 0x0d0d0d)
        .setInteractive({ useHandCursor: !isActive })
        .on('pointerdown', () => this.switchBranch(i));

      this.add.text(x, TAB_Y - 6, branch.name.slice(0, 4).toUpperCase(), {
        fontSize: '10px',
        color: isActive ? '#ffffff' : '#555555',
        fontFamily: 'monospace',
        fontStyle: isActive ? 'bold' : 'normal',
      }).setOrigin(0.5);

      if (spent > 0) {
        this.add.text(x, TAB_Y + 8, `★${spent}`, {
          fontSize: '9px', color: '#888800', fontFamily: 'monospace',
        }).setOrigin(0.5);
      }

      if (isActive) {
        this.add.rectangle(x, TAB_H - 1, tabWidth - 4, 2, 0xffcc00);
      }
    });

    // Star balance in header
    const { width: W2 } = this.scale;
    this.add.text(W2 - 12, 4, `★ ${save.spendableStars}`, {
      fontSize: '11px', color: '#ffcc00', fontFamily: 'monospace',
    }).setOrigin(1, 0);
  }

  // ─── branch content ──────────────────────────────────────────────────────────

  private buildBranchContent(W: number, H: number, save: SaveData): void {
    const branch    = TALENT_TREE[this.selectedBranch];
    // Available vertical space: below tabs, above info panel + respec button
    const maxY      = H - NavBar.HEIGHT - INFO_H - 36;
    const nodeMap   = this.buildNodeMap(branch);

    // Draw connector lines first (behind nodes)
    this.drawConnectors(branch, save, nodeMap, maxY);

    // Draw nodes on top
    branch.nodes.forEach(node => {
      const cx = ORIGIN_X + node.col * COL_STRIDE;
      const cy = ORIGIN_Y + node.row * ROW_STRIDE;
      if (cy - NODE_R > maxY) return;
      this.drawNode(cx, cy, node, save, W);
    });
  }

  /** Returns a map from node.id to its center {x, y}. */
  private buildNodeMap(branch: TalentBranch): Map<string, { x: number; y: number }> {
    const map = new Map<string, { x: number; y: number }>();
    for (const node of branch.nodes) {
      map.set(node.id, {
        x: ORIGIN_X + node.col * COL_STRIDE,
        y: ORIGIN_Y + node.row * ROW_STRIDE,
      });
    }
    return map;
  }

  private drawConnectors(
    branch: TalentBranch,
    save: SaveData,
    nodeMap: Map<string, { x: number; y: number }>,
    maxY: number,
  ): void {
    const gfx = this.add.graphics();

    for (const node of branch.nodes) {
      if (!node.requiresNode) continue;

      const from = nodeMap.get(node.requiresNode);
      const to   = nodeMap.get(node.id);
      if (!from || !to) continue;
      if (to.y - NODE_R > maxY) continue;

      const prereqLevel = talentLevel(save.talents, node.requiresNode);
      const thisLevel   = talentLevel(save.talents, node.id);

      let lineColor: number;
      if (thisLevel > 0) {
        lineColor = 0xffcc00;          // both unlocked — gold
      } else if (prereqLevel > 0) {
        lineColor = 0x888888;          // prereq unlocked — bright
      } else {
        lineColor = 0x444444;          // neither unlocked — dim
      }

      gfx.lineStyle(2, lineColor, 1);
      gfx.beginPath();
      gfx.moveTo(from.x, from.y);
      gfx.lineTo(to.x, to.y);
      gfx.strokePath();
    }
  }

  private drawNode(
    cx: number, cy: number,
    node: TalentNode,
    save: SaveData,
    _W: number,
  ): void {
    const curLevel  = talentLevel(save.talents, node.id);
    const maxLevel  = node.levels.length;
    const isMaxed   = curLevel >= maxLevel;
    const isUnlocked = curLevel > 0;

    // Colour theme based on state
    const fillColor   = isMaxed ? 0x333300 : isUnlocked ? 0x1a1a00 : 0x111111;
    const strokeColor = isMaxed ? 0xffcc00 : isUnlocked ? 0x888800 : 0x444444;

    const hitZone = this.add.rectangle(cx, cy, node.isKeystone ? KEY_W * 2 : NODE_R * 2, node.isKeystone ? KEY_H * 2 : NODE_R * 2, 0x000000, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.selectNode(node, save));

    const gfx = this.add.graphics();

    if (node.isKeystone) {
      gfx.fillStyle(fillColor, 1);
      gfx.fillRoundedRect(cx - KEY_W, cy - KEY_H, KEY_W * 2, KEY_H * 2, 8);
      gfx.lineStyle(2, strokeColor, 1);
      gfx.strokeRoundedRect(cx - KEY_W, cy - KEY_H, KEY_W * 2, KEY_H * 2, 8);

      // Node name
      this.add.text(cx, cy - 12, node.name, {
        fontSize: '11px', color: isUnlocked ? '#ffcc00' : '#888888',
        fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0.5);

      // Level indicator — avoid ☆ (U+2606) which renders as a filled ★ in monospace.
      const starsStr = isMaxed ? '★ MAX' : `${curLevel}/${maxLevel}`;
      this.add.text(cx, cy + 6, starsStr, {
        fontSize: '11px', color: isUnlocked ? '#ffcc00' : '#555555',
        fontFamily: 'monospace',
      }).setOrigin(0.5);

      // Cost label (next level cost)
      if (!isMaxed && nextLevelCost(node, curLevel) !== null) {
        this.add.text(cx, cy + 22, `★${nextLevelCost(node, curLevel)}`, {
          fontSize: '9px', color: '#666666', fontFamily: 'monospace',
        }).setOrigin(0.5);
      }
    } else {
      // Travel node — circle
      gfx.fillStyle(fillColor, 1);
      gfx.fillCircle(cx, cy, NODE_R);
      gfx.lineStyle(2, strokeColor, 1);
      gfx.strokeCircle(cx, cy, NODE_R);

      // Abbreviate name to fit in circle
      const label = node.name.length > 8 ? node.name.slice(0, 8) : node.name;
      this.add.text(cx, cy - 5, label, {
        fontSize: '9px', color: isUnlocked ? '#ffcc00' : '#888888',
        fontFamily: 'monospace', align: 'center',
        wordWrap: { width: NODE_R * 1.8 },
      }).setOrigin(0.5);

      // Tiny level indicator
      const lvlStr = isMaxed ? '★' : `★${curLevel}/${maxLevel}`;
      this.add.text(cx, cy + 12, lvlStr, {
        fontSize: '8px', color: isUnlocked ? '#888800' : '#444444',
        fontFamily: 'monospace',
      }).setOrigin(0.5);
    }

    // Bring hit zone to top so it receives events over the graphics
    hitZone.setDepth(10);
  }

  // ─── bottom info panel ───────────────────────────────────────────────────────

  private buildInfoPanel(W: number, H: number, save: SaveData): void {
    const panelY = H - NavBar.HEIGHT - INFO_H / 2 - 28; // above respec button

    // Panel background
    this.add.rectangle(W / 2, panelY, W, INFO_H, 0x0d0d0d)
      .setStrokeStyle(1, 0x333333);

    // Placeholder texts — overwritten when a node is selected
    this.infoNameText = this.add.text(12, panelY - INFO_H / 2 + 10, 'Tap a node to inspect', {
      fontSize: '12px', color: '#888888', fontFamily: 'monospace', fontStyle: 'bold',
    });

    this.infoDescText = this.add.text(12, panelY - INFO_H / 2 + 28, '', {
      fontSize: '10px', color: '#555555', fontFamily: 'monospace',
      wordWrap: { width: W - 24 },
    });

    // Unlock button
    const btnX = W / 2;
    const btnY = panelY + INFO_H / 2 - 18;
    this.infoBtnBg = this.add.rectangle(btnX, btnY, 140, 24, 0x222222)
      .setStrokeStyle(1, 0x333333)
      .setInteractive({ useHandCursor: false });

    this.infoBtnText = this.add.text(btnX, btnY, '', {
      fontSize: '10px', color: '#555555', fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Store save reference so button handler can call it
    this.infoBtnBg.on('pointerdown', () => {
      if (!this.selectedNode) return;
      const freshSave   = SaveManager.load();
      const node        = this.selectedNode;
      const curLevel    = talentLevel(freshSave.talents, node.id);
      const cost        = nextLevelCost(node, curLevel);
      if (cost === null) return;
      if (freshSave.spendableStars < cost) return;
      if (node.requiresNode && talentLevel(freshSave.talents, node.requiresNode) < 1) return;
      this.handleUnlock(node.id, cost, freshSave);
    });

    // Reflect current save in case a node was pre-selected (not used on first build)
    void save;
  }

  private selectNode(node: TalentNode, save: SaveData): void {
    this.selectedNode = node;

    const curLevel  = talentLevel(save.talents, node.id);
    const maxLevel  = node.levels.length;
    const isMaxed   = curLevel >= maxLevel;
    const cost      = nextLevelCost(node, curLevel);

    const prereqMet = !node.requiresNode || talentLevel(save.talents, node.requiresNode) > 0;
    const canAfford = cost !== null && save.spendableStars >= cost;
    const canUnlock = !isMaxed && prereqMet && canAfford;

    // Update name
    this.infoNameText.setText(node.name + (node.isKeystone ? ' [Keystone]' : ' [Travel]'));
    this.infoNameText.setColor(node.isKeystone ? '#ffcc00' : '#aaaaaa');

    // Update description — show next level desc if not maxed, else final desc
    const descIdx = Math.min(curLevel, maxLevel - 1);
    const desc    = node.levels[descIdx].description;
    this.infoDescText.setText(isMaxed ? desc + ' (MAXED)' : `Next: ${desc}`);

    // Update button
    if (isMaxed) {
      this.infoBtnText.setText('MAXED');
      this.infoBtnText.setColor('#666600');
      this.infoBtnBg.setFillStyle(0x111111);
      this.infoBtnBg.disableInteractive();
    } else if (!prereqMet) {
      const prereqNode = TALENT_TREE
        .flatMap(b => b.nodes)
        .find(n => n.id === node.requiresNode);
      this.infoBtnText.setText(`Requires: ${prereqNode?.name ?? node.requiresNode}`);
      this.infoBtnText.setColor('#555555');
      this.infoBtnBg.setFillStyle(0x111111);
      this.infoBtnBg.disableInteractive();
    } else if (!canAfford) {
      this.infoBtnText.setText(`UNLOCK ★${cost} (need ★${cost! - save.spendableStars} more)`);
      this.infoBtnText.setColor('#555555');
      this.infoBtnBg.setFillStyle(0x111111);
      this.infoBtnBg.disableInteractive();
    } else {
      this.infoBtnText.setText(`UNLOCK  ★${cost}`);
      this.infoBtnText.setColor('#aaccaa');
      this.infoBtnBg.setFillStyle(canUnlock ? 0x445500 : 0x222222);
      this.infoBtnBg.setInteractive({ useHandCursor: true });
    }
  }

  // ─── respec button ───────────────────────────────────────────────────────────

  // 5 coins per spent star, minimum 10 coins (so there is always a small fee).
  private static respecCost(starsSpent: number): number {
    return starsSpent > 0 ? Math.max(10, starsSpent * 5) : 0;
  }

  private buildRespecButton(W: number, H: number, save: SaveData): void {
    const spent    = this.totalStarsSpentAll(save);
    const coinCost = TalentScene.respecCost(spent);
    const canAfford = save.coins >= coinCost;
    const btnY     = H - NavBar.HEIGHT - 14;

    // Button is active only when there is something to respec AND the player can pay.
    const active   = spent > 0 && canAfford;
    const label    = spent > 0
      ? `RESPEC  ◈${coinCost}  →  refund ★${spent}`
      : 'RESPEC';

    const btnW = Math.min(W - 36, label.length * 6 + 24);

    const bg = this.add.rectangle(W / 2, btnY, btnW, 22, active ? 0x440011 : 0x111111)
      .setStrokeStyle(1, active ? 0x662233 : 0x222222)
      .setInteractive({ useHandCursor: active })
      .on('pointerdown', () => { if (active) this.handleRespec(save, coinCost); });

    const labelColor = active ? '#cc4466' : spent > 0 ? '#662233' : '#333333';
    const txt = this.add.text(W / 2, btnY, label, {
      fontSize: '11px', color: labelColor, fontFamily: 'monospace',
    }).setOrigin(0.5);

    if (active) {
      bg.on('pointerover', () => txt.setColor('#ff6688'));
      bg.on('pointerout',  () => txt.setColor('#cc4466'));
    }

    // Show "can't afford" hint when coins are too low.
    if (spent > 0 && !canAfford) {
      this.add.text(W / 2, btnY + 14, `Need ◈${coinCost - save.coins} more coins`, {
        fontSize: '9px', color: '#441122', fontFamily: 'monospace',
      }).setOrigin(0.5);
    }
  }

  // ─── actions ─────────────────────────────────────────────────────────────────

  private handleUnlock(nodeId: string, cost: number, save: SaveData): void {
    if (save.spendableStars < cost) return;
    save.spendableStars -= cost;
    save.talents[nodeId] = (save.talents[nodeId] ?? 0) + 1;
    SaveManager.save(save);
    this.scene.restart({ branch: this.selectedBranch });
  }

  private handleRespec(save: SaveData, coinCost: number): void {
    if (save.coins < coinCost) return;   // guard against stale UI state
    const refund = this.totalStarsSpentAll(save);
    save.coins          -= coinCost;
    save.spendableStars += refund;
    save.talents         = {};
    SaveManager.save(save);
    this.scene.restart({ branch: this.selectedBranch });
  }

  private switchBranch(index: number): void {
    this.scene.restart({ branch: index });
  }

  // ─── helpers ─────────────────────────────────────────────────────────────────

  private branchStarsSpent(branch: TalentBranch, talents: Record<string, number>): number {
    return branch.nodes.reduce(
      (sum, node) => sum + starsSpentOnNode(node, talentLevel(talents, node.id)),
      0,
    );
  }

  private totalStarsSpentAll(save: SaveData): number {
    return TALENT_TREE.reduce(
      (sum, branch) => sum + this.branchStarsSpent(branch, save.talents),
      0,
    );
  }
}
