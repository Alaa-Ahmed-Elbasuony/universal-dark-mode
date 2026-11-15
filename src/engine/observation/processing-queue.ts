/**
 * Deduplicated work queue of subtree roots. Roots are walked lazily in batches so a large
 * document is processed in small slices. Open shadow roots met during a walk are reported
 * and their children queued, so shadow content is processed like light DOM.
 */
export class ProcessingQueue {
  private readonly roots = new Set<Element>();
  private cursor: { walker: TreeWalker; first: boolean } | null = null;

  constructor(
    private readonly doc: Document,
    private readonly onShadowRoot: (root: ShadowRoot) => void,
  ) {}

  get size(): number {
    return this.roots.size + (this.cursor ? 1 : 0);
  }

  /** Queue a subtree unless an ancestor (or the whole document) is already queued. */
  add(el: Element): void {
    if (this.roots.has(this.doc.documentElement)) return;
    for (let p = el.parentElement; p; p = p.parentElement) if (this.roots.has(p)) return;
    this.roots.add(el);
  }

  /** Replace everything with one full-document pass. */
  addFull(): void {
    this.clear();
    this.roots.add(this.doc.documentElement);
  }

  clear(): void {
    this.roots.clear();
    this.cursor = null;
  }

  next(limit: number): Element[] {
    const out: Element[] = [];
    while (out.length < limit) {
      if (!this.cursor) {
        const root = this.roots.values().next().value as Element | undefined;
        if (!root) break;
        this.roots.delete(root);
        if (!root.isConnected) continue;
        this.cursor = { walker: this.doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT), first: true };
      }
      let el: Element | null;
      if (this.cursor.first) {
        this.cursor.first = false;
        el = this.cursor.walker.currentNode as Element;
      } else {
        el = this.cursor.walker.nextNode() as Element | null;
        if (!el) {
          this.cursor = null;
          continue;
        }
      }
      out.push(el);
      const shadow = el.shadowRoot;
      if (shadow) {
        this.onShadowRoot(shadow);
        for (const child of Array.from(shadow.children)) this.roots.add(child);
      }
    }
    return out;
  }
}
