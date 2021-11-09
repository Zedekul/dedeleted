import { Readable } from "node:stream"

export type Dict<T> = { [key: string]: T }

export type UploadFunction = (file: Readable, id: string) => Promise<string>
