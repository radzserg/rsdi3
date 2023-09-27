# Strict Types Example


```typescript

import DIContainer from "../DIContainer";
import { Bar, Foo } from "./fakeClasses";

const container = new DIContainer()
  .add("a", () => 123)
  .add("b", ({ a }) => a)
  .add("c", () => "string")
  .add("bar", () => new Bar())
  .add("foo", ({ c, bar }) => new Foo(c, bar))
  // TS2339: Property d does not exist on type
  .add("foo2", ({ d, bar }) => new Foo(d, bar))
  // TS2345: Argument of type 'Bar' is not assignable to parameter of type 'string'.
  .add("foo2", ({ bar }) => new Foo(bar, bar));

const a: number = container.a;
const b: number = container.b;
const c: string = container.c;
const bar: Bar = container.bar;
const foo: Foo = container.foo;
// TS2339: Property z does not exist on typ
container.z;
// TS2345: Argument of type "y" is not assignable to parameter of type "a" | "b" | "c" | "bar" | "foo" | "foo2"
container.get("y");

```