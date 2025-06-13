# RSDI - Simple & Strong-Type Dependency Injection Container

Manage your dependencies with ease and safety. RSDI is a minimal, powerful DI container with full TypeScript support — no decorators or metadata required.

- [Motivation](#motivation)
- [Features](#features)
- [Best Use Cases](#best-use-cases)
- [Architecture](#architecture)
- [How to use](#how-to-use)
- [Strict types](#strict-types)
- [Best Practices](#best-practices)
- Wiki
  - [Async factory resolver](./docs/async_factory_resolver.md)
  - [DI Container vs Context](./docs/context_vs_container.md)

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
Why should your core logic even know it’s injectable?

RSDI avoids this by using explicit factory functions — keeping your code clean, framework-agnostic, and easy to test.

[Read more](https://radzserg.medium.com/https-medium-com-radzserg-dependency-injection-in-react-part-2-995e93b3327c)

## Features

- No decorators
- Strong TypeScript support
- Simple API
- No runtime dependencies
- Easy to mock and test

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

# How to use

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
    async list(req: Request) {
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
      await this.db("insert").insert(userAccountData);
    },
  };
}

export function buildDbConnection(): DbConnection {
  return connectToDb({
    /* db credentials */
  });
}
```

Now let’s configure the dependency injection container. Dependencies are only created when they’re actually needed. 
Your `configureDI` function will declare and connect everything in one place.

```typescript
import { DIContainer } from "rsdi";

export type AppDIContainer = ReturnType<typeof configureDI>;

export default function configureDI() {
  return new DIContainer()
    .add("dbConnection", buildDbConnection())
    .add("userRepository", ({ dbConnection }) =>
      MyDbProviderUserRepository(dbConnection),
    )
    .add("userRegistrator", ({ userRepository }) => new UserRegistrator(userRepository))
    .add("userController", ({ userRepository, userRegistrator}) =>
      UserController(userRepository, userRegistrator),
    );
}
```

When a resolver runs for the first time, its result is cached and reused for future calls. 

By default, you should always use .add() to register dependencies. If you need to replace an existing one — usually 
in tests — you can use .update() instead. This avoids accidental overwrites and keeps your setup predictable.

Let's map our web application routes to configured controllers

```typescript
// configure Express router
export default function configureRouter(
  app: core.Express,
  diContainer: AppDIContainer,
) {
  const { usersController } = diContainer;
  app
    .route("/users")
    .get(usersController.list)
    .post(usersController.create);
}
```

Add `configureDI()` in your app’s entry point:

```typescript
// express.ts
const app = express();

const diContainer = configureDI();
configureRouter(app, diContainer);

app.listen(8000);
```
 
🔗 Full example: [Express + RSDI](https://radzserg.medium.com/dependency-injection-in-express-application-dd85295694ab)


## Strict types

`RSDI` uses TypeScript’s type system to validate dependency trees at compile time, not runtime.

![strict type](https://github.com/radzserg/rsdi3/raw/main/docs/RSDI_types.png "RSDI types")

This gives you autocomplete and safety without decorators or metadata hacks.

## Best practices

As your application grows, it’s a good idea to split your DI container setup into multiple files. This helps keep 
your code organized and easier to maintain.

For example, you might have a main diContainer.ts file that sets up the core container, and then separate files like 
controllers.ts, validators.ts, or dataAccess.ts that each register a group of related dependencies.

This modular approach makes it easier to manage changes, test in isolation, and understand how dependencies are wired 
across different parts of your app.

```typescript

// diContainer.ts

export const configureDI = async () => {
  return (await buildDatabaseDependencies())
    .extend(addDataAccessDependencies)
    .extend(addValidators);
}

// addDataAccessDependencies.ts
export type DIWithPool = Awaited<ReturnType<typeof buildDatabaseDependencies>>;
export const addDataAccessDependencies = async () => {
  const pool = await createDatabasePool();
  const longRunningPool = await createLongRunningDatabasePool();
  return new DIContainer()
    .add("databasePool", () => pool)
    .add("longRunningDatabasePool", () => longRunningPool);
};

//  addValidators.ts
export type DIWithValidators = ReturnType<typeof addValidators>;
export const addValidators = (container: DIWithPool) => {
  return container
    .add('myValidatorA', ({ a, b, c }) => new MyValidatorA(a, b, c))
    .add('myValidatorB', ({ a, b, c }) => new MyValidatorB(a, b, c));
};
```



### Merging Containers

You can merge resolvers and resolved dependencies from two containers into one. This is useful for combining 
dependencies from different parts of your  application — for example, merging core services with feature-specific dependencies.

- Merging container will add resolvers and resolved dependencies from the other container.
- If both containers define the same dependency, the merging container’s value takes priority.
- Resolved dependencies remain shared — they are not re-created.

```typescript
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

### Cloning Container

You can clone a container to create a new container with the same resolvers and resolved dependencies. 
This is useful when you want to create a new bounded context with the same dependencies as the original container.
Already resolved dependencies will be shared between the cloned container and the original container.

```typescript
const containerA = new DIContainer()
  .add("a", () => "1")
  .add("bar", () => new Bar())
  .add("buzz", () => new Buzz("buzz"));

const containerB = containerA.clone();

console.log(containerB.a); // "1"
console.log(containerB.bar instanceof Bar); // true
console.log(containerB.buzz.name); // "buzz"
```
