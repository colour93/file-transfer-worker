import type { TransferManifest } from "@/app/api"

export type TransferMode = "upload" | "download"
export type TransferStep =
  | "home"
  | "pin"
  | "upload"
  | "upload-result"
  | "download-result"
export type UploadResult = { pickupPin: string; shareUrl: string }
export type BatchCreated = {
  id: string
  pickupPin: string
  shareUrl: string
  completionToken: string
  complete: boolean
  uploads: Array<{
    fileId: string
    ordinal: number
    uploadUrl: string
    headers: Record<string, string>
  }>
}
export type PreviewFile = TransferManifest["files"][number]
