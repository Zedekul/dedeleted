import { createReadStream } from "fs"
import path from "path"
import { Readable } from "stream"

import AWS from "aws-sdk/global.js"
import S3 from "aws-sdk/clients/s3.js"
import { fileTypeStream } from "file-type"

import { UploadFunction } from "./types.js"

export interface AWSS3Settings {
  accessPoint: string
  accountID: string
  bucket: string
  region: string
}

AWS.config.apiVersions = {
  s3: "2006-03-01",
}

export const s3UploadFile = async (
  file: string | Readable,
  pathToUpload: string,
  accessPoint: string,
  accountID: string,
  bucket: string,
  region = "us-west-2",
  s3Options?: Partial<S3.Types.PutObjectRequest>
): Promise<string> => {
  const s3 = new S3()
  if (typeof file === "string") {
    file = createReadStream(file)
  }
  while (pathToUpload.startsWith("/")) {
    pathToUpload = pathToUpload.substr(1)
  }
  const params: S3.Types.PutObjectRequest = {
    Bucket: `arn:aws:s3:${region}:${accountID}:accesspoint/${accessPoint}`,
    Body: file,
    Key: pathToUpload,
    StorageClass: "STANDARD_IA",
  }
  if (s3Options !== undefined) {
    Object.assign(params, s3Options)
  }
  await s3.upload(params).promise()
  return `https://${bucket}.s3.amazonaws.com/${pathToUpload}`
}

export const s3CreateUploadFunction =
  (
    pathPrefix: string,
    accessPoint: string,
    accountID: string,
    bucket: string,
    region?: string
  ): UploadFunction =>
  async (file, id) => {
    const stream = await fileTypeStream(file)
    const pathname = path.join(
      pathPrefix,
      `${id}${stream.fileType === undefined ? "" : `.${stream.fileType.ext}`}`
    )
    return await s3UploadFile(
      stream,
      pathname,
      accessPoint,
      accountID,
      bucket,
      region,
      stream.fileType === undefined
        ? undefined
        : {
            ContentType: stream.fileType.mime,
          }
    )
  }
