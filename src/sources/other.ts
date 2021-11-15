import { Readable } from "stream"
import { HTMLElement } from "node-html-parser"

import { getInlines, parseHTML, selectText, trimNode } from "../utils/html.js"
import { downloadFile, fetchPage } from "../utils/request.js"

import { BaseSource } from "./bases.js"
import { BackupContent, BackupFile, BackupOptions } from "./types.js"
import { sha256Hash } from "src/utils/common.js"

// Fallback type for all unsupported sources
export class Other extends BaseSource<BackupOptions, {}> {
  public readonly key = "other"

  public testURL(url: string): string | undefined {
    return undefined
  }

  getID(url: string): string {
    return sha256Hash(url)
  }

  getStandardURL(id: string): string {
    return `other-${id}`
  }

  getTypeName(_: string): string {
    return "其它"
  }

  async backupBinary(url: string, options: BackupOptions): Promise<BackupContent<{}>> {
    const { id } = options
    const otherFiles: BackupFile[] = [{
      type: "auto",
      source: url,
      download: async () => await downloadFile(url, await options.getCookie(url)) as Readable
    }]
    const fileName = url.split("/").pop() || url
    return {
      id,
      title: `其它存档：${fileName}`,
      createdAt: new Date(),
      source: url,
      parsedHTML: new HTMLElement("div", {}, "", null),
      inlineNodes: [],
      otherFiles,
      data: {},
      reposted: []
    }
  }

  async backupInner(url: string, options: BackupOptions): Promise<BackupContent<{}>> {
    let html = options.htmlFromBrowser || undefined
    const response = await fetchPage(
      url, options.getCookie, options.setCookie
    )
    const contentType = response.headers.get("content-type")
    const { id } = options
    if (contentType && !contentType.includes("text/")) {
      return await this.backupBinary(url, options)
    }
    html = await response.text()
    const htmlDOM = parseHTML(html)
    const title = selectText(htmlDOM, "title") || `其它存档：${id}`
    const parsedHTML = trimNode(htmlDOM) as HTMLElement
    const inlineNodes = getInlines(
      parsedHTML,
      options.inlineImages,
      options.uploadVideos,
      options.inlineLinks
    )
    return {
      id,
      title,
      createdAt: new Date(),
      source: url,
      parsedHTML,
      inlineNodes,
      otherFiles: [],
      data: {},
      reposted: []
    }
  }
}