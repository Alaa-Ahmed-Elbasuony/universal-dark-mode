import { formatRgba, parseColor } from '../colors/color';
import { adjustForContrast, compositeOver, contrastRatio } from '../colors/contrast';
import { oklchToRgb, rgbToOklch } from '../colors/oklch';
import type { Mapper, Role } from '../colors/mapping';
import type { Palette } from '../colors/palette';
import type { Rgba } from '../colors/oklch';
import { hasUrlImage, isLargeBanner } from '../media/background-image-handler';
import { svgPaintDeclaration } from '../media/svg-handler';
import { mapValue } from '../sheets/rewriter';

const INLINE_PROPS: Array<[string, Role]> = [
  ['color', 'text'],
  ['background-color', 'surface'],
  ['background-image', 'surface'],
  ['border-top-color', 'border'],
  ['border-right-color', 'border'],
  ['border-bottom-color', 'border'],
  ['border-left-color', 'border'],
  ['outline-color', 'border'],
];

/**
 * Colors set through the element's own `style` attribute are not reachable from rewritten
 * stylesheets. Returns a declaration list (with !important) that overrides them, or null.
 * Inline `!important` colors can't be beaten from a stylesheet and are left alone.
 */
export function inlineOverride(el: Element, mapper: Mapper): string | null {
  const style = (el as HTMLElement).style;
  if (!style || style.length === 0) return null;
  const decls: string[] = [];
  for (const [prop, role] of INLINE_PROPS) {
    const value = style.getPropertyValue(prop).trim();
    if (!value || style.getPropertyPriority(prop) === 'important') continue;
    if (prop === 'background-image' && !value.includes('gradient(')) continue;
    const mapped = mapValue(value, role, mapper);
    if (mapped !== null) decls.push(`${prop}:${mapped}!important`);
  }
  return decls.length ? decls.join(';') : null;
}

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HEAD', 'META', 'LINK', 'TITLE', 'BR', 'HR']);
const MEDIA_TAGS = new Set(['IMG', 'VIDEO', 'CANVAS', 'PICTURE', 'IFRAME', 'SVG', 'OBJECT', 'EMBED']);
const FORM_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON']);

function hasOwnText(el: Element): boolean {
  for (let n = el.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 3 && (n as Text).data.trim() !== '') return true;
  }
  return false;
}

interface EffectiveBg {
  /** Opaque color behind the element, assuming everything is visible. */
  rgb: Rgba;
  /** True when an image/gradient sits behind: contrast can't be computed reliably. */
  uncertain: boolean;
  /** Nearest element painting a url() image behind this point, if any. */
  image?: Element;
}

/**
 * Safety net on top of stylesheet rewriting: finds text whose final computed color is
 * unreadable on its final computed background and returns a corrected `color` declaration.
 * Elements over images or gradients are skipped (uncertain), preserving their appearance.
 */
export class ContrastChecker {
  private cache = new WeakMap<Element, EffectiveBg>();

  constructor(
    private readonly view: Window,
    private palette: Palette,
  ) {}

  setPalette(p: Palette): void {
    this.palette = p;
    this.resetCache();
  }

  /** Call whenever styles may have changed since the last batch. */
  resetCache(): void {
    this.cache = new WeakMap();
  }

  private layer(below: EffectiveBg, cs: CSSStyleDeclaration, node: Element): EffectiveBg {
    const c = parseColor(cs.backgroundColor);
    if (cs.backgroundImage !== 'none') {
      // A light flat texture we darkened by blending behaves like a plain dark surface.
      if (c && c.a >= 0.99 && /(^|\s)t\d+(\s|$)/.test(node.getAttribute('data-udm') ?? '')) return { rgb: c, uncertain: false };
      const rgb = c && c.a >= 0.99 ? c : below.rgb;
      return hasUrlImage(cs.backgroundImage) ? { rgb, uncertain: true, image: node } : { rgb, uncertain: true };
    }
    if (!c || c.a === 0) return below;
    if (c.a >= 0.99) return { rgb: c, uncertain: false };
    return { rgb: compositeOver(c, below.rgb), uncertain: below.uncertain, ...(below.image ? { image: below.image } : {}) };
  }

  /** Resolved background behind `el` (public for the SVG handler). */
  backgroundFor(el: Element): EffectiveBg {
    return this.effectiveBg(el);
  }

  private effectiveBg(el: Element): EffectiveBg {
    const chain: Element[] = [];
    let cur: Element | null = el;
    let acc: EffectiveBg | undefined;
    while (cur) {
      const hit = this.cache.get(cur);
      if (hit) {
        acc = hit;
        break;
      }
      chain.push(cur);
      cur = cur.parentElement;
    }
    let result: EffectiveBg = acc ?? { rgb: this.palette.bgRgb, uncertain: false };
    for (let i = chain.length - 1; i >= 0; i--) {
      const node = chain[i]!;
      result = this.layer(result, this.view.getComputedStyle(node), node);
      this.cache.set(node, result);
    }
    return result;
  }

  /**
   * Fallback for surfaces still light after stylesheet rewriting (colors produced through
   * variables we couldn't resolve, scoped variables, JS-set styles...). Returns a
   * `background-color` declaration or null. Elements with images/gradients, media elements
   * and brand-colored surfaces are left alone.
   */
  surface(el: Element, mapper: Mapper): string | null {
    if (SKIP_TAGS.has(el.tagName) || MEDIA_TAGS.has(el.tagName)) return null;
    const cs = this.view.getComputedStyle(el);
    if (cs.display === 'none') return null;
    const c = parseColor(cs.backgroundColor);
    if (!c || c.a < 0.5) return null;
    if (cs.backgroundImage !== 'none') return null;
    const o = rgbToOklch(c);
    // Anything at or below the palette's brightest surface was already handled.
    const brightestMapped = this.palette.interactive.l + 0.12;
    if (o.l <= brightestMapped || o.c >= 0.1) return null;
    const mapped = mapper.surface(c);
    return `background-color:${formatRgba(mapped)}!important`;
  }

  /**
   * Buttons must read as buttons. A button whose fill blends into the surface behind it and that
   * has no visible border of its own gets a 1px outline, drawn as an inset shadow (an actual
   * border would shift the layout). Buttons with their own visible fill, gradient, image or
   * border, and tiny icon buttons, are left as they are.
   */
  buttonBorder(el: Element): string | null {
    const isButton =
      el.tagName === 'BUTTON' ||
      (el.tagName === 'INPUT' && /^(button|submit|reset)$/i.test((el as HTMLInputElement).type)) ||
      el.getAttribute('role') === 'button';
    if (!isButton) return null;
    const cs = this.view.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return null;
    const r = el.getBoundingClientRect();
    if (r.width < 28 || r.height < 20) return null;

    const own = this.effectiveBg(el);
    if (own.uncertain) return null; // gradient or image: visible by itself
    const parent = el.parentElement ? this.effectiveBg(el.parentElement) : { rgb: this.palette.bgRgb };
    if (contrastRatio(own.rgb, parent.rgb) >= 1.3) return null; // has a visible fill

    const borderWidth = parseFloat(cs.borderTopWidth) || 0;
    if (borderWidth >= 1 && cs.borderTopStyle !== 'none') {
      const bc = parseColor(cs.borderTopColor);
      if (bc && bc.a > 0.2 && contrastRatio(compositeOver(bc, parent.rgb), parent.rgb) >= 1.4) return null;
    }
    const line = formatRgba(adjustForContrast(oklchToRgb(this.palette.border), parent.rgb, 2));
    if (borderWidth >= 1 && cs.borderTopStyle !== 'none') return `border-color:${line}!important`;
    const existing = cs.boxShadow && cs.boxShadow !== 'none' ? `,${cs.boxShadow}` : '';
    return `box-shadow:inset 0 0 0 1px ${line}${existing}!important`;
  }

  /** Paint (fill/stroke) fix for inline SVG shapes that vanish on dark surfaces. */
  svg(el: Element): string | null {
    return svgPaintDeclaration(el, this.view, (e) => this.effectiveBg(e));
  }

  /**
   * For text sitting on a large banner image: the carrier element. Such text keeps the
   * page's original color (see background-image-handler).
   */
  overImage(el: Element): Element | null {
    if (SKIP_TAGS.has(el.tagName) || (!FORM_TAGS.has(el.tagName) && !hasOwnText(el))) return null;
    const bg = this.effectiveBg(el);
    return bg.uncertain && bg.image && isLargeBanner(bg.image) ? bg.image : null;
  }

  /** Returns a `color:...!important` declaration if the text is unreadable, else null. */
  check(el: Element): string | null {
    if (SKIP_TAGS.has(el.tagName)) return null;
    if (!FORM_TAGS.has(el.tagName) && !hasOwnText(el)) return null;
    const cs = this.view.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return null;
    const fg = parseColor(cs.color);
    if (!fg || fg.a === 0) return null;
    const bg = this.effectiveBg(el);
    if (bg.uncertain) return null;
    const shown = compositeOver(fg, bg.rgb);
    const size = parseFloat(cs.fontSize);
    const weight = parseInt(cs.fontWeight, 10);
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5;
    if (contrastRatio(shown, bg.rgb) >= need) return null;
    // Corrections are rare, so aim well above the minimum (AAA for normal text).
    const fixed = adjustForContrast(shown, bg.rgb, large ? 4.5 : 7);
    return `color:${formatRgba(fixed)}!important`;
  }
}
