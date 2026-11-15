import type { Theme } from '../theme.types';

/** Warm charcoal and brown tones with soft contrast and warm text. */
export const warm: Theme = {
  id: 'warm',
  label: 'Warm',
  anchors: {
    bgPrimary: { l: 0.22, c: 0.016, h: 60 },
    bgSecondary: { l: 0.255, c: 0.018, h: 60 },
    surfaceElevated: { l: 0.29, c: 0.02, h: 60 },
    surfaceInteractive: { l: 0.335, c: 0.022, h: 60 },
    textPrimary: { l: 0.92, c: 0.022, h: 75 },
    textSecondary: { l: 0.8, c: 0.022, h: 70 },
    textMuted: { l: 0.7, c: 0.02, h: 65 },
    border: { l: 0.38, c: 0.02, h: 60 },
    divider: { l: 0.32, c: 0.018, h: 60 },
    link: { l: 0.77, c: 0.11, h: 70 },
    accent: { l: 0.74, c: 0.13, h: 55 },
    focus: { l: 0.8, c: 0.13, h: 85 },
  },
};
