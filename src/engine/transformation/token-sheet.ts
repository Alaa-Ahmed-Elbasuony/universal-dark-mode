import { OwnedSheet } from './css-injector';

/**
 * i = inline-style override, s = surface fallback, f = contrast fix, m = image dimming,
 * v = SVG paint fix, o = original text color kept over banner images,
 * x = pinned original colors on a user-excluded root, t = light flat texture image darkened by blending.
 */
export type TokenKind = 'i' | 's' | 'f' | 'm' | 'v' | 'o' | 'x' | 't';

/**
 * Elements needing a per-element correction get a shared token in `data-udm`. Identical
 * corrections share one rule, so rule count tracks unique color combinations rather than
 * element count.
 *
 * Specificity: page rules we rewrite keep the page's own selectors (possibly with ids) and
 * use !important, so correction tokens must out-rank them. Each gets three `:not(#_u)`
 * terms, which add (3,0,0) specificity without matching anything differently.
 */
export class TokenSheet {
  private readonly sheet: OwnedSheet;
  private readonly ids = new Map<string, string>();
  private rules: string[] = [];
  private next = 1;

  constructor(doc: Document) {
    this.sheet = new OwnedSheet(doc);
  }

  /** Make the same token rules apply inside an open shadow root. */
  attachTo(root: ShadowRoot): void {
    this.sheet.attachTo(root);
  }

  get ruleCount(): number {
    return this.ids.size;
  }

  idFor(kind: TokenKind, decl: string): string {
    const key = `${kind}|${decl}`;
    const hit = this.ids.get(key);
    if (hit) return hit;
    const id = `${kind}${this.next++}`;
    const sel = `[data-udm~="${id}"]`;
    const rule = kind === 'i' ? `${sel}{${decl}}` : `${sel}:not(#_u):not(#_u):not(#_u){${decl}}`;
    this.rules.push(rule);
    this.sheet.insertRule(rule);
    this.ids.set(key, id);
    return id;
  }

  /** Temporarily disable every token rule (used to read the page's original colors). */
  suspend(): void {
    this.sheet.setText('');
  }

  resume(): void {
    this.sheet.setText(this.rules.join(''));
  }

  clear(): void {
    this.ids.clear();
    this.rules = [];
    this.next = 1;
    this.sheet.setText('');
  }

  remove(): void {
    this.ids.clear();
    this.rules = [];
    this.next = 1;
    this.sheet.remove();
  }
}

export function addToken(el: Element, id: string): void {
  const cur = el.getAttribute('data-udm');
  if (!cur) el.setAttribute('data-udm', id);
  else if (!cur.split(' ').includes(id)) el.setAttribute('data-udm', `${cur} ${id}`);
}

export function hasTokenKind(el: Element, kind: TokenKind): boolean {
  return (el.getAttribute('data-udm') ?? '').split(' ').some((t) => t.startsWith(kind));
}

export function stripKind(el: Element, kind: TokenKind): void {
  const cur = el.getAttribute('data-udm');
  if (!cur) return;
  const all = cur.split(' ');
  const kept = all.filter((t) => !t.startsWith(kind));
  if (kept.length === all.length) return;
  if (kept.length) el.setAttribute('data-udm', kept.join(' '));
  else el.removeAttribute('data-udm');
}
