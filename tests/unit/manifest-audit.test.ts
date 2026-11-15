import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const manifest = JSON.parse(readFileSync('public/manifest.json', 'utf8')) as Record<string, unknown>;
const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };

/** Permission and privacy audit: fails loudly if anything broader than intended is added. */
describe('manifest audit', () => {
  it('is Manifest V3 with matching versions', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.version).toBe(pkg.version);
  });

  it('requests only the minimal permissions', () => {
    expect([...(manifest.permissions as string[])].sort()).toEqual(['activeTab', 'scripting', 'storage']);
    expect(manifest.optional_host_permissions).toEqual(['<all_urls>']);
  });

  it('has no install-time host access, static content scripts or remote surfaces', () => {
    for (const key of [
      'host_permissions',
      'content_scripts',
      'web_accessible_resources',
      'externally_connectable',
      'optional_permissions',
      'devtools_page',
      'chrome_url_overrides',
      'update_url',
    ]) {
      expect(manifest, key).not.toHaveProperty(key);
    }
  });

  it('sets no relaxed content security policy', () => {
    expect(JSON.stringify(manifest)).not.toMatch(/unsafe-eval|unsafe-inline|wasm-unsafe/);
    expect(manifest).not.toHaveProperty('content_security_policy');
  });

  it('declares every icon file and listing-length text', () => {
    const icons = manifest.icons as Record<string, string>;
    for (const path of Object.values(icons)) expect(existsSync(`public/${path}`), path).toBe(true);
    expect((manifest.description as string).length).toBeLessThanOrEqual(132);
    expect((manifest.name as string).length).toBeLessThanOrEqual(45);
  });

  it('keeps the service worker a module and the shortcut documented', () => {
    expect(manifest.background).toEqual({ service_worker: 'service-worker.js', type: 'module' });
    expect(manifest.commands).toHaveProperty('toggle-dark-mode');
  });
});
