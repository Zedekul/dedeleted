import { Readable } from "stream"

export type Dict<T> = { [key: string]: T }

export type UploadFunction = (file: Readable, id: string) => Promise<string>
