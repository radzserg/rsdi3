import { defineConfig } from 'vitest/config';

// `tsc` compiles the tests and benchmarks along with the sources, so every file under `src/` has a
// compiled twin under `dist/`. Vitest 4 dropped `**/dist/**` from its default excludes, which left
// each suite running twice — the second time against whatever the last build emitted. That is
// harmless when the two agree and quietly misleading when they do not: benchmark runs reported two
// sets of numbers for the same name, and a stale `dist/` could pass a suite the sources fail.
const EXCLUDE = ['**/node_modules/**', '**/dist/**'];

export default defineConfig({
  test: {
    benchmark: {
      exclude: EXCLUDE,
    },
    exclude: EXCLUDE,
    typecheck: {
      exclude: EXCLUDE,
    },
  },
});
