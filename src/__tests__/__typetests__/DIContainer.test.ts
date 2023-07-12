import DIContainer from "../../DIContainer";
import { Bar, Foo } from "../fakeClasses";
import { expectNotType, expectType } from "tsd";
import { describe, expect, test } from "vitest";

describe("DIContainer typescript type resolution", () => {
  test("if resolves type as given raw values", () => {
    const container = new DIContainer()
      .add("key1", () => "string")
      .add("key2", () => 123)
      .add("bar", () => new Bar())
      .add("d", () => "" as unknown);
    expectType<string>(container.get("key1"));
    expectType<number>(container.get("key2"));
    expectType<Bar>(container.get("bar"));

    // @ts-ignore
    expectNotType<string>(container.get("key2"));
    expectNotType<undefined>(container.get("key2"));
    // @ts-ignore
    expectNotType<number>(container.get("key1"));
    expectNotType<number>(container.get("d"));
  });
});
