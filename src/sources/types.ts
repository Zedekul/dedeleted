import { Readable } from "node:stream"

import { HTMLElement } from "node-html-parser"

import { TelegraphAccount, TelegraphPage } from "../telegraph/types.js"
import { AWSS3Settings } from "../utils/aws.js"

// Some of the options may not work if force=false, since result was cached.
export interface BackupOptions {
  id: string
  sourceKey: string
  force: boolean
  checkExisting: (sourceKey: string, id: string) => Promise<BackupResult | undefined>

  getCookie: (url: string) => Promise<string | undefined>
  setCookie: (url: string, cookie: string) => Promise<void>

  createTelegraphPage: boolean
  telegraphAccount: TelegraphAccount

  allowMissingContent: boolean
  uploadVideos: boolean
  awsS3Settings: AWSS3Settings | null
  inlineImages: boolean
  inlineLinks: boolean

  plainText: boolean
  textLengthLimit: number

  backupReposted: boolean

  htmlFromBrowser: string | null
}

export type BackupFileType = "image" | "video" | "file" | "auto"

export interface BackupFile {
  type: BackupFileType
  source: string
  uploaded?: string
  download?: () => Promise<Readable>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface BackupContent<T = any> {
  id: string
  title: string
  authorName?: string
  authorURL?: string
  createdAt: Date
  updatedAt?: Date
  metaString?: string
  source: string
  parsedHTML: HTMLElement
  inlineNodes: HTMLElement[]
  otherFiles: BackupFile[]
  data: T
  reposted: BackupContent[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  backup(url: string, options?: Partial<BackupOptions>): Promise<BackupResult>
}
