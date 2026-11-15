import type { Theme } from '../theme.types';

/** Cool blue-gray polar-night backgrounds with muted, blue-toned accents. */
export const nord: Theme = {
  id: 'nord',
  label: 'Nord',
  anchors: {
    bgPrimary: { l: 0.32, c: 0.028, h: 262 },
    bgSecondary: { l: 0.355, c: 0.03, h: 262 },
    surfaceElevated: { l: 0.39, c: 0.032, h: 262 },
    surfaceInteractive: { l: 0.435, c: 0.034, h: 262 },
    textPrimary: { l: 0.95, c: 0.012, h: 262 },
    textSecondary: { l: 0.87, c: 0.016, h: 262 },
    textMuted: { l: 0.77, c: 0.02, h: 262 },
    border: { l: 0.48, c: 0.03, h: 262 },
    divider: { l: 0.42, c: 0.03, h: 262 },
    link: { l: 0.78, c: 0.07, h: 210 },
    accent: { l: 0.72, c: 0.08, h: 235 },
    focus: { l: 0.8, c: 0.08, h: 205 },
  },
};
