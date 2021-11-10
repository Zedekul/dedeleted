import { Readable } from "node:stream"
import { URL } from "node:url"

import { HTMLElement } from "node-html-parser"

import { uploadMediaFile, uploadMediaFromSource } from "../telegraph/api.js"
import { TelegraphContentNode, TelegraphPage } from "../telegraph/types.js"
import { createPages, DefaultTelegraphAccount, domToNodes } from "../telegraph/utils.js"
import { s3CreateUploadFunction } from "../utils/aws.js"
import { dateToString, shallowCopy } from "../utils/common.js"
import { getDownloadable, getTagName } from "../utils/html.js"
import { downloadFile } from "../utils/request.js"
import { UploadFunction } from "../utils/types.js"

import { BackupContent, BackupFile, BackupOptions, BackupResult, BackupSource } from "./types.js"


export const configOptions = <TO extends BackupOptions>(options: Partial<TO>) => {
  options = shallowCopy(options)
  return {
    set<TK extends keyof TO>(key: TK, defaultValue: TO[TK]) {
      if (options[key] === undefined) {
        options[key] = defaultValue
      }
      return this
    },
    setWith<TK extends keyof TO>(key: TK, getDefaultValue: () => TO[TK]) {
      if (options[key] === undefined) {
        options[key] = getDefaultValue()
      }
      return this
    },
    done: () => options
  }
}


export abstract class BaseSource<
  TO extends BackupOptions = BackupOptions,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TR = any
> implements BackupSource {
  public readonly abstract key: string
  public abstract testURL(url: string): string | undefined

  protected prepareOptions<T extends BackupOptions>(url: string, options: Partial<T>): Partial<T> {
    return configOptions(options)
      .setWith("id", () => this.getID(url))
      .set("force", false)
      .set("checkExisting", async () => undefined)
      .set("getCookie", async () => undefined)
      .set("setCookie", async () => undefined)
      .set("createTelegraphPage", true)
      .set("telegraphAccount", DefaultTelegraphAccount)
      .set("allowMissingContent", true)
      .set("uploadVideos", false)
      .set("inlineImages", true)
      .set("inlineLinks", false)
      .set("awsS3Settings", null)
      .set("plainText", false)
      .set("textLengthLimit", 3072)
      .set("htmlFromBrowser", null)
      .done() as BackupOptions & Partial<T>
  }

  protected getURL(url: string, protocol = "https"): URL {
    if (!url.startsWith("http")) {
      url = `${protocol}://${url}`
    }
    return new URL(url)
  }

  public async backup(
    url: string,
    options: Partial<TO> = {}
  ): Promise<BackupResult> {
    const o = this.prepareOptions(url, options) as TO
    if (!o.force) {
      const existing = await o.checkExisting(o.id)
      if (existing !== undefined) {
        return existing
      }
    }
    const s3 = o.awsS3Settings
    const fallback = s3 === null
      ? undefined
      : s3CreateUploadFunction("dedeleted", s3.accessPoint, s3.accountID, s3.bucket, s3.region)
    const backupContent = await this.backupInner(url, o)
    const result = await this.uploadContent(backupContent, o, fallback)
    return this.prepareResult(backupContent, result, o)
  }

  protected async uploadContent(
    raw: BackupContent<TR>,
    options: TO,
    fallback?: UploadFunction,
  ): Promise<BackupResult<TR>> {
    const reposted = options.backupReposted
      ? await Promise.all(raw.reposted.map((x) => this.uploadContent(x, options, fallback)))
      : []
    let files = await this.uploadInlines(raw, options, fallback)
    files = files.concat(await this.uploadFiles(raw, options, fallback))
    const result: BackupResult<TR> = {
      id: raw.id,
      sourceKey: this.key,
      source: raw.source,
      pages: [],
      content: raw.parsedHTML.outerHTML,
      files,
      otherData: raw.data,
      reposted
    }
    if (options.createTelegraphPage) {
      result.pages = await this.uploadPages(raw, result, options)
    }
    return result
  }

  protected async uploadInlines(
    raw: BackupContent<TR>,
    options: TO,
    fallback?: UploadFunction
  ): Promise<BackupFile[]> {
    const { source, id, inlineNodes } = raw
    const files = await Promise.all(inlineNodes.map(async (node, i) => {
      if (node.nodeType !== 1) {
        return
      }
      const tag = getTagName(node)
      if (tag === "img" || tag === "video") {
        const src = node.getAttribute("src")
        const d = getDownloadable(src, source)
        if (d === undefined) {
          return
        }
        const telegraphFile = await uploadMediaFromSource(
          d,
          await options.getCookie(d), `${id}-inline-${i}`,
          fallback
        )
        node.setAttribute("src", telegraphFile.path)
        return {
          type: "image",
          uploaded: telegraphFile.path
        } as BackupFile
      } else if (tag === "a" && fallback !== undefined) {
        const href = node.getAttribute("href")
        const d = getDownloadable(href, source)
        if (d === undefined) {
          return
        }
        const stream = await downloadFile(d, await options.getCookie(d))
        const uploaded = await fallback(stream as Readable, `${id}-inline-${i}`)
        node.setAttribute("href", uploaded)
        return {
          type: "file",
          uploaded
        } as BackupFile
      }
    }))
    return files.filter((x): x is BackupFile => x !== undefined)
  }

  protected async uploadFiles(
    raw: BackupContent<TR>, options: TO,
    fallback?: UploadFunction
  ): Promise<BackupFile[]> {
    return await Promise.all(raw.otherFiles.map(async (file, i) => {
      switch (file.type) {
        case "video":
          if (!options.uploadVideos) {
            return file
          }
        // eslint-disable-next-line no-fallthrough
        case "image":
          if (file.download !== undefined) {
            try {
              file.uploaded = (await uploadMediaFile(file.source, file.download, `${raw.id}-${i}`, fallback)).path
            } catch (e) {
              if (!options.allowMissingContent) {
                throw e
              }
            }
            delete file.download
          }
          break
        case "file":
          if (fallback !== undefined && file.download !== undefined) {
            try {
              file.uploaded = await fallback(await file.download(), `${raw.id}-${i}`)
            } catch (e) {
              if (!options.allowMissingContent) {
                throw e
              }
            }
            delete file.download
          }
          break
      }
      return file
    }))
  }

  protected async uploadPages(raw: BackupContent, result: BackupResult<TR>, options: TO): Promise<TelegraphPage[]> {
    const nodes = domToNodes(raw.parsedHTML, this.domToNodeHandler, options)
    if (result.reposted.length > 0) {
      const repostedChildren: TelegraphContentNode[] = ["转发自：",]
      nodes.unshift({
        tag: "p",
        children: repostedChildren
      })
      for (const each of result.reposted) {
        for (const page of each.pages) {
          repostedChildren.push({
            tag: "a",
            attrs: { href: page.path },
            children: [page.title]
          })
        }
      }
    }
    nodes.unshift({
      tag: "p",
      children: ["原链接：", {
        tag: "a",
        attrs: { href: raw.source },
        children: [raw.source]
      }, `\n发表于：${dateToString(raw.createdAt)}`,
        raw.updatedAt === undefined
        ? ""
        : `\n更新于：${dateToString(raw.updatedAt)}`,
      raw.metaString || "" ]
    })
    if (raw.otherFiles.length > 0) {
      const attachedChildren: TelegraphContentNode[] = ["附件：",]
      nodes.push("\n")
      nodes.push({
        tag: "div",
        children: attachedChildren
      })
      for (const attached of raw.otherFiles) {
        switch (attached.type) {
          case "file": {
            const href = attached.uploaded ?? attached.source
            attachedChildren.push({
              tag: "a",
              attrs: { href },
              children: [href]
            })
            break
          }
          case "video":
          // eslint-disable-next-line no-fallthrough
          case "image": {
            const src = attached.uploaded ?? attached.source
            attachedChildren.push({
              tag: "figure",
              children: [{
                tag: attached.type === "image" ? "img" : "video",
                attrs: { src }
              }]
            })
            break
          }
        }
      }
    }
    const pages = await createPages(
      raw.title, nodes,
      options.telegraphAccount,
      raw.authorName, raw.authorURL
    )
    return pages
  }

  protected prepareResult(
    raw: BackupContent<TR>,
    result: BackupResult<TR>,
    options: TO
  ): BackupResult<TR> {
    let content = raw.parsedHTML.outerHTML
    const text = raw.parsedHTML.structuredText
      .replace(/\n\s+\n/g, "\n")
    const limit = options.textLengthLimit
    if (text.length > limit) {
      content = text.substr(0, options.textLengthLimit)
    } else if (options.plainText) {
      content = text
    }
    result.content = content
    return result
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected domToNodeHandler(dom: HTMLElement, options?: TO): TelegraphContentNode[] | undefined {
    return undefined
  }

  abstract getID(url: string): string
  abstract getTypeName(urlOrid: string): string
  abstract backupInner(url: string, options: TO): Promise<BackupContent<TR>>
}
