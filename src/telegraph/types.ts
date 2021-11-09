import { HTMLElement } from "node-html-parser"

export interface TelegraphAccount {
  accessToken: string
  shortName: string
  authorName?: string
  authorURL?: string
}

export type TelegraphContentNode = string | TelegraphContentNodeElement

export interface TelegraphContentNodeElement {
  tag: string,
  attrs?: {
    href?: string,
    src?: string
  },
  children?: TelegraphContentNode[]
}

export interface TelegraphFile {
  id: string
  path: string
  source: string
}

export interface TelegraphPage {
  path: string
  url: string
  title: string
  description: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DOMToNodeHandler<T = any> = (
  dom: HTMLElement,
  ctx?: T
) => TelegraphContentNode[] | undefined
