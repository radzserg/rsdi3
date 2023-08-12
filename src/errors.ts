export class DependencyIsMissingError extends Error {
  constructor(name: string) {
    super(`Dependency with name ${name} is not defined`);
  }
}

export class ForbiddenNameError extends Error {
  constructor(name: string) {
    super(`Dependency with name ${name} is not allowed`);
  }
}