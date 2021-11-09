import { HTMLElement, Node } from "node-html-parser"

export const getInlines = (root: HTMLElement, image = true, link = true): HTMLElement[] => {
  const results = [] as HTMLElement[]
  const walk = (node: Node) => {
    if (node.nodeType !== 1) {
      return
    }
    const dom = node as HTMLElement
    const tag = dom.tagName.toLowerCase()
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
