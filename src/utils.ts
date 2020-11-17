import { Readable } from "stream"
import { createReadStream } from "fs"
import path from "path"

import AWS from "aws-sdk/global"
import S3 from "aws-sdk/clients/s3"
import FileType from "file-type"
import { CookieJar } from "tough-cookie"

import { BackupOptions } from "./types"
import { HTMLElement, Node as ParsedNode } from "node-html-parser"
import { TelegraphContentNode, TelegraphContentNodeElement, TelegraphFile } from "./telegraph"

AWS.config.apiVersions = {
  s3: "2006-03-01"
}

export const getCookieJar = async (
  url: string, options?: BackupOptions
): Promise<CookieJar> => {
  const cookieJar = new CookieJar()
  if (options !== undefined && options.cookies !== undefined) {
    const cookies = options.cookies.split(/;/)
    for (const cookie of cookies) {
      await cookieJar.setCookie(cookie, url)
    }
  }
  return cookieJar
}

export type UploadFunction = (file: Readable, id: string) => Promise<string>

export async function uploadFileS3(
  file: string | Readable, pathToUpload: string,
  accessPoint: string, accountID: string, bucketName: string,
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
  return `https://${ bucketName }.s3-${ region }.amazonaws.com/${ pathToUpload }`
}


export const createUploadFallback = (
  pathPrefix: string, accessPoint: string, accountID: string, bucketName: string, region?: string
): UploadFunction => async (file, id) => {
  const stream = await FileType.stream(file)
  const pathname = path.join(pathPrefix, `tf-${ id }${
    stream.fileType === undefined ? "" : `.${ stream.fileType.ext }`
  }`)
  return await uploadFileS3(
    stream, pathname, accessPoint, bucketName, accountID, region,
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