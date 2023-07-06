export class Bar {
  public buzz() {
    return "buzz";
  }
}

export class Foo {
  public name: string;
  public bar: Bar;
  public items: string[] = [];

  constructor(name: string, bar: Bar) {
    this.name = name;
    if (!name) {
      throw new Error("Name is missing");
    }
    if (!bar) {
      throw new Error("Bar is missing");
    }
    this.bar = bar;
  }

  addItem(item: string) {
    this.items.push(item);
  }
}

export class Buzz {
  public getClassName() {
    return "RealBuzz";
  }
}

export abstract class AbstractFoo {
  public name: string;
  public service: Bar;
  public items: string[] = [];

  constructor(name: string, service: Bar) {
    this.name = name;
    this.service = service;
  }

  addItem(item: string) {
    this.items.push(item);
  }
}

export class FooChild extends AbstractFoo {}

export const anyType = () => ({} as unknown as any);
