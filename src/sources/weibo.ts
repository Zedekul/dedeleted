import assert from "assert"
import { Readable } from "stream"

import { HTMLElement } from "node-html-parser"

import { CannotAccess, InvalidFormat } from "../errors.js"
import { isImageURL, shallowCopy } from "../utils/common.js"
import { createHTMLElement, parseHTML } from "../utils/html.js"
import { downloadFile, fetchPage } from "../utils/request.js"

import { BaseSource } from "./bases.js"
import { BackupContent, BackupFile, BackupOptions } from "./types.js"
import { getInlines, getTagName } from "../utils/html.js"

export type WeiboOptions = {
  // ...
} & BackupOptions

export type WeiboUser = {
  id: number
  screen_name: string
  description: string
  statuses_count: number | string
  follow_count: number | string
  followers_count: number | string
  avatar_hd: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

export type WeiboDetail = {
  id: string
  bid: string
  source: string
  text: string
  pics?: Array<{ large: { url: string } }>
  reposts_count: number | string
  comments_count: number | string
  attitudes_count: number | string
  page_info?: { type: string; media_info: { stream_url_hd: string } }
  isLongText?: boolean
  retweeted_status?: WeiboDetail
  user: WeiboUser
  created_at: string
  edited_at?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

const WeiboMobileURL = "https://m.weibo.cn"
const WeiboURL = "https://www.weibo.com"
const WeiboAPI = "https://m.weibo.cn/statuses/show?id="
const WeiboURLRegex = /^(https?:\/\/)?(.*?\.)?weibo\.(com|cn)\/.*$/i
const WeiboPathRegex = /(?<type>detail|status|\d+)\/(?<post_id>.+?)\/?$/
type WeiboTypes = "post" | "article"

const Base62Codes = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
const base62Encode = (x: number): string => {
  if (x === 0) {
    return Base62Codes[0]
  }
  const arr = []
  const base = Base62Codes.length
  while (x > 0) {
    const num = x % base
    arr.push(Base62Codes[num])
    x = (x - num) / base
  }
  return arr.reverse().join("")
}

const idToPostID = (weiboID: number): string => {
  const weiboIDString = weiboID.toString()
  let len = weiboIDString.length
  const arr = []
  while (len > 0) {
    const l = len >= 7 ? len - 7 : 0
    const current = parseInt(weiboIDString.slice(l, len), 10)
    let encoded = base62Encode(current)
    if (l > 0) {
      while (encoded.length < 4) {
        encoded = "0" + encoded
      }
    }
    arr.push(encoded)
    len = l
  }
  return arr.reverse().join("")
}

export class Weibo extends BaseSource<WeiboOptions, WeiboDetail> {
  public readonly key = "weibo"

  public testURL(url: string): string | undefined {
    if (!WeiboURLRegex.test(url)) {
      return undefined
    }
    try {
      return this.getID(url)
    } catch {
      return undefined
    }
  }

  getID(url: string): string {
    const { pathname, searchParams } = this.getURL(url)
    let postID = searchParams.get("weibo_id")
    if (postID === null) {
      const m = WeiboPathRegex.exec(pathname)
      if (m === null || m.groups === undefined) {
        throw new InvalidFormat(url)
      }
      postID = m.groups.post_id
    }
    const weiboID = parseInt(postID, 10)
    if (!Number.isNaN(weiboID)) {
      postID = idToPostID(weiboID)
    }
    return `post-${postID}`
  }

  getStandardURL(id: string): string {
    const [type, postID] = id.split("-") as [WeiboTypes, string]
    if (type === "post") {
      return `${WeiboMobileURL}/status/${postID}`
    }
    throw new InvalidFormat(id)
  }

  getTypeName(urlOrid: string): string {
    const id = WeiboURLRegex.test(urlOrid) ? this.getID(urlOrid) : urlOrid
    const type = id.split("-")[0] as WeiboTypes
    switch (type) {
      case "post":
        return "微博"
      case "article":
        return "头条文章"
      default:
        throw new InvalidFormat(type)
    }
  }

  async backupInner(url: string, options: WeiboOptions): Promise<BackupContent<WeiboDetail>> {
    if (options.htmlFromBrowser !== null) {
      return await this.backupFromBrowser(url, options)
    }
    const { id } = options
    const [type, postID] = id.split("-") as [WeiboTypes, string]
    // TODO: support article
    assert(type === "post")
    const weibo = await this.getWeibo(postID, options)
    if (weibo === undefined) {
      throw new CannotAccess(url)
    }
    const standardURL = `${WeiboURL}/${weibo.user.id}/${weibo.bid}`
    const authorName = weibo.user.screen_name
    const authorURL = `${WeiboURL}/${weibo.user.id}`
    const title = `微博存档 - ${weibo.bid}`
    const createdAt = new Date(weibo.created_at)
    const updatedAt = weibo.edited_at === undefined ? undefined : new Date(weibo.edited_at)
    const reposted = []
    if (options.backupReposted && weibo.retweeted_status !== undefined) {
      const repostedID = `post-${weibo.retweeted_status.bid}`
      try {
        const repostedData = await this.backupInner("", shallowCopy(options, { id: repostedID }))
        reposted.push(repostedData)
      } catch {
        // ignored
      }
    }
    const pictures: BackupFile[] =
      weibo.pics === undefined
        ? []
        : weibo.pics.map((pic) => ({
            type: "image",
            source: pic.large.url,
            download: async () =>
              (await downloadFile(
                pic.large.url,
                await options.getCookie(pic.large.url)
              )) as Readable,
          }))
    if (weibo.page_info !== undefined && weibo.page_info.type === "video") {
      const videoURL = weibo.page_info.media_info.stream_url_hd
      pictures.push({
        type: "video",
        source: videoURL,
        download: async () =>
          (await downloadFile(videoURL, await options.getCookie(videoURL))) as Readable,
      })
    }
    const parsedHTML = parseHTML(weibo.text)
    for (const node of parsedHTML.querySelectorAll("span.url-icon > img")) {
      const alt = node.getAttribute("alt")
      node.replaceWith(alt === undefined ? "" : alt)
    }
    const inlineNodes = getInlines(
      parsedHTML,
      options.inlineImages,
      options.uploadVideos,
      options.inlineLinks || options.inlineImages
    )
      .map((node) => {
        if (getTagName(node) === "a") {
          const href = node.getAttribute("href")
          if (href !== undefined && isImageURL(href, url)) {
            const img = createHTMLElement("img", { parentNode: node.parentNode })
            img.setAttribute("src", href)
            node.replaceWith(img)
            return img
          } else if (!options.inlineLinks) {
            return undefined
          }
        }
        return node
      })
      .filter((node) => node !== undefined) as HTMLElement[]
    return {
      id,
      title,
      authorName,
      authorURL,
      createdAt,
      updatedAt,
      source: standardURL,
      parsedHTML,
      inlineNodes,
      otherFiles: pictures,
      data: weibo,
      reposted,
    }
  }

  async getWeibo(postID: string, options: BackupOptions): Promise<WeiboDetail | undefined> {
    try {
      const response = await fetchPage(WeiboAPI + postID, options.getCookie, options.setCookie)
      const data = (await response.json()) as unknown as {
        ok: number
        data?: WeiboDetail
      }
      return data.ok === 1 ? data.data : undefined
    } catch {
      return undefined
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  backupFromBrowser(_url: string, _options: WeiboOptions): Promise<BackupContent<WeiboDetail>> {
    // TODO
    throw new Error("Method not implemented.")
  }
}
