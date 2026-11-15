import type { Rgba } from './oklch';
import { oklchToRgb, rgbToOklch } from './oklch';

const lin = (v: number): number => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** WCAG 2.x relative luminance. Ignores alpha: composite first. */
export function relativeLuminance(c: Pick<Rgba, 'r' | 'g' | 'b'>): number {
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

/** WCAG contrast ratio between two opaque colors. */
export function contrastRatio(a: Rgba, b: Rgba): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Composite a translucent foreground over an opaque background. */
export function compositeOver(fg: Rgba, bg: Rgba): Rgba {
  const a = fg.a;
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
    a: 1,
  };
}

/**
 * Moves `fg` along OKLCH lightness (hue and chroma preserved) until it reaches `min`
 * contrast on `bg`. Falls back to black or white if lightness alone cannot get there.
 */
export function adjustForContrast(fg: Rgba, bg: Rgba, min: number): Rgba {
  if (contrastRatio(fg, bg) >= min) return fg;
  const o = rgbToOklch(fg);
  const lighten = relativeLuminance(bg) < 0.4;
  for (let i = 1; i <= 50; i++) {
    const l = lighten ? o.l + i * 0.02 : o.l - i * 0.02;
    if (l < 0 || l > 1) break;
    const candidate = oklchToRgb({ ...o, l }, fg.a);
    if (contrastRatio(candidate, bg) >= min) return candidate;
  }
  const extreme: Rgba = lighten ? { r: 255, g: 255, b: 255, a: fg.a } : { r: 0, g: 0, b: 0, a: fg.a };
  return extreme;
}
