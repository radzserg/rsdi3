export class CircularDependencyError extends Error {
  constructor(name: string, path: string[]) {
    super(
      `Circular Dependency is detected. Dependency: "${name}", path: ` +
        path.join(" -> ") +
        ".",
    );
  }
}

export class DependencyIsMissingError extends Error {
  constructor(name: string) {
    super(`Dependency with name ${name} is not defined`);
  }
}

export class InvalidConstructorError extends Error {
  constructor() {
    super(`Invalid constructor have been provided`);
  }
}

export class MethodIsMissingError extends Error {
  constructor(objectName: string, methodName: string) {
    super(`${methodName} is not a member of ${objectName}`);
  }
}
