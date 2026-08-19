import { useEffect, useMemo, useRef, useState } from "react"

import { request, type TransferManifest } from "@/app/api"
import { md5File } from "@/app/hash"
import type {
  BatchCreated,
  TransferMode,
  TransferStep,
  UploadResult,
} from "@/app/public-transfer/types"
import { createBatchUploader } from "@/app/uppy-upload"

export function useTransferFlow() {
  const [step, setStep] = useState<TransferStep>("home")
  const [direction, setDirection] = useState<1 | -1>(1)
  const [mode, setMode] = useState<TransferMode | null>(null)
  const [pin, setPin] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [pending, setPending] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploadSpeed, setUploadSpeed] = useState(0)
  const [paused, setPaused] = useState(false)
  const [status, setStatus] = useState("")
  const [error, setError] = useState("")
  const [result, setResult] = useState<UploadResult | null>(null)
  const [manifest, setManifest] = useState<TransferManifest | null>(null)
  const [copied, setCopied] = useState<"code" | "share" | null>(null)
  const uploaderRef = useRef<ReturnType<typeof createBatchUploader> | null>(
    null,
  )
  const totalSize = useMemo(
    () => files.reduce((sum, file) => sum + file.size, 0),
    [files],
  )

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const share = params.get("share")
    const requestedMode = params.get("mode")
    const requestedCode = params.get("code")

    if (
      (requestedMode === "upload" || requestedMode === "download") &&
      /^\d{6}$/.test(requestedCode || "")
    ) {
      setDirection(1)
      setMode(requestedMode)
      setPin(requestedCode!)
      setStep("pin")
    }
    if (!share) return

    setMode("download")
    setDirection(1)
    setPending(true)
    setStep("pin")
    request<TransferManifest>(`/api/shares/${encodeURIComponent(share)}`)
      .then((value) => {
        setManifest(value)
        setStep("download-result")
      })
      .catch((caught) =>
        setError(caught instanceof Error ? caught.message : "分享已失效"),
      )
      .finally(() => setPending(false))
  }, [])

  function selectMode(nextMode: TransferMode) {
    setDirection(1)
    setMode(nextMode)
    setError("")
    setStep("pin")
  }

  async function submitPin() {
    if (pin.length !== 6 || pending) return
    setError("")
    setDirection(1)
    if (mode === "upload") {
      setStep("upload")
      return
    }
    setPending(true)
    try {
      const value = await request<TransferManifest>("/api/downloads/resolve", {
        method: "POST",
        body: JSON.stringify({ pin }),
      })
      setManifest(value)
      setStep("download-result")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "取件失败")
    } finally {
      setPending(false)
    }
  }

  async function upload() {
    if (!files.length) return setError("请选择至少一个文件")
    setPending(true)
    setError("")
    setProgress(0)
    setUploadSpeed(0)
    setPaused(false)
    try {
      const fingerprints: Array<{
        name: string
        size: number
        type: string
        md5: string
      }> = []
      let checkedBytes = 0
      for (let index = 0; index < files.length; index += 1) {
        setStatus(`正在检查 ${files[index].name}`)
        const md5 = await md5File(files[index], (value) =>
          setProgress(
            ((checkedBytes + files[index].size * value) /
              Math.max(1, totalSize)) *
              100,
          ),
        )
        checkedBytes += files[index].size
        fingerprints.push({
          name: files[index].name,
          size: files[index].size,
          type: files[index].type || "application/octet-stream",
          md5,
        })
      }
      setStatus("正在创建取件批次")
      const batch = await request<BatchCreated>("/api/batches", {
        method: "POST",
        body: JSON.stringify({ code: pin, files: fingerprints }),
      })
      if (batch.uploads.length) {
        setProgress(0)
        const uploader = createBatchUploader({
          batch,
          files,
          onProgress: ({ progress: value, speed, fileName }) => {
            setProgress(value)
            setUploadSpeed(speed)
            setStatus(`正在上传 ${fileName}`)
          },
        })
        uploaderRef.current = uploader
        const uploadResult = await uploader.upload()
        if (uploadResult?.failed?.length)
          throw new Error(`上传 ${uploadResult.failed[0].name} 失败`)
      }
      if (!batch.complete) {
        setProgress(100)
        setUploadSpeed(0)
        setStatus("正在完成批次")
        await request(`/api/batches/${batch.id}/complete`, {
          method: "POST",
          body: JSON.stringify({ completionToken: batch.completionToken }),
        })
      }
      setProgress(100)
      setResult({ pickupPin: batch.pickupPin, shareUrl: batch.shareUrl })
      setDirection(1)
      setStep("upload-result")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "上传失败")
    } finally {
      uploaderRef.current?.destroy()
      uploaderRef.current = null
      setPending(false)
      setPaused(false)
      setUploadSpeed(0)
      setStatus("")
    }
  }

  function togglePause() {
    const uploader = uploaderRef.current
    if (!uploader) return
    if (paused) uploader.resumeAll()
    else uploader.pauseAll()
    setPaused(!paused)
  }

  async function copy(value: string, kind: "code" | "share") {
    await navigator.clipboard.writeText(value)
    setCopied(kind)
    window.setTimeout(
      () => setCopied((current) => (current === kind ? null : current)),
      1600,
    )
  }

  function downloadAll() {
    manifest?.files.forEach((file, index) =>
      window.setTimeout(() => {
        const anchor = document.createElement("a")
        anchor.href = file.url
        anchor.click()
      }, index * 220),
    )
  }

  function reset() {
    history.replaceState(null, "", "/")
    setDirection(-1)
    setStep("home")
    setMode(null)
    setPin("")
    setFiles([])
    setResult(null)
    setManifest(null)
    setError("")
    setProgress(0)
    setUploadSpeed(0)
    setPaused(false)
  }

  function back() {
    if (pending) return
    setDirection(-1)
    setError("")
    if (step === "upload") setStep("pin")
    else if (step === "download-result") {
      setManifest(null)
      setStep("pin")
    } else reset()
  }

  return {
    step,
    direction,
    mode,
    pin,
    pending,
    error,
    result,
    manifest,
    copied,
    setPin,
    selectMode,
    submitPin,
    copy,
    downloadAll,
    reset,
    back,
    uploadStepProps: {
      files,
      totalSize,
      pending,
      progress,
      uploadSpeed,
      paused,
      canPause: Boolean(uploaderRef.current),
      status,
      error,
      onFilesChange: setFiles,
      onUpload: upload,
      onTogglePause: togglePause,
    },
  }
}
