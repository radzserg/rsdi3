// What a container costs per use: repeated cache hits, then the one-time factory + `Proxy` cost.
import { DIContainer } from '../../DIContainer.js';
import { Bar, Foo } from '../__helpers__/fakeClasses.js';
import {
  buildIndependentChain,
  buildLinkedChain,
  resolveAll,
  sink,
} from '../__helpers__/syntheticGraph.js';
import { bench, describe } from 'vitest';

// A cache hit is below tinybench's timer overhead, so rows batch; `hz` is batches/sec.
const BATCH_SIZE = 1_000;

const CHAIN_SIZE = 100;

const LAST_KEY = `k${CHAIN_SIZE - 1}`;

describe(`cached resolution (×${BATCH_SIZE.toLocaleString()} per sample)`, () => {
  const container = new DIContainer()
    .add('name', () => 'hello')
    .add('bar', () => new Bar())
    .add('foo', ({ bar, name }) => new Foo(name, bar));

  const large = buildLinkedChain(CHAIN_SIZE);

  // Warm the cache; first calls belong to the group below.
  container.get('foo');
  resolveAll(large, CHAIN_SIZE);

  bench('get()', () => {
    for (let index = 0; index < BATCH_SIZE; index++) {
      sink.value = container.get('foo');
    }
  });

  // Should track `get()`; a gap means the getter stopped forwarding.
  bench('property access', () => {
    for (let index = 0; index < BATCH_SIZE; index++) {
      sink.value = container.foo;
    }
  });

  bench(`get() — ${CHAIN_SIZE}-dependency container`, () => {
    for (let index = 0; index < BATCH_SIZE; index++) {
      sink.value = large.get(LAST_KEY);
    }
  });
});

describe(`first resolution of ${CHAIN_SIZE} dependencies`, () => {
  // `add` mutates and values stay cached, so each sample wires its own. Subtract to price resolution.
  bench('wire only (baseline)', () => {
    sink.value = buildIndependentChain(CHAIN_SIZE);
  });

  bench('wire + resolve — factories take no dependencies', () => {
    resolveAll(buildIndependentChain(CHAIN_SIZE), CHAIN_SIZE);
  });

  // Same graph, but factories destructure: the gap is the `Proxy` trap.
  bench('wire + resolve — factories destructure from the context proxy', () => {
    resolveAll(buildLinkedChain(CHAIN_SIZE), CHAIN_SIZE);
  });
});
