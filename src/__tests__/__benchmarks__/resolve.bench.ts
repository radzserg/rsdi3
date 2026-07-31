// What a container costs per use: repeated cache hits, then the one-time factory + `Proxy` cost.
import { DIContainer } from '../../DIContainer.js';
import { Bar, Foo } from '../__helpers__/fakeClasses.js';
import {
  buildIndependentChain,
  buildLinkedChain,
  keysOf,
  resolveAll,
  sink,
} from '../__helpers__/syntheticGraph.js';
import { bench, describe } from 'vitest';

// A cache hit is below tinybench's timer overhead, so rows batch; `hz` is batches/sec.
const BATCH_SIZE = 1_000;

const CHAIN_SIZE = 100;

const SMALL_KEYS = ['name', 'bar', 'foo'] as const;

describe(`cached resolution (×${BATCH_SIZE.toLocaleString()} per sample)`, () => {
  const container = new DIContainer()
    .add('name', () => 'hello')
    .add('bar', () => new Bar())
    .add('foo', ({ bar, name }) => new Foo(name, bar));

  const large = buildLinkedChain(CHAIN_SIZE);

  const largeKeys = keysOf(CHAIN_SIZE);

  // Warm the cache; first calls belong to the group below.
  container.get('foo');
  resolveAll(large, CHAIN_SIZE);

  // The name has to vary per iteration. Asking for one fixed key leaves the call loop-invariant,
  // and V8 hoists it clean out of the batch — which made a 4x speedup read as a 1.6x regression.
  bench('get()', () => {
    for (let index = 0; index < BATCH_SIZE; index++) {
      sink.value = container.get(SMALL_KEYS[index % SMALL_KEYS.length]);
    }
  });

  // Should track `get()`; a gap means the getter stopped forwarding.
  bench('property access', () => {
    for (let index = 0; index < BATCH_SIZE; index++) {
      sink.value = container[SMALL_KEYS[index % SMALL_KEYS.length]];
    }
  });

  bench(`get() — ${CHAIN_SIZE}-dependency container`, () => {
    for (let index = 0; index < BATCH_SIZE; index++) {
      sink.value = large.get(largeKeys[index % CHAIN_SIZE]);
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
