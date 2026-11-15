import type { Theme } from '../theme.types';

/** Dark charcoal with a faint cool tint and clearly stepped surfaces. */
export const midnight: Theme = {
  id: 'midnight',
  label: 'Midnight',
  anchors: {
    bgPrimary: { l: 0.2, c: 0.01, h: 265 },
    bgSecondary: { l: 0.235, c: 0.011, h: 265 },
    surfaceElevated: { l: 0.275, c: 0.012, h: 265 },
    surfaceInteractive: { l: 0.32, c: 0.014, h: 265 },
    textPrimary: { l: 0.93, c: 0.005, h: 265 },
    textSecondary: { l: 0.8, c: 0.006, h: 265 },
    textMuted: { l: 0.69, c: 0.008, h: 265 },
    border: { l: 0.36, c: 0.01, h: 265 },
    divider: { l: 0.3, c: 0.01, h: 265 },
    link: { l: 0.76, c: 0.12, h: 250 },
    accent: { l: 0.72, c: 0.15, h: 260 },
    focus: { l: 0.78, c: 0.15, h: 230 },
  },
};
