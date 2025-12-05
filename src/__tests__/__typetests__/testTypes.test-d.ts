import { DIContainer } from '../../DIContainer.js'
import { Bar, Foo } from '../__helpers__/fakeClasses.js'
import { describe, test, expectTypeOf } from 'vitest'

describe('DIContainer typescript type resolution', () => {
  test('if resolves type as given raw values', () => {
    const container = new DIContainer()
      .add('key1', () => 'string')
      .add('key2', () => 123)
      .add('bar', () => new Bar())
      .add('d', () => '' as unknown)
    expectTypeOf<string>(container.get('key1'))
    expectTypeOf<string>(container.key1)
    expectTypeOf<number>(container.get('key2'))
    expectTypeOf<number>(container.key2)
    expectTypeOf<Bar>(container.get('bar'))
    expectTypeOf<Bar>(container.bar)
    expectTypeOf<unknown>(container.get('d'))
    expectTypeOf<unknown>(container.d)
  })

  test('it overrides the type', () => {
    const container = new DIContainer()
      .add('a', () => 'string')
      .update('a', () => new Date())

    expectTypeOf<Date>(container.a)
  })

  test('merge containers', () => {
    const containerA = new DIContainer().add('a', () => 'string')
    const containerB = new DIContainer().add('b', () => new Date())

    const container = containerA.merge(containerB)

    expectTypeOf<Date>(container.b)
    expectTypeOf<string>(container.a)
  })

  test('extend function', () => {
    const containerA = () => {
      return new DIContainer().add('a', () => '1').add('bar', () => new Bar())
    }

    const finalContainer = containerA().extend((container) => {
      return container.add('foo', ({ a, bar }) => {
        return new Foo(a, bar)
      })
    })

    // printType(finalContainer)
    expectTypeOf<string>(finalContainer.a)
    expectTypeOf<Bar>(finalContainer.bar)
    expectTypeOf<Foo>(finalContainer.foo)
  })
})
