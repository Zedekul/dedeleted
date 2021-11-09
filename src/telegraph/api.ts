import { Readable, Stream } from "stream"
import { v4 as uuid } from "uuid"

import FormData from "form-data"

import { downloadFile, request } from "../utils/request"
import { UploadFunction } from "../utils/types"
import { CreateFailed, DedeletedError, UploadFailed } from "../errors"
import { TelegraphAccount, TelegraphContentNode, TelegraphFile, TelegraphPage } from "./types"

const TelegraphAPI = "https://api.telegra.ph/"
const TelegraphUploadAPI = "https://telegra.ph/upload"

// Sorry for my hard-coded path.
const getDefaultImage = (source: string): TelegraphFile => ({
  id: "deleted-weibo-image",
  path: "/file/8294ffae080bc4534dddd.png",
  source
})

export const uploadImageFromSource = (
  source: string, cookie?: string, id: string = uuid(), fallback?: UploadFunction
): Promise<TelegraphFile> => uploadImage(source, () => downloadFile(source, cookie), id, fallback)

export const uploadImage = async (
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
  tphFile.path = uploaded[0].src
  return tphFile
}

export const createPage = async (
  title: string, content: TelegraphContentNode[],
  account: TelegraphAccount,
  authorName?: string, authorURL?: string,
): Promise<TelegraphPage> => {
  const response = await request(`${TelegraphAPI}createPage`, "POST", undefined, {
    body: JSON.stringify({
      access_token: account.accessToken,
      title, content,
      author_name: authorName ?? account.authorName,
      author_url: authorURL ?? account.authorURL
    }),
    headers: { "Content-Type": "application/json" }
  })
  const created = await response.json() as { ok: boolean, error?: string, result: TelegraphPage }
  if (created === undefined || !created.ok) {
    throw new CreateFailed(created === undefined ? "telegraph page" : created.error)
  }
  const page = created.result as TelegraphPage
  return page
}
