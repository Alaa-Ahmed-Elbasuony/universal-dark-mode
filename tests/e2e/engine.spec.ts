import type { Page } from '@playwright/test';
import { expect, luminance, patchSettings, pageStatus, test, waitForDark } from './fixtures';
import { findProblems, snapshot } from './helpers';

const bg = (page: Page, sel: string) => page.locator(sel).evaluate((e) => getComputedStyle(e).backgroundColor);
const fg = (page: Page, sel: string) => page.locator(sel).evaluate((e) => getComputedStyle(e).color);

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `test-results/visual/${name}.png`, fullPage: true });

test.describe('dark engine on a light site', () => {
  test('transforms surfaces, text, links, controls and keeps brand/media intact', async ({ context, ext, origin }) => {
    await patchSettings(ext, { site: { mode: 'disabled' } });
    const page = await context.newPage();
    await page.setViewportSize({ width: 900, height: 900 });
    await page.goto(`${origin}/light-site.html`);
    await shot(page, '01-original');
    const photoBefore = await page.locator('#photo').evaluate((e) => (e as HTMLImageElement).src);

    await patchSettings(ext, { site: { mode: 'forced', theme: 'midnight' } });
    await waitForDark(ext, page);
    await shot(page, '02-midnight');

    // Canvas and surfaces are dark, and the page's surface hierarchy survives.
    expect(luminance(await bg(page, 'body'))).toBeLessThan(0.03);
    const card = luminance(await bg(page, '#card'));
    expect(card).toBeLessThan(0.08);
    expect(card).toBeGreaterThan(luminance(await bg(page, 'body'))); // gray card sits above white page
    expect(luminance(await bg(page, '#themed'))).toBeLessThan(0.08); // via custom property

    // Text is light and readable.
    expect(luminance(await fg(page, '#card h2'))).toBeGreaterThan(0.5);
    expect(luminance(await fg(page, '#muted'))).toBeGreaterThan(0.25);
    const link = await fg(page, '#link');
    expect(luminance(link)).toBeGreaterThan(0.2);
    const [r, , b] = link.match(/\d+/g)!.map(Number);
    expect(b!).toBeGreaterThan(r!); // still blue

    // Intentional dark header is kept; brand button keeps its color.
    expect(await bg(page, 'header')).toBe('rgb(11, 31, 68)');
    expect(await bg(page, '#brand')).toBe('rgb(0, 102, 255)');
    // Dark text on a bright yellow brand button must stay readable (contrast safety net).
    expect(await bg(page, '#yellow')).toBe('rgb(255, 214, 10)');
    await expect.poll(async () => luminance(await fg(page, '#yellow'))).toBeLessThan(0.2);

    // Controls and tables.
    expect(luminance(await bg(page, '#name'))).toBeLessThan(0.08);
    expect(luminance(await fg(page, '#name'))).toBeGreaterThan(0.3);
    expect(luminance(await bg(page, '#alert'))).toBeLessThan(0.1);
    expect(luminance(await bg(page, 'th:first-child'))).toBeLessThan(0.1);

    // Inline-style, media-query and cross-origin-sheet colors are handled too.
    expect(luminance(await bg(page, '#inline'))).toBeLessThan(0.1);
    await expect.poll(async () => luminance(await bg(page, '#wide'))).toBeLessThan(0.1);
    await expect.poll(async () => luminance(await bg(page, '#cross'))).toBeLessThan(0.1);

    // :hover state, never active during analysis, is dark as well.
    await page.hover('#row2 td:first-child');
    expect(luminance(await bg(page, '#row2 td:first-child'))).toBeLessThan(0.15);
    await page.hover('#ghost');
    expect(luminance(await bg(page, '#ghost'))).toBeLessThan(0.15);
    await page.mouse.move(0, 0);

    // Media is untouched: no filters, same source.
    expect(await page.locator('#photo').evaluate((e) => getComputedStyle(e).filter)).toBe('none');
    expect(await page.locator('#photo').evaluate((e) => (e as HTMLImageElement).src)).toBe(photoBefore);

    const status = await pageStatus(ext, page.url());
    expect(status?.stats?.sheetsFailed).toBe(0);
    console.log('engine stats', JSON.stringify(status?.stats));
  });

  test('does not change layout and fully restores the original appearance', async ({ context, ext, origin }) => {
    await patchSettings(ext, { site: { mode: 'disabled' } });
    const page = await context.newPage();
    await page.setViewportSize({ width: 900, height: 900 });
    await page.goto(`${origin}/light-site.html`);
    const before = await snapshot(page);

    await patchSettings(ext, { site: { mode: 'forced' } });
    await waitForDark(ext, page);
    const during = await snapshot(page);
    expect(during.boxes).toEqual(before.boxes); // layout is untouched
    expect(during.colors).not.toEqual(before.colors);

    await patchSettings(ext, { site: { mode: 'disabled' } });
    await expect(page.locator('html')).not.toHaveAttribute('data-udm-active', '');
    expect(await snapshot(page)).toEqual(before); // exact restoration
    expect(await page.evaluate(() => document.querySelectorAll('[data-udm]').length)).toBe(0);
    expect(await page.evaluate(() => document.adoptedStyleSheets.length)).toBe(0);
    await shot(page, '03-restored');
  });

  test('repeated toggling never accumulates styles or attributes', async ({ context, ext, origin }) => {
    const page = await context.newPage();
    await patchSettings(ext, { site: { mode: 'forced' } });
    await page.goto(`${origin}/light-site.html`);
    await waitForDark(ext, page);
    const activeSheets = await page.evaluate(() => document.adoptedStyleSheets.length);
    expect(activeSheets).toBeLessThanOrEqual(2);

    for (let i = 0; i < 6; i++) {
      await patchSettings(ext, { site: { mode: 'disabled' } });
      await expect(page.locator('html')).not.toHaveAttribute('data-udm-active', '');
      expect(await page.evaluate(() => document.adoptedStyleSheets.length)).toBe(0);
      await patchSettings(ext, { site: { mode: 'forced' } });
      await waitForDark(ext, page);
    }
    expect(await page.evaluate(() => document.adoptedStyleSheets.length)).toBe(activeSheets);
    expect(await page.evaluate(() => document.querySelectorAll('style[data-udm-owned]').length)).toBe(0);
  });

  test('switches themes live without a reload', async ({ context, ext, origin }) => {
    const page = await context.newPage();
    await patchSettings(ext, { site: { mode: 'forced', theme: 'midnight' } });
    await page.goto(`${origin}/light-site.html`);
    await waitForDark(ext, page);
    await page.evaluate(() => ((window as unknown as { __marker: number }).__marker = 1));

    await patchSettings(ext, { site: { theme: 'oled' } });
    await expect.poll(() => bg(page, 'body')).toBe('rgb(0, 0, 0)');
    await shot(page, '04-oled');

    await patchSettings(ext, { site: { theme: 'nord' } });
    await expect.poll(async () => (await bg(page, 'body')) !== 'rgb(0, 0, 0)').toBe(true);
    const [r, g, b] = (await bg(page, 'body')).match(/\d+/g)!.map(Number);
    expect(b!).toBeGreaterThan(r!); // cool blue-gray
    expect(g!).toBeGreaterThan(r!);
    await shot(page, '05-nord');

    await patchSettings(ext, { site: { theme: 'warm' } });
    await expect.poll(async () => {
      const [wr, , wb] = (await bg(page, 'body')).match(/\d+/g)!.map(Number);
      return wr! > wb!;
    }).toBe(true);
    await shot(page, '06-warm');

    // Same document: no reload happened.
    expect(await page.evaluate(() => (window as unknown as { __marker?: number }).__marker)).toBe(1);
  });

  test('brightness and contrast change the result', async ({ context, ext, origin }) => {
    const page = await context.newPage();
    await patchSettings(ext, { site: { mode: 'forced', theme: 'midnight', brightness: 0 } });
    await page.goto(`${origin}/light-site.html`);
    await waitForDark(ext, page);
    const base = luminance(await bg(page, 'body'));
    await patchSettings(ext, { site: { brightness: 40 } });
    await expect.poll(async () => luminance(await bg(page, 'body'))).toBeGreaterThan(base);
  });

  test('transforms content added after load, including inline-styled and unreadable text', async ({
    context,
    ext,
    origin,
  }) => {
    const page = await context.newPage();
    await patchSettings(ext, { site: { mode: 'forced' } });
    await page.goto(`${origin}/light-site.html`);
    await waitForDark(ext, page);

    await page.evaluate(() => {
      const host = document.getElementById('dynamic-host')!;
      host.innerHTML =
        '<div id="late-inline" style="background:#ffffff;color:#111;padding:8px">late inline</div>' +
        '<div id="late-brand" style="background:#ffd60a;color:#000;padding:8px">late brand</div>';
    });
    await expect.poll(async () => luminance(await bg(page, '#late-inline'))).toBeLessThan(0.1);
    await expect.poll(async () => luminance(await fg(page, '#late-inline'))).toBeGreaterThan(0.4);
    expect(await bg(page, '#late-brand')).toBe('rgb(255, 214, 10)');
    // Black-on-yellow was mapped to light text by the rules; the safety net corrects it.
    await expect.poll(async () => luminance(await fg(page, '#late-brand'))).toBeLessThan(0.2);
  });

  test('a stylesheet added late is rewritten', async ({ context, ext, origin }) => {
    const page = await context.newPage();
    await patchSettings(ext, { site: { mode: 'forced' } });
    await page.goto(`${origin}/light-site.html`);
    await waitForDark(ext, page);
    await page.evaluate(() => {
      const s = document.createElement('style');
      s.textContent = '#late-sheet{background:#ffffff;color:#000;padding:8px}';
      document.head.append(s);
      const d = document.createElement('div');
      d.id = 'late-sheet';
      d.textContent = 'late sheet';
      document.getElementById('dynamic-host')!.append(d);
    });
    await expect.poll(async () => luminance(await bg(page, '#late-sheet'))).toBeLessThan(0.1);
  });

  test('auto mode leaves pages that are already dark alone', async ({ context, ext, origin }) => {
    await patchSettings(ext, { site: { mode: 'auto' } });
    const page = await context.newPage();
    await page.goto(`${origin}/native-dark.html`);
    await expect.poll(() => page.evaluate(() => document.adoptedStyleSheets.length)).toBe(0);
    expect(await bg(page, 'body')).toBe('rgb(18, 18, 18)');
    await expect(page.locator('html')).not.toHaveAttribute('data-udm-active', '');
    // Forced mode runs the engine anyway, but the page's own dark surfaces are intentional
    // and are preserved rather than re-themed.
    await patchSettings(ext, { site: { mode: 'forced', theme: 'oled' } });
    await expect(page.locator('html')).toHaveAttribute('data-udm-active', '');
    await expect.poll(() => page.evaluate(() => document.adoptedStyleSheets.length)).toBeGreaterThan(0);
    expect(await bg(page, 'body')).toBe('rgb(18, 18, 18)');
  });

  test('performance stays reasonable on a larger document', async ({ context, ext, origin }) => {
    const page = await context.newPage();
    await patchSettings(ext, { site: { mode: 'forced' } });
    await page.goto(`${origin}/light-site.html`);
    await waitForDark(ext, page);
    await page.evaluate(() => {
      const host = document.getElementById('dynamic-host')!;
      const frag = document.createDocumentFragment();
      for (let i = 0; i < 3000; i++) {
        const d = document.createElement('div');
        d.className = i % 2 ? 'card' : 'muted';
        d.textContent = `row ${i}`;
        frag.append(d);
      }
      host.append(frag);
    });
    await expect
      .poll(async () => (await pageStatus(ext, page.url()))?.stats?.elementsProcessed ?? 0, { timeout: 15_000 })
      .toBeGreaterThan(3000);
    const stats = (await pageStatus(ext, page.url()))!.stats!;
    // Shared tokens keep rule count tied to unique color combinations, not elements.
    expect(stats.rulesGenerated).toBeLessThan(200);
    console.log('large doc stats', JSON.stringify(stats));
  });
});

test.describe('per-site activation from the popup', () => {
  test('user enables dark mode for the active site, then disables it', async ({ context, ext, extensionId, origin }) => {
    // Site starts off.
    await patchSettings(ext, { site: { mode: 'disabled' } });
    const page = await context.newPage();
    await page.goto(`${origin}/light-site.html`);
    await expect(page.locator('html')).not.toHaveAttribute('data-udm-active', '');
    const tabId = await ext.evaluate(async (url) => (await chrome.tabs.query({ url }))[0]!.id!, page.url());

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html?tabId=${tabId}`);
    await expect(popup.getByTestId('site')).toHaveText('127.0.0.1');
    const toggle = popup.getByRole('switch', { name: 'Dark mode on this site' });
    await expect(toggle).toHaveAttribute('aria-checked', 'false');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await waitForDark(ext, page);
    expect(luminance(await bg(page, 'body'))).toBeLessThan(0.03);

    // Appearance controls appear and apply live.
    await popup.getByLabel('Theme').selectOption('oled');
    await expect.poll(() => bg(page, 'body')).toBe('rgb(0, 0, 0)');
    await expect(popup.getByTestId('state')).toHaveText(/Active/, { timeout: 5000 });

    // Other sites are unaffected: settings are keyed by site.
    const stored = (await ext.evaluate(async () => (await chrome.storage.local.get('udm.settings'))['udm.settings'])) as { sites: Record<string, unknown> };
    expect(Object.keys(stored.sites)).toEqual(['127.0.0.1']);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('html')).not.toHaveAttribute('data-udm-active', '');
    expect(luminance(await bg(page, 'body'))).toBeGreaterThan(0.9);
  });
});

test.describe('variable-driven design systems (Azure DevOps style)', () => {
  test('leaves no light regions or unreadable text', async ({ context, ext, origin }) => {
    await patchSettings(ext, { site: { mode: 'disabled' } });
    const page = await context.newPage();
    await page.setViewportSize({ width: 1100, height: 700 });
    await page.goto(`${origin}/dashboard-vars.html`);
    await shot(page, '10-dashboard-original');
    expect((await findProblems(page)).length).toBeGreaterThan(5); // sanity: the original is light

    await patchSettings(ext, { site: { mode: 'forced', theme: 'warm' } });
    await waitForDark(ext, page);
    await expect.poll(async () => (await findProblems(page)).join('; '), { timeout: 8000 }).toBe('');
    await shot(page, '11-dashboard-warm');

    // States that were never active during analysis.
    await page.hover('#r2');
    expect(luminance(await bg(page, '#r2 td:first-child'))).toBeLessThan(0.15);
    await page.hover('nav a:nth-child(1)');
    expect(luminance(await bg(page, 'nav a:nth-child(1)'))).toBeLessThan(0.15);
    await page.mouse.move(0, 0);

    // Scoped-variable and script-styled colors (not resolvable from stylesheets) are handled too.
    expect(luminance(await bg(page, '#scoped'))).toBeLessThan(0.15);
    expect(luminance(await bg(page, '#js-styled'))).toBeLessThan(0.15);
  });
});

const attr = (page: Page, sel: string, prop: string) =>
  page.locator(sel).evaluate((e, p) => getComputedStyle(e).getPropertyValue(p), prop);

test.describe('media protection', () => {
  test('keeps photos, logos and banner text intact; fixes unreadable SVG icons', async ({ context, ext, origin }) => {
    await patchSettings(ext, { site: { mode: 'disabled' } });
    const page = await context.newPage();
    await page.setViewportSize({ width: 900, height: 700 });
    await page.goto(`${origin}/media-svg.html`);
    await shot(page, '20-media-original');
    const bannerBg = await bg(page, '#hero-light');

    await patchSettings(ext, { site: { mode: 'forced', theme: 'midnight' } });
    await waitForDark(ext, page);
    await shot(page, '21-media-midnight');

    // Text over banner photos keeps the colors the page chose for the photo.
    await expect.poll(async () => luminance(await fg(page, '#hl-title'))).toBeLessThan(0.1); // dark on light photo
    await expect.poll(async () => luminance(await fg(page, '#hl-text'))).toBeLessThan(0.1);
    expect(luminance(await fg(page, '#hd-title'))).toBeGreaterThan(0.8); // white on dark photo
    expect(await page.locator('#hero-light').evaluate((e) => getComputedStyle(e).backgroundImage)).toContain('data:image/svg+xml');
    expect(bannerBg).toBeTruthy();

    // Inline SVG: dark icons become visible, brand art and logos are untouched.
    await expect.poll(async () => luminance(await attr(page, '#icon-path', 'fill'))).toBeGreaterThan(0.15);
    expect(luminance(await attr(page, '#stroke-circle', 'stroke'))).toBeGreaterThan(0.15);
    expect(await attr(page, '#brand-circle', 'fill')).toBe('rgb(255, 102, 0)');
    expect(await attr(page, '#logo-path', 'fill')).toBe('rgb(11, 31, 68)');

    // Media elements keep their own backgrounds (white box behind a transparent logo).
    expect(await bg(page, '#brand-img')).toBe('rgb(255, 255, 255)');
    for (const sel of ['#photo', '#small-icon', '#brand-img']) expect(await attr(page, sel, 'filter')).toBe('none');
  });

  test('image dimming is a separate setting that spares logos and icons', async ({ context, ext, origin }) => {
    const page = await context.newPage();
    await patchSettings(ext, { site: { mode: 'forced', imageDimming: false } });
    await page.goto(`${origin}/media-svg.html`);
    await waitForDark(ext, page);
    expect(await attr(page, '#photo', 'filter')).toBe('none');

    await patchSettings(ext, { site: { imageDimming: true } });
    await expect.poll(() => attr(page, '#photo', 'filter')).toContain('brightness(0.85)');
    expect(await attr(page, '#small-icon', 'filter')).toBe('none');
    expect(await attr(page, '#brand-img', 'filter')).toBe('none');

    await patchSettings(ext, { site: { imageDimming: false } });
    await expect.poll(() => attr(page, '#photo', 'filter')).toBe('none');
  });
});

const inShadow = (page: Page, host: string, inner: string, prop: string) =>
  page.evaluate(
    ([h, i, p]) => getComputedStyle(document.querySelector(h!)!.shadowRoot!.querySelector(i!)!).getPropertyValue(p!),
    [host, inner, prop],
  );

test.describe('dynamic websites', () => {
  test('handles shadow DOM, CSS-in-JS, adopted sheets, modals, lists and SPA routes', async ({ context, ext, origin }) => {
    await patchSettings(ext, { site: { mode: 'disabled' } });
    const page = await context.newPage();
    await page.setViewportSize({ width: 900, height: 800 });
    await page.goto(`${origin}/dynamic-app.html`);
    await page.waitForTimeout(500); // let the page's delayed scripts run
    await shot(page, '30-dynamic-original');

    await patchSettings(ext, { site: { mode: 'forced' } });
    await waitForDark(ext, page);

    // Open shadow roots: both a <style> inside the root and an adopted sheet.
    await expect.poll(async () => luminance(await inShadow(page, '#shadow-card', '#shadow-box', 'background-color'))).toBeLessThan(0.1);
    await expect.poll(async () => luminance(await inShadow(page, '#shadow-card', '#shadow-box', 'color'))).toBeGreaterThan(0.3);
    await expect.poll(async () => luminance(await inShadow(page, '#adopt-card', '#adopt-box', 'background-color'))).toBeLessThan(0.1);

    // Rules inserted through the CSSOM, and a document-level adopted stylesheet.
    await expect.poll(async () => luminance(await bg(page, '#cssinjs'))).toBeLessThan(0.1);
    await expect.poll(async () => luminance(await bg(page, '#docadopt'))).toBeLessThan(0.1);

    // Modal dialogs created/opened after load.
    await page.click('#open-modal');
    await expect.poll(async () => luminance(await bg(page, '#dlg'))).toBeLessThan(0.1);
    expect(luminance(await fg(page, '#dlg-text'))).toBeGreaterThan(0.3);
    await page.click('#close-modal');

    // Infinite-scroll style appends.
    for (let i = 0; i < 3; i++) await page.click('#load-more');
    await expect.poll(async () => luminance(await bg(page, '.item:nth-child(600)'))).toBeLessThan(0.1);
    expect(luminance(await bg(page, '.item:nth-child(1)'))).toBeLessThan(0.15);

    // SPA navigation: content swapped without a load.
    await page.click('#go-b');
    await expect.poll(async () => luminance(await bg(page, '#route-content'))).toBeLessThan(0.1);
    await page.goBack();
    await expect.poll(async () => luminance(await bg(page, '#route-content'))).toBeLessThan(0.1);
    await shot(page, '31-dynamic-dark');

    // The MAIN-world hook is installed, and CSSOM-inserted :hover rules (invisible to the
    // element fallback because the state is inactive) are rewritten through it.
    expect(await page.evaluate(() => (window as unknown as { __udmMainHook?: boolean }).__udmMainHook)).toBe(true);
    await page.evaluate(() => {
      const st = document.createElement('style');
      document.head.append(st);
      document.getElementById('go-a')!.classList.add('hoverable');
      setTimeout(() => st.sheet!.insertRule('.hoverable:hover{background:#ffffff !important;color:#000000 !important}', 0), 50);
    });
    await page.waitForTimeout(400);
    await page.hover('#go-a');
    await expect.poll(async () => luminance(await bg(page, '#go-a'))).toBeLessThan(0.15);
    await page.mouse.move(0, 0);

    // No feedback loops: once quiet, the engine does no further work.
    const settle = async () => (await pageStatus(ext, page.url()))!.stats!.elementsProcessed;
    const first = await settle();
    await page.waitForTimeout(700);
    expect(await settle()).toBe(first);

    // Cleanup: stopping removes our sheets from every scope but keeps the page's own.
    await patchSettings(ext, { site: { mode: 'disabled' } });
    await expect(page.locator('html')).not.toHaveAttribute('data-udm-active', '');
    const left = await page.evaluate(() => ({
      doc: document.adoptedStyleSheets.length,
      shadow: document.querySelector('#shadow-card')!.shadowRoot!.adoptedStyleSheets.length,
      adopted: document.querySelector('#adopt-card')!.shadowRoot!.adoptedStyleSheets.length,
      attrs: document.querySelectorAll('[data-udm]').length,
    }));
    expect(left).toEqual({ doc: 1, shadow: 0, adopted: 1, attrs: 0 }); // doc: the page's own adopted sheet
    expect(luminance(await bg(page, '#docadopt'))).toBeGreaterThan(0.9);
  });
});
