import http from 'http'
import https from 'https'
import { Stream } from 'stream'

import fetch, { RequestInit, Response } from 'node-fetch'

import { CannotAccess } from '../errors.js'

export const downloadFile = (source: string, cookie?: string): Promise<Stream> =>
  new Promise((resolve, reject) => {
    const get = source.startsWith('https') ? https.get : http.get
    get(
      source,
      cookie === undefined
        ? {}
        : {
            headers: { cookie },
          },
      (response) => {
        if (response === undefined) {
          reject(new CannotAccess(source))
        } else if (response.statusCode !== 200) {
          reject(new CannotAccess(source))
        } else {
          resolve(response)
        }
      }
    )
  })

export type MethodType = 'GET' | 'POST' | 'PUT' | 'DELETE'

export const request = async (
  url: string,
  method: MethodType,
  cookie?: string,
  options: RequestInit = {},
  setCookie?: (cookie: string) => Promise<void>
): Promise<Response> => {
  options.method = method
  if (options.headers === undefined) {
    options.headers = {}
  }
  const headers = options.headers as { [key: string]: string }
  if (cookie !== undefined) {
    headers.cookie = cookie
  }
  if (!('user-agent' in headers || 'User-Agent' in headers)) {
    headers['user-agent'] =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.80 Safari/537.36 Edg/98.0.1108.43'
  }
  const response = await fetch(url, options)
  if (setCookie !== undefined) {
    for (const each of response.headers.raw()['set-cookie'] || []) {
      await setCookie(each)
    }
  }
  return response
}

export const fetchPage = async (
  url: string,
  getCookie: (url: string) => Promise<string | undefined>,
  setCookie: (url: string, cookie: string) => Promise<void>,
  options: RequestInit = {}
): Promise<Response> => {
  return await request(url, 'GET', await getCookie(url), options, (c) => setCookie(url, c))
}
