/** Every stylesheet this extension creates, so the collector never rewrites its own output. */
const OWNED = new WeakSet<CSSStyleSheet>();
export const isOwnedSheet = (s: CSSStyleSheet): boolean => OWNED.has(s);

type Root = Document | ShadowRoot;

/**
 * One extension-owned stylesheet. Uses a constructed stylesheet adopted by the document
 * (no DOM mutation, not subject to page CSP inline-style rules) and can be adopted by
 * additional open shadow roots. Falls back to a <style data-udm-owned> element for the
 * main document where constructable stylesheets are unavailable.
 */
export class OwnedSheet {
  private sheet: CSSStyleSheet | null = null;
  private el: HTMLStyleElement | null = null;
  private readonly roots: Array<WeakRef<Root>>;
  private readonly primary: WeakRef<Root>;

  /** @param root where the sheet applies first; defaults to the document. */
  constructor(
    private readonly doc: Document,
    root: Root = doc,
  ) {
    this.primary = new WeakRef<Root>(root);
    this.roots = [this.primary];
    try {
      this.sheet = new CSSStyleSheet();
      OWNED.add(this.sheet);
    } catch {
      this.sheet = null;
    }
  }

  /** False where constructable stylesheets are missing (shadow DOM support then needs them). */
  get constructable(): boolean {
    return this.sheet !== null;
  }

  /** Adopt this sheet into an (open) shadow root as well. No-op without constructable sheets. */
  attachTo(root: ShadowRoot): void {
    if (!this.sheet) return;
    if (!this.roots.some((r) => r.deref() === root)) this.roots.push(new WeakRef<Root>(root));
    this.adopt(root);
  }

  private adopt(root: Root): void {
    if (!this.sheet) return;
    const adopted = root.adoptedStyleSheets;
    if (!adopted.includes(this.sheet)) root.adoptedStyleSheets = [...adopted, this.sheet];
  }

  private ensureAttached(): void {
    if (this.sheet) {
      // Pages (and frameworks) sometimes reassign adoptedStyleSheets: re-adopt if needed.
      for (let i = this.roots.length - 1; i >= 0; i--) {
        const root = this.roots[i]!.deref();
        if (!root) this.roots.splice(i, 1);
        else this.adopt(root);
      }
      return;
    }
    if (!this.el) {
      this.el = this.doc.createElement('style');
      this.el.setAttribute('data-udm-owned', '');
    }
    if (!this.el.isConnected) (this.doc.head ?? this.doc.documentElement).appendChild(this.el);
  }

  private target(): CSSStyleSheet | null {
    return this.sheet ?? this.el?.sheet ?? null;
  }

  /** Replace the full contents. */
  setText(css: string): void {
    this.ensureAttached();
    if (this.sheet) this.sheet.replaceSync(css);
    else if (this.el) this.el.textContent = css;
  }

  /** Append one rule cheaply (no re-parse of existing rules). */
  insertRule(rule: string): void {
    this.ensureAttached();
    const t = this.target();
    if (t) {
      try {
        t.insertRule(rule, t.cssRules.length);
        return;
      } catch {
        /* fall through to text append */
      }
    }
    if (this.el) this.el.appendChild(this.doc.createTextNode(rule));
  }

  remove(): void {
    if (this.sheet) {
      for (const ref of this.roots) {
        const root = ref.deref();
        if (root) root.adoptedStyleSheets = root.adoptedStyleSheets.filter((s) => s !== this.sheet);
      }
      this.roots.length = 0;
      this.roots.push(this.primary); // a later start() re-adopts into the primary root
      this.sheet.replaceSync('');
    }
    this.el?.remove();
    this.el = null;
  }
}
