/**
 * Resolves `var(--x, fallback)` references textually using the root element's computed
 * custom properties. This turns design-system patterns such as
 *   background: var(--surface)            ->  #ffffff
 *   background: rgba(var(--neutral-0), 1) ->  rgba(255, 255, 255, 1)   (channel triplets)
 * into plain colors the mapper understands. Custom properties redefined on deeper scopes
 * resolve to the root value (an approximation; the per-element fallback covers the rest).
 * Custom property definitions themselves are never rewritten, so values read here are the
 * page's pristine ones.
 */
export class VarResolver {
  private cache = new Map<string, string | null>();
  private style: CSSStyleDeclaration | null = null;

  constructor(
    private readonly root: Element,
    private readonly view: Window,
  ) {}

  /** Forget cached values (call when the page's variables may have changed). */
  reset(): void {
    this.cache.clear();
    this.style = null;
  }

  private lookup(name: string): string | null {
    if (this.cache.has(name)) return this.cache.get(name)!;
    this.style ??= this.view.getComputedStyle(this.root);
    const v = this.style.getPropertyValue(name).trim();
    const out = v === '' ? null : v;
    this.cache.set(name, out);
    return out;
  }

  /** Returns the value with every var() substituted, or null if any can't be resolved. */
  resolve(value: string, depth = 0): string | null {
    if (depth > 8) return null;
    let out = '';
    let i = 0;
    while (i < value.length) {
      const start = value.indexOf('var(', i);
      if (start < 0) {
        out += value.slice(i);
        break;
      }
      out += value.slice(i, start);
      let k = start + 4;
      let level = 1;
      while (k < value.length && level > 0) {
        const ch = value[k];
        if (ch === '(') level++;
        else if (ch === ')') level--;
        k++;
      }
      if (level !== 0) return null;
      const inner = value.slice(start + 4, k - 1);
      const comma = topLevelComma(inner);
      const name = (comma < 0 ? inner : inner.slice(0, comma)).trim();
      const fallback = comma < 0 ? null : inner.slice(comma + 1).trim();
      let resolved = this.lookup(name);
      if (resolved === null && fallback !== null) resolved = fallback;
      if (resolved === null) return null;
      if (resolved.includes('var(')) {
        const deeper = this.resolve(resolved, depth + 1);
        if (deeper === null) return null;
        resolved = deeper;
      }
      out += resolved;
      i = k;
    }
    return out;
  }
}

function topLevelComma(s: string): number {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) return i;
  }
  return -1;
}
