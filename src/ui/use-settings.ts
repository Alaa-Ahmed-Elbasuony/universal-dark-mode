import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExtensionSettings } from '../storage/settings.schema';
import { chromeLocalArea, onSettingsChanged, StorageManager } from '../storage/storage-manager';

const storage = new StorageManager(chromeLocalArea());

export interface SettingsApi {
  settings: ExtensionSettings | null;
  /** Optimistic update: the UI changes at once and rolls back if persisting fails. */
  update: (mutator: (s: ExtensionSettings) => void) => Promise<boolean>;
  error: string | null;
  clearError: () => void;
}

/** Loads settings, stays in sync with storage changes made elsewhere, and exposes `update`. */
export function useSettings(): SettingsApi {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<ExtensionSettings | null>(null);
  ref.current = settings;

  useEffect(() => {
    let alive = true;
    storage
      .load()
      .then((s) => alive && setSettings(s))
      .catch((e) => alive && setError(String(e)));
    const off = onSettingsChanged((s) => alive && setSettings(s));
    return () => {
      alive = false;
      off();
    };
  }, []);

  const update = useCallback(async (mutator: (s: ExtensionSettings) => void): Promise<boolean> => {
    const previous = ref.current;
    if (!previous) return false;
    const optimistic = structuredClone(previous);
    mutator(optimistic);
    setSettings(optimistic);
    try {
      setSettings(await storage.update(mutator));
      setError(null);
      return true;
    } catch (e) {
      setSettings(previous);
      setError(`Could not save: ${String(e)}`);
      return false;
    }
  }, []);

  return { settings, update, error, clearError: () => setError(null) };
}
