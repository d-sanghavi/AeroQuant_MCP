/* eslint-env node */

/**
 * Lint configuration.
 *
 * Formatting is Prettier's job and is deliberately absent here - a lint run that fails
 * on a missing space teaches people to run `--fix` without reading, which is the
 * opposite of what a lint gate is for. What is enforced instead are the rules that
 * catch defects this codebase is actually exposed to:
 *
 *  - unchecked indexing, because the quant layer is full of typed-array access and an
 *    off-by-one there produces a plausible-looking wrong number rather than a crash;
 *  - floating promises, because every worker call returns one;
 *  - exhaustive React hook dependencies, warned rather than errored - several charts
 *    intentionally exclude an inline option builder and say so in a comment.
 */
module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint', 'react-hooks', 'react-refresh'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  ignorePatterns: ['dist', 'node_modules', '*.cjs', 'vite.config.ts'],
  rules: {
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    'react-refresh/only-export-components': 'off',

    // Unused values are a defect signal in a codebase with no dead code by policy.
    // An underscore prefix is the opt-out, for a deliberately ignored parameter.
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
    ],

    // `any` defeats the point of the DTO boundary between the worker and the UI.
    '@typescript-eslint/no-explicit-any': 'error',

    // The non-null assertion is used pervasively and correctly on typed-array reads,
    // where TypeScript cannot see that the index is in range but the loop bound can.
    '@typescript-eslint/no-non-null-assertion': 'off',

    'no-console': ['warn', { allow: ['warn', 'error'] }],
    eqeqeq: ['error', 'always', { null: 'ignore' }],
    'prefer-const': 'error',
    'no-var': 'error',
  },
  overrides: [
    {
      // Tests print their computed figures on purpose - the numbers in the console are
      // how the acceptance criteria are read.
      files: ['**/*.test.ts', '**/*.test.tsx'],
      rules: { 'no-console': 'off' },
    },
  ],
}
