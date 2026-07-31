import { DIContainer } from '../DIContainer.js';
import { describe, expect, test } from 'vitest';

/**
 * Exposes the protected maps so a test can assert on their identity. `add`, `update` and `merge`
 * write into them in place, and identity is the only way to observe that from outside.
 */
class MapProbe extends DIContainer {
  public get resolvedMap(): unknown {
    return this.resolvedDependencies;
  }

  public get resolverMap(): unknown {
    return this.resolvers;
  }
}

/**
 * Rebuilding the resolver map per call is what made wiring O(N²) at runtime — 1600 dependencies
 * cost 196 ms on 3.2.1 against 0.6 ms once the writes went in place, with the per-dependency cost
 * flat from a few hundred up.
 *
 * Wall clock cannot guard that in CI: it does not transfer between machines, which is why
 * `pnpm bench` has no CI job and `bench:types` gates on instantiation counts instead. Map identity
 * states the same invariant deterministically — a `{ ...this.resolvers }` reintroduced on any of
 * these paths fails here rather than silently handing every consumer quadratic wiring back.
 */
describe('the container writes into its maps in place', () => {
  test('a chain of add calls keeps the same resolver map', () => {
    const probe = new MapProbe();
    const resolverMap = probe.resolverMap;

    probe
      .add('a', () => 'a')
      .add('b', () => 'b')
      .add('c', () => 'c');

    expect(probe.resolverMap).toBe(resolverMap);
    expect(probe.has('c')).toBe(true);
  });

  test('update keeps the same resolver map', () => {
    const probe = new MapProbe();
    const container = probe.add('a', () => 'a');
    const resolverMap = probe.resolverMap;

    const updated = container.update('a', () => 'replaced');

    expect(probe.resolverMap).toBe(resolverMap);
    expect(updated.a).toEqual('replaced');
  });

  test('merge keeps both of the receiving container maps', () => {
    const probe = new MapProbe();
    const container = probe.add('a', () => 'a');
    const resolvedMap = probe.resolvedMap;
    const resolverMap = probe.resolverMap;

    const merged = container.merge(new DIContainer().add('b', () => 'b'));

    expect(probe.resolverMap).toBe(resolverMap);
    expect(probe.resolvedMap).toBe(resolvedMap);
    expect(merged.b).toEqual('b');
  });

  test('caching a resolved value keeps the same map', () => {
    const probe = new MapProbe();
    const container = probe.add('a', () => 'a');
    const resolvedMap = probe.resolvedMap;

    expect(container.a).toEqual('a');
    expect(probe.resolvedMap).toBe(resolvedMap);
  });
});

/**
 * The flip side of those in-place writes: before them, `add` replaced `this.resolvers` outright,
 * so whatever `export()` handed out was a de-facto snapshot that no later call could reach. Now
 * the live map would keep changing under the caller — and let the caller change the container —
 * so `export()` copies. Nothing inside the class goes through it; `clone` and `merge` read the
 * protected maps directly, so no internal path pays for the copy.
 */
describe('export hands out copies, not the live maps', () => {
  // `export` is declared on the class but not on `IDIContainer`, which is what `add` returns — so
  // these hold the instance reference and use the widened one only to read values off it.
  test('a later registration is not visible through an earlier export', () => {
    const container = new DIContainer();
    container.add('a', () => 'a');
    const exported = container.export();

    container.add('b', () => 'b');

    expect('b' in exported.resolvers).toBe(false);
    expect('a' in exported.resolvers).toBe(true);
  });

  test('writing into an exported map does not reach the container', () => {
    const container = new DIContainer();
    const typed = container.add('a', () => 'a');
    const exported = container.export();

    exported.resolvers.injected = () => 'injected';
    exported.resolvedDependencies.a = 'tampered';

    expect(container.has('injected')).toBe(false);
    expect(typed.a).toEqual('a');
  });

  test('a later resolution is not visible through an earlier export', () => {
    const container = new DIContainer();
    const typed = container.add('a', () => 'a');
    const exported = container.export();

    expect(typed.a).toEqual('a');

    expect('a' in exported.resolvedDependencies).toBe(false);
    expect(container.hasResolvedDependency('a')).toBe(true);
  });
});
