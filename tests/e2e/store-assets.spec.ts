import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { expect, patchSettings, test, waitForDark } from './fixtures';

// Generates Chrome Web Store imagery from the real extension. Opt-in: `npm run assets`.
test.skip(!process.env.UDM_ASSETS, 'set UDM_ASSETS=1 (use `npm run assets`)');

const OUT = 'store-assets';
const uri = (buf: Buffer) => `data:image/png;base64,${buf.toString('base64')}`;
const icon = uri(readFileSync('public/icons/icon128.png'));

const frame = (inner: string, w: number, h: number) => `<!doctype html><meta charset="utf-8"><style>
  *{box-sizing:border-box} body{margin:0;width:${w}px;height:${h}px;background:linear-gradient(135deg,#1b2038,#0d0f17);color:#eef0f8;font:16px system-ui,sans-serif;overflow:hidden}
  h1{margin:0;font-size:34px;letter-spacing:-.5px} p{margin:6px 0 0;color:#b4bad0}
  .shot{border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.55);display:block}
  .label{font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#9aa3c7;margin:0 0 8px}
</style>${inner}`;

async function compose(page: Page, html: string, w: number, h: number, file: string) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(frame(html, w, h));
  await page.screenshot({ path: `${OUT}/${file}` });
}

test('generate store assets', async ({ context, ext, origin }) => {
  const stage = await context.newPage();
  const shotPage = await context.newPage();
  await shotPage.setViewportSize({ width: 640, height: 560 });

  const capture = async (file: string, theme?: string) => {
    await patchSettings(ext, { site: theme ? { mode: 'forced', theme } : { mode: 'disabled' } });
    await shotPage.goto(`${origin}/${file}`);
    if (theme) await waitForDark(ext, shotPage);
    await shotPage.waitForTimeout(350);
    return shotPage.screenshot();
  };

  // 1. Before / after
  const before = await capture('ecommerce.html');
  const after = await capture('ecommerce.html', 'midnight');
  await compose(
    stage,
    `<div style="padding:40px 48px"><h1>Any website, naturally dark</h1><p>Images, logos and brand colors stay exactly as designed.</p>
     <div style="display:flex;gap:28px;margin-top:26px"><div><p class="label">Before</p><img class="shot" width="560" src="${uri(before)}"></div>
     <div><p class="label">After</p><img class="shot" width="560" src="${uri(after)}"></div></div></div>`,
    1280, 800, 'screenshot-1-before-after.png',
  );

  // 2. Themes
  const themes = ['midnight', 'oled', 'nord', 'warm'] as const;
  const tiles: string[] = [];
  for (const t of themes) tiles.push(`<div><p class="label">${t}</p><img class="shot" width="560" src="${uri(await capture('docs.html', t))}"></div>`);
  await compose(
    stage,
    `<div style="padding:34px 48px"><h1>Four themes, or make your own</h1>
     <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px 28px;margin-top:20px">${tiles.map((t) => t.replace('width="560"', 'width="560" style="height:300px;object-fit:cover;object-position:top"')).join('')}</div></div>`,
    1280, 800, 'screenshot-2-themes.png',
  );

  // 3. Popup + options
  await patchSettings(ext, { site: { mode: 'forced', theme: 'midnight' } });
  const target = await context.newPage();
  await target.goto(`${origin}/light-site.html`);
  const extensionId = new URL(ext.url()).host;
  const tabId = await ext.evaluate(async (url) => (await chrome.tabs.query({ url }))[0]!.id!, target.url());
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 340, height: 500 });
  await popup.emulateMedia({ colorScheme: 'dark' });
  await popup.goto(`chrome-extension://${extensionId}/popup.html?tabId=${tabId}`);
  await popup.waitForTimeout(600);
  const popupShot = await popup.screenshot();
  const opts = await context.newPage();
  await opts.setViewportSize({ width: 980, height: 760 });
  await opts.emulateMedia({ colorScheme: 'dark' });
  await opts.goto(`chrome-extension://${extensionId}/options.html#site=127.0.0.1`);
  await opts.waitForTimeout(500);
  const optsShot = await opts.screenshot();
  await compose(
    stage,
    `<div style="padding:40px 48px"><h1>Per-site control, privacy first</h1><p>Dark mode only runs where you turn it on. Everything stays on your device.</p>
     <div style="display:flex;gap:28px;margin-top:24px;align-items:flex-start"><img class="shot" width="300" src="${uri(popupShot)}"><img class="shot" width="760" src="${uri(optsShot)}"></div></div>`,
    1280, 800, 'screenshot-3-controls.png',
  );

  // 4. Small promo tile (440x280)
  await compose(
    stage,
    `<div style="display:flex;align-items:center;gap:22px;padding:0 34px;height:280px"><img src="${icon}" width="96" height="96"><div><h1 style="font-size:28px">Universal<br>Dark Mode</h1><p>Naturally dark websites.</p></div></div>`,
    440, 280, 'promo-small-440x280.png',
  );

  expect(true).toBe(true);
});
