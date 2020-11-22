import { HTMLElement, parse as parseHTML } from "node-html-parser"
import { CookieJar } from "tough-cookie"

import { createUploadFallback, getCookieJar } from "./utils"
import { downloadFile, request } from "./request"
import {
  BackupOptions, BackupResult,
  BackupContext, DedeletedError,
  BackupSource, BackupSources, SourceType, getSourceType
} from "./types"
import { getAccount, TelegraphContent, TelegraphContentNode, TelegraphContentNodeElement } from "./telegraph"
import { uploadPage } from "./backup"

const PCWeiboRegex = /^(https?:\/\/)?(www\.)?weibo\.com\/(?<user_id>\d+)\/(?<post_id>.+?)(\?.*)?$/
const MobileWeiboRegex = /^(https?:\/\/)?m\.weibo\.(cn|com)\/(detail|status|(?<user_id>\d+))\/(?<post_id>.+?)(\?.*)?$/
const IntlWeiboRegex =
  /^(https?:\/\/)?weibointl\.api\.weibo\.(cn|com)\/share\/(?<unknown_numbers>\d+)\.html\?.*weibo_id=(?<post_id>\d+?)(&.*)?$/

const WeiboRegexes = [
  PCWeiboRegex, MobileWeiboRegex, IntlWeiboRegex
]

const testURL = (url: string, ctx?: BackupContext): boolean => {
  for (const each of WeiboRegexes) {
    const m = each.exec(url)
    if (m !== null) {
      if (ctx !== undefined) {
        ctx.regexMatches = m
      }
      return true
    }
  }
  return false
}

const base62Codes = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
const base62Encode = (x: number): string => {
  if (x === 0) {
    return base62Codes[0]
  }
  const arr = []
  const base = base62Codes.length
  while (x > 0) {
    const num = x % base
    arr.push(base62Codes[num])
    x = (x - num) / base
  }
  return arr.reverse().join("")
}

const idToPostID = (weiboID: number): string => {
  const weiboIDString = weiboID.toString()
  let len = weiboIDString.length
  const arr = []
  while (len > 0) {
    const l = len >= 7 ? len - 7 : 0
    const current = parseInt(weiboIDString.slice(l, len), 10)
    let encoded = base62Encode(current)
    if (l > 0) {
      while (encoded.length < 4) {
        encoded = "0" + encoded
      }
    }
    arr.push(encoded)
    len = l
  }
  return arr.reverse().join("")
}

const getPostID = (url: string, m?: RegExpExecArray): string => {
  let postID = (m === undefined || m === null || m.groups === undefined) ? url : m.groups.post_id
  const weiboID = parseInt(postID, 10)
  if (!Number.isNaN(weiboID)) {
    postID = idToPostID(weiboID)
  }
  return postID
}

export interface WeiboDetail {
  id: string
  bid: string
  source: string

  text: string
  pics?: Array<{ large: { url: string } }>

  reposts_count: number
  comments_count: number
  attitudes_count: number

  page_info?: {
    type: string
    media_info: { stream_url_hd: string }
  }

  retweeted_status?: WeiboDetail

  user: {
    id: number
    screen_name: string

    description: string
    statuses_count: number

    follow_count: number
    followers_count: number

    avatar_hd: string
  }
}

export const WeiboURL = "https://m.weibo.cn/"
const WeiboAPI = "https://m.weibo.cn/statuses/show?id="

const getCookies = (cookieJar: CookieJar) => cookieJar.getCookieString(WeiboURL)

const getWeibo = async (
  postID: string, ctx: BackupContext,
  cookieJar: CookieJar
): Promise<WeiboDetail> => {
  let response: { ok: number, data: WeiboDetail }
  try {
    const t = await request(
      WeiboAPI + postID, "GET", await cookieJar.getCookieString(WeiboURL), {
        headers: {
          "Content-Type": "application/json;charset=UTF-8"
        }
      }, async (cookie: string) => {
        await cookieJar.setCookie(cookie, WeiboURL)
      }
    )
    response = await t.json()
  } catch (e) {
    throw new DedeletedError("Cannot access weibo.", e)
  }
  if (response.ok !== 1) {
    throw new DedeletedError("Weibo API broken.")
  }
  return response.data
}

const imageRegex = /^.*\/.+\.(jpg|png|jpeg|gif)\??[^\/]*$/
const createTelegraphContent = (weibo: WeiboDetail): TelegraphContent & { video?: string } => {
  const nodes = (parseHTML(`<span>${ weibo.text }</span>`) as HTMLElement).childNodes[0].childNodes
  let current: TelegraphContentNodeElement | null = null
  const content: TelegraphContentNode[] = []
  const filesToUpload: TelegraphContentNodeElement[] = []
  let i = 0
  while (i < nodes.length) {
    if (current === null) {
      current = { tag: "p", children: [] }
      content.push(current)
    }
    const x = nodes[i]
    if (x.nodeType === 1) {
      const element = x as HTMLElement
      if (element.tagName === "br") {
        if (i + 1 < nodes.length && nodes[i + 1].nodeType === 1 &&
          (nodes[i + 1] as HTMLElement).tagName === "br") {
          i += 1
          current = null
        } else {
          current.children!.push("\n")
        }
      } else if (element.classNames.indexOf("url-icon") >= 0) {
        const y = element.childNodes[0]
        if (y.nodeType === 1) {
          const img = y as HTMLElement
          if (img.attributes.alt !== undefined) {
            current.children!.push(img.attributes.alt)
          }
        }
      } else if (element.tagName === "a") {
        let href = element.attributes.href as string
        if (imageRegex.exec(href) !== null) {
          const img = {
            tag: "img",
            attrs: { src: href }
          }
          const figure = {
            tag: "figure",
            children: [img]
          }
          content.push(figure)
          filesToUpload.push(img)
          current = null
        } else {
          if (href.startsWith("/")) {
            href = `https://www.weibo.com${ href }`
          }
          current.children!.push({
            tag: "a",
            attrs: { href },
            children: [element.structuredText]
          })
        }
      }
    } else if (x.nodeType === 3) {
      current.children!.push(x.text)
    }
    i += 1
  }
  const isVideo = weibo.page_info !== undefined && weibo.page_info.type === "video"
  let video
  if (isVideo) {
    video = weibo.page_info!.media_info.stream_url_hd
  }
  const pictures = weibo.pics === undefined ? [] : weibo.pics.map((x) => x.large.url)
  if (!isVideo && pictures.length > 0) {
    pictures.forEach((x) => {
      const img = {
        tag: "img",
        attrs: { src: x }
      }
      const figure = {
        tag: "figure",
        children: [img]
      }
      content.push(figure)
      filesToUpload.push(img)
    })
  }
  return { content, filesToUpload, video }
}

const backupWeibo = async (
  weibo: WeiboDetail,
  cookieJar: CookieJar,
  ctx: BackupContext
): Promise<BackupResult> => {
  if (ctx.account === undefined) {
    throw new DedeletedError("Telegraph account not set.")
  }
  const reposted = weibo.retweeted_status === undefined
    ? undefined
    : await backupWeibo(weibo.retweeted_status, cookieJar, ctx)
  const source = `https://www.weibo.com/${ weibo.user.id }/${ weibo.bid }`

  const { content, filesToUpload, video } = createTelegraphContent(weibo)
  if (reposted !== undefined) {
    content.unshift({
      tag: "p",
      children: ["转发自：", {
        tag: "a",
        attrs: { href: reposted.source },
        children: [reposted.telegraphPage.title]
      }]
    })
  }
  content.unshift({
    tag: "p",
    children: ["原链接：", {
      tag: "a",
      attrs: { href: source },
      children: [source]
    }]
  })
  const page = await uploadPage(ctx.account, {
    content, filesToUpload,
    title: `微博存档：${ weibo.bid }`,
    authorName: weibo.user.screen_name,
    authorURL: `https://www.weibo.com/${ weibo.user.id }`
  }, await getCookies(cookieJar), `wb-${weibo.bid}`, ctx.uploadFallback)

  const cookies = await getCookies(cookieJar)
  const getVideo = video === undefined
    ? async () => undefined
    : async () => await downloadFile(video!, cookies)

  const result: BackupResult = {
    id: `wb-${weibo.bid}`,
    type: "weibo",
    source,
    telegraphPage: page,
    getVideo,
    cookies,
    data: weibo,
    otherBackup: reposted
  }

  return result
}

const backup = async (
  url: string, options: BackupOptions = {}, ctx?: BackupContext
): Promise<BackupResult> => {
  if (ctx === undefined) {
    ctx = {
      account: getAccount(options.telegraphAccount)
    }
    if (!testURL(url, ctx)) {
      // If test is not passed, assume url is a weibo ID.
    }
  }
  if (options.awsS3Settings !== undefined) {
    const s3 = options.awsS3Settings
    ctx.uploadFallback = createUploadFallback("/weibo", s3.accessPoint, s3.accountID, s3.bucketName, s3.region)
  }
  const postID = getPostID(url, ctx.regexMatches)
  if (options.checkExisting !== undefined) {
    const existing = options.checkExisting(postID)
    if (existing !== undefined) {
      return existing
    }
  }
  const cookieJar = await getCookieJar(WeiboURL, options)
  const weibo = await getWeibo(
    postID, ctx,
    cookieJar
  )
  return await backupWeibo(weibo, cookieJar, ctx)
}

export const Weibo: BackupSource = {
  key: "weibo",
  testURL,
  backup
}
