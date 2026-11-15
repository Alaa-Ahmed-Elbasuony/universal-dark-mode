export interface MutationSummary {
  /** Newly added elements worth processing. */
  added: Element[];
  /** A stylesheet (<style>/<link>) was added or its content changed. */
  sheetsChanged: boolean;
}

const SHEET_SELECTOR = 'style,link[rel~="stylesheet"]';

/**
 * Reduces a batch of mutation records to what the engine cares about. Extension-owned
 * nodes are ignored, which (with attribute changes never being observed) rules out
 * observer feedback loops.
 */
export function summarizeMutations(records: MutationRecord[]): MutationSummary {
  const added: Element[] = [];
  let sheetsChanged = false;
  for (const rec of records) {
    if (rec.target.nodeName === 'STYLE' && !(rec.target as Element).hasAttribute('data-udm-owned')) {
      sheetsChanged = true;
    }
    for (const node of Array.from(rec.addedNodes)) {
      if (node.nodeType !== 1) continue;
      const el = node as Element;
      if (el.hasAttribute('data-udm-owned')) continue;
      if (el.tagName === 'STYLE' || el.tagName === 'LINK' || el.querySelector(SHEET_SELECTOR)) {
        sheetsChanged = true;
      }
      added.push(el);
    }
  }
  return { added, sheetsChanged };
}
