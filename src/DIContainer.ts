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
// though it is rarely used directly: it once broke every `merge`/`compose` with a `TypeError`,
// because `merge` called it on the containers passed to it. `merge` reads the protected maps
// directly now, so only a consumer's own call is at stake — still public API, so still reserved.
// Statics (`compose`) never live on the instance and are deliberately absent.
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
        // Indexing with the key as given: `toString()` here cost a call on every dependency a
        // factory destructures, and turned a symbol lookup into a miss under its description.
        return target[property as keyof DIContainer<ContainerResolvers>];
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
    // Handed the live maps on purpose — `setResolvers` is what copies them, and routing this
    // through `export()` would only allocate a second copy to throw away.
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    const newContainer = new ClonedDiContainer(
      this.resolvers,
      this.resolvedDependencies as { [name in keyof ContainerResolvers]: ResolvedDependencyValue },
    );

    return newContainer as DIContainer<ContainerResolvers>;
  }

  /**
   * Returns the container's resolvers and its already-resolved values.
   *
   * Both maps are copies. `add`, `update` and `merge` write into the internal maps in place, so
   * handing out the live objects would let a caller both observe registrations made after the
   * call and mutate the container by writing into what they were given. Nothing inside the class
   * goes through here — `clone` and `merge` read the protected maps directly — so the copy is
   * paid only by a consumer that asks for it.
   */
  public export(): ResolvedDependencies {
    return {
      resolvedDependencies: { ...this.resolvedDependencies },
      resolvers: { ...this.resolvers },
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
    const resolved = this.resolvedDependencies[dependencyName];
    if (resolved !== undefined) {
      return resolved;
    }

    const resolver = this.resolvers[dependencyName];
    if (!resolver) {
      throw new DependencyIsMissingError(dependencyName as string);
    }

    const value = resolver(this.context);
    this.resolvedDependencies[dependencyName] = value;

    return value;
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
    const ownResolvers = this.resolvers as Record<string, Factory<ContainerResolvers>>;
    const ownResolvedDependencies = this.resolvedDependencies as Record<
      string,
      ResolvedDependencyValue
    >;

    for (const otherContainer of containers) {
      // The protected maps directly, not `export()`: that copies now, and every name is copied
      // again into our own maps below — one throwaway map per merged container, for nothing.
      const { resolvedDependencies: newResolvedDependencies, resolvers: newResolvers } =
        otherContainer as DIContainer<ResolvedDependencies>;

      for (const name of Object.keys(newResolvers)) {
        // A replaced resolver must not keep the value the previous one produced — the same
        // eviction `update()` performs. Only the overriding container's own cache may survive,
        // so a name it re-registers without having resolved yet has to lose the old value;
        // otherwise `merge`/`compose` return the earlier container's instance from a resolver
        // that no longer exists, silently contradicting last-writer-wins.
        //
        // Our own cache is tested first so that merging into a container that has resolved
        // nothing — the `compose` case — issues no deletes at all.
        if (
          Object.hasOwn(this.resolvedDependencies, name) &&
          !Object.hasOwn(newResolvedDependencies, name)
        ) {
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          delete this.resolvedDependencies[name as keyof ContainerResolvers];
        }

        // Only the incoming names can be new, so this replaces a rescan of the whole merged map.
        this.addContainerProperty(name);

        // Writing into the map rather than rebuilding it per container is what keeps
        // `compose(...modules)` linear in total dependencies instead of quadratic.
        ownResolvers[name] = (newResolvers as Record<string, Factory<ContainerResolvers>>)[name];
      }

      for (const name of Object.keys(newResolvedDependencies)) {
        ownResolvedDependencies[name] = newResolvedDependencies[name];
      }
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

    // Both maps are copied, not adopted. `add` and `merge` write into them in place, so a clone
    // that kept its source's map would leak every later registration back into it.
    //
    // Entry by entry rather than by spread: these maps are built a key at a time, which leaves
    // them in V8's dictionary mode, and spreading one of those costs over twice what the loop does.
    const ownResolvers = this.resolvers as Record<string, Factory<ContainerResolvers>>;
    const source = resolvers as unknown as Record<string, Factory<ContainerResolvers>>;
    for (const name of Object.keys(source)) {
      ownResolvers[name] = source[name];
      this.addContainerProperty(name);
    }

    const ownResolvedDependencies = this.resolvedDependencies as Record<
      string,
      ResolvedDependencyValue
    >;
    for (const name of Object.keys(resolvedDependencies)) {
      ownResolvedDependencies[name] = resolvedDependencies[name];
    }
  }

  private addContainerProperty(name: string): void {
    if (Object.hasOwn(this, name)) {
      return;
    }

    Object.defineProperty(this, name, {
      get() {
        return this.get(name);
      },
    });
  }

  /**
   * Sets value to the container
   */
  private setValue(name: string, resolver: Factory<ContainerResolvers>): void {
    // Writing into the map rather than rebuilding it is what makes a chain of `add` calls linear
    // instead of quadratic. It is safe only because no two containers ever share a resolver map —
    // `setResolvers` copies what `clone()` hands it, which `clone.test.ts` pins.
    (this.resolvers as Record<string, Factory<ContainerResolvers>>)[name] = resolver;

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
