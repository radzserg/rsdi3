import { describe, expect, test } from "vitest";
import DIContainer from "../";
import { Bar, Foo } from "./fakeClasses";
import { DependencyIsMissingError, IncorrectInvocationError } from "../errors";

describe("DIContainer typescript type resolution", () => {
  test("if resolves type as given raw values", () => {
    const container = new DIContainer()
      .add("a", () => 123)
      .add("d", ({ a }) => a)
      .add("b", () => "string");

    expect(container.get("a")).toEqual(123);
    expect(container.get("b")).toEqual("string");
    expect(container.get("d")).toEqual(123);
  });

  test("if resolves object", () => {
    const container = new DIContainer()
      .add("a", () => "hello")
      .add("bar", () => new Bar())
      .add("foo", ({ a, bar }) => new Foo(a, bar));

    const foo = container.get("foo");
    expect(foo).toBeInstanceOf(Foo);
    expect(foo.name).toEqual("hello");
    expect(foo.bar).toBeInstanceOf(Bar);
  });

  test("if resolves function", () => {
    const aConcat = (a: string) => a + "a";
    const container = new DIContainer()
      .add("a", () => "hello")
      .add("aConcat", (c) => aConcat(c.a));

    const aConcatValue = container.get("aConcat");
    expect(aConcatValue).toEqual("helloa");
  });

  test("it allows to override resolvers by key", () => {
    const container = new DIContainer()
      .add("key1", () => "key1")
      .add("key1", () => "key2");

    const value = container.get("key1");
    expect(value).toEqual("key2");
  });

  test("it throws an error if definition is missing during resolution", () => {
    const container = new DIContainer();
    expect(() => {
      // @ts-ignore
      container.get("Logger");
    }).toThrow(new DependencyIsMissingError("Logger"));
  });

  test("it always returns singleton", () => {
    const container = new DIContainer()
      .add("a", () => "name1")
      .add("bar", () => new Bar())
      .add("foo", (deps) => new Foo(deps.a, deps.bar));

    const foo = container.get("foo");
    expect(foo.name).toEqual("name1");
    foo.name = "name2";
    const foo2 = container.get("foo");
    expect(foo2.name).toEqual("name2");
  });

  test("cannot not add inside factory", () => {
    const container = new DIContainer().add("foo", (container) => {
      // @ts-ignore
      container.add("c", () => "2");
      return 123;
    });

    expect(() => {
      container.get("foo");
    }).toThrow(IncorrectInvocationError);
  });
});

describe("DIContainer extend functions", () => {
  test("extends container", () => {
    const containerWithDatabase = () => {
      return new DIContainer().add("a", () => "1").add("bar", () => new Bar());
    };

    const finalContainer = containerWithDatabase().extend((container) => {
      return container.add("foo", ({ a, bar }) => {
        return new Foo(a, bar);
      });
    });

    expect(finalContainer.get("a")).toEqual("1");
    expect(finalContainer.get("bar")).toBeInstanceOf(Bar);
    expect(finalContainer.get("foo")).toBeInstanceOf(Foo);
    expect(finalContainer.get("foo").name).toEqual("1");
  });
});
