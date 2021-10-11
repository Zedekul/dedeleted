import { Readable } from "stream"

import { HTMLElement } from "node-html-parser"

import { TelegraphAccount, TelegraphPage } from "../telegraph/types"
import { AWSS3Settings } from "../utils/aws"

// Some of the options may not work if force=false, since result was cached.
export interface BackupOptions {
  id: string
  force: boolean
  checkExisting: (id: string) => Promise<BackupResult | undefined>

  getCookie: (url: string) => Promise<string | undefined>
  setCookie: (url: string, cookie: string) => Promise<void>

  createTelegraphPage: boolean
  telegraphAccount: TelegraphAccount

  allowMissingContent: boolean
  uploadVideos: boolean
  awsS3Settings: AWSS3Settings | null

  plainText: boolean
  textLengthLimit: number

  backupReposted: boolean
}

export type BackupFileType = "image" | "video" | "file"

export interface BackupFile {
  type: BackupFileType
  source: string
  uploaded?: string
  download?: () => Promise<Readable>
}

export interface BackupContent<T = any> {
  id: string
  source: string
  parsedHTML: HTMLElement
  inlineNodes: HTMLElement[]
  otherFiles: BackupFile[]
  data: T
  reposted: BackupContent[]
}

export interface BackupResult<T = any> {
  id: string
  sourceKey: string
  source: string
  pages: TelegraphPage[]

  content: string
  files: BackupFile[]

  otherData: T
  reposted: BackupResult[]
}

export interface BackupSource {
  key: string
  testURL(url: string): string | undefined
  backup(url: string, options?: BackupOptions): Promise<BackupResult>
}
