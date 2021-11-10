import { BackupOptions, BackupResult } from "./sources/types.js"

import { Douban } from "./sources/douban.js"
import { Weibo } from "./sources/weibo.js"
import { Zhihu } from "./sources/zhihu.js"

export const douban = new Douban()
export const weibo = new Weibo()
export const zhihu = new Zhihu()
export const sources = {
  douban, weibo, zhihu
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
