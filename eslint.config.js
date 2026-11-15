import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

const ban = (patterns, message) => ({
  'no-restricted-imports': ['error', { patterns: [{ group: patterns, message }] }],
});

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'test-results', 'playwright-report', 'tests/e2e/pages/spa.js'] },
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'error' },
  },
  {
    files: ['src/**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'warn' },
  },
  // Module boundaries
  {
    files: ['src/engine/**'],
    rules: ban(
      ['**/popup/**', '**/options/**', '**/background/**', '**/content/**', '**/storage/**', 'react', 'react-dom/**'],
      'engine/ may only depend on shared/ and themes/ (no UI, no chrome adapters).',
    ),
  },
  {
    files: ['src/content/**'],
    rules: ban(['**/popup/**', '**/options/**', '**/background/**', 'react', 'react-dom/**'], 'content/ must not depend on UI or background.'),
  },
  {
    files: ['src/background/**'],
    rules: ban(['**/popup/**', '**/options/**', '**/content/**', '**/engine/**', 'react', 'react-dom/**'], 'background/ must stay light: no DOM engine, no UI.'),
  },
  {
    files: ['src/shared/**', 'src/storage/**', 'src/themes/**'],
    rules: ban(['**/popup/**', '**/options/**', '**/background/**', '**/content/**', '**/engine/**'], 'Foundation modules must not depend on feature layers.'),
  },
);
