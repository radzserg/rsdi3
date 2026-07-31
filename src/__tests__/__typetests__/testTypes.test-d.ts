// eslint-disable-next-line canonical/filename-match-regex
import { DIContainer } from '../../DIContainer.js';
import { type SealedContainer } from '../../types.js';
import { Bar, Foo } from '../__helpers__/fakeClasses.js';
import { describe, expectTypeOf, test } from 'vitest';

describe('DIContainer typescript type resolution', () => {
  test('if resolves type as given raw values', () => {
    const container = new DIContainer()
      .add('key1', () => 'string')
      .add('key2', () => 123)
      .add('bar', () => new Bar())
      .add('d', () => '' as unknown);
    expectTypeOf(container.get('key1')).toEqualTypeOf<string>();
    expectTypeOf(container.key1).toEqualTypeOf<string>();
    expectTypeOf(container.get('key2')).toEqualTypeOf<number>();
    expectTypeOf(container.key2).toEqualTypeOf<number>();
    expectTypeOf(container.get('bar')).toEqualTypeOf<Bar>();
    expectTypeOf(container.bar).toEqualTypeOf<Bar>();
    expectTypeOf(container.get('d')).toEqualTypeOf<unknown>();
    expectTypeOf(container.d).toEqualTypeOf<unknown>();
  });

  test('it overrides the type', () => {
    const container = new DIContainer().add('a', () => 'string').update('a', () => new Date());

    expectTypeOf(container.a).toEqualTypeOf<Date>();
    expectTypeOf(container.a).not.toEqualTypeOf<string>();
  });

  // `update` passes the container type through untouched when the replacement has the
  // same type, which is what keeps a long override chain from accumulating depth. These
  // pin the inference that shortcut must not cost — see `UpdatedResolvers` in types.ts.
  test('update leaves the other dependencies alone', () => {
    const container = new DIContainer()
      .add('a', () => 'string')
      .add('bar', () => new Bar())
      .update('a', () => new Date());

    expectTypeOf(container.a).toEqualTypeOf<Date>();
    expectTypeOf(container.bar).toEqualTypeOf<Bar>();
    expectTypeOf(container.get('bar')).toEqualTypeOf<Bar>();
  });

  test('update with the same type keeps that type', () => {
    const container = new DIContainer().add('a', () => 'string').update('a', () => 'mock');

    expectTypeOf(container.a).toEqualTypeOf<string>();
    expectTypeOf(container.get('a')).toEqualTypeOf<string>();
  });

  test('update with a subtype narrows the dependency', () => {
    class Animal {
      public legs = 4;
    }
    class Dog extends Animal {
      public bark() {
        return 'woof';
      }
    }

    const container = new DIContainer()
      .add('pet', () => new Animal())
      .update('pet', () => new Dog());

    expectTypeOf(container.pet).toEqualTypeOf<Dog>();
  });

  test('the container stays chainable and typed after an update', () => {
    const container = new DIContainer()
      .add('a', () => 'string')
      .update('a', () => 42)
      .add('foo', ({ a }) => a + 1);

    expectTypeOf(container.a).toEqualTypeOf<number>();
    expectTypeOf(container.foo).toEqualTypeOf<number>();
  });

  test('merge containers', () => {
    const containerA = new DIContainer().add('a', () => 'string');
    const containerB = new DIContainer().add('b', () => new Date());

    const container = containerA.merge(containerB);

    expectTypeOf(container.b).toEqualTypeOf<Date>();
    expectTypeOf(container.a).toEqualTypeOf<string>();
  });

  test('merge several containers in a single call', () => {
    const containerA = new DIContainer().add('a', () => 'string');
    const containerB = new DIContainer().add('b', () => new Date());
    const containerC = new DIContainer().add('c', () => 123);

    const container = containerA.merge(containerB, containerC);

    expectTypeOf(container.a).toEqualTypeOf<string>();
    expectTypeOf(container.b).toEqualTypeOf<Date>();
    expectTypeOf(container.c).toEqualTypeOf<number>();
  });

  test('compose containers', () => {
    const containerA = new DIContainer().add('a', () => 'string');
    const containerB = new DIContainer().add('b', () => new Date());
    const containerC = new DIContainer().add('bar', () => new Bar());

    const container = DIContainer.compose(containerA, containerB, containerC);

    expectTypeOf(container.a).toEqualTypeOf<string>();
    expectTypeOf(container.b).toEqualTypeOf<Date>();
    expectTypeOf(container.bar).toEqualTypeOf<Bar>();
  });

  test('compose keeps the container chainable', () => {
    const containerA = new DIContainer().add('a', () => '1');
    const containerB = new DIContainer().add('bar', () => new Bar());

    const container = DIContainer.compose(containerA, containerB).add(
      'foo',
      ({ a, bar }) => new Foo(a, bar),
    );

    expectTypeOf(container.a).toEqualTypeOf<string>();
    expectTypeOf(container.bar).toEqualTypeOf<Bar>();
    expectTypeOf(container.foo).toEqualTypeOf<Foo>();
  });

  test('compose accepts a container with no resolvers', () => {
    const containerA = new DIContainer().add('a', () => 'string');

    const container = DIContainer.compose(new DIContainer(), containerA);

    expectTypeOf(container.a).toEqualTypeOf<string>();
  });

  test('compose keeps the declared dependencies of a module', () => {
    const bars = new DIContainer().add('bar', () => new Bar());
    const foos = new DIContainer<{ bar: Bar }>().add('foo', ({ bar }) => new Foo('foo', bar));

    const container = DIContainer.compose(bars, foos);

    expectTypeOf(container.bar).toEqualTypeOf<Bar>();
    expectTypeOf(container.foo).toEqualTypeOf<Foo>();
  });

  test('sealed container keeps the exact dependency types', () => {
    const container = new DIContainer()
      .add('key1', () => 'string')
      .add('key2', () => 123)
      .add('bar', () => new Bar());

    type AppContainer = SealedContainer<typeof container>;
    const sealed = container as AppContainer;

    expectTypeOf(sealed.key1).toEqualTypeOf<string>();
    expectTypeOf(sealed.key2).toEqualTypeOf<number>();
    expectTypeOf(sealed.bar).toEqualTypeOf<Bar>();
    expectTypeOf(sealed.get('key2')).toEqualTypeOf<number>();
  });

  test('sealed container stays chainable', () => {
    const built = new DIContainer().add('a', () => '1').add('bar', () => new Bar());
    const sealed = built as SealedContainer<typeof built>;

    const container = sealed.add('foo', ({ a, bar }) => new Foo(a, bar));

    expectTypeOf(container.foo).toEqualTypeOf<Foo>();
  });

  test('sealed container works for a composed container', () => {
    const bars = new DIContainer().add('bar', () => new Bar());
    const strings = new DIContainer().add('a', () => 'string');
    const composed = DIContainer.compose(bars, strings);

    const sealed = composed as SealedContainer<typeof composed>;

    expectTypeOf(sealed.a).toEqualTypeOf<string>();
    expectTypeOf(sealed.bar).toEqualTypeOf<Bar>();
  });

  test('extend function', () => {
    const containerA = () => {
      return new DIContainer().add('a', () => '1').add('bar', () => new Bar());
    };

    const finalContainer = containerA().extend((container) => {
      return container.add('foo', ({ a, bar }) => {
        return new Foo(a, bar);
      });
    });

    expectTypeOf(finalContainer.a).toEqualTypeOf<string>();
    expectTypeOf(finalContainer.bar).toEqualTypeOf<Bar>();
    expectTypeOf(finalContainer.foo).toEqualTypeOf<Foo>();
  });
});
