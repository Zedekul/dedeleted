import { InvalidFormat } from "../errors"
import { BaseSource } from "./bases"
import { BackupContent, BackupOptions } from "./types"

export type WeiboOptions = {
} & BackupOptions

export type WeiboData = {
  // ...
}

const WeiboAPI = "https://m.weibo.cn/statuses/show?id="
const WeiboURLRegex = /^(https?:\/\/)?(m\.)?weibo\.(com|cn)\/.*$/
const WeiboPathRegex = /(?<type>detail|status|\d+)\/(?<post_id>.+?)\/?$/
// TODO: support article
type WeiboTypes = "post" | "article"

export class Weibo extends BaseSource<WeiboOptions, WeiboData> {
  public readonly key = "weibo"

  public testURL(url: string): string | undefined {
    url = url.toLowerCase()
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
    const searchID = searchParams.get("weibo_id")
    if (searchID !== null) {
      return searchID
    }
    const m = WeiboPathRegex.exec(pathname)
    if (m === null || m.groups === undefined) {
      throw new InvalidFormat(url)
    }
    const { post_id } = m.groups
    return `post-${post_id}`
  }

  getTypeName(urlOrid: string): string {
    const id = WeiboURLRegex.test(urlOrid) ? this.getID(urlOrid) : urlOrid
    const type = id.split("-")[0] as WeiboTypes
    switch (type) {
      case "post": return "微博"
      case "article": return "头条文章"
      default: throw new InvalidFormat(type)
    }
  }

  async backupInner(url: string, options: WeiboOptions): Promise<BackupContent<WeiboData>> {
    if (options.htmlFromBrowser !== null) {
      return await this.backupFromBrowser(url, options)
    }
    throw new Error("Method not implemented.")
  }

  backupFromBrowser(url: string, options: WeiboOptions): Promise<BackupContent<WeiboData>> {
    throw new Error("Method not implemented.")
  }
}
