import { DIContainer } from '../DIContainer.js';
import { describe, expect, test } from 'vitest';

describe('DIContainer hasResolvedDependency', () => {
  test('has resolves dependency', () => {
    const container = new DIContainer().add('foo', (diContainer) => {
      // @ts-expect-error - expected type error
      diContainer.add('c', () => '2');
      return 123;
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    container.foo;

    expect(container.hasResolvedDependency('foo')).toBe(true);
  });

  test('does not have resolves dependency', () => {
    const container = new DIContainer().add('foo', (diContainer) => {
      // @ts-expect-error - expected type error
      diContainer.add('c', () => '2');
      return 123;
    });
    expect(container.hasResolvedDependency('foo')).toBe(false);
  });
});
