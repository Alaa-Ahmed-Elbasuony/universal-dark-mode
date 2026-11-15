import type { Page } from '@playwright/test';
import { expect, luminance, patchSettings, test, waitForDark } from './fixtures';

const bg = (page: Page, sel: string) => page.locator(sel).evaluate((e) => getComputedStyle(e).backgroundColor);
const fg = (page: Page, sel: string) => page.locator(sel).evaluate((e) => getComputedStyle(e).color);
const stored = (ext: Page) =>
  ext.evaluate(async () => (await chrome.storage.local.get('udm.settings'))['udm.settings']) as Promise<{
    global: Record<string, unknown>;
    sites: Record<string, Record<string, unknown>>;
    customTheme: Record<string, number>;
  }>;

test.describe('options page', () => {
  test('global settings persist and are consistent with storage', async ({ ext }) => {
    await ext.reload();
    await expect(ext.getByRole('heading', { name: 'General' })).toBeVisible();

    await ext.getByRole('switch', { name: 'Follow system appearance' }).click();
    await ext.getByLabel('Default theme').selectOption('nord');
    await ext.getByRole('switch', { name: 'Dim images' }).click();
    await ext.getByLabel('Default for websites').selectOption('forced');

    await expect.poll(async () => (await stored(ext)).global).toMatchObject({
      followSystem: true,
      defaultTheme: 'nord',
      imageDimming: true,
      defaultMode: 'forced',
    });
    await ext.reload();
    await expect(ext.getByLabel('Default theme')).toHaveValue('nord');
    await expect(ext.getByRole('switch', { name: 'Follow system appearance' })).toHaveAttribute('aria-checked', 'true');
  });

  test('custom theme editor applies live to a page', async ({ context, ext, origin }) => {
    await patchSettings(ext, { site: { mode: 'forced', theme: 'custom' } });
    const page = await context.newPage();
    await page.goto(`${origin}/light-site.html`);
    await waitForDark(ext, page);

    await ext.reload();
    await ext.getByLabel('Hue').fill('150');
    await ext.getByLabel('Tint strength').fill('0.1');
    await ext.getByLabel('Background lightness').fill('0.3');
    await expect.poll(async () => (await stored(ext)).customTheme).toMatchObject({ hue: 150, lightness: 0.3 });

    await expect
      .poll(async () => {
        const [r, g, b] = (await bg(page, 'body')).match(/\d+/g)!.map(Number);
        return g! > r! + 8 && g! > b!;
      })
      .toBe(true);
    await ext.getByRole('button', { name: 'Reset custom theme' }).click();
    await expect.poll(async () => (await stored(ext)).customTheme.hue).toBe(265);
  });

  test('per-site editor: add, edit, reset and remove a website', async ({ ext }) => {
    await ext.reload();
    await ext.getByLabel('Add a website').fill('not a host!');
    await ext.getByRole('button', { name: 'Add', exact: true }).first().click();
    await expect(ext.getByRole('alert').filter({ hasText: 'Enter a site' })).toBeVisible();

    await ext.getByLabel('Add a website').fill('https://www.Example.com/path');
    await ext.getByLabel('Add a website').press('Enter');
    await expect(ext.getByText('Settings for example.com')).toBeVisible();

    await ext.getByLabel('Theme', { exact: true }).selectOption('warm');
    await ext.getByLabel('Behavior', { exact: true }).selectOption('forced');
    await expect.poll(async () => (await stored(ext)).sites['example.com']).toMatchObject({ theme: 'warm', mode: 'forced' });

    await ext.getByRole('button', { name: 'Reset this website' }).click();
    await expect.poll(async () => (await stored(ext)).sites['example.com']).toEqual({});

    await ext.getByRole('button', { name: 'Remove settings for example.com' }).click();
    await expect.poll(async () => (await stored(ext)).sites['example.com']).toBeUndefined();
  });

  test('excluded selectors keep their original look; invalid ones are rejected', async ({ context, ext, extensionId, origin }) => {
    await patchSettings(ext, { site: { mode: 'forced' } });
    const page = await context.newPage();
    await page.setViewportSize({ width: 900, height: 900 });
    await page.goto(`${origin}/light-site.html`);
    await waitForDark(ext, page);
    expect(luminance(await bg(page, '#card'))).toBeLessThan(0.1);

    await ext.goto(`chrome-extension://${extensionId}/options.html#site=127.0.0.1`);
    const box = ext.getByLabel('Excluded elements (CSS selectors, one per line)');

    await box.fill('div{');
    await box.blur();
    await expect(ext.getByRole('alert').filter({ hasText: 'Not saved' })).toBeVisible();
    expect((await stored(ext)).sites['127.0.0.1']?.excludedSelectors).toBeUndefined();

    await box.fill('#card');
    await box.blur();
    await expect.poll(async () => (await stored(ext)).sites['127.0.0.1']?.excludedSelectors).toEqual(['#card']);

    // The excluded subtree looks exactly like the original page...
    await expect.poll(() => bg(page, '#card')).toBe('rgb(245, 246, 248)');
    expect(luminance(await fg(page, '#card h2'))).toBeLessThan(0.1);
    expect(luminance(await fg(page, '#card p.muted'))).toBeLessThan(0.3);
    // ...while the rest of the page stays dark.
    expect(luminance(await bg(page, 'body'))).toBeLessThan(0.03);
    expect(luminance(await bg(page, '#form'))).toBeLessThan(0.1);
    await page.screenshot({ path: 'test-results/visual/40-excluded-card.png', fullPage: true });

    await box.fill('');
    await box.blur();
    await expect.poll(() => bg(page, '#card').then(luminance)).toBeLessThan(0.1);
  });

  test('custom background overrides win over the page and reject unsafe values', async ({ context, ext, extensionId, origin }) => {
    await patchSettings(ext, { site: { mode: 'forced' } });
    const page = await context.newPage();
    await page.goto(`${origin}/light-site.html`);
    await waitForDark(ext, page);

    await ext.goto(`chrome-extension://${extensionId}/options.html#site=127.0.0.1`);
    await ext.getByLabel('Selector for a custom background color').fill('#alert');
    await ext.getByLabel('Background color', { exact: true }).fill('red; } body { display:none');
    await ext.getByRole('button', { name: 'Add', exact: true }).last().click();
    await expect(ext.getByRole('alert').filter({ hasText: 'Enter a color' })).toBeVisible();
    expect((await stored(ext)).sites['127.0.0.1']?.customOverrides).toBeUndefined();

    await ext.getByLabel('Background color', { exact: true }).fill('#112233');
    await ext.getByRole('button', { name: 'Add', exact: true }).last().click();
    await expect.poll(() => bg(page, '#alert')).toBe('rgb(17, 34, 51)');
    expect(await page.evaluate(() => getComputedStyle(document.body).display)).toBe('block'); // nothing injected
  });

  test('lists granted site access', async ({ ext }) => {
    await ext.reload();
    await expect(ext.getByRole('list', { name: 'Sites with granted access' })).toContainText('127.0.0.1');
  });
});

test('popup links and follow-system switch work', async ({ context, extensionId, ext, origin }) => {
  await patchSettings(ext, { site: { mode: 'forced' } });
  const page = await context.newPage();
  await page.goto(`${origin}/light-site.html`);
  const tabId = await ext.evaluate(async (url) => (await chrome.tabs.query({ url }))[0]!.id!, page.url());
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html?tabId=${tabId}`);

  await popup.getByRole('switch', { name: 'Follow system appearance' }).click();
  await expect.poll(async () => (await stored(ext)).global.followSystem).toBe(true);

  const opened = context.waitForEvent('page');
  await popup.getByRole('button', { name: 'Website settings' }).click();
  const options = await opened;
  await expect(options).toHaveURL(/options\.html#site=127\.0\.0\.1/);
  await expect(options.getByText('Settings for 127.0.0.1')).toBeVisible();
});
