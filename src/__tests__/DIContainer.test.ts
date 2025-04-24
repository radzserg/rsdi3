import { DIContainer } from '../DIContainer.js';
import {
  DenyOverrideDependencyError,
  DependencyIsMissingError,
  IncorrectInvocationError,
} from '../errors.js';
import { Bar, Buzz, Foo } from './fakeClasses.js';
import { describe, expect, test } from 'vitest';

describe('DIContainer typescript type resolution', () => {
  test('it resolves type as given raw values', () => {
    const container = new DIContainer()
      .add('a', () => 123)
      .add('d', ({ a }) => a)
      .add('b', () => 'string');

    expect(container.get('a')).toEqual(123);
    expect(container.get('b')).toEqual('string');
    expect(container.get('d')).toEqual(123);
  });

  test('it resolves object', () => {
    const container = new DIContainer()
      .add('a', () => 'hello')
      .add('bar', () => new Bar())
      .add('foo', ({ a, bar }) => new Foo(a, bar));

    const foo = container.get('foo');
    expect(foo).toBeInstanceOf(Foo);
    expect(foo.name).toEqual('hello');
    expect(foo.bar).toBeInstanceOf(Bar);
  });

  test('it resolves function', () => {
    // eslint-disable-next-line unicorn/consistent-function-scoping
    const aConcat = (a: string) => a + 'a';
    const container = new DIContainer()
      .add('a', () => 'hello')
      .add('aConcat', (value) => aConcat(value.a));

    const aConcatValue = container.get('aConcat');
    expect(aConcatValue).toEqual('helloa');
  });

  test('deny override resolvers by key with add method', () => {
    const container = new DIContainer().add('key1', () => 'value 1');

    expect(() => {
      container
        // @ts-expect-error - expected type error
        .add('key1', () => new Date());
    }).toThrow(new DenyOverrideDependencyError('key1'));

    const value = container.get('key1');
    expect(value).toEqual('value 1');
  });

  test('override resolvers by key with update method', () => {
    const container = new DIContainer().add('key1', () => 'value 1');

    container.update('key1', () => true);

    const value = container.get('key1');
    expect(value).toEqual(true);
  });

  test('it throws an error if definition is missing during resolution', () => {
    const container = new DIContainer();
    expect(() => {
      // @ts-expect-error - expected type error
      container.get('Logger');
    }).toThrow(new DependencyIsMissingError('Logger'));
  });

  test('it always returns singleton', () => {
    const container = new DIContainer()
      .add('a', () => 'name1')
      .add('bar', () => new Bar())
      .add('foo', (deps) => new Foo(deps.a, deps.bar));

    const foo = container.get('foo');
    expect(foo.name).toEqual('name1');
    foo.name = 'name2';
    const foo2 = container.get('foo');
    expect(foo2.name).toEqual('name2');
  });

  test('cannot not add inside factory', () => {
    const container = new DIContainer().add('foo', (diContainer) => {
      // @ts-expect-error - expected type error
      diContainer.add('c', () => '2');
      return 123;
    });

    expect(() => {
      container.get('foo');
    }).toThrow(IncorrectInvocationError);
  });
});

describe('DIContainer extend functions', () => {
  test('extends container', () => {
    const containerWithDatabase = () => {
      return new DIContainer().add('a', () => '1').add('bar', () => new Bar());
    };

    const finalContainer = containerWithDatabase().extend((container) => {
      return container.add('foo', ({ a, bar }) => {
        return new Foo(a, bar);
      });
    });

    expect(finalContainer.get('a')).toEqual('1');
    expect(finalContainer.get('bar')).toBeInstanceOf(Bar);
    expect(finalContainer.get('foo')).toBeInstanceOf(Foo);
    expect(finalContainer.get('foo').name).toEqual('1');
  });
});

describe('DIContainer merge containers', () => {
  test('extends container', () => {
    const containerA = new DIContainer()
      .add('a', () => '1')
      .add('bar', () => new Bar());

    const containerB = new DIContainer()
      .add('b', () => 'b')
      .add('buzz', () => new Buzz('buzz'));

    const finalContainer = containerA.merge(containerB);

    expect(finalContainer.a).toEqual('1');
    expect(finalContainer.b).toEqual('b');
    expect(finalContainer.bar).toBeInstanceOf(Bar);
    expect(finalContainer.buzz.name).toEqual('buzz');
  });

  test('extends container - merger container overwrites properties', () => {
    const containerA = new DIContainer().add('a', () => '1');

    const containerB = new DIContainer().add('a', () => '2');

    const finalContainer = containerA.merge(containerB);

    expect(finalContainer.a).toEqual('2');
  });

  test('extends container - resolved properties only once', () => {
    const containerA = new DIContainer().add('buzz', () => new Buzz('buzz'));
    const buzzInstance = containerA.buzz;
    expect(buzzInstance.name).toEqual('buzz');

    buzzInstance.name = 'buzz2';

    const containerB = new DIContainer().add('a', () => '2');

    const finalContainer = containerA.merge(containerB);

    expect(finalContainer.buzz.name).toEqual('buzz2');
  });
});
