import { DIContainer } from "./DIContainer.js";

export type Factory<ContainerResolvers extends ResolvedDependencies> = (
  resolvers: ContainerResolvers,
) => any;

export type ResolvedDependencies = {
  [k: string]: any;
};

export type DenyInputKeys<T, Disallowed> = T & (T extends Disallowed ? never : T);

export type Resolvers<CR extends ResolvedDependencies> = {
  [k in keyof CR]?: Factory<CR>;
};

export type StringLiteral<T> = T extends string
  ? string extends T
    ? never
    : T
  : never;

export type Container<ContainerResolvers extends ResolvedDependencies> =
  DIContainer<ContainerResolvers> & ContainerResolvers;