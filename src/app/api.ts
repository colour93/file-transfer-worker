export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  })
  const data = (await response.json().catch(() => ({}))) as T & {
    error?: string
  }
  if (!response.ok) throw new Error(data.error || "请求失败")
  return data
}

export interface UploadGrant {
  id: string
  label: string | null
  time_rule_enabled: number
  valid_from: number | null
  valid_until: number | null
  uses_rule_enabled: number
  max_uses: number | null
  used_uses: number
  max_batch_bytes: number
  revoked_at: number | null
  created_by: string
  created_at: number
  code: string | null
}

export interface ManagedFile {
  id: string
  batch_id: string
  original_name: string
  content_type: string
  size_bytes: number
  md5_hex: string
  revoked_at: number | null
  batch_status: "pending" | "ready" | "revoked" | "expired"
  created_at: number
  expires_at: number | null
  grant_label: string | null
  object_status: "pending" | "ready" | "deleted"
  active_references: number
  pickup_pin: string | null
  share_url: string | null
}

export interface TransferManifest {
  id: string
  expiresAt: number
  files: Array<{
    id: string
    name: string
    type: string
    size: number
    url: string
    previewUrl: string
  }>
}

export interface PageInfo {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 1) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  )
  const value = bytes / 1024 ** index
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`
}
