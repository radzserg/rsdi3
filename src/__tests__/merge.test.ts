import { DIContainer } from '../DIContainer.js';
import { Bar, Buzz } from './__helpers__/fakeClasses.js';
import { describe, expect, test } from 'vitest';

describe('DIContainer merge containers', () => {
  test('merge empty container', () => {
    const containerA = new DIContainer()
      .add('a', () => '1')
      .add('bar', () => new Bar());
    const finalContainer = containerA.merge(new DIContainer());

    expect(finalContainer.a).toEqual('1');
    expect(finalContainer.bar).toBeInstanceOf(Bar);
  });

  test('merge 2 containers', () => {
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

  test('merge 2 containers - merger container overwrites properties', () => {
    const containerA = new DIContainer().add('a', () => '1');

    const containerB = new DIContainer().add('a', () => '2');

    const finalContainer = containerA.merge(containerB);

    expect(finalContainer.a).toEqual('2');
  });

  test('resolved properties only once', () => {
    const containerA = new DIContainer().add('buzz', () => new Buzz('buzz'));
    const buzzInstance = containerA.buzz;
    expect(buzzInstance.name).toEqual('buzz');

    buzzInstance.name = 'buzz2';

    const containerB = new DIContainer().add('a', () => '2');

    const finalContainer = containerA.merge(containerB);

    expect(finalContainer.buzz.name).toEqual('buzz2');
  });
});
