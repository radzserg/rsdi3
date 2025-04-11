// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class Bar {}

export class Foo {
  public bar: Bar;

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
}
