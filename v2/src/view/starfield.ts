import Phaser from 'phaser';
import { px } from './layout';

/**
 * Shared scrolling starfield for HubScene and CombatScene. Richer than a flat white
 * field: stars carry a faint deep-space colour tint, three size tiers, and a subset
 * twinkle by advancing their own phase (no global clock needed). Positions/tints are
 * seeded from `crypto.getRandomValues` — this is background decoration, not gameplay, so
 * it's deliberately outside the deterministic core.
 */

export interface Star {
  rect: Phaser.GameObjects.Rectangle;
  speed: number;
  baseAlpha: number;
  twinklePhase: number;
  twinkleRate: number; // radians/ms; 0 = steady
}

export interface StarfieldSpec {
  count: number;
  xMin: number;
  xSpan: number;
  yMin: number;
  ySpan: number;
  depth: number;
}

// Mostly white with occasional faint stellar colours (blue-white giants, warm dwarfs).
const STAR_TINTS = [
  0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff,
  0xcfe0ff, 0xd6fbff, 0xffe6c0, 0xe8d4ff,
];

/** Builds `spec.count` stars within the given logical bounds and adds them to the scene. */
export function buildStarfield(scene: Phaser.Scene, spec: StarfieldSpec): Star[] {
  const buf = crypto.getRandomValues(new Uint32Array(spec.count * 4));
  const stars: Star[] = [];
  for (let i = 0; i < spec.count; i++) {
    const rx = buf[i * 4] ?? 0;
    const ry = buf[i * 4 + 1] ?? 0;
    const rz = buf[i * 4 + 2] ?? 0;
    const rw = buf[i * 4 + 3] ?? 0;
    const x = spec.xMin + (rx % spec.xSpan);
    const y = spec.yMin + (ry % spec.ySpan);
    const size = rx % 11 === 0 ? 3 : rx % 4 === 0 ? 2 : 1;
    const baseAlpha = (rx % 3 === 0 ? 0.6 : 0.22) * (size === 3 ? 1.1 : 1);
    const color = STAR_TINTS[rw % STAR_TINTS.length] ?? 0xffffff;
    const rect = scene.add.rectangle(px(x), px(y), px(size), px(size), color, baseAlpha).setDepth(spec.depth);
    // Bigger stars twinkle more often; ~40% twinkle at all, the rest stay steady.
    const twinkleRate = rw % 5 < 2 ? 0.0012 + (rz % 30) * 0.0001 : 0;
    stars.push({ rect, speed: 10 + (rz % 46), baseAlpha, twinklePhase: (rz % 628) / 100, twinkleRate });
  }
  return stars;
}

/** Advances each star downward, wraps it at the bottom, and twinkles the animated ones. */
export function tickStarfield(stars: Star[], deltaMs: number, wrapTopLogical: number, wrapBottomLogical: number): void {
  const bottom = px(wrapBottomLogical);
  const top = px(wrapTopLogical);
  for (const star of stars) {
    star.rect.y += (px(star.speed) * deltaMs) / 1000;
    if (star.rect.y > bottom) star.rect.y = top;
    if (star.twinkleRate > 0) {
      star.twinklePhase += deltaMs * star.twinkleRate;
      star.rect.setAlpha(star.baseAlpha * (0.55 + 0.45 * Math.sin(star.twinklePhase)));
    }
  }
}
