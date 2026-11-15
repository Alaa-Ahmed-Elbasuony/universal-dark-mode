import { expect, patchSettings, test, waitForDark } from './fixtures';

test('buttons that blend into the page get a 1px outline; visible ones are left alone', async ({ context, ext, origin }) => {
  await patchSettings(ext, { site: { mode: 'disabled' } });
  const page = await context.newPage();
  await page.setViewportSize({ width: 900, height: 300 });
  await page.goto(`${origin}/buttons.html`);
  await patchSettings(ext, { site: { mode: 'forced', theme: 'midnight' } });
  await waitForDark(ext, page);
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/visual/97-buttons.png' });

  const shadow = (sel: string) => page.locator(sel).evaluate((e) => getComputedStyle(e).boxShadow);
  const border = (sel: string) => page.locator(sel).evaluate((e) => getComputedStyle(e).borderTopColor);

  for (const id of ['#ghost', '#flat', '#aria', '#submit']) {
    expect(await shadow(id), `${id} should get an inset 1px outline`).toMatch(/inset/);
    expect(await shadow(id)).toMatch(/0px 0px 0px 1px/);
  }
  // A faint page border is replaced by a visible one (no layout change: same width).
  expect(await border('#faint')).not.toBe('rgb(34, 34, 34)');
  for (const id of ['#solid', '#grad', '#outlined', '#icon']) {
    expect(await shadow(id), `${id} must stay untouched`).toBe('none');
  }
  // No layout shift: the outline is an inset shadow, not extra border width.
  expect(await page.locator('#ghost').evaluate((e) => getComputedStyle(e).borderTopWidth)).toBe('0px');
});
