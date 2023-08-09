
# Strict Types Example


```typescript

const container = new DIContainer()
  .add("a", () => 123)
  .add("b", (get) => get("a"))
  .add("c", () => "string")
  .add("bar", () => new Bar())
  .add("foo", (get) => {
    const c = get("c");
    const bar = get("bar");
    new Foo(c, bar)
  })
  // TS2345: Argument of type '"d"' is not assignable to parameter of type '"a" | "b" | "c" | "bar" | "foo"'.
  .add("foo2", (get) => new Foo(get("d"), get("bar")))
  // TS2345: Argument of type 'Bar' is not assignable to parameter of type 'string'.
  .add("foo2", (get) => new Foo(get("bar"), get("bar")));

const a: number = container.get("a");
const b: number = container.get("b");
const c: string = container.get("c");
const bar: Bar = container.get("bar");
const foo: Foo = container.get("foo");
container.get("z");
container.get("y");

```