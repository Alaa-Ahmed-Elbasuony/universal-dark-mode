export type ThemeId = 'midnight' | 'oled' | 'nord' | 'warm' | 'custom';

export interface Oklch {
  l: number;
  c: number;
  h: number;
}

/** Role anchors for a theme, expressed in OKLCH. Pure data. */
export interface ThemeAnchors {
  bgPrimary: Oklch;
  bgSecondary: Oklch;
  surfaceElevated: Oklch;
  surfaceInteractive: Oklch;
  textPrimary: Oklch;
  textSecondary: Oklch;
  textMuted: Oklch;
  border: Oklch;
  divider: Oklch;
  link: Oklch;
  accent: Oklch;
  focus: Oklch;
}

export interface Theme {
  id: ThemeId;
  label: string;
  anchors: ThemeAnchors;
}

/** The three knobs behind the user's custom theme. Everything else is derived. */
export interface CustomThemeInput {
  /** OKLCH hue in degrees, 0..360. */
  hue: number;
  /** Background tint strength, 0 (neutral gray) .. 0.1. */
  chroma: number;
  /** Primary background lightness, 0 (true black) .. 0.4. */
  lightness: number;
}
