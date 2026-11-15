import { classifyMedia } from './media-detector';

const DIM = 'brightness(0.85)';

/**
 * Optional image dimming (a separate user setting). Only large photos and videos are dimmed;
 * logos, icons, canvases and embeds never are. An existing page filter is preserved.
 * Returns a `filter` declaration or null.
 */
export function dimDeclaration(el: Element, enabled: boolean, view: Window): string | null {
  if (!enabled || (el.tagName !== 'IMG' && el.tagName !== 'VIDEO')) return null;
  const rect = el.getBoundingClientRect();
  const kind = classifyMedia(el, rect.width, rect.height);
  if (kind !== 'photo' && kind !== 'video') return null;
  const existing = view.getComputedStyle(el).filter;
  const filter = existing && existing !== 'none' ? `${existing} ${DIM}` : DIM;
  return `filter:${filter}!important`;
}
