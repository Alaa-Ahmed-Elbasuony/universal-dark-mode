import type { Oklch } from '../../themes/theme.types';

export interface Rgba {
  /** 0..255 */
  r: number;
  g: number;
  b: number;
  /** 0..1 */
  a: number;
}

const toLinear = (v: number): number => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (x: number): number =>
  255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.max(x, 0) ** (1 / 2.4) - 0.055);

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export interface Oklab {
  l: number;
  a: number;
  b: number;
}

export function rgbToOklab(c: Pick<Rgba, 'r' | 'g' | 'b'>): Oklab {
  const r = toLinear(c.r);
  const g = toLinear(c.g);
  const b = toLinear(c.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

/** Linear-light sRGB for an OKLab color (may be out of gamut). */
function oklabToLinear(L: number, a: number, b: number): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const EPS = 0.0005;
const inGamut = ([r, g, b]: [number, number, number]): boolean =>
  r >= -EPS && r <= 1 + EPS && g >= -EPS && g <= 1 + EPS && b >= -EPS && b <= 1 + EPS;

function linearToRgba(lin: [number, number, number], alpha: number): Rgba {
  return {
    r: clamp(fromLinear(lin[0]), 0, 255),
    g: clamp(fromLinear(lin[1]), 0, 255),
    b: clamp(fromLinear(lin[2]), 0, 255),
    a: alpha,
  };
}

export function oklabToRgb(o: Oklab, alpha = 1): Rgba {
  return linearToRgba(oklabToLinear(o.l, o.a, o.b), alpha);
}

export function rgbToOklch(c: Pick<Rgba, 'r' | 'g' | 'b'>): Oklch {
  const { l, a, b } = rgbToOklab(c);
  const chroma = Math.hypot(a, b);
  const hue = chroma < 1e-4 ? 0 : ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  return { l, c: chroma, h: hue };
}

/** OKLCH -> sRGB. Out-of-gamut colors are mapped by reducing chroma at constant L and h. */
export function oklchToRgb(o: Oklch, alpha = 1): Rgba {
  const L = clamp(o.l, 0, 1);
  const rad = (o.h * Math.PI) / 180;
  const at = (chroma: number) => oklabToLinear(L, chroma * Math.cos(rad), chroma * Math.sin(rad));
  let lin = at(o.c);
  if (!inGamut(lin)) {
    let lo = 0;
    let hi = o.c;
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(at(mid))) lo = mid;
      else hi = mid;
    }
    lin = at(lo);
  }
  return linearToRgba(lin, alpha);
}
