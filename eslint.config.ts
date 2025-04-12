import auto from 'eslint-config-canonical/auto';
import tseslint, { ConfigArray } from 'typescript-eslint';

const config: ConfigArray = tseslint.config({
    ignores: [
      'dist/*',
      'node_modules/*',
      'package.json',
      'pnpm-lock.yaml',
      'eslint.config.ts'
    ],
  },
  auto
);

export default config;
