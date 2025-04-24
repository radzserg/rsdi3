import { DIContainer } from '../../DIContainer.js';
import { Bar } from '../fakeClasses.js';
import { expectNotType, expectType } from 'tsd';
import { describe, test } from 'vitest';

describe('DIContainer typescript type resolution', () => {
  test('if resolves type as given raw values', () => {
    const container = new DIContainer()
      .add('key1', () => 'string')
      .add('key2', () => 123)
      .add('bar', () => new Bar())
      .add('d', () => '' as unknown);
    expectType<string>(container.get('key1'));
    expectType<string>(container.key1);
    expectType<number>(container.get('key2'));
    expectType<number>(container.key2);
    expectType<Bar>(container.get('bar'));
    expectType<Bar>(container.bar);
    expectType<unknown>(container.get('d'));
    expectType<unknown>(container.d);
  });

  test('it overrides the type', () => {
    const container = new DIContainer()
      .add('a', () => 'string')
      .update('a', () => new Date());

    expectType<Date>(container.a);
    expectNotType<string>(container.a);
  });

  test('merge containers', () => {
    const containerA = new DIContainer().add('a', () => 'string');
    const containerB = new DIContainer().add('b', () => new Date());

    const container = containerA.merge(containerB);

    expectType<Date>(container.b);
    expectNotType<string>(container.a);
  });
});
