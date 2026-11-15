import { buildCustomTheme, DEFAULT_CUSTOM_THEME } from './custom-theme';
import { midnight } from './presets/midnight';
import { nord } from './presets/nord';
import { oled } from './presets/oled';
import { warm } from './presets/warm';
import type { CustomThemeInput, Theme, ThemeId } from './theme.types';

export const THEMES: Record<Exclude<ThemeId, 'custom'>, Theme> = { midnight, oled, nord, warm };

/** Resolves a theme id; "custom" is derived from the user's three custom-theme inputs. */
export function getTheme(id: ThemeId, custom: CustomThemeInput = DEFAULT_CUSTOM_THEME): Theme {
  return id === 'custom' ? buildCustomTheme(custom) : THEMES[id];
}

export const THEME_LIST: Theme[] = [midnight, oled, nord, warm];
