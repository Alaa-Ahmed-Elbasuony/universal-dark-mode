import type { Theme } from '../theme.types';

/** True black primary background; secondary surfaces are carefully separated from it. */
export const oled: Theme = {
  id: 'oled',
  label: 'OLED',
  anchors: {
    bgPrimary: { l: 0, c: 0, h: 0 },
    bgSecondary: { l: 0.15, c: 0.004, h: 265 },
    surfaceElevated: { l: 0.2, c: 0.005, h: 265 },
    surfaceInteractive: { l: 0.25, c: 0.006, h: 265 },
    textPrimary: { l: 0.95, c: 0, h: 0 },
    textSecondary: { l: 0.82, c: 0.003, h: 265 },
    textMuted: { l: 0.7, c: 0.004, h: 265 },
    border: { l: 0.32, c: 0.005, h: 265 },
    divider: { l: 0.25, c: 0.005, h: 265 },
    link: { l: 0.77, c: 0.12, h: 250 },
    accent: { l: 0.74, c: 0.15, h: 260 },
    focus: { l: 0.8, c: 0.15, h: 230 },
  },
};
