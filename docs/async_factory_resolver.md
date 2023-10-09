### Async factory resolver

RSDI intentionally does not provide the ability to resolve asynchronous dependencies. The container works with
resources. All resources will be used sooner or later. The lazy initialization feature won't be of much benefit
in this case. At the same time, mixing synchronous and asynchronous resolution will cause confusion primarily for
the consumers.

The following approach will work in most scenarios.

```typescript
// UserRepository.ts
class UserRepository {
  public constructor(private readonly dbConnection: any) {} // some ORM that requires opened connection

  async findUser() {
    return await this.dbConnection.find(/*...params...*/);
  }
}

// configureDI.ts
import { createConnections } from "my-orm-library";
import { DIContainer } from "rsdi";

async function configureDI() {
  // initialize async factories before DI container initialisation
  const dbConnection = await createConnections();

  return new DIContainer()
    .add("dbConnection", dbConnection)
    .add("userRepository", ({ dbConnection }) => new UserRepository( dbConnection ));
}

// main.ts
const { userRepository } = diContainer;
```