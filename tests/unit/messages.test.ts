import { describe, expect, it } from 'vitest';
import { isRestrictedUrl, siteKeyFromUrl } from '../../src/shared/domain';
import { isBackgroundRequest, isContentRequest } from '../../src/shared/messages';

describe('message guards', () => {
  it('validates content requests', () => {
    expect(isContentRequest({ type: 'PING' })).toBe(true);
    expect(isContentRequest({ type: 'NOPE' })).toBe(false);
    expect(isContentRequest(null)).toBe(false);
  });

  it('validates background requests with payloads', () => {
    expect(isBackgroundRequest({ type: 'GET_ACCESS_STATE' })).toBe(true);
    expect(isBackgroundRequest({ type: 'APPLY_TO_TAB', tabId: 1 })).toBe(true);
    expect(isBackgroundRequest({ type: 'APPLY_TO_TAB', tabId: '1' })).toBe(false);
    expect(isBackgroundRequest({ type: 'FETCH_STYLESHEET', url: 5 })).toBe(false);
  });
});

describe('domain helpers', () => {
  it('derives site keys', () => {
    expect(siteKeyFromUrl('https://www.Example.com/a?b')).toBe('example.com');
    expect(siteKeyFromUrl('chrome://settings')).toBeNull();
    expect(siteKeyFromUrl('garbage')).toBeNull();
  });

  it('flags restricted pages', () => {
    expect(isRestrictedUrl('chrome://extensions')).toBe(true);
    expect(isRestrictedUrl('https://chromewebstore.google.com/detail/x')).toBe(true);
    expect(isRestrictedUrl('https://example.com')).toBe(false);
  });
});
