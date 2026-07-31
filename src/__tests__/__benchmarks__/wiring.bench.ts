// What a container costs to build. `add` writes into the resolver map in place, so a chain is
// linear at runtime even though it stays O(N²) to type-check; the second group checks `compose`
// adds no runtime tax.
import { DIContainer } from '../../DIContainer.js';
import { buildIndependentChain, buildModules, sink } from '../__helpers__/syntheticGraph.js';
import { bench, describe } from 'vitest';

const CHAIN_SIZES = [50, 100, 200];

const GRAPH_SIZE = 200;

const MODULE_COUNT = 20;

describe('add — a growing chain', () => {
  // Doubling the size should roughly double the time. Anything approaching a quadrupling means a
  // rebuild of the resolver map is back on the `add` path — `resolverMapOwnership.test.ts` pins
  // that deterministically, and is the row to look at first when this one drifts.
  for (const size of CHAIN_SIZES) {
    bench(`chain of ${size}`, () => {
      sink.value = buildIndependentChain(size);
    });
  }
});

describe(`assembling ${GRAPH_SIZE} dependencies`, () => {
  // `compose` and `clone` leave inputs untouched, so these survive reuse.
  const modules = buildModules(GRAPH_SIZE, MODULE_COUNT);

  const built = buildIndependentChain(GRAPH_SIZE);

  bench('one add chain', () => {
    sink.value = buildIndependentChain(GRAPH_SIZE);
  });

  bench(`${MODULE_COUNT} modules, built and composed`, () => {
    sink.value = DIContainer.compose(...buildModules(GRAPH_SIZE, MODULE_COUNT));
  });

  bench(`${MODULE_COUNT} pre-built modules, composed`, () => {
    sink.value = DIContainer.compose(...modules);
  });

  bench('clone a built container', () => {
    sink.value = built.clone();
  });
});
