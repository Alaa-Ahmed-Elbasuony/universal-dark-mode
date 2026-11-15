# Universal Dark Mode (UDM)

A Chrome extension (Manifest V3) that turns light websites into natural-looking dark interfaces. It rewrites a page's own colors by role instead of inverting the page, so images, logos, video and brand colors stay as designed.

- **Per-site, off by default**: dark mode does nothing until you turn it on for a site, and then runs only on the sites you enabled. (Settings > "Default for websites" can change this.)
- **Local and private**: no account, no analytics, no remote code. See [PRIVACY.md](PRIVACY.md).
- **Four themes** (Midnight, OLED, Nord, Warm) plus a custom theme, brightness/contrast, optional image dimming, per-site exclusions and color overrides.

## Install (development)

```bash
npm install
npm run build        # production build into dist/
```

Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked** and pick `dist/`.

## Use

1. Open a website and click the extension icon.
2. Turn on **Dark mode on this site**. Chrome asks for access to that one site.
3. Pick a theme or adjust brightness/contrast. Everything applies live.
4. `Alt+Shift+D` toggles the current site (change it at `chrome://extensions/shortcuts`).
5. The options page has global defaults, the custom theme editor, per-site settings (excluded elements, custom background colors) and a list of granted sites you can revoke.

## How it works

| Layer | What it does |
|---|---|
| **A. Base** | Page canvas, default text color, `color-scheme: dark`. |
| **B. Stylesheet rewriting** | Reads the page's own CSS rules (including `:hover`, media/container queries, `@layer`, nesting, `var()` and RGB-channel variables, adopted sheets, open shadow roots, cross-origin sheets via the service worker) and emits dark overrides with the same selectors. |
| **C. Element analysis** | Inline styles, light surfaces still left over, unreadable text (contrast safety net), SVG paint, text over banner photos, user exclusions. Identical corrections share one rule via a `data-udm` token. |

Colors are mapped in OKLCH by role (surface, text, border): hierarchy between surfaces is kept, intentional dark sections and saturated brand colors are kept, hue is preserved, and text contrast is enforced. Media is never recolored. Everything lives in extension-owned stylesheets plus one attribute, so turning it off restores the page exactly.

```
src/
  background/   service worker: permissions, per-origin script registration, CSS proxy, shortcut
  content/      runtime, SPA navigation, early paint, MAIN-world CSSOM hook
  engine/       colors, sheets, analyzer, media, observation, overrides, transformation (no React, no chrome.*)
  storage/      versioned, validated settings + migrations
  themes/       presets and the custom-theme builder (data only)
  popup/ options/ ui/   React UI
```

Module boundaries are enforced by ESLint (`no-restricted-imports`).

## Develop and test

```bash
npm run typecheck && npm run lint
npm test                 # Vitest: colors, palettes, settings, migrations, overrides, manifest audit
npm run test:e2e         # builds an E2E variant and runs Playwright in Chromium
npm run test:e2e -- visual --update-snapshots   # only after reviewing renders by eye
npm run package          # clean build + audit + deterministic zip in release/
npm run assets           # regenerates Chrome Web Store images in store-assets/
```

Browser tests run on Playwright's Chromium: branded Chrome ignores `--load-extension`. The E2E build uses a test-only manifest that statically grants `127.0.0.1` (Playwright cannot click Chrome's permission prompt), so the permission prompt and dynamic script registration are covered by [docs/MANUAL-CHECKLIST.md](docs/MANUAL-CHECKLIST.md). Visual baselines are platform-specific (`*-win32.png`); regenerate them on another OS.

## Limitations

- Pages Chrome protects: `chrome://`, the Chrome Web Store, the PDF viewer.
- Closed shadow roots; cross-origin iframes unless access to them is granted; canvas/WebGL content.
- Inline `!important` colors set by the page cannot be overridden from a stylesheet.
- Text over a banner photo keeps the page's original color (the brightness of the photo is unknown).
- Sites that set colors only through JavaScript each frame (animations) are corrected after they settle.
- Pressing the shortcut on a site without permanent access darkens that visit only; enabling the site from the popup makes it persistent.
