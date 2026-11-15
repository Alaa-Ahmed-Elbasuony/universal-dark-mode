import { expect, patchSettings, test, waitForDark } from './fixtures';

// Baselines are rendered by Playwright's Chromium on the platform that created them (the
// snapshot folder name includes the OS), after being reviewed by eye. Update deliberately with:
//   npx playwright test visual --update-snapshots
const CASES = [
  { file: 'light-site.html', name: 'light-site', themes: ['midnight', 'oled', 'nord', 'warm'] },
  { file: 'ecommerce.html', name: 'ecommerce', themes: ['midnight'] },
  { file: 'docs.html', name: 'docs', themes: ['midnight', 'nord'] },
  { file: 'forms.html', name: 'forms', themes: ['midnight', 'warm'] },
  { file: 'dashboard-vars.html', name: 'dashboard', themes: ['midnight', 'warm'] },
  { file: 'media-svg.html', name: 'media', themes: ['midnight'] },
] as const;

for (const { file, name, themes } of CASES) {
  for (const theme of themes) {
    test(`visual: ${name} / ${theme}`, async ({ context, ext, origin }) => {
      await patchSettings(ext, { site: { mode: 'forced', theme } });
      const page = await context.newPage();
      await page.setViewportSize({ width: 1000, height: 800 });
      await page.goto(`${origin}/${file}`);
      await waitForDark(ext, page);
      await page.waitForTimeout(400); // let async sheets and the contrast pass settle
      await page.mouse.move(0, 0);
      await expect(page).toHaveScreenshot(`${name}-${theme}.png`, { fullPage: true, maxDiffPixelRatio: 0.01, animations: 'disabled' });
    });
  }
}
