import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from '../../src/engine/overrides/default-rules';
import { resolveOverrides, type SiteRule } from '../../src/engine/overrides/override-manager';

const none = { excludedSelectors: [], customOverrides: {} };
const rules: SiteRule[] = [
  { host: 'example.com', excludedSelectors: ['.map'], customOverrides: { '.nav': '#111111' } },
  { host: 'other.org', excludedSelectors: ['.x'] },
];

describe('override manager', () => {
  it('ships no built-in site rules', () => {
    expect(DEFAULT_RULES).toEqual([]);
  });

  it('applies rules to the host and its subdomains only', () => {
    expect(resolveOverrides('example.com', none, rules).excludedSelectors).toEqual(['.map']);
    expect(resolveOverrides('docs.example.com', none, rules).excludedSelectors).toEqual(['.map']);
    expect(resolveOverrides('notexample.com', none, rules)).toEqual(none);
    expect(resolveOverrides(null, none, rules)).toEqual(none);
  });

  it('merges with user settings; the user wins on conflicts', () => {
    const out = resolveOverrides(
      'example.com',
      { excludedSelectors: ['.map', '.ad'], customOverrides: { '.nav': '#222222' } },
      rules,
    );
    expect(out.excludedSelectors.sort()).toEqual(['.ad', '.map']);
    expect(out.customOverrides).toEqual({ '.nav': '#222222' });
  });
});
