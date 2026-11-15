import type { SiteKey } from '../shared/domain';
import { clampCustomTheme, DEFAULT_CUSTOM_THEME } from '../themes/custom-theme';
import type { CustomThemeInput, ThemeId } from '../themes/theme.types';

export type DarkModeMode = 'auto' | 'forced' | 'disabled';

export const CURRENT_SCHEMA_VERSION = 3;
export const THEME_IDS: readonly ThemeId[] = ['midnight', 'oled', 'nord', 'warm', 'custom'];
export const MODES: readonly DarkModeMode[] = ['auto', 'forced', 'disabled'];
export const ADJUST_MIN = -50;
export const ADJUST_MAX = 50;
export const MAX_SELECTORS = 50;
export const MAX_SELECTOR_LENGTH = 200;

export interface Adjustments {
  brightness: number;
  contrast: number;
  imageDimming: boolean;
}

export interface GlobalSettings extends Adjustments {
  enabled: boolean;
  defaultMode: DarkModeMode;
  defaultTheme: ThemeId;
  followSystem: boolean;
}

export interface SiteSettings extends Partial<Adjustments> {
  mode?: DarkModeMode;
  theme?: ThemeId;
  excludedSelectors?: string[];
  customOverrides?: Record<string, string>;
}

export interface ExtensionSettings {
  schemaVersion: number;
  global: GlobalSettings;
  sites: Record<SiteKey, SiteSettings>;
  /** Inputs for the "custom" theme (shared by all sites that select it). */
  customTheme: CustomThemeInput;
}

export interface EffectiveSettings extends Adjustments {
  active: boolean;
  mode: DarkModeMode;
  theme: ThemeId;
  excludedSelectors: string[];
  customOverrides: Record<string, string>;
  customTheme: CustomThemeInput;
}

export function defaultSettings(): ExtensionSettings {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    global: {
      enabled: true,
      // Off everywhere until the user turns a site on.
      defaultMode: 'disabled',
      defaultTheme: 'midnight',
      followSystem: false,
      brightness: 0,
      contrast: 0,
      imageDimming: false,
    },
    sites: {},
    customTheme: { ...DEFAULT_CUSTOM_THEME },
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function clampAdjust(v: unknown, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.min(ADJUST_MAX, Math.max(ADJUST_MIN, Math.round(v)));
}

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;

/** Valid CSS selector check. Uses the DOM when available; otherwise accepts conservatively. */
export function isValidSelector(sel: unknown): sel is string {
  if (typeof sel !== 'string') return false;
  const s = sel.trim();
  if (!s || s.length > MAX_SELECTOR_LENGTH) return false;
  if (/[{};]|\/\*/.test(s)) return false;
  if (typeof document === 'undefined') return true;
  try {
    document.createDocumentFragment().querySelector(s);
    return true;
  } catch {
    return false;
  }
}

/** Hex / rgb() / hsl() / oklch() values only. No raw CSS is ever stored. */
const COLOR_VALUE = /^(#[0-9a-f]{3,8}|(rgb|hsl|oklch)a?\([0-9a-z\s.,%/-]+\))$/i;
export function isSafeColorValue(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 80 && COLOR_VALUE.test(v.trim());
}

export function sanitizeSite(raw: unknown): SiteSettings {
  if (!isRecord(raw)) return {};
  const out: SiteSettings = {};
  if (raw.mode !== undefined && MODES.includes(raw.mode as DarkModeMode))
    out.mode = raw.mode as DarkModeMode;
  if (raw.theme !== undefined && THEME_IDS.includes(raw.theme as ThemeId))
    out.theme = raw.theme as ThemeId;
  if (raw.brightness !== undefined) out.brightness = clampAdjust(raw.brightness, 0);
  if (raw.contrast !== undefined) out.contrast = clampAdjust(raw.contrast, 0);
  if (typeof raw.imageDimming === 'boolean') out.imageDimming = raw.imageDimming;
  if (Array.isArray(raw.excludedSelectors)) {
    out.excludedSelectors = raw.excludedSelectors.filter(isValidSelector).slice(0, MAX_SELECTORS);
  }
  if (isRecord(raw.customOverrides)) {
    const o: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw.customOverrides)) {
      if (isValidSelector(k) && isSafeColorValue(v)) o[k] = v;
    }
    out.customOverrides = o;
  }
  return out;
}

export function sanitizeCustomTheme(raw: unknown): CustomThemeInput {
  if (!isRecord(raw)) return { ...DEFAULT_CUSTOM_THEME };
  const n = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  return clampCustomTheme({
    hue: n(raw.hue, DEFAULT_CUSTOM_THEME.hue),
    chroma: n(raw.chroma, DEFAULT_CUSTOM_THEME.chroma),
    lightness: n(raw.lightness, DEFAULT_CUSTOM_THEME.lightness),
  });
}

export function sanitizeSettings(raw: unknown): ExtensionSettings {
  const d = defaultSettings();
  if (!isRecord(raw)) return d;
  const g = isRecord(raw.global) ? raw.global : {};
  const global: GlobalSettings = {
    enabled: typeof g.enabled === 'boolean' ? g.enabled : d.global.enabled,
    defaultMode: pick(g.defaultMode, MODES, d.global.defaultMode),
    defaultTheme: pick(g.defaultTheme, THEME_IDS, d.global.defaultTheme),
    followSystem: typeof g.followSystem === 'boolean' ? g.followSystem : d.global.followSystem,
    brightness: clampAdjust(g.brightness, 0),
    contrast: clampAdjust(g.contrast, 0),
    imageDimming: typeof g.imageDimming === 'boolean' ? g.imageDimming : false,
  };
  const sites: Record<SiteKey, SiteSettings> = {};
  if (isRecord(raw.sites)) {
    for (const [key, value] of Object.entries(raw.sites)) {
      if (key && key.length <= 253) sites[key] = sanitizeSite(value);
    }
  }
  return { schemaVersion: CURRENT_SCHEMA_VERSION, global, sites, customTheme: sanitizeCustomTheme(raw.customTheme) };
}

/**
 * Single source of truth for what applies to a site.
 * Precedence: global.enabled gate -> site value -> global default.
 * With followSystem, dark mode is only active while the OS prefers dark.
 */
export function resolveEffectiveSettings(
  settings: ExtensionSettings,
  siteKey: SiteKey | null,
  systemPrefersDark: boolean,
): EffectiveSettings {
  const g = settings.global;
  const s = (siteKey && settings.sites[siteKey]) || {};
  const mode = s.mode ?? g.defaultMode;
  const active = g.enabled && mode !== 'disabled' && (!g.followSystem || systemPrefersDark);
  return {
    active,
    mode,
    theme: s.theme ?? g.defaultTheme,
    brightness: s.brightness ?? g.brightness,
    contrast: s.contrast ?? g.contrast,
    imageDimming: s.imageDimming ?? g.imageDimming,
    excludedSelectors: s.excludedSelectors ?? [],
    customOverrides: s.customOverrides ?? {},
    customTheme: settings.customTheme,
  };
}
