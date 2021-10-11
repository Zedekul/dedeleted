import { createReadStream } from "fs"
import path from "path"
import { Readable } from "stream"

import AWS from "aws-sdk/global"
import S3 from "aws-sdk/clients/s3"
import FileType from "file-type"

import { UploadFunction } from "./types"

export interface AWSS3Settings {
  accessPoint: string
  accountID: string
  bucket: string
  region: string
}

AWS.config.apiVersions = {
  s3: "2006-03-01"
}

export const uploadFileS3 = async (
  file: string | Readable, pathToUpload: string,
  accessPoint: string, accountID: string, bucket: string,
  region = "us-west-2",
  s3Options?: any
): Promise<string> => {
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

export const createUploadFunction = (
  pathPrefix: string, accessPoint: string, accountID: string, bucket: string, region?: string
): UploadFunction => async (file, id) => {
  const stream = await FileType.stream(file)
  const pathname = path.join(pathPrefix, `${ id }${
    stream.fileType === undefined ? "" : `.${ stream.fileType.ext }`
  }`)
  return await uploadFileS3(
    stream, pathname, accessPoint, bucket, accountID, region,
    stream.fileType === undefined ? undefined : {
      ContentType: stream.fileType.mime
    }
  )
}