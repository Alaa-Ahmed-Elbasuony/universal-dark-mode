import type { Page } from '@playwright/test';
import { expect, patchSettings, test, waitForDark } from './fixtures';

const css = (page: Page, sel: string, prop: string) =>
  page.locator(sel).evaluate((e, p) => getComputedStyle(e).getPropertyValue(p), prop);

const IDS = ['#user', '#pw', '#box', '#login-disabled', '#g', '#f', '#a', '.lang'];

test.describe('natively dark pages with translucent "glass" controls', () => {
  test('forced mode keeps field and button outlines and fills visible and unchanged', async ({ context, ext, origin }) => {
    await patchSettings(ext, { site: { mode: 'disabled' } });
    const page = await context.newPage();
    await page.setViewportSize({ width: 900, height: 800 });
    await page.goto(`${origin}/dark-glass.html`);
    const before: Record<string, [string, string, string]> = {};
    for (const id of [...IDS, '#login-muted'])
      before[id] = [
        await css(page, id, 'background-color'),
        await css(page, id, 'border-top-color'),
        await css(page, id, 'background-image'),
      ];
    await page.screenshot({ path: 'test-results/visual/80-glass-original.png' });

    await patchSettings(ext, { site: { mode: 'forced', theme: 'midnight' } });
    await waitForDark(ext, page);
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'test-results/visual/81-glass-forced.png' });

    // Translucent white fills and borders are light-on-dark overlays: they must not be inverted.
    for (const id of IDS) {
      expect(await css(page, id, 'background-color'), `${id} background`).toBe(before[id]![0]);
      expect(await css(page, id, 'border-top-color'), `${id} border`).toBe(before[id]![1]);
    }
    // Hover and focus states of those controls stay visible too.
    await page.hover('#g');
    expect(await css(page, '#g', 'background-color')).toBe('rgba(255, 255, 255, 0.12)');
    await page.focus('#user');
    expect(await css(page, '#user', 'border-top-color')).toBe('rgba(120, 200, 255, 0.8)');
    // The gradient primary button is untouched.
    expect(await css(page, '#login', 'background-image')).toContain('linear-gradient');
    // A muted teal gradient button keeps its exact gradient (not darkened into the page).
    expect(await css(page, '#login-muted', 'background-image')).toBe(before['#login-muted']![2]);
  });

  test('Tailwind-style white gradient fades are darkened (stop colors live in per-element variables)', async ({
    context,
    ext,
    origin,
  }) => {
    await patchSettings(ext, { site: { mode: 'forced', theme: 'midnight' } });
    const page = await context.newPage();
    await page.goto(`${origin}/gradient-fade.html`);
    await waitForDark(ext, page);
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'test-results/visual/82-gradient-fade.png' });
    // Gradient text: dark teal stops must be lifted so the heading stays readable.
    const stops = await css(page, '#gtext', 'background-image');
    const channels = [...stops.matchAll(/rgba?\((\d+), (\d+), (\d+)/g)].map((m) => Math.max(+m[1]!, +m[2]!, +m[3]!));
    expect(channels.length).toBeGreaterThan(0);
    for (const c of channels) expect(c, `gradient text stop ${stops}`).toBeGreaterThan(110);
    for (const id of ['#fade', '#strip']) {
      const bg = await css(page, id, 'background-image');
      expect(bg, `${id} must not keep white stops`).not.toMatch(/rgb\(255, 255, 255\)/);
      expect(bg).toContain('linear-gradient');
    }
  });

  test('automatic mode recognizes this page as already dark (gradient background) and leaves it alone', async ({
    context,
    ext,
    origin,
  }) => {
    await patchSettings(ext, { site: { mode: 'auto' } });
    const page = await context.newPage();
    await page.goto(`${origin}/dark-glass.html`);
    await expect.poll(() => page.evaluate(() => document.adoptedStyleSheets.length)).toBe(0);
    await expect(page.locator('html')).not.toHaveAttribute('data-udm-active', '');
  });
});
