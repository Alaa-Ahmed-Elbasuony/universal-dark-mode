import type { CustomThemeInput, Theme } from './theme.types';

export const DEFAULT_CUSTOM_THEME: CustomThemeInput = { hue: 265, chroma: 0.02, lightness: 0.22 };

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export function clampCustomTheme(input: CustomThemeInput): CustomThemeInput {
  return {
    hue: ((Math.round(input.hue) % 360) + 360) % 360,
    chroma: clamp(input.chroma, 0, 0.1),
    lightness: clamp(input.lightness, 0, 0.4),
  };
}

/**
 * Derives a complete role palette from three inputs. Surfaces step up from the background
 * with a constant lightness rhythm; text stays neutral-light; the accent follows the hue.
 * `generatePalette` still enforces the text contrast floors, so any input is safe.
 */
export function buildCustomTheme(input: CustomThemeInput): Theme {
  const { hue, chroma, lightness } = clampCustomTheme(input);
  const surf = (step: number) => ({ l: lightness + step, c: chroma, h: hue });
  return {
    id: 'custom',
    label: 'Custom',
    anchors: {
      bgPrimary: surf(0),
      bgSecondary: surf(0.035),
      surfaceElevated: surf(0.075),
      surfaceInteractive: surf(0.12),
      textPrimary: { l: 0.93, c: chroma * 0.25, h: hue },
      textSecondary: { l: 0.8, c: chroma * 0.3, h: hue },
      textMuted: { l: 0.69, c: chroma * 0.35, h: hue },
      border: surf(0.16),
      divider: surf(0.1),
      link: { l: 0.76, c: 0.11, h: (hue + 20) % 360 },
      accent: { l: 0.72, c: 0.14, h: hue },
      focus: { l: 0.78, c: 0.14, h: (hue + 330) % 360 },
    },
  };
}
