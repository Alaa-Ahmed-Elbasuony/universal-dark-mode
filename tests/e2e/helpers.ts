import type { Page } from '@playwright/test';

/** Computed colors + layout boxes for every element, for before/after comparisons. */
export async function snapshot(page: Page) {
  return page.evaluate(() => {
    const colors: string[] = [];
    const boxes: string[] = [];
    for (const el of Array.from(document.querySelectorAll('body, body *'))) {
      const cs = getComputedStyle(el);
      colors.push(
        [el.tagName, cs.color, cs.backgroundColor, cs.borderTopColor, cs.outlineColor, cs.backgroundImage].join('|'),
      );
      const r = el.getBoundingClientRect();
      boxes.push([r.x, r.y, r.width, r.height].map((n) => Math.round(n)).join(','));
    }
    return { colors, boxes };
  });
}


/** Finds large light regions and unreadable text anywhere on the page. */
export async function findProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const parse = (c: string) => {
      const m = /rgba?\(([^)]+)\)/.exec(c);
      if (!m) return null;
      const [r = 0, g = 0, b = 0, a = 1] = m[1]!.split(/[ ,/]+/).filter(Boolean).map(Number);
      return { r, g, b, a };
    };
    const lin = (v: number) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
    const lum = (c: { r: number; g: number; b: number }) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
    const effective = (el: Element) => {
      let acc = { r: 24, g: 24, b: 28 };
      const chain: Element[] = [];
      for (let e: Element | null = el; e; e = e.parentElement) chain.push(e);
      for (const e of chain.reverse()) {
        const c = parse(getComputedStyle(e).backgroundColor);
        if (c && c.a > 0) {
          acc = { r: c.r * c.a + acc.r * (1 - c.a), g: c.g * c.a + acc.g * (1 - c.a), b: c.b * c.a + acc.b * (1 - c.a) };
        }
      }
      return acc;
    };
    const problems: string[] = [];
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      const r = el.getBoundingClientRect();
      if (r.width * r.height < 400) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const name = `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''}`;
      const bg = parse(cs.backgroundColor);
      const saturated = bg ? Math.max(bg.r, bg.g, bg.b) - Math.min(bg.r, bg.g, bg.b) > 70 : false; // brand colors are kept on purpose
      if (bg && bg.a > 0.5 && !saturated && lum(bg) > 0.25) problems.push(`light surface: ${name} ${cs.backgroundColor}`);
      const hasText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim());
      if (hasText) {
        const fg = parse(cs.color);
        if (fg) {
          const b = effective(el);
          const [hi, lo] = [Math.max(lum(fg), lum(b)), Math.min(lum(fg), lum(b))];
          const ratio = (hi + 0.05) / (lo + 0.05);
          if (ratio < 4.5) problems.push(`low contrast ${ratio.toFixed(2)}: ${name}`);
        }
      }
    }
    return problems;
  });
}

