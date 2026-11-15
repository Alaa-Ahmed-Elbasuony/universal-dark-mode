import { isBackgroundRequest, type BackgroundRequest, type BackgroundResponse } from '../shared/messages';
import { injectIntoTab } from './content-registration';
import { hasAllSitesAccess } from './permission-manager';

const MAX_CSS_BYTES = 5 * 1024 * 1024;

async function handle(req: BackgroundRequest): Promise<BackgroundResponse<BackgroundRequest>> {
  switch (req.type) {
    case 'GET_ACCESS_STATE':
      return { ok: true, allSites: await hasAllSitesAccess() };
    case 'APPLY_TO_TAB':
      try {
        await injectIntoTab(req.tabId);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    case 'FETCH_STYLESHEET':
      return fetchStylesheet(req.url);
  }
}

/** Cross-origin CSS proxy. Only http(s), only text/css, size-capped. */
async function fetchStylesheet(
  url: string,
): Promise<{ ok: true; css: string } | { ok: false; error: string }> {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return { ok: false, error: 'protocol' };
    const res = await fetch(u.href, { credentials: 'omit' });
    if (!res.ok) return { ok: false, error: `status ${res.status}` };
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('text/css')) return { ok: false, error: 'not css' };
    const css = await res.text();
    if (css.length > MAX_CSS_BYTES) return { ok: false, error: 'too large' };
    return { ok: true, css };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export function registerMessageRouter(): void {
  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    // Only accept messages from this extension's own contexts.
    if (sender.id !== chrome.runtime.id || !isBackgroundRequest(message)) return false;
    handle(message).then(sendResponse, (err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  });
}
