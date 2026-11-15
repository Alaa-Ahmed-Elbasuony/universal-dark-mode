// Generates Chrome Web Store imagery into store-assets/ using the real extension.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

mkdirSync('store-assets', { recursive: true });
const opts = { stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, UDM_ASSETS: '1' } };
execFileSync('node', ['scripts/build.mjs', '--e2e'], opts);
execFileSync('npx', ['playwright', 'test', 'store-assets'], opts);
// Leave dist/ as a release build, not the E2E build.
execFileSync('node', ['scripts/build.mjs'], opts);
console.log('store assets written to store-assets/');
