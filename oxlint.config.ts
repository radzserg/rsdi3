import { defineConfig } from 'oxlint';
import { config } from 'oxlint-config-canonical';

export default defineConfig({
  categories: {},
  env: {
    builtin: true,
  },
  extends: [config],
  globals: {},
  ignorePatterns: ['**/*.d.ts', '**/node_modules/**', '**/dist/**'],
  overrides: [
    {
      files: ['**/*.ts'],
      rules: {
        'typescript/no-floating-promises': 'error',
        'typescript/return-await': [2, 'always'],
      },
    },
    {
      files: ['**/*.ts'],
      plugins: ['jsdoc'],
      rules: {
        complexity: 'off',
        'func-style': 'off',
        'id-length': 'off',
        'jsdoc/check-property-names': 'off',
        'jsdoc/require-property-description': 'off',
        'no-array-reduce': 'off',
        'no-bitwise': 'off',
        'no-console': 'off',
        'no-explicit-any': 'off',
        'no-non-null-assertion': 'off',
        'no-useless-concat': 'off',
        'prefer-object-spread': 'off',
      },
    },
    {
      files: ['**/*.test.ts', '**/*.test-d.ts', '**/__tests__/**/*.ts'],
      plugins: ['node'],
      rules: {
        'no-non-null-assertion': 'off',
        'no-unsafe-optional-chaining': 'off',
        'node/no-process-env': 'off',
      },
    },
  ],
  plugins: undefined,
  rules: {},
});
