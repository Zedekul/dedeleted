import assert from "assert"
import { URL } from "url"

import { parse as parseHTML } from "node-html-parser"

import { CannotAccess, DedeletedError, InvalidFormat } from "../errors"
import { TelegraphContentNodeElement } from "../telegraph/types"
import { fetchPage, request } from "../utils/request"

import { BaseSource } from "./bases"
import { BackupOptions, BackupResult } from "./types"

export type ZhihuOptions = {
} & BackupOptions

const ZhihuURL = "https://www.zhihu.com/"
const ZhihuURLRegex = /^(https?:\/\/)?(.*?\.)?zhihu\.com\/.*$/
const ZhihuPathRegex = /(?<key>(answer)|(p)|(pin)|(question))\/(?<id>\d*)$/
type ZhihuTypes = "answer" | "zhuanlan" | "pin" | "question"

export class Zhihu extends BaseSource<ZhihuOptions> {
  public key = "zhihu"

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

  async backupInner(url: string, options: ZhihuOptions): Promise<BackupResult> {
    const response = await fetchPage(url, options.getCookie, options.setCookie)
    const html = await response.text()
    const htmlDOM = parseHTML(html)
    let data: any
    try {
      data = JSON.parse(htmlDOM.querySelector("#js-initialData").text)
        .initialState
      assert(data !== undefined)
    } catch (e) {
      throw new DedeletedError("Failed to parse data", e)
    }
    const entities = data.entities
    if (entities === undefined) {
      throw new CannotAccess(url)
    }
    const [type, id] = options.id.split("-") as [ZhihuTypes, string]
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
    let content: string | undefined
    let reposted: string | undefined
    switch (type) {
      case "answer":
      case "zhuanlan":
        content = entity.content
        break
      case "pin":
        if (entity.content.length === 0) {
          throw new CannotAccess(url)
        }
        content = entity.content[0]
        reposted = entity.originalPin
        entity = entities.pins[id]
        break
      case "question":
        entity = entities.questions[id]
        break
      default: throw new InvalidFormat(type)
    }
    if (content === undefined) {
      throw new CannotAccess(url)
    }
    const filesToUpload: TelegraphContentNodeElement[] = []
  }
}
