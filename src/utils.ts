import { Readable } from "stream"
import { createReadStream } from "fs"
import path from "path"

import AWS from "aws-sdk/global"
import S3 from "aws-sdk/clients/s3"
import FileType from "file-type"
import { CookieJar } from "tough-cookie"

import { BackupOptions, SourceType } from "./types"
import { HTMLElement, Node as ParsedNode } from "node-html-parser"
import { TelegraphContentNode, TelegraphContentNodeElement } from "./telegraph"

AWS.config.apiVersions = {
  s3: "2006-03-01"
}

export const getCookieJar = async (
  sourceType: SourceType, options?: BackupOptions
): Promise<CookieJar | undefined> => {
  if (options !== undefined && options.cookies !== undefined) {
    const serialized = options.cookies[sourceType]
    if (serialized !== undefined) {
      return await CookieJar.deserialize(serialized)
    }
  }
  return new CookieJar()
}

export const getCookies = async (
  url: string,
  cookieJar?: CookieJar,
): Promise<string | undefined> =>
  cookieJar === undefined ? undefined : await cookieJar.getCookieString(url)

export type UploadFunction = (file: Readable, id: string) => Promise<string>

export async function uploadFileS3(
  file: string | Readable, pathToUpload: string,
  accessPoint: string, accountID: string, bucket: string,
  region = "us-west-2",
  s3Options?: any
): Promise<string> {
  const s3 = new S3()
  if (typeof file === "string") {
    file = createReadStream(file)
  }
  while (pathToUpload.startsWith("/")) {
    pathToUpload = pathToUpload.substr(1)
  }
  const params: S3.Types.PutObjectRequest = {
    Bucket: `arn:aws:s3:${ region }:${ accountID }:accesspoint/${ accessPoint }`,
    Body: file,
    Key: pathToUpload,
    StorageClass: "STANDARD_IA"
  }
  if (s3Options !== undefined) {
    Object.assign(params, s3Options)
  }
  const uploaded = await s3.upload(params).promise()
  return `https://${ bucket }.s3-${ region }.amazonaws.com/${ pathToUpload }`
}

export const createUploadFallback = (
  pathPrefix: string, accessPoint: string, accountID: string, bucket: string, region?: string
): UploadFunction => async (file, id) => {
  const stream = await FileType.stream(file)
  const pathname = path.join(pathPrefix, `tf-${ id }${
    stream.fileType === undefined ? "" : `.${ stream.fileType.ext }`
  }`)
  return await uploadFileS3(
    stream, pathname, accessPoint, bucket, accountID, region,
    stream.fileType === undefined ? undefined : {
      ContentType: stream.fileType.mime
    }
  )
}

const flattenNodes = (arrayOfNodes: TelegraphContentNode[][]): TelegraphContentNode[] => {
  return ([] as TelegraphContentNode[]).concat(...arrayOfNodes)
}

export type DomToNodeHandler = (
  dom: HTMLElement, filesToUpload: TelegraphContentNodeElement[]
) => TelegraphContentNode[] | undefined

export const domToNodes = (
  domNode: ParsedNode, filesToUpload: TelegraphContentNodeElement[],
  domToNodeHandler?: DomToNodeHandler
): TelegraphContentNode[] => {
  if (domNode.nodeType === 3) {
    return [domNode.text]
  }
  if (domNode.nodeType !== 1) {
    return [""]
  }
  const dom = domNode as HTMLElement
  let nodes: TelegraphContentNode[] | undefined
  if (domToNodeHandler !== undefined) {
    nodes = domToNodeHandler(dom, filesToUpload)
  }
  if (nodes === undefined) {
    const tag = dom.tagName.toLowerCase()
    if (tag === "img") {
      const img = {
        tag,
        attrs: "src" in dom.attributes ? { src: dom.attributes.src } : undefined
      }
      filesToUpload.push(img)
      nodes = [{
        tag: "figure",
        children: [img]
      }]
    } else if (tag === "a") {
      nodes = [{
        tag,
        attrs: "href" in dom.attributes ? { href: dom.attributes.href } : undefined
      }]
    } else {
      nodes = [{ tag }]
    }
    if (dom.childNodes.length > 0) {
      (nodes[0] as TelegraphContentNodeElement).children = flattenNodes(dom.childNodes.map(
        (child) => domToNodes(child, filesToUpload, domToNodeHandler)
      ))
    }
  }
  return nodes
}