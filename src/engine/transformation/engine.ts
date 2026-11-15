import type { EngineStats } from '../../shared/messages';
import type { Theme } from '../../themes/theme.types';
import { ContrastChecker, inlineOverride } from '../analyzer/element-analysis';
import { formatRgba, parseColor } from '../colors/color';
import { createMapper, type Mapper } from '../colors/mapping';
import { relativeLuminance } from '../colors/contrast';
import { rgbToOklch } from '../colors/oklch';
import { generatePalette, type Palette } from '../colors/palette';
import { dimDeclaration } from '../media/image-protection';
import { PROTECTED_MEDIA_SELECTORS } from '../media/media-detector';
import { analyzeTexture, cachedTexture, singleImageUrl, TEXTURE_DECLARATION } from '../media/texture-handler';
import { summarizeMutations } from '../observation/mutation-processor';
import { ProcessingQueue } from '../observation/processing-queue';
import { SheetCollector, type FetchCss } from '../sheets/sheet-collector';
import { augmentSelectors, exclusionSuffix } from '../sheets/selector';
import { OwnedSheet } from './css-injector';
import { baseCss } from './style-generator';
import { addToken, hasTokenKind, stripKind, TokenSheet } from './token-sheet';

export interface EngineOptions {
  theme: Theme;
  brightness: number;
  contrast: number;
  /** In "auto" mode, pages that are already dark are left alone. */
  skipNativeDark: boolean;
  /** Dim large photos and videos slightly (a separate, optional setting). */
  imageDimming: boolean;
  /** Subtrees matching these selectors keep their original appearance. */
  excludedSelectors: string[];
  /** selector -> background color. Validated upstream (colors only, never raw CSS). */
  customOverrides: Record<string, string>;
}

export type { EngineStats };

export interface EngineDeps {
  doc?: Document;
  fetchStylesheet?: FetchCss | null;
  /** Called when `skipNativeDark` is set and the page turned out to be dark already. */
  onNativeDark?: () => void;
}

/** Event dispatched by the optional MAIN-world hook when CSS is mutated through the CSSOM. */
export const CSS_CHANGED_EVENT = 'udm:css-changed';

const BATCH = 100;

/** An open shadow root being processed: its own page sheets, rewritten, plus an observer. */
interface ShadowScope {
  root: ShadowRoot;
  collector: SheetCollector;
  main: OwnedSheet;
  observer: MutationObserver;
  timer: ReturnType<typeof setTimeout> | null;
}

/**
 * Orchestrates the three layers:
 *  A. a semantic base (canvas, default text, color-scheme),
 *  B. the page's own stylesheets rewritten into dark overrides (covers :hover, media
 *     queries and any state not currently active),
 *  C. per-element analysis for inline styles, light surfaces missed by B, SVG paint,
 *     banner text and a contrast safety net.
 * Everything lives in extension-owned stylesheets plus a `data-udm` token attribute, so
 * `stop()` restores the original page exactly. Open shadow roots are processed with the
 * same pipeline (their own sheets rewritten, the shared token sheet adopted).
 */
export class DarkEngine {
  private readonly doc: Document;
  private readonly win: Window;
  private readonly main: OwnedSheet;
  private readonly tokens: TokenSheet;
  private readonly collector: SheetCollector;
  private readonly queue: ProcessingQueue;
  private readonly scopes = new WeakMap<ShadowRoot, ShadowScope>();
  private scopeRefs = new Set<WeakRef<ShadowScope>>();
  private checker: ContrastChecker | null = null;
  private opts: EngineOptions | null = null;
  private excludeSelector = '';
  private palette: Palette | null = null;
  private mapper: Mapper | null = null;
  private readonly texturePending = new Map<string, Set<WeakRef<Element>>>();
  private running = false;
  private observer: MutationObserver | null = null;
  private drainTimer: ReturnType<typeof setTimeout> | null = null;
  private scanTimer: ReturnType<typeof setTimeout> | null = null;
  private startedAt = 0;
  private initialMs = 0;
  private initialDone = false;
  private elementsProcessed = 0;

  constructor(private readonly deps: EngineDeps = {}) {
    this.doc = deps.doc ?? document;
    this.win = this.doc.defaultView ?? window;
    this.main = new OwnedSheet(this.doc);
    this.tokens = new TokenSheet(this.doc);
    this.queue = new ProcessingQueue(this.doc, (root) => this.attachShadowScope(root));
    this.collector = new SheetCollector(
      () => [...Array.from(this.doc.styleSheets), ...this.doc.adoptedStyleSheets],
      this.doc.documentElement,
      this.win,
      deps.fetchStylesheet ?? null,
      () => this.onAsyncSheetReady(),
    );
  }

  get isRunning(): boolean {
    return this.running;
  }

  start(opts: EngineOptions): void {
    if (this.running) {
      this.update(opts);
      return;
    }
    this.running = true;
    this.startedAt = performance.now();
    this.initialDone = false;
    this.initialMs = 0;
    this.elementsProcessed = 0;
    this.applyOptions(opts);
    this.refreshMain(false);

    this.observer = new MutationObserver((records) => this.onMutations(records));
    this.observer.observe(this.doc, { childList: true, subtree: true });
    this.doc.addEventListener('load', this.onResourceLoad, true);
    this.doc.addEventListener('DOMContentLoaded', this.onReady);
    this.win.addEventListener('load', this.onWindowLoad);
    this.win.addEventListener(CSS_CHANGED_EVENT, this.onCssChanged);
    if (this.doc.readyState !== 'loading') this.onReady();
  }

  /** Re-theme without a reload and without flashing the original page. */
  update(opts: EngineOptions): void {
    if (!this.running) return;
    this.applyOptions(opts);
    this.collector.invalidate();
    this.resetTokens();
    this.refreshMain(false);
    for (const scope of this.liveScopes()) {
      this.configureScope(scope);
      scope.collector.invalidate();
      this.refreshScope(scope, false);
    }
    this.queueFull();
  }

  /**
   * Re-examine the whole page: used after SPA navigations, where content is swapped without
   * a load. Sheets are rescanned incrementally; elements get one full (cheap, cached) pass.
   */
  rescan(): void {
    if (!this.running) return;
    this.refreshMain(true);
    for (const scope of this.liveScopes()) this.refreshScope(scope, true);
    this.queueFull();
  }

  /** Fully restores the page: stops work, removes sheets, attributes and caches. */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.observer?.disconnect();
    this.observer = null;
    this.doc.removeEventListener('load', this.onResourceLoad, true);
    this.doc.removeEventListener('DOMContentLoaded', this.onReady);
    this.win.removeEventListener('load', this.onWindowLoad);
    this.win.removeEventListener(CSS_CHANGED_EVENT, this.onCssChanged);
    if (this.drainTimer) clearTimeout(this.drainTimer);
    if (this.scanTimer) clearTimeout(this.scanTimer);
    this.drainTimer = this.scanTimer = null;
    this.queue.clear();
    this.sweepAttributes();
    for (const scope of this.liveScopes()) {
      scope.observer.disconnect();
      if (scope.timer) clearTimeout(scope.timer);
      scope.main.remove();
      scope.collector.reset();
    }
    this.scopeRefs.clear();
    this.tokens.remove();
    this.main.remove();
    this.collector.reset();
    this.checker = null;
    this.palette = null;
    this.mapper = null;
    this.opts = null;
  }

  getStats(): EngineStats {
    let rules = this.collector.stats.rulesGenerated + this.tokens.ruleCount;
    let sheets = this.collector.stats.sheetsRewritten;
    let failed = this.collector.stats.sheetsFailed;
    for (const scope of this.liveScopes()) {
      rules += scope.collector.stats.rulesGenerated;
      sheets += scope.collector.stats.sheetsRewritten;
      failed += scope.collector.stats.sheetsFailed;
    }
    return {
      initialMs: Math.round(this.initialMs * 10) / 10,
      elementsProcessed: this.elementsProcessed,
      rulesGenerated: rules,
      sheetsRewritten: sheets,
      sheetsFailed: failed,
    };
  }

  // ---- setup -------------------------------------------------------------------------

  private suffix(): string {
    return exclusionSuffix(this.opts?.excludedSelectors ?? [], PROTECTED_MEDIA_SELECTORS);
  }

  private applyOptions(opts: EngineOptions): void {
    this.opts = opts;
    this.palette = generatePalette(opts.theme, opts.brightness, opts.contrast);
    this.mapper = createMapper(this.palette);
    // Media elements are always protected; user exclusions are added on top.
    this.collector.setSuffix(this.suffix());
    this.excludeSelector = opts.excludedSelectors.join(',');
    if (this.checker) this.checker.setPalette(this.palette);
    else this.checker = new ContrastChecker(this.win, this.palette);
  }

  /** Rebuild the main sheet (base + rewritten page sheets). */
  private refreshMain(onlyIfChanged: boolean): void {
    if (!this.running || !this.palette || !this.mapper) return;
    const changed = this.collector.scan(this.mapper);
    if (onlyIfChanged && !changed) return;
    this.main.setText(this.mainCss());
    if (changed && this.initialDone) this.queueFull();
  }

  private mainCss(): string {
    return this.palette ? baseCss(this.palette) + this.collector.css() + this.overridesCss() : '';
  }

  /** User color overrides, boosted (3 x :not(#_u)) so they beat the page's own rules. */
  private overridesCss(): string {
    const overrides = this.opts?.customOverrides;
    if (!overrides) return '';
    let css = '';
    for (const [selector, color] of Object.entries(overrides)) {
      css += `${augmentSelectors(selector, ':not(#_u):not(#_u):not(#_u)')}{background-color:${color}!important}`;
    }
    return css;
  }

  /**
   * A cross-origin sheet finished fetching and its output was stored by the collector.
   * The rescan inside refreshMain would see nothing new, so rebuild unconditionally.
   */
  private onAsyncSheetReady(): void {
    if (!this.running || !this.palette) return;
    this.main.setText(this.mainCss());
    if (this.initialDone) this.queueFull();
  }

  private sweepAttributes(): void {
    for (const el of Array.from(this.doc.querySelectorAll('[data-udm]'))) el.removeAttribute('data-udm');
    for (const scope of this.liveScopes()) {
      for (const el of Array.from(scope.root.querySelectorAll('[data-udm]'))) el.removeAttribute('data-udm');
    }
  }

  private resetTokens(): void {
    this.sweepAttributes();
    this.tokens.clear();
  }

  // ---- shadow DOM --------------------------------------------------------------------

  private liveScopes(): ShadowScope[] {
    const out: ShadowScope[] = [];
    for (const ref of this.scopeRefs) {
      const scope = ref.deref();
      if (scope && scope.root.host.isConnected) out.push(scope);
      else this.scopeRefs.delete(ref);
    }
    return out;
  }

  private configureScope(scope: ShadowScope): void {
    scope.collector.setSuffix(this.suffix());
  }

  /** Called by the queue when it meets an open shadow root. */
  private attachShadowScope(root: ShadowRoot): void {
    if (!this.running || this.scopes.has(root) || !this.main.constructable) return;
    const main = new OwnedSheet(this.doc, root);
    const collector = new SheetCollector(
      () => [...Array.from(root.styleSheets), ...root.adoptedStyleSheets],
      root.host,
      this.win,
      this.deps.fetchStylesheet ?? null,
      () => this.refreshScope(scope, false),
    );
    const observer = new MutationObserver((records) => this.onMutations(records, scope));
    const scope: ShadowScope = { root, collector, main, observer, timer: null };
    this.scopes.set(root, scope);
    this.scopeRefs.add(new WeakRef(scope));
    this.configureScope(scope);
    this.tokens.attachTo(root);
    observer.observe(root, { childList: true, subtree: true });
    this.refreshScope(scope, false);
  }

  private refreshScope(scope: ShadowScope, onlyIfChanged: boolean): void {
    if (!this.running || !this.mapper) return;
    const changed = scope.collector.scan(this.mapper);
    if (onlyIfChanged && !changed) return;
    scope.main.setText(scope.collector.css());
    if (changed && this.initialDone) for (const child of Array.from(scope.root.children)) this.queue.add(child);
    if (changed && this.initialDone) this.scheduleDrain();
  }

  // ---- events ------------------------------------------------------------------------

  private readonly onResourceLoad = (e: Event): void => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (t.tagName === 'LINK') this.scheduleScan();
    else if (t.tagName === 'IMG' && this.opts?.imageDimming) {
      this.queue.add(t);
      this.scheduleDrain();
    }
  };

  private readonly onCssChanged = (): void => this.scheduleScan();

  private readonly onReady = (): void => {
    if (!this.running) return;
    this.refreshMain(false);
    if (this.opts?.skipNativeDark && this.isNativeDark()) {
      this.deps.onNativeDark?.();
      return;
    }
    this.queueFull();
  };

  private readonly onWindowLoad = (): void => {
    if (!this.running) return;
    this.refreshMain(true);
    this.queueFull();
  };

  private onMutations(records: MutationRecord[], scope?: ShadowScope): void {
    const { added, sheetsChanged } = summarizeMutations(records);
    for (const el of added) this.queue.add(el);
    if (sheetsChanged) {
      if (scope) this.scheduleScopeScan(scope);
      else this.scheduleScan();
    }
    if (this.queue.size) this.scheduleDrain();
  }

  private scheduleScan(): void {
    if (this.scanTimer || !this.running) return;
    this.scanTimer = setTimeout(() => {
      this.scanTimer = null;
      this.refreshMain(true);
      for (const scope of this.liveScopes()) this.refreshScope(scope, true);
    }, 40);
  }

  private scheduleScopeScan(scope: ShadowScope): void {
    if (scope.timer || !this.running) return;
    scope.timer = setTimeout(() => {
      scope.timer = null;
      this.refreshScope(scope, true);
    }, 40);
  }

  // ---- native dark detection ---------------------------------------------------------

  /** Temporarily blanks our sheet to measure the page's own canvas color. */
  private isNativeDark(): boolean {
    if (!this.palette) return false;
    this.main.setText('');
    try {
      const view = this.win;
      const read = (el: Element | null) => (el ? parseColor(view.getComputedStyle(el).backgroundColor) : null);
      const body = read(this.doc.body);
      const html = read(this.doc.documentElement);
      const bg = body && body.a > 0.5 ? body : html && html.a > 0.5 ? html : null;
      if (bg) return rgbToOklch(bg).l < 0.3;
      // No solid canvas color (gradient or image background): judge by the text. Light body
      // text can only be readable if the page paints something dark behind it.
      const fg = this.doc.body ? parseColor(view.getComputedStyle(this.doc.body).color) : null;
      return fg !== null && fg.a > 0.5 && relativeLuminance(fg) > 0.5;
    } finally {
      this.main.setText(this.mainCss());
    }
  }

  // ---- incremental processing --------------------------------------------------------

  private queueFull(): void {
    this.queue.addFull();
    this.scheduleDrain(0);
  }

  private scheduleDrain(delay = this.doc.readyState === 'loading' ? 60 : 0): void {
    if (this.drainTimer || !this.running) return;
    this.drainTimer = setTimeout(this.drain, delay);
  }

  private readonly drain = (): void => {
    this.drainTimer = null;
    if (!this.running) return;
    const batch = this.queue.next(BATCH);
    if (batch.length === 0) {
      if (!this.initialDone && this.doc.readyState !== 'loading') {
        this.initialDone = true;
        this.initialMs = performance.now() - this.startedAt;
      }
      return;
    }
    try {
      this.processBatch(batch);
    } catch (err) {
      console.error('[UDM] element pass failed', err);
    }
    this.scheduleDrain(0);
  };

  private isExcluded(el: Element): boolean {
    if (!this.excludeSelector) return false;
    try {
      return el.closest(this.excludeSelector) !== null;
    } catch {
      return false;
    }
  }

  private matchesExclusion(el: Element): boolean {
    if (!this.excludeSelector) return false;
    try {
      return el.matches(this.excludeSelector);
    } catch {
      return false;
    }
  }

  /**
   * An excluded subtree keeps its own rules, but would still inherit our dark text color and
   * show our dark page through transparent backgrounds. Pin the page's ORIGINAL text color and
   * backdrop on each excluded root so it looks exactly as it did.
   */
  private pinExcludedRoots(roots: Element[]): void {
    this.main.setText('');
    this.tokens.suspend();
    let pins: Array<[Element, string]>;
    try {
      pins = roots.map((el) => {
        const color = this.win.getComputedStyle(el).color;
        let backdrop = 'rgb(255, 255, 255)';
        for (let e: Element | null = el; e; e = e.parentElement) {
          const c = parseColor(this.win.getComputedStyle(e).backgroundColor);
          if (c && c.a >= 0.99) {
            backdrop = formatRgba(c);
            break;
          }
        }
        const own = parseColor(this.win.getComputedStyle(el).backgroundColor);
        const decl = own && own.a > 0 ? `color:${color}!important` : `color:${color}!important;background-color:${backdrop}!important`;
        return [el, decl] as [Element, string];
      });
    } finally {
      this.main.setText(this.mainCss());
      this.tokens.resume();
    }
    for (const [el, decl] of pins) addToken(el, this.tokens.idFor('x', decl));
  }

  /** Reads the page's own text colors by briefly disabling every extension sheet. */
  private readOriginalColors(els: Element[]): Array<[Element, string]> {
    this.main.setText('');
    this.tokens.suspend();
    try {
      return els.map((el) => [el, this.win.getComputedStyle(el).color] as [Element, string]);
    } finally {
      this.main.setText(this.mainCss());
      this.tokens.resume();
    }
  }

  /**
   * Elements painted by a single small url() image: apply the blend token if the image is
   * known to be a light flat texture; otherwise analyze it once and re-queue the elements.
   */
  private applyTextures(els: Element[]): void {
    const reads: Array<[Element, string]> = [];
    for (const el of els) {
      const cs = this.win.getComputedStyle(el);
      const url = singleImageUrl(cs.backgroundImage);
      // Textures tile; a photo banner is `no-repeat` or `cover`/`contain`.
      const tiles = cs.backgroundRepeat !== 'no-repeat' && !/cover|contain/.test(cs.backgroundSize);
      if (url && tiles) reads.push([el, url]);
      else if (hasTokenKind(el, 't')) reads.push([el, '']);
    }
    for (const [el, url] of reads) {
      const verdict = url ? cachedTexture(url) : 'other';
      if (verdict === 'light') {
        stripKind(el, 't');
        addToken(el, this.tokens.idFor('t', TEXTURE_DECLARATION));
      } else {
        stripKind(el, 't');
        if (verdict === undefined) this.analyzeTextureFor(url, el);
      }
    }
  }

  private analyzeTextureFor(url: string, el: Element): void {
    let waiting = this.texturePending.get(url);
    if (waiting) {
      waiting.add(new WeakRef(el));
      return;
    }
    waiting = new Set([new WeakRef(el)]);
    this.texturePending.set(url, waiting);
    void analyzeTexture(url, this.doc).then((verdict) => {
      const refs = this.texturePending.get(url);
      this.texturePending.delete(url);
      if (!this.running || verdict !== 'light' || !refs) return;
      for (const ref of refs) {
        const target = ref.deref();
        if (target?.isConnected) this.queue.add(target);
      }
      this.scheduleDrain(0);
    });
  }

  /** Reads and writes are separated per batch to avoid layout thrashing. */
  private processBatch(all: Element[]): void {
    const mapper = this.mapper;
    const checker = this.checker;
    const opts = this.opts;
    if (!mapper || !checker || !opts) return;
    if (this.excludeSelector) {
      const roots = all.filter((el) => this.matchesExclusion(el) && !hasTokenKind(el, 'x'));
      if (roots.length) this.pinExcludedRoots(roots);
    }
    const els = this.excludeSelector ? all.filter((el) => !this.isExcluded(el)) : all;

    // Phase 1: inline-style overrides (CSSOM reads only, then attribute writes).
    for (const el of els) {
      if (el.hasAttribute('data-udm')) stripKind(el, 'i');
      const decl = inlineOverride(el, mapper);
      if (decl) addToken(el, this.tokens.idFor('i', decl));
    }

    // Phase 2: surfaces still light after rewriting, and image dimming (reads), then writes.
    checker.resetCache();
    const surfaces: Array<[Element, string]> = [];
    const dims: Array<[Element, string]> = [];
    for (const el of els) {
      const decl = checker.surface(el, mapper);
      if (decl) surfaces.push([el, decl]);
      const dim = dimDeclaration(el, opts.imageDimming, this.win);
      if (dim) dims.push([el, dim]);
    }
    for (const [el, decl] of surfaces) {
      stripKind(el, 's');
      addToken(el, this.tokens.idFor('s', decl));
    }
    for (const [el, decl] of dims) {
      stripKind(el, 'm');
      addToken(el, this.tokens.idFor('m', decl));
    }
    if (!opts.imageDimming) {
      for (const el of els) if (el.tagName === 'IMG' && el.hasAttribute('data-udm')) stripKind(el, 'm');
    }

    // Phase 2b: light flat texture images (white page columns, title bars) darkened by blending.
    this.applyTextures(els);

    // Phase 3: contrast, SVG paint and banner-text checks against final computed styles.
    checker.resetCache();
    const fixes: Array<[Element, string]> = [];
    const svgFixes: Array<[Element, string]> = [];
    const overBanner: Element[] = [];
    for (const el of els) {
      if (checker.overImage(el)) {
        if (!hasTokenKind(el, 'o')) overBanner.push(el);
        continue;
      }
      const decl = checker.check(el);
      if (decl) fixes.push([el, decl]);
      const svg = checker.svg(el);
      if (svg) svgFixes.push([el, svg]);
    }
    for (const [el, decl] of fixes) {
      stripKind(el, 'f');
      addToken(el, this.tokens.idFor('f', decl));
    }
    for (const [el, decl] of svgFixes) {
      stripKind(el, 'v');
      addToken(el, this.tokens.idFor('v', decl));
    }
    if (overBanner.length) {
      for (const [el, color] of this.readOriginalColors(overBanner.slice(0, 80))) {
        addToken(el, this.tokens.idFor('o', `color:${color}!important`));
      }
    }
    this.elementsProcessed += els.length;
  }
}
