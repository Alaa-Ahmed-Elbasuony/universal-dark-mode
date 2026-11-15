import { expect, patchSettings, test, waitForDark } from './fixtures';

test('service worker runs and popup renders', async ({ context, extensionId }) => {
  expect(extensionId).toMatch(/^[a-p]{32}$/);
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(page.getByRole('heading', { name: 'Universal Dark Mode' })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Pause on all sites' })).toHaveAttribute('aria-checked', 'false');
});

test('popup storage round trip persists the global pause switch', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.getByRole('switch', { name: 'Pause on all sites' }).click();
  await expect(page.getByRole('switch', { name: 'Pause on all sites' })).toHaveAttribute('aria-checked', 'true');
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Pause on all sites' })).toHaveAttribute('aria-checked', 'true');
});

test('popup explains pages that extensions cannot change', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  // The popup opened as a tab is itself an extension page: unsupported.
  await expect(page.getByTestId('site')).toHaveText(/can’t be changed/);
  await expect(page.getByRole('switch', { name: 'Dark mode on this site' })).toBeDisabled();
});

test('content script auto-initializes, answers PING and reacts to global pause', async ({
  context,
  ext,
  origin,
}) => {
  const target = await context.newPage();
  await target.goto(origin);
  // Off by default: nothing happens until the site is enabled.
  await expect(target.locator('html')).not.toHaveAttribute('data-udm-active', '');
  await patchSettings(ext, { site: { mode: 'forced' } });
  await waitForDark(ext, target);

  const reply = await ext.evaluate(async (url) => {
    const [tab] = await chrome.tabs.query({ url: `${url}/*` });
    if (!tab?.id) return { error: 'no tab' };
    return chrome.tabs.sendMessage(tab.id, { type: 'PING' });
  }, origin);
  expect(reply).toMatchObject({ pong: true });

  // Pausing globally restores the page without a reload (storage.onChanged path).
  await patchSettings(ext, { global: { enabled: false } });
  await expect(target.locator('html')).not.toHaveAttribute('data-udm-active', '');
});
