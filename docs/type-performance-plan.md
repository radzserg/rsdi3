# RSDI type-performance plan

> **Audience:** AI agents and maintainers continuing work on the "heavy types" pain point.
> **Context:** In large projects (hundreds–thousands of dependencies) the container's
> types get expensive to check. This doc captures the root-cause analysis, the measured
> evidence, what does **not** help, and the ranked improvement plan with status.

Numbers are measured under `strict` via `tsc --extendedDiagnostics`. **Instantiation counts
are deterministic** and are the reliable metric; wall-clock check-time is single-run noise —
treat it as indicative only.

The repo moved from **TypeScript 6.0.3** to **TypeScript 7.0.2** (the native Go compiler)
partway through this work. Everything below was **re-measured on TS 7**; where TS 7 changed
a conclusion it is called out explicitly. Re-validate after any future compiler bump —
one finding (the crash) did not survive the last one.

---

## TL;DR

- Each `.add()` returns `IDIContainer<CR & { [n in N]: … }>`. The container type **is** the
  full dependency map, re-embedded at every link. Type-checking link _k_ is **O(k)**, so a
  chain of N adds is **O(N²)**. This is inherent to any fluent builder that exposes exact
  per-key types — not a bug in the type code. **Still true on TS 7.**
- **The fix for "thousands" is composition** (build modules independently, then combine):
  it turns O(N²) into ~O(N²/m + N) and keeps every chain short. At 1600 dependencies this is
  **~22× fewer instantiations and ~100× faster** (90.2 s → 0.9 s). Shipped as
  `DIContainer.compose()` + variadic `merge()`.
- **Fixed on TS 7:** under TS 6, one fluent `.add().add()…` expression of ~500–600 links
  crashed `tsc` with `RangeError: Maximum call stack size exceeded` (AST depth, not types).
  The Go compiler handles 1200+ links without crashing — just slowly. Item 2 is therefore
  moot for TS 7 consumers and remains relevant only for anyone still on TS 6.

---

## Status of the plan

| #   | Item                                                                       | Impact                            | Risk    | Status                                               |
| --- | -------------------------------------------------------------------------- | --------------------------------- | ------- | ---------------------------------------------------- |
| 1   | Make modular composition first-class (`compose` + variadic `merge` + docs) | **High** (the scalability answer) | Low–Med | ✅ **Done**                                          |
| 2   | Guardrail the single-chain crash                                           | —                                 | —       | ➖ **Obsolete on TS 7** (no crash); item 1 covers it |
| 3   | Constant-factor type cleanups (`add`/`update` signatures)                  | Low–Med                           | Low     | ✅ **Done**                                          |
| 4   | Escape hatch for consumers (seal container behind a named type)            | Low (readability only)            | Low     | ✅ **Done** (premise disproved; shipped as DX only)  |
| 5   | CI perf regression gate (benchmark harness)                                | Med (prevents regressions)        | Low     | ✅ **Done** (`pnpm bench:types`, CI `types-perf`)    |

---

## Root cause

`IDIContainer<CR> = CR & { add; get; update; merge; extend; clone; has; … }`, and
`add` returns `IDIContainer<CR & { [n in N]: V }>`. To type-check link _k_ against a
_k_-key map, TypeScript must:

1. resolve `.add` on a _k_-constituent intersection (`CR & { …methods }`);
2. compute `keyof CR` for the `DenyInputKeys` duplicate-name guard;
3. relate the factory to `(resolvers: CR) => V` and resolve any destructured deps
   (`({ a, b }) =>`) against the _k_-key map;
4. build the next `CR & { new }` and re-instantiate the **recursive** `IDIContainer` alias.

Each is **O(k)** ⇒ whole chain **O(N²)**.

**The TS 6 crash (historical).** One `.add().add()…` mega-expression is a 500+-deep syntax
tree, and TS 6's parent-node walkers (e.g. `getAssignmentDeclarationKind`) overflowed the JS
call stack at ~500–600 links; splitting the adds into separate statements removed it. TS 7's
Go compiler does not have this limit (verified to 1200 links), so this no longer gates anyone
on a current toolchain.

---

## Measured evidence

Faithfulness check: an inlined model of `types.ts` reproduced the **real** `src/DIContainer.ts`
cost to within ~1.5% (266,569 vs 262,853 instantiations at N=200), so the model-based
ablations below are trustworthy.

### Single fluent chain scales quadratically (TS 7, real `src/`, factories reading deps)

| Scenario | Instantiations | Check time |
| -------- | -------------: | ---------: |
| N=100    |            74K |      0.06s |
| N=200    |           264K |      0.26s |
| N=400    |          1.00M |      1.63s |
| N=800    |          3.92M |      11.9s |

Instantiations quadruple per doubling — textbook O(N²). No crash at any length on TS 7
(a single 1200-link expression compiles in ~37s).

### Composition breaks the quadratic (TS 7, real `DIContainer.compose`)

| Layout                        | Instantiations | Check time |
| ----------------------------- | -------------: | ---------: |
| 1 chain of 400                |           519K |      1.50s |
| 20 modules × 20 → compose     |            97K |      0.09s |
| 1 chain of 800                |          1.99M |      11.5s |
| 40 modules × 20 → compose     |           185K |      0.26s |
| **1 chain of 1600**           |  **7,815,223** |  **90.2s** |
| **80 modules × 20 → compose** |    **361,552** |   **0.9s** |

At 1600 dependencies that is **~22× fewer instantiations and ~100× faster**. The win grows
with N, because the flat chain is quadratic and the composed layout is not.

Module _size_ matters more than module count: 20–40 dependencies per module is the sweet
spot, and past that the returns flatten (m=40 vs m=80 at N=1600 differ by <25%).

### The `extend` pattern scales too (and keeps cross-module types)

Module functions with an explicitly declared requirement, folded with `.extend()`:
N=800 as 20 modules costs **187K / 0.19s** — same order as `compose`, versus 1.99M / 11.5s
for the flat chain. Use `extend` when a module needs a previous module's types while it is
being written; use `compose` for independently built modules.

### Cost decomposition (per-`add`, N=400, no-deref)

| Variant                                       | Instantiations |            vs full |
| --------------------------------------------- | -------------: | -----------------: |
| full `add` (guard + `Factory<CR>` constraint) |           674K |                  — |
| drop `keyof` duplicate-guard                  |           496K |               −26% |
| drop `Factory<CR>` constraint                 |           350K |               −48% |
| drop both ("bare")                            |           172K | −75% (still O(N²)) |

Even the bare minimum is quadratic. The two removable hotspots (`keyof` guard, `Factory`
constraint) only pay off when factories **don't** read their deps; real factories destructure
`CR`, so that cost is unavoidable.

---

## What does NOT help (ruled out — don't re-attempt)

- **Naive `Simplify`/`Prettify` flatten** on the accumulator (`{ [K in keyof T]: T[K] }`):
  trips TS's depth limiter (**TS2589**) at ~50 links and silently collapses inference to
  `never`. Actively harmful.
- **A recursive tuple fold for combining containers**
  (`T extends [infer H, ...infer R] ? ResolversOf<H> & Fold<R> : {}`): same failure — **TS2589
  at ~50 containers**, inference degrades silently. This is why `MergedResolvers` uses a
  union-to-intersection fold instead, which gets _cheaper_ as the container count grows
  (163K → 114K instantiations going from 50 to 200 containers).
- **Removing methods** (`get/update/merge/extend/clone/has`) or the **`CR &` property-access
  sugar**: ≈0% change. They're only instantiated on the final type, not per step. The cost
  is `add` alone.
- **Dropping `ReturnType<R>` for an inferred `V`** (item 3): only ~1% once factories read
  their deps. Worth doing for simplicity, not for speed.
- **Sealing/flattening the container type for consumer files** (item 4): consumers are already
  cheap (~2.6K instantiations per file, cached per program), and sealing costs ~3% _more_.
  Useful for readable error messages only — never as a performance fix.

---

## The plan

### 1. Make modular composition first-class — _the actual fix for "thousands"_ ✅ **Done**

Shipped two additions, both driven by the same type helper:

- **`DIContainer.compose(...containers)`** — a **static** method that combines independently
  built containers into a **new** container (inputs untouched). This is the documented way to
  wire a large graph.
- **Variadic `merge(...containers)`** — the existing instance method now takes any number of
  containers, so `base.merge(repos, services, controllers)` replaces a chain of merges.
  Backward compatible: single-argument calls infer exactly as before.

Type machinery in `types.ts`: `ContainerLike`, `ResolversOf`, `UnionToIntersection`, and
`MergedResolvers` (union-to-intersection, **not** a recursive fold — see the ruled-out list).
`ResolversOf` checks the `DIContainer` class branch **before** the `IDIContainer` branch,
because a class instance also structurally matches `IDIContainer`; without that ordering a raw
`new DIContainer()` passed to `compose` silently contributes `never`.

`compose` is **static**, so it needs no entry in the `containerMethods` guard set — that set
only protects instance members from being shadowed by dependency names.

- **Verified:** exact inference on composed containers, composed containers stay chainable,
  zero-argument and single-argument `compose`, raw `DIContainer` instances accepted, modules
  that declare their requirements (`new DIContainer<{ bar: Bar }>()`) compose correctly.
  Runtime: laziness/caching preserved, resolved values carried over, inputs not mutated,
  cross-module dependencies resolve, last-writer-wins on duplicate names.
- Full gate green: `pnpm build`, `pnpm test` (59 tests + type tests), `pnpm lint`.
- Measured: see the composition table above (1600 deps: 90.2s → 0.9s).

**Known limitation (documented in the README).** A module built standalone only _types_ what
it declares, so a factory in module B cannot destructure module A's dependencies with
inference unless the module annotates its requirement
(`new DIContainer<{ userRepository: UserRepository }>()`) or is layered with `.extend()`
instead. Resolution itself is unaffected — it happens lazily against the composed container.

### 2. Guardrail the single-chain crash ➖ **Obsolete on TS 7**

Under TS 6, ~500+ links in one expression stack-overflowed `tsc`. TS 7's Go compiler has no
such limit (verified to 1200 links), so no guardrail is needed on a current toolchain. Item 1
addresses the remaining (performance) reason to avoid very long chains. Revisit only if the
project ever supports TS 6 consumers again.

### 3. Constant-factor type cleanups ✅ **Done**

Replaced `add`/`update`'s `<N, R extends Factory<CR>> … ReturnType<R>` with
`<N, V>(resolver: Factory<CR, V>) … { [n in N]: V }`, and gave `Factory` an optional
return-type param (`Factory<CR, Value = ResolvedDependencyValue>`, backward-compatible). Also
dropped the redundant `& this` from the `add`/`update` return casts (internal-cast cleanup;
declared return type unchanged). Two fewer moving parts per call site; one generic instead of two.

- **Verified:** exact inference preserved (literal widening `() => 123` → `number`, `update`
  override, factories reading prior deps, duplicate-name / unknown-dep still error).
- Full gate green: `pnpm build`, `pnpm test` (42 tests + type tests), lint.
- Measured (TS 6): N=200 deref 266,569 → 263,808 (−1%); no-deref ~177K → 140,255 (−20%).

### 4. Escape hatch for downstream consumers ✅ **Done — but the premise was wrong**

The item assumed consumer files "re-derive the whole builder chain" and that sealing would cut
that cost. **Measurement says otherwise, so nothing was shipped as a performance fix.**

Consumer-side cost, N=400 dependencies built from 20 modules:

| Consumers | `typeof container` | sealed (`Simplify` flatten) |
| --------- | -----------------: | --------------------------: |
| 1         |               277K |                        284K |
| 20        |               385K |                        398K |
| 50        |               409K |                        423K |

Three conclusions, each measured:

1. **Consumers are already cheap.** TypeScript resolves the container type once per program and
   caches it; going from 1 to 50 consumer files adds only ~2.6K instantiations each. Even 10
   consumers destructuring 50 dependencies apiece (500 references) changed nothing material.
2. **Sealing costs more, not less** — consistently ~3% more instantiations, and a
   `Simplify`-based variant tripled declaration-emit time at N=400 (0.16s → 0.47s). A "faster"
   helper that is measurably slower would have been actively harmful to ship.
3. **A loose/index-signature mode is not worth pursuing.** It would trade away exact per-key
   typing — the entire point of the library — to fix a cost that does not exist.

What _is_ real is **readability**. `typeof container` and `ReturnType<typeof configureDI>` both
resolve to a type that already carries its own name, so diagnostics expand the full resolver
intersection — unreadable past a few dozen dependencies. So the shipped piece is a two-line
ergonomic helper, documented as such:

```ts
export type SealedContainer<C> = IDIContainer<ResolversOf<C>>;
```

Wrapping the container creates a _fresh_ alias, so TypeScript prints `AppContainer` instead of
`IDIContainer<{ a: … } & { b: … } & …>`. The flatten is **not** needed for this —
`IDIContainer<ResolversOf<C>>` preserves the name on its own, at lower cost than a `Simplify`
version. `SealedContainer` and `ResolversOf` are now exported from the package entry point.

- **Verified:** exact dependency types preserved through the alias, container stays chainable,
  works for both chained and composed containers, and the alias name survives into real
  diagnostics when consumed from the built `dist/`.
- Full gate green: `pnpm build`, `pnpm test` (82 tests + type tests), `pnpm lint`.

### 5. CI perf regression gate ✅ **Done**

`scripts/bench-types.mjs`, wired into CI as the `types-perf` job and runnable locally with
`pnpm bench:types`. Three scenarios, each gated on a type-instantiation budget (~25% headroom
over the measured value on TypeScript 7.0.2):

| Scenario        | What it guards                               | Measured | Budget |
| --------------- | -------------------------------------------- | -------: | -----: |
| `chain-200`     | per-`add` constant factor on a flat chain    |     268K |   330K |
| `compose-400`   | the `compose` path, 400 deps as 20 modules   |      97K |   130K |
| `compose-scale` | 60 composed containers — depth-limiter guard |      35K |    45K |

**Why this is not redundant with the type tests.** The `*.test-d.ts` assertions run at three or
four dependencies. Both known failure modes are invisible at that size — verified by
reintroducing each one and running the full suite:

| Reintroduced regression                     | `pnpm test`             | `pnpm bench:types`          |
| ------------------------------------------- | ----------------------- | --------------------------- |
| recursive tuple fold in `MergedResolvers`   | 82 passed, no errors ✅ | FAILED — TS2589 + `never` ✗ |
| `Simplify` flatten on the `add` accumulator | 82 passed, no errors ✅ | FAILED — 507× TS2589 ✗      |

Every fixture also asserts exact types via a compile-time `Exact<>` check, so the gate cannot be
satisfied by making inference _worse_: a change degrading everything to `any` would lower the
instantiation count but fail the assertions. The budget path was verified independently by
lowering a budget below the measured value.

Budgets are compiler-specific. A TypeScript upgrade moves the numbers — run the script, read the
reported actuals, and re-baseline in the same commit as the upgrade.

---

## Appendix — reproducing the benchmark

The gated scenarios now live in `scripts/bench-types.mjs` (`pnpm bench:types`) — start there, and
add a scenario to it rather than rebuilding a one-off harness. The notes below cover the ad-hoc
exploration that produced the tables above: sweeping N, comparing layouts, and ablating individual
pieces of the type machinery, none of which the committed script does.

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

For the composed layout, emit _m_ independent `new DIContainer()` chains of `N/m` adds each and
finish with a single `DIContainer.compose(mod0, …, modM)` call.

**Measure** — pass `--ignoreConfig` whenever a tsconfig is present and files are listed
explicitly, and pin `--target/--lib es2022` to match the package's floor:

```bash
./node_modules/.bin/tsc --noEmit --ignoreConfig --extendedDiagnostics --strict --skipLibCheck \
  --target es2022 --lib es2022 --module nodenext --moduleResolution nodenext chain_200.ts
# read "Instantiations:" (deterministic) and "Check time:" (noisy)
```

Use `./node_modules/.bin/tsc`, not `npx tsc` — `npx` resolves to an unrelated placeholder
package and prints "This is not the tsc command you are looking for".

Ablation knobs used above: with/without factory dep destructuring ("deref"/"noderef");
with/without the `keyof` duplicate-guard; with/without the `Factory<CR>` constraint; layout
(one chain vs _m_ modules); and combinator (`compose`, chained `merge`, `extend` fold).
