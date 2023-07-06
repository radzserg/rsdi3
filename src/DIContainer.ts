import { DependencyIsMissingError } from "./errors";

type Factory<T extends DIContainer> = (container: T) => any;

type ResolvedDependencies = {
  [k: string]: any;
};

type Resolvers<CR extends ResolvedDependencies, T extends DIContainer<CR>> = {
  [k in keyof CR]?: Factory<DIContainer<T>>;
};

export default class DIContainer<
  ContainerResolvers extends ResolvedDependencies = {},
> {

  private resolvedDependencies: {
    [name in keyof ContainerResolvers]?: any;
  } = {};

  public constructor(
    private readonly resolvers: Resolvers<ContainerResolvers, DIContainer<ContainerResolvers>> = {}
  ) {
  }

  public add<
    N extends string,
    R extends Factory<DIContainer<ContainerResolvers>>,
  >(name: N, resolver: R): DIContainer<ContainerResolvers & { [n in N]: R }> {
    const resolvers = {
      ...this.resolvers,
      [name]: resolver
    } as ContainerResolvers & { [n in N]: R };
    return new DIContainer(resolvers)
  }

  public get<Name extends keyof ContainerResolvers>(
    dependencyName: Name,
  ): ReturnType<ContainerResolvers[Name]> {
    if (this.resolvedDependencies[dependencyName] !== undefined) {
      return this.resolvedDependencies[dependencyName];
    }

    const resolver = this.resolvers[dependencyName];
    if (!resolver) {
      throw new DependencyIsMissingError(dependencyName as string);
    }
    this.resolvedDependencies[dependencyName] = resolver(this);

    return this.resolvedDependencies[dependencyName];
  }
}
