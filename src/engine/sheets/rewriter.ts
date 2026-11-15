import { COLOR_TOKEN_NAMES, formatRgba, parseColor } from '../colors/color';
import type { Mapper, Role } from '../colors/mapping';
import { augmentSelectors } from './selector';
import type { VarResolver } from './variables';

/**
 * Longhand properties whose colors we remap. Browsers enumerate shorthands such as
 * `background` and `border` as longhands, so listing longhands covers both forms.
 */
const PROP_ROLE: Record<string, Role> = {
  color: 'text',
  'caret-color': 'text',
  'text-decoration-color': 'text',
  '-webkit-text-fill-color': 'text',
  'background-color': 'surface',
  'background-image': 'surface',
  'border-top-color': 'border',
  'border-right-color': 'border',
  'border-bottom-color': 'border',
  'border-left-color': 'border',
  'border-block-start-color': 'border',
  'border-block-end-color': 'border',
  'border-inline-start-color': 'border',
  'border-inline-end-color': 'border',
  'outline-color': 'border',
  'column-rule-color': 'border',
};

/** Tailwind gradient stop variables (from / via / to / stops), set on the element itself. */
const TW_GRADIENT_VAR = /^--tw-gradient-(from|via|to|stops)$/;

const SKIP_AT = /^(font-face|keyframes|property|page|counter-style|font-feature-values|view-transition|-webkit-keyframes)$/;

const NAME_ALT = COLOR_TOKEN_NAMES.join('|');
const TOKEN = new RegExp(
  `#[0-9a-f]{3,8}\\b|\\b(?:rgba?|hsla?|oklch|oklab)\\([^()]*\\)|\\bcolor\\(srgb[^()]*\\)|\\b(?:${NAME_ALT})\\b`,
  'gi',
);
// Text that must never be rewritten: url(...) and quoted strings.
const OPAQUE_SEGMENT = /(url\([^)]*\)|"[^"]*"|'[^']*')/;

function mapToken(token: string, role: Role, mapper: Mapper): string {
  const c = parseColor(token);
  return c ? formatRgba(mapper.byRole(role, c)) : token;
}

/** Maps every color token in `value` (outside url()/strings). Returns null if unchanged. */
export function mapValue(value: string, role: Role, mapper: Mapper): string | null {
  const whole = parseColor(value);
  if (whole) {
    const out = formatRgba(mapper.byRole(role, whole));
    return out === formatRgba(whole) ? null : out;
  }
  if (!value || /^(inherit|initial|unset|revert|currentcolor|none)$/i.test(value.trim())) return null;
  const mapped = value
    .split(OPAQUE_SEGMENT)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(TOKEN, (t) => mapToken(t, role, mapper))))
    .join('');
  return mapped === value ? null : mapped;
}

interface Ctx {
  mapper: Mapper;
  vars: VarResolver;
  /** `:not(:where(...))` appended to emitted selectors (protected media, user exclusions). */
  suffix: string;
  rules: number;
}

/**
 * Shorthands that Chrome exposes with EMPTY longhands when they contain var(). The
 * authored text is only readable through the shorthand name.
 */
const SHORTHAND_ROLE: Array<[string, Role, string]> = [
  ['background', 'surface', 'background-color'],
  ['border', 'border', 'border-color'],
  ['border-color', 'border', 'border-color'],
  ['border-top', 'border', 'border-top-color'],
  ['border-right', 'border', 'border-right-color'],
  ['border-bottom', 'border', 'border-bottom-color'],
  ['border-left', 'border', 'border-left-color'],
  ['border-block', 'border', 'border-block-color'],
  ['border-inline', 'border', 'border-inline-color'],
  ['outline', 'border', 'outline-color'],
  ['column-rule', 'border', 'column-rule-color'],
];

/** Emit color-only longhands where possible so unrelated shorthand parts are never reset. */
function shorthandOverride(
  name: string,
  role: Role,
  colorLonghand: string,
  resolved: string,
  mapper: Mapper,
): string | null {
  if (role === 'surface' && /gradient\(|url\(/.test(resolved)) {
    const mapped = mapValue(resolved, role, mapper);
    return mapped === null ? null : `${name}:${mapped}!important`;
  }
  const token = resolved.match(TOKEN)?.[0];
  if (!token) return null;
  const c = parseColor(token);
  if (!c || c.a === 0) return null;
  return `${colorLonghand}:${formatRgba(mapper.byRole(role, c))}!important`;
}

function preludeOf(rule: CSSRule): string | null {
  const name = rule.constructor.name;
  const r = rule as unknown as Record<string, unknown>;
  if (name === 'CSSMediaRule') return `@media ${(r.media as MediaList).mediaText}`;
  if (name === 'CSSSupportsRule') return `@supports ${String(r.conditionText)}`;
  if (name === 'CSSLayerBlockRule') return r.name ? `@layer ${String(r.name)}` : '@layer';
  // Containers, scopes and anything newer: take the prelude from the serialized text.
  const text = rule.cssText;
  const brace = text.indexOf('{');
  return brace > 0 ? text.slice(0, brace).trim() : null;
}

function rewriteStyleRule(rule: CSSStyleRule, ctx: Ctx, nested: boolean): string {
  const style = rule.style;
  const decls: string[] = [];
  let sawEmptyLonghand = false;
  for (let i = 0; i < style.length; i++) {
    const prop = style[i]!;
    const isGradientVar = TW_GRADIENT_VAR.test(prop);
    const role = isGradientVar ? 'surface' : PROP_ROLE[prop];
    if (!role) continue;
    const raw = style.getPropertyValue(prop).trim();
    if (isGradientVar) {
      // Gradient stop colors live in per-element variables (`.to-white{--tw-gradient-to:#fff}`),
      // which the root-based resolver can't see. Map the definition itself.
      const mappedVar = raw ? mapValue(raw, 'surface', ctx.mapper) : null;
      if (mappedVar !== null) decls.push(`${prop}:${mappedVar}!important`);
      continue;
    }
    if (!raw) {
      sawEmptyLonghand = true; // likely a var()-bearing shorthand; handled below
      continue;
    }
    const value = raw.includes('var(') ? ctx.vars.resolve(raw) : raw;
    if (value === null) continue; // unresolvable variable: leave untouched
    // url() images are never copied: relative URLs would resolve against our sheet's base.
    if (prop === 'background-image' && !value.includes('gradient(') && value !== 'none') continue;
    // Unchanged values are emitted too: our !important rules then reproduce the page's own
    // specificity and source order. Skipping a kept brand color (e.g. `.on { bg: green }`)
    // would let a mapped, less specific `!important` base rule override it.
    const mapped = mapValue(value, role, ctx.mapper);
    decls.push(`${prop}:${mapped ?? value}!important`);
  }
  if (sawEmptyLonghand) {
    for (const [name, role, colorLonghand] of SHORTHAND_ROLE) {
      const raw = style.getPropertyValue(name).trim();
      if (!raw.includes('var(')) continue;
      const resolved = ctx.vars.resolve(raw);
      if (resolved === null) continue;
      const decl = shorthandOverride(name, role, colorLonghand, resolved, ctx.mapper);
      if (decl) decls.push(decl);
    }
  }
  let nestedCss = '';
  if (rule.cssRules && rule.cssRules.length > 0) nestedCss = rewriteRules(rule.cssRules, ctx, true);
  if (decls.length === 0 && !nestedCss) return '';
  ctx.rules += decls.length ? 1 : 0;
  const selector = nested ? rule.selectorText : augmentSelectors(rule.selectorText, ctx.suffix);
  return `${selector}{${decls.join(';')}${decls.length && nestedCss ? ';' : ''}${nestedCss}}`;
}

export function rewriteRules(rules: CSSRuleList, ctx: Ctx, nested = false): string {
  let out = '';
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i]!;
    const kind = rule.constructor.name;
    if (kind === 'CSSStyleRule') {
      out += rewriteStyleRule(rule as CSSStyleRule, ctx, nested);
    } else if (kind === 'CSSImportRule') {
      const imp = rule as CSSImportRule;
      try {
        const inner = imp.styleSheet ? rewriteRules(imp.styleSheet.cssRules, ctx, nested) : '';
        const media = imp.media.mediaText;
        out += inner && media && media !== 'all' ? `@media ${media}{${inner}}` : inner;
      } catch {
        /* cross-origin @import: cannot be read */
      }
    } else if ('cssRules' in rule) {
      const prelude = preludeOf(rule);
      if (!prelude || SKIP_AT.test(prelude.replace(/^@/, '').split(/[\s{]/)[0] ?? '')) continue;
      const inner = rewriteRules((rule as CSSGroupingRule).cssRules, ctx, nested);
      if (inner) out += `${prelude}{${inner}}`;
    }
  }
  return out;
}

/** Rewrite a whole sheet. Returns the override CSS plus the number of rules emitted. */
export function rewriteSheet(
  rules: CSSRuleList,
  mediaText: string,
  mapper: Mapper,
  vars: VarResolver,
  suffix = '',
): { css: string; rules: number } {
  const ctx: Ctx = { mapper, vars, suffix, rules: 0 };
  const body = rewriteRules(rules, ctx);
  const css = body && mediaText && mediaText !== 'all' ? `@media ${mediaText}{${body}}` : body;
  return { css, rules: ctx.rules };
}
