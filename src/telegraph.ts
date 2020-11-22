import { Readable } from "stream"

import { UploadFunction } from "./utils"
import { downloadFile, request } from "./request"
import { DedeletedError } from "./types"
import { v4 as uuid } from "uuid"
import FormData from "form-data"
import fetch from "node-fetch"

export const TelegraphAPI = "https://api.telegra.ph/"
export const TelegraphUploadAPI = "https://telegra.ph/upload"

export interface TelegraphAccount {
  accessToken: string
  shortName: string
  authorName?: string
  authorURL?: string
}

const DefaultAccount = process.env.DEFAULT_TELEGRAPH_ACCOUNT_TOKEN === undefined
  ? undefined : {
    accessToken: process.env.DEFAULT_TELEGRAPH_ACCOUNT_TOKEN,
    shortName: "Dedeleted",
    authorName: "Dedeleted",
    authorURL: "https://t.me/DedeletedBot"
  }

export const createTelegraphAccount = async (
  shortName: string, authorName?: string, authorURL?: string
): Promise<TelegraphAccount> => {
  const response = await request(`${ TelegraphAPI }createAccount`, "POST", undefined, {
    body: JSON.stringify({
      short_name: shortName,
      author_name: authorName,
      author_url: authorURL
    }),
    headers: { "Content-Type": "application/json" }
  })
  const created = await response.json() as {
    ok: boolean,
    error: any,
    result: {
      short_name: string,
      author_name: string,
      author_url: string,
      access_token: string
    }
  }
  if (created === undefined || !created.ok) {
    throw new DedeletedError(created === undefined ? "无法新建 Telegra.ph 帐号。" : created.error)
  }
  return {
    accessToken: created.result.access_token,
    shortName: created.result.short_name,
    authorName: created.result.author_name,
    authorURL: created.result.author_url
  }
}

export const getAccount = (account?: TelegraphAccount): TelegraphAccount | undefined =>
  account !== undefined ? account : DefaultAccount

export type TelegraphContentNode = string | TelegraphContentNodeElement

export interface TelegraphContentNodeElement {
  tag: string,
  attrs?: {
    href?: string,
    src?: string
  },
  children?: TelegraphContentNode[]
}

export interface TelegraphContent {
  content: TelegraphContentNode[]
  filesToUpload: TelegraphContentNodeElement[]
  title?: string
  authorName?: string
  authorURL?: string
}

export interface TelegraphFile {
  id: string
  path: string
  source: string
}

export interface TelegraphPage {
  path: string
  url: string
  title: string
  description: string
  files: TelegraphFile[]
}

const getDefaultImage = (source: string): TelegraphFile => ({
  id: "deleted-weibo-image",
  path: "/file/8294ffae080bc4534dddd.png",  // Sorry for the hard-coded path.
  source
})

export const uploadFile = async (
  source: string, cookie: string, id: string = uuid(), fallback?: UploadFunction
): Promise<TelegraphFile> => {
  let stream
  try {
    stream = await downloadFile(source, cookie)
  } catch (e) {
    if (e.isDedeletedError) {
      return getDefaultImage(source)
    }
  }
  if (stream === undefined) {
    throw new DedeletedError("Cannot download the source file.")
  }
  const tphFile = {
    id,
    path: "",
    source
  }
  const form = new FormData()
  form.append("file", stream, {
    filename: tphFile.id
  })
  let uploaded = await (await fetch(TelegraphUploadAPI, {
    method: "POST",
    body: form
  })).json()
  if (uploaded === undefined || uploaded.error !== undefined) {
    if (fallback === undefined) {
      return getDefaultImage(source)
      // throw new DedeletedError(uploaded === undefined ? "Cannot upload the file." : uploaded.error)
    }
    const stream2 = await downloadFile(source, cookie)
    uploaded = [{ src: await fallback(stream2 as Readable, tphFile.id) }]
  }
  tphFile.path = uploaded[0].src
  return tphFile
}

export const createPage = async (
  title: string, content: TelegraphContentNode[],
  account: TelegraphAccount, files: TelegraphFile[],
  authorName?: string, authorURL?: string,
): Promise<TelegraphPage> => {
  const response = await request(`${ TelegraphAPI }createPage`, "POST", undefined, {
    body: JSON.stringify({
      access_token: account.accessToken,
      title, content,
      author_name: authorName === undefined ? account.authorName : authorName,
      author_url: authorURL === undefined ? account.authorURL : authorURL
    }),
    headers: { "Content-Type": "application/json" }
  })
  const created = await response.json()
  if (created === undefined || !created.ok) {
    throw new DedeletedError(created === undefined ? "Failed to create a telegraph page." : created.error)
  }
  const page = created.result as TelegraphPage
  page.files = files
  return page
}