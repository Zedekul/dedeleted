import { HTMLElement, Node } from "node-html-parser"

export const getDownloadable = (url: string | undefined, baseURL?: string): string | undefined => {
  try {
    if (url !== undefined) {
      const u = new URL(url, baseURL)
      if (u.protocol === "http:" || u.protocol === "https:") {
        return u.toString()
      }
    }
  } catch {
  }
}

export const getInlines = (root: HTMLElement, image = true, link = true): HTMLElement[] => {
  const results = [] as HTMLElement[]
  const walk = (node: Node) => {
    if (node.nodeType !== 1) {
      return
    }
    const dom = node as HTMLElement
    const tag = dom.tagName === null ? null : dom.tagName.toLowerCase()
    if (tag === "img" && image) {
      results.push(dom)
    } else if (tag === "a" && link) {
      results.push(dom)
    } else {
      node.childNodes.forEach(walk)
    }
  }
  root.childNodes.forEach(walk)
  return results
}
