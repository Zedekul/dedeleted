export class DedeletedError extends Error {
  constructor(m: string, public baseError?: Error) {
    super(m)
  }

  public code = 0
  public isDedeletedError = true
  public get isPrivate(): boolean { return this.code < 0 }
}

export class ConfigError extends DedeletedError {
  public code = -1
  constructor(public ctx?: string, public baseError?: Error) {
    super(`Config error: ${ctx}`, baseError)
  }
}

export class InvalidFormat extends DedeletedError {
  public code = 1
  constructor(public ctx?: string, public baseError?: Error) {
    super(`Invalid format: ${ctx}`, baseError)
  }
}

export class CannotAccess extends DedeletedError {
  public code = 2
  constructor(public ctx?: string, public baseError?: Error) {
    super(`Cannot access or already deleted: ${ctx}`, baseError)
  }
}

export class CreateFailed extends DedeletedError {
  public code = 3
  constructor(public ctx?: string, public baseError?: Error) {
    super(`Create failed: ${ctx}`, baseError)
  }
}

export class UploadFailed extends DedeletedError {
  public code = 4
  constructor(public ctx?: string, public baseError?: Error) {
    super(`Upload failed: ${ctx}`, baseError)
  }
}
