export abstract class AbstractFoo {
  public items: string[] = [];

  public name: string;

  public service: Bar;

  constructor(name: string, service: Bar) {
    this.name = name;
    this.service = service;
  }

  addItem(item: string) {
    this.items.push(item);
  }
}

export class Bar {
  public buzz() {
    return 'buzz';
  }
}

export class Buzz {
  public getClassName() {
    return 'RealBuzz';
  }
}

export class Foo {
  public bar: Bar;

  public items: string[] = [];

  public name: string;

  constructor(name: string, bar: Bar) {
    this.name = name;
    if (!name) {
      throw new Error('Name is missing');
    }

    if (!bar) {
      throw new Error('Bar is missing');
    }

    this.bar = bar;
  }

  addItem(item: string) {
    this.items.push(item);
  }
}

export class FooChild extends AbstractFoo {}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const anyType = () => ({}) as unknown as any;
