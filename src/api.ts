import { BackupOptions, BackupResult } from "./sources/types.js"

import { Douban } from "./sources/douban.js"
import { Zhihu } from "./sources/zhihu.js"
import { Wechat } from "./sources/wechat.js"
import { Weibo } from "./sources/weibo.js"

export const douban = new Douban()
export const wechat = new Wechat()
export const weibo = new Weibo()
export const zhihu = new Zhihu()

export const sources = {
  douban,
  wechat,
  weibo,
  zhihu
}

export const backup = async <T extends BackupOptions=BackupOptions>(
  url: string, options: Partial<T> = {}
): Promise<BackupResult | undefined> => {
  for (const source of Object.values(sources)) {
    const id = source.testURL(url)
    if (id !== undefined) {
      return await source.backup(url, options)
    }
  }
  return undefined
}
