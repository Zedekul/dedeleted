import { HTMLElement } from "node-html-parser"

export interface TelegraphAccount {
  access_token: string
  short_name: string
  author_name?: string
  author_url?: string
}

export interface TelegraphAccountInfo {
  short_name: string
  author_name: string
  author_url: string
  auth_url: string
  page_count: number
}

export type TelegraphContentNode = string | TelegraphContentNodeElement

export interface TelegraphContentNodeElement {
  tag: string
  attrs?: {
    href?: string
    src?: string
  }
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
  author_name: string
  views: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DOMToNodeHandler<T = any> = (
  dom: HTMLElement,
  ctx?: T
) => TelegraphContentNode[] | undefined
