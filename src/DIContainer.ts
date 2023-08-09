import { DependencyIsMissingError } from "./errors";

type ContainerGetter<ContainerResolvers extends ResolvedDependencies> = <
  Name extends keyof ContainerResolvers,
>(
  dependencyName: Name,
) => ContainerResolvers[Name];

type Factory<ContainerResolvers extends ResolvedDependencies> = (
  get: ContainerGetter<ContainerResolvers>,
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

export default class DIContainer<
  ContainerResolvers extends ResolvedDependencies = {},
> {
  private resolvers: Resolvers<ContainerResolvers> = {};

  private resolvedDependencies: {
    [name in keyof ContainerResolvers]?: any;
  } = {};

  public add<N extends string, R extends Factory<ContainerResolvers>>(
    name: StringLiteral<N>,
    resolver: R,
  ): DIContainer<
    ContainerResolvers & {
      [n in N]: ReturnType<R>;
    }
  > {
    this.resolvers = {
      ...this.resolvers,
      [name]: resolver,
    };
    return this;
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
    if (typeof resolver === "function") {
      this.resolvedDependencies[dependencyName] = resolver(this.get.bind(this));
    } else {
      this.resolvedDependencies[dependencyName] = resolver;
    }

    return this.resolvedDependencies[dependencyName];
  }

  public extend<E extends (container: DIContainer<ContainerResolvers>) => any>(
    f: E,
  ): ReturnType<E> {
    return f(this);
  }
}
