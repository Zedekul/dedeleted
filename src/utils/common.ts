export const dateToString = (date: Date): string =>
  date.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai"})

export const shallowCopy = <T>(
  obj: T, changes: Partial<T> = {}
): T => Object.assign(Object.assign({}, obj), changes)

export const isImageURL = (src: string, base?: string): boolean => {
  const url = new URL(src, base)
  const ext = url.pathname.split(".").pop()
  return ext !== undefined && /^(jpg|jpeg|png|gif|bmp)$/.test(ext)
}