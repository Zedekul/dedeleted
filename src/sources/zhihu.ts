import assert from "node:assert"

import { parse as parseHTML } from "node-html-parser"

import { CannotAccess, DedeletedError, InvalidFormat } from "../errors.js"
import { getInlines } from "../utils/html.js"
import { fetchPage } from "../utils/request.js"

import { BaseSource } from "./bases.js"
import { BackupContent, BackupOptions } from "./types.js"

export type ZhihuOptions = {
} & BackupOptions

export type ZhihuData = {
  id: string
  // ...
}

const ZhihuURLRegex = /^(https?:\/\/)?(.*?\.)?zhihu\.com\/.*$/
const ZhihuPathRegex = /(?<key>(answer)|(p)|(pin)|(question))\/(?<id>\d*)$/
type ZhihuTypes = "answer" | "zhuanlan" | "pin" | "question"

export class Zhihu extends BaseSource<ZhihuOptions> {
  public readonly key = "zhihu"

  public testURL(url: string): string | undefined {
    url = url.toLowerCase()
    if (!ZhihuURLRegex.test(url)) {
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
    const m = ZhihuPathRegex.exec(pathname)
    if (m === null || m.groups === undefined) {
      throw new InvalidFormat(url)
    }
    const { key, id } = m.groups
    return `${key === "p" ? "zhuanlan" : key}-${id}`
  }

  getTypeName(urlOrid: string): string {
    const id = ZhihuURLRegex.test(urlOrid) ? this.getID(urlOrid) : urlOrid
    const type = id.split("-")[0] as ZhihuTypes
    switch (type) {
      case "answer": return "答案"
      case "zhuanlan": return "专栏文章"
      case "pin": return "想法"
      case "question": return "问题"
      default: throw new InvalidFormat(type)
    }
  }

  async backupInner(url: string, options: ZhihuOptions): Promise<BackupContent<ZhihuData>> {
    const html = options.htmlFromBrowser || await (await fetchPage(
      url, options.getCookie, options.setCookie
    )).text()
    const htmlDOM = parseHTML(html)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any
    try {
      const initialData = htmlDOM.querySelector("#js-initialData")
      assert(initialData !== null)
      data = JSON.parse(initialData.text)
        .initialState
      assert(data !== undefined)
    } catch (e) {
      throw new DedeletedError("Failed to parse data", e as Error)
    }
    const entities = data.entities
    if (entities === undefined) {
      throw new CannotAccess(url)
    }
    const [type, id] = options.id.split("-") as [ZhihuTypes, string]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let entity: any
    switch (type) {
      case "answer":
        entity = entities.answers[id]
        break
      case "zhuanlan":
        entity = entities.articles[id]
        break
      case "pin":
        entity = entities.pins[id]
        break
      case "question":
        entity = entities.questions[id]
        break
      default: throw new InvalidFormat(type)
    }
    if (entity === undefined) {
      throw new CannotAccess(url)
    }
    let author: {
      name?: string
      url?: string
    } = {}
    let title = "知乎备份"
    let content: string | undefined
    let reposted: string | undefined
    const createdAt = new Date((entity.created || entity.createdTime) * 1000)
    const updatedAt = new Date((entity.updated || entity.updatedTime) * 1000)
    switch (type) {
      case "answer":
      case "zhuanlan":
        author = entity.author
        content = entity.content
        title = entity.title || `${ entity.question.title } - ${ author.name } 的回答`
        break
      case "pin":
        if (entity.content.length === 0) {
          throw new CannotAccess(url)
        }
        author = entities.users[entity.author]
        content = entity.contentHtml
        title = `${ author.name } 的想法`
        if (entity.originalPin !== undefined) {
          const originalPin = entity.originalPin
          content += `<br>${originalPin.contentHtml}`
        } else if (entity.content !== undefined && entity.content.length > 1) {
          const content = entity.content[entity.content.length - 1]
          if (content.type === "link" && options.backupReposted) {
            reposted = content.url
          }
        }
        break
      case "question":
        author = entity.author
        title = entity.title
        content = entity.detail
        break
      default: throw new InvalidFormat(type)
    }
    if (content === undefined) {
      throw new CannotAccess(url)
    }
    if (reposted != undefined) {
      // TODO: Backup Reposted
    }
    const parsedHTML = parseHTML(content)
    const inlineNodes = getInlines(parsedHTML, options.inlineImages, options.inlineLinks)
    for (const node of inlineNodes) {
      if (node.tagName.toLowerCase() === "img") {
        node.setAttribute(
          "src",
          node.getAttribute("data-original") ||
          node.getAttribute("src") || ""
        )
      }
    }
    return {
      id: options.id,
      title,
      authorName: author.name,
      authorURL: author.url,
      createdAt,
      updatedAt,
      source: url,
      parsedHTML,
      inlineNodes,
      otherFiles: [],
      data: entity,
      reposted: []
    }
  }
}
