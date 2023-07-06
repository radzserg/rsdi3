export class DependencyIsMissingError extends Error {
  constructor(name: string) {
    super(`Dependency with name ${name} is not defined`);
  }
}
