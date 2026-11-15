import type { Mapper } from '../colors/mapping';
import { isOwnedSheet } from '../transformation/css-injector';
import { rewriteSheet } from './rewriter';
import { VarResolver } from './variables';

export interface SheetStats {
  sheetsRewritten: number;
  sheetsFailed: number;
  rulesGenerated: number;
}

interface Output {
  ruleCount: number;
  css: string;
  rules: number;
}

export type FetchCss = (url: string) => Promise<string | null>;

/**
 * Tracks which document stylesheets have been rewritten and holds each one's override CSS.
 * Same-origin sheets are read via the CSSOM; cross-origin sheets (unreadable) are fetched
 * as text through `fetchCss` (the service worker) and parsed in a detached constructed sheet.
 */
export class SheetCollector {
  private readonly outputs = new Map<CSSStyleSheet, Output>();
  private readonly crossOrigin = new Map<string, CSSStyleSheet | null>();
  private readonly inFlight = new Set<string>();
  private readonly vars: VarResolver;
  private suffix = '';
  readonly stats: SheetStats = { sheetsRewritten: 0, sheetsFailed: 0, rulesGenerated: 0 };

  /**
   * @param getSheets all stylesheets in this scope (document or shadow root)
   * @param varRoot   element whose computed custom properties resolve var() (the document
   *                  element, or the shadow host)
   */
  constructor(
    private readonly getSheets: () => CSSStyleSheet[],
    varRoot: Element,
    view: Window,
    private readonly fetchCss: FetchCss | null,
    private readonly onAsyncChange: () => void,
  ) {
    this.vars = new VarResolver(varRoot, view);
  }

  /** Exclusion suffix applied to every emitted selector; changing it requires `invalidate()`. */
  setSuffix(suffix: string): void {
    this.suffix = suffix;
  }

  /** Drop computed output (mapper changed) but keep fetched cross-origin sources. */
  invalidate(): void {
    this.vars.reset();
    this.outputs.clear();
    this.stats.rulesGenerated = 0;
  }

  reset(): void {
    this.outputs.clear();
    this.crossOrigin.clear();
    this.inFlight.clear();
    this.stats.sheetsRewritten = 0;
    this.stats.sheetsFailed = 0;
    this.stats.rulesGenerated = 0;
  }

  /** Rewrites new or changed sheets. Returns true when the combined output changed. */
  scan(mapper: Mapper): boolean {
    let changed = false;
    this.vars.reset(); // variables may have been defined by sheets that just loaded
    for (const sheet of this.getSheets()) {
      if (isOwnedSheet(sheet)) continue;
      const owner = sheet.ownerNode;
      if (owner instanceof Element && owner.hasAttribute('data-udm-owned')) continue;
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        this.requestCrossOrigin(sheet, mapper);
        const cached = sheet.href ? this.crossOrigin.get(sheet.href) : undefined;
        if (cached && !this.outputs.has(sheet)) {
          this.store(sheet, cached.cssRules, mapper);
          changed = true;
        }
        continue;
      }
      const prev = this.outputs.get(sheet);
      if (prev && prev.ruleCount === rules.length) continue;
      this.store(sheet, rules, mapper);
      changed = true;
    }
    return changed;
  }

  private store(sheet: CSSStyleSheet, rules: CSSRuleList, mapper: Mapper): void {
    const prev = this.outputs.get(sheet);
    if (prev) this.stats.rulesGenerated -= prev.rules;
    try {
      const { css, rules: n } = rewriteSheet(rules, sheet.media.mediaText, mapper, this.vars, this.suffix);
      this.outputs.set(sheet, { ruleCount: rules.length, css, rules: n });
      this.stats.rulesGenerated += n;
      this.stats.sheetsRewritten++;
    } catch (err) {
      // One broken sheet must never take the whole page down: skip it and carry on.
      console.error('[UDM] could not rewrite a stylesheet; leaving it as is', err);
      this.outputs.set(sheet, { ruleCount: rules.length, css: '', rules: 0 });
      this.stats.sheetsFailed++;
    }
  }

  private requestCrossOrigin(sheet: CSSStyleSheet, mapper: Mapper): void {
    const href = sheet.href;
    if (!href || !this.fetchCss || this.crossOrigin.has(href) || this.inFlight.has(href)) return;
    this.inFlight.add(href);
    void this.fetchCss(href)
      .then((text) => {
        const parsed = new CSSStyleSheet();
        if (text) parsed.replaceSync(text);
        this.crossOrigin.set(href, text ? parsed : null);
        if (!text) this.stats.sheetsFailed++;
        else this.store(sheet, parsed.cssRules, mapper);
        this.onAsyncChange();
      })
      .catch(() => {
        this.crossOrigin.set(href, null);
        this.stats.sheetsFailed++;
      })
      .finally(() => this.inFlight.delete(href));
  }

  css(): string {
    let out = '';
    for (const o of this.outputs.values()) out += o.css;
    return out;
  }
}
