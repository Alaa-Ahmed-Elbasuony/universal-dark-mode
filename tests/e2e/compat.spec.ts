import type { Page } from '@playwright/test';
import { expect, patchSettings, test, waitForDark } from './fixtures';
import { findProblems, snapshot } from './helpers';

const THEMES = ['midnight', 'oled', 'nord', 'warm'] as const;
const PAGES = [
  { file: 'light-site.html', name: 'plain-docs-widgets' },
  { file: 'ecommerce.html', name: 'ecommerce' },
  { file: 'docs.html', name: 'documentation' },
  { file: 'forms.html', name: 'forms' },
  { file: 'dashboard-vars.html', name: 'saas-dashboard' },
  { file: 'spa.html', name: 'react-spa' },
] as const;

const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/visual/compat-${name}.png`, fullPage: true });

test.describe('compatibility suite', () => {
  for (const { file, name } of PAGES) {
    test(`${name}: no light regions or unreadable text in any theme; layout and restoration are exact`, async ({
      context,
      ext,
      origin,
    }) => {
      await patchSettings(ext, { site: { mode: 'disabled' } });
      const page = await context.newPage();
      await page.setViewportSize({ width: 1100, height: 800 });
      await page.goto(`${origin}/${file}`);
      await page.waitForTimeout(300);
      const before = await snapshot(page);
      expect((await findProblems(page)).length).toBeGreaterThan(3); // sanity: the page really is light

      for (const theme of THEMES) {
        await patchSettings(ext, { site: { mode: 'forced', theme } });
        await waitForDark(ext, page);
        await expect
          .poll(async () => (await findProblems(page)).join('; '), { timeout: 10_000, message: `${name}/${theme}` })
          .toBe('');
        await shot(page, `${name}-${theme}`);
        if (theme === 'midnight') expect((await snapshot(page)).boxes).toEqual(before.boxes); // layout untouched
      }

      await patchSettings(ext, { site: { mode: 'disabled' } });
      await expect(page.locator('html')).not.toHaveAttribute('data-udm-active', '');
      expect(await snapshot(page)).toEqual(before); // exact restoration
    });
  }

  test('react-spa: routes, lazily injected styles and portal modals', async ({ context, ext, origin }) => {
    await patchSettings(ext, { site: { mode: 'forced' } });
    const page = await context.newPage();
    await page.goto(`${origin}/spa.html`);
    await waitForDark(ext, page);
    const lum = (c: string) => {
      const [r = 0, g = 0, b = 0] = c.match(/\d+/g)!.map(Number);
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    };
    const bg = (sel: string) => page.locator(sel).first().evaluate((e) => getComputedStyle(e).backgroundColor);

    await page.click('#items li:nth-child(3) a');
    await expect(page.locator('#detail')).toBeVisible();
    await expect.poll(async () => lum(await bg('#detail'))).toBeLessThan(0.25); // style injected by a lazy route

    await page.click('#open-modal');
    await expect.poll(async () => lum(await bg('#modal'))).toBeLessThan(0.25); // React portal on <body>
    await page.click('#modal-close');

    await page.goBack();
    await expect(page.locator('#items')).toBeVisible();
    await expect.poll(async () => lum(await bg('#items li:nth-child(1)'))).toBeLessThan(0.25);
    expect(await findProblems(page)).toEqual([]);
  });
});
