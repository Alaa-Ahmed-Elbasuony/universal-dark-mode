import { chromium, expect, test as base, type BrowserContext, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const DIST = resolve(process.cwd(), 'dist');
const PAGES = resolve(process.cwd(), 'tests/e2e/pages');
export const SITE_KEY = '127.0.0.1';

const CROSS_CSS = `.cross-box{background:#ffffff;color:#222222;border:1px solid #cccccc;padding:12px;margin-top:12px}`;

function listen(server: Server): Promise<string> {
  return new Promise((res) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      res(`http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`);
    });
  });
}

interface Servers {
  origin: string;
  crossOrigin: string;
  close(): void;
}

async function startServers(): Promise<Servers> {
  const cross = createServer((_req, r) => {
    r.setHeader('content-type', 'text/css');
    r.end(CROSS_CSS);
  });
  const crossOrigin = await listen(cross);
  const main = createServer((req, r) => {
    const name = (req.url ?? '/').split('?')[0]!.replace(/^\//, '') || 'light-site.html';
    try {
      const file = name.replace(/[^a-z0-9.-]/gi, '');
      const body = readFileSync(join(PAGES, file), 'utf8').replaceAll('__CROSS__', crossOrigin);
      r.setHeader('content-type', file.endsWith('.js') ? 'text/javascript' : 'text/html');
      r.end(body);
    } catch {
      r.statusCode = 404;
      r.end('not found');
    }
  });
  const origin = await listen(main);
  return { origin, crossOrigin, close: () => (main.close(), cross.close()) };
}

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
  origin: string;
  ext: Page;
}>({
  context: async ({}, use) => {
    const userDataDir = mkdtempSync(join(tmpdir(), 'udm-e2e-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chromium', // new headless mode, supports extensions
      args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent('serviceworker');
    const id = new URL(sw.url()).host;
    // First install opens the onboarding options page. Wait for it and close it so it
    // cannot race with navigations in the test body.
    const optionsUrl = `chrome-extension://${id}/options.html`;
    await expect
      .poll(() => context.pages().some((p) => p.url() === optionsUrl), {
        message: 'onboarding options page should open on first install',
        timeout: 10_000,
      })
      .toBe(true);
    await context.pages().find((p) => p.url() === optionsUrl)?.close();
    await use(id);
  },
  origin: async ({}, use) => {
    const servers = await startServers();
    await use(servers.origin);
    servers.close();
  },
  /** An extension page used to read/write chrome.storage and query tabs. */
  ext: async ({ context, extensionId }, use) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);
    await use(page);
    await page.close();
  },
});

export { expect };

/** Merge site (and optionally global) settings into stored settings. */
export async function patchSettings(
  ext: Page,
  patch: { site?: Record<string, unknown> | null; global?: Record<string, unknown> },
): Promise<void> {
  await ext.evaluate(
    async ({ patch, siteKey }) => {
      const key = 'udm.settings';
      const stored = (await chrome.storage.local.get(key))[key] as {
        global: Record<string, unknown>;
        sites: Record<string, unknown>;
      };
      if (patch.global) Object.assign(stored.global, patch.global);
      if (patch.site === null) delete stored.sites[siteKey];
      else if (patch.site) stored.sites[siteKey] = { ...(stored.sites[siteKey] as object), ...patch.site };
      await chrome.storage.local.set({ [key]: stored });
    },
    { patch, siteKey: SITE_KEY },
  );
}

/** Page state as reported by the content script (via the extension page). */
export async function pageStatus(
  ext: Page,
  pageUrl: string,
): Promise<{ state: string; stats: { elementsProcessed: number; rulesGenerated: number; sheetsRewritten: number; sheetsFailed: number; initialMs: number } | null } | null> {
  return ext.evaluate(async (url) => {
    const tabs = await chrome.tabs.query({ url });
    const id = tabs[0]?.id;
    if (id === undefined) return null;
    try {
      const res = await chrome.tabs.sendMessage(id, { type: 'GET_PAGE_STATUS' });
      return res.status;
    } catch {
      return null;
    }
  }, pageUrl);
}

/** Wait until the engine is active and the first full element pass has completed. */
export async function waitForDark(ext: Page, page: Page): Promise<void> {
  const url = page.url();
  await expect(page.locator('html')).toHaveAttribute('data-udm-active', '');
  await expect
    .poll(async () => (await pageStatus(ext, url))?.stats?.initialMs ?? 0, { timeout: 10_000 })
    .toBeGreaterThan(0);
}

export const luminance = (rgb: string): number => {
  const m = /rgba?\(([^)]+)\)/.exec(rgb);
  if (!m) throw new Error(`not a color: ${rgb}`);
  const [r = 0, g = 0, b = 0] = m[1]!.split(/[ ,/]+/).filter(Boolean).map(Number);
  const lin = (v: number) => ((v / 255) <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
