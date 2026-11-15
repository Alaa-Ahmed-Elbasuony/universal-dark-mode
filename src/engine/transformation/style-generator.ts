import { formatRgba } from '../colors/color';
import type { Palette } from '../colors/palette';
import { oklchToRgb } from '../colors/oklch';
import type { Oklch } from '../../themes/theme.types';

const css = (o: Oklch): string => formatRgba(oklchToRgb(o));

/**
 * Semantic baseline: page canvas, default text, native control theming and the CSS
 * variables other layers (and later UI) can use. Rewritten page rules follow this block in
 * the same sheet, so the page's own surface hierarchy wins wherever the page defines one.
 */
export function baseCss(p: Palette): string {
  return [
    ':root{',
    'color-scheme:dark!important;',
    `--udm-bg:${css(p.bg)};--udm-bg-2:${css(p.bgSecondary)};--udm-elevated:${css(p.elevated)};`,
    `--udm-interactive:${css(p.interactive)};--udm-text:${css(p.text)};--udm-text-2:${css(p.textSecondary)};`,
    `--udm-text-muted:${css(p.textMuted)};--udm-border:${css(p.border)};--udm-divider:${css(p.divider)};`,
    `--udm-link:${css(p.link)};--udm-accent:${css(p.accent)};--udm-focus:${css(p.focus)};`,
    '}',
    // Only <body> is painted: while <html> has no background of its own, the body's background
    // (including a page's gradient or image) propagates to the whole canvas. Painting <html>
    // would stop that and leave flat strips around the page's own background.
    'body{background-color:var(--udm-bg)!important;color:var(--udm-text)!important}',
    '::placeholder{color:var(--udm-text-muted)!important;opacity:1}',
    ':focus-visible{outline-color:var(--udm-focus)}',
  ].join('');
}
