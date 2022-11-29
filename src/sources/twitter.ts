import { Client } from "twitter-api-sdk"

import { InvalidFormat } from "../errors.js"
import { BaseSource } from "./bases.js"
import { BackupContent, BackupOptions } from "./types.js"

export type TwitterOptions = {
  twitterAPIBearerToken: string
  // ...
} & BackupOptions

export type TwitterData = {
  // ...
}

const TwitterURLRegex = /^(https?:\/\/)?(.*?\.)?twitter\.com\/.*$/i
const TwitterPathRegex = /(?<userID>\d+)\/status\/(?<id>\d+)\/?$/

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
    const [postID, userID] = id.split("-", 2)
    return `https://twitter.com/${userID}/status/${postID}`
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getTypeName(_urlOrid: string): string {
    return "推文"
  }
  backupInner(url: string, options: TwitterOptions): Promise<BackupContent<TwitterData>> {
    const client = new Client(options.twitterAPIBearerToken)
    const [postID, userID] = options.id.split("-", 2)
    const tweet = client.tweets.findTweetById(postID, {})
  }
}
