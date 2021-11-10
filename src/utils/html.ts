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
    return
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

export function querySelector(dom: HTMLElement, ...selectors: string[]): HTMLElement | null {
  for (const s of selectors) {
    const t = dom.querySelector(s)
    if (t) {
      return t as HTMLElement
    }
  }
  return null
}

export function selectText(dom: HTMLElement, ...selectors: string[]): string | null {
  const t = querySelector(dom, ...selectors)
  return t ? t.text.trim() : null
}

const isEmptyNode = (node: Node): boolean => {
  if (node.nodeType === 3) {
    return node.text.trim().length === 0
  }
  const s = node as HTMLElement
  if (s.tagName === undefined) {
    return s.childNodes.length === 0
  }
  const tag = s.tagName.toLowerCase()
  if (tag === "img" || tag === "video") {
    return false
  }
  return s.childNodes.length === 0
}

export const trimNode = (node: Node, recursive = true): Node | undefined => {
  if (node.nodeType === 3) {
    // Allow at most 1 empty line
    node.textContent = node.textContent
      .replace(/\n[^\S\n]+/g, "\n")
      .replace(/\n\s*\n/g, "\n")
    return node
  }
  const dom = node as HTMLElement
  let children = dom.childNodes
  if (recursive) {
    children = children
      .map(x => trimNode(x, true))
      .filter(x => x !== undefined) as Node[]
  }
  while (children.length > 0) {
    const s = children[children.length - 1]
    if (isEmptyNode(s)) {
      children.pop()
    } else {
      if (s.nodeType === 3) {
        s.textContent = s.textContent.trimLeft()
      }
      break
    }
  }
  while (children.length > 0) {
    const s = children[0]
    if (isEmptyNode(s)) {
      children.shift()
    } else {
      if (s.nodeType === 3) {
        s.textContent = s.textContent.trimRight()
      }
      break
    }
  }
  dom.childNodes = children
  const tag = dom.tagName.toLowerCase()
  if (
    children.length === 1 &&
    tag !== "img" &&
    tag !== "a"
  ) {
    const child = children[0] as HTMLElement
    if (child.tagName !== undefined && child.tagName.toLowerCase() === tag) {
      return child
    }
  }
  return dom
}