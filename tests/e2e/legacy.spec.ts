import { expect, patchSettings, test, waitForDark } from './fixtures';

test('light flat texture images (white page column, title bar) are darkened; photos and icons are not', async ({
  context,
  ext,
  origin,
}) => {
  await patchSettings(ext, { site: { mode: 'disabled' } });
  const page = await context.newPage();
  await page.setViewportSize({ width: 800, height: 600 });
  await page.goto(`${origin}/legacy-router.html`);
  await page.screenshot({ path: 'test-results/visual/90-legacy-original.png' });

  await patchSettings(ext, { site: { mode: 'forced', theme: 'midnight' } });
  await waitForDark(ext, page);
  const tokens = (sel: string) => page.locator(sel).getAttribute('data-udm');
  await expect.poll(() => tokens('#column')).toMatch(/\bt\d+\b/);
  await expect.poll(() => tokens('#title')).toMatch(/\bt\d+\b/);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/visual/91-legacy-dark.png' });

  // The colorful banner and the icon are untouched by the texture handling.
  expect((await tokens('#photo')) ?? '').not.toMatch(/\bt\d+\b/);
  expect((await tokens('#sprite')) ?? '').not.toMatch(/\bt\d+\b/);

  // The column is dark at its center and the title text is readable against it.
  const px = await page.evaluate(async () => {
    const c = getComputedStyle(document.querySelector('#column')!);
    return { blend: c.backgroundBlendMode, bg: c.backgroundColor };
  });
  expect(px.blend).toBe('multiply');
  const lum = px.bg.match(/\d+/g)!.slice(0, 3).map(Number);
  expect(Math.max(...lum)).toBeLessThan(80);
});
