# AGENTS.md

Guidance for AI agents working in this repository. Keep this file up to date when workflows change.

## What this is

**RSDI** — a minimal, strongly-typed TypeScript dependency injection container. No decorators, no `reflect-metadata`, **zero runtime dependencies**. Types drive the whole value proposition: resolving a dependency returns its exact inferred type, and misuse is caught at compile time.

The library is **ESM-only** (`"type": "module"`) and ships only compiled output from `dist/`.

## Commands

Use **pnpm** (pinned via `packageManager`; do not use npm/yarn).

| Task                 | Command                                  |
| -------------------- | ---------------------------------------- |
| Install              | `pnpm install`                           |
| Build (emit `dist/`) | `pnpm build` (runs `tsc`)                |
| Test (unit + types)  | `pnpm test` (`vitest --run --typecheck`) |
| Lint (check)         | `pnpm lint`                              |
| Format + autofix     | `pnpm format`                            |

`pnpm lint` runs `oxfmt --check` then `oxlint --type-aware --type-check`; `pnpm format` runs the same two tools in write/`--fix` mode.

There is no separate typecheck script — `pnpm test` runs both runtime tests and type tests in one pass. Always run `pnpm build`, `pnpm test`, and `pnpm lint` before considering a change done; CI (`.github/workflows/lint.yml`) runs `tsc`, `pnpm lint`, then `pnpm test`.

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

## Conventions & gotchas (read before editing)

- **Single quotes, canonical style.** Formatting is owned by `oxfmt` (`.oxfmtrc.json`: single quotes, 2-space indent, 100-col print width, trailing commas); lint rules come from `oxlint-config-canonical` via `oxlint.config.ts`. Do **not** reformat with double quotes. If in doubt, run `pnpm format`. The pre-commit hook (`lint-staged`) runs `oxfmt` + `oxlint --fix` on staged `*.{ts,json}`, so non-conforming formatting gets silently rewritten on commit.

- **Do NOT use `Object.hasOwn`.** It requires Node 16.9+. This package targets broad compatibility (`engines.node >=14`, ESM-only), so use `Object.prototype.hasOwnProperty.call(obj, key)` instead. There is a comment at `DIContainer.has()` explaining this — don't "modernize" it away.

- **Type tests are real assertions.** In `*.test-d.ts`, always use `expectTypeOf(value).toEqualTypeOf<T>()` (exact equality). Do **not** use the bare `expectTypeOf<T>(value)` form — it only checks assignability and silently misses widened/incorrect types. Type tests run only under `--typecheck` (already wired into `pnpm test`).

- **Keep runtime dependencies at zero.** Never add a `dependencies` entry. Dev-only tooling goes in `devDependencies`.

- **Resolvers are lazy and cached.** `add(name, factory)` registers a factory; it runs once on first `get`/property access, then the result is cached. `add` throws if the name already exists — use `update` to replace (mainly for test mocking). Reserved container method names (`add`, `get`, `merge`, …) cannot be used as dependency names.

## Toolchain pins (don't casually bump)

- **Linting is oxlint-only — no ESLint.** `oxlint` + `oxfmt` + `oxlint-config-canonical` replaced the ESLint/prettier stack; type-aware rules need `oxlint-tsgolint` installed (it is a devDependency, invoked via `--type-aware --type-check`).
- **Vitest is pinned exactly** (no `^`) because `--typecheck` is still flagged experimental.
- **pnpm settings live in `pnpm-workspace.yaml`**, not the `pnpm` field in `package.json` (pnpm 11 no longer reads that field). Build scripts are approved via `allowBuilds`.
- pnpm 11 enforces a **supply-chain `minimumReleaseAge` policy**: very freshly published versions can be rejected at install. If an install fails on a just-released package, pin to a slightly older version rather than disabling the policy.

## Publishing

- `prepublishOnly` runs `pnpm build`, so `dist/` is always fresh on publish.
- `files` publishes `dist/**` but excludes `dist/**/__tests__/**` — compiled tests are not shipped.
- License is **Apache-2.0** (matches the `LICENSE` file).

## Git / PRs

- Default branch is `main`; branch for changes.
- Commits go through the husky pre-commit hook (lint-staged). Keep changes lint-clean so the hook doesn't rewrite them under you.
