import http from "http"
import https from "https"
import { Stream } from "stream"

import fetch, { RequestInit, Response } from "node-fetch"

import { DedeletedError } from "./types"

export const downloadFile = (
  source: string, cookie?: string
): Promise<Stream> => new Promise(
  (resolve, reject) => {
    const get = source.startsWith("https") ? https.get : http.get
    get(source, cookie === undefined ? {} : {
      headers: { cookie }
    }, (response) => {
      if (response !== undefined && response.statusCode === 301
        && response.headers.location!.match(/default.*\.gif/) != null) {
        return reject(new DedeletedError("Weibo image deleted."))
      }
      resolve(response)
    })
  }
)

export type MethodType = "GET" | "POST" | "PUT" | "DELETE"

export const request = async (
  url: string, method: MethodType,
  cookie?: string,
  options: RequestInit = {},
  setCookie?: (cookie: string) => Promise<void>
): Promise<Response> => {
  options.method = method
  if (options.headers === undefined) {
    options.headers = {}
  }
  if (cookie !== undefined) {
    (options.headers as { [key: string]: string }).cookie = cookie
  }
  const response = await fetch(url, options)
  if (setCookie !== undefined) {
    for (const each of (response.headers.raw()["set-cookie"] || [])) {
      await setCookie(each)
    }
  }
  return response
}
