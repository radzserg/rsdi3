import { DIContainer } from '../../DIContainer.js';
import { type Factory, type IDIContainer, type ResolvedDependencies } from '../../types.js';

/**
 * Generated graphs cannot use `add`, which requires a string literal. Runtime cost ignores the
 * static type, so the casts that buys stay in this file.
 */
export type SyntheticContainer = IDIContainer<ResolvedDependencies>;

type Node = {
  v: number;
};

/** Keeps results observable, so the optimiser cannot delete the measured call. */
export const sink: { value: unknown } = { value: undefined };

const emptyContainer = (): SyntheticContainer => new DIContainer() as unknown as SyntheticContainer;

const addDynamic = (
  container: SyntheticContainer,
  name: string,
  factory: Factory<ResolvedDependencies>,
): SyntheticContainer => container.add(name as never, factory) as SyntheticContainer;

export const buildIndependentChain = (size: number): SyntheticContainer => {
  let container = emptyContainer();

  for (let index = 0; index < size; index++) {
    container = addDynamic(container, `k${index}`, () => ({ v: index }));
  }

  return container;
};

/** Same chain, each factory destructuring its predecessor — the shape that hits the proxy. */
export const buildLinkedChain = (size: number): SyntheticContainer => {
  let container = emptyContainer();

  for (let index = 0; index < size; index++) {
    const previous = `k${index - 1}`;

    container =
      index === 0
        ? addDynamic(container, 'k0', () => ({ v: 0 }))
        : addDynamic(container, `k${index}`, (dependencies) => ({
            v: (dependencies[previous] as Node).v + 1,
          }));
  }

  return container;
};

/**
 * `size` must divide evenly by `moduleCount`. A fractional `perModule` would silently produce
 * short modules and duplicate keys across them, so the row would price a different graph than
 * its name claims rather than fail.
 */
export const buildModules = (size: number, moduleCount: number): SyntheticContainer[] => {
  if (size % moduleCount !== 0) {
    throw new Error(`buildModules: ${size} dependencies do not divide evenly into ${moduleCount}.`);
  }

  const perModule = size / moduleCount;

  return Array.from({ length: moduleCount }, (_, module) => {
    let container = emptyContainer();

    for (let index = 0; index < perModule; index++) {
      container = addDynamic(container, `k${module * perModule + index}`, () => ({ v: index }));
    }

    return container;
  });
};

export const resolveAll = (container: SyntheticContainer, size: number): void => {
  for (let index = 0; index < size; index++) {
    sink.value = container.get(`k${index}`);
  }
};

export const keysOf = (size: number): string[] =>
  Array.from({ length: size }, (_, index) => `k${index}`);
