import { type DIContainer } from './DIContainer.js';

export type DenyInputKeys<T, Disallowed> = T &
  (T extends Disallowed ? never : T);

export type Factory<ContainerResolvers extends ResolvedDependencies> = (
  resolvers: ContainerResolvers,
) => ResolvedDependencyValue;

export type IDIContainer<ContainerResolvers extends ResolvedDependencies = {}> =
  ContainerResolvers & {
    add: <N extends string, R extends Factory<ContainerResolvers>>(
      name: StringLiteral<DenyInputKeys<N, keyof ContainerResolvers>>,
      resolver: R,
    ) => IDIContainer<ContainerResolvers & { [n in N]: ReturnType<R> }>;
    extend: <
      E extends (container: IDIContainer<ContainerResolvers>) => IDIContainer,
    >(
      f: E,
    ) => ReturnType<E>;
    get: <Name extends keyof ContainerResolvers>(
      dependencyName: Name,
    ) => ContainerResolvers[Name];
    has: (name: string) => boolean;
    merge: <OtherContainerResolvers extends ResolvedDependencies>(
      container:
        | DIContainer<OtherContainerResolvers>
        | IDIContainer<OtherContainerResolvers>,
    ) => IDIContainer<ContainerResolvers & OtherContainerResolvers>;
    update: <
      N extends keyof ContainerResolvers,
      R extends Factory<ContainerResolvers>,
    >(
      name: StringLiteral<N>,
      resolver: R,
    ) => IDIContainer<
      {
        [n in N]: ReturnType<R>;
      } & { [P in Exclude<keyof ContainerResolvers, N>]: ContainerResolvers[P] }
    >;
  };

export type ResolvedDependencies = {
  [k: string]: ResolvedDependencyValue;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ResolvedDependencyValue = any;

export type Resolvers<CR extends ResolvedDependencies> = {
  [k in keyof CR]?: Factory<CR>;
};

export type StringLiteral<T> = T extends string
  ? string extends T
    ? never
    : T
  : never;
