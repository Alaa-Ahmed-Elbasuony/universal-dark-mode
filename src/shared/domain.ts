/** A site key is the hostname with a leading "www." removed. */
export type SiteKey = string;

const SUPPORTED_PROTOCOLS = new Set(['http:', 'https:', 'file:']);

export function siteKeyFromUrl(url: string): SiteKey | null {
  try {
    const u = new URL(url);
    if (!SUPPORTED_PROTOCOLS.has(u.protocol)) return null;
    if (u.protocol === 'file:') return 'file://';
    return u.hostname.replace(/^www\./, '').toLowerCase() || null;
  } catch {
    return null;
  }
}

/** Pages where Chrome does not allow content scripts. */
export function isRestrictedUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (!['http:', 'https:', 'file:'].includes(u.protocol)) return true;
    if (u.hostname === 'chromewebstore.google.com') return true;
    if (u.hostname === 'chrome.google.com' && u.pathname.startsWith('/webstore')) return true;
    return false;
  } catch {
    return true;
  }
}
