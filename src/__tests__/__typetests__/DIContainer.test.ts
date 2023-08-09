import DIContainer from "../../DIContainer";
import { Bar } from "../fakeClasses";
import { expectType } from "tsd";
import { describe, test } from "vitest";

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
    expectType<unknown>(container.get("d"));
  });
});
