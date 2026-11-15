import { defineConfig } from '@playwright/test';

// Extension tests need a persistent headed-or-new-headless Chromium context, which the
// fixture in tests/e2e/fixtures.ts creates. Branded Chrome 137+ ignores --load-extension,
// so automation runs on Playwright's bundled Chromium.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  workers: 1,
  reporter: [['list']],
  use: { trace: 'retain-on-failure' },
});
