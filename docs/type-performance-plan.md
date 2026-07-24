# RSDI type-performance plan

> **Audience:** AI agents and maintainers continuing work on the "heavy types" pain point.
> **Context:** In large projects (hundreds–thousands of dependencies) the container's
> types get expensive to check and, past a threshold, crash `tsc` outright. This doc
> captures the root-cause analysis, the measured evidence, what does **not** help, and
> the ranked improvement plan with status.

All numbers below were measured with the repo's own **TypeScript 6.0.3** under `strict`,
via `tsc --extendedDiagnostics`. **Instantiation counts are deterministic** and are the
reliable metric; wall-clock check-time is single-run noise (±0.15s) — treat it as indicative only.

---

## TL;DR

- Each `.add()` returns `IDIContainer<CR & { [n in N]: … }>`. The container type **is** the
  full dependency map, re-embedded at every link. Type-checking link *k* is **O(k)**, so a
  chain of N adds is **O(N²)**. This is inherent to any fluent builder that exposes exact
  per-key types — not a bug in the type code.
- **Two cliffs:** (1) O(N²) makes big projects slow to check; (2) a **single fluent
  `.add().add()…` expression of ~500–600 links crashes `tsc`** with
  `RangeError: Maximum call stack size exceeded` — this is **AST depth**, independent of
  the type design (even a minimal container type crashes at the same length).
- **The real fix for "thousands" is composition** (split into modules, `merge`/`extend`):
  it turns O(N²) into ~O(N²/m + N) and keeps every chain short. Everything else is
  constant-factor cleanup or guardrails.

---

## Status of the plan

| # | Item | Impact | Risk | Status |
|---|------|--------|------|--------|
| 1 | Make modular composition first-class (`compose`/`register` helper + docs) | **High** (the scalability answer) | Low–Med | ⬜ Not started |
| 2 | Guardrail the single-chain crash (array-based API + docs) | Med (prevents hard failure) | Low | ⬜ Not started |
| 3 | Constant-factor type cleanups (`add`/`update` signatures) | Low–Med | Low | ✅ **Done** |
| 4 | Escape hatch for consumers (seal container behind a named type) | Med (downstream files) | Low | ⬜ Not started |
| 5 | CI perf regression gate (benchmark harness) | Med (prevents regressions) | Low | ⬜ Not started |

---

## Root cause

`IDIContainer<CR> = CR & { add; get; update; merge; extend; clone; has; … }`, and
`add` returns `IDIContainer<CR & { [n in N]: V }>`. To type-check link *k* against a
*k*-key map, TypeScript must:

1. resolve `.add` on a *k*-constituent intersection (`CR & { …methods }`);
2. compute `keyof CR` for the `DenyInputKeys` duplicate-name guard;
3. relate the factory to `(resolvers: CR) => V` and resolve any destructured deps
   (`({ a, b }) =>`) against the *k*-key map;
4. build the next `CR & { new }` and re-instantiate the **recursive** `IDIContainer` alias.

Each is **O(k)** ⇒ whole chain **O(N²)**.

The ~500–600-link **crash** is a separate mechanism: one `.add().add()…` mega-expression
is a 500+-deep syntax tree, and `tsc`'s parent-node walkers (e.g. `getAssignmentDeclarationKind`)
overflow the JS call stack. Splitting the identical adds into separate statements removes
the crash (but stays O(N²)).

---

## Measured evidence

Faithfulness check: an inlined model of `types.ts` reproduced the **real** `src/DIContainer.ts`
cost to within ~1.5% (266,569 vs 262,853 instantiations at N=200), so the model-based
ablations below are trustworthy.

### Single fluent chain scales quadratically, then crashes

| Scenario (TS 6.0.3, strict) | Instantiations | Check time | Result |
|---|---:|---:|---|
| chain N=100 | 71K | 0.20s | ok |
| chain N=200 (real `src/`) | 266K | 0.81s | ok |
| chain N=400 | 674K–1.02M | 3.9–4.2s | slow |
| **chain N≈600** | — | — | **`RangeError: Maximum call stack size exceeded`** |

Crash threshold is between **500 (ok)** and **600 (crash)** links. Confirmed design-independent
(a bare minimal container type crashes at 600 too). Same 800 adds as **separate statements**
do **not** crash (they compile in ~30s / ~3.9M instantiations).

### Composition breaks the quadratic (N=400, current types)

| Layout | Instantiations | Check time |
|---|---:|---:|
| 1 × 400 (one chain) | 674K | 3.85s |
| 4 × 100 | 196K | 0.52s |
| 8 × 50 | 117K | 0.31s |
| **20 × 20** | **74K** | **0.28s** |

≈9× fewer instantiations, ≈14× faster — **and** every module chain stays short (fast editor
feedback, no crash risk).

### Cost decomposition (per-`add`, N=400, no-deref)

| Variant | Instantiations | vs full |
|---|---:|---:|
| full `add` (guard + `Factory<CR>` constraint) | 674K | — |
| drop `keyof` duplicate-guard | 496K | −26% |
| drop `Factory<CR>` constraint | 350K | −48% |
| drop both ("bare") | 172K | −75% (still O(N²)) |

Even the bare minimum is quadratic. The two removable hotspots (`keyof` guard, `Factory`
constraint) only pay off when factories **don't** read their deps; real factories destructure
`CR`, so that cost is unavoidable.

---

## What does NOT help (ruled out — don't re-attempt)

- **Naive `Simplify`/`Prettify` flatten** on the accumulator (`{ [K in keyof T]: T[K] }`):
  trips TS's depth limiter (**TS2589**) at ~50 links and silently collapses inference to
  `never`. Actively harmful.
- **Removing methods** (`get/update/merge/extend/clone/has`) or the **`CR &` property-access
  sugar**: ≈0% change. They're only instantiated on the final type, not per step. The cost
  is `add` alone.
- **Dropping `ReturnType<R>` for an inferred `V`** (item 3): only ~1% once factories read
  their deps. Worth doing for simplicity, not for speed.

---

## The plan

### 1. Make modular composition first-class — *the actual fix for "thousands"* ⬜

Splitting N deps into *m* modules and combining cuts build cost ~*m*× (O(N²)→O(N²/m + N))
and keeps each chain short. `merge`/`extend` already exist; the work is ergonomics + docs:

- Add a composition helper so users never write one giant chain — e.g.
  `DIContainer.compose(moduleA, moduleB, …)` or `container.register(fnA, fnB, …)` folding
  `extend`. A **rest/array-argument** form is important: it also sidesteps the AST-depth crash.
- Prominent README/docs guidance: "for large graphs, split into feature modules and
  `merge`/`extend`."
- Verify the helper's own type cost stays ~linear in module count (the 20×20 data suggests it does).

### 2. Guardrail the single-chain crash ⬜

Even after everything else, ~500+ links in one expression stack-overflow `tsc`. Document a
soft cap ("keep any single `.add()` chain to a few hundred; beyond that, compose") and prefer
the array-based `register([...])` API from item 1, which avoids the giant-expression AST entirely.

### 3. Constant-factor type cleanups ✅ **Done**

Replaced `add`/`update`'s `<N, R extends Factory<CR>> … ReturnType<R>` with
`<N, V>(resolver: Factory<CR, V>) … { [n in N]: V }`, and gave `Factory` an optional
return-type param (`Factory<CR, Value = ResolvedDependencyValue>`, backward-compatible). Also
dropped the redundant `& this` from the `add`/`update` return casts (internal-cast cleanup;
declared return type unchanged). Two fewer moving parts per call site; one generic instead of two.

- **Verified:** exact inference preserved (literal widening `() => 123` → `number`, `update`
  override, factories reading prior deps, duplicate-name / unknown-dep still error).
- Full gate green: `pnpm build`, `pnpm test` (42 tests + type tests), `npx eslint`.
- Measured: N=200 deref 266,569 → 263,808 (−1%); no-deref ~177K → 140,255 (−20%).

### 4. Escape hatch for downstream consumers ⬜

Document sealing the built container behind a single named type —
`export type AppContainer = ReturnType<typeof buildContainer>` — so files that *consume* the
container reference one materialized type instead of re-deriving the whole builder chain.
Optionally offer an opt-in loose/index-signature mode for extreme scale.

### 5. CI perf regression gate ⬜

Add a types-perf benchmark to CI (see appendix): generate an N-chain and assert
instantiations/check-time under a threshold via `tsc --extendedDiagnostics`, alongside the
existing `--typecheck` tests, so no future change silently reintroduces the blow-up.

---

## Appendix — reproducing the benchmark

The harness used for this analysis is straightforward to regenerate (kept out of the repo to
avoid shipping scratch tooling; item 5 would formalize it).

**Generator** — emit an N-length chain that imports the real container and destructures prior deps:

```js
// gen.mjs <N>
import { writeFileSync } from 'node:fs';
const n = Number(process.argv[2]);
let s = `import { DIContainer } from '../../src/DIContainer.js';\n`;
s += `const c0 = new DIContainer().add('k0', () => ({ v: 0 }));\n`;
s += `const c1 = c0.add('k1', () => ({ v: 1 }));\n`;
for (let i = 2; i < n; i++)
  s += `const c${i} = c${i - 1}.add('k${i}', ({ k${i - 1}, k${i - 2} }) => ({ v: k${i - 1}.v + k${i - 2}.v }));\n`;
writeFileSync(`chain_${n}.ts`, s);
```

Use **per-statement** form (as above) to measure type cost without the AST-depth crash;
use one `.add().add()…` expression to reproduce the crash.

**Measure** (note TS 6 needs `--ignoreConfig` when a tsconfig is present and files are passed):

```bash
tsc --noEmit --ignoreConfig --extendedDiagnostics --strict --skipLibCheck \
  --module nodenext --moduleResolution nodenext chain_200.ts
# read "Instantiations:" (deterministic) and "Check time:" (noisy)
```

Ablation knobs used above: with/without factory dep destructuring ("deref"/"noderef");
with/without the `keyof` duplicate-guard; with/without the `Factory<CR>` constraint; and
composition layouts (m modules of N/m combined via `merge`).
