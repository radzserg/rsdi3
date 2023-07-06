## DI Container vs Context

```typescript
export const userRegistratorFactory = (repository: UserRepository) => {};

// VS

export const userRegistratorFactory = (context: {
  repository: UserRepository;
}) => {};
```

At first glance, the difference is not that big. Context works great when the number of dependencies in your application is
low. When a context starts storing a lot of dependencies, it becomes more difficult to use it. The context can be
structured i.e. `context: { users: { repository: UserRepository } }`, this will partially solve the problem, but moving
the component inside the context structure becomes a costly task where there are risks of errors.

When a context is passed to a component, it can use any components from the context. While this may seem like a good idea,
in big teams it can lead to redundantly cohesive project modules. Developers in different teams begin to pull everything
out of context, without thinking about the coherence in projects. Allocating a subsystem that is used by a context into
a microservice can be a much more expensive task.