import { DIContainer } from '../DIContainer.js';
import { Bar, Foo } from './__helpers__/fakeClasses.js';
import { describe, expect, test } from 'vitest';

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
