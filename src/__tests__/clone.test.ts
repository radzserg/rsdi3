import { DIContainer } from '../DIContainer.js';
import { Buzz } from './__helpers__/fakeClasses.js';
import { describe, expect, test } from 'vitest';

describe('DIContainer merge containers', () => {
  test('clone container', () => {
    const baseContainer = new DIContainer().add('a', () => 'a');

    const boundedContextA = baseContainer
      .clone()
      .add('buzz', () => new Buzz('buzzA'));
    // if we clone the container, we can safele define new with the same name
    const boundedContextB = baseContainer
      .clone()
      .add('buzz', () => new Buzz('buzzB'));

    expect(boundedContextA.buzz.name).toEqual('buzzA');
    expect(boundedContextB.buzz.name).toEqual('buzzB');
  });

  test('clone container after dependency resolution', () => {
    const baseContainer = new DIContainer().add(
      'buzz',
      () => new Buzz('buzzA'),
    );
    // resolve buzz dependency
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const buzz = baseContainer.buzz;

    const boundedContextA = baseContainer.clone();
    const boundedContextB = baseContainer.clone();

    expect(boundedContextA.buzz.name).toEqual('buzzA');
    expect(boundedContextB.buzz.name).toEqual('buzzA');

    boundedContextA.buzz.name = 'buzzB';
    expect(boundedContextA.buzz.name).toEqual('buzzB');
    expect(boundedContextB.buzz.name).toEqual('buzzB');
  });
});
