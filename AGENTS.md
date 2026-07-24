# AGENTS.md

Guidance for AI agents working in this repository. Keep this file up to date when workflows change.

## What this is

**RSDI** — a minimal, strongly-typed TypeScript dependency injection container. No decorators, no `reflect-metadata`, **zero runtime dependencies**. Types drive the whole value proposition: resolving a dependency returns its exact inferred type, and misuse is caught at compile time.

The library is **ESM-only** (`"type": "module"`) and ships only compiled output from `dist/`.

## Commands

Use **pnpm** (pinned via `packageManager`; do not use npm/yarn).

| Task                 | Command                                               |
| -------------------- | ----------------------------------------------------- |
| Install              | `pnpm install`                                        |
| Build (emit `dist/`) | `pnpm build` (runs `tsc`)                             |
| Test (unit + types)  | `pnpm test` (`vitest --run --typecheck`)              |
| Single test file     | `npx vitest --run merge` (substring-matches the path) |
| Single test case     | `npx vitest --run -t 'merge containers'`              |
| Lint (check)         | `pnpm lint`                                           |
| Format + autofix     | `pnpm format`                                         |

`pnpm lint` runs `oxfmt --check` then `oxlint --type-aware --type-check`; `pnpm format` runs the same two tools in write/`--fix` mode.

Type tests only run when `--typecheck` is passed, so a bare `npx vitest --run` silently skips every `*.test-d.ts` assertion. `pnpm test` includes it; ad-hoc filtered runs need it added back.

There is no separate typecheck script — `pnpm test` runs both runtime tests and type tests in one pass. Always run `pnpm build`, `pnpm test`, and `pnpm lint` before considering a change done; CI (`.github/workflows/ci.yml`) runs `pnpm build` + `pnpm lint` in one job and `pnpm test` across a Node matrix in another, with an aggregate `CI` job as the single required status check.

## Source layout

```
src/
  DIContainer.ts   # the container class (add/get/update/merge/clone/extend/has/…)
  types.ts         # public + internal type machinery (IDIContainer, Factory, …)
  errors.ts        # typed error classes
  index.ts         # public entry point — exports DIContainer, IDIContainer
  __tests__/
    *.test.ts                     # runtime tests (vitest)
    __typetests__/*.test-d.ts     # TYPE tests (vitest expectTypeOf, needs --typecheck)
    __helpers__/fakeClasses.ts    # shared test fixtures
```

## Architecture

Four small files, but the design is not obvious from any one of them.

### The type and the class are two parallel definitions of the same API

`DIContainer` (in `DIContainer.ts`) is the runtime class. `IDIContainer<R>` (in `types.ts`) is a hand-maintained type describing the same surface. They are not derived from each other.

**Every signature change to a public method must be made in both files.** The class methods return `this as unknown as IDIContainer<…>` — a cast, not a real conversion — so a mismatch does not produce a compile error anywhere in this repo. It silently ships wrong types to consumers, and only a `*.test-d.ts` assertion will catch it.

### Types are the product; the runtime is a thin map

`IDIContainer<R> = R & { add, get, merge, … }` — an intersection of the resolver map with the method set. That intersection is what makes `container.foo` typed as `Foo` rather than `any`, and it is why the whole library exists.

Each chained call widens the type parameter: `add('foo', …)` returns `IDIContainer<R & { foo: ReturnType<typeof factory> }>`. The value flowing through the chain is always the same mutated object; only its static type changes at each step.

### Dependency names live in the same namespace as method names

Because of that intersection, a dependency called `get` would shadow the `get` method. Two mechanisms guard this, and both must stay in sync with the actual method list:

- **Compile time** — `DenyInputKeys` / `StringLiteral` in `types.ts` reject non-literal and colliding names.
- **Runtime** — the `containerMethods` `Set` at the top of `DIContainer.ts` throws `ForbiddenNameError`.

Adding a public method to the class means adding its name to that `Set`.

### Mutation is real; immutability is only in the types

`add`, `update`, and `merge` all mutate `this` and return it re-cast. Despite the JSDoc on `merge` saying it returns a new container, it does not — it writes into `this.resolvers` and returns `this`. `clone()` is the only method that produces a genuinely separate instance.

`clone()` works through `ClonedDiContainer`, a non-exported subclass at the bottom of `DIContainer.ts`. It exists purely to provide a constructor that seeds resolvers, because the public `DIContainer` constructor deliberately takes no arguments. `setResolvers` is `protected` for the same reason and throws if resolvers already exist.

### Resolution: lazy, cached, via two access paths

`get(name)` and property access (`container.name`) reach the same cache. Property access is wired by `addContainerProperty`, which `Object.defineProperty`s a getter delegating to `get()` as each resolver is registered.

Factories receive `this.context`, a `Proxy` built in the constructor that forwards property reads back to the container — that is what makes `.add('foo', ({ a, bar }) => …)` destructuring resolve dependencies lazily at call time rather than at registration time.

`update()` must delete the cached value for the name it replaces; without that, a container that had already resolved the dependency keeps returning the stale instance. This was a real bug fixed in 3.1.0.

## Conventions & gotchas (read before editing)

- **Single quotes, canonical style.** Formatting is owned by `oxfmt` (`.oxfmtrc.json`: single quotes, 2-space indent, 100-col print width, trailing commas); lint rules come from `oxlint-config-canonical` via `oxlint.config.ts`. Do **not** reformat with double quotes. If in doubt, run `pnpm format`. The pre-commit hook (`lint-staged`) runs `oxfmt` on staged `*.{ts,json,md,yml,yaml}` and `oxlint --fix` on staged `*.ts`, so non-conforming formatting gets silently rewritten on commit. Both commands carry `--no-error-on-unmatched-pattern`; without it, a commit touching only files one tool can't handle (JSON for oxlint, `pnpm-lock.yaml` for oxfmt) fails the hook with "no files found".

- **Two different Node versions, on purpose.** `engines.node >=16.9.0` is what the _published_ package needs at runtime; `devEngines.runtime >=22` and `.nvmrc` (26) are what _contributing_ needs. They are unrelated audiences, so the mismatch is correct — don't "fix" it by aligning them. `devEngines` is enforced by npm 11+ and pnpm 11 when installing this repo and ignored when the package is consumed as a dependency. It must stay at or below the lowest entry in the CI test matrix, or the matrix's own `pnpm install` fails.

- **The floor is 16.9.0 because of `Object.hasOwn`**, which `DIContainer` uses in four places and which landed in 16.9 — not 16.0. Because development happens on Node 26, nothing about day-to-day work would reveal a newer built-in sneaking in, so two guards exist:
  - `tsconfig` pins `target` and `lib` to `ES2022`, the match for Node 16.9. A post-ES2022 API is then a compile error rather than a runtime failure at a consumer. Raising the floor means raising these together.
  - The `min-node` CI job imports the built package under a `node:<floor>-alpine` container, with the tag derived from `engines.node` so the check can't drift from the declaration. The script is `scripts/smoke-min-node.mjs`; keep it dependency-free, since it runs against nothing but the floor's built-ins.

  This has gone wrong once already: 3.1.1 shipped `Object.hasOwn` with `engines` unset, and every `has()` call threw for anyone below 16.9.

- **ESM-only, so relative imports carry the `.js` extension** even in `.ts` source (`./types.js`, not `./types`). `moduleResolution` is `NodeNext`.

- **Type tests are real assertions.** In `*.test-d.ts`, always use `expectTypeOf(value).toEqualTypeOf<T>()` (exact equality). Do **not** use the bare `expectTypeOf<T>(value)` form — it only checks assignability and silently misses widened/incorrect types. Type tests run only under `--typecheck` (already wired into `pnpm test`).

- **Keep runtime dependencies at zero.** Never add a `dependencies` entry. Dev-only tooling goes in `devDependencies`.

- **Resolvers are lazy and cached.** `add(name, factory)` registers a factory; it runs once on first `get`/property access, then the result is cached. `add` throws if the name already exists — use `update` to replace (mainly for test mocking). Reserved container method names (`add`, `get`, `merge`, …) cannot be used as dependency names.

## Toolchain pins (don't casually bump)

- **Linting is oxlint-only — no ESLint.** `oxlint` + `oxfmt` + `oxlint-config-canonical` replaced the ESLint/prettier stack; type-aware rules need `oxlint-tsgolint` installed (it is a devDependency, invoked via `--type-aware --type-check`).
- **TypeScript is on v7** (the native compiler). `tsc` now ships as a platform-specific Go binary via optional deps, so the lockfile carries every platform's package — don't prune them. `pnpm peers check` reports an unmet `typescript` peer from `@typescript-eslint/utils`, pulled in transitively by `oxlint-config-canonical` → `eslint-plugin-perfectionist`; it is unused (oxlint implements those rules natively) and the warning is safe to ignore.
- **Vitest is pinned exactly** (no `^`) because `--typecheck` is still flagged experimental.
- **pnpm settings live in `pnpm-workspace.yaml`**, not the `pnpm` field in `package.json` (pnpm 11 no longer reads that field). Build scripts are approved via `allowBuilds`.
- pnpm 11 enforces a **supply-chain `minimumReleaseAge` policy**: very freshly published versions can be rejected at install. If an install fails on a just-released package, pin to a slightly older version rather than disabling the policy.

## Publishing

- `prepublishOnly` runs `pnpm build`, so `dist/` is always fresh on publish.
- `files` publishes `dist/**` but excludes `dist/**/__tests__/**` — compiled tests are not shipped.
- License is **Apache-2.0** (matches the `LICENSE` file).

- **The package is ESM-only and that is deliberate**, not a limitation — nothing in `src/` requires it (no `import.meta`, no top-level await). CommonJS consumers are not shut out: Node 20.19+ and 22.12+ resolve `require()` of an ESM package, so the effective floor for a CJS consumer is Node 20.19 even though `engines.node` says 16.9. TypeScript CJS consumers need `module: nodenext`; on `Node16` they get `TS1479`. Dual-publishing CJS has been considered and rejected — it doubles the build and invites the dual package hazard, where two loaded copies make `instanceof DIContainer` fail.

- **`exports` condition order is significant.** `types` must stay before `default`, or TypeScript resolves the runtime entry and consumers lose every type. `oxfmt` preserves the order today, but nothing enforces it — if you reorder the block, re-check that a consumer on `moduleResolution: nodenext` still gets inference. The map also blocks deep imports (`rsdi/dist/…` now throws `ERR_PACKAGE_PATH_NOT_EXPORTED`), which is the point: `dist/` layout is not API. `main`/`types` stay alongside it for resolvers that predate `exports`.

## Git / PRs

- Default branch is `main`; branch for changes.
- Commits go through the husky pre-commit hook (lint-staged). Keep changes lint-clean so the hook doesn't rewrite them under you.
