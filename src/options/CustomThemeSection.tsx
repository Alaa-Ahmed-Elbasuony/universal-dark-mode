import { formatRgba } from '../engine/colors/color';
import { generatePalette } from '../engine/colors/palette';
import { oklchToRgb } from '../engine/colors/oklch';
import { DEFAULT_CUSTOM_THEME } from '../themes/custom-theme';
import { getTheme } from '../themes/theme-registry';
import type { Oklch } from '../themes/theme.types';
import { Range } from '../ui/controls';
import type { SettingsApi } from '../ui/use-settings';

const css = (o: Oklch): string => formatRgba(oklchToRgb(o));

export function CustomThemeSection({ settings, update }: Pick<SettingsApi, 'settings' | 'update'>) {
  if (!settings) return null;
  const input = settings.customTheme;
  const palette = generatePalette(getTheme('custom', input), 0, 0);
  const set = (patch: Partial<typeof input>) => void update((s) => void (s.customTheme = { ...s.customTheme, ...patch }));

  return (
    <section className="panel" id="custom-theme" aria-labelledby="custom-h">
      <h2 id="custom-h">Custom theme</h2>
      <p className="hint">
        Pick a tint and a depth. Text colors are derived automatically and always keep strong contrast. Choose
        “Custom” as a site’s or the default theme to use it.
      </p>
      <div className="card">
        <Range id="ct-hue" label="Hue" min={0} max={359} value={input.hue} onChange={(hue) => set({ hue })} format={(v) => `${v}°`} />
        <Range
          id="ct-chroma"
          label="Tint strength"
          min={0}
          max={0.1}
          step={0.005}
          value={input.chroma}
          onChange={(chroma) => set({ chroma })}
          format={(v) => v.toFixed(3)}
        />
        <Range
          id="ct-lightness"
          label="Background lightness"
          min={0}
          max={0.4}
          step={0.01}
          value={input.lightness}
          onChange={(lightness) => set({ lightness })}
          format={(v) => v.toFixed(2)}
        />
        <div
          className="preview"
          role="img"
          aria-label="Preview of the custom theme"
          style={{ background: css(palette.bg), color: css(palette.text), borderColor: css(palette.border) }}
        >
          <strong>Preview heading</strong>
          <span style={{ color: css(palette.textSecondary) }}>Secondary text on the page background.</span>
          <div style={{ background: css(palette.elevated), padding: 10, borderRadius: 8, border: `1px solid ${css(palette.divider)}` }}>
            Elevated surface with <span style={{ color: css(palette.link), textDecoration: 'underline' }}>a link</span>
            <span className="chip" style={{ marginLeft: 8, background: css(palette.accent), color: css(palette.bg) }}>
              Accent
            </span>
          </div>
        </div>
        <div className="actions">
          <button type="button" className="btn secondary" onClick={() => void update((s) => void (s.customTheme = { ...DEFAULT_CUSTOM_THEME }))}>
            Reset custom theme
          </button>
        </div>
      </div>
    </section>
  );
}
