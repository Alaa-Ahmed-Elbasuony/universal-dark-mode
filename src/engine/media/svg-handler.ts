import { formatRgba, parseColor } from '../colors/color';
import { adjustForContrast, compositeOver, contrastRatio } from '../colors/contrast';
import type { Rgba } from '../colors/oklch';
import { looksLikeLogo } from './media-detector';

const SHAPES = new Set(['path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'text', 'tspan']);

/** Graphics need 3:1 (WCAG non-text contrast); we aim a little higher for icons. */
const NEED = 3;
const TARGET = 4.5;

/**
 * Inline SVG icons drawn with dark fills/strokes (attributes or CSS) disappear on dark
 * surfaces. Fix only paint that is actually unreadable against its resolved background;
 * colorful brand art keeps its color, logos are left alone, and anything over an
 * image/gradient (uncertain) is untouched.
 */
export function svgPaintDeclaration(
  el: Element,
  view: Window,
  background: (e: Element) => { rgb: Rgba; uncertain: boolean },
): string | null {
  if (el.namespaceURI !== 'http://www.w3.org/2000/svg' || !SHAPES.has(el.tagName.toLowerCase())) return null;
  if (looksLikeLogo(el)) return null;
  const cs = view.getComputedStyle(el);
  const bg = background(el);
  if (bg.uncertain) return null;
  const decls: string[] = [];
  for (const prop of ['fill', 'stroke'] as const) {
    const c = parseColor(cs.getPropertyValue(prop));
    if (!c || c.a === 0) continue;
    const shown = compositeOver(c, bg.rgb);
    if (contrastRatio(shown, bg.rgb) >= NEED) continue;
    decls.push(`${prop}:${formatRgba(adjustForContrast(shown, bg.rgb, TARGET))}!important`);
  }
  return decls.length ? decls.join(';') : null;
}
