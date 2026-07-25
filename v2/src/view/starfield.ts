import Phaser from 'phaser';
import { px } from './layout';

export interface Star {
  rect: Phaser.GameObjects.Rectangle;
  speed: number;
  baseAlpha: number;
  /** Radians; null means this star never twinkles (the far tier). */
  twinklePhase: number | null;
}

export interface StarfieldSpec {
  count: number;
  xMin: number; xSpan: number;
  yMin: number; ySpan: number;
  depth: number;
}

/** Per-tier starfield visuals, keyed by depth tier (not three independent per-attribute
 * coin flips) — a bright star is also bigger, faster, and twinkling, a coherent
 * "distance" read. Near/mid twinkle; only far stays static. Shared by every scene with
 * a starfield (CombatScene keeps its own copy of this logic inline, tied to its shared
 * thrusterPhase clock — see its own addStarfield/updateStars). */
export function starTierParams(rz: number, rw: number): { baseAlpha: number; size: number; speed: number; twinkles: boolean } {
  const tier = rz % 10; // 0-1 near, 2-4 mid, 5-9 far
  if (tier < 2) return { baseAlpha: 0.9, size: 2.5, speed: 70 + (rw % 35), twinkles: true };
  if (tier < 5) return { baseAlpha: 0.55, size: 1.5, speed: 42 + (rw % 28), twinkles: true };
  return { baseAlpha: 0.28, size: 1, speed: 20 + (rw % 18), twinkles: false };
}

/** 4-way starfield tint split (cyan/amber/magenta-violet/white) — white stays the
 * majority so the field doesn't read as a color wash, but three tinted minorities give
 * it real variety rather than two token accents. */
export function starTint(rx: number): number {
  const roll = rx % 6;
  if (roll === 0) return 0x99e6ff;
  if (roll === 1) return 0xffcc88;
  if (roll === 2) return 0xcc99ff;
  return 0xffffff;
}

/** Builds a scrolling starfield for scenes other than CombatScene (which owns its own
 * copy tied to its shared thrusterPhase clock — see that scene's addStarfield). Each
 * star accumulates its own twinkle phase independently, so this needs no external
 * per-frame clock beyond the deltaMs tickStarfield already receives. */
export function buildStarfield(scene: Phaser.Scene, spec: StarfieldSpec): Star[] {
  const { count, xMin, xSpan, yMin, ySpan, depth } = spec;
  const buf = crypto.getRandomValues(new Uint32Array(count * 4));
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    const rx = buf[i * 4] ?? 0;
    const ry = buf[i * 4 + 1] ?? 0;
    const rz = buf[i * 4 + 2] ?? 0;
    const rw = buf[i * 4 + 3] ?? 0;
    const x = xMin + (rx % xSpan);
    const y = yMin + (ry % ySpan);
    const { baseAlpha, size, speed, twinkles } = starTierParams(rz, rw);
    const tint = starTint(rx);
    const rect = scene.add.rectangle(px(x), px(y), px(size), px(size), tint, baseAlpha).setDepth(depth);
    const twinklePhase = twinkles ? (rw % 1000) / 1000 * Math.PI * 2 : null;
    stars.push({ rect, speed, baseAlpha, twinklePhase });
  }
  return stars;
}

/** Advances scroll position (wrapping between wrapTop/wrapBottom, both logical px) and
 * twinkle alpha for a shared-module starfield built by buildStarfield. */
export function tickStarfield(stars: Star[], deltaMs: number, wrapTop: number, wrapBottom: number): void {
  const top = px(wrapTop);
  const bottom = px(wrapBottom);
  for (const star of stars) {
    star.rect.y += (px(star.speed) * deltaMs) / 1000;
    if (star.rect.y > bottom) star.rect.y = top;
    if (star.twinklePhase !== null) {
      star.twinklePhase += deltaMs * 0.0025;
      star.rect.setAlpha(star.baseAlpha * (0.75 + 0.25 * Math.sin(star.twinklePhase)));
    }
  }
}
