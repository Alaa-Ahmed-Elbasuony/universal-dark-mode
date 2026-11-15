import { migrateSettings } from './migrations';
import { defaultSettings, sanitizeSettings, type ExtensionSettings } from './settings.schema';

/** Minimal subset of chrome.storage.StorageArea so tests can inject a fake. */
export interface StorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export const SETTINGS_KEY = 'udm.settings';

export class StorageManager {
  constructor(private readonly area: StorageArea) {}

  async load(): Promise<ExtensionSettings> {
    try {
      const res = await this.area.get(SETTINGS_KEY);
      return migrateSettings(res[SETTINGS_KEY]);
    } catch (err) {
      console.error('[UDM] failed to load settings, using defaults', err);
      return defaultSettings();
    }
  }

  async save(settings: ExtensionSettings): Promise<void> {
    await this.area.set({ [SETTINGS_KEY]: sanitizeSettings(settings) });
  }

  async update(mutator: (s: ExtensionSettings) => void): Promise<ExtensionSettings> {
    const s = await this.load();
    mutator(s);
    const clean = sanitizeSettings(s);
    await this.save(clean);
    return clean;
  }
}

export function chromeLocalArea(): StorageArea {
  return chrome.storage.local as unknown as StorageArea;
}

/** Subscribe to settings changes. Returns an unsubscribe function. */
export function onSettingsChanged(cb: (s: ExtensionSettings) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string): void => {
    const change = changes[SETTINGS_KEY];
    if (area !== 'local' || !change) return;
    cb(migrateSettings(change.newValue));
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
