import {
  DenyOverrideDependencyError,
  DependencyIsMissingError,
  ForbiddenNameError,
} from './errors.js';
import {
  type ContainerLike,
  type DenyInputKeys,
  type Factory,
  type IDIContainer,
  type MergedResolvers,
  type ResolvedDependencies,
  type ResolvedDependencyValue,
  type Resolvers,
  type StringLiteral,
} from './types.js';

// Every public *instance* member, because `addContainerProperty` defines dependencies as own
// properties that would otherwise shadow the method of the same name. `export` belongs here even
// though it is rarely used directly: `merge` calls it on the containers passed to it, so a
// dependency named `export` turned any `merge`/`compose` involving that container into a
// `TypeError`. Statics (`compose`) never live on the instance and are deliberately absent.
// `src/__tests__/reservedNames.test.ts` fails if a new public method is not listed here.
const containerMethods = new Set([
  'add',
  'clone',
  'export',
  'extend',
  'get',
  'has',
  'hasResolvedDependency',
  'merge',
  'update',
]);

/**
 * Dependency injection container
 */
export class DIContainer<ContainerResolvers extends ResolvedDependencies = {}> {
  protected resolvedDependencies: {
    [name in keyof ContainerResolvers]?: ResolvedDependencyValue;
  } = {};

  protected resolvers: Resolvers<ContainerResolvers> = {};

  private readonly context: ContainerResolvers = {} as ContainerResolvers;

  public constructor() {
    this.context = new Proxy(this, {
      get(target, property) {
        const propertyName = property.toString() as keyof DIContainer<ContainerResolvers>;

        return target[propertyName];
      },
    }) as unknown as ContainerResolvers;
  }

  /**
   * Combines independently built containers into a single new container.
   *
   * This is the recommended way to wire a large dependency graph. Splitting the graph
   * into modules and composing them is dramatically cheaper to type-check than one long
   * `add` chain, because each module chain is type-checked against its own small
   * resolver map instead of the ever-growing combined one:
   *
   * // repositories.ts
   * export const repositories = new DIContainer().add('userRepository', () => new UserRepository());
   * // services.ts
   * export const services = new DIContainer().add('mailer', () => new Mailer());
   * // container.ts
   * const container = DIContainer.compose(repositories, services);
   *
   * Factories may depend on names provided by any of the composed containers — resolution
   * happens lazily against the composed container, so cross-module dependencies work at
   * runtime. Only the *types* of a module are limited to what that module declares; when a
   * module needs another module's dependencies to be visible at compile time, layer them
   * with `extend` instead.
   *
   * The inputs are left untouched: the composed container is a new instance.
   *
   * When several containers define the same name the last one wins at runtime, including
   * over a value the earlier container had already resolved. Note the types intersect rather
   * than overwrite, so a name defined twice with *different* types resolves to `never` — a
   * deliberate signal, since a scalable last-writer-wins type fold has to recurse per
   * container and trips TypeScript's depth limiter at ~50 of them. Prefer `update()` when a
   * replacement is intentional.
   * @param containers
   */
  public static compose<T extends readonly ContainerLike[]>(
    ...containers: T
  ): IDIContainer<MergedResolvers<T>> {
    return new DIContainer().merge(...containers) as IDIContainer<MergedResolvers<T>>;
  }

  /**
   * Adds new dependency resolver to the container. If dependency with given name already exists it will throw an error.
   * Use update method instead. It will override existing dependency.
   * @param name
   * @param resolver
   */
  public add<N extends string, V>(
    name: StringLiteral<DenyInputKeys<N, keyof ContainerResolvers>>,
    resolver: Factory<ContainerResolvers, V>,
  ): IDIContainer<ContainerResolvers & { [n in N]: V }> {
    if (containerMethods.has(name)) {
      throw new ForbiddenNameError(name);
    }

    if (this.has(name)) {
      throw new DenyOverrideDependencyError(name);
    }

    this.setValue(name, resolver);

    return this as unknown as IDIContainer<ContainerResolvers & { [n in N]: V }>;
  }

  /**
   * Creates a new container instance with the same resolvers.
   *
   * Useful when you want to share a base container across different modules.
   * For example, you can define a base container with shared dependencies,
   * then clone it to create separate DI configurations for different bounded contexts.
   *
   * The cloned container is a new instance but retains all the original resolvers.
   */
  public clone(): DIContainer<ContainerResolvers> {
    const { resolvedDependencies: newResolvedDependencies, resolvers: newResolvers } =
      this.export();
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    const newContainer = new ClonedDiContainer(newResolvers, newResolvedDependencies);

    return newContainer as DIContainer<ContainerResolvers>;
  }

  public export(): ResolvedDependencies {
    return {
      resolvedDependencies: this.resolvedDependencies,
      resolvers: this.resolvers,
    };
  }

  /**
   * Extends container with given function. It will pass container as an argument to the function.
   * Function should return new container with extended resolvers.
   * It is useful when you want to split your container into multiple files.
   * You can create a file with resolvers and extend container with it.
   * You can also use it to create multiple containers with different resolvers.
   *
   * For example:
   *
   * const container = new DIContainer()
   * .extend(addValidators)
   *
   * export type DIWithValidators = ReturnType<typeof addValidators>;
   * export const addValidators = (container: DIWithDataAccessors) => {
   * return container
   * .add('myValidatorA', ({ a, b, c }) => new MyValidatorA(a, b, c))
   * .add('myValidatorB', ({ a, b, c }) => new MyValidatorB(a, b, c));
   * };
   * @param diConfigurationFactory
   */
  public extend<E extends (container: IDIContainer<ContainerResolvers>) => IDIContainer>(
    diConfigurationFactory: E,
  ): ReturnType<E> {
    return diConfigurationFactory(
      this as unknown as IDIContainer<ContainerResolvers>,
    ) as ReturnType<E>;
  }

  /**
   * Resolve dependency by name. Alternatively you can use property access to resolve dependency.
   * For example: const { a, b } = container;
   * @param dependencyName
   */
  public get<Name extends keyof ContainerResolvers>(
    dependencyName: Name,
  ): ContainerResolvers[Name] {
    if (this.resolvedDependencies[dependencyName] !== undefined) {
      return this.resolvedDependencies[dependencyName];
    }

    const resolver = this.resolvers[dependencyName];
    if (!resolver) {
      throw new DependencyIsMissingError(dependencyName as string);
    }

    this.resolvedDependencies[dependencyName] = resolver(this.context);

    return this.resolvedDependencies[dependencyName];
  }

  /**
   * Checks if dependency with given name exists
   * @param name
   */
  public has(name: string): boolean {
    return Object.hasOwn(this.resolvers, name);
  }

  public hasResolvedDependency(name: string): boolean {
    return Object.hasOwn(this.resolvedDependencies, name);
  }

  /**
   * Merges other containers into this one. Resolved dependencies are merged as well.
   *
   * Accepts any number of containers, so a set of independently built modules can be
   * combined in a single call:
   *
   * base.merge(repositories, services, controllers)
   *
   * Combining modules this way is also much cheaper to type-check than one long
   * `add` chain — see docs/type-performance-plan.md.
   *
   * When several containers define the same name the last one wins at runtime, including over
   * an already-resolved value. The types intersect rather than overwrite, so the same name with
   * two different types resolves to `never` rather than the later type.
   *
   * This mutates and returns `this`; use `clone()` or the static `DIContainer.compose()`
   * when a separate instance is required.
   * @param containers
   */
  public merge<T extends readonly ContainerLike[]>(
    ...containers: T
  ): IDIContainer<ContainerResolvers & MergedResolvers<T>> {
    for (const otherContainer of containers) {
      const { resolvedDependencies: newResolvedDependencies, resolvers: newResolvers } = (
        otherContainer as DIContainer<ResolvedDependencies>
      ).export();

      // A replaced resolver must not keep the value the previous one produced — the same
      // eviction `update()` performs. Only the overriding container's own cache may survive,
      // so a name it re-registers without having resolved yet has to lose the old value;
      // otherwise `merge`/`compose` return the earlier container's instance from a resolver
      // that no longer exists, silently contradicting last-writer-wins.
      for (const name of Object.keys(newResolvers)) {
        if (!Object.hasOwn(newResolvedDependencies, name)) {
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          delete this.resolvedDependencies[name as keyof ContainerResolvers];
        }
      }

      this.resolvers = {
        ...this.resolvers,
        ...newResolvers,
      };

      this.resolvedDependencies = {
        ...this.resolvedDependencies,
        ...newResolvedDependencies,
      };
    }

    for (const property of Object.keys(this.resolvers)) {
      this.addContainerProperty(property);
    }

    return this as unknown as IDIContainer<ContainerResolvers & MergedResolvers<T>>;
  }

  /**
   * Updates existing dependency resolver. If dependency with given name does not exist it will throw an error.
   * In most cases you don't need to override dependencies and should use add method instead. This approach will
   * help you to avoid overriding dependencies by mistake.
   *
   * You may want to override dependency if you want to mock it in tests.
   * @param name
   * @param resolver
   */
  public update<N extends keyof ContainerResolvers, V>(
    name: StringLiteral<N>,
    resolver: Factory<ContainerResolvers, V>,
  ): IDIContainer<
    {
      [n in N]: V;
    } & {
      [P in Exclude<keyof ContainerResolvers, N>]: ContainerResolvers[P];
    }
  > {
    if (containerMethods.has(name)) {
      throw new ForbiddenNameError(name);
    }

    if (!this.has(name)) {
      throw new DependencyIsMissingError(name);
    }

    this.setValue(name, resolver);
    if (Object.hasOwn(this.resolvedDependencies, name)) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete this.resolvedDependencies[name];
    }

    return this as unknown as IDIContainer<
      {
        [n in N]: V;
      } & {
        [P in Exclude<keyof ContainerResolvers, N>]: ContainerResolvers[P];
      }
    >;
  }

  protected setResolvers<CR extends ResolvedDependencies>(
    resolvers: Resolvers<CR>,
    resolvedDependencies: {
      [name in keyof CR]: ResolvedDependencyValue;
    },
  ) {
    if (Object.keys(this.resolvers).length !== 0) {
      throw new Error('Cannot set resolved dependencies after resolvers are defined');
    }

    // @ts-expect-error - we are setting resolvers
    this.resolvers = resolvers;
    // @ts-expect-error - we are setting resolvedDependencies
    this.resolvedDependencies = {
      ...resolvedDependencies,
    };
    for (const property of Object.keys(this.resolvers)) {
      this.addContainerProperty(property);
    }
  }

  private addContainerProperty(name: string) {
    // eslint-disable-next-line unicorn/no-this-assignment, @typescript-eslint/no-this-alias, consistent-this
    let updatedObject = this;
    if (!Object.hasOwn(this, name)) {
      updatedObject = Object.defineProperty(this, name, {
        get() {
          return this.get(name);
        },
      });
    }

    return updatedObject;
  }

  /**
   * Sets value to the container
   */
  private setValue(name: string, resolver: Factory<ContainerResolvers>): void {
    this.resolvers = {
      ...this.resolvers,
      [name]: resolver,
    };

    this.addContainerProperty(name);
  }
}

class ClonedDiContainer<
  ContainerResolvers extends ResolvedDependencies = {},
> extends DIContainer<ContainerResolvers> {
  public constructor(
    resolvers: Resolvers<ContainerResolvers>,
    resolvedDependencies: {
      [name in keyof ContainerResolvers]: ResolvedDependencyValue;
    },
  ) {
    super();
    this.setResolvers(resolvers, resolvedDependencies);
  }
}
