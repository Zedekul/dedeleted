import { Stream } from "stream"

import { TelegraphAccount, TelegraphPage } from "./telegraph"
import { Weibo, WeiboURL } from "./weibo"
import { UploadFunction } from "./utils"
import { CookieJar } from "tough-cookie"

export class DedeletedError extends Error {
  constructor(m: string, public baseError?: Error) {
    super(m)
  }

  public isDedeletedError = true
  public isPrivate = false
}

export interface AWSS3Settings {
  accessPoint: string
  accountID: string
  bucket: string
  region: string
}

export const BackupSources = {
  "weibo": Weibo
}

export type SourceType = keyof typeof BackupSources

export const AvailableSources: SourceType[] = [
  "weibo"
]

export type StoredCookies = {
  [key in SourceType]?: CookieJar.Serialized
}

export interface BackupOptions {
  sourceType?: SourceType
  cookies?: StoredCookies
  force?: boolean
  checkExisting?: (id: string) => Promise<BackupResult | undefined>
  telegraphAccount?: TelegraphAccount
  awsS3Settings?: AWSS3Settings
}

export interface BackupResult {
  id: string
  type: SourceType
  source: string
  telegraphPage: TelegraphPage
  getVideo: () => Promise<Stream | string | undefined>
  cookies?: CookieJar
  data: any
  otherBackup?: BackupResult
}

export interface BackupContext {
  regexMatches?: RegExpExecArray
  account?: TelegraphAccount,
  force?: boolean
  uploadFallback?: UploadFunction
}

export interface BackupSource {
  key: SourceType
  testURL: (url: string, ctx?: BackupContext) => boolean
  backup: (url: string, options?: BackupOptions, ctx?: BackupContext) => Promise<BackupResult>
}

export const getSourceType = (
  url: string, options?: BackupOptions, ctx?: BackupContext
): SourceType | undefined => {
  if (options !== undefined && options.sourceType !== undefined) {
    return options.sourceType
  }
  for (const key of AvailableSources) {
    const source = BackupSources[key]
    if (source.testURL(url, ctx)) {
      return key
    }
  }
}

export const getCookieURL = (sourceType: string): string | undefined => {
  switch (sourceType) {
    case "weibo":
      return WeiboURL
    case "zhihu":
      return "https://www.zhihu.com/"
    default:
      return undefined
  }
}
