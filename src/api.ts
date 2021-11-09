import { BackupOptions, BackupResult } from "./sources/types"
import { Zhihu } from "./sources/zhihu"

const sources = [
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
