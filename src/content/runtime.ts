import { siteKeyFromUrl } from '../shared/domain';
import {
  isContentRequest,
  type ContentRequest,
  type ContentResponse,
  type PageStatus,
  type RuntimeState,
} from '../shared/messages';
import { getTheme } from '../themes/theme-registry';
import { resolveOverrides } from '../engine/overrides/override-manager';
import { DarkEngine } from '../engine/transformation/engine';
import {
  resolveEffectiveSettings,
  type EffectiveSettings,
  type ExtensionSettings,
} from '../storage/settings.schema';
import { chromeLocalArea, onSettingsChanged, StorageManager } from '../storage/storage-manager';
import { watchNavigation } from './navigation-detector';

async function fetchStylesheet(url: string): Promise<string | null> {
  try {
    const res = (await chrome.runtime.sendMessage({ type: 'FETCH_STYLESHEET', url })) as
      | { ok: true; css: string }
      | { ok: false }
      | undefined;
    return res && res.ok ? res.css : null;
  } catch {
    return null;
  }
}

/**
 * Content-script runtime: resolves this site's effective settings and drives the engine.
 * Everything reactive (storage changes, OS appearance changes) funnels into `apply`.
 */
export class Runtime {
  private state: RuntimeState = 'idle';
  private unsubscribe: (() => void) | null = null;
  private lastSettings: ExtensionSettings | null = null;
  private appliedKey = '';
  private stopNavigation: (() => void) | null = null;
  private readonly siteKey = siteKeyFromUrl(location.href);
  private readonly storage = new StorageManager(chromeLocalArea());
  private readonly media = window.matchMedia('(prefers-color-scheme: dark)');
  private readonly engine = new DarkEngine({
    fetchStylesheet,
    onNativeDark: () => this.handleNativeDark(),
  });

  async start(): Promise<void> {
    chrome.runtime.onMessage.addListener(this.onMessage);
    this.unsubscribe = onSettingsChanged((s) => this.apply(s));
    this.media.addEventListener('change', this.onSystemChange);
    this.stopNavigation = watchNavigation(() => this.engine.rescan());
    try {
      this.apply(await this.storage.load());
    } catch (err) {
      this.fail(err);
    }
  }

  stop(): void {
    this.engine.stop();
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.stopNavigation?.();
    this.stopNavigation = null;
    this.media.removeEventListener('change', this.onSystemChange);
    chrome.runtime.onMessage.removeListener(this.onMessage);
    this.state = 'idle';
  }

  private readonly onSystemChange = (): void => {
    if (this.lastSettings) this.apply(this.lastSettings);
  };

  private apply(settings: ExtensionSettings): void {
    this.lastSettings = settings;
    const eff = resolveEffectiveSettings(settings, this.siteKey, this.media.matches);
    const key = JSON.stringify(eff);
    if (key === this.appliedKey) return; // unrelated settings change: nothing to do
    this.appliedKey = key;
    try {
      if (eff.active) this.activate(eff);
      else this.deactivate();
    } catch (err) {
      this.fail(err);
    }
  }

  private activate(eff: EffectiveSettings): void {
    this.engine.start({
      theme: getTheme(eff.theme, eff.customTheme),
      brightness: eff.brightness,
      contrast: eff.contrast,
      skipNativeDark: eff.mode === 'auto',
      imageDimming: eff.imageDimming,
      ...resolveOverrides(this.siteKey, eff),
    });
    // start() can synchronously decide the page is already dark and stop itself.
    if (!this.engine.isRunning) return;
    document.documentElement.setAttribute('data-udm-active', '');
    this.state = 'active';
  }

  private deactivate(): void {
    this.engine.stop();
    document.documentElement.removeAttribute('data-udm-active');
    this.state = 'idle';
  }

  private handleNativeDark(): void {
    this.engine.stop();
    document.documentElement.removeAttribute('data-udm-active');
    this.state = 'skipped';
  }

  /** Errors must never break the host page: restore it and report. */
  private fail(err: unknown): void {
    console.error('[UDM] engine error, restoring page', err);
    this.appliedKey = '';
    try {
      this.engine.stop();
    } catch {
      /* already stopped */
    }
    document.documentElement.removeAttribute('data-udm-active');
    this.state = 'error';
  }

  private status(): PageStatus {
    return {
      siteKey: this.siteKey,
      state: this.state,
      stats: this.engine.isRunning ? this.engine.getStats() : null,
    };
  }

  private readonly onMessage = (
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (r: ContentResponse<ContentRequest>) => void,
  ): boolean => {
    if (sender.id !== chrome.runtime.id || !isContentRequest(message)) return false;
    switch (message.type) {
      case 'PING':
        sendResponse({ ok: true, pong: true });
        break;
      case 'GET_PAGE_STATUS':
        sendResponse({ ok: true, status: this.status() });
        break;
    }
    return false;
  };
}
