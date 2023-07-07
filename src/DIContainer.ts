import { DependencyIsMissingError } from "./errors";

type Factory<T extends DIContainer> = (container: T) => any;

type ResolvedDependencies = {
  [k: string]: any;
};

type Resolvers<CR extends ResolvedDependencies, T extends DIContainer<CR>> = {
  [k in keyof CR]?: Factory<DIContainer<T>>;
};

type StringLiteral<T> = T extends string
  ? string extends T
    ? never
    : T
  : never;

export default class DIContainer<
  ContainerResolvers extends ResolvedDependencies = {},
> {
  private resolvers: Resolvers<
    ContainerResolvers,
    DIContainer<ContainerResolvers>
  > = {};

  private resolvedDependencies: {
    [name in keyof ContainerResolvers]?: any;
  } = {};

  public add<
    N extends string,
    R extends Factory<DIContainer<ContainerResolvers>>,
  >(
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
      this.resolvedDependencies[dependencyName] = resolver(this);
    } else {
      this.resolvedDependencies[dependencyName] = resolver;
    }

    return this.resolvedDependencies[dependencyName];
  }
}
