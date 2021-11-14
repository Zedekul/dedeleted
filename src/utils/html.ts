import { HTMLElement, Node } from "node-html-parser"
import parse from "node-html-parser"

export const parseHTML = (html: string): HTMLElement => {
  return parse(html)
}

export const getDownloadable = (url: string | undefined, baseURL?: string): string | undefined => {
  try {
    if (url !== undefined) {
      const u = new URL(url, baseURL)
      if (u.protocol === "http:" || u.protocol === "https:") {
        return u.href
      }
    }
  } catch {
    return
  }
}

export const getInlines = (
  root: HTMLElement,
  image = true,
  video = true,
  link = true
): HTMLElement[] => {
  let results = [] as HTMLElement[]
  if (image) {
    results = results.concat(root.querySelectorAll("img"))
  }
  if (video) {
    results = results.concat(root.querySelectorAll("video"))
  }
  if (link) {
    results = results.concat(root.querySelectorAll("a"))
  }
  return results
}

export const querySelector = (dom: HTMLElement, ...selectors: string[]): HTMLElement | null => {
  for (const s of selectors) {
    const t = dom.querySelector(s)
    if (t) {
      return t as HTMLElement
    }
  }
  return null
}

export const selectText = (dom: HTMLElement, ...selectors: string[]): string | null => {
  const t = querySelector(dom, ...selectors)
  return t ? t.text.trim() : null
}

export const getTagName = (node: Node): string => {
  const s = node as HTMLElement
  return s.tagName ? s.tagName.toLowerCase() : ""
}

const isEmptyNode = (node: Node): boolean => {
  if (node.nodeType === 3) {
    return node.text.trim().length === 0
  }
  const s = node as HTMLElement
  const tag = getTagName(s)
  if (tag === "") {
    return s.childNodes.length === 0
  }
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
  const tag = getTagName(dom)
  if (
    children.length === 1 &&
    tag !== "" &&
    tag !== "img" &&
    tag !== "a" &&
    getTagName(children[0]) === tag
  ) {
    return children[0]
  }
  return dom
}