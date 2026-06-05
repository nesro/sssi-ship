// ShipPreviewPanel.ts
// Tyrian-2000-style shop preview: shows the actual ship with the tapped item
// hypothetically equipped, plus a before/after stat comparison.
//
// Ship geometry is reproduced from textures.ts (drawShipShape) and the weapon
// mount positions are kept identical to PlayerShipFx so both renderers always
// agree on where each part sits.

import Phaser from 'phaser';
import type { ItemDefinition } from '../data/items.js';
import type { SaveData }       from '../SaveManager.js';
import { ITEMS }               from '../data/items.js';
import { computeStats }        from '../game/computeStats.js';

// ─── layout constants ─────────────────────────────────────────────────────────

const PANEL_H = 180;   // drawer height in pixels (landscape-optimised)
const SHIP_CX = 110;   // ship-centre x within the panel
const SHIP_CY =  88;   // ship-centre y within the panel (centred in 180 px)
const STATS_X = 230;   // left edge of the stats column

// Hull texture is 64×88, sprite origin 0.5/0.5 → centre at pixel (32, 44).
// TX/TY shift those coordinates so the hull is centred at (SHIP_CX, SHIP_CY).
const TX = SHIP_CX - 32;   // = 78
const TY = SHIP_CY - 44;   // = 44

// ─── weapon-mount offsets — must match PlayerShipFx exactly ──────────────────

const ENGINE_L_X = -10;
const ENGINE_R_X = +10;
const ENGINE_Y   = +36;
const WING_L_X   = -22;
const WING_R_X   = +22;
const WING_Y     = +6;
const NOSE_Y     = -43;

// ─── panel class ─────────────────────────────────────────────────────────────

export class ShipPreviewPanel {
  private readonly container: Phaser.GameObjects.Container;
  private readonly hullGfx:   Phaser.GameObjects.Graphics;
  private readonly glowGfx:   Phaser.GameObjects.Graphics;
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly statsText: Phaser.GameObjects.Text;

  private animTimer: Phaser.Time.TimerEvent | null = null;
  private phase     = 0;
  private projY     = 0;   // y position of the laser bolt, in panel-local coordinates
  private isOpen    = false;
  private openItem: ItemDefinition | null = null;
  private hypSave:  SaveData | null       = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly save:  SaveData,
    W: number,
    H: number,
  ) {
    // Container starts below the visible area; slides up when opened.
    this.container = scene.add.container(0, H).setDepth(20);

    const bg      = scene.add.rectangle(W / 2, PANEL_H / 2, W, PANEL_H, 0x090909)
                        .setStrokeStyle(1, 0x2a2a2a);
    const topBar  = scene.add.rectangle(W / 2, 0, W, 2, 0x444444);
    const divider = scene.add.rectangle(STATS_X - 5, PANEL_H / 2, 1, PANEL_H - 20, 0x222222);

    this.hullGfx  = scene.add.graphics();
    this.glowGfx  = scene.add.graphics();

    this.titleText = scene.add.text(STATS_X, 14, '', {
      fontSize: '13px', color: '#ffffff', fontFamily: 'monospace', fontStyle: 'bold',
    });
    this.statsText = scene.add.text(STATS_X, 34, '', {
      fontSize: '10px', color: '#aaaaaa', fontFamily: 'monospace', lineSpacing: 6,
    });

    this.container.add([bg, topBar, divider, this.hullGfx, this.glowGfx, this.titleText, this.statsText]);
    scene.add.existing(this.container);
  }

  toggle(item: ItemDefinition, ownedLevel: number): void {
    if (this.isOpen && this.openItem?.id === item.id) {
      this.close();
    } else {
      this.open(item, ownedLevel);
    }
  }

  // ─── open / close ──────────────────────────────────────────────────────────

  private open(item: ItemDefinition, ownedLevel: number): void {
    this.isOpen   = true;
    this.openItem = item;
    this.phase    = 0;
    this.projY    = SHIP_CY + NOSE_Y;   // starts at the barrel tip
    this.hypSave  = this.buildHypotheticalSave(item, ownedLevel);

    this.titleText.setText(item.name);
    this.statsText.setText(this.buildStatLines(item));
    this.startAnimation(item);

    const { height: H } = this.scene.scale;
    this.scene.tweens.add({
      targets: this.container, y: H - PANEL_H,
      duration: 220, ease: 'Power2',
    });
  }

  private close(): void {
    this.isOpen   = false;
    this.openItem = null;
    this.hypSave  = null;
    this.stopAnimation();

    const { height: H } = this.scene.scale;
    this.scene.tweens.add({
      targets: this.container, y: H,
      duration: 200, ease: 'Power2',
    });
  }

  // ─── stat comparison ───────────────────────────────────────────────────────

  private buildStatLines(item: ItemDefinition): string {
    if (!this.hypSave) return '';
    const before = computeStats(this.save);
    const after  = computeStats(this.hypSave);
    const rows: string[] = [];

    if (item.slot === 'front') {
      rows.push(statRow('Damage',   before.frontDamage,     after.frontDamage,    true,  0));
      rows.push(statRow('Fire ms',  before.frontFireMs,     after.frontFireMs,    false, 0));
      rows.push(statRow('E/shot',   before.frontEnergyCost, after.frontEnergyCost,false, 1));
    } else if (item.slot === 'generator') {
      rows.push(statRow('Capacity', before.energyCapacity,  after.energyCapacity, true,  0));
      rows.push(statRow('Regen/s',  before.energyRegenSec,  after.energyRegenSec, true,  1));
    } else if (item.slot === 'shields') {
      rows.push(statRow('Shield HP',before.shieldCapacity,  after.shieldCapacity, true,  0));
      rows.push(statRow('Regen/s',  before.shieldRegenSec,  after.shieldRegenSec, true,  1));
    } else if (item.weaponType === 'spread') {
      rows.push('5-round burst arc');
      rows.push(statRow('E/use',    before.spreadShotCost,  after.spreadShotCost, false, 0));
    } else if (item.weaponType === 'beam') {
      rows.push('High single-target');
      rows.push(statRow('E/use',    before.heavyBeamCost,   after.heavyBeamCost,  false, 0));
    }

    return rows.join('\n');
  }

  // Returns a copy of the player's save with this item hypothetically equipped.
  private buildHypotheticalSave(item: ItemDefinition, ownedLevel: number): SaveData {
    const level     = Math.max(ownedLevel, 1);
    const ship      = { ...this.save.ship };
    const inventory = { ...this.save.inventory, [item.id]: { level } };

    if      (item.slot === 'front')        ship.frontWeapon  = item.id;
    else if (item.slot === 'generator')    ship.generator    = item.id;
    else if (item.slot === 'shields')      ship.shields      = item.id;
    else if (item.weaponType === 'spread') ship.leftWeapon   = item.id;
    else if (item.weaponType === 'beam')   ship.rightWeapon  = item.id;

    return { ...this.save, ship, inventory };
  }

  // ─── animation ─────────────────────────────────────────────────────────────

  private startAnimation(item: ItemDefinition): void {
    this.stopAnimation();
    this.animTimer = this.scene.time.addEvent({
      delay: 30, loop: true,
      callback: () => this.drawFrame(item),
    });
  }

  private stopAnimation(): void {
    if (this.animTimer) { this.animTimer.destroy(); this.animTimer = null; }
    this.hullGfx.clear();
    this.glowGfx.clear();
  }

  // ─── per-frame drawing ─────────────────────────────────────────────────────

  private drawFrame(item: ItemDefinition): void {
    // Phase increment: 30 ms × 0.006 = 0.18 rad/tick — matches PlayerShipFx rate.
    this.phase += 30 * 0.006;
    const flicker = (Math.sin(this.phase) + 1) / 2;  // oscillates 0→1

    // Advance laser bolt upward at ~120 px/sec; reset to barrel tip when off the top.
    if (this.hypSave?.ship.frontWeapon !== null || item.slot === 'front') {
      this.projY -= 3.6;   // 3.6 px per 30 ms ≈ 120 px/sec
      if (this.projY < 4) this.projY = SHIP_CY + NOSE_Y;
    }

    this.hullGfx.clear();
    this.glowGfx.clear();
    this.drawHull();
    this.drawEngineGlow(flicker);
    this.drawMounts(item, flicker);
  }

  // Ship hull — reproduced from textures.ts drawShipShape, translated to SHIP_CX/CY.
  private drawHull(): void {
    const g = this.hullGfx;

    // Fill then stroke the hull body — Phaser retains the path after fillPath()
    // so strokePath() reuses it, avoiding a duplicate vertex trace.
    g.fillStyle(0x112233, 0.9);
    g.lineStyle(2, 0xffffff, 1);
    g.beginPath();
    g.moveTo(TX+32, TY+2);  g.lineTo(TX+62, TY+64);
    g.lineTo(TX+50, TY+78); g.lineTo(TX+40, TY+84);
    g.lineTo(TX+32, TY+86); g.lineTo(TX+24, TY+84);
    g.lineTo(TX+14, TY+78); g.lineTo(TX+2,  TY+64);
    g.closePath(); g.fillPath(); g.strokePath();

    g.lineStyle(1, 0xffffff, 0.25);
    g.lineBetween(TX+32, TY+2,  TX+10, TY+56);
    g.lineBetween(TX+32, TY+2,  TX+54, TY+56);
    g.lineBetween(TX+14, TY+78, TX+50, TY+78);

    g.fillStyle(0x00ccff, 0.85);
    g.beginPath();
    g.moveTo(TX+32, TY+8);  g.lineTo(TX+38, TY+18);
    g.lineTo(TX+38, TY+44); g.lineTo(TX+32, TY+50);
    g.lineTo(TX+26, TY+44); g.lineTo(TX+26, TY+18);
    g.closePath(); g.fillPath();
    g.lineStyle(1, 0x00ccff, 0.4); g.strokePath();

    g.fillStyle(0xff4400, 0.85);
    g.fillCircle(TX+22, TY+80, 7);
    g.fillCircle(TX+42, TY+80, 7);
    g.fillStyle(0xffffff, 0.6);
    g.fillCircle(TX+22, TY+79, 3);
    g.fillCircle(TX+42, TY+79, 3);
  }

  private drawEngineGlow(flicker: number): void {
    const g  = this.glowGfx;
    const lx = SHIP_CX + ENGINE_L_X;
    const rx = SHIP_CX + ENGINE_R_X;
    const ey = SHIP_CY + ENGINE_Y;

    g.fillStyle(0xff4400, 0.28 + flicker * 0.28);
    g.fillCircle(lx, ey, 7 + flicker * 3);
    g.fillCircle(rx, ey, 7 + flicker * 3);

    g.fillStyle(0xffffff, 0.45 + flicker * 0.35);
    g.fillCircle(lx, ey - 1, 2.5);
    g.fillCircle(rx, ey - 1, 2.5);
  }

  // Weapon mounts — same visual language as PlayerShipFx.
  // Items being previewed render at full brightness; already-equipped items are dimmed.
  private drawMounts(item: ItemDefinition, flicker: number): void {
    if (!this.hypSave) return;
    const g   = this.glowGfx;
    const hyp = this.hypSave;

    // Front barrel + travelling bolt
    if (hyp.ship.frontWeapon !== null) {
      const highlight = item.slot === 'front';
      const tipY = SHIP_CY + NOSE_Y;
      g.fillStyle(0x0088aa, 0.8);
      g.fillRect(SHIP_CX - 2, tipY - 14, 4, 14);
      g.fillStyle(0x00ffff, highlight ? 0.65 + flicker * 0.3 : 0.3);
      g.fillRect(SHIP_CX - 3, tipY - 16, 6, 4);

      // Laser bolt — only shown when this item is the front weapon being previewed.
      if (highlight) {
        g.fillStyle(0x00ffff, 0.9);
        g.fillRect(SHIP_CX - 2, this.projY - 12, 4, 12);  // bolt body
        g.fillStyle(0xffffff, 0.6);
        g.fillRect(SHIP_CX - 1, this.projY - 12, 2, 4);   // bright tip
      }
    }

    // Port wing — spread shot
    if (this.weaponTypeOf(hyp.ship.leftWeapon) === 'spread') {
      const highlight = item.weaponType === 'spread';
      const px = SHIP_CX + WING_L_X;
      const py = SHIP_CY + WING_Y;
      g.fillStyle(0xcc5500, highlight ? 0.85 : 0.4);
      g.fillRect(px - 12, py - 2, 12, 5);
      g.fillRect(px - 14, py - 4,  5, 9);
      g.fillStyle(0xff9900, highlight ? 0.9 : 0.4);
      g.fillRect(px - 17, py - 3,  4, 7);
    }

    // Starboard wing — heavy beam
    if (this.weaponTypeOf(hyp.ship.rightWeapon) === 'beam') {
      const highlight = item.weaponType === 'beam';
      const px = SHIP_CX + WING_R_X;
      const py = SHIP_CY + WING_Y;
      g.fillStyle(0x999999, highlight ? 0.85 : 0.4);
      g.fillRect(px, py - 4, 16, 8);
      g.fillStyle(0xddeeff, highlight ? 0.9 : 0.4);
      g.fillRect(px + 2, py - 2, 12, 4);
    }

    // Shield ring
    if (hyp.ship.shields !== null) {
      const highlight = item.slot === 'shields';
      const alpha = highlight ? 0.35 + flicker * 0.2 : 0.15;
      g.lineStyle(2, 0x00cccc, alpha);
      g.strokeCircle(SHIP_CX, SHIP_CY, 50);
      if (highlight) {
        g.lineStyle(1, 0x00ffff, 0.15 + flicker * 0.1);
        g.strokeCircle(SHIP_CX, SHIP_CY, 56);
      }
    }
  }

  private weaponTypeOf(itemId: string | null): string | null {
    if (!itemId) return null;
    return ITEMS[itemId]?.weaponType ?? null;
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

// Formats a before→after stat row. Arrow direction reflects whether the change
// is an improvement (▲) or a regression (▼) for this stat type.
function statRow(
  label: string,
  before: number,
  after:  number,
  higherIsBetter: boolean,
  decimals: number,
): string {
  const fmt  = (n: number) => n.toFixed(decimals);
  const diff = after - before;
  if (Math.abs(diff) < 0.01) return `${label}: ${fmt(after)}`;
  const better = higherIsBetter ? diff > 0 : diff < 0;
  const arrow  = better ? ' ▲ ' : ' ▼ ';
  return `${label}: ${fmt(before)}${arrow}${fmt(after)}`;
}
