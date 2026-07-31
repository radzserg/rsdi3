# Reading `pnpm bench:types`

> **Audience:** contributors and AI agents changing `src/types.ts` or an
> `add`/`merge`/`compose` signature. The gate lives in `scripts/bench-types.mjs` and runs in CI as
> the `types-perf` job. For the measurements behind it, see
> [type-performance-plan.md](./type-performance-plan.md).

Per-key inference is the whole product here, and the machinery producing it is quadratic by
construction — each `add` re-embeds the growing resolver map. That makes it easy to add a
small-looking type and multiply everyone's build time. This gate measures that cost.

---

## The report

```
types-bench: TypeScript Version 7.0.2      ← budgets are tied to this version
✓ chain-200 — 267,699 / 330,000 instantiations (81% of budget)
│  │           │         │                      └ how much headroom is left
│  │           │         └ the ceiling, ~25% above what it measured when set
│  │           └ what this run actually cost
│  └ scenario name
└ pass/fail
    flat chain of 200 add() calls          ← the shape being measured
```

The **percentage** is the part to watch. Below ~85% is healthy. Between 85% and 100% it still
passes, but the headroom is nearly gone — understand why your change moved it before merging.
Above 100% it fails.

### What each scenario guards

| Scenario           | Catches                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| `chain-200`        | the per-`add` cost — what every user pays on every dependency                                   |
| `compose-400`      | the `compose` path specifically                                                                 |
| `compose-scale`    | the depth limiter at 60 containers — the trap that produces no error when small                 |
| `module-seeded-64` | one domain module layered on a large container — the shape that breaks before a flat chain does |
| `update-chain-80`  | a long `update()` override chain off a built container — the shape test harnesses reach         |

The last two are deliberately the _seeded_ shapes. Starting from an empty container understates
what an `add` or an `update` costs, because each candidate return type is checked against a map
that is still small. Both scenarios were added after field reports from a ~340-dependency
application hit `TS2589` on shapes the empty-start scenarios waved through.

---

## The two ways it fails

They mean different things, and only one of them is ever fixed by editing the budget.

**Budget exceeded.** Your change made the types more expensive per dependency:

```
✗ chain-200 — flat chain of 200 add() calls
  267,699 instantiations exceeds the 200,000 budget (134%).
```

Decide whether the increase is justified. If it is, raise the budget in `scripts/bench-types.mjs`
and say why in the commit. If it is not, the type you added is doing per-dependency work that
something cheaper could do.

**Inference broke.** A diagnostic appeared, which is a correctness bug, not a slow one:

```
✗ compose-scale — 60 composed containers (depth-limiter guard)
  inference broke: 10 diagnostic(s)
    error TS2589: Type instantiation is excessively deep and possibly infinite.
    error TS2339: Property 'num0' does not exist on type 'never'.
```

`TS2589` means a type started recursing per dependency; `… does not exist on type 'never'` means
inference collapsed entirely. **Never raise a budget to silence this.** Both known causes are
recorded in [type-performance-plan.md](./type-performance-plan.md#what-does-not-help-ruled-out--dont-re-attempt):
a recursive tuple fold in `MergedResolvers`, and a `Simplify`-style flatten on the `add`
accumulator. Both look perfectly fine at three dependencies — that is exactly why this gate exists,
and both pass the full 82-test suite untouched.

---

## Why instantiations, not time

A **type instantiation** is one act of the checker producing a concrete type from a generic by
substituting type arguments — `IDIContainer<{ a: string }>` out of `IDIContainer<CR>`. It is the
unit of work the type system does, and it is what this library spends. Link _k_ of a chain costs
O(_k_) instantiations, so N dependencies cost O(N²).

The practical reason is that **it is deterministic and time is not**. The same file, same compiler,
five consecutive runs:

| Run | Instantiations | Check time |
| --- | -------------: | ---------: |
| 1   |        266,808 |     0.287s |
| 2   |        266,808 |     0.282s |
| 3   |        266,808 |     0.266s |
| 4   |        266,808 |     0.284s |
| 5   |        266,808 |     0.327s |

Identical every time, while wall clock swings ~11% from CPU scheduling, thermal state and cache. A
gate on time would either flake or need thresholds so loose they catch nothing. Three consequences:

- **Budgets are machine-independent.** A number set on a laptop holds on any CI runner.
- **A regression is unambiguous.** If the count moved, your change moved it.
- **It is sensitive to structure.** The quadratic shows up as instantiations quadrupling per
  doubling (74K → 264K → 1.00M → 3.92M) long before anyone notices a slow build.

Time is still what users feel — that is why the plan quotes 90.2s → 0.9s at 1600 dependencies. It is
just the wrong thing to _gate_ on.

---

## Two caveats

**Lower is not automatically better.** A change degrading every dependency to `any` would slash the
count while destroying the point of the library. Every fixture therefore also asserts exact types
with a compile-time `Exact<>` check, so the gate cannot be satisfied by making inference worse.
Treat an unexplained _drop_ as suspicious, not as a win.

**The number is a proxy, and it is compiler-specific.** It counts instantiations, not every kind of
checker work — expensive assignability comparisons or very large unions can hurt without moving it
much. And a TypeScript upgrade shifts every number, so budgets must be re-baselined in the same
commit as the bump: run the script, read the reported actuals, update `BUDGETS`. This is not
hypothetical — the TS 6 → 7 move changed the figures here and invalidated one earlier finding
outright.

---

## Measuring something else

To profile a shape the gate does not cover, compile it directly. Use `./node_modules/.bin/tsc`
rather than `npx tsc`, which resolves to an unrelated placeholder package:

```bash
./node_modules/.bin/tsc --noEmit --ignoreConfig --extendedDiagnostics --strict --skipLibCheck \
  --target es2022 --lib es2022 --module nodenext --moduleResolution nodenext yourfile.ts
```

Read `Instantiations:`, ignore `Check time:`. If the shape is worth protecting, add it as a scenario
in `scripts/bench-types.mjs` instead of keeping a one-off script.
