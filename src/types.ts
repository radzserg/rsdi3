export type Factory<ContainerResolvers extends ResolvedDependencies> = (
  resolvers: ContainerResolvers,
) => any;

export type ResolvedDependencies = {
  [k: string]: any;
};

export type DenyInputKeys<T, Disallowed> = T &
  (T extends Disallowed ? never : T);

export type Resolvers<CR extends ResolvedDependencies> = {
  [k in keyof CR]?: Factory<CR>;
};

export type StringLiteral<T> = T extends string
  ? string extends T
    ? never
    : T
  : never;

export type IDIContainer<ContainerResolvers extends ResolvedDependencies = {}> =
  ContainerResolvers & {
    add: <N extends string, R extends Factory<ContainerResolvers>>(
      name: StringLiteral<DenyInputKeys<N, keyof ContainerResolvers>>,
      resolver: R,
    ) => IDIContainer<ContainerResolvers & { [n in N]: ReturnType<R> }>;
    update: <
      N extends keyof ContainerResolvers,
      R extends Factory<ContainerResolvers>,
    >(
      name: StringLiteral<N>,
      resolver: R,
    ) => IDIContainer<
      // types are quite complex here, so we have to simplify them as much as possible.
      // do not use Omit here
      {
        [P in Exclude<keyof ContainerResolvers, N>]: ContainerResolvers[P];
      } & {
        [n in N]: ReturnType<R>;
      }
    >;
    has: (name: string) => boolean;
    extend: <E extends (container: IDIContainer<ContainerResolvers>) => any>(
      f: E,
    ) => ReturnType<E>;
    get: <Name extends keyof ContainerResolvers>(
      dependencyName: Name,
    ) => ContainerResolvers[Name];
  };
