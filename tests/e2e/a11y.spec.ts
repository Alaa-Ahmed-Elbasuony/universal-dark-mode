import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, patchSettings, test } from './fixtures';

const audit = async (page: Page) => {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  return violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
};

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`accessibility (${scheme} scheme)`, () => {
    test.use({ colorScheme: scheme });

    test('options page has no WCAG 2.2 AA violations', async ({ context, extensionId, ext, origin }) => {
      void ext;
      void origin;
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/options.html#site=127.0.0.1`);
      await expect(page.getByText('Settings for 127.0.0.1')).toBeVisible();
      expect(await audit(page)).toEqual([]);
    });

    test('popup has no WCAG 2.2 AA violations', async ({ context, extensionId, ext, origin }) => {
      await patchSettings(ext, { site: { mode: 'forced' } });
      const target = await context.newPage();
      await target.goto(`${origin}/light-site.html`);
      const tabId = await ext.evaluate(async (url) => (await chrome.tabs.query({ url }))[0]!.id!, target.url());
      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${extensionId}/popup.html?tabId=${tabId}`);
      await expect(popup.getByRole('switch', { name: 'Dark mode on this site' })).toBeVisible();
      expect(await audit(popup)).toEqual([]);
    });
  });
}

test('keyboard: popup controls are reachable and operable without a mouse', async ({ context, extensionId, ext, origin }) => {
  await patchSettings(ext, { site: { mode: 'disabled' } });
  const target = await context.newPage();
  await target.goto(`${origin}/light-site.html`);
  const tabId = await ext.evaluate(async (url) => (await chrome.tabs.query({ url }))[0]!.id!, target.url());
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html?tabId=${tabId}`);
  const site = popup.getByRole('switch', { name: 'Dark mode on this site' });
  await site.focus();
  await popup.keyboard.press('Space');
  await expect(site).toHaveAttribute('aria-checked', 'true');
  await popup.keyboard.press('Tab');
  await expect(popup.getByLabel('Theme')).toBeFocused();
});
