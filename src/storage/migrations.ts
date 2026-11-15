import { DEFAULT_CUSTOM_THEME } from '../themes/custom-theme';
import { CURRENT_SCHEMA_VERSION, sanitizeSettings, type ExtensionSettings } from './settings.schema';

export interface Migration {
  from: number;
  to: number;
  migrate: (data: Record<string, unknown>) => Record<string, unknown>;
}

/** Ordered list. Add an entry whenever CURRENT_SCHEMA_VERSION is bumped. */
export const MIGRATIONS: Migration[] = [
  // v1 -> v2: custom theme inputs were added.
  { from: 1, to: 2, migrate: (d) => ({ ...d, customTheme: { ...DEFAULT_CUSTOM_THEME } }) },
  // v2 -> v3: dark mode is off by default and enabled per site. The old default ("auto")
  // darkened every site that had the script, so it becomes "off"; explicit choices are kept.
  {
    from: 2,
    to: 3,
    migrate: (d) => {
      const g = typeof d.global === 'object' && d.global !== null ? (d.global as Record<string, unknown>) : {};
      return { ...d, global: { ...g, defaultMode: g.defaultMode === 'auto' || g.defaultMode === undefined ? 'disabled' : g.defaultMode } };
    },
  },
];

export function migrateSettings(
  raw: unknown,
  migrations: Migration[] = MIGRATIONS,
  target: number = CURRENT_SCHEMA_VERSION,
): ExtensionSettings {
  let data: Record<string, unknown> =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? { ...(raw as Record<string, unknown>) }
      : {};
  let version = typeof data.schemaVersion === 'number' ? data.schemaVersion : 0;
  while (version < target) {
    const step = migrations.find((m) => m.from === version);
    if (!step) break;
    data = { ...step.migrate(data), schemaVersion: step.to };
    version = step.to;
  }
  return sanitizeSettings(data);
}
