# RSDI - Dependency Injection Container

Simple and powerful dependency injection container for with strong type checking system. `rsdi` offers strong 
type-safety due to its native TypeScript support. It leverages TypeScript's type system to provide compile-time checks 
and ensure proper injection of dependencies.

- [Motivation](#motivation)
- [Features](#features)
- [When to use](#when-to-use)
- [Architecture](#architecture)
- [Usage](#usage)
- [Typescript type resolution](#typescript-type-resolution)
- [Dependency declaration](#dependency-declaration)
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
import DIContainer from "rsdi";

export default function configureDI() {
  return new DIContainer()
    .add("dbConnection", buildDbConnection())
    .add("userRepository", (c) =>
      MyDbProviderUserRepository(c.get("dbConnection")),
    )
    .add("userRegistrator", (c) => new UserRegistrator(c.get("userRepository")))
    .add("userController", (c) =>
      UserController(c.get("userRepository"), c.get("userRegistrator")),
    );
}
```

`container.get` - return type based on declaration.

**All resolvers are resolved only once and their result persists over the life of the container.**

Let's map our web application routes to configured controllers

```typescript
// configure Express router
export default function configureRouter(
  app: core.Express,
  diContainer: IDIContainer,
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


## Strict types
