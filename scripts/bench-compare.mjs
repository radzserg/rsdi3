// Compares a release candidate against the last released tag, so a release never ships a
// performance regression its author did not know about.
//
// Two cost models, measured differently on purpose:
//
//   - **Type cost** (`bench-types.mjs`) is deterministic. Instantiation counts are identical
//     across runs and machines, so any delta is real signal and needs no statistics.
//   - **Runtime cost** (`vitest bench`) is wall clock, and it is the weaker half. Run-to-run
//     variance on *byte-identical* code is routinely ±10%, and rebuilding between measurements
//     adds drift on top. This alternates the builds across rounds, reports each row's best
//     observation, and refuses to compare a row whose own repeats disagree.
//
//     **It resolves large effects only.** A 10x wiring win shows up unmistakably; a ~35% change
//     does not survive a busy machine, and has been observed reporting the wrong sign even with
//     the stability check passing. Treat a runtime row as a smoke alarm, and the deterministic
//     checks above as the actual gate.
//
// Both sides are measured with **this** commit's harness, overlaid onto the baseline checkout.
// Otherwise a change to a fixture would be indistinguishable from a change to the library, and
// an older tag usually has no benchmark files at all.
//
// Why not a git worktree: `bench-types.mjs` writes fixtures under `node_modules/.types-bench`
// and they import `../../src`. A worktree normally symlinks `node_modules` back to the primary
// checkout, so the fixture resolves to the *primary* `src/` and silently measures the wrong
// commit. Switching refs in place is slower but cannot lie.
import { execFileSync, execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, '..');
const tmpDir = join(repoRoot, 'node_modules', '.bench-compare');

// Everything the harness needs that is not the library itself. Overlaid onto the baseline so the
// two sides differ only in `src/`.
const HARNESS_PATHS = [
  'scripts/bench-types.mjs',
  'vitest.config.ts',
  'src/__tests__/__benchmarks__',
  'src/__tests__/__helpers__',
];

// A runtime row has to move more than this before it is worth mentioning. Set from the observed
// spread of repeated runs on unchanged code — below it, the number is the machine, not the code.
const RUNTIME_NOISE_PCT = 15;

// ...and a row whose own repeats disagree by more than this is not compared at all. A busy machine
// pushes short rows well past it, which is the answer being reported: "cannot tell from here",
// not a number. Raising the round count is the fix, or running it on a quiet machine.
const RUNTIME_INSTABILITY_RATIO = 1.3;

// Type cost is exact, so these filter trivia rather than noise: annotate anything that moved,
// but only call it a degradation once it is big enough to be worth someone's afternoon.
const TYPE_REPORT_PCT = 1;
const TYPE_REGRESSION_PCT = 5;

const sh = (cmd, opts = {}) =>
  execSync(cmd, { cwd: repoRoot, encoding: 'utf8', stdio: 'pipe', ...opts });

const git = (args) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();

/** Runs a command that is *expected* to sometimes fail, returning its output either way. */
const shSoft = (cmd) => {
  try {
    return { ok: true, out: sh(cmd) };
  } catch (error) {
    return { ok: false, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
};

const parseTypeBench = (output) => {
  const scenarios = new Map();
  for (const line of output.split('\n')) {
    const match = /^\s*([✓✗])\s+(\S+)\s+—\s+([\d,]+)\s*\/\s*([\d,]+)\s+instantiations/u.exec(line);
    if (match) {
      scenarios.set(match[2], {
        budget: Number(match[4].replaceAll(',', '')),
        instantiations: Number(match[3].replaceAll(',', '')),
        ok: match[1] === '✓',
      });
      continue;
    }

    // A scenario that broke inference reports no number at all.
    const failed = /^\s*✗\s+(\S+)\s+—/u.exec(line);
    if (failed && !scenarios.has(failed[1])) {
      scenarios.set(failed[1], { budget: null, instantiations: null, ok: false });
    }
  }

  return scenarios;
};

/**
 * The shipped library's executable output, with comments and blank lines stripped.
 *
 * `-maxdepth 1` on purpose: `tsc` also emits `dist/__tests__/**`, and folding that in makes any
 * test-only change look like a runtime change, which defeats the entire fast path. This matches
 * what `package.json#files` actually publishes.
 */
const runtimeShape = () => {
  const dist = join(repoRoot, 'dist');
  if (!existsSync(dist)) {
    return null;
  }

  return sh(`find ${dist} -maxdepth 1 -name '*.js' | sort | xargs cat`)
    .replaceAll(/\/\*[\S\s]*?\*\//gu, '')
    .replaceAll(/^\s*\/\/.*$/gmu, '')
    .replaceAll(/^\s*$\n/gmu, '');
};

const measureTypes = () => {
  const result = shSoft('node scripts/bench-types.mjs');
  return parseTypeBench(result.out);
};

const measureRuntime = (label, round) => {
  const outFile = join(tmpDir, `${label}-${round}.json`);
  const result = shSoft(`npx vitest bench --run --outputJson ${outFile}`);
  if (!existsSync(outFile)) {
    return { error: result.out.split('\n').slice(-6).join('\n'), rows: new Map() };
  }

  const rows = new Map();
  for (const file of JSON.parse(readFileSync(outFile, 'utf8')).files ?? []) {
    for (const group of file.groups ?? []) {
      for (const bench of group.benchmarks ?? []) {
        // p75, not mean: a GC pause inside one sample moves the mean by orders of magnitude and
        // leaves p75 untouched. Lower is better — these are milliseconds per iteration.
        rows.set(`${group.fullName} › ${bench.name}`, bench.p75);
      }
    }
  }

  return { error: null, rows };
};

/** Accumulates every observation per row, so the reporter can judge how stable the row was. */
const collect = (into, rows) => {
  for (const [name, value] of rows) {
    if (!into.has(name)) {
      into.set(name, []);
    }

    into.get(name).push(value);
  }

  return into;
};

/**
 * A row's best observation, and how far its worst was from it.
 *
 * The spread is the honest half. A row whose own repeats disagree cannot support a claim about the
 * difference *between* builds, and reporting one anyway is how this tool briefly insisted that
 * `clone a built container` was 36.8% faster: the baseline measured 0.0265 in one run and 0.0799
 * in the next — same commit — so the delta was decided by which pairing happened to come up. The
 * true figure is roughly 35% *slower*.
 */
const summarise = (values) => {
  const min = Math.min(...values);
  return { min, spread: Math.max(...values) / min };
};

/**
 * Copies the candidate's harness aside before any ref switch, so it can be laid over an older
 * checkout that may not contain those files at all.
 *
 * Deliberately plain file copies rather than `git checkout <ref> -- <path>`: that stages the
 * paths, and unstaging one that does not exist at the baseline leaves it untracked, which then
 * blocks the checkout back with "untracked working tree files would be overwritten". Owning the
 * copies outright means cleanup is `rm`, which cannot half-succeed.
 */
const snapshotHarness = () => {
  const snapshot = join(tmpDir, 'harness');
  for (const path of HARNESS_PATHS) {
    const source = join(repoRoot, path);
    if (existsSync(source)) {
      cpSync(source, join(snapshot, path), { force: true, recursive: true });
    }
  }
};

const applyHarness = () => {
  const snapshot = join(tmpDir, 'harness');
  for (const path of HARNESS_PATHS) {
    const source = join(snapshot, path);
    if (existsSync(source)) {
      cpSync(source, join(repoRoot, path), { force: true, recursive: true });
    }
  }
};

/**
 * Undoes the overlay at file granularity. Tracking it at *path* granularity is not enough: a
 * directory such as `src/__tests__/__helpers__` exists at the baseline while a file inside it
 * does not, so "the directory already existed" left the added file behind — untracked, which
 * then blocks the checkout back. `git clean` scoped to each path settles it per file.
 *
 * Safe because startup refuses to run on a dirty tree, so nothing under these paths can be the
 * user's own work.
 */
const removeHarness = () => {
  for (const path of HARNESS_PATHS) {
    shSoft(`git checkout --quiet -- ${path}`);
    shSoft(`git clean -qfd -- ${path}`);
  }
};

const pct = (from, to) => ((to - from) / from) * 100;

const fmtPct = (value) => `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;

const main = () => {
  // Two is the floor, not a default to tune down: one observation per side has no spread, so
  // the stability check silently passes everything and the numbers go back to being guesses.
  const rounds = Math.max(2, Number(process.env.BENCH_COMPARE_ROUNDS ?? 2));

  if (git(['status', '--porcelain'])) {
    console.error(
      'bench-compare: the working tree must be clean — this switches refs in place.\n' +
        'Commit or stash first; refusing rather than stashing on your behalf.',
    );
    process.exit(1);
  }

  const baseline = process.argv[2] ?? git(['describe', '--tags', '--abbrev=0']);
  // A branch name where there is one, so the restore puts the branch back rather than detaching.
  const candidate =
    shSoft('git symbolic-ref --quiet --short HEAD').out.trim() || git(['rev-parse', 'HEAD']);

  console.log(`bench-compare: ${baseline} (baseline) vs ${candidate} (candidate)\n`);

  rmSync(tmpDir, { force: true, recursive: true });
  mkdirSync(tmpDir, { recursive: true });

  const types = {};
  const runtime = { baseline: new Map(), candidate: new Map() };
  const shape = {};
  let comparable = true;

  snapshotHarness();

  try {
    // Round 0 is a probe: it establishes the type numbers and the compiled shape, and therefore
    // whether timing anything is worthwhile at all. Rounds 1..n are runtime only, alternating
    // sides so that drift in machine state lands on both rather than on whichever ran second.
    for (let round = 0; round <= rounds; round++) {
      for (const side of ['candidate', 'baseline']) {
        const ref = side === 'baseline' ? baseline : candidate;
        git(['checkout', '--quiet', ref]);
        if (side === 'baseline') {
          applyHarness();
        }

        sh('npx tsc');

        if (round === 0) {
          shape[side] = runtimeShape();
          types[side] = measureTypes();

          // Only worth timing if the executable output actually differs.
          if (side === 'baseline' && shape.candidate && shape.baseline === shape.candidate) {
            comparable = false;
          }
        }

        if (comparable && round > 0) {
          const measured = measureRuntime(side, round);
          if (measured.error && round === 1) {
            console.log(`  (runtime benchmark did not run at ${ref}: ${measured.error})\n`);
          }

          collect(runtime[side], measured.rows);
        }

        if (side === 'baseline') {
          removeHarness();
        }
      }

      if (!comparable) {
        break;
      }
    }
  } finally {
    // Order matters: the overlay has to go before the checkout, or git refuses to switch back
    // over untracked files it would overwrite. This ran on a real failure once already.
    removeHarness();
    shSoft(`git checkout --force --quiet ${candidate}`);
    shSoft('npx tsc');
  }

  const regressions = [];
  const unstable = [];

  console.log('Type cost — instantiations (deterministic, any delta is real)\n');
  const names = new Set([...types.candidate.keys(), ...types.baseline.keys()]);
  for (const name of [...names].sort()) {
    const base = types.baseline.get(name);
    const cand = types.candidate.get(name);

    if (!base) {
      console.log(
        `  ${name.padEnd(22)} new scenario — ${cand.instantiations?.toLocaleString() ?? 'FAILED'}`,
      );
      continue;
    }

    if (!cand) {
      console.log(`  ${name.padEnd(22)} removed`);
      continue;
    }

    // A scenario the baseline could not compile is the release fixing something, not a regression.
    if (!base.ok || !cand.ok) {
      const verdict = cand.ok ? 'FIXED (baseline broke inference)' : 'BROKEN on the candidate';
      console.log(`  ${name.padEnd(22)} ${verdict}`);
      if (!cand.ok) {
        regressions.push(`${name} breaks inference or exceeds its budget`);
      }

      continue;
    }

    const delta = pct(base.instantiations, cand.instantiations);
    const flag = Math.abs(delta) < TYPE_REPORT_PCT ? '' : delta > 0 ? '  ← worse' : '  ← better';
    console.log(
      `  ${name.padEnd(22)} ${base.instantiations.toLocaleString().padStart(9)} → ` +
        `${cand.instantiations.toLocaleString().padStart(9)}  ${fmtPct(delta).padStart(7)}` +
        `  (${Math.round((cand.instantiations / cand.budget) * 100)}% of budget)${flag}`,
    );

    if (delta > TYPE_REGRESSION_PCT) {
      regressions.push(`${name} costs ${fmtPct(delta)} more to type-check`);
    }
  }

  console.log('\nRuntime cost — p75 ms per iteration, best of alternating rounds\n');
  if (!comparable) {
    console.log(
      '  Compiled output is identical to the baseline once comments are stripped.\n' +
        '  Runtime cannot have changed; skipped rather than reporting noise as a result.',
    );
  } else if (runtime.baseline.size === 0) {
    console.log(
      '  No baseline measurement — the harness did not run at the baseline ref (see above).',
    );
  } else {
    for (const name of [...runtime.candidate.keys()].sort()) {
      const baseValues = runtime.baseline.get(name);
      const candValues = runtime.candidate.get(name);
      if (baseValues === undefined) {
        console.log(`  ${name}  new row`);
        continue;
      }

      const base = summarise(baseValues);
      const cand = summarise(candValues);
      const worstSpread = Math.max(base.spread, cand.spread);

      // Refuse to compare a row that cannot reproduce itself. Reporting a delta computed from
      // observations that disagree by more than the delta is how a benchmark lies with a
      // straight face — and this one did exactly that before the check existed.
      if (worstSpread > RUNTIME_INSTABILITY_RATIO) {
        console.log(
          `  ${name}\n      unstable — its own repeats span x${worstSpread.toFixed(1)}; not compared`,
        );
        unstable.push(name);
        continue;
      }

      const delta = pct(base.min, cand.min);
      const flag =
        Math.abs(delta) < RUNTIME_NOISE_PCT
          ? '  (within noise)'
          : delta > 0
            ? '  ← SLOWER'
            : '  ← faster';
      console.log(
        `  ${name}\n      ${base.min.toFixed(4)} → ${cand.min.toFixed(4)}  ${fmtPct(delta).padStart(7)}${flag}`,
      );

      if (delta > RUNTIME_NOISE_PCT) {
        regressions.push(
          `${name} is ${fmtPct(delta)} slower (above the ${RUNTIME_NOISE_PCT}% noise floor)`,
        );
      }
    }
  }

  console.log('');
  if (unstable.length > 0) {
    console.log(
      `bench-compare: ${unstable.length} runtime row(s) too unstable to compare on this machine.\n` +
        'Those rows are unjudged, not clean — re-run with BENCH_COMPARE_ROUNDS=4 on a quiet\n' +
        'machine if the release touches what they measure.\n',
    );
  }

  if (regressions.length === 0) {
    console.log(`bench-compare: no degradation against ${baseline}`);
    return;
  }

  console.log(`bench-compare: ${regressions.length} possible degradation(s) against ${baseline}\n`);
  for (const line of regressions) {
    console.log(`  - ${line}`);
  }

  console.log(
    '\nA runtime flag near the noise floor is worth re-running before believing — pass\n' +
      'BENCH_COMPARE_ROUNDS=4 for more rounds. A type-cost flag needs no second opinion.',
  );
  process.exitCode = 1;
};

main();
