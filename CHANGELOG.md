# Changelog

# 3.3.0

## Fixed

- A long chain of `update()` overrides no longer trips `TS2589`. On a 300-key container it
  previously started erroring at 50 chained calls — a length a test harness reaches when it
  overrides one service per test. Harnesses working around it with `@ts-expect-error` or
  `const container: any` can drop those suppressions. Inference is unchanged, including narrowing
  when a dependency is replaced with a subtype.

## Changed

- Building a container is now linear rather than quadratic. Wiring 1600 dependencies takes 0.6 ms
  rather than 196 ms, and a 200-dependency chain is roughly 10x faster. Resolving an
  already-cached dependency is 2-4x faster on large containers.
- `clone()` is roughly 35% slower — the cost of the copy that makes the above safe. It is a
  setup-time operation where `add` and `get` are paid on every use, but if your workload clones
  large containers in a hot path, that is the trade.
- `export()` now returns copies of both maps. Previously the returned `resolvedDependencies` kept
  reflecting resolutions that happened after the call.

# 3.2.1

Added `repository` and `bugs` metadata so the relative links in the README (including the AI agent
guide) resolve correctly on npmjs.com. No code changes.

# 3.2.0

## Added

- `DIContainer.compose(...containers)` — builds a new container from independently built ones,
  leaving the inputs untouched. Splitting a large graph into modules and composing them is far
  cheaper to type-check than one long `add` chain.
- `merge(...containers)` now accepts any number of containers; existing single-container calls are
  unchanged.
- `SealedContainer<C>` and `ResolversOf<C>` types are now exported, for naming a built container in
  hovers and error messages and for extracting its resolver map.

## Fixed

- `merge`/`compose` now clear a stale cached value when a later container overrides a name.
  Previously an already-resolved dependency kept returning the earlier instance, contradicting
  last-writer-wins.
- A dependency named `export` no longer breaks `merge`/`compose`. `export` is now a reserved name
  and is rejected at registration, like the other container methods.

# 3.1.0

## Added

- `clone()` — returns a new container carrying the same resolvers.
- `hasResolvedDependency(name)` — whether a dependency has already been resolved, as opposed to
  `has(name)`, which reports whether a resolver is registered.

## Fixed

- `update()` now clears the cached value for the name it replaces. Previously it kept returning the
  stale instance if the dependency had already been resolved.

# 3.0.5

Added `merge` and `clone` method to `DIContainer` class.

# 3.0.0

The major release of rsdi version 3.0.0 introduces a revamped API that brings several improvements. The new API aims
to simplify usage and enhance intuitiveness. It offers better type support and more informative error messages. While
rsdi 2.0.0 focused on unifying the declarative syntax, the 3.0.0 version prioritizes stricter type checks, ensuring
more robust dependency injection functionality.

# 2.1.0

## Changed

- Adds function resolver

# 2.0.0

## Changed

- Introduced more strict type checks
