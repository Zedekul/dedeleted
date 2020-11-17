import {
  BackupOptions, BackupResult,
  BackupContext, DedeletedError,
  BackupSources, getSourceType
} from "./types"

import {
  createPage,
  getAccount,
  TelegraphAccount,
  TelegraphContent,
  TelegraphFile, TelegraphPage,
  TelegraphUploadAPI,
  uploadFile
} from "./telegraph"
import { UploadFunction } from "./utils"


export const backup = (
  url: string, options: BackupOptions = {}
): Promise<BackupResult> => {
  const ctx: BackupContext = {}
  ctx.account = getAccount(options.telegraphAccount)
  const sourceType = getSourceType(url, options, ctx)
  if (sourceType === undefined) {
    throw new DedeletedError("Unsupported source.")
  }
  const handler = BackupSources[sourceType].backup
  return handler(url, options, ctx)
}

export const uploadPage = async (
  account: TelegraphAccount, backupContent: TelegraphContent, cookies: string,
  uploadFallback?: UploadFunction
): Promise<TelegraphPage> => {
  const { content, filesToUpload } = backupContent
  const title = backupContent.title === undefined ? "Untitled" : backupContent.title
  const authorName = backupContent.authorName === undefined ? account.authorName : backupContent.authorName
  const authorURL = backupContent.authorURL === undefined ? account.authorURL : backupContent.authorURL
  const files = (await Promise.all(filesToUpload.map(async (x) => {
    if (x.attrs === undefined) {
      return
    }
    const isHref = x.attrs.href !== undefined
    const url = isHref ?
      x.attrs.href : x.attrs.src !== undefined ?
        x.attrs.src : undefined
    if (url === undefined) {
      return
    }
    const file = await uploadFile(url, cookies, uploadFallback)
    if (isHref) {
      x.attrs!.href = file.path
    } else {
      x.attrs!.src = file.path
    }
    return file
  }))).filter((x) => x !== undefined) as TelegraphFile[]
  const page = await createPage(
    title, content,
    account, files,
    authorName, authorURL,
  )
  return page
}