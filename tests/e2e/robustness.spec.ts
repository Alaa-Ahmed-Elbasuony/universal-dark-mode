import type { Page } from '@playwright/test';
import { expect, luminance, pageStatus, patchSettings, test, waitForDark } from './fixtures';
import { findProblems } from './helpers';

const bg = (page: Page, sel: string) => page.locator(sel).evaluate((e) => getComputedStyle(e).backgroundColor);

test.describe('robustness', () => {
  test('unusual CSS is handled without errors', async ({ context, ext, origin }) => {
    const errors: string[] = [];
    await patchSettings(ext, { site: { mode: 'forced' } });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && /\[UDM\]/.test(m.text()) && errors.push(m.text()));
    await page.setViewportSize({ width: 900, height: 800 });
    await page.goto(`${origin}/weird-css.html`);
    await waitForDark(ext, page);

    for (const sel of ['#layered', '#nest', '#inner', '#has', '#cq', '#sup', '#oklch', '#hsl']) {
      await expect.poll(async () => luminance(await bg(page, sel)), { message: sel }).toBeLessThan(0.15);
    }
    await expect.poll(async () => (await findProblems(page)).join('; ')).toBe('');
    await page.hover('#nest');
    expect(luminance(await bg(page, '#nest'))).toBeLessThan(0.15); // nested &:hover
    await page.screenshot({ path: 'test-results/visual/60-weird-css.png', fullPage: true });
    expect(errors).toEqual([]);
  });

  test('large documents stay responsive and incremental updates are cheap', async ({ context, ext, origin }) => {
    const page = await context.newPage();
    await patchSettings(ext, { site: { mode: 'forced' } });
    await page.goto(`${origin}/light-site.html`);
    await waitForDark(ext, page);
    await page.evaluate(() => {
      const w = window as unknown as { __long: number[] };
      w.__long = [];
      new PerformanceObserver((list) => list.getEntries().forEach((e) => w.__long.push(e.duration))).observe({ type: 'longtask', buffered: true });
      const host = document.getElementById('dynamic-host')!;
      const frag = document.createDocumentFragment();
      for (let i = 0; i < 20000; i++) {
        const d = document.createElement(i % 5 === 0 ? 'p' : 'div');
        d.className = i % 3 === 0 ? 'card' : i % 3 === 1 ? 'muted' : 'alert';
        d.textContent = `row ${i}`;
        frag.append(d);
      }
      host.append(frag);
    });
    const started = Date.now();
    await expect
      .poll(async () => (await pageStatus(ext, page.url()))?.stats?.elementsProcessed ?? 0, { timeout: 30_000 })
      .toBeGreaterThan(20_000);
    const elapsed = Date.now() - started;
    const longTasks = await page.evaluate(() => (window as unknown as { __long: number[] }).__long);
    const worst = Math.max(0, ...longTasks);
    console.log(`20k elements: processed in ${elapsed} ms, worst long task ${worst.toFixed(0)} ms, rules ${(await pageStatus(ext, page.url()))?.stats?.rulesGenerated}`);
    expect(elapsed).toBeLessThan(15_000);
    expect(worst).toBeLessThan(400); // work is sliced so the page stays responsive

    // A small append is handled incrementally and quickly.
    const before = (await pageStatus(ext, page.url()))!.stats!.elementsProcessed;
    await page.evaluate(() => {
      const d = document.createElement('div');
      d.id = 'late';
      d.style.background = '#fff';
      d.textContent = 'late';
      document.getElementById('dynamic-host')!.append(d);
    });
    await expect.poll(async () => luminance(await bg(page, '#late'))).toBeLessThan(0.1);
    const after = (await pageStatus(ext, page.url()))!.stats!.elementsProcessed;
    expect(after - before).toBeLessThan(50); // not a full rescan
  });

  test('memory stays bounded across many add/remove cycles', async ({ context, ext, origin }) => {
    const page = await context.newPage();
    await patchSettings(ext, { site: { mode: 'forced' } });
    await page.goto(`${origin}/light-site.html`);
    await waitForDark(ext, page);
    const cdp = await context.newCDPSession(page);
    const heap = async () => {
      await cdp.send('HeapProfiler.collectGarbage');
      const { metrics } = await cdp.send('Performance.getMetrics');
      return metrics.find((m) => m.name === 'JSHeapUsedSize')!.value / 1024 / 1024;
    };
    await cdp.send('Performance.enable');
    const cycle = async () => {
      await page.evaluate(() => {
        const host = document.getElementById('dynamic-host')!;
        for (let i = 0; i < 400; i++) {
          const d = document.createElement('div');
          d.className = 'card';
          d.style.background = '#fff';
          d.textContent = `x${i}`;
          host.append(d);
        }
      });
      await page.waitForTimeout(150);
      await page.evaluate(() => (document.getElementById('dynamic-host')!.innerHTML = ''));
      await page.waitForTimeout(50);
    };
    for (let i = 0; i < 5; i++) await cycle(); // warm up
    const baseline = await heap();
    for (let i = 0; i < 40; i++) await cycle();
    const grown = (await heap()) - baseline;
    console.log(`heap growth after 40 cycles: ${grown.toFixed(1)} MB`);
    expect(grown).toBeLessThan(10);
  });
});
