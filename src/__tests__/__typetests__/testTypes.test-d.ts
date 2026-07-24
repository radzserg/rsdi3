// eslint-disable-next-line canonical/filename-match-regex
import { DIContainer } from '../../DIContainer.js';
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

  test('merge containers', () => {
    const containerA = new DIContainer().add('a', () => 'string');
    const containerB = new DIContainer().add('b', () => new Date());

    const container = containerA.merge(containerB);

    expectTypeOf(container.b).toEqualTypeOf<Date>();
    expectTypeOf(container.a).toEqualTypeOf<string>();
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
