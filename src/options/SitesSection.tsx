import { useEffect, useState } from 'react';
import { siteKeyFromUrl } from '../shared/domain';
import {
  isSafeColorValue,
  isValidSelector,
  MAX_SELECTORS,
  resolveEffectiveSettings,
  type DarkModeMode,
  type SiteSettings,
} from '../storage/settings.schema';
import { Range, Select, Switch } from '../ui/controls';
import type { SettingsApi } from '../ui/use-settings';
import type { ThemeId } from '../themes/theme.types';
import { MODE_OPTIONS, THEME_OPTIONS } from './GeneralSection';

const HOST = /^(localhost|\d{1,3}(\.\d{1,3}){3}|([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,})$/;

/** Accepts "example.com", "www.Example.com" or a pasted URL. */
export function normalizeHost(input: string): string | null {
  const t = input.trim().toLowerCase();
  if (!t) return null;
  const fromUrl = /^[a-z]+:\/\//.test(t) ? siteKeyFromUrl(t) : t.replace(/^www\./, '').split('/')[0]!;
  return fromUrl && HOST.test(fromUrl) ? fromUrl : null;
}

function readSelectedFromHash(): string | null {
  const m = /^#site=(.+)$/.exec(location.hash);
  return m ? decodeURIComponent(m[1]!) : null;
}

type Api = Pick<SettingsApi, 'settings' | 'update'>;

export function SitesSection({ settings, update }: Api) {
  const [selected, setSelected] = useState<string | null>(readSelectedFromHash);
  const [newHost, setNewHost] = useState('');
  const [hostError, setHostError] = useState<string | null>(null);

  useEffect(() => {
    const onHash = () => setSelected(readSelectedFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (!settings) return null;
  const keys = Object.keys(settings.sites).sort();
  if (selected && !keys.includes(selected)) keys.unshift(selected);

  const addSite = () => {
    const host = normalizeHost(newHost);
    if (!host) return setHostError('Enter a site like example.com');
    setHostError(null);
    setNewHost('');
    setSelected(host);
    void update((s) => void (s.sites[host] ??= {}));
  };

  return (
    <section className="panel" id="sites" aria-labelledby="sites-h">
      <h2 id="sites-h">Websites</h2>
      <p className="hint">
        Settings here override the global ones for a single site. Sites appear when you change them from the popup or add
        them below.
      </p>
      <div className="card">
        <ul className="list" aria-label="Websites with settings">
          {keys.length === 0 && <li className="meta">No site-specific settings yet.</li>}
          {keys.map((key) => {
            const eff = resolveEffectiveSettings(settings, key, true);
            return (
              <li key={key}>
                <div>
                  <strong>{key}</strong>
                  <div className="meta">
                    {eff.mode === 'disabled' ? 'Off' : eff.mode === 'forced' ? 'Always dark' : 'Automatic'} · {eff.theme}
                  </div>
                </div>
                <div className="actions">
                  <button type="button" className="btn secondary" aria-pressed={selected === key} onClick={() => setSelected(selected === key ? null : key)}>
                    {selected === key ? 'Close' : 'Edit'}
                  </button>
                  <button
                    type="button"
                    className="btn danger"
                    aria-label={`Remove settings for ${key}`}
                    onClick={() => {
                      if (selected === key) setSelected(null);
                      void update((s) => void delete s.sites[key]);
                    }}
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="field">
          <label htmlFor="new-host">Add a website</label>
          <div className="actions">
            <input
              id="new-host"
              type="text"
              placeholder="example.com"
              value={newHost}
              aria-invalid={hostError !== null}
              aria-describedby={hostError ? 'new-host-err' : undefined}
              onChange={(e) => setNewHost(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addSite()}
              style={{ flex: 1 }}
            />
            <button type="button" className="btn" onClick={addSite}>
              Add
            </button>
          </div>
          {hostError && (
            <p className="error" id="new-host-err" role="alert">
              {hostError}
            </p>
          )}
        </div>
      </div>
      {selected && <SiteEditor key={selected} host={selected} settings={settings} update={update} />}
    </section>
  );
}

function SiteEditor({ host, settings, update }: Api & { host: string }) {
  if (!settings) return null;
  const site: SiteSettings = settings.sites[host] ?? {};
  const eff = resolveEffectiveSettings(settings, host, true);

  const patch = (fn: (site: SiteSettings) => void) =>
    void update((s) => {
      const target = (s.sites[host] ??= {});
      fn(target);
    });

  return (
    <div className="card" role="group" aria-labelledby="editor-h">
      <h3 id="editor-h" style={{ margin: 0 }}>
        Settings for {host}
      </h3>
      <div className="grid-2">
        <Select
          id="site-mode"
          label="Behavior"
          value={(site.mode ?? 'inherit') as DarkModeMode | 'inherit'}
          options={[{ value: 'inherit' as const, label: 'Use global default' }, ...MODE_OPTIONS]}
          onChange={(v) => patch((t) => (v === 'inherit' ? void delete t.mode : void (t.mode = v)))}
        />
        <Select
          id="site-theme"
          label="Theme"
          value={(site.theme ?? 'inherit') as ThemeId | 'inherit'}
          options={[{ value: 'inherit' as const, label: 'Use global default' }, ...THEME_OPTIONS]}
          onChange={(v) => patch((t) => (v === 'inherit' ? void delete t.theme : void (t.theme = v)))}
        />
      </div>

      <Override
        id="site-brightness"
        label="Brightness"
        isSet={site.brightness !== undefined}
        value={eff.brightness}
        onToggle={(on) => patch((t) => (on ? void (t.brightness = eff.brightness) : void delete t.brightness))}
        onChange={(v) => patch((t) => void (t.brightness = v))}
      />
      <Override
        id="site-contrast"
        label="Contrast"
        isSet={site.contrast !== undefined}
        value={eff.contrast}
        onToggle={(on) => patch((t) => (on ? void (t.contrast = eff.contrast) : void delete t.contrast))}
        onChange={(v) => patch((t) => void (t.contrast = v))}
      />
      <Switch
        id="site-dimming"
        label="Dim images on this site"
        checked={eff.imageDimming}
        onChange={(v) => patch((t) => void (t.imageDimming = v))}
      />

      <ExcludedSelectors selectors={site.excludedSelectors ?? []} onSave={(list) => patch((t) => (list.length ? void (t.excludedSelectors = list) : void delete t.excludedSelectors))} />
      <ColorOverrides
        overrides={site.customOverrides ?? {}}
        onSave={(o) => patch((t) => (Object.keys(o).length ? void (t.customOverrides = o) : void delete t.customOverrides))}
      />

      <div className="actions">
        <button type="button" className="btn danger" onClick={() => void update((s) => void (s.sites[host] = {}))}>
          Reset this website
        </button>
      </div>
    </div>
  );
}

function Override(props: {
  id: string;
  label: string;
  isSet: boolean;
  value: number;
  onToggle: (on: boolean) => void;
  onChange: (v: number) => void;
}) {
  return (
    <div className="stack">
      <Switch id={`${props.id}-on`} label={`Override global ${props.label.toLowerCase()}`} checked={props.isSet} onChange={props.onToggle} />
      {props.isSet && <Range id={props.id} label={props.label} min={-50} max={50} value={props.value} onChange={props.onChange} />}
    </div>
  );
}

function ExcludedSelectors({ selectors, onSave }: { selectors: string[]; onSave: (list: string[]) => void }) {
  const [text, setText] = useState(selectors.join('\n'));
  const [errors, setErrors] = useState<string[]>([]);

  const commit = () => {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const bad: string[] = lines.filter((l): boolean => !isValidSelector(l));
    if (lines.length > MAX_SELECTORS) bad.push(`Too many selectors (max ${MAX_SELECTORS})`);
    setErrors(bad);
    if (bad.length === 0) onSave(lines);
  };

  return (
    <div className="field">
      <label htmlFor="excluded">Excluded elements (CSS selectors, one per line)</label>
      <textarea
        id="excluded"
        value={text}
        spellCheck={false}
        aria-invalid={errors.length > 0}
        aria-describedby="excluded-hint"
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        placeholder={'.map-canvas\n#signature-pad'}
      />
      <p className="hint" id="excluded-hint">
        Matching elements and everything inside them keep their original colors.
      </p>
      {errors.length > 0 && (
        <p className="error" role="alert">
          Not saved. Invalid: {errors.join(', ')}
        </p>
      )}
    </div>
  );
}

function ColorOverrides({ overrides, onSave }: { overrides: Record<string, string>; onSave: (o: Record<string, string>) => void }) {
  const [selector, setSelector] = useState('');
  const [color, setColor] = useState('#1e1e2e');
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    if (!isValidSelector(selector)) return setError('Enter a valid CSS selector.');
    if (!isSafeColorValue(color)) return setError('Enter a color like #1e1e2e or rgb(30, 30, 46).');
    setError(null);
    setSelector('');
    onSave({ ...overrides, [selector.trim()]: color.trim() });
  };

  return (
    <div className="field">
      <span id="overrides-h" style={{ color: 'var(--muted)', fontSize: 12 }}>
        Custom background colors
      </span>
      <ul className="list" aria-labelledby="overrides-h">
        {Object.entries(overrides).map(([sel, col]) => (
          <li key={sel}>
            <span>
              <code>{sel}</code> → <span style={{ background: col, border: '1px solid var(--border)', padding: '0 10px', borderRadius: 4 }}> </span> {col}
            </span>
            <button
              type="button"
              className="btn danger"
              aria-label={`Remove color override for ${sel}`}
              onClick={() => {
                const { [sel]: _removed, ...rest } = overrides;
                void _removed;
                onSave(rest);
              }}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <div className="override-row">
        <input type="text" aria-label="Selector for a custom background color" placeholder=".sidebar" value={selector} onChange={(e) => setSelector(e.target.value)} />
        <input type="text" aria-label="Background color" value={color} onChange={(e) => setColor(e.target.value)} />
        <button type="button" className="btn" onClick={add}>
          Add
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
