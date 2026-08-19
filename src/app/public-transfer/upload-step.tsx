import { Check, Copy, Files, Upload } from "lucide-react"

import { formatBytes } from "@/app/api"
import { buildCodeMessage } from "@/app/sharing"
import type { UploadResult } from "@/app/public-transfer/types"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"

export function UploadStep({
  files,
  totalSize,
  pending,
  progress,
  status,
  error,
  onFilesChange,
  onUpload,
}: {
  files: File[]
  totalSize: number
  pending: boolean
  progress: number
  status: string
  error: string
  onFilesChange: (files: File[]) => void
  onUpload: () => void
}) {
  return (
    <div className="flex flex-col gap-8">
      <FieldGroup>
        <Field data-invalid={Boolean(error)}>
          <FieldLabel htmlFor="files">
            选择文件
            {files.length
              ? ` · ${files.length} 个 · ${formatBytes(totalSize)}`
              : ""}
          </FieldLabel>
          <Input
            id="files"
            className="h-12 py-2"
            type="file"
            multiple
            disabled={pending}
            onChange={(event) =>
              onFilesChange(Array.from(event.target.files || []))
            }
          />
          {error ? <FieldError>{error}</FieldError> : null}
        </Field>
        {pending ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
              <span className="truncate">{status || "正在处理"}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} />
          </div>
        ) : null}
        <Button
          className="h-11"
          disabled={pending || !files.length}
          onClick={onUpload}
        >
          {pending ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <Upload data-icon="inline-start" />
          )}
          {pending ? "正在存入" : "存入文件"}
        </Button>
      </FieldGroup>
    </div>
  )
}

export function UploadResultStep({
  appTitle,
  result,
  copied,
  onCopy,
  onDone,
}: {
  appTitle: string
  result: UploadResult
  copied: "code" | "share" | null
  onCopy: (value: string, kind: "code" | "share") => void
  onDone: () => void
}) {
  return (
    <div className="flex flex-col gap-8">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="pickup-pin">取件码</FieldLabel>
          <InputOTP
            id="pickup-pin"
            maxLength={6}
            value={result.pickupPin}
            readOnly
            aria-label="取件码"
            containerClassName="w-full"
          >
            <InputOTPGroup className="w-full justify-between">
              {Array.from({ length: 6 }, (_, index) => (
                <InputOTPSlot key={index} index={index} />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </Field>
        <div className="grid gap-2 min-[360px]:grid-cols-2">
          <Button
            variant="outline"
            onClick={() => onCopy(result.shareUrl, "share")}
          >
            {copied === "share" ? <Check /> : <Copy />}
            {copied === "share" ? "已复制" : "复制链接"}
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              onCopy(
                buildCodeMessage(
                  location.origin,
                  "download",
                  result.pickupPin,
                  appTitle,
                ),
                "code",
              )
            }
          >
            {copied === "code" ? <Check /> : <Copy />}
            {copied === "code" ? "已复制" : "复制取件码"}
          </Button>
        </div>
        <Button className="h-11" onClick={onDone}>
          完成
        </Button>
      </FieldGroup>
    </div>
  )
}
