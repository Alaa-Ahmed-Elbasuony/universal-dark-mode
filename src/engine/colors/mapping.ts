import type { Oklch } from '../../themes/theme.types';
import { contrastRatio } from './contrast';
import type { Palette } from './palette';
import { oklchToRgb, rgbToOklch, type Rgba } from './oklch';

export type Role = 'surface' | 'text' | 'border';

export interface Mapper {
  surface(c: Rgba): Rgba;
  text(c: Rgba): Rgba;
  border(c: Rgba): Rgba;
  byRole(role: Role, c: Rgba): Rgba;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number): number => a + (a === b ? 0 : (b - a) * t);

/** Sources at or below this OKLCH lightness are treated as intentionally dark and kept. */
const DARK_KEEP = 0.35;
/** Chromatic sources at or above this chroma are treated as brand colors and kept. */
const BRAND_CHROMA = 0.1;
/**
 * Surfaces: a clearly colored fill that isn't pale is a control or brand block (muted teal
 * button, blue badge), not a page background. Pale tints (L > 0.9) keep the strict threshold
 * so tinted panels still darken.
 */
const surfaceBrandChroma = (l: number): number => (l > 0.9 ? BRAND_CHROMA : l > 0.8 ? 0.07 : 0.04);

/**
 * Faint, near-white translucent fills and borders (e.g. rgba(255,255,255,.06)) are
 * "glass" overlays: they LIGHTEN whatever is behind them, which is how dark designs draw
 * fields, buttons and outlines. Inverting them into a dark tint would erase those controls,
 * so they are kept: over our dark surfaces they give the same subtle lift.
 */
const FILL_OVERLAY_MAX_ALPHA = 0.2; // glass fills are faint; `bg-muted/40` on a light page is a pale panel
const BORDER_OVERLAY_MAX_ALPHA = 0.4; // outlines can be stronger, and a kept pale border is harmless on light pages
const isLightOverlay = (o: Oklch, alpha: number, maxAlpha: number): boolean =>
  alpha <= maxAlpha && o.l >= 0.8 && o.c < 0.05;

interface Stop {
  d: number;
  o: Oklch;
}

/**
 * Surface mapping. "Depth" d is the distance from white: white -> 0, the dark-keep
 * threshold -> 1. Depth is spread over the palette's own surface anchors, so the
 * hierarchy of the original page (white page, light-gray panels, gray wells) survives
 * as a hierarchy of dark surfaces instead of being collapsed or inverted blindly.
 */
function surfaceStops(p: Palette): Stop[] {
  return [
    { d: 0, o: p.bg },
    { d: 0.07, o: p.bgSecondary },
    { d: 0.2, o: p.elevated },
    { d: 0.42, o: p.interactive },
    { d: 1, o: { ...p.interactive, l: p.interactive.l + 0.1 } },
  ];
}

function sample(stops: Stop[], d: number): Oklch {
  for (let i = 1; i < stops.length; i++) {
    const hi = stops[i]!;
    if (d <= hi.d) {
      const lo = stops[i - 1]!;
      const t = (d - lo.d) / (hi.d - lo.d);
      return { l: lerp(lo.o.l, hi.o.l, t), c: lerp(lo.o.c, hi.o.c, t), h: lo.o.h };
    }
  }
  return stops[stops.length - 1]!.o;
}

export function createMapper(p: Palette): Mapper {
  const stops = surfaceStops(p);
  const caches: Record<Role, Map<string, Rgba>> = {
    surface: new Map(),
    text: new Map(),
    border: new Map(),
  };
  const memo = (role: Role, c: Rgba, compute: (o: Oklch, alpha: number) => Oklch | null): Rgba => {
    if (c.a === 0) return c;
    const key = `${c.r | 0},${c.g | 0},${c.b | 0},${c.a}`;
    const hit = caches[role].get(key);
    if (hit) return hit;
    const src = rgbToOklch(c);
    const mapped = compute(src, c.a);
    const out = mapped ? oklchToRgb(mapped, c.a) : c;
    caches[role].set(key, out);
    return out;
  };

  const surface = (c: Rgba): Rgba =>
    memo('surface', c, (o, alpha) => {
      if (o.l <= DARK_KEEP) return null; // intentional dark section
      if (isLightOverlay(o, alpha, FILL_OVERLAY_MAX_ALPHA)) return null; // glass overlay on a dark design
      if (o.c >= surfaceBrandChroma(o.l)) return null; // brand surface (buttons, banners)
      const d = clamp((1 - o.l) / (1 - DARK_KEEP), 0, 1);
      const s = sample(stops, d);
      const tinted = o.c >= 0.012;
      return {
        l: s.l,
        c: tinted ? Math.max(s.c, Math.min(o.c * 0.8, 0.05)) : s.c,
        h: tinted ? o.h : s.h,
      };
    });

  const text = (c: Rgba): Rgba =>
    memo('text', c, (o) => {
      if (o.c >= BRAND_CHROMA) {
        // Brand/link-like color: keep hue and chroma, only lift lightness for legibility.
        let cur = o;
        for (let i = 0; i < 25 && contrastRatio(oklchToRgb(cur), p.bgRgb) < 4.5; i++) {
          cur = { ...cur, l: Math.min(0.97, cur.l + 0.02) };
        }
        return cur;
      }
      if (o.l >= 0.72) return null; // already light text
      const d = clamp(o.l / 0.72, 0, 1);
      return {
        l: lerp(p.text.l, p.textMuted.l, d),
        c: lerp(p.text.c, p.textMuted.c, d),
        h: p.text.h,
      };
    });

  const border = (c: Rgba): Rgba =>
    memo('border', c, (o, alpha) => {
      if (o.c >= BRAND_CHROMA) return null;
      if (isLightOverlay(o, alpha, BORDER_OVERLAY_MAX_ALPHA)) return null; // keep faint light outlines visible
      // Prominent (dark) borders stay prominent; faint (light) borders stay faint.
      const prominence = clamp(1 - o.l, 0, 1);
      return {
        l: Math.min(0.62, p.divider.l + prominence * 0.2),
        c: p.border.c,
        h: p.border.h,
      };
    });

  return {
    surface,
    text,
    border,
    byRole: (role, c) => (role === 'surface' ? surface(c) : role === 'text' ? text(c) : border(c)),
  };
}
