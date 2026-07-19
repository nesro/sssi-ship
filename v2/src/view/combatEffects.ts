import Phaser from 'phaser';
import { px } from './layout';

/**
 * Pure per-frame tick functions for CombatScene's particle/floating-text effects,
 * matching the "pure function over an array + a Graphics object, returns survivors"
 * convention shipRenderers.ts's tickMuzzleFlashes/tickLaserBolts already establish. The
 * scene still owns the arrays (spawning pushes to them directly) — only the per-frame
 * advance/cull/redraw step lives here.
 */

export interface BurstParticle {
  x: number; y: number; vx: number; vy: number;
  color: number; life: number; maxLife: number;
}

export interface FloatingText { text: Phaser.GameObjects.Text; vy: number; life: number; maxLife: number }

export interface ShieldPulseRing { radius: number; alpha: number }

/** Advances and redraws kill-burst particles; returns the surviving entries. Clears `g` before drawing. */
export function tickBurstParticles(g: Phaser.GameObjects.Graphics, particles: BurstParticle[], deltaMs: number): BurstParticle[] {
  g.clear();
  return particles.filter((p) => {
    p.x += p.vx * deltaMs / 1000;
    p.y += p.vy * deltaMs / 1000;
    p.life -= deltaMs;
    if (p.life <= 0) return false;
    const t = p.life / p.maxLife;
    g.fillStyle(p.color, t * 0.9);
    g.fillRect(p.x - px(1.5), p.y - px(1.5), px(3), px(3));
    return true;
  });
}

/** Advances floating damage/heal/coin texts, fading and rising; destroys and drops
 * expired entries. Returns the surviving entries. */
export function tickFloatingTexts(texts: FloatingText[], deltaMs: number): FloatingText[] {
  return texts.filter((ft) => {
    ft.text.y += ft.vy * deltaMs / 1000;
    ft.life -= deltaMs;
    ft.text.setAlpha(ft.life / ft.maxLife);
    if (ft.life <= 0) { ft.text.destroy(); return false; }
    return true;
  });
}

export interface ShieldPulseRingOpts {
  cx: number; cy: number; expandPxPerSec: number; fadePerSec: number;
}

/** Advances and redraws expanding/fading shield-pulse rings centered at (cx, cy);
 * returns the surviving entries. Clears `g` before drawing. */
export function tickShieldPulseRings(
  g: Phaser.GameObjects.Graphics, rings: ShieldPulseRing[], deltaMs: number, opts: ShieldPulseRingOpts,
): ShieldPulseRing[] {
  const { cx, cy, expandPxPerSec, fadePerSec } = opts;
  g.clear();
  return rings.filter((ring) => {
    ring.radius += px(expandPxPerSec) * deltaMs / 1000;
    ring.alpha -= fadePerSec * deltaMs / 1000;
    if (ring.alpha <= 0) return false;
    g.lineStyle(px(1.5), 0x44aaff, ring.alpha);
    g.strokeCircle(cx, cy, ring.radius);
    g.lineStyle(px(0.8), 0x88ddff, ring.alpha * 0.5);
    g.strokeCircle(cx, cy, ring.radius + px(4));
    return true;
  });
}
