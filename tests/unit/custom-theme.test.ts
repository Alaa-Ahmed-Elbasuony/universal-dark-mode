import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../../src/engine/colors/contrast';
import { createMapper } from '../../src/engine/colors/mapping';
import { oklchToRgb } from '../../src/engine/colors/oklch';
import { generatePalette } from '../../src/engine/colors/palette';
import { migrateSettings } from '../../src/storage/migrations';
import {
  CURRENT_SCHEMA_VERSION,
  defaultSettings,
  resolveEffectiveSettings,
  sanitizeCustomTheme,
  sanitizeSettings,
} from '../../src/storage/settings.schema';
import { buildCustomTheme, clampCustomTheme, DEFAULT_CUSTOM_THEME } from '../../src/themes/custom-theme';
import { getTheme } from '../../src/themes/theme-registry';

const rgb = (r: number, g: number, b: number) => ({ r, g, b, a: 1 });

describe('custom theme', () => {
  const extremes = [
    { hue: 0, chroma: 0, lightness: 0 },
    { hue: 120, chroma: 0.1, lightness: 0.4 },
    { hue: 240, chroma: 0.1, lightness: 0.4 },
    { hue: 330, chroma: 0.05, lightness: 0.2 },
    DEFAULT_CUSTOM_THEME,
  ];

  it.each(extremes.map((e) => [JSON.stringify(e), e] as const))(
    'keeps text readable at brightness/contrast extremes for %s',
    (_name, input) => {
      for (const brightness of [-50, 0, 50]) {
        for (const contrast of [-50, 0, 50]) {
          const p = generatePalette(buildCustomTheme(input), brightness, contrast);
          expect(contrastRatio(oklchToRgb(p.text), p.bgRgb)).toBeGreaterThanOrEqual(7);
          expect(contrastRatio(oklchToRgb(p.textMuted), p.bgRgb)).toBeGreaterThanOrEqual(4.5);
        }
      }
    },
  );

  it('keeps surfaces in increasing lightness and maps pages through the shared engine', () => {
    const p = generatePalette(buildCustomTheme({ hue: 150, chroma: 0.04, lightness: 0.25 }), 0, 0);
    expect(p.bg.l).toBeLessThan(p.bgSecondary.l);
    expect(p.bgSecondary.l).toBeLessThan(p.elevated.l);
    expect(p.elevated.l).toBeLessThan(p.interactive.l);
    const m = createMapper(p);
    const bg = m.surface(rgb(255, 255, 255));
    expect(contrastRatio(m.text(rgb(20, 20, 20)), bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('clamps out-of-range input', () => {
    expect(clampCustomTheme({ hue: 725, chroma: 5, lightness: -1 })).toEqual({ hue: 5, chroma: 0.1, lightness: 0 });
    expect(clampCustomTheme({ hue: -30, chroma: -1, lightness: 9 })).toEqual({ hue: 330, chroma: 0, lightness: 0.4 });
  });

  it('sanitizes stored garbage field by field', () => {
    expect(sanitizeCustomTheme(null)).toEqual(DEFAULT_CUSTOM_THEME);
    expect(sanitizeCustomTheme({ hue: 'x', chroma: NaN, lightness: 0.3 })).toEqual({
      ...DEFAULT_CUSTOM_THEME,
      lightness: 0.3,
    });
  });

  it('getTheme resolves custom from inputs and presets by id', () => {
    expect(getTheme('custom', { hue: 10, chroma: 0.05, lightness: 0.3 }).anchors.bgPrimary.l).toBeCloseTo(0.3);
    expect(getTheme('nord').id).toBe('nord');
  });

  it('effective settings carry the custom theme', () => {
    const s = defaultSettings();
    s.customTheme = { hue: 40, chroma: 0.03, lightness: 0.3 };
    expect(resolveEffectiveSettings(s, 'a.com', false).customTheme).toEqual(s.customTheme);
  });
});

describe('settings schema v2 migration', () => {
  it('migrates v1 data, preserving existing values and adding the custom theme', () => {
    const v1 = {
      schemaVersion: 1,
      global: { enabled: false, defaultTheme: 'nord', brightness: 10 },
      sites: { 'a.com': { theme: 'warm' } },
    };
    const s = migrateSettings(v1);
    expect(s.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(s.global).toMatchObject({ enabled: false, defaultTheme: 'nord', brightness: 10 });
    expect(s.sites['a.com']).toEqual({ theme: 'warm' });
    expect(s.customTheme).toEqual(DEFAULT_CUSTOM_THEME);
  });

  it('round-trips a v2 custom theme', () => {
    const s = defaultSettings();
    s.customTheme = { hue: 90, chroma: 0.06, lightness: 0.18 };
    expect(sanitizeSettings(JSON.parse(JSON.stringify(s))).customTheme).toEqual(s.customTheme);
  });
});
