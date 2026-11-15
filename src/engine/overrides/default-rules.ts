import type { SiteRule } from './override-manager';

/**
 * Built-in per-site corrections, shipped with the extension. Intentionally EMPTY: the
 * generic engine is expected to handle sites on its own, and a rule should only be added
 * for a defect that cannot be fixed generically (with a regression test beside it).
 */
export const DEFAULT_RULES: SiteRule[] = [];
