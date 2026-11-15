import { oklabToRgb, oklchToRgb, type Rgba } from './oklch';

export type { Rgba } from './oklch';

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

const NAMED: Record<string, [number, number, number]> = {
  white: [255, 255, 255],
  black: [0, 0, 0],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
  silver: [192, 192, 192],
  red: [255, 0, 0],
  green: [0, 128, 0],
  blue: [0, 0, 255],
  yellow: [255, 255, 0],
  orange: [255, 165, 0],
  purple: [128, 0, 128],
  navy: [0, 0, 128],
  teal: [0, 128, 128],
  maroon: [128, 0, 0],
  lime: [0, 255, 0],
  aqua: [0, 255, 255],
  cyan: [0, 255, 255],
  fuchsia: [255, 0, 255],
  magenta: [255, 0, 255],
  olive: [128, 128, 0],
  pink: [255, 192, 203],
  brown: [165, 42, 42],
  whitesmoke: [245, 245, 245],
  lightgray: [211, 211, 211],
  lightgrey: [211, 211, 211],
  gainsboro: [220, 220, 220],
  ivory: [255, 255, 240],
  beige: [245, 245, 220],
};

/** Names that are valid inside shorthands/gradients (kept short on purpose). */
export const COLOR_TOKEN_NAMES = Object.keys(NAMED).concat('transparent');

let canvasCtx: CanvasRenderingContext2D | null | undefined;

/** Resolve any other CSS color keyword through the browser's own parser. */
function parseViaCanvas(s: string): Rgba | null {
  try {
    if (canvasCtx === undefined) canvasCtx = document.createElement('canvas').getContext('2d');
    if (!canvasCtx) return null;
    canvasCtx.fillStyle = '#010203';
    canvasCtx.fillStyle = s;
    const out = canvasCtx.fillStyle;
    if (out === '#010203') return null;
    return parseColor(out);
  } catch {
    return null;
  }
}

function parseHex(s: string): Rgba | null {
  const h = s.slice(1);
  if (!/^[0-9a-f]+$/.test(h)) return null;
  let full: string;
  if (h.length === 3 || h.length === 4) full = [...h].map((c) => c + c).join('');
  else if (h.length === 6 || h.length === 8) full = h;
  else return null;
  const n = (i: number) => parseInt(full.slice(i, i + 2), 16);
  return { r: n(0), g: n(2), b: n(4), a: full.length === 8 ? n(6) / 255 : 1 };
}

/** Number with optional percentage, where 100% = scale. Returns NaN when invalid. */
function num(t: string | undefined, scale: number): number {
  if (t === undefined) return NaN;
  if (t === 'none') return 0;
  if (t.endsWith('%')) return (parseFloat(t) / 100) * scale;
  return /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?(deg)?$/.test(t) ? parseFloat(t) : NaN;
}

function hslToRgb(h: number, s: number, l: number, a: number): Rgba {
  const hue = ((h % 360) + 360) % 360;
  const k = (n: number) => (n + hue / 30) % 12;
  const f = (n: number) => l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return { r: f(0) * 255, g: f(8) * 255, b: f(4) * 255, a };
}

/**
 * Parses the CSS color syntaxes that appear in computed styles and authored CSS.
 * Returns null for anything unsupported (lab(), display-p3, var(), currentcolor, ...);
 * callers treat null as "leave this value untouched".
 */
export function parseColor(input: string): Rgba | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (s.startsWith('#')) return parseHex(s);

  const fn = /^([a-z-]+)\((.*)\)$/.exec(s);
  if (fn) {
    const name = fn[1]!;
    const tokens = fn[2]!.replace(/\//g, ' ').split(/[\s,]+/).filter(Boolean);
    const alphaOf = (idx: number): number => {
      const t = tokens[idx];
      if (t === undefined) return 1;
      const a = num(t, 1);
      return Number.isNaN(a) ? NaN : clamp(a, 0, 1);
    };
    let out: Rgba | null = null;
    if (name === 'rgb' || name === 'rgba') {
      const [r, g, b] = [num(tokens[0], 255), num(tokens[1], 255), num(tokens[2], 255)];
      out = { r: clamp(r, 0, 255), g: clamp(g, 0, 255), b: clamp(b, 0, 255), a: alphaOf(3) };
    } else if (name === 'hsl' || name === 'hsla') {
      const [h, sat, l] = [num(tokens[0], 360), num(tokens[1], 100), num(tokens[2], 100)];
      out = hslToRgb(h, clamp(sat, 0, 100) / 100, clamp(l, 0, 100) / 100, alphaOf(3));
    } else if (name === 'oklch') {
      const [l, c, h] = [num(tokens[0], 1), num(tokens[1], 0.4), num(tokens[2], 360)];
      out = oklchToRgb({ l, c: Math.max(0, c), h }, alphaOf(3));
    } else if (name === 'oklab') {
      const [l, a, b] = [num(tokens[0], 1), num(tokens[1], 0.4), num(tokens[2], 0.4)];
      out = oklabToRgb({ l, a, b }, alphaOf(3));
    } else if (name === 'color' && tokens[0] === 'srgb') {
      const [r, g, b] = [num(tokens[1], 1), num(tokens[2], 1), num(tokens[3], 1)];
      out = { r: clamp(r * 255, 0, 255), g: clamp(g * 255, 0, 255), b: clamp(b * 255, 0, 255), a: alphaOf(4) };
    }
    if (!out || [out.r, out.g, out.b, out.a].some(Number.isNaN)) return null;
    return out;
  }

  if (/^[a-z]+$/.test(s)) {
    const n = NAMED[s];
    if (n) return { r: n[0], g: n[1], b: n[2], a: 1 };
    if (['inherit', 'initial', 'unset', 'revert', 'currentcolor', 'none', 'auto'].includes(s)) return null;
    return parseViaCanvas(s);
  }
  return null;
}

export function formatRgba(c: Rgba): string {
  const r = Math.round(c.r);
  const g = Math.round(c.g);
  const b = Math.round(c.b);
  return c.a >= 0.999 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${+c.a.toFixed(3)})`;
}
