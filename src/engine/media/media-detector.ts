/**
 * Media classification. The engine never recolors media: these helpers only decide which
 * elements are protected, which may be dimmed, and which look like logos or icons.
 * When unsure, prefer leaving the original appearance alone.
 */

/** Elements whose own backgrounds/borders are never rewritten (e.g. white behind a logo). */
export const PROTECTED_MEDIA_SELECTORS = ['img', 'video', 'canvas', 'picture', 'object', 'embed', 'iframe'];

export type MediaKind = 'logo' | 'icon' | 'photo' | 'video' | 'canvas' | 'embed';

const LOGO_HINT = /(?:^|[^a-z])(logo|logotype|wordmark|brandmark|brand)(?:[^a-z]|$)/i;
const ICON_MAX = 48;
const PHOTO_MIN = 80;

/** Logos are recognized by name only (alt, class, id, file name, aria-label) on the element or near ancestors. */
export function looksLikeLogo(el: Element): boolean {
  let node: Element | null = el;
  for (let depth = 0; node && depth < 4; depth++, node = node.parentElement) {
    const src = node instanceof HTMLImageElement ? node.currentSrc || node.src : (node.getAttribute('src') ?? '');
    const hints = [
      node.getAttribute('alt'),
      node.getAttribute('aria-label'),
      node.getAttribute('title'),
      typeof node.className === 'string' ? node.className : node.getAttribute('class'),
      node.id,
      src.startsWith('data:') ? '' : src,
    ];
    if (hints.some((h) => h && LOGO_HINT.test(h))) return true;
  }
  return false;
}

export function classifyMedia(el: Element, width: number, height: number): MediaKind | null {
  switch (el.tagName) {
    case 'VIDEO':
      return 'video';
    case 'CANVAS':
      return 'canvas';
    case 'IFRAME':
    case 'OBJECT':
    case 'EMBED':
      return 'embed';
    case 'IMG':
    case 'PICTURE': {
      if (looksLikeLogo(el)) return 'logo';
      if (width <= ICON_MAX && height <= ICON_MAX) return 'icon';
      if (width >= PHOTO_MIN && height >= PHOTO_MIN) return 'photo';
      return 'icon';
    }
    default:
      return null;
  }
}
