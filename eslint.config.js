import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage', 'api/index.js', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'warn',
    },
  },
  {
    // server-side logging is the structured-logging pipeline — console is the transport
    files: ['server.ts', 'server/**/*.ts', 'api-src/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    // client code: console statements are debug noise
    files: ['src/**/*.{ts,tsx}'],
    rules: { 'no-console': 'warn' },
  },
);
