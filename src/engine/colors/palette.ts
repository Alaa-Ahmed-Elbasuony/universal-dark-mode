import type { Oklch, Theme, ThemeId } from '../../themes/theme.types';
import { contrastRatio } from './contrast';
import { oklchToRgb, type Rgba } from './oklch';

export interface Palette {
  themeId: ThemeId;
  bg: Oklch;
  bgSecondary: Oklch;
  elevated: Oklch;
  interactive: Oklch;
  text: Oklch;
  textSecondary: Oklch;
  textMuted: Oklch;
  border: Oklch;
  divider: Oklch;
  link: Oklch;
  accent: Oklch;
  focus: Oklch;
  bgRgb: Rgba;
  /** Stable identity used to invalidate caches when the palette changes. */
  key: string;
}

const MAX_BG_LIGHTNESS = 0.42;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Raise lightness (hue/chroma kept) until `min` contrast against `bg` is reached. */
function ensure(o: Oklch, bg: Rgba, min: number): Oklch {
  let cur = o;
  for (let i = 0; i < 40 && contrastRatio(oklchToRgb(cur), bg) < min; i++) {
    cur = { ...cur, l: Math.min(1, cur.l + 0.01) };
  }
  return cur;
}

/**
 * Builds the role palette for a theme.
 * - brightness (-50..50) shifts the whole background family lighter/darker.
 * - contrast (-50..50) moves text lighter/darker relative to the background.
 * Text roles always keep at least 7 / 5.5 / 4.5:1 against the primary background.
 */
export function generatePalette(theme: Theme, brightness: number, contrast: number): Palette {
  const a = theme.anchors;
  const bgShift = (clamp(brightness, -50, 50) / 50) * 0.08;
  const textShift = (clamp(contrast, -50, 50) / 50) * 0.06;
  const bgL = (o: Oklch): Oklch => ({ ...o, l: clamp(o.l + bgShift, 0, 0.62) });
  const txtL = (o: Oklch, k: number): Oklch => ({ ...o, l: clamp(o.l + textShift * k, 0.3, 1) });

  // Cap the page background so light text can always reach the contrast floors below
  // (white text only reaches ~7.8:1 at L=0.42; lighter backgrounds would make 7:1 impossible).
  const bg = { ...bgL(a.bgPrimary), l: Math.min(bgL(a.bgPrimary).l, MAX_BG_LIGHTNESS) };
  const bgRgb = oklchToRgb(bg);
  const palette: Palette = {
    themeId: theme.id,
    bg,
    bgSecondary: bgL(a.bgSecondary),
    elevated: bgL(a.surfaceElevated),
    interactive: bgL(a.surfaceInteractive),
    text: ensure(txtL(a.textPrimary, 1), bgRgb, 7),
    textSecondary: ensure(txtL(a.textSecondary, 0.8), bgRgb, 5.5),
    textMuted: ensure(txtL(a.textMuted, 0.6), bgRgb, 4.5),
    border: bgL(a.border),
    divider: bgL(a.divider),
    link: ensure(a.link, bgRgb, 4.5),
    accent: ensure(a.accent, bgRgb, 4.5),
    focus: ensure(a.focus, bgRgb, 3),
    bgRgb,
    key: '',
  };
  palette.key = `${theme.id}:${brightness}:${contrast}`;
  return palette;
}
