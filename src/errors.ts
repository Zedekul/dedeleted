export class DedeletedError extends Error {
  constructor(m?: string, public baseError?: Error) {
    super(m)
  }

  public code = 0
  public isDedeletedError = true
  public skipLogging = true
  public get isPrivate(): boolean { return this.code < 0 }
}

export class ConfigError extends DedeletedError {
  public code = -1
  constructor(public ctx?: string, public baseError?: Error) {
    super(`配置错误: ${ctx}`, baseError)
  }
}

export class InvalidFormat extends DedeletedError {
  public code = 1
  constructor(public ctx?: string, public baseError?: Error) {
    super(`格式错误: ${ctx}`, baseError)
  }
}

export class CannotAccess extends DedeletedError {
  public code = 2
  constructor(public ctx?: string, public baseError?: Error) {
    super(`需要登录才能访问或者已经被删除: ${ctx}`, baseError)
  }
}

export class CreateFailed extends DedeletedError {
  public code = 3
  constructor(public ctx?: string, public baseError?: Error) {
    super(`创建失败: ${ctx}`, baseError)
  }
}

export class UploadFailed extends DedeletedError {
  public code = 4
  constructor(public ctx?: string, public baseError?: Error) {
    super(`上传失败: ${ctx}`, baseError)
  }
}
