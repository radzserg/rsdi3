# Changelog

# 3.1.1

Maintenance release — no public API changes.

## Changed

- `has` / `hasResolvedDependency` switched to `Object.hasOwn`, and the reserved container method
  names are now looked up through a `Set` instead of an array. This raised the effective Node floor
  to 16.9 for this release; it has since been reverted to
  `Object.prototype.hasOwnProperty.call` to restore compatibility with older runtimes.
- Type tests moved from `tsd` to Vitest's built-in `--typecheck` support, so runtime and type tests
  run in a single `pnpm test` pass.

## Added

- `prepublishOnly` script, so `dist/` is always rebuilt before publishing.

# 3.1.0

## Added

- `clone()` — creates a new container instance carrying the same resolvers, for sharing a base
  container across modules or bounded contexts.
- `hasResolvedDependency(name)` — reports whether a dependency has already been resolved and
  cached, as distinct from `has(name)`, which reports whether a resolver is registered.

## Fixed

- `update()` now evicts the cached value for the name being replaced. Previously, updating a
  resolver after its dependency had already been resolved kept returning the stale cached
  instance.

## Changed

- **`merge()` no longer mutates the receiver.** It returns a new `IDIContainer` with the combined
  resolvers instead of modifying the container it was called on, and it now accepts either a
  `DIContainer` or an `IDIContainer` as its argument.
- **The `DIContainer` constructor no longer takes a `resolvers` argument.** Containers are now
  always built up through `add()`. Code doing `new DIContainer({ … })` must be updated.
- `extend()` is typed as `ReturnType<E>`, so the extending function's own return type flows
  through rather than being widened.

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
