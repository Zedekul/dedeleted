import { BackupOptions, BackupResult } from "./sources/types.js"

import { Douban } from "./sources/douban.js"
import { Zhihu } from "./sources/zhihu.js"
import { Wechat } from "./sources/wechat.js"
import { Weibo } from "./sources/weibo.js"

import { Other } from "./sources/other.js"

export const douban = new Douban()
export const wechat = new Wechat()
export const weibo = new Weibo()
export const zhihu = new Zhihu()

export const other = new Other()

export const sources = {
  douban,
  wechat,
  weibo,
  zhihu,

  other,
}

export const backup = <T extends BackupOptions = BackupOptions>(
  url: string,
  options: Partial<T> = {}
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
