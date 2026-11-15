/**
 * Selector utilities for the rewriter. Overrides are emitted with the page's own selector;
 * `augmentSelectors` appends a zero-specificity exclusion (`:not(:where(...))`) so selected
 * elements (media, user exclusions) keep their original appearance.
 */

/** Split a selector list on top-level commas (ignores commas inside (), [] and strings). */
export function splitSelectorList(sel: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < sel.length; i++) {
    const ch = sel[i]!;
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(sel.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(sel.slice(start));
  return parts.map((p) => p.trim()).filter(Boolean);
}

const LEGACY_PSEUDO_ELEMENT = /^:(before|after|first-line|first-letter)\b/i;

/** Index of the trailing pseudo-element in one complex selector, or -1. */
function pseudoElementIndex(sel: string): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < sel.length; i++) {
    const ch = sel[i]!;
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === ':' && depth === 0) {
      if (sel[i + 1] === ':' || LEGACY_PSEUDO_ELEMENT.test(sel.slice(i))) return i;
    }
  }
  return -1;
}

const cache = new Map<string, string>();

/**
 * `a, b::before` + `:not(x)` -> `a:not(x), b:not(x)::before`. Relative (nested) selectors
 * containing `&` are returned unchanged.
 */
export function augmentSelectors(selectorText: string, suffix: string): string {
  if (!suffix || selectorText.includes('&')) return selectorText;
  const key = `${suffix}\u0000${selectorText}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const out = splitSelectorList(selectorText)
    .map((part) => {
      const idx = pseudoElementIndex(part);
      return idx < 0 ? part + suffix : part.slice(0, idx) + suffix + part.slice(idx);
    })
    .join(',');
  if (cache.size > 5000) cache.clear();
  cache.set(key, out);
  return out;
}

/** Builds `:not(:where(a, a *, b, b *))` for a list of selectors, or '' when empty. */
export function exclusionSuffix(selectors: string[], extraSelfOnly: string[] = []): string {
  const parts = [...extraSelfOnly];
  for (const s of selectors) parts.push(s, `${s} *`);
  return parts.length ? `:not(:where(${parts.join(',')}))` : '';
}
