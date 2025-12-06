import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: [
      'dist/*',
      'node_modules/*',
      'package.json',
      'pnpm-lock.yaml',
      'eslint.config.ts',
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
);
