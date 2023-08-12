import { DependencyIsMissingError, ForbiddenNameError } from "./errors";

type Factory<ContainerResolvers extends ResolvedDependencies> = (
  resolvers: ContainerResolvers,
) => any;

type ResolvedDependencies = {
  [k: string]: any;
};

type Resolvers<CR extends ResolvedDependencies> = {
  [k in keyof CR]?: Factory<CR>;
};

type StringLiteral<T> = T extends string
  ? string extends T
    ? never
    : T
  : never;

type Container<ContainerResolvers extends ResolvedDependencies> =
  DIContainer<ContainerResolvers> & ContainerResolvers;

export default class DIContainer<
  ContainerResolvers extends ResolvedDependencies,
> {
  private resolvers: Resolvers<ContainerResolvers> = {};

  private resolvedDependencies: {
    [name in keyof ContainerResolvers]?: any;
  } = {};

  public add<N extends string, R extends Factory<ContainerResolvers>>(
    name: StringLiteral<N>,
    resolver: R,
  ): Container<ContainerResolvers & { [n in N]: ReturnType<R> }> {
    if (["add", "get", "extend"].includes(name)) {
      throw new ForbiddenNameError(name);
    }
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

    return updatedObject as this &
      DIContainer<ContainerResolvers & { [n in N]: ReturnType<R> }> &
      ContainerResolvers & { [n in N]: ReturnType<R> };
  }

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

    this.resolvedDependencies[dependencyName] = resolver(this.toContainer());

    return this.resolvedDependencies[dependencyName];
  }

  public extend<E extends (container: Container<ContainerResolvers>) => any>(
    f: E,
  ): ReturnType<E> {
    return f(this.toContainer());
  }

  private toContainer(): Container<ContainerResolvers> {
    return this as unknown as Container<ContainerResolvers>;
  }
}
