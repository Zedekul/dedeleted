import { BackupResult } from "./sources/types.js"
import { BaseSource } from "./sources/bases.js"

import { Douban } from "./sources/douban.js"
import { Zhihu } from "./sources/zhihu.js"
import { Wechat } from "./sources/wechat.js"
import { Weibo } from "./sources/weibo.js"

import { Twitter } from "./sources/twitter.js"

import { Other } from "./sources/other.js"

export const douban = new Douban()
export const wechat = new Wechat()
export const weibo = new Weibo()
export const zhihu = new Zhihu()

export const twitter = new Twitter()

export const other = new Other()

export const sources = {
  douban,
  wechat,
  weibo,
  zhihu,

  twitter,

  other,
}

type extractOptions<T> = T extends BaseSource<infer O> ? O : never
export type BackupOptions = extractOptions<typeof sources[keyof typeof sources]>

export const backup = (
  url: string,
  options: Partial<BackupOptions> = {}
): Promise<BackupResult | undefined> => {
  const sourceKey = options.sourceKey
  if (sourceKey !== undefined && sourceKey in sources) {
    return sources[sourceKey as keyof typeof sources].backup(url, options)
  }
  for (const source of Object.values(sources)) {
    const id = source.testURL(url)
    if (id !== undefined) {
      options.id = id
      return source.backup(url, options)
    }
  }
  return other.backup(url, options)
}
