import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { build } from 'vite';

const watch = process.argv.includes('--watch');
const e2e = process.argv.includes('--e2e');

function copyStatic() {
  // public/ (manifest + icons) is copied into dist/ by Vite; keep an explicit copy so the
  // manifest is always present even when only the content builds run.
  mkdirSync('dist/icons', { recursive: true });
  cpSync('public/manifest.json', 'dist/manifest.json');
  cpSync('public/icons', 'dist/icons', { recursive: true });
}

/**
 * Test-only manifest: Playwright cannot grant optional host permissions (needs a user
 * gesture), so E2E builds statically grant 127.0.0.1 and declare the content script.
 * The dynamic registration + permission prompt are covered by the manual checklist.
 */
function patchManifestForE2E() {
  const m = JSON.parse(readFileSync('dist/manifest.json', 'utf8'));
  m.host_permissions = ['http://127.0.0.1/*'];
  m.content_scripts = [
    { matches: ['http://127.0.0.1/*'], js: ['content.js'], run_at: 'document_start', all_frames: true },
    { matches: ['http://127.0.0.1/*'], js: ['main-world.js'], run_at: 'document_start', all_frames: true, world: 'MAIN' },
  ];
  writeFileSync('dist/manifest.json', JSON.stringify(m, null, 2));
}

if (!watch && existsSync('dist')) rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });

const common = { configFile: undefined };
const mainCfg = { ...common, configFile: 'vite.config.ts', logLevel: 'warn' };
const contentCfg = { ...common, configFile: 'vite.content.config.ts', logLevel: 'warn' };
const mainWorldCfg = { ...common, configFile: 'vite.main-world.config.ts', logLevel: 'warn' };

if (watch) {
  copyStatic();
  await build({ ...mainCfg, build: { watch: {} } });
  await build({ ...contentCfg, build: { watch: {} } });
  await build({ ...mainWorldCfg, build: { watch: {} } });
} else {
  await build(mainCfg);
  await build(contentCfg);
  await build(mainWorldCfg);
  copyStatic();
  if (e2e) {
    patchManifestForE2E();
    await build({ configFile: 'vite.fixtures.config.ts', logLevel: 'warn' }); // React SPA test fixture
  }
  console.log(`Built extension to dist/${e2e ? ' (E2E manifest: NOT for release)' : ''}`);
}
