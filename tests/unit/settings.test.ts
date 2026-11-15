import { describe, expect, it } from 'vitest';
import { migrateSettings, type Migration } from '../../src/storage/migrations';
import {
  CURRENT_SCHEMA_VERSION,
  defaultSettings,
  isSafeColorValue,
  isValidSelector,
  resolveEffectiveSettings,
  sanitizeSettings,
} from '../../src/storage/settings.schema';
import { StorageManager, SETTINGS_KEY, type StorageArea } from '../../src/storage/storage-manager';

function fakeArea(initial: Record<string, unknown> = {}): StorageArea & { data: Record<string, unknown> } {
  const data = { ...initial };
  return {
    data,
    get: async (key) => (key in data ? { [key]: data[key] } : {}),
    set: async (items) => {
      Object.assign(data, items);
    },
  };
}

describe('sanitizeSettings', () => {
  it('returns defaults for garbage input', () => {
    expect(sanitizeSettings(null)).toEqual(defaultSettings());
    expect(sanitizeSettings('x')).toEqual(defaultSettings());
    expect(sanitizeSettings([])).toEqual(defaultSettings());
  });

  it('falls back per field, not wholesale', () => {
    const s = sanitizeSettings({
      global: { enabled: false, defaultTheme: 'bogus', brightness: 999, contrast: 'x' },
    });
    expect(s.global.enabled).toBe(false);
    expect(s.global.defaultTheme).toBe('midnight');
    expect(s.global.brightness).toBe(50);
    expect(s.global.contrast).toBe(0);
  });

  it('drops invalid selectors and non-color overrides', () => {
    const s = sanitizeSettings({
      sites: {
        'a.com': {
          excludedSelectors: ['.ok', 'div{color:red}', '', '(((', 5],
          customOverrides: { '.x': '#fff', '.y': 'red;} body{display:none', '(((': '#000' },
        },
      },
    });
    expect(s.sites['a.com']?.excludedSelectors).toEqual(['.ok']);
    expect(s.sites['a.com']?.customOverrides).toEqual({ '.x': '#fff' });
  });
});

describe('validators', () => {
  it('accepts only safe color values', () => {
    expect(isSafeColorValue('#1a2b3c')).toBe(true);
    expect(isSafeColorValue('rgb(10, 20, 30)')).toBe(true);
    expect(isSafeColorValue('oklch(0.2 0.02 250)')).toBe(true);
    expect(isSafeColorValue('url(http://evil)')).toBe(false);
    expect(isSafeColorValue('red}')).toBe(false);
  });

  it('rejects selectors with CSS-breaking characters', () => {
    expect(isValidSelector('a > .b')).toBe(true);
    expect(isValidSelector('a{}')).toBe(false);
    expect(isValidSelector('x'.repeat(500))).toBe(false);
  });
});

describe('resolveEffectiveSettings', () => {
  it('uses global defaults when the site has no overrides', () => {
    const e = resolveEffectiveSettings(defaultSettings(), 'a.com', false);
    expect(e).toMatchObject({ active: false, theme: 'midnight', mode: 'disabled', brightness: 0 });
  });

  it('site values override global', () => {
    const s = defaultSettings();
    s.sites['a.com'] = { theme: 'nord', brightness: 10, mode: 'forced' };
    const e = resolveEffectiveSettings(s, 'a.com', false);
    expect(e).toMatchObject({ theme: 'nord', brightness: 10, mode: 'forced', active: true });
  });

  it('global disable wins over a site setting', () => {
    const s = defaultSettings();
    s.global.enabled = false;
    s.sites['a.com'] = { mode: 'forced' };
    expect(resolveEffectiveSettings(s, 'a.com', true).active).toBe(false);
  });

  it('site disabled turns it off', () => {
    const s = defaultSettings();
    s.global.defaultMode = 'forced';
    s.sites['a.com'] = { mode: 'disabled' };
    expect(resolveEffectiveSettings(s, 'a.com', true).active).toBe(false);
    expect(resolveEffectiveSettings(s, 'b.com', true).active).toBe(true);
  });

  it('followSystem only activates when the OS prefers dark', () => {
    const s = defaultSettings();
    s.global.defaultMode = 'forced';
    s.global.followSystem = true;
    expect(resolveEffectiveSettings(s, 'a.com', false).active).toBe(false);
    expect(resolveEffectiveSettings(s, 'a.com', true).active).toBe(true);
  });
});

describe('dark mode is off by default and on only for opted-in sites', () => {
  it('is inactive for every site until one is enabled', () => {
    const s = defaultSettings();
    expect(resolveEffectiveSettings(s, 'a.com', true).active).toBe(false);
    s.sites['a.com'] = { mode: 'forced' };
    expect(resolveEffectiveSettings(s, 'a.com', true).active).toBe(true);
    expect(resolveEffectiveSettings(s, 'b.com', true).active).toBe(false);
  });

  it('migrates the old "auto" default to off but keeps explicit choices', () => {
    const old = { schemaVersion: 2, global: { defaultMode: 'auto', enabled: true }, sites: { 'a.com': { mode: 'forced' } } };
    const m = migrateSettings(old);
    expect(m.global.defaultMode).toBe('disabled');
    expect(m.sites['a.com']?.mode).toBe('forced');
    expect(migrateSettings({ schemaVersion: 2, global: { defaultMode: 'forced' } }).global.defaultMode).toBe('forced');
  });
});

describe('migrateSettings', () => {
  it('runs ordered migrations up to the target version', () => {
    const migrations: Migration[] = [
      { from: 0, to: 1, migrate: (d) => ({ ...d, global: { enabled: false } }) },
    ];
    const s = migrateSettings({ legacy: true }, migrations, 1);
    expect(s.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(s.global.enabled).toBe(false);
  });

  it('handles missing data', () => {
    expect(migrateSettings(undefined)).toEqual(defaultSettings());
  });
});

describe('StorageManager', () => {
  it('round-trips settings and sanitizes on save', async () => {
    const area = fakeArea();
    const mgr = new StorageManager(area);
    const updated = await mgr.update((s) => {
      s.global.enabled = false;
      s.global.brightness = 500;
    });
    expect(updated.global.brightness).toBe(50);
    expect((await mgr.load()).global.enabled).toBe(false);
    expect(area.data[SETTINGS_KEY]).toBeDefined();
  });

  it('falls back to defaults when storage throws', async () => {
    const mgr = new StorageManager({
      get: async () => {
        throw new Error('boom');
      },
      set: async () => {},
    });
    expect(await mgr.load()).toEqual(defaultSettings());
  });
});
