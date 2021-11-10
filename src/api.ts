import { BackupOptions, BackupResult } from "./sources/types.js"

import { Douban } from "./sources/douban.js"
import { Zhihu } from "./sources/zhihu.js"

const sources = [
  new Douban(),
  new Zhihu()
]

export const backup = async <T extends BackupOptions=BackupOptions>(
  url: string, options: Partial<T> = {}
): Promise<BackupResult | undefined> => {
  for (const source of sources) {
    const id = source.testURL(url)
    if (id !== undefined) {
      return await source.backup(url, options)
    }
  }
  return undefined
}
