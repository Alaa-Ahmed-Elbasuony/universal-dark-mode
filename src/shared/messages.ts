import type { SiteKey } from './domain';

export interface EngineStats {
  initialMs: number;
  elementsProcessed: number;
  rulesGenerated: number;
  sheetsRewritten: number;
  sheetsFailed: number;
}

/** `skipped`: automatic mode found the page already dark and left it unchanged. */
export type RuntimeState = 'idle' | 'active' | 'unsupported' | 'error' | 'skipped';

export interface PageStatus {
  siteKey: SiteKey | null;
  state: RuntimeState;
  stats: EngineStats | null;
}

/** Requests handled by the content script. */
export type ContentRequest = { type: 'PING' } | { type: 'GET_PAGE_STATUS' };

/** Requests handled by the service worker. */
export type BackgroundRequest =
  | { type: 'GET_ACCESS_STATE' }
  | { type: 'APPLY_TO_TAB'; tabId: number }
  | { type: 'FETCH_STYLESHEET'; url: string };

export type ContentResponse<T extends ContentRequest> = T extends { type: 'PING' }
  ? { ok: true; pong: true }
  : T extends { type: 'GET_PAGE_STATUS' }
    ? { ok: true; status: PageStatus }
    : never;

export type BackgroundResponse<T extends BackgroundRequest> = T extends {
  type: 'GET_ACCESS_STATE';
}
  ? { ok: true; allSites: boolean }
  : T extends { type: 'APPLY_TO_TAB' }
    ? { ok: true } | { ok: false; error: string }
    : T extends { type: 'FETCH_STYLESHEET' }
      ? { ok: true; css: string } | { ok: false; error: string }
      : never;

export function isContentRequest(v: unknown): v is ContentRequest {
  if (typeof v !== 'object' || v === null) return false;
  const t = (v as { type?: unknown }).type;
  return t === 'PING' || t === 'GET_PAGE_STATUS';
}

export function isBackgroundRequest(v: unknown): v is BackgroundRequest {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as { type?: unknown; tabId?: unknown; url?: unknown };
  switch (o.type) {
    case 'GET_ACCESS_STATE':
      return true;
    case 'APPLY_TO_TAB':
      return typeof o.tabId === 'number';
    case 'FETCH_STYLESHEET':
      return typeof o.url === 'string';
    default:
      return false;
  }
}

export function sendToBackground<T extends BackgroundRequest>(
  req: T,
): Promise<BackgroundResponse<T>> {
  return chrome.runtime.sendMessage(req) as Promise<BackgroundResponse<T>>;
}

export function sendToTab<T extends ContentRequest>(
  tabId: number,
  req: T,
): Promise<ContentResponse<T>> {
  return chrome.tabs.sendMessage(tabId, req) as Promise<ContentResponse<T>>;
}
