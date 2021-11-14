import { Readable, Stream } from "node:stream"

import FormData from "form-data"
import { v4 as uuid } from "uuid"

import { downloadFile, request } from "../utils/request.js"
import { UploadFunction } from "../utils/types.js"
import { CreateFailed, DedeletedError, UploadFailed } from "../errors.js"
import { TelegraphAccount, TelegraphContentNode, TelegraphFile, TelegraphPage } from "./types.js"

const TelegraphURL = "https://telegra.ph"
const TelegraphAPI = "https://api.telegra.ph"
const TelegraphUploadAPI = "https://telegra.ph/upload"

export const createAccount = async (
  shortName: string,
  authorName: string = "",
  authorURL: string = ""
): Promise<TelegraphAccount> => {
  const response = await request(`${TelegraphAPI}/createAccount`, "POST", undefined, {
    body: JSON.stringify({
      short_name: shortName,
      author_name: authorName,
      author_url: authorURL
    }),
    headers: { "Content-Type": "application/json" }
  })
  const created = await response.json() as {
    ok: boolean, error?: string,
    result: TelegraphAccount & { auth_url?: string }
  }
  if (created === undefined || !created.ok) {
    throw new CreateFailed(created === undefined ? "telegraph page" : created.error)
  }
  const page = created.result
  delete page.auth_url
  return page

}

// Sorry for my hard-coded path.
const getDefaultImage = (source: string): TelegraphFile => ({
  id: "deleted-weibo-image",
  path: `${TelegraphURL}/file/8294ffae080bc4534dddd.png`,
  source
})

export const uploadMediaFromSource = (
  source: string,
  cookie?: string,
  id: string = uuid(),
  fallback?: UploadFunction
): Promise<TelegraphFile> => uploadMediaFile(source, () => downloadFile(source, cookie), id, fallback)

export const uploadMediaFile = async (
  source: string,
  download: () => Promise<Stream | undefined>,
  id: string = uuid(), fallback?: UploadFunction
): Promise<TelegraphFile> => {
  let stream
  try {
    stream = await download()
  } catch (e) {
    if ((e as DedeletedError).isDedeletedError) {
      return getDefaultImage(source)
    }
  }
  if (stream === undefined) {
    throw new UploadFailed(`Cannot download the source file ${source}`)
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
  const response = await request(TelegraphUploadAPI, "POST", undefined, {
    body: form
  })
  let uploaded = await response.json() as { error?: string, [index: number]: { src: string } }
  if (uploaded === undefined || uploaded.error !== undefined) {
    if (fallback === undefined) {
      return getDefaultImage(source)
    }
    const stream2 = await download()
    uploaded = [{ src: await fallback(stream2 as Readable, tphFile.id) }]
  }
  tphFile.path = new URL(uploaded[0].src, TelegraphURL).href
  return tphFile
}

export const createPage = async (
  title: string, content: TelegraphContentNode[],
  account: TelegraphAccount,
  authorName?: string, authorURL?: string,
): Promise<TelegraphPage> => {
  const response = await request(`${TelegraphAPI}/createPage`, "POST", undefined, {
    body: JSON.stringify({
      access_token: account.access_token,
      title, content,
      author_name: authorName ?? account.author_name,
      author_url: authorURL ?? account.author_url
    }),
    headers: { "Content-Type": "application/json" }
  })
  const created = await response.json() as {
    ok: boolean, error?: string,
    result: TelegraphPage & { can_edit?: boolean }
  }
  if (created === undefined || !created.ok) {
    throw new CreateFailed(created === undefined ? "telegraph page" : created.error)
  }
  const page = created.result
  delete page.can_edit
  return page
}
