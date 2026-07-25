import { type DIContainer } from './DIContainer.js';

/**
 * Anything that can be composed/merged: a raw container instance or one that has
 * already been widened by `add` (which returns `IDIContainer`).
 */
export type ContainerLike<R extends ResolvedDependencies = ResolvedDependencies> =
  | DIContainer<R>
  | IDIContainer<R>;

export type DenyInputKeys<T, Disallowed> = T & (T extends Disallowed ? never : T);

export type Factory<
  ContainerResolvers extends ResolvedDependencies,
  Value = ResolvedDependencyValue,
> = (resolvers: ContainerResolvers) => Value;

export type IDIContainer<ContainerResolvers extends ResolvedDependencies = {}> =
  ContainerResolvers & {
    add: <N extends string, V>(
      name: StringLiteral<DenyInputKeys<N, keyof ContainerResolvers>>,
      resolver: Factory<ContainerResolvers, V>,
    ) => IDIContainer<ContainerResolvers & { [n in N]: V }>;
    clone: () => IDIContainer<ContainerResolvers>;
    extend: <E extends (container: IDIContainer<ContainerResolvers>) => IDIContainer>(
      f: E,
    ) => ReturnType<E>;
    get: <Name extends keyof ContainerResolvers>(dependencyName: Name) => ContainerResolvers[Name];
    has: (name: string) => boolean;
    hasResolvedDependency: (name: string) => boolean;
    merge: <T extends readonly ContainerLike[]>(
      ...containers: T
    ) => IDIContainer<ContainerResolvers & MergedResolvers<T>>;
    update: <N extends keyof ContainerResolvers, V>(
      name: StringLiteral<N>,
      resolver: Factory<ContainerResolvers, V>,
    ) => IDIContainer<
      {
        [n in N]: V;
      } & { [P in Exclude<keyof ContainerResolvers, N>]: ContainerResolvers[P] }
    >;
  };

/**
 * Collapses the resolver maps of a tuple of containers into a single map.
 *
 * Uses a union-to-intersection fold rather than a recursive tuple walk: a
 * recursive fold trips TypeScript's instantiation depth limiter (TS2589) once a
 * few dozen containers are combined, which silently degrades inference.
 */
export type MergedResolvers<T extends readonly unknown[]> =
  UnionToIntersection<ResolversOf<T[number]>> extends infer Merged
    ? Merged extends ResolvedDependencies
      ? Merged
      : {}
    : {};

export type ResolvedDependencies = {
  [k: string]: ResolvedDependencyValue;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ResolvedDependencyValue = any;

export type Resolvers<CR extends ResolvedDependencies> = {
  [k in keyof CR]?: Factory<CR>;
};

/**
 * Extracts the resolver map from a container type. The class branch has to come
 * first: a `DIContainer` instance also structurally matches `IDIContainer`.
 */
export type ResolversOf<C> =
  C extends DIContainer<infer R> ? R : C extends IDIContainer<infer R> ? R : never;

/**
 * Gives a built container a name that survives into hovers and error messages.
 *
 * `typeof container` and `ReturnType<typeof configureDI>` both resolve to a type
 * that already carries its own name, so TypeScript prints the whole resolver
 * intersection instead of the alias — unreadable once a container has more than a
 * handful of dependencies. Wrapping the container in this helper produces a fresh
 * alias, so diagnostics print `AppContainer` rather than
 * `IDIContainer<{ a: … } & { b: … } & …>`.
 *
 * export type AppContainer = SealedContainer<typeof container>;
 *
 * This is an ergonomic wrapper, not a performance one: resolving a container type
 * in a consuming file is already cheap, and naming it costs marginally more.
 * The dependency types themselves are unchanged.
 */
export type SealedContainer<C> = IDIContainer<ResolversOf<C>>;

export type StringLiteral<T> = T extends string ? (string extends T ? never : T) : never;

export type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (
  k: infer I,
) => void
  ? I
  : never;
