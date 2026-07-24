// Guards the type-level cost of building a container, and the inference that
// makes that cost worth paying.
//
// Why this exists: the whole value of this package is per-key inference, and the
// machinery that produces it is quadratic by construction — each `add` re-embeds
// the growing resolver map, so a chain of N dependencies costs O(N²) to check.
// That makes it easy to add a small-looking type and multiply everyone's build
// time, with nothing in the normal test run to notice. `docs/type-performance-plan.md`
// has the measurements.
//
// It also guards two failure modes that are *silent* — they produce no error at
// the size the type tests use, and only degrade once a real app hits them:
//
//   - A recursive tuple fold in `MergedResolvers` (instead of the current
//     union-to-intersection fold) trips TS2589 at ~50 composed containers and
//     collapses inference to `never`.
//   - A `Simplify`-style flatten on the accumulator does the same at ~50 chained
//     `add` calls.
//
// Both look fine with three dependencies. The `compose-scale` scenario below uses
// enough containers to reach them.
//
// Every fixture asserts exact types as well as staying under a budget: a change
// that degraded inference to `any` would be *faster*, so a budget alone would wave
// it through. Any `tsc` diagnostic fails the scenario.
//
// Budgets are compiler-specific. When TypeScript is upgraded the numbers move and
// the budgets need re-baselining — run this script, read the reported actuals, and
// update BUDGETS in the same commit as the upgrade.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, '..');
// Fixtures live under node_modules so they are ignored by git and can import
// ../../src with a relative specifier.
const workDir = join(repoRoot, 'node_modules', '.types-bench');
const tsc = join(repoRoot, 'node_modules', '.bin', 'tsc');

// Instantiation ceilings, ~25% above the measured value on TypeScript 7.0.2.
// The headroom absorbs patch-level compiler noise; a real regression is far larger.
const BUDGETS = {
  'chain-200': 330_000,
  'compose-400': 130_000,
  'compose-scale': 45_000,
};

const EXACT = `type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;\n`;

/** A flat chain — the shape that costs O(N²). Guards the per-`add` constant factor. */
const chainFixture = (n) => {
  let s = `import { DIContainer } from '../../src/DIContainer.js';\n${EXACT}\n`;
  s += `const c0 = new DIContainer().add('k0', () => ({ v: 0 }));\n`;
  s += `const c1 = c0.add('k1', () => ({ v: 1 }));\n`;
  for (let i = 2; i < n; i++) {
    s +=
      `const c${i} = c${i - 1}.add('k${i}', ({ k${i - 1}, k${i - 2} }) => ` +
      `({ v: k${i - 1}.v + k${i - 2}.v }));\n`;
  }
  s += `const container = c${n - 1};\n`;
  s += `export const exactValue: Exact<typeof container.k${n - 1}, { v: number }> = true;\n`;
  s += `export const exactGet: Exact<ReturnType<typeof container.get<'k0'>>, { v: number }> = true;\n`;
  return s;
};

/** The recommended layout: independent modules combined with `compose`. */
const composeFixture = (n, m) => {
  let s = `import { DIContainer } from '../../src/DIContainer.js';\n${EXACT}\n`;
  const size = n / m;
  for (let mod = 0; mod < m; mod++) {
    s += `const mod${mod} = new DIContainer()\n`;
    for (let j = 0; j < size; j++) {
      const g = mod * size + j;
      s += `  .add('k${g}', () => ({ v: ${g} }))\n`;
    }
    s += `;\n`;
  }
  const args = Array.from({ length: m }, (_, i) => `mod${i}`).join(', ');
  s += `const container = DIContainer.compose(${args});\n`;
  s += `export const exactFirst: Exact<typeof container.k0, { v: number }> = true;\n`;
  s += `export const exactLast: Exact<typeof container.k${n - 1}, { v: number }> = true;\n`;
  return s;
};

/**
 * Enough composed containers to reach the depth limiter, with mixed value types so
 * a fold that degrades to `never` cannot satisfy the assertions.
 */
const composeScaleFixture = (m) => {
  let s = `import { DIContainer } from '../../src/DIContainer.js';\n${EXACT}\n`;
  for (let mod = 0; mod < m; mod++) {
    s +=
      `const mod${mod} = new DIContainer()` +
      `.add('num${mod}', () => ${mod}).add('str${mod}', () => 'v${mod}');\n`;
  }
  const args = Array.from({ length: m }, (_, i) => `mod${i}`).join(', ');
  s += `const container = DIContainer.compose(${args});\n`;
  // Sample across the range: a fold that gives up part-way still fails here.
  for (const mod of [0, Math.floor(m / 2), m - 1]) {
    s += `export const exactNum${mod}: Exact<typeof container.num${mod}, number> = true;\n`;
    s += `export const exactStr${mod}: Exact<typeof container.str${mod}, string> = true;\n`;
  }
  // Still chainable, and prior dependencies stay visible to factories.
  s += `const extended = container.add('joined', ({ num0, str0 }) => \`\${num0}\${str0}\`);\n`;
  s += `export const exactJoined: Exact<typeof extended.joined, string> = true;\n`;
  return s;
};

const SCENARIOS = [
  { build: () => chainFixture(200), name: 'chain-200', what: 'flat chain of 200 add() calls' },
  {
    build: () => composeFixture(400, 20),
    name: 'compose-400',
    what: '400 dependencies as 20 composed modules',
  },
  {
    build: () => composeScaleFixture(60),
    name: 'compose-scale',
    what: '60 composed containers (depth-limiter guard)',
  },
];

const measure = (name, source) => {
  const file = join(workDir, `${name}.ts`);
  writeFileSync(file, source);

  let output;
  try {
    output = execFileSync(
      tsc,
      [
        '--noEmit',
        '--ignoreConfig',
        '--extendedDiagnostics',
        '--strict',
        '--skipLibCheck',
        '--target',
        'es2022',
        '--lib',
        'es2022',
        '--module',
        'nodenext',
        '--moduleResolution',
        'nodenext',
        file,
      ],
      { cwd: repoRoot, encoding: 'utf8' },
    );
  } catch (error) {
    // A non-zero exit means diagnostics; keep the output so they can be reported.
    output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
  }

  const instantiations = Number(/^Instantiations:\s*(\d+)$/m.exec(output)?.[1] ?? Number.NaN);
  const diagnostics = output
    .split('\n')
    .filter((line) => /error TS\d+/.test(line))
    .map((line) => line.trim());

  return { diagnostics, instantiations };
};

rmSync(workDir, { force: true, recursive: true });
mkdirSync(workDir, { recursive: true });

let failed = false;
console.log(
  `types-bench: TypeScript ${execFileSync(tsc, ['--version'], { encoding: 'utf8' }).trim()}\n`,
);

for (const scenario of SCENARIOS) {
  const budget = BUDGETS[scenario.name];
  const { diagnostics, instantiations } = measure(scenario.name, scenario.build());

  if (diagnostics.length > 0) {
    failed = true;
    console.error(`✗ ${scenario.name} — ${scenario.what}`);
    console.error(`  inference broke: ${diagnostics.length} diagnostic(s)`);
    for (const diagnostic of diagnostics.slice(0, 5)) {
      console.error(`    ${diagnostic}`);
    }

    console.error(
      `  A TS2589 here means a type in src/types.ts started recursing per dependency;\n` +
        `  a failed Exact<> assertion means inference degraded. See docs/type-performance-plan.md.\n`,
    );
    continue;
  }

  if (!Number.isFinite(instantiations)) {
    failed = true;
    console.error(`✗ ${scenario.name} — could not read "Instantiations:" from tsc output\n`);
    continue;
  }

  const percent = Math.round((instantiations / budget) * 100);
  if (instantiations > budget) {
    failed = true;
    console.error(`✗ ${scenario.name} — ${scenario.what}`);
    console.error(
      `  ${instantiations.toLocaleString()} instantiations exceeds the ${budget.toLocaleString()} budget (${percent}%).\n` +
        `  Something made the container types more expensive per dependency. If the increase\n` +
        `  is understood and intended, raise the budget in scripts/bench-types.mjs and say why.\n`,
    );
  } else {
    console.log(
      `✓ ${scenario.name} — ${instantiations.toLocaleString()} / ${budget.toLocaleString()} instantiations (${percent}% of budget)`,
    );
    console.log(`    ${scenario.what}`);
  }
}

rmSync(workDir, { force: true, recursive: true });

if (failed) {
  console.error('\ntypes-bench: FAILED');
  process.exit(1);
}

console.log('\ntypes-bench: OK');
