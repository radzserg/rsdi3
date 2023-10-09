# RSDI - Simple & Strong-Type Dependency Injection Container

Easily manage your project dependencies with RSDI. This library provides a robust type-checking system.

- [Motivation](#motivation)
- [Features](#features)
- [Best Use Cases](#best-use-cases)
- [Architecture](#architecture)
- [How to use](#how-to-use)
- [Strict types](#strict-types)
- - [Best Practices](#best-practices)
- Wiki
  - [Async factory resolver](./docs/async_factory_resolver.md)
  - [DI Container vs Context](./docs/context_vs_container.md)

## Motivation

Popular dependency injection libraries utilize reflect-metadata to retrieve argument types and use those types
to carry out autowiring. Autowiring is an advantageous feature, but it necessitates the wrapping of all your
components with decorators.

```typescript
@injectable()
class Foo {
  constructor(@inject("Database") private database?: Database) {}
}
// Notice how in order to allow the use of the empty constructor new Foo(), 
// we need to make the parameters optional, e.g. database?: Database.
```

Why should component Foo be aware that it's injectable?

Your business logic relies on a particular framework, which isn't part of your domain model and is subject to change.

More thoughts in a [dedicated article](https://radzserg.medium.com/https-medium-com-radzserg-dependency-injection-in-react-part-2-995e93b3327c)

## Features

- Simple but powerful
- Does not requires decorators
- Strict types resolution

## Best Use Cases

`RSDI` is most effective in complex applications. When the complexity of your application is high, it becomes necessary to
break up huge components into smaller ones to control the complexity. You have components that use other components that
use other components. You have application layers and a layer hierarchy. There is a need to transfer dependencies from
the upper layers to the lower ones.

## Architecture

`RSDI` expects (but does not require) that you build all your dependencies into a dependency tree. Let's take a typical
web application as an example. Given that your application is quite large and has many layers:

- controllers (REST or graphql handlers)
- domain model handlers (your domain models, various managers, use-cases etc)
- DB repositories,
- Low level services

![architecture](https://github.com/radzserg/rsdi3/raw/main/docs/RSDI_architecture.jpg "RSDI Architecture")

Every application, whether it's a web app or a command-line tool, starts at an entry point. This is where you should 
set up your dependency injection container. Once set up, the top-level parts of your app will automatically get the 
lower-level parts they need. For web servers, the dependency injection container will manage a pre-configured router, 
which will already include the necessary controllers.

# How to use

Let's look at a basic web app that registers new users as an example. Keep in mind, a real-world app has many more 
parts and the logic is usually more complex. This is just a quick demo to show you the ropes.

### Simple use-case 

```typescript
const container = new DIContainer()
    .add("a", () => "name1")
    .add("bar", () => new Bar())
    .add("foo", ({ a, bar}) => new Foo(a, bar));

const { foo } = container; // alternatively  container.get("foo");
```

### Real life example

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

Now we need to configure the dependency injection container before use. Dependencies are declared and not really initiated
until the application really needs them. Your DI container initialization function - `configureDI` will include:

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

When a resolver is called for the first time, it's resolved once and the result is saved. From then on, the saved 
result is used.  If you want to change a dependency, don't use the add method; use the update method instead. 
This way, you won't accidentally replace dependencies. If you need to mock a dependency for testing, that's when 
you'd want to override it.

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

Add `configureDI` in the entry point of your application.

```typescript
// express.ts
const app = express();

const diContainer = configureDI();
configureRouter(app, diContainer);

app.listen(8000);
```

The complete web application example can be found [here](https://radzserg.medium.com/dependency-injection-in-express-application-dd85295694ab)


## Strict types

`rsdi` offers strong type-safety due to its native TypeScript support. It leverages TypeScript's type system to provide 
compile-time checks and ensure proper injection of dependencies.  

![strict type](https://github.com/radzserg/rsdi3/raw/main/docs/RSDI_types.png "RSDI types")

## Best practices

As your application expands, you'll likely need to divide your DI container across multiple files for better 
organization. You might have a main `diContainer.ts` file for the core DI setup, and a separate `controllers.ts`, 
`validators.ts` etc. This approach keeps your code clean and easy to manage.

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