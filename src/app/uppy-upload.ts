import AwsS3, { type AwsS3Part } from "@uppy/aws-s3"
import Uppy from "@uppy/core"

import { request } from "@/app/api"
import type { BatchCreated } from "@/app/public-transfer/types"

const MEBIBYTE = 1024 * 1024

interface UploadMeta extends Record<string, unknown> {
  batchId: string
  completionToken: string
  fileId: string
  uploadUrl: string
  uploadHeaders: Record<string, string>
}
type UploadBody = Record<string, never>

class BatchAwsS3 extends AwsS3<UploadMeta, UploadBody> {}

function endpoint(meta: UploadMeta, action: string) {
  return `/api/batches/${encodeURIComponent(meta.batchId)}/files/${encodeURIComponent(meta.fileId)}/multipart/${action}`
}

function body(meta: UploadMeta, value: Record<string, unknown> = {}) {
  return JSON.stringify({ completionToken: meta.completionToken, ...value })
}

export function createBatchUploader({
  batch,
  files,
  onProgress,
}: {
  batch: BatchCreated
  files: File[]
  onProgress: (value: {
    progress: number
    speed: number
    fileName: string
  }) => void
}) {
  const uppy = new Uppy<UploadMeta, UploadBody>({ autoProceed: false })

  uppy.use(BatchAwsS3, {
    limit: 3,
    retryDelays: [0, 1000, 3000, 5000, 10_000],
    shouldUseMultipart: (file) => (file.size ?? 0) > 32 * MEBIBYTE,
    getChunkSize: () => 8 * MEBIBYTE,
    getUploadParameters: (file) => ({
      method: "PUT",
      url: file.meta.uploadUrl,
      headers: file.meta.uploadHeaders,
    }),
    createMultipartUpload: (file) =>
      request<{ uploadId: string; key: string }>(
        endpoint(file.meta, "create"),
        { method: "POST", body: body(file.meta) },
      ),
    listParts: (file, { uploadId, signal }) =>
      request<AwsS3Part[]>(endpoint(file.meta, "parts"), {
        method: "POST",
        signal,
        body: body(file.meta, { uploadId }),
      }),
    signPart: (file, { uploadId, partNumber, signal }) =>
      request<{ url: string }>(endpoint(file.meta, "sign-part"), {
        method: "POST",
        signal,
        body: body(file.meta, { uploadId, partNumber }),
      }),
    completeMultipartUpload: (file, { uploadId, parts, signal }) =>
      request<{ location?: string }>(endpoint(file.meta, "complete"), {
        method: "POST",
        signal,
        body: body(file.meta, { uploadId, parts }),
      }),
    abortMultipartUpload: async (file, { uploadId, signal }) => {
      await request(endpoint(file.meta, "abort"), {
        method: "POST",
        signal,
        body: body(file.meta, { uploadId }),
      })
    },
  })

  const uploadedByFile = new Map<string, number>()
  const totalBytes = batch.uploads.reduce(
    (sum, upload) => sum + files[upload.ordinal].size,
    0,
  )
  let lastBytes = 0
  let lastTime = performance.now()
  let speed = 0

  uppy.on("upload-progress", (file, progress) => {
    if (!file) return
    uploadedByFile.set(file.id, progress.bytesUploaded)
    const uploadedBytes = [...uploadedByFile.values()].reduce(
      (sum, value) => sum + value,
      0,
    )
    const time = performance.now()
    const seconds = (time - lastTime) / 1000
    if (seconds >= 0.25) {
      const currentSpeed = Math.max(0, uploadedBytes - lastBytes) / seconds
      speed = speed ? speed * 0.7 + currentSpeed * 0.3 : currentSpeed
      lastBytes = uploadedBytes
      lastTime = time
    }
    onProgress({
      progress: totalBytes ? (uploadedBytes / totalBytes) * 100 : 100,
      speed,
      fileName: file.name,
    })
  })

  for (const upload of batch.uploads) {
    const file = files[upload.ordinal]
    uppy.addFile({
      name: file.name,
      type: file.type,
      data: file,
      source: "local",
      meta: {
        batchId: batch.id,
        completionToken: batch.completionToken,
        fileId: upload.fileId,
        uploadUrl: upload.uploadUrl,
        uploadHeaders: upload.headers,
      },
    })
  }

  return uppy
}
