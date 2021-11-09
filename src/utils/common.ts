export const dateToString = (date: Date): string =>
  date.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai"})
