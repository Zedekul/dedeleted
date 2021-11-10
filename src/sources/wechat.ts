import { parse as parseHTML, HTMLElement } from "node-html-parser"

import { InvalidFormat } from "../errors.js"
import { getInlines, getTagName, selectText, trimNode } from "../utils/html.js"
import { fetchPage } from "../utils/request.js"

import { BaseSource } from "./bases.js"
import { BackupContent, BackupOptions } from "./types.js"

export type WechatOptions = {
} & BackupOptions

export type WechatData = {
  // ...
}

const getCreatedAt = (htmlDOM: HTMLElement): Date => {
  for (const node of htmlDOM.querySelectorAll("script")) {
    const m = /var ct = "(?<createTime>\d+)";/.exec(node.text)
    if (m === null || m.groups === undefined) {
      continue
    }
    const ct = parseInt(m.groups.createTime, 10)
    return new Date(ct * 1000)
  }
  return new Date()
}

const WechatURL = "https://mp.weixin.qq.com"
const WechatURLRegex = /^(https?:\/\/)?mp\.weixin\.qq\.com\/.*$/
const WechatPathRegex = /^\/(?<key>.+)\/(?<postID>.+?)\/?(?<query>\?.*)?$/
type WechatTypes = "article"

export class Wechat extends BaseSource<WechatOptions, WechatData> {
  public readonly key = "wechat"

  public testURL(url: string): string | undefined {
    url = url.toLowerCase()
    if (!WechatURLRegex.test(url)) {
      return undefined
    }
    try {
      return this.getID(url)
    } catch {
      return undefined
    }
  }

  getID(url: string): string {
    const { pathname } = this.getURL(url)
    const m = WechatPathRegex.exec(pathname)
    if (m === null || m.groups === undefined) {
      throw new InvalidFormat(url)
    }
    const { key, postID } = m.groups
    if (key !== "s") {
      throw new InvalidFormat(url)
    }
    return `article-${postID}`
  }

  getStandardURL(id: string): string {
    const [ type, postID ] = id.split("-") as [WechatTypes, string]
    return `${WechatURL}/s/${postID}`
  }

  getTypeName(urlOrid: string): string {
    const id = WechatURLRegex.test(urlOrid) ? this.getID(urlOrid) : urlOrid
    const type = id.split("-")[0] as WechatTypes
    switch (type) {
      case "article": return "公众号文章"
      default: throw new InvalidFormat(type)
    }
  }

  async backupInner(url: string, options: any): Promise<BackupContent<any>> {
    const html = options.htmlFromBrowser || await (await fetchPage(
      url, options.getCookie, options.setCookie
    )).text()
    const htmlDOM = parseHTML(html)
    let content = htmlDOM.querySelector("#js_content")
    if (content === null) {
      throw new InvalidFormat(url)
    }
    content = trimNode(content) as HTMLElement
    const { id } = options
    const [type, postID] = id.split("-") as [WechatTypes, string]
    const title = selectText(htmlDOM, "#activity-name") || `微信存档 - ${postID}`
    const authorName = selectText(htmlDOM, "#js_name") || "未知"
    const authorURL = ""  // TODO
    const metaString = `公众号：${selectText(htmlDOM, ".rich_media_meta_text")}`
    const createdAt = getCreatedAt(htmlDOM)
    const inlineNodes = getInlines(
      content,
      options.inlineImages,
      options.uploadVideos,
      options.inlineLinks
    )
    for (const node of inlineNodes) {
      if (getTagName(node) === "img") {
        const src = node.getAttribute("data-src")
        if (src !== undefined) {
          node.setAttribute("src", src)
        }
      }
    }
    return {
      id,
      title,
      authorName,
      authorURL,
      createdAt,
      source: url,
      parsedHTML: content,
      inlineNodes,
      otherFiles: [],
      metaString,
      data: {},
      reposted: []
    }
  }
}