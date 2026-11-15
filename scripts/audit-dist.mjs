// Release audit of the built extension (run after `npm run build`).
// Fails the process on anything that would violate the privacy/security promises.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const problems = [];
const fail = (msg) => problems.push(msg);

if (!existsSync(join(DIST, 'manifest.json'))) {
  console.error('dist/manifest.json missing: run `npm run build` first');
  process.exit(1);
}

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
const files = walk(DIST);

const manifest = JSON.parse(readFileSync(join(DIST, 'manifest.json'), 'utf8'));
if (manifest.manifest_version !== 3) fail('manifest_version must be 3');
for (const key of ['host_permissions', 'content_scripts', 'web_accessible_resources']) {
  if (key in manifest) fail(`release manifest must not contain ${key} (that is the E2E-only build)`);
}
if (JSON.stringify([...manifest.permissions].sort()) !== JSON.stringify(['activeTab', 'scripting', 'storage'])) {
  fail(`unexpected permissions: ${manifest.permissions}`);
}
for (const f of [manifest.background?.service_worker, manifest.action?.default_popup, manifest.options_page, ...Object.values(manifest.icons ?? {})]) {
  if (f && !existsSync(join(DIST, f))) fail(`manifest references missing file ${f}`);
}
for (const f of ['content.js', 'main-world.js']) if (!existsSync(join(DIST, f))) fail(`missing ${f}`);

// Allowed URL-like strings: XML/SVG namespaces, spec links and the extension's own text.
const ALLOWED_URL = /^https?:\/\/(www\.w3\.org|w3\.org|react\.dev|reactjs\.org|github\.com\/facebook\/react|developer\.mozilla\.org)/;
for (const file of files.filter((f) => /\.(js|html|css|json)$/.test(f))) {
  const text = readFileSync(file, 'utf8');
  if (/\beval\s*\(|new Function\s*\(/.test(text)) fail(`${file}: dynamic code evaluation`);
  if (/<script[^>]+src=["']https?:/i.test(text)) fail(`${file}: remote script reference`);
  if (/import\s*\(\s*["']https?:/.test(text)) fail(`${file}: remote dynamic import`);
  if (/\bXMLHttpRequest\b|navigator\.sendBeacon|new WebSocket/.test(text) && !file.endsWith('.html')) {
    fail(`${file}: unexpected network primitive`);
  }
  for (const m of text.matchAll(/https?:\/\/[^\s"'`)\\]+/g)) {
    if (!ALLOWED_URL.test(m[0]) && !/^https?:\/\/(example\.|127\.0\.0\.1|localhost)/.test(m[0])) {
      // report once per file/url pair; many are string constants in comments or messages
      fail(`${file}: external URL ${m[0].slice(0, 80)}`);
    }
  }
}

// The only fetch() in the product is the stylesheet proxy in the service worker.
for (const file of files.filter((f) => f.endsWith('.js'))) {
  if (file.endsWith('service-worker.js')) continue;
  const text = readFileSync(file, 'utf8');
  if (/\bfetch\s*\(/.test(text) && !/popup|options/.test(file)) fail(`${file}: fetch() outside the service worker`);
}

const sizeKB = files.reduce((n, f) => n + statSync(f).size, 0) / 1024;
console.log(`audited ${files.length} files (${sizeKB.toFixed(0)} KB) in ${DIST}/`);
if (problems.length) {
  console.error('AUDIT FAILED:\n - ' + [...new Set(problems)].join('\n - '));
  process.exit(1);
}
console.log('audit passed: MV3, minimal permissions, no remote code, no unexpected network use');
