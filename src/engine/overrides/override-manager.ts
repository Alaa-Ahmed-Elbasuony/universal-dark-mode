import { DEFAULT_RULES } from './default-rules';

/** A built-in correction for one site (and its subdomains). Colors only, never raw CSS. */
export interface SiteRule {
  /** Hostname without "www.", e.g. "example.com". Subdomains match too. */
  host: string;
  excludedSelectors?: string[];
  /** selector -> background color. */
  customOverrides?: Record<string, string>;
}

export interface Overrides {
  excludedSelectors: string[];
  customOverrides: Record<string, string>;
}

const matches = (rule: SiteRule, host: string): boolean => host === rule.host || host.endsWith(`.${rule.host}`);

/**
 * Combines built-in rules with the user's own settings for a host. The user always wins:
 * their overrides replace built-ins for the same selector, and exclusions are unioned.
 */
export function resolveOverrides(
  host: string | null,
  user: Overrides,
  rules: SiteRule[] = DEFAULT_RULES,
): Overrides {
  const excluded = new Set<string>();
  const custom: Record<string, string> = {};
  if (host) {
    for (const rule of rules) {
      if (!matches(rule, host)) continue;
      for (const s of rule.excludedSelectors ?? []) excluded.add(s);
      Object.assign(custom, rule.customOverrides);
    }
  }
  for (const s of user.excludedSelectors) excluded.add(s);
  Object.assign(custom, user.customOverrides);
  return { excludedSelectors: [...excluded], customOverrides: custom };
}
