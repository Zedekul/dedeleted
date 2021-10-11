import { HTMLElement, Node } from "node-html-parser"

import { ConfigError } from "../errors"
import { createPage } from "./api"

import { DOMToNodeHandler, TelegraphAccount, TelegraphContentNode, TelegraphContentNodeElement, TelegraphPage } from "./types"

export const DefaultTelegraphAccount: TelegraphAccount = (() => {
  const token = process.env.DEFAULT_TELEGRAPH_ACCOUNT_TOKEN
  if (token === undefined) {
    throw new ConfigError("DEFAULT_TELEGRAPH_ACCOUNT_TOKEN")
  }
  return {
    accessToken: token,
    shortName: "Dedeleted",
    authorName: "Dedeleted",
    authorURL: "https://t.me/DedeletedBot"
  } as TelegraphAccount
})()

export const domToNodes = <T = any>(
  domNode: Node,
  domToNodeHandler?: DOMToNodeHandler<T>,
  ctx?: T
): TelegraphContentNode[] => {
  if (domNode.nodeType === 3) {
    return [ domNode.text ]
  }
  if (domNode.nodeType !== 1) {
    return [ "" ]
  }
  const dom = domNode as HTMLElement
  let nodes: TelegraphContentNode[] | undefined
  if (domToNodeHandler !== undefined) {
    nodes = domToNodeHandler(dom, ctx)
  }
  if (nodes === undefined) {
    const tag = dom.tagName.toLowerCase()
    if (tag === "img") {
      const img = {
        tag,
        attrs: "src" in dom.attributes ? { src: dom.attributes.src } : undefined
      }
      nodes = [{
        tag: "figure",
        children: [ img ]
      }]
    } else if (tag === "a") {
      nodes = [{
        tag,
        attrs: "href" in dom.attributes ? { href: dom.attributes.href } : undefined
      }]
    } else {
      nodes = [{ tag }]
    }
    if (dom.childNodes.length > 0) {
      (nodes[0] as TelegraphContentNodeElement).children = flattenNodes(dom.childNodes.map(
        (child) => domToNodes(child, domToNodeHandler)
      ))
    }
  }
  return nodes
}

export const flattenNodes = (arrayOfNodes: TelegraphContentNode[][]): TelegraphContentNode[] => {
  return ([] as TelegraphContentNode[]).concat(...arrayOfNodes)
}

const UploadByteLimit = 64000

export const createPages = async (
  title: string, content: TelegraphContentNode[],
  account: TelegraphAccount,
  authorName?: string, authorURL?: string
): Promise<TelegraphPage[]> => {
  let s = JSON.stringify(content)
  let nodes = JSON.parse(s) as TelegraphContentNode[]
  const pages: TelegraphPage[] = []
  let i = 0
  while (nodes.length > 0) {
    const current: TelegraphContentNode[] = []
    if (Buffer.byteLength(s, "utf-8") <= UploadByteLimit) {
      for (const each of nodes) {
        current.push(each)
      }
      nodes = []
    } else {
      // TODO
    }
    pages.push(await createPage(i === 0 ? title : title + (i + 1), current, account, authorName, authorURL))
    s = JSON.stringify(nodes)
    i += 1
  }
  return pages
}