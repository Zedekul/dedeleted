import { Stream } from "stream"

import { TelegraphAccount, TelegraphPage } from "./telegraph"
import { Weibo } from "./weibo"
import { UploadFunction } from "./utils"

export class DedeletedError extends Error {
  constructor(m: string, public baseError?: Error) {
    super(m)
  }

  public isDedeletedError = true
  public isPrivate = false
}

export interface BackupOptions {
  sourceType?: SourceType
  cookies?: string
  checkExisting?: (id: string) => BackupResult | undefined
  telegraphAccount?: TelegraphAccount
  awsS3Settings?: {
    accessPoint: string
    accountID: string
    bucketName: string
    region: string
  }
}

export interface BackupResult {
  id: string
  type: SourceType
  source: string
  telegraphPage: TelegraphPage
  getVideo: () => Promise<Stream | string | undefined>
  cookies?: string
  data: any
  otherBackup?: BackupResult
}

export interface BackupContext {
  regexMatches?: RegExpExecArray
  account?: TelegraphAccount,
  uploadFallback?: UploadFunction
}

export interface BackupSource {
  key: SourceType
  testURL: (url: string, ctx?: BackupContext) => boolean
  backup: (url: string, options?: BackupOptions, ctx?: BackupContext) => Promise<BackupResult>
}

export const BackupSources = {
  "weibo": Weibo
}

export type SourceType = keyof typeof BackupSources

export const AvailableSources: SourceType[] = [
  "weibo"
]

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
