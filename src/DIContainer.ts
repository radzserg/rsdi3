import {
  DenyOverrideDependencyError,
  DependencyIsMissingError,
  ForbiddenNameError,
  IncorrectInvocationError,
} from "./errors.js";
import {
  DenyInputKeys,
  Factory,
  IDIContainer,
  ResolvedDependencies,
  Resolvers,
  StringLiteral,
} from "./types";

const containerMethods = ["add", "get", "extend", "update"];

/**
 * Dependency injection container
 */
export class DIContainer<ContainerResolvers extends ResolvedDependencies = {}> {
  private resolvers: Resolvers<ContainerResolvers> = {};

  private resolvedDependencies: {
    [name in keyof ContainerResolvers]?: any;
  } = {};

  private context: ContainerResolvers = {} as ContainerResolvers;

  /**
   * Adds new dependency resolver to the container. If dependency with given name already exists it will throw an error.
   * Use update method instead. It will override existing dependency.
   *
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

    return this.setValue(name, resolver) as this &
      IDIContainer<ContainerResolvers & { [n in N]: ReturnType<R> }>;
  }

  /**
   * Updates existing dependency resolver. If dependency with given name does not exist it will throw an error.
   * In most cases you don't need to override dependencies and should use add method instead. This approach will
   * help you to avoid overriding dependencies by mistake.
   *
   * You may want to override dependency if you want to mock it in tests.
   *
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
      [P in Exclude<keyof ContainerResolvers, N>]: ContainerResolvers[P];
    } & {
      [n in N]: ReturnType<R>;
    }
  > {
    if (containerMethods.includes(name)) {
      throw new ForbiddenNameError(name);
    }

    if (!this.has(name)) {
      throw new DependencyIsMissingError(name);
    }

    return this.setValue(name, resolver) as this &
      IDIContainer<
        {
          [P in Exclude<keyof ContainerResolvers, N>]: ContainerResolvers[P];
        } & {
          [n in N]: ReturnType<R>;
        }
      >;
  }

  /**
   * Checks if dependency with given name exists
   * @param name
   */
  public has(name: string): boolean {
    return this.resolvers.hasOwnProperty(name);
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
   * Extends container with given function. It will pass container as an argument to the function.
   * Function should return new container with extended resolvers.
   * It is useful when you want to split your container into multiple files.
   * You can create a file with resolvers and extend container with it.
   * You can also use it to create multiple containers with different resolvers.
   *
   * For example:
   *
   *     const container = new DIContainer()
   *       .extend(addValidators)
   *
   *     export type DIWithValidators = ReturnType<typeof addValidators>;
   *     export const addValidators = (container: DIWithDataAccessors) => {
   *       return container
   *         .add('myValidatorA', ({ a, b, c }) => new MyValidatorA(a, b, c))
   *         .add('myValidatorB', ({ a, b, c }) => new MyValidatorB(a, b, c));
   *     };
   *
   * @param f
   */
  public extend<E extends (container: IDIContainer<ContainerResolvers>) => any>(
    f: E,
  ): ReturnType<E> {
    return f(this.toContainer());
  }

  private setValue(name: string, resolver: Factory<ContainerResolvers>) {
    this.resolvers = {
      ...this.resolvers,
      [name]: resolver,
    };

    let updatedObject = this;
    if (!this.hasOwnProperty(name)) {
      updatedObject = Object.defineProperty(this, name, {
        get() {
          return this.get(name);
        },
      });
    }

    this.context = new Proxy(this, {
      get(target, property) {
        if (containerMethods.includes(property.toString())) {
          throw new IncorrectInvocationError();
        }
        // @ts-ignore
        return target[property];
      },
    }) as unknown as ContainerResolvers;

    return updatedObject;
  }

  private toContainer(): IDIContainer<ContainerResolvers> {
    return this as unknown as IDIContainer<ContainerResolvers>;
  }
}
