// TreeCanvas.ts
// Shared 2D node-graph renderer for the talent tree and mission map.
// Accepts typed node/edge arrays; handles rendering, tap detection, and panning.

import Phaser from 'phaser';

export type NodeState = 'locked' | 'available' | 'owned' | 'maxed';
export type EdgeState = 'dim' | 'lit' | 'gold';

export interface TreeNode {
  id:         string;
  x:          number;
  y:          number;
  isKeystone: boolean;
  state:      NodeState;
  label:      string;
  sublabel?:  string;   // e.g. "2/3" or "★ MAX"
  costLabel?: string;   // e.g. "★4"
  color:      number;   // branch accent color (hex)
}

export interface TreeEdge {
  fromId: string;
  toId:   string;
  state:  EdgeState;
}

const TRAVEL_R = 18;
const KEY_R    = 28;

const NODE_FILL:   Record<NodeState, number> = { locked: 0x0c0c0c, available: 0x141414, owned: 0x161600, maxed: 0x202000 };
const NODE_STROKE: Record<NodeState, number> = { locked: 0x2a2a2a, available: 0x444444, owned: 0x888800, maxed: 0xffcc00 };
const TEXT_CLR:    Record<NodeState, string> = { locked: '#2a2a2a', available: '#777777', owned: '#ffcc00', maxed: '#ffee00' };
const EDGE_CLR:    Record<EdgeState, number> = { dim: 0x222222, lit: 0x555555, gold: 0xffcc00 };

export class TreeCanvas {
  /** Expose so callers can add branch labels, backgrounds, etc. */
  readonly container: Phaser.GameObjects.Container;

  private panX     = 0;
  private panY     = 0;
  private dragDist = 0;

  constructor(
    scene: Phaser.Scene,
    vx: number, vy: number, vw: number, vh: number,
    nodes: TreeNode[],
    edges: TreeEdge[],
    onTap: (nodeId: string) => void,
  ) {
    this.container = scene.add.container(vx, vy);

    // Clip tree rendering to the viewport rectangle.
    const maskGfx = scene.add.graphics();
    maskGfx.fillRect(vx, vy, vw, vh);
    this.container.setMask(maskGfx.createGeometryMask());

    this.drawEdges(scene, edges, nodes);
    this.drawNodes(scene, nodes, onTap);
    this.setupInput(scene, vx, vy, vw, vh, nodes);
  }

  // ─── private ─────────────────────────────────────────────────────────────────

  private drawEdges(scene: Phaser.Scene, edges: TreeEdge[], nodes: TreeNode[]): void {
    const idx = new Map(nodes.map(n => [n.id, n]));
    const gfx = scene.add.graphics();
    this.container.add(gfx);

    for (const e of edges) {
      const a = idx.get(e.fromId);
      const b = idx.get(e.toId);
      if (!a || !b) continue;
      gfx.lineStyle(2, EDGE_CLR[e.state], 1);
      gfx.beginPath();
      gfx.moveTo(a.x, a.y);
      gfx.lineTo(b.x, b.y);
      gfx.strokePath();
    }
  }

  private drawNodes(scene: Phaser.Scene, nodes: TreeNode[], onTap: (id: string) => void): void {
    for (const n of nodes) {
      const r    = n.isKeystone ? KEY_R : TRAVEL_R;
      const fill = NODE_FILL[n.state];
      const strk = NODE_STROKE[n.state];
      const tclr = TEXT_CLR[n.state];
      const dim  = n.state === 'locked' ? 0.4 : 1;

      const gfx = scene.add.graphics().setAlpha(dim);

      // Owned/maxed keystones get a soft glow.
      if (n.isKeystone && (n.state === 'owned' || n.state === 'maxed')) {
        gfx.fillStyle(n.color, 0.10);
        gfx.fillCircle(n.x, n.y, r + 9);
      }

      gfx.fillStyle(fill, 1);
      gfx.fillCircle(n.x, n.y, r);
      gfx.lineStyle(n.isKeystone ? 2 : 1.5, strk, 1);
      gfx.strokeCircle(n.x, n.y, r);

      // Outer accent ring on keystones.
      if (n.isKeystone) {
        gfx.lineStyle(1, n.color, n.state === 'locked' ? 0.08 : 0.30);
        gfx.strokeCircle(n.x, n.y, r + 5);
      }
      this.container.add(gfx);

      // Label inside circle.
      const hasSub = !!n.sublabel;
      const lbl = scene.add.text(n.x, n.y + (hasSub ? -6 : 0), n.label, {
        fontSize: n.isKeystone ? '9px' : '8px',
        color: tclr, fontFamily: 'monospace', align: 'center',
        wordWrap: { width: r * 1.7 },
      }).setOrigin(0.5).setAlpha(dim);
      this.container.add(lbl);

      if (n.sublabel) {
        this.container.add(
          scene.add.text(n.x, n.y + 8, n.sublabel, {
            fontSize: '7px', color: tclr, fontFamily: 'monospace',
          }).setOrigin(0.5).setAlpha(dim),
        );
      }

      if (n.costLabel) {
        this.container.add(
          scene.add.text(n.x, n.y + r + 8, n.costLabel, {
            fontSize: '8px', color: '#444444', fontFamily: 'monospace',
          }).setOrigin(0.5),
        );
      }

      // Tap fires on pointerup so drag doesn't accidentally trigger it.
      const hit = scene.add.rectangle(n.x, n.y, (r + 6) * 2, (r + 6) * 2, 0x000000, 0)
        .setInteractive({ useHandCursor: n.state !== 'locked' });
      hit.on('pointerup', () => { if (this.dragDist < 6) onTap(n.id); });
      this.container.add(hit);
    }
  }

  private setupInput(
    scene: Phaser.Scene,
    vx: number, vy: number, vw: number, vh: number,
    nodes: TreeNode[],
  ): void {
    const treeMaxX = nodes.length ? Math.max(...nodes.map(n => n.x)) + KEY_R + 12 : vw;
    const treeMaxY = nodes.length ? Math.max(...nodes.map(n => n.y)) + KEY_R + 12 : vh;
    const maxPanX  = Math.max(0, treeMaxX - vw);
    const maxPanY  = Math.max(0, treeMaxY - vh);

    let startX = 0, startY = 0, startPX = 0, startPY = 0;

    scene.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (ptr.x < vx || ptr.x > vx + vw || ptr.y < vy || ptr.y > vy + vh) return;
      startX = ptr.x; startY = ptr.y;
      startPX = this.panX; startPY = this.panY;
      this.dragDist = 0;
    });

    scene.input.on('pointermove', (ptr: Phaser.Input.Pointer) => {
      if (!ptr.isDown) return;
      const dx = ptr.x - startX;
      const dy = ptr.y - startY;
      this.dragDist = Math.max(Math.abs(dx), Math.abs(dy));
      if (maxPanX === 0 && maxPanY === 0) return;
      if (this.dragDist < 4) return;
      this.panX = Phaser.Math.Clamp(startPX + dx, -maxPanX, 0);
      this.panY = Phaser.Math.Clamp(startPY + dy, -maxPanY, 0);
      this.container.setPosition(vx + this.panX, vy + this.panY);
    });
  }
}
