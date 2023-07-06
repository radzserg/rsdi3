# RSDI - Dependency Injection Container

Simple and powerful dependency injection container for with strong type checking system.

- [Motivation](#motivation)
- [Features](#features)
- [When to use](#when-to-use)
- [Architecture](#architecture)
- [Usage](#usage)
  - [Raw values](#raw-values)
  - [Object resolver](#object-resolver)
  - [Function resolver](#function-resolver)
  - [Factory resolver](#factory-resolver)
- [Typescript type resolution](#typescript-type-resolution)
- [Dependency declaration](#dependency-declaration)
- Wiki
  - [Async factory resolver](./docs/async_factory_resolver.md)
  - [DI Container vs Context](./docs/context_vs_container.md)

## Motivation

Popular dependency injection libraries use `reflect-metadata` that allows to fetch argument types and based on
those types and do autowiring. Autowiring is a nice feature but the trade-off is decorators.

```typescript
@injectable()
class Foo {}
```

Why component Foo should know that it's injectable?

Your business logic depends on a specific framework that is not part of your domain model and can change.

More thoughts in a [dedicated article](https://radzserg.medium.com/https-medium-com-radzserg-dependency-injection-in-react-part-2-995e93b3327c)

## Features

- Simple but powerful
- Does not requires decorators
- Great types resolution
- Works great with both javascript and typescript

## When to use

`RSDI` is most effective in complex applications. When the complexity of your application is high, it becomes necessary to
break up huge components into smaller ones to control the complexity. You have components that use other components that
use other components. You have application layers and a layer hierarchy. There is a need to transfer dependencies from
the upper layers to the lower ones.

You like and respect and use Dependency Injection and TDD. You have to use Dependency Injection in order to have proper
unit tests. Tests that test only one module - class, component, function, but not integration with nested dependencies.

## Architecture

`RSDI` expects (but does not require) that you build all your dependencies into a dependency tree. Let's take a typical
web application as an example. Given that your application is quite large and has many layers:

- controllers (REST or graphql handlers)
- domain model handlers (your domain models, various managers, use-cases etc)
- DB repositories,
- Low level services

![architecture](https://github.com/radzserg/rsdi/raw/main/docs/RSDI_architecture.jpg "RSDI Architecture")

An application always has an entry point, whether it is a web application or a CLI application. This is the only place where you
should configure your dependency injection container. The top level components will then have the lower level components
injected.

# How to use

Let's take a simple web application as an example. We will cut into a small part of the application that registers a
new user. A real application will consist of dozens of components. The logic of the components will be much more
complicated. This is just a demo. It's up to you to use classes or factory functions for the demonstration, and we'll
use both.

```typescript
// sample web application components

export function UserController(
  userRegistrator: UserRegistrator,
  userRepository: UserRepository
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

export function MyDbProviderUserRepository(db: Knex): UserRepository {
  return {
    async saveNewUser(userAccountData: SignupData): Promise<void> {
      await this.db("insert").insert(userAccountData);
    },
  };
}

export function buildDbConnection(): Knex {
  return knex({
    /* db credentials */
  });
}
```

Now we need to configure the dependency injection container before use. Dependencies are declared and not really initiated
until the application really needs them. Your DI container initialization function - `configureDI` will include:

```typescript
import DIContainer, { object, use, factory, func, IDIContainer } from "rsdi";

export default function configureDI() {
  const container = new DIContainer();
  container.add({
    buildDbConnection: factory(() => {
      buildDbConnection();
    }),
    [MyDbProviderUserRepository.name]: func(
      MyDbProviderUserRepository,
      use(buildDbConnection)
    ),
    [UserRegistrator.name]: object(UserRegistrator).construct(
      use(MyDbProviderUserRepository.name)
    ),
    [UserController.name]: func(
      UserController,
      use(UserRegistrator.name),
      use(MyDbProviderUserRepository.name)
    ),
  });
  return container;
}
```

**All resolvers are resolved only once and their result persists over the life of the container.**

Let's map our web application routes to configured controllers

```typescript
// configure Express router
export default function configureRouter(
  app: core.Express,
  diContainer: IDIContainer
) {
  const usersController = diContainer.get(UsersController);
  app
    .route("/users")
    .get(usersController.list.bind(usersController))
    .post(usersController.create.bind(usersController));
}
```

Add `configureDI` in the entry point of your application.

```typescript
// express.ts
const app = express();

const diContainer = configureDI();
configureRouter(app, diContainer);

app.listen(8000, () => {
  console.log(`⚡️[server]: Server is running`);
});
```

The complete web application example can be found [here](https://radzserg.medium.com/dependency-injection-in-express-application-dd85295694ab)

## Dependency Resolvers

### Raw values resolver

Dependencies are set as raw values. Container keeps and return raw values.

```typescript
import DIContainer from "rsdi";

const container = new DIContainer();
container.add({
  ENV: "PRODUCTION",
  HTTP_PORT: 3000,
  storage: new CookieStorage(),
});
const env: string = container.get("ENV");
const port: number = container.get("HTTP_PORT");
const authStorage: AuthStorage = container.get(AuthStorage); // instance of AuthStorage
```

### Object resolver

`object(ClassName)` - constructs an instance of the given class. The simplest scenario it calls the class constructor `new ClassName()`.
When you need to pass arguments to the constructor, you can use `construct` method. You can refer to the already defined
dependencies via the `use` helper, or you can pass raw values.

If you need to call object method after initialization you can use `method` it will be called after constructor.

```typescript
class ControllerContainer {
  constructor(authStorage: AuthStorage, logger: Logger) {}

  add(controller: Controller) {
    this.controllers.push(controller);
  }
}

// container
const container = new DIContainer();
container.add({
  Storage: object(CookieStorage), // constructor without arguments
  AuthStorage: object(AuthStorage).construct(
    use(Storage) // refers to existing dependency
  ),
  UsersController: object(UserController),
  PostsController: object(PostsController),
  ControllerContainer: object(MainCliCommand)
    .construct(use(AuthStorage), new Logger()) // use existing dependency, or pass raw values
    .method("add", use(UsersController)) // call class method after initialization
    .method("add", use(PostsController)),
});
```

### Function resolver

Function resolver allows declaring lazy functions. Function will be called when it's actually needed.

```typescript
function UsersRepoFactory(knex: Knex): UsersRepo {
  return {
    async findById(id: number) {
      await knex("users").where({ id });
    },
  };
}

const container = new DIContainer();
container.add({
  DBConnection: knex(/* ... */),
  UsersRepoFactory: func(UsersRepoFactory, use("DBConnection")),
});

const userRepo = container.get(UsersRepoFactory);
```

### Factory resolver

Factory resolver is similar to a Function resolver. You can use factory resolver when you need more flexibility
during initialization. `container: IDIContainer` will be passed in as an argument to the factory method. You can
resolve other dependencies inside the factory function and have conditions inside of it.

```typescript
const container = new DIContainer();
container.add({
  BrowserHistory: factory(configureHistory),
});

function configureHistory(container: IDIContainer): History {
  const history = createBrowserHistory();
  const env = container.get("ENV");
  if (env === "production") {
    // do what you need
  }
  return history;
}
const history = container.get("BrowserHistory");
```

## Typescript type resolution

`container.get` - return type based on declaration.

```typescript
const container: DIContainer = new DIContainer();
container.add({
  strVal: "raw string value",
  numberVal: 123,
  boolVal: true,
  objectVal: object(Buzz), // resolvers to object of class Buzz
  dateVal: func(function () {
    return new Date(); // resolves to ReturnType of the function
  }),
});
const strVal = container.get("strVal"); // strVal: string
const numberVal = container.get("numberVal"); // numberVal: number
const boolVal = container.get("boolVal"); // boolVal: boolean
const objectVal = container.get("objectVal"); // boolVal: Buzz
const dateVal = container.get("dateVal"); // dateVal: Date
```

`contrainer.use` - allows to reference declared dependency with respect to types.

```typescript
export class Foo {
  constructor(name: string, bar: Bar) {}
}

const container: DIContainer = new DIContainer();

container.add({
  bar: new ObjectResolver(Bar),
  key1: new RawValueResolver("value1"),

  // `bar` dependency cannot be referenced in the same `add` call
  // Argument of type 'string' is not assignable to parameter of type... '
  // foo: new ObjectResolver(Foo).construct("foo", container.use("bar")),
});
container.add({
  foo: new ObjectResolver(Foo).construct("foo", container.use("bar")),
});
```

To support lazy loading `construct` method changes original Foo constructor to expect
`(string | ReferenceResolver<string>, Bar | ReferenceResolver<Bar>)`.
`container.use("bar")` - will return object `ReferenceResolver<Bar>` to respect safe types.

`use` helper

```typescript
import { use } from "rsdi";
```

`use` helper is less strict version of `container.use`. It allows to reference dependencies that **will be defined** relying
on convention over configuration rule.

- if given name is a class - instance of the class
- if given name is a function - return type of the function
- if custom type is provided - return ReferenceResolver<Custom>
- otherwise - any

```typescript
class Foo {
  constructor(private readonly bar: Bar) {}
}

function returnBoolean() {
  return true;
}

const container: DIContainer = new DIContainer();
container.add({
  Bar: new Bar(),
  Foo: object(Foo).construct(use(Bar)), // resolves Bar

  expectBoolFunc: func(function (a: boolean) {
    return null;
  }, use(returnBoolean)), // resolves to ReturnType of returnBoolean function

  expectDateFunc: func(function (a: Date) {
    return null;
  }, use<Date>("date")), // resolves to Date

  expectDateFunc2: func(function (a: Date) {
    return null;
  }, use("date")), // resolves to any
});
```

## Dependency declaration

**Use string names**

```typescript
const container: DIContainer = new DIContainer();

container.add({
  bar: new ObjectResolver(Bar),
  key1: new RawValueResolver("value1"),
});

container.add({
  foo: new ObjectResolver(Foo).construct("foo", container.use("bar")),
});
```

Use function and class names by declaring them as `[MyClass.name]`. In this case, it is safe to rename functions and
classes in the IDE. IDE will identify all usages and rename them in the container as well. You can declare all dependencies
in a single `add` method and use `use` helper to reference other dependencies.

```typescript
container.add({
  [Foo.name]: new Foo(),
  [MyFactory.name]: MyFactory(),
  [Foo.name]: object(Foo).construct(use(Bar)),
});
const foo = container.get(Foo);
const buzz = container.get(MyFactory);
```
