// Imports the built package the way a consumer does, on the oldest Node we
// claim to support.
//
// This is the only check that touches `engines.node`: Vitest needs a much
// newer runtime than the floor, so the test matrix starts at 22 and never
// exercises what consumers on the floor actually get. It also runs against
// `dist/` rather than `src/`, so a broken emit or ESM specifier surfaces here.
// Neither gap is hypothetical — 3.1.1 shipped `Object.hasOwn` (Node 16.9+)
// while claiming to support older runtimes, and every `has()` call threw for
// anyone below it.
//
// Keep this to the public API and plain assertions, with no dev dependencies:
// it has to run on nothing but the floor's built-ins.
import { DIContainer } from '../dist/index.js';

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(`smoke: ${message}`);
  }
};

class Bar {}

class Foo {
  constructor(a, bar) {
    this.a = a;
    this.bar = bar;
  }
}

const container = new DIContainer()
  .add('a', () => 'name1')
  .add('bar', () => new Bar())
  .add('foo', ({ a, bar }) => new Foo(a, bar));

// Factory destructuring resolves through the context Proxy.
assert(container.get('foo').a === 'name1', 'get() failed to resolve a nested dependency');
assert(container.foo.bar instanceof Bar, 'property access failed to resolve');

// has()/hasResolvedDependency() are the Object.hasOwn callers.
assert(container.has('a'), 'has() missed a registered resolver');
assert(!container.has('nope'), 'has() reported an unregistered resolver');
assert(container.hasResolvedDependency('a'), 'hasResolvedDependency() missed a resolved value');
assert(!container.hasResolvedDependency('nope'), 'hasResolvedDependency() reported a stranger');

// update() must evict the cached value it replaces.
assert(
  container.update('a', () => 'name2').get('a') === 'name2',
  'update() returned a stale value',
);

assert(container.clone().get('a') === 'name2', 'clone() lost state');

console.log(`smoke: OK on ${process.version}`);
