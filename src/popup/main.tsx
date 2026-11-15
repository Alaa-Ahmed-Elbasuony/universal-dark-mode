import { StrictMode, useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { isRestrictedUrl, siteKeyFromUrl } from '../shared/domain';
import { sendToBackground, sendToTab, type PageStatus } from '../shared/messages';
import {
  defaultSettings,
  resolveEffectiveSettings,
  type ExtensionSettings,
  type SiteSettings,
} from '../storage/settings.schema';
import { chromeLocalArea, StorageManager } from '../storage/storage-manager';
import { THEME_LIST } from '../themes/theme-registry';
import type { ThemeId } from '../themes/theme.types';
import './popup.css';

const storage = new StorageManager(chromeLocalArea());

interface TabInfo {
  id: number;
  url: string;
  siteKey: string | null;
  /** Match pattern for the tab's origin, e.g. https://example.com/* */
  pattern: string | null;
  supported: boolean;
}

/** The popup normally targets the active tab. `?tabId=` lets tests/devtools target another. */
async function resolveTab(): Promise<TabInfo | null> {
  const wanted = Number(new URLSearchParams(location.search).get('tabId'));
  const tab = wanted
    ? await chrome.tabs.get(wanted)
    : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (!tab || tab.id === undefined) return null;
  const url = tab.url ?? '';
  let pattern: string | null = null;
  try {
    const u = new URL(url);
    if (u.protocol === 'http:' || u.protocol === 'https:') pattern = `${u.origin}/*`;
  } catch {
    /* unsupported URL */
  }
  return { id: tab.id, url, siteKey: siteKeyFromUrl(url), pattern, supported: !!pattern && !isRestrictedUrl(url) };
}

function Popup() {
  const [settings, setSettings] = useState<ExtensionSettings>(defaultSettings());
  const [tab, setTab] = useState<TabInfo | null>(null);
  const [hasAccess, setHasAccess] = useState(false);
  const [page, setPage] = useState<PageStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const refreshPage = useCallback(async (t: TabInfo | null) => {
    if (!t?.supported) return setPage(null);
    try {
      setPage((await sendToTab(t.id, { type: 'GET_PAGE_STATUS' })).status);
    } catch {
      setPage(null); // no content script in this tab (yet)
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const [s, t] = await Promise.all([storage.load(), resolveTab()]);
        setSettings(s);
        setTab(t);
        if (t?.pattern) setHasAccess(await chrome.permissions.contains({ origins: [t.pattern] }));
        await refreshPage(t);
      } catch (err) {
        setFatal(String(err));
      } finally {
        setLoaded(true);
      }
    })();
  }, [refreshPage]);

  /** Optimistic write: update the UI at once, roll back if persisting fails. */
  const mutate = async (fn: (s: ExtensionSettings) => void): Promise<boolean> => {
    const previous = settingsRef.current;
    const optimistic = structuredClone(previous);
    fn(optimistic);
    setSettings(optimistic);
    try {
      setSettings(await storage.update(fn));
      return true;
    } catch (err) {
      setSettings(previous);
      setMessage(`Could not save: ${String(err)}`);
      return false;
    }
  };

  const patchSite = (patch: SiteSettings) => async () => {
    const key = tab?.siteKey;
    if (!key) return;
    await mutate((s) => {
      s.sites[key] = { ...s.sites[key], ...patch };
    });
  };

  const eff = resolveEffectiveSettings(settings, tab?.siteKey ?? null, matchMedia('(prefers-color-scheme: dark)').matches);
  const siteOn = hasAccess && eff.active;

  const toggleSite = async () => {
    if (!tab?.supported || !tab.pattern || !tab.siteKey || busy) return;
    setMessage(null);
    if (siteOn) {
      await patchSite({ mode: 'disabled' })();
      setTimeout(() => void refreshPage(tab), 300);
      return;
    }
    setBusy(true);
    try {
      // Must be the first await so Chrome still sees the user gesture.
      const granted = hasAccess || (await chrome.permissions.request({ origins: [tab.pattern] }));
      if (!granted) {
        setMessage('Permission was not granted, so dark mode can’t run on this site.');
        return;
      }
      setHasAccess(true);
      const key = tab.siteKey;
      const ok = await mutate((s) => {
        s.global.enabled = true;
        s.sites[key] = { ...s.sites[key], mode: 'forced' };
      });
      if (!ok) return;
      const res = await sendToBackground({ type: 'APPLY_TO_TAB', tabId: tab.id });
      if (!res.ok) setMessage(`Could not start on this page: ${res.error}`);
      setTimeout(() => void refreshPage(tab), 400);
    } finally {
      setBusy(false);
    }
  };

  if (fatal) return <main className="popup"><p className="error" role="alert">Something went wrong: {fatal}</p></main>;
  if (!loaded) return <main className="popup" aria-busy="true"><p className="hint">Loading…</p></main>;

  const siteSettings = tab?.siteKey ? settings.sites[tab.siteKey] : undefined;
  const stats = page?.stats;

  return (
    <main className="popup">
      <header className="head">
        <div className="logo" aria-hidden="true" />
        <div>
          <h1>Universal Dark Mode</h1>
          <p className="sub" data-testid="site">
            {tab?.supported ? tab.siteKey : 'This page can’t be changed by extensions'}
          </p>
        </div>
      </header>

      <section className="card" aria-label="This site">
        <div className="row">
          <div>
            <strong id="site-label">Dark mode on this site</strong>
            <p className="hint" data-testid="state">
              {!tab?.supported
                ? 'Chrome doesn’t allow extensions here.'
                : siteOn
                  ? page?.state === 'active'
                    ? 'Active'
                    : page?.state === 'error'
                      ? 'Turned itself off after an error'
                      : page?.state === 'skipped'
                      ? 'Already dark, so left unchanged'
                      : 'On. Reload the page if it doesn’t change.'
                  : 'Off'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            className="switch"
            aria-checked={siteOn}
            aria-labelledby="site-label"
            disabled={!tab?.supported || busy}
            onClick={() => void toggleSite()}
          />
        </div>
        {tab?.supported && !hasAccess && (
          <p className="hint">Turning this on asks Chrome for access to {tab.siteKey} only.</p>
        )}
        {message && <p className="error" role="alert">{message}</p>}
        {stats && (
          <p className="stats" data-testid="stats">
            {stats.elementsProcessed} elements · {stats.rulesGenerated} rules · {stats.initialMs} ms
          </p>
        )}
      </section>

      {siteOn && (
        <section className="card" aria-label="Appearance">
          <div className="field">
            <label htmlFor="theme">Theme</label>
            <select
              id="theme"
              value={eff.theme}
              onChange={(e) => void patchSite({ theme: e.target.value as ThemeId })()}
            >
              {THEME_LIST.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="brightness">
              Brightness <span>{eff.brightness}</span>
            </label>
            <input
              id="brightness"
              type="range"
              min={-50}
              max={50}
              value={eff.brightness}
              onChange={(e) => void patchSite({ brightness: Number(e.target.value) })()}
            />
          </div>
          <div className="field">
            <label htmlFor="contrast">
              Contrast <span>{eff.contrast}</span>
            </label>
            <input
              id="contrast"
              type="range"
              min={-50}
              max={50}
              value={eff.contrast}
              onChange={(e) => void patchSite({ contrast: Number(e.target.value) })()}
            />
          </div>
          {siteSettings && Object.keys(siteSettings).length > 1 && (
            <button
              type="button"
              className="link"
              onClick={() => {
                const key = tab?.siteKey;
                if (key) void mutate((s) => void (s.sites[key] = { mode: 'forced' }));
              }}
            >
              Reset appearance for this site
            </button>
          )}
        </section>
      )}

      <section className="card" aria-label="Everywhere">
        <div className="row">
          <label htmlFor="follow-system" className="hint">
            Follow system appearance
          </label>
          <button
            id="follow-system"
            type="button"
            role="switch"
            className="switch"
            aria-checked={settings.global.followSystem}
            onClick={() => void mutate((s) => void (s.global.followSystem = !s.global.followSystem))}
          />
        </div>
        <div className="row">
          <label htmlFor="global" className="hint">
            Pause on all sites
          </label>
          <button
            id="global"
            type="button"
            role="switch"
            className="switch"
            aria-checked={!settings.global.enabled}
            onClick={() => void mutate((s) => void (s.global.enabled = !s.global.enabled))}
          />
        </div>
      </section>

      <nav className="row" aria-label="Settings">
        {tab?.supported && tab.siteKey ? (
          <button
            type="button"
            className="link"
            onClick={() => void chrome.tabs.create({ url: chrome.runtime.getURL(`options.html#site=${encodeURIComponent(tab.siteKey!)}`) })}
          >
            Website settings
          </button>
        ) : (
          <span />
        )}
        <button type="button" className="link" onClick={() => void chrome.runtime.openOptionsPage()}>
          Global &amp; advanced settings
        </button>
      </nav>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Popup />
  </StrictMode>,
);
