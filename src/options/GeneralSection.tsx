import type { SettingsApi } from '../ui/use-settings';
import { Range, Select, Switch } from '../ui/controls';
import { THEME_LIST } from '../themes/theme-registry';
import type { DarkModeMode } from '../storage/settings.schema';
import type { ThemeId } from '../themes/theme.types';

export const THEME_OPTIONS: Array<{ value: ThemeId; label: string }> = [
  ...THEME_LIST.map((t) => ({ value: t.id, label: t.label })),
  { value: 'custom', label: 'Custom' },
];

export const MODE_OPTIONS: Array<{ value: DarkModeMode; label: string }> = [
  { value: 'disabled', label: 'Off (turn on per site)' },
  { value: 'forced', label: 'Always dark' },
  { value: 'auto', label: 'Automatic (skip sites that are already dark)' },
];

export function GeneralSection({ settings, update }: Pick<SettingsApi, 'settings' | 'update'>) {
  if (!settings) return null;
  const g = settings.global;
  return (
    <section className="panel" id="general" aria-labelledby="general-h">
      <h2 id="general-h">General</h2>
      <div className="card">
        <Switch
          id="enabled"
          label="Enable Universal Dark Mode"
          hint="Turn everything off at once without losing your settings."
          checked={g.enabled}
          onChange={(v) => void update((s) => void (s.global.enabled = v))}
        />
        <Switch
          id="follow-system"
          label="Follow system appearance"
          hint="Only apply dark mode while your operating system is set to dark."
          checked={g.followSystem}
          onChange={(v) => void update((s) => void (s.global.followSystem = v))}
        />
        <Switch
          id="dimming"
          label="Dim images"
          hint="Slightly darken large photos and videos. Logos and icons are never dimmed."
          checked={g.imageDimming}
          onChange={(v) => void update((s) => void (s.global.imageDimming = v))}
        />
      </div>
      <div className="card">
        <div className="grid-2">
          <Select
            id="default-mode"
            label="Default for websites"
            value={g.defaultMode}
            options={MODE_OPTIONS}
            onChange={(v) => void update((s) => void (s.global.defaultMode = v))}
          />
          <Select
            id="default-theme"
            label="Default theme"
            value={g.defaultTheme}
            options={THEME_OPTIONS}
            onChange={(v) => void update((s) => void (s.global.defaultTheme = v))}
          />
        </div>
        <Range
          id="g-brightness"
          label="Brightness"
          min={-50}
          max={50}
          value={g.brightness}
          onChange={(v) => void update((s) => void (s.global.brightness = v))}
        />
        <Range
          id="g-contrast"
          label="Contrast"
          min={-50}
          max={50}
          value={g.contrast}
          onChange={(v) => void update((s) => void (s.global.contrast = v))}
        />
      </div>
    </section>
  );
}
