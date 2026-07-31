# Integrating RSDI — guide for AI agents

> **Audience:** AI coding agents wiring RSDI into an application. Humans are welcome, but this is
> written to be read start-to-finish by a model before writing container code.
>
> For contributing to RSDI itself, see `AGENTS.md` in the repository root instead.

RSDI is a dependency injection container with no decorators and no `reflect-metadata`. Dependencies
are registered as factory functions and resolved lazily; the container's _type_ is the map of
everything registered, so `container.userService` is typed as `UserService` and a typo is a compile
error.

---

## Quick reference

```ts
import { DIContainer, type IDIContainer, type SealedContainer } from 'rsdi';

const container = new DIContainer()
  .add('config', () => loadConfig())
  .add('db', ({ config }) => new Db(config.dbUrl))
  .add('userRepository', ({ db }) => new UserRepository(db));

container.userRepository; // UserRepository — resolved on first access, then cached
container.get('userRepository'); // identical
```

| Call                           | Returns                     | Notes                                                        |
| ------------------------------ | --------------------------- | ------------------------------------------------------------ |
| `new DIContainer()`            | empty container             | Constructor takes **no** arguments                           |
| `.add(name, factory)`          | container + that name       | **Throws** if `name` already exists                          |
| `.get(name)`                   | the dependency              | Same as property access; throws if not registered            |
| `.update(name, factory)`       | container, name retyped     | **Throws** if `name` does not exist; evicts the cached value |
| `.has(name)`                   | `boolean`                   | Is a resolver registered?                                    |
| `.hasResolvedDependency(name)` | `boolean`                   | Has it been _resolved_ yet?                                  |
| `.merge(...containers)`        | **mutated** `this`          | Later containers win on duplicate names                      |
| `DIContainer.compose(...cs)`   | a **new** container         | Static; inputs untouched                                     |
| `.clone()`                     | a new, independent instance | Copies resolvers and already-resolved values                 |
| `.extend(fn)`                  | whatever `fn` returns       | For layered modules that need earlier types                  |

Install: `npm install rsdi` (or `pnpm add rsdi`). The package is **ESM-only**; `engines.node` is
`>=16.9.0`. A CommonJS project needs Node 20.19+/22.12+ to `require()` it, and TypeScript consumers
need `"module": "nodenext"` — on `Node16` you get `TS1479`.

---

## Rules that will bite you

These are the mistakes worth checking for explicitly. Each one is real: they either fail to compile
or fail at runtime.

### 1. The second argument is a **function**, always

```ts
const connection = await createConnection();

container.add('db', connection); // ✗ TS2345, and at runtime: "resolver is not a function"
container.add('db', () => connection); // ✓
```

Registering a value directly is the single most common mistake. `add` stores the argument as a
resolver and calls it on first access.

### 2. Names must be inline string literals

The duplicate-name guard works on literal types, so a widened `string` resolves to `never`:

```ts
const name = 'db';
container.add(name, () => new Db()); // ✓ `const` keeps the literal type

let key = 'db';
container.add(key, () => new Db()); // ✗ `key` is `string` → parameter type is `never`
```

If you need dynamic registration, you are outside what the types can express — reconsider the design
rather than casting.

### 3. These names are reserved

`add`, `clone`, `extend`, `get`, `has`, `hasResolvedDependency`, `merge`, `update`.

A dependency named after a container method would shadow it, so it throws `ForbiddenNameError` at
runtime and is rejected at compile time. `compose` is _not_ reserved — it is a static method, so it
never collides with an instance property.

### 4. `add` refuses to overwrite; `update` requires an existing name

```ts
container.add('db', () => new Db()); // second time: DenyOverrideDependencyError
container.update('db', () => new FakeDb()); // ✓ replaces, and evicts the cached instance
container.update('nope', () => 1); // DependencyIsMissingError
```

This is deliberate — accidental redefinition is a common DI bug. Use `update` only when you mean it
(mostly test mocking).

### 5. `merge` mutates, `compose` does not

```ts
base.merge(repositories, services); // mutates and returns `base`
DIContainer.compose(repositories, services); // new container; inputs untouched
base.clone(); // independent copy
```

If you need the original container left alone, use `compose` or `clone`.

### 6. No async factories

Factories are synchronous. Resolve async resources _before_ building the container:

```ts
const connection = await createConnection(); // await first
const container = new DIContainer().add('db', () => connection);
```

See [async factory resolvers](https://github.com/radzserg/rsdi/blob/main/docs/async_factory_resolver.md)
for the reasoning.

### 7. Don't pass the container through your application

Resolve at the composition root (entry point, router setup) and hand components their dependencies.
Threading the container into business logic recreates the coupling DI is meant to remove — see
[DI container vs context](https://github.com/radzserg/rsdi/blob/main/docs/context_vs_container.md).

---

## Wiring a real application

**Split the graph into module files and combine them.** This is the recommended layout, and past a
few dozen dependencies it is not optional — a single `.add()` chain costs **O(N²)** to type-check.
Measured on TypeScript 7: 1600 dependencies in one chain takes **90 seconds** to check; the same
graph as 80 modules combined with `compose` takes **0.9 seconds**.

**Module size is not the lever — wiring the whole graph as one chain is.** A module of **64** `add`
calls layered on a 300-key container type-checks comfortably (CI guards exactly that shape), and
splitting it further barely pays: the same 64 dependencies cost 38.1K instantiations as one module
and 36.3K split four ways, under 5%. So treat ~64 as a comfortable ceiling and choose module size
for readability — long modules are harder to read long before they are hard to compile.

```ts
// di/repositories.ts
import { DIContainer } from 'rsdi';

export const repositories = new DIContainer()
  .add('userRepository', () => new UserRepository())
  .add('orderRepository', () => new OrderRepository());
```

```ts
// di/services.ts — declares what it expects the composed container to provide
import { DIContainer } from 'rsdi';

export const services = new DIContainer<{ userRepository: UserRepository }>()
  .add('mailer', () => new Mailer())
  .add('userService', ({ userRepository }) => new UserService(userRepository));
```

```ts
// di/index.ts
import { DIContainer, type SealedContainer } from 'rsdi';
import { repositories } from './repositories.js';
import { services } from './services.js';

export const container = DIContainer.compose(repositories, services);
export type AppContainer = SealedContainer<typeof container>;
```

Resolution happens lazily against the **composed** container, so `userService` resolves
`userRepository` from the other module at runtime. Only the _types_ of a module are limited to what
that module declares — hence the `new DIContainer<{ userRepository: UserRepository }>()` annotation
above.

### Choosing how to combine modules

| Situation                                                  | Use                                    |
| ---------------------------------------------------------- | -------------------------------------- |
| Modules are independent, or declare their own requirements | `DIContainer.compose(a, b, c)`         |
| A module needs earlier modules' types while you write it   | `.extend(fn)`                          |
| You already have a base container to fold others into      | `base.merge(a, b, c)` (mutates `base`) |

`extend` passes the accumulated container to a function, so the next module sees real types without
annotating anything:

```ts
// di/validators.ts
import { type IDIContainer } from 'rsdi';

export const addValidators = (container: IDIContainer<{ userRepository: UserRepository }>) =>
  container.add('userValidator', ({ userRepository }) => new UserValidator(userRepository));
```

```ts
export const container = DIContainer.compose(repositories).extend(addValidators);
```

Both patterns scale — measured at 800 dependencies, `compose` and `extend` are within the same order
of magnitude of each other and ~10× cheaper than one flat chain.

### What actually makes it cheap: isolation, not splitting

This is the part that decides whether the restructuring pays off, and it is easy to get wrong.

**A module is cheap when it is checked against only what it declares it consumes**, not when it
merely lives in its own file. Splitting a flat chain into `.extend()` modules that thread the whole
accumulated container through each step measures _no better than the flat chain_ — a production
application with ~340 dependencies measured 3.41M instantiations flat and 3.48M after splitting that
way. Giving each leaf an explicit consumed-type seed and combining with `compose` is what paid: the
five leaf modules cost **68.7 ms** to check combined, versus **924.8 ms** as `extend` modules
threading the accumulated type — **~13× cheaper**, because each leaf is checked against the handful
of keys it declares instead of a ~300-key map.

So: declare the seed.

```ts
// ✓ an explicit interface of exactly what this module consumes
export const services = new DIContainer<{ userRepository: UserRepository; mailer: Mailer }>().add(
  'userService',
  ({ userRepository, mailer }) => new UserService(userRepository, mailer),
);
```

```ts
// ✗ Pick<> from the full container type — forces TypeScript to normalise the entire
//   accumulated map just to select two keys, and couples the module to the whole graph
export const services = new DIContainer<Pick<FullContainer, 'userRepository' | 'mailer'>>().add(
  'userService',
  ({ userRepository, mailer }) => new UserService(userRepository, mailer),
);
```

The explicit interface was both faster and decoupled in the same measurement.

### Don't chain `ReturnType<typeof previousModule>`

For a long `.extend()` chain it is tempting to skip the boilerplate and let each module infer its
input from the previous module's output:

```ts
// ✗ do not do this down a long chain
import type { addRepositories } from './repositories.js';
export const addServices = (c: ReturnType<typeof addRepositories>) => c.add(/* … */);
```

It looks better — no type to keep in sync, and the input cannot drift from the actual output. But it
removes the boundary that keeps instantiation depth bounded: each module's type stays nested inside
the previous one, so depth accumulates across the entire chain and your build becomes coupled to
RSDI's internal instantiation depth. In the same application this turned a clean build into **208
errors**, with the container collapsing to `never` and every `add` name reporting
`parameter of type 'never'`.

Give each module an explicit named return type instead — it collapses the accumulated type into a
flat named boundary at every step:

```ts
// ✓ explicit named boundary
export type DIWithRepositories = IDIContainer<{ userRepository: UserRepository }>;
export const addRepositories = (c: IDIContainer<{ db: Db }>): DIWithRepositories =>
  c.add('userRepository', ({ db }) => new UserRepository(db));
```

If the full boilerplate is too much, a `SealedContainer` boundary every few modules gets most of the
benefit.

### Naming the container type

`typeof container` and `ReturnType<typeof configureDI>` both expand in diagnostics, so a large
container produces errors like `IDIContainer<{ a: string; } & { b: number; } & …>`. Wrapping in
`SealedContainer` gives TypeScript a name to print instead:

```ts
export type AppContainer = SealedContainer<typeof container>;

export function configureRouter(app: Express, container: AppContainer) {
  const { userController } = container; // still exactly typed
}
```

This is for readability only — it does not speed anything up. Referring to a container from another
file is already cheap.

---

## Testing

Build the real container, then `update` the pieces you want to fake. Use `clone` when a test must not
affect others:

```ts
const container = configureDI().clone();
container.update('userRepository', () => new InMemoryUserRepository());

expect(container.userService.register(data)).resolves.toBeDefined();
```

`update` evicts any cached instance, so dependencies resolved after it see the replacement. Anything
resolved _before_ it keeps the old instance it was constructed with.

Chaining overrides is fine, however many there are:

```ts
const container = configureDI()
  .clone()
  .update('userRepository', () => fakeUserRepository)
  .update('mailer', () => fakeMailer);
// …60 more, still no TS2589
```

A fake that has the **same type** as the dependency it replaces — which is what a test double
normally is — leaves the container type untouched, so the chain costs the same at 60 links as at
two. Only an override that deliberately changes a dependency's type has to rewrite the map, and
those are rare enough to chain a handful of times.

Before this was true, long override chains hit `TS2589` and harnesses worked around it by breaking
inference with `const container: any = …`. **Don't do that** — it silently gives up every dependency
type in the file, which is most of what the container is for.

---

## Decoding errors

| Symptom                                                                 | Cause                                                        | Fix                                                                                                       |
| ----------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `Argument of type '"x"' is not assignable to parameter of type 'never'` | Name already registered, or not a literal                    | Use `update`, or make the name a literal                                                                  |
| `Property 'x' does not exist on type 'IDIContainer<…>'`                 | Not registered, or module not composed in                    | Register it, or add its module to `compose`                                                               |
| `Argument of type '{…}' is not assignable to … 'Factory<…>'`            | Passed a value instead of a factory                          | Wrap it: `() => value`                                                                                    |
| `ForbiddenNameError`                                                    | Used a reserved method name                                  | Rename the dependency                                                                                     |
| `DenyOverrideDependencyError`                                           | `add` on an existing name                                    | Use `update`                                                                                              |
| `DependencyIsMissingError`                                              | `get`/`update` on an unknown name                            | Register it first                                                                                         |
| `TypeError: resolver is not a function`                                 | Registered a value, not a factory                            | Wrap it: `() => value`                                                                                    |
| Editor sluggish in the container file                                   | One long `.add()` chain (O(N²))                              | Split into modules and `compose`                                                                          |
| `TS2589: Type instantiation is excessively deep`                        | Depth accumulated across a long chain                        | Give modules explicit named return types; stop chaining `ReturnType<typeof previousModule>`               |
| `TS2589` on a chain of `update()` calls                                 | Overrides that change a dependency's type rewrite the map    | Give the fake the same type as the real dependency (`as` the interface); never reach for `container: any` |
| Every `add` name reports `parameter of type 'never'`                    | The container type collapsed, usually the same depth problem | Same fix — check the module boundaries first                                                              |
| Splitting into modules didn't speed anything up                         | Modules thread the whole accumulated type                    | Give each a declared consumed-type seed and `compose`                                                     |

---

## Checklist before finishing

- [ ] Every `add`/`update` second argument is a function.
- [ ] No dependency uses a reserved name.
- [ ] Async resources are awaited before the container is built.
- [ ] The whole graph is not one `.add()` chain — it is split into modules and composed. Up to ~64
      dependencies in a single module is fine; below that, size is a readability choice.
- [ ] Each module declares the dependencies it consumes as an explicit interface — not
      `Pick<FullContainer, …>`, and not by inferring from the previous module with `ReturnType`.
- [ ] Long `.extend()` chains give each module an explicit named return type.
- [ ] The container is resolved at the composition root, not passed through the app.
- [ ] `add` used for new names, `update` only for deliberate replacement.
- [ ] The project type-checks (`tsc --noEmit`) — RSDI's guarantees are compile-time.
