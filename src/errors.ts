export class DenyOverrideDependencyError extends Error {
  constructor(name: string) {
    super(
      `Dependency resolver with name ${name} is already defined, use update method instead`,
    )
  }
}

export class DependencyIsMissingError extends Error {
  constructor(name: string) {
    super(`Dependency resolver with name ${name} is not defined`)
  }
}

export class ForbiddenNameError extends Error {
  constructor(name: string) {
    super(`Dependency resolver with name ${name} is not allowed`)
  }
}

export class IncorrectInvocationError extends Error {
  constructor() {
    super(`Incorrect invocation of DIContainer`)
  }
}
