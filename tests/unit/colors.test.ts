import { describe, expect, it } from 'vitest';
import { formatRgba, parseColor } from '../../src/engine/colors/color';
import { adjustForContrast, compositeOver, contrastRatio, relativeLuminance } from '../../src/engine/colors/contrast';
import { createMapper } from '../../src/engine/colors/mapping';
import { oklchToRgb, rgbToOklch } from '../../src/engine/colors/oklch';
import { generatePalette } from '../../src/engine/colors/palette';
import { THEME_LIST } from '../../src/themes/theme-registry';

const rgb = (r: number, g: number, b: number, a = 1) => ({ r, g, b, a });
const WHITE = rgb(255, 255, 255);
const BLACK = rgb(0, 0, 0);

describe('parseColor', () => {
  it.each([
    ['#fff', rgb(255, 255, 255)],
    ['#FF8800', rgb(255, 136, 0)],
    ['#11223344', rgb(17, 34, 51, 0x44 / 255)],
    ['rgb(10, 20, 30)', rgb(10, 20, 30)],
    ['rgba(10, 20, 30, 0.5)', rgb(10, 20, 30, 0.5)],
    ['rgb(10 20 30 / 50%)', rgb(10, 20, 30, 0.5)],
    ['transparent', rgb(0, 0, 0, 0)],
    ['white', rgb(255, 255, 255)],
    ['color(srgb 1 0 0)', rgb(255, 0, 0)],
  ])('parses %s', (input, expected) => {
    const c = parseColor(input)!;
    expect(c).not.toBeNull();
    expect(c.r).toBeCloseTo(expected.r, 0);
    expect(c.g).toBeCloseTo(expected.g, 0);
    expect(c.b).toBeCloseTo(expected.b, 0);
    expect(c.a).toBeCloseTo(expected.a, 2);
  });

  it('parses hsl', () => {
    const c = parseColor('hsl(120, 100%, 25%)')!;
    expect([c.r, c.g, c.b].map(Math.round)).toEqual([0, 128, 0]);
  });

  it('parses oklch', () => {
    const c = parseColor('oklch(1 0 0)')!;
    expect([c.r, c.g, c.b].map(Math.round)).toEqual([255, 255, 255]);
  });

  it.each(['', 'var(--x)', 'currentcolor', 'inherit', 'rgb(var(--x))', 'lab(50% 10 10)', '#12', 'not a color'])(
    'returns null for %j',
    (input) => {
      expect(parseColor(input)).toBeNull();
    },
  );

  it('formats opaque and translucent colors', () => {
    expect(formatRgba(rgb(1, 2, 3))).toBe('rgb(1, 2, 3)');
    expect(formatRgba(rgb(1, 2, 3, 0.5))).toBe('rgba(1, 2, 3, 0.5)');
  });
});

describe('OKLCH conversion', () => {
  it('round-trips sRGB colors', () => {
    for (const c of [rgb(255, 0, 0), rgb(12, 200, 90), rgb(128, 128, 128), rgb(250, 240, 10), BLACK, WHITE]) {
      const back = oklchToRgb(rgbToOklch(c));
      expect(Math.abs(back.r - c.r)).toBeLessThan(1);
      expect(Math.abs(back.g - c.g)).toBeLessThan(1);
      expect(Math.abs(back.b - c.b)).toBeLessThan(1);
    }
  });

  it('white is L=1 and black is L=0 with no chroma', () => {
    expect(rgbToOklch(WHITE).l).toBeCloseTo(1, 3);
    expect(rgbToOklch(BLACK).l).toBeCloseTo(0, 3);
    expect(rgbToOklch(rgb(120, 120, 120)).c).toBeLessThan(0.001);
  });

  it('gamut-maps out-of-range chroma without throwing or leaving range', () => {
    const c = oklchToRgb({ l: 0.9, c: 0.4, h: 140 });
    for (const v of [c.r, c.g, c.b]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
    }
  });
});

describe('contrast', () => {
  it('matches known WCAG values', () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 1);
    expect(contrastRatio(WHITE, WHITE)).toBeCloseTo(1, 5);
    expect(contrastRatio(rgb(119, 119, 119), WHITE)).toBeCloseTo(4.48, 1);
    expect(relativeLuminance(WHITE)).toBeCloseTo(1, 5);
  });

  it('composites translucent colors', () => {
    const c = compositeOver(rgb(255, 255, 255, 0.5), BLACK);
    expect(c.r).toBeCloseTo(127.5, 1);
  });

  it('adjusts lightness to reach the target and keeps hue family', () => {
    const bg = rgb(30, 30, 40);
    const fixed = adjustForContrast(rgb(40, 40, 120), bg, 4.5);
    expect(contrastRatio(fixed, bg)).toBeGreaterThanOrEqual(4.5);
    expect(fixed.b).toBeGreaterThan(fixed.r);
  });

  it('darkens on a light background', () => {
    const fixed = adjustForContrast(rgb(200, 200, 200), WHITE, 4.5);
    expect(contrastRatio(fixed, WHITE)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('palette generation', () => {
  it.each(THEME_LIST.map((t) => [t.id, t] as const))(
    '%s keeps text readable at brightness/contrast extremes',
    (_id, theme) => {
      for (const brightness of [-50, 0, 50]) {
        for (const contrast of [-50, 0, 50]) {
          const p = generatePalette(theme, brightness, contrast);
          expect(contrastRatio(oklchToRgb(p.text), p.bgRgb)).toBeGreaterThanOrEqual(7);
          expect(contrastRatio(oklchToRgb(p.textSecondary), p.bgRgb)).toBeGreaterThanOrEqual(5.5);
          expect(contrastRatio(oklchToRgb(p.textMuted), p.bgRgb)).toBeGreaterThanOrEqual(4.5);
          expect(contrastRatio(oklchToRgb(p.link), p.bgRgb)).toBeGreaterThanOrEqual(4.5);
        }
      }
    },
  );

  it('keeps surfaces in strictly increasing lightness (hierarchy) for every theme', () => {
    for (const theme of THEME_LIST) {
      const p = generatePalette(theme, 0, 0);
      expect(p.bg.l).toBeLessThan(p.bgSecondary.l);
      expect(p.bgSecondary.l).toBeLessThan(p.elevated.l);
      expect(p.elevated.l).toBeLessThan(p.interactive.l);
    }
  });

  it('OLED primary background is true black', () => {
    const oled = THEME_LIST.find((t) => t.id === 'oled')!;
    const p = generatePalette(oled, 0, 0);
    expect([p.bgRgb.r, p.bgRgb.g, p.bgRgb.b].map(Math.round)).toEqual([0, 0, 0]);
  });

  it('brightness moves backgrounds and contrast moves text', () => {
    const t = THEME_LIST[0]!;
    expect(generatePalette(t, 30, 0).bg.l).toBeGreaterThan(generatePalette(t, -30, 0).bg.l);
    expect(generatePalette(t, 0, 30).text.l).toBeGreaterThanOrEqual(generatePalette(t, 0, -30).text.l);
  });
});

describe('color mapping', () => {
  const lum = (c: { r: number; g: number; b: number }) => rgbToOklch(c).l;

  it.each(THEME_LIST.map((t) => [t.id, t] as const))('%s: white page becomes the theme background', (_id, theme) => {
    const p = generatePalette(theme, 0, 0);
    const m = createMapper(p);
    const out = m.surface(WHITE);
    expect(lum(out)).toBeCloseTo(p.bg.l, 1);
  });

  it('preserves surface ordering: darker-gray sources map to lighter dark surfaces', () => {
    const m = createMapper(generatePalette(THEME_LIST[0]!, 0, 0));
    const white = lum(m.surface(WHITE));
    const g245 = lum(m.surface(rgb(245, 245, 245)));
    const g220 = lum(m.surface(rgb(220, 220, 220)));
    const g180 = lum(m.surface(rgb(180, 180, 180)));
    expect(white).toBeLessThan(g245);
    expect(g245).toBeLessThan(g220);
    expect(g220).toBeLessThan(g180);
  });

  it('keeps intentionally dark sections and brand colors', () => {
    const m = createMapper(generatePalette(THEME_LIST[0]!, 0, 0));
    expect(m.surface(rgb(20, 20, 30))).toEqual(rgb(20, 20, 30));
    const brand = rgb(0, 102, 255);
    expect(m.surface(brand)).toEqual(brand);
  });

  it('never touches transparent colors and preserves alpha', () => {
    const m = createMapper(generatePalette(THEME_LIST[0]!, 0, 0));
    const t = rgb(255, 255, 255, 0);
    expect(m.surface(t)).toBe(t);
    expect(m.surface(rgb(255, 255, 255, 0.5)).a).toBe(0.5);
    expect(m.text(rgb(0, 0, 0, 0.87)).a).toBe(0.87);
  });

  it.each(THEME_LIST.map((t) => [t.id, t] as const))('%s: dark text on a white page stays readable', (_id, theme) => {
    const p = generatePalette(theme, 0, 0);
    const m = createMapper(p);
    const bg = m.surface(WHITE);
    for (const v of [0, 34, 51, 85, 102, 136, 153]) {
      const fg = m.text(rgb(v, v, v));
      expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps already-light text and preserves link hue while lifting lightness', () => {
    const m = createMapper(generatePalette(THEME_LIST[0]!, 0, 0));
    expect(m.text(WHITE)).toEqual(WHITE);
    const link = rgb(0, 0, 238); // classic #0000ee
    const out = m.text(link);
    expect(out.b).toBeGreaterThan(out.r);
    expect(rgbToOklch(out).l).toBeGreaterThan(rgbToOklch(link).l);
    expect(Math.abs(rgbToOklch(out).h - rgbToOklch(link).h)).toBeLessThan(8);
  });

  it('borders: prominent stays more prominent than faint', () => {
    const m = createMapper(generatePalette(THEME_LIST[0]!, 0, 0));
    expect(lum(m.border(rgb(0, 0, 0)))).toBeGreaterThan(lum(m.border(rgb(230, 230, 230))));
  });

  it('keeps faint light translucent overlays (glass fills/borders) but still maps frosted light bars', () => {
    const m = createMapper(generatePalette(THEME_LIST[0]!, 0, 0));
    const glass = { r: 255, g: 255, b: 255, a: 0.06 };
    expect(m.surface(glass)).toEqual(glass);
    expect(m.border({ r: 255, g: 255, b: 255, a: 0.14 })).toEqual({ r: 255, g: 255, b: 255, a: 0.14 });
    // A mostly opaque translucent white (sticky frosted header on a light page) is still darkened.
    const frosted = m.surface({ r: 255, g: 255, b: 255, a: 0.8 });
    expect(frosted.r).toBeLessThan(80);
    expect(frosted.a).toBe(0.8);
  });

  it('keeps muted colored button fills (teal gradient stops) but still darkens pale tints and grays', () => {
    const m = createMapper(generatePalette(THEME_LIST[0]!, 0, 0));
    const teal = rgb(58, 159, 191);
    expect(m.surface(teal)).toEqual(teal);
    const paleBlue = rgb(219, 234, 254);
    expect(m.surface(paleBlue)).not.toEqual(paleBlue);
    const gray = rgb(200, 200, 200);
    expect(m.surface(gray)).not.toEqual(gray);
  });

  it('is deterministic (memoized results are identical)', () => {
    const m = createMapper(generatePalette(THEME_LIST[0]!, 0, 0));
    expect(m.surface(rgb(240, 240, 240))).toBe(m.surface(rgb(240, 240, 240)));
  });
});
