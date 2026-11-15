import type { Page } from '@playwright/test';
import { expect, luminance, patchSettings, test, waitForDark } from './fixtures';
import { findProblems } from './helpers';

const css = (page: Page, sel: string, prop: string) =>
  page.locator(sel).evaluate((e, p) => getComputedStyle(e).getPropertyValue(p), prop);

const TEXT_CONTROLS = ['#n-text', '#n-text-val', '#n-email', '#n-search', '#n-num', '#n-pw', '#n-ta', '#s-input', '#s-input-val', '#s-ta', '#s-select', '#n-select', '#s-err', '#s-ok'];
const BUTTONS = ['#n-btn', '#s-light', '#s-white', '#s-ghost', '#s-icon', '#n-submit'];

test.describe('buttons and input fields', () => {
  test('are dark, readable and usable in every state', async ({ context, ext, origin }) => {
    await patchSettings(ext, { site: { mode: 'disabled' } });
    const page = await context.newPage();
    await page.setViewportSize({ width: 1100, height: 700 });
    await page.goto(`${origin}/controls.html`);
    await page.screenshot({ path: 'test-results/visual/70-controls-original.png', fullPage: true });
    await patchSettings(ext, { site: { mode: 'forced', theme: 'midnight' } });
    await waitForDark(ext, page);
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'test-results/visual/71-controls-dark.png', fullPage: true });

    // Inputs: dark field, light text, visible placeholder.
    for (const sel of TEXT_CONTROLS) {
      expect(luminance(await css(page, sel, 'background-color')), `${sel} background`).toBeLessThan(0.1);
      expect(luminance(await css(page, sel, 'color')), `${sel} text`).toBeGreaterThan(0.25);
    }
    for (const sel of ['#n-text', '#s-input']) {
      const ph = await page.locator(sel).evaluate((e) => getComputedStyle(e, '::placeholder').color);
      expect(luminance(ph), `${sel} placeholder`).toBeGreaterThan(0.1);
    }

    // Buttons: dark surface + readable label; brand colors stay.
    for (const sel of BUTTONS) {
      expect(luminance(await css(page, sel, 'background-color')), `${sel} background`).toBeLessThan(0.12);
      expect(luminance(await css(page, sel, 'color')), `${sel} label`).toBeGreaterThan(0.2);
    }
    expect(await css(page, '#s-brand', 'background-color')).toBe('rgb(11, 87, 208)');
    expect(await css(page, '#s-yellow', 'background-color')).toBe('rgb(255, 214, 10)');
    expect(luminance(await css(page, '#s-yellow', 'color'))).toBeLessThan(0.2); // dark label on yellow
    expect(luminance(await css(page, '#s-link', 'color'))).toBeGreaterThan(0.15); // link-style button
    expect(luminance(await css(page, '#s-icon', 'color'))).toBeGreaterThan(0.2); // currentColor icon

    // Disabled controls stay visibly disabled, not invisible.
    expect(luminance(await css(page, '#n-btn-dis', 'color'))).toBeGreaterThan(0.03);
    expect(luminance(await css(page, '#n-dis', 'color'))).toBeGreaterThan(0.03);

    // Hover (a state never active during analysis).
    await page.hover('#s-ghost');
    expect(luminance(await css(page, '#s-ghost', 'background-color'))).toBeLessThan(0.15);
    await page.hover('#s-light');
    expect(luminance(await css(page, '#s-light', 'background-color'))).toBeLessThan(0.15);
    await page.hover('#s-brand');
    expect(luminance(await css(page, '#s-brand', 'background-color'))).toBeLessThan(0.15); // darker brand hover is kept
    await page.mouse.move(0, 0);

    // Focus is visible on every kind of control.
    for (const sel of ['#n-btn', '#s-light', '#n-text', '#s-input', '#n-select', '#n-ta', '#s-brand']) {
      await page.focus(sel);
      const style = await page.locator(sel).evaluate((e) => {
        const cs = getComputedStyle(e);
        return { outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, outlineColor: cs.outlineColor, shadow: cs.boxShadow };
      });
      const visible =
        (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0 && luminance(style.outlineColor) > 0.1) ||
        style.shadow !== 'none';
      expect(visible, `${sel} focus: ${JSON.stringify(style)}`).toBe(true);
    }
    await page.screenshot({ path: 'test-results/visual/72-controls-focus.png', fullPage: true });

    // Typing works.
    await page.fill('#s-input', 'typed text');
    expect(await page.inputValue('#s-input')).toBe('typed text');

    // No light regions or unreadable text anywhere on the page.
    expect(await findProblems(page)).toEqual([]);
  });
});
