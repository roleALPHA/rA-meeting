import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const HEX = 'Literal[value=/#[0-9a-fA-F]{3}([0-9a-fA-F]{3}([0-9a-fA-F]{2})?)?\\b/]';
const HEX_MESSAGE =
  'No raw hex colours in UI code. Colours come from the CSS tokens in client/style.css; brand values live only in client/brand.css.';
const GERMAN_MESSAGE =
  "User-facing text belongs in shared/locales as a message ID, not in a component. Use t('area.name').";

export default tseslint.config(
  {
    // spfx/ has its own toolchain and ESLint configuration.
    ignores: ['spfx/**', 'dist/**', 'work/**', 'coverage/**', 'data/**', '.npm-cache/**', '**/node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['client/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // tsc cannot see these: the types are right, but a dependency dropped from the list freezes a closure and
      // the effect reads a stale value.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    // One rule entry for both guardrails: in flat config a later block replaces a rule's options instead of
    // merging them.
    files: ['client/**/*.tsx'],
    ignores: ['client/preview.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: HEX, message: HEX_MESSAGE },
        { selector: 'TemplateElement[value.raw=/#[0-9a-fA-F]{6}\\b/]', message: HEX_MESSAGE },
        { selector: 'Literal[value=/[äöüÄÖÜß]/]', message: GERMAN_MESSAGE },
        { selector: 'TemplateElement[value.raw=/[äöüÄÖÜß]/]', message: GERMAN_MESSAGE },
        { selector: 'JSXText[value=/[äöüÄÖÜß]/]', message: GERMAN_MESSAGE },
      ],
    },
  },
  {
    // History entries written by the browser runtime are stored content, which is not translated, so the German
    // guardrail covers components only. Colours are banned everywhere in client code.
    files: ['client/**/*.ts'],
    rules: { 'no-restricted-syntax': ['error', { selector: HEX, message: HEX_MESSAGE }] },
  },
  {
    // The local preview banner is a developer notice that never ships (the build rejects client/preview.tsx),
    // so it may be German. It uses system colours, not hex values.
    files: ['client/preview.tsx'],
    rules: { 'no-restricted-syntax': ['error', { selector: HEX, message: HEX_MESSAGE }] },
  },
  prettier,
);
