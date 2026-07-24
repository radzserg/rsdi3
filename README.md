# RSDI - Simple & Strong-Type Dependency Injection Container

[![npm version](https://img.shields.io/npm/v/rsdi.svg)](https://www.npmjs.com/package/rsdi)
[![CI](https://github.com/radzserg/rsdi3/actions/workflows/lint.yml/badge.svg)](https://github.com/radzserg/rsdi3/actions/workflows/lint.yml)
[![license](https://img.shields.io/npm/l/rsdi.svg)](./LICENSE)

Manage your dependencies with ease and safety. RSDI is a minimal, powerful DI container with full TypeScript support — no decorators or metadata required.

- [Motivation](#motivation)
- [Features](#features)
- [Installation](#installation)
- [Best Use Cases](#best-use-cases)
- [Architecture](#architecture)
- [How to use](#how-to-use)
- [Strict types](#strict-types)
- [Advanced Usage](#advanced-usage)
  - [Extend](#extend)
  - [Merge](#merge)
  - [Clone](#clone)
  - [Other methods](#other-methods)

## Motivation

Most DI libraries rely on reflect-metadata and decorators to auto-wire dependencies. But this tightly couples 
your business logic to a framework — and adds complexity:

```typescript
@injectable()
class Foo {
  constructor(@inject("Database") private database?: Database) {}
}
// Notice how in order to allow the use of the empty constructor new Foo(), 
// we need to make the parameters optional, e.g. database?: Database.
```
Why should your core logic even know it's injectable?

RSDI avoids this by using explicit factory functions — keeping your code clean, framework-agnostic, and easy to test.

[Read more](https://radzserg.medium.com/https-medium-com-radzserg-dependency-injection-in-react-part-2-995e93b3327c)

## Features

- No decorators
- Strong TypeScript support
- Simple API
- No runtime dependencies
- Easy to mock and test

## Installation

```bash
npm install rsdi
# or
pnpm add rsdi
# or
yarn add rsdi
```

```typescript
import { DIContainer } from "rsdi";
```

## Best Use Cases

Use `RSDI` when your app grows in complexity:

- You break big modules into smaller ones
- You have deep dependency trees (A → B → C)
- You want to pass dependencies across layers:
  - Controllers
  - Domain managers
  - Repositories
  - Infrastructure services

## Architecture

`RSDI` works best when you organize your app as a dependency tree.

A typical backend app might have:
- Controllers (REST or GraphQL)
- Domain managers (use-cases, handlers)
- Repositories (DB access)
- Infrastructure (DB pools, loggers)

![architecture](https://github.com/radzserg/rsdi3/raw/main/docs/RSDI_architecture.jpg "RSDI Architecture")

Set up your DI container at the app entry point — from there, all other parts can pull in what they need.

## How to use

### Basic Example

```typescript
const container = new DIContainer()
    .add("a", () => "name1")
    .add("bar", () => new Bar())
    .add("foo", ({ a, bar}) => new Foo(a, bar));

const { foo } = container; // alternatively  container.get("foo");
```

### Real-World Example

```typescript
// sample web application components

export function UserController(
  userRegistrator: UserRegistrator,
  userRepository: UserRepository,
) {
  return {
    async create(req: Request, res: Response) {
      const user = await userRegistrator.register(req.body);
      res.send(user);
    },
    async list(req: Request, res: Response) {
      const users = await userRepository.findAll(req.body);
      res.send(users);
    },
  };
}

export class UserRegistrator {
  public constructor(public readonly userRepository: UserRepository) {}

  public async register(userData: SignupData) {
    // validate and send sign up email
    return this.userRepository.saveNewUser(userData);
  }
}

export function MyDbProviderUserRepository(db: DbConnection): UserRepository {
  return {
    async saveNewUser(userAccountData: SignupData): Promise<void> {
      await db("insert").insert(userAccountData);
    },
  };
}

export function buildDbConnection(): DbConnection {
  return connectToDb({
    /* db credentials */
  });
}
```

Now let's configure the dependency injection container. Dependencies are only created when they're actually needed. 
Your `configureDI` function will declare and connect everything in one place.

```typescript
import { DIContainer } from "rsdi";

export type AppDIContainer = ReturnType<typeof configureDI>;

export default function configureDI() {
  return new DIContainer()
    .add("dbConnection", () => buildDbConnection())
    .add("userRepository", ({ dbConnection }) =>
      MyDbProviderUserRepository(dbConnection),
    )
    .add("userRegistrator", ({ userRepository }) => new UserRegistrator(userRepository))
    .add("userController", ({ userRepository, userRegistrator }) =>
      UserController(userRegistrator, userRepository),
    );
}
```

When a resolver runs for the first time, its result is cached and reused for future calls. 

By default, you should always use `.add()` to register dependencies — it throws if the name already exists, which
prevents accidental overwrites and keeps your setup predictable. If you need to replace an existing dependency —
usually in tests — use `.update()` instead:

```typescript
const container = configureDI();

// override a real dependency with a stub in tests
container.update("userRepository", () => new InMemoryUserRepository());
```

Let's map our web application routes to configured controllers

```typescript
// configure Express router
export default function configureRouter(
  app: core.Express,
  diContainer: AppDIContainer,
) {
  const { userController } = diContainer;
  app
    .route("/users")
    .get(userController.list)
    .post(userController.create);
}
```

Add `configureDI()` in your app's entry point:

```typescript
// express.ts
const app = express();

const diContainer = configureDI();
configureRouter(app, diContainer);

app.listen(8000);
```
 
🔗 Full example: [Express + RSDI](https://radzserg.medium.com/dependency-injection-in-express-application-dd85295694ab)


## Strict types

`RSDI` uses TypeScript's type system to validate dependency trees at compile time, not runtime.

![strict type](https://github.com/radzserg/rsdi3/raw/main/docs/RSDI_types.png "RSDI types")

This gives you autocomplete and safety without decorators or metadata hacks.

## Advanced Usage

As your application grows, it's a good idea to split your DI container setup into smaller, focused modules. This keeps 
your codebase easier to navigate and maintain.

A common pattern is to keep a main `diContainer.ts` file that configures the base container and delegate domain-specific 
dependencies to separate files like `dataAccess.ts`, `validators.ts`, or `controllers.ts`.

This modular structure improves testability, readability, and clarity on how dependencies are wired across your app.

---

### Extend

You can extend a container with more dependencies using `.extend()`. This is ideal for building up your container in logical steps.

```ts
// diContainer.ts

export const configureDI = async () => {
  return (await buildDatabaseDependencies())
    .extend(addDataAccessDependencies)
    .extend(addValidators);
};
```

```ts
// addDataAccessDependencies.ts

export type DIWithPool = Awaited<ReturnType<typeof buildDatabaseDependencies>>;

export const addDataAccessDependencies = async () => {
  const pool = await createDatabasePool();
  const longRunningPool = await createLongRunningDatabasePool();

  return new DIContainer()
    .add("databasePool", () => pool)
    .add("longRunningDatabasePool", () => longRunningPool);
};
```

```ts
// addValidators.ts

export type DIWithValidators = ReturnType<typeof addValidators>;

export const addValidators = (container: DIWithPool) => {
  return container
    .add("myValidatorA", ({ a, b, c }) => new MyValidatorA(a, b, c))
    .add("myValidatorB", ({ a, b, c }) => new MyValidatorB(a, b, c));
};
```

---

### Merge

You can merge two containers to combine their resolvers and resolved values.

- Dependencies from both containers are preserved.
- If both define the same key, the merging container's value takes precedence.
- Already resolved values are reused — not re-created.

```ts
const containerA = new DIContainer()
  .add("a", () => "1")
  .add("bar", () => new Bar());

const containerB = new DIContainer()
  .add("b", () => "b")
  .add("buzz", () => new Buzz("buzz"));

const finalContainer = containerA.merge(containerB);

console.log(finalContainer.a); // "1"
console.log(finalContainer.b); // "b"
console.log(finalContainer.bar instanceof Bar); // true
console.log(finalContainer.buzz.name); // "buzz"
```

---

### Clone

Use `.clone()` to create a new container that shares resolvers and already resolved values with the original.

This is useful for creating isolated execution contexts while preserving the base setup.

```ts
const containerA = new DIContainer()
  .add("a", () => "1")
  .add("bar", () => new Bar())
  .add("buzz", () => new Buzz("buzz"));

const containerB = containerA.clone();

console.log(containerB.a); // "1"
console.log(containerB.bar instanceof Bar); // true
console.log(containerB.buzz.name); // "buzz"
```

---

### Other methods

- **`.get(name)`** — resolve a dependency by name. Equivalent to property access (`container.foo`). Throws
  `DependencyIsMissingError` if the name isn't registered.
- **`.has(name)`** — returns `true` if a resolver is registered under `name` (whether or not it has been resolved yet).
- **`.hasResolvedDependency(name)`** — returns `true` only if the dependency has already been resolved and cached.
- **`.update(name, resolver)`** — replace an existing dependency's resolver (see [How to use](#how-to-use)). Unlike
  `.add()`, it expects the name to already exist.

```typescript
const container = new DIContainer().add("bar", () => new Bar());

container.has("bar"); // true
container.hasResolvedDependency("bar"); // false — not resolved yet

container.get("bar");
container.hasResolvedDependency("bar"); // true — now cached
```
