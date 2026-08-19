import { AwsClient } from "aws4fetch"
import { XMLBuilder, XMLParser } from "fast-xml-parser"

import type { Env } from "./types"

const client = (env: Env) =>
  new AwsClient({
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    region: env.S3_REGION || "auto",
    service: "s3",
  })
const urlFor = (env: Env, key: string) => {
  const endpoint = new URL(env.S3_ENDPOINT)
  const encodedKey = key.split("/").map(encodeURIComponent).join("/")
  if (env.S3_FORCE_PATH_STYLE === "true")
    return `${endpoint.origin}/${encodeURIComponent(env.S3_BUCKET)}/${encodedKey}`
  endpoint.hostname = `${env.S3_BUCKET}.${endpoint.hostname}`
  endpoint.pathname = `/${encodedKey}`
  return endpoint.toString()
}
const xmlParser = new XMLParser({ parseTagValue: false })
const xmlBuilder = new XMLBuilder({ format: false })

async function s3Xml<T>(response: Response, root: string) {
  const body = await response.text()
  if (!response.ok) throw new Error(`s3_${response.status}`)
  const parsed = xmlParser.parse(body) as Record<string, T>
  if (!parsed[root]) throw new Error("invalid_s3_response")
  return parsed[root]
}
export const md5Base64 = (hex: string) =>
  btoa(
    String.fromCharCode(
      ...(hex.match(/.{2}/g) || []).map((part) => Number.parseInt(part, 16)),
    ),
  )
export const presignPut = (
  env: Env,
  key: string,
  contentType: string,
  md5Hex: string,
  ttl: number,
) => {
  const url = new URL(urlFor(env, key))
  url.searchParams.set("X-Amz-Expires", String(ttl))
  return client(env)
    .sign(
      new Request(url, {
        method: "PUT",
        headers: {
          "content-type": contentType,
          "content-md5": md5Base64(md5Hex),
          "x-amz-meta-md5": md5Hex,
        },
      }),
      { aws: { signQuery: true } },
    )
    .then((r) => r.url)
}
export const presignGet = (
  env: Env,
  key: string,
  filename: string,
  ttl: number,
  disposition: "attachment" | "inline" = "attachment",
) => {
  const url = new URL(urlFor(env, key))
  url.searchParams.set(
    "response-content-disposition",
    `${disposition}; filename*=UTF-8''${encodeURIComponent(filename)}`,
  )
  url.searchParams.set("X-Amz-Expires", String(ttl))
  return client(env)
    .sign(new Request(url, { method: "GET" }), { aws: { signQuery: true } })
    .then((r) => r.url)
}
export const headObject = (env: Env, key: string) =>
  client(env).fetch(urlFor(env, key), { method: "HEAD" })
export const deleteObject = (env: Env, key: string) =>
  client(env).fetch(urlFor(env, key), { method: "DELETE" })

export async function createMultipartUpload(
  env: Env,
  key: string,
  contentType: string,
  md5Hex: string,
) {
  const url = new URL(urlFor(env, key))
  url.searchParams.set("uploads", "")
  const response = await client(env).fetch(url, {
    method: "POST",
    headers: {
      "content-type": contentType,
      "x-amz-meta-md5": md5Hex,
    },
  })
  const value = await s3Xml<{ UploadId: string; Key: string }>(
    response,
    "InitiateMultipartUploadResult",
  )
  return { uploadId: value.UploadId, key: value.Key || key }
}

export async function listMultipartParts(
  env: Env,
  key: string,
  uploadId: string,
) {
  const url = new URL(urlFor(env, key))
  url.searchParams.set("uploadId", uploadId)
  const response = await client(env).fetch(url)
  const value = await s3Xml<{
    Part?:
      | { PartNumber: string; Size: string; ETag: string }
      | Array<{ PartNumber: string; Size: string; ETag: string }>
  }>(response, "ListPartsResult")
  const parts = value.Part
    ? Array.isArray(value.Part)
      ? value.Part
      : [value.Part]
    : []
  return parts.map((part) => ({
    PartNumber: Number(part.PartNumber),
    Size: Number(part.Size),
    ETag: part.ETag,
  }))
}

export async function presignUploadPart(
  env: Env,
  key: string,
  uploadId: string,
  partNumber: number,
  ttl: number,
) {
  const url = new URL(urlFor(env, key))
  url.searchParams.set("partNumber", String(partNumber))
  url.searchParams.set("uploadId", uploadId)
  url.searchParams.set("X-Amz-Expires", String(ttl))
  const request = await client(env).sign(new Request(url, { method: "PUT" }), {
    aws: { signQuery: true },
  })
  return request.url
}

export async function completeMultipartUpload(
  env: Env,
  key: string,
  uploadId: string,
  parts: Array<{ PartNumber: number; ETag: string }>,
) {
  const url = new URL(urlFor(env, key))
  url.searchParams.set("uploadId", uploadId)
  const body = xmlBuilder.build({ CompleteMultipartUpload: { Part: parts } })
  const response = await client(env).fetch(url, {
    method: "POST",
    headers: { "content-type": "application/xml" },
    body,
  })
  await s3Xml(response, "CompleteMultipartUploadResult")
}

export async function abortMultipartUpload(
  env: Env,
  key: string,
  uploadId: string,
) {
  const url = new URL(urlFor(env, key))
  url.searchParams.set("uploadId", uploadId)
  const response = await client(env).fetch(url, { method: "DELETE" })
  if (!response.ok && response.status !== 404)
    throw new Error(`s3_${response.status}`)
}
