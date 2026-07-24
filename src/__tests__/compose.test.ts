import { DIContainer } from '../DIContainer.js';
import { Bar, Buzz, Foo } from './__helpers__/fakeClasses.js';
import { describe, expect, test, vi } from 'vitest';

describe('DIContainer.compose', () => {
  test('composes independently built containers', () => {
    const repositories = new DIContainer().add('a', () => '1');
    const services = new DIContainer().add('bar', () => new Bar());

    const container = DIContainer.compose(repositories, services);

    expect(container.a).toEqual('1');
    expect(container.bar).toBeInstanceOf(Bar);
  });

  test('resolves dependencies across composed containers', () => {
    const bars = new DIContainer().add('bar', () => new Bar());
    // a module declares what it expects the composed container to provide
    const foos = new DIContainer<{ bar: Bar }>().add('foo', ({ bar }) => new Foo('foo', bar));

    const container = DIContainer.compose(bars, foos);

    expect(container.foo).toBeInstanceOf(Foo);
    expect(container.foo.bar).toBe(container.bar);
  });

  test('returns a new container and leaves the composed ones untouched', () => {
    const containerA = new DIContainer().add('a', () => '1');
    const containerB = new DIContainer().add('b', () => '2');

    const container = DIContainer.compose(containerA, containerB);

    expect(container).not.toBe(containerA);
    expect(container).not.toBe(containerB);
    expect(containerA.has('b')).toBe(false);
    expect(containerB.has('a')).toBe(false);
  });

  test('last container wins when a name is defined twice', () => {
    const containerA = new DIContainer().add('a', () => '1');
    const containerB = new DIContainer().add('a', () => '2');

    expect(DIContainer.compose(containerA, containerB).get('a')).toEqual('2');
  });

  test('an overriding container replaces a value the earlier one had already resolved', () => {
    const containerA = new DIContainer().add('a', () => 'from A');
    // resolve it first, so the earlier container holds a cached value
    expect(containerA.a).toEqual('from A');

    const containerB = new DIContainer().add('a', () => 'from B');

    expect(DIContainer.compose(containerA, containerB).a).toEqual('from B');
  });

  test('an override keeps the later container own resolved value', () => {
    const containerA = new DIContainer().add('buzz', () => new Buzz('from A'));
    expect(containerA.buzz.name).toEqual('from A');

    const containerB = new DIContainer().add('buzz', () => new Buzz('from B'));
    containerB.buzz.name = 'resolved in B';

    expect(DIContainer.compose(containerA, containerB).buzz.name).toEqual('resolved in B');
  });

  test('composes no containers at all', () => {
    expect(DIContainer.compose().has('a')).toBe(false);
  });

  test('composes a single container', () => {
    const containerA = new DIContainer().add('a', () => '1');

    expect(DIContainer.compose(containerA).a).toEqual('1');
  });

  test('accepts a container that has no resolvers yet', () => {
    const containerA = new DIContainer().add('a', () => '1');

    expect(DIContainer.compose(new DIContainer(), containerA).a).toEqual('1');
  });

  test('keeps resolution lazy and cached', () => {
    const factory = vi.fn(() => new Buzz('buzz'));

    const container = DIContainer.compose(new DIContainer().add('buzz', factory));
    expect(factory).not.toHaveBeenCalled();

    expect(container.buzz).toBe(container.buzz);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  test('carries over already resolved dependencies', () => {
    const containerA = new DIContainer().add('buzz', () => new Buzz('buzz'));
    containerA.buzz.name = 'buzz2';

    const container = DIContainer.compose(containerA);

    expect(container.buzz.name).toEqual('buzz2');
  });

  test('composed container can be extended further', () => {
    const bars = new DIContainer().add('bar', () => new Bar());

    const container = DIContainer.compose(bars).add('foo', ({ bar }) => new Foo('foo', bar));

    expect(container.foo).toBeInstanceOf(Foo);
    expect(container.foo.bar).toBeInstanceOf(Bar);
  });
});
