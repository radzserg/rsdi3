import { DIContainer } from '../DIContainer.js';
import { ForbiddenNameError } from '../errors.js';
import { describe, expect, test } from 'vitest';

// Members that exist on the prototype but are not public API. A dependency may safely take
// these names because nothing outside the class calls them through the instance.
const nonPublicMembers = new Set([
  'addContainerProperty',
  'constructor',
  'setResolvers',
  'setValue',
]);

describe('reserved dependency names', () => {
  // The guard is a hand-maintained Set, and a public method missing from it is not a compile
  // error anywhere — `export` was absent until a dependency of that name was found to break
  // every merge. This fails when a new public method is added without reserving its name.
  test('every public instance method is reserved', () => {
    const publicMethods = Object.getOwnPropertyNames(DIContainer.prototype).filter(
      (name) => !nonPublicMembers.has(name),
    );

    expect(publicMethods.length).toBeGreaterThan(0);

    for (const name of publicMethods) {
      expect(() => new DIContainer().add(name as 'notAMethod', () => 1)).toThrow(
        ForbiddenNameError,
      );
    }
  });

  // `merge` used to call `export()` on every container passed to it, so a dependency of this name
  // turned any `merge`/`compose` into a `TypeError`. `merge` reads the protected maps directly
  // now, but `export` is still public API, so an own property shadowing it is still a break.
  test('a dependency cannot shadow export', () => {
    expect(() => new DIContainer().add('export' as 'notAMethod', () => 1)).toThrow(
      ForbiddenNameError,
    );
  });

  test('static compose is not reserved — statics never shadow an instance property', () => {
    const container = new DIContainer().add('compose', () => 'a value');

    expect(container.compose).toEqual('a value');
    expect(DIContainer.compose(container).compose).toEqual('a value');
  });
});
