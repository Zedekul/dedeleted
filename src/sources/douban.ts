import { parse as parseHTML, HTMLElement } from "node-html-parser"

import { InvalidFormat } from "../errors.js"
import { getInlines, querySelector, selectText, trimNode } from "../utils/html.js"
import { fetchPage } from "../utils/request.js"

import { BaseSource } from "./bases.js"
import { BackupContent, BackupOptions } from "./types.js"

export type DoubanOptions = {
} & BackupOptions

export type DoubanData = {
  // ...
}

const DoubanURLRegex = /^(https?:\/\/)?(.*?\.)?douban\.com\/.*$/
const DoubanPathRegex = /(?<key>(review)|(note)|(status)|(topic))\/(?<id>\d*)\/?$/
type DoubanTypes = "review" | "note" | "status" | "topic"

export class Douban extends BaseSource<DoubanOptions, DoubanData> {
  public readonly key = "douban"

  public testURL(url: string): string | undefined {
    url = url.toLowerCase()
    if (!DoubanURLRegex.test(url)) {
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
    const m = DoubanPathRegex.exec(pathname)
    if (m === null || m.groups === undefined) {
      throw new InvalidFormat(url)
    }
    const { key, id } = m.groups
    return `${key}-${id}`
  }

  getTypeName(urlOrid: string): string {
    const id = DoubanURLRegex.test(urlOrid) ? this.getID(urlOrid) : urlOrid
    const type = id.split("-")[0] as DoubanTypes
    switch (type) {
      case "review": return "书评/影评"
      case "note": return "笔记"
      case "status": return "广播"
      case "topic": return "话题"
      default: throw new InvalidFormat(type)
    }
  }

  async backupInner(url: string, options: DoubanOptions): Promise<BackupContent<DoubanData>> {
    const html = options.htmlFromBrowser || await (await fetchPage(
      url, options.getCookie, options.setCookie
    )).text()
    const htmlDOM = parseHTML(html)
    const [type, id] = options.id.split("-") as [DoubanTypes, string]
    const title = selectText(
      htmlDOM, ".note-header > h1", ".article > h1", ".content > h1"
    ) || `豆瓣备份 - ${id}`
    const authorNode = querySelector(htmlDOM, ".note-author", ".from > a", ".lnk-people", ".hd-main > a")
    if (authorNode === null) {
      throw new InvalidFormat(url)
    }
    const authorName = authorNode.text.trim()
    const authorURL = authorNode.getAttribute("href")
    const timeString = selectText(htmlDOM, ".pubtime", ".pub-date", ".create-time", ".main-meta")
    const createdAt = timeString === null ? new Date() : new Date(Date.parse(
      timeString.trim() + "+0800"
    ))
    let metaString = ""
    if (type === "review") {
      metaString += "评论 " + selectText(htmlDOM, ".main-hd > a:last-of-type")
      metaString += " " + querySelector(htmlDOM, ".main-title-rating")?.getAttribute("title")
    } else if (type === "topic") {
      metaString += "小组：" + selectText(htmlDOM, ".bd .group-item .title")
    }
    const articleDOM = querySelector(
      htmlDOM,
      "#link-report",
      ".note-content", ".topic-content",
      ".saying",
      ".status-saying"
    )
    if (articleDOM === null) {
      throw new InvalidFormat(url)
    }
    const parsedHTML = trimNode(articleDOM, true) as HTMLElement
    const inlineNodes = getInlines(parsedHTML, options.inlineImages, options.inlineLinks)
    return {
      id: options.id,
      title,
      authorName,
      authorURL,
      metaString,
      createdAt,
      updatedAt: createdAt,
      source: url,
      parsedHTML,
      inlineNodes,
      otherFiles: [],
      data: {},
      reposted: []
    }
  }
}