import type { Response } from "node-fetch"
import { TextNode } from "node-html-parser"

import { CannotAccess, ConfigError, InvalidFormat } from "../errors.js"
import { shallowCopy } from "../utils/common.js"
import { createHTMLElement } from "../utils/html.js"
import { request } from "../utils/request.js"
import { BaseSource } from "./bases.js"
import { BackupContent, BackupFile, BaseOptions } from "./types.js"

export type TwitterOptions = {
  twitterBearerToken: string
  tweetQueryParameters?: Record<string, string>
  maxDepth: number
  // ...
} & BaseOptions

export type TwitterData = {
  // ...
}

type Tweet = {
  id: string
  author_id: string
  text: string
  created_at: string
  attachments: {
    media_keys: string[]
  }
  referenced_tweets: {
    type: "retweeted" | "quoted" | "replied_to"
    id: string
  }[]
} & Record<string, unknown>

type TweetReponseData = {
  data?: Tweet
  errors?: {
    title: string
    type: string
  }[]
  includes?: {
    media?: {
      media_key: string
      type: "animated_gif" | "photo" | "video" | unknown
      url?: string
      preview_image_url?: string
      variants?: { bit_rate?: number; content_type: "video/mp4" | unknown; url: string }[]
    }[]
    tweets?: Tweet[]
    users?: {
      id: string
      name: string
      username: string
    }[]
  } & Record<string, unknown>
}

const TwitterURLRegex = /^(https?:\/\/)?(.*?\.)?twitter\.com\/.*$/i
const TwitterPathRegex = /^\/(?<userID>.+?)\/status\/(?<id>\d+)\/?$/
const TwitterAPIBase = "https://api.twitter.com/2/tweets/"
const DefaultQueryParameters = {
  expansions: ["attachments.media_keys", "author_id"],
  "tweet.fields": ["created_at", "attachments", "text", "author_id", "referenced_tweets"],
  "media.fields": ["preview_image_url", "type", "url", "variants"],
  "user.fields": ["id", "name", "username"],
} as Record<string, string | string[]>

export class Twitter extends BaseSource<TwitterOptions, TwitterData> {
  public readonly key = "twitter"
  public testURL(url: string): string | undefined {
    if (!TwitterURLRegex.test(url)) {
      return undefined
    }
    try {
      return this.getID(url)
    } catch {
      return undefined
    }
  }
  getID(url: string): string {
    const { pathname } = this.getURL(url)
    const m = TwitterPathRegex.exec(pathname)
    if (m === null || m.groups === undefined) {
      throw new InvalidFormat(url)
    }
    const { id, userID } = m.groups
    return `${id}-${userID}`
  }

  getStandardURL(id: string): string {
    const [tweetID, userID] = id.split("-", 2)
    return `https://twitter.com/${userID}/status/${tweetID}`
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getTypeName(_urlOrid: string): string {
    return "推文"
  }

  async getTweet(
    tweetID: string,
    bearerToekn: string,
    queryParameters: TwitterOptions["tweetQueryParameters"]
  ): Promise<TweetReponseData> {
    const url = new URL(TwitterAPIBase + tweetID)
    const params = {} as Record<string, Set<string>>
    for (const [key, value] of Object.entries(DefaultQueryParameters)) {
      params[key] = new Set(typeof value === "string" ? [value] : value)
    }
    if (queryParameters !== undefined) {
      for (const [key, value] of Object.entries(queryParameters)) {
        if (!(key in params)) {
          params[key] = new Set()
        }
        for (const each of value.split(",")) {
          params[key].add(each)
        }
      }
    }
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.append(key, Array.from(value).join(","))
    }
    let response: Response
    try {
      response = await request(url, "GET", undefined, {
        headers: {
          Authorization: `Bearer ${bearerToekn}`,
        },
      })
    } catch (e) {
      throw new CannotAccess(url.toString(), e as Error)
    }
    const data = (await response.json()) as TweetReponseData
    if (data.errors !== undefined) {
      throw new CannotAccess(`${url} (${data.errors[0].type})`, new Error(data.errors[0].title))
    }
    return data
  }

  async backupInner(
    url: string,
    options: TwitterOptions,
    depth = 0
  ): Promise<BackupContent<TwitterData>> {
    const { id, twitterBearerToken, tweetQueryParameters, maxDepth } = options
    if (twitterBearerToken === undefined) {
      throw new ConfigError("未提供 Twitter API Bearer Token")
    }
    const [tweetID] = id.split("-", 2)
    const { data: tweet, includes } = await this.getTweet(
      tweetID,
      twitterBearerToken,
      tweetQueryParameters
    )
    depth += 1
    const reposted = [] as BackupContent<TwitterData>[]
    if (
      includes !== undefined &&
      includes.tweets !== undefined &&
      (maxDepth <= 0 || depth < maxDepth)
    ) {
      for (const tweet of includes.tweets) {
        try {
          const repostedData = await this.backupInner(
            "",
            shallowCopy(options, { id: tweet.id }),
            depth
          )
          reposted.push(repostedData)
        } catch (e) {
          // ignored
        }
      }
    }
    if (tweet === undefined) {
      throw new CannotAccess(url)
    }
    const user = includes?.users?.find((user) => user.id === tweet.author_id)
    const title =
      user === undefined ? `推特备份 - ${tweet.id}` : `${user.name} 的推文 - ${tweet.id}`
    const authorName = user === undefined ? tweet.author_id : user.name
    const authorURL = user === undefined ? undefined : `https://twitter.com/${user.username}`
    const createdAt = new Date(tweet.created_at)
    const parsedHTML = createHTMLElement("p")
    parsedHTML.appendChild(new TextNode(tweet.text, parsedHTML))
    const media: BackupFile[] = []
    if (includes !== undefined && includes.media !== undefined) {
      for (const each of includes.media) {
        switch (each.type) {
          case "photo":
            if (each.url !== undefined) {
              media.push({
                type: "image",
                source: each.url,
              })
            }
            break
          case "video":
            if (options.uploadVideos && each.variants !== undefined) {
              const vs = each.variants.sort((a, b) =>
                b.bit_rate === undefined
                  ? -1
                  : a.bit_rate === undefined
                  ? 1
                  : b.bit_rate - a.bit_rate
              )
              const source = vs[0].url
              media.push({
                type: "video",
                source,
                previewImageURL: each.preview_image_url,
                download: true,
              })
            }
            break
          default:
            // unsupported media type - auto detect
            if (each.url !== undefined) {
              media.push({
                type: "auto",
                source: each.url,
              })
            }
            break
        }
      }
    }

    return {
      id,
      title,
      authorName,
      authorURL,
      createdAt,
      source: this.getStandardURL(id),
      parsedHTML,
      inlineNodes: [],
      otherFiles: media,
      data: {},
      reposted,
    }
  }
}
