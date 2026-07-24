// Exercises the built package against the oldest Node we claim to support.
//
// The unit tests can't do this: Vitest 4 needs a far newer runtime than
// `engines.node`, so the CI matrix starts at 22 and the declared floor would
// otherwise go unverified. That gap is not hypothetical — 3.1.1 shipped
// `Object.hasOwn` (Node 16.9+) while claiming to support older runtimes, and
// every `has()` call threw for anyone below it.
//
// Keep this to the public API and plain assertions: it runs on a Node old
// enough that test frameworks and modern syntax are off the table.
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
