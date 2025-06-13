import {
  DenyOverrideDependencyError,
  DependencyIsMissingError,
  ForbiddenNameError,
  IncorrectInvocationError,
} from './errors.js';
import {
  type DenyInputKeys,
  type Factory,
  type IDIContainer,
  type ResolvedDependencies,
  type ResolvedDependencyValue,
  type Resolvers,
  type StringLiteral,
} from './types.js';

const containerMethods = ['add', 'get', 'extend', 'update', 'merge', 'clone'];

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
        const propertyName =
          property.toString() as keyof DIContainer<ContainerResolvers>;
        if (containerMethods.includes(propertyName)) {
          throw new IncorrectInvocationError();
        }

        return target[propertyName];
      },
    }) as unknown as ContainerResolvers;
  }

  /**
   * Adds new dependency resolver to the container. If dependency with given name already exists it will throw an error.
   * Use update method instead. It will override existing dependency.
   * @param name
   * @param resolver
   */
  public add<N extends string, R extends Factory<ContainerResolvers>>(
    name: StringLiteral<DenyInputKeys<N, keyof ContainerResolvers>>,
    resolver: R,
  ): IDIContainer<ContainerResolvers & { [n in N]: ReturnType<R> }> {
    if (containerMethods.includes(name)) {
      throw new ForbiddenNameError(name);
    }

    if (this.has(name)) {
      throw new DenyOverrideDependencyError(name);
    }

    this.setValue(name, resolver);

    return this as IDIContainer<
      ContainerResolvers & { [n in N]: ReturnType<R> }
    > &
      this;
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
    const {
      resolvedDependencies: newresolvedDependencies,
      resolvers: newResolvers,
    } = this.export();
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    const newContainer = new ClonedDiContainer(
      newResolvers,
      newresolvedDependencies,
    );

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
  public extend<
    E extends (container: IDIContainer<ContainerResolvers>) => IDIContainer,
  >(diConfigurationFactory: E): ReturnType<E> {
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
    return Object.prototype.hasOwnProperty.call(this.resolvers, name);
  }

  /**
   * Merges two containers. It will return a new container with merged resolvers. Resolved dependencies will be merged as well.
   * @param otherContainer
   */
  public merge<OtherContainerResolvers extends ResolvedDependencies>(
    otherContainer: DIContainer<OtherContainerResolvers>,
  ): IDIContainer<ContainerResolvers & OtherContainerResolvers> {
    const {
      resolvedDependencies: newresolvedDependencies,
      resolvers: newResolvers,
    } = otherContainer.export();

    const resolvers = {
      ...this.resolvers,
      ...newResolvers,
    };

    const resolvedDependencies = {
      ...this.resolvedDependencies,
      ...newresolvedDependencies,
    };

    this.resolvers = resolvers;
    this.resolvedDependencies = {
      ...resolvedDependencies,
    };
    for (const property of Object.keys(this.resolvers)) {
      this.addContainerProperty(property);
    }

    return this as unknown as IDIContainer<
      ContainerResolvers & OtherContainerResolvers
    >;
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
  public update<
    N extends keyof ContainerResolvers,
    R extends Factory<ContainerResolvers>,
  >(
    name: StringLiteral<N>,
    resolver: R,
  ): IDIContainer<
    {
      [n in N]: ReturnType<R>;
    } & {
      [P in Exclude<keyof ContainerResolvers, N>]: ContainerResolvers[P];
    }
  > {
    if (containerMethods.includes(name)) {
      throw new ForbiddenNameError(name);
    }

    if (!this.has(name)) {
      throw new DependencyIsMissingError(name);
    }

    this.setValue(name, resolver);
    if (Object.prototype.hasOwnProperty.call(this.resolvedDependencies, name)) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete this.resolvedDependencies[name];
    }

    return this as unknown as IDIContainer<
      {
        [n in N]: ReturnType<R>;
      } & {
        [P in Exclude<keyof ContainerResolvers, N>]: ContainerResolvers[P];
      }
    > &
      this;
  }

  protected setResolvers<CR extends ResolvedDependencies>(
    resolvers: Resolvers<CR>,
    resolvedDependencies: {
      [name in keyof CR]: ResolvedDependencyValue;
    },
  ) {
    if (Object.keys(this.resolvers).length !== 0) {
      throw new Error(
        'Cannot set resolved dependencies after resolvers are defined',
      );
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
    if (!Object.prototype.hasOwnProperty.call(this, name)) {
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
