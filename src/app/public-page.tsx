import { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { ArrowDownToLine, ArrowUpFromLine, Check, Copy, Download, File, Files, Shield } from "lucide-react"

import { formatBytes, request, type TransferManifest } from "@/app/api"
import { ColorSchemeButton } from "@/app/color-scheme"
import { md5File } from "@/app/hash"
import { buildCodeMessage } from "@/app/sharing"
import { useAppTitle } from "@/app/use-app-title"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"

type Mode = "idle" | "upload" | "download"
type UploadResult = { pickupPin: string; shareUrl: string }
type BatchCreated = {
  id: string
  pickupPin: string
  shareUrl: string
  completionToken: string
  complete: boolean
  uploads: Array<{ fileId: string; ordinal: number; uploadUrl: string; headers: Record<string, string> }>
}

const panelMotion = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 }, transition: { duration: 0.22, ease: "easeOut" as const } }

export function PublicPage() {
  const title = useAppTitle()
  const [mode, setMode] = useState<Mode>("idle")
  const [pin, setPin] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [pending, setPending] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState("")
  const [error, setError] = useState("")
  const [result, setResult] = useState<UploadResult | null>(null)
  const [manifest, setManifest] = useState<TransferManifest | null>(null)
  const [copied, setCopied] = useState<"code" | "share" | null>(null)

  const totalSize = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const share = params.get("share")
    const requestedMode = params.get("mode")
    const requestedCode = params.get("code")
    if ((requestedMode === "upload" || requestedMode === "download") && /^\d{6}$/.test(requestedCode || "")) {
      setMode(requestedMode)
      setPin(requestedCode!)
    }
    if (!share) return
    setMode("download")
    setPending(true)
    request<TransferManifest>(`/api/shares/${encodeURIComponent(share)}`)
      .then(setManifest)
      .catch((caught) => setError(caught instanceof Error ? caught.message : "分享已失效"))
      .finally(() => setPending(false))
  }, [])

  async function copy(value: string, kind: "code" | "share") {
    await navigator.clipboard.writeText(value)
    setCopied(kind)
    window.setTimeout(() => setCopied((current) => current === kind ? null : current), 1600)
  }

  function selectMode(nextMode: Mode) {
    setMode(nextMode)
    setError("")
    setManifest(null)
  }

  async function upload() {
    if (!files.length || pin.length !== 6) return setError("请输入 6 位上传授权 PIN 并选择文件")
    setPending(true)
    setError("")
    setProgress(0)
    try {
      const fingerprints: Array<{ name: string; size: number; type: string; md5: string }> = []
      for (let index = 0; index < files.length; index += 1) {
        setStatus(`正在检查 ${files[index].name}`)
        const md5 = await md5File(files[index], (value) => setProgress(((index + value) / files.length) * 35))
        fingerprints.push({ name: files[index].name, size: files[index].size, type: files[index].type || "application/octet-stream", md5 })
      }
      setStatus("正在创建取件批次")
      const batch = await request<BatchCreated>("/api/batches", { method: "POST", body: JSON.stringify({ code: pin, files: fingerprints }) })
      let uploaded = 0
      for (const item of batch.uploads) {
        setStatus(`正在上传 ${files[item.ordinal].name}`)
        const response = await fetch(item.uploadUrl, { method: "PUT", headers: item.headers, body: files[item.ordinal] })
        if (!response.ok) throw new Error(`上传 ${files[item.ordinal].name} 失败`)
        uploaded += 1
        setProgress(35 + (uploaded / Math.max(1, batch.uploads.length)) * 60)
      }
      if (!batch.complete) {
        setStatus("正在完成批次")
        await request(`/api/batches/${batch.id}/complete`, { method: "POST", body: JSON.stringify({ completionToken: batch.completionToken }) })
      }
      setProgress(100)
      setResult({ pickupPin: batch.pickupPin, shareUrl: batch.shareUrl })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "上传失败")
    } finally {
      setPending(false)
      setStatus("")
    }
  }

  async function download() {
    if (pin.length !== 6) return setError("请输入 6 位取件 PIN")
    setPending(true)
    setError("")
    try {
      setManifest(await request<TransferManifest>("/api/downloads/resolve", { method: "POST", body: JSON.stringify({ pin }) }))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "取件失败")
    } finally {
      setPending(false)
    }
  }

  function downloadAll() {
    manifest?.files.forEach((file, index) => setTimeout(() => {
      const anchor = document.createElement("a")
      anchor.href = file.url
      anchor.click()
    }, index * 220))
  }

  function reset() {
    history.replaceState(null, "", "/")
    setMode("idle")
    setPin("")
    setFiles([])
    setResult(null)
    setManifest(null)
    setError("")
    setProgress(0)
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col px-4 py-5 sm:px-6 sm:py-8">
      <header className="flex items-center justify-between">
        <span className="text-sm font-medium">{title}</span>
        <div className="flex items-center gap-1"><ColorSchemeButton /><Button asChild variant="ghost" size="icon-sm"><a href="/admin" aria-label="管理" title="管理"><Shield /></a></Button></div>
      </header>

      <section className="my-auto flex flex-col gap-6 py-8 sm:py-12" aria-label="文件中转">
        <AnimatePresence mode="wait">
          {result ? (
            <motion.div key="result" {...panelMotion} className="flex flex-col gap-5">
              <div className="flex items-center gap-2 text-sm font-medium"><Check />批次已存入</div>
              <FieldGroup>
                <Field><FieldLabel htmlFor="pickup-pin">取件 PIN</FieldLabel><InputOTP id="pickup-pin" maxLength={6} value={result.pickupPin} readOnly aria-label="取件 PIN" containerClassName="w-full justify-center"><InputOTPGroup className="gap-2"><>{Array.from({ length: 6 }, (_, index) => <InputOTPSlot key={index} index={index} />)}</></InputOTPGroup></InputOTP><div className="grid gap-2 min-[360px]:grid-cols-2"><Button variant="outline" size="sm" onClick={() => copy(result.shareUrl, "share")}>{copied === "share" ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}{copied === "share" ? "已复制" : "复制链接"}</Button><Button variant="outline" size="sm" onClick={() => copy(buildCodeMessage(location.origin, "download", result.pickupPin), "code")}>{copied === "code" ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}{copied === "code" ? "已复制" : "复制代码"}</Button></div></Field>
              </FieldGroup>
              <Button variant="outline" onClick={reset}>完成</Button>
            </motion.div>
          ) : manifest ? (
            <motion.div key="manifest" {...panelMotion} className="flex flex-col gap-5">
              <div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2 text-sm font-medium"><Files className="shrink-0" />{manifest.files.length} 个文件</div><Button className="shrink-0" variant="outline" size="sm" onClick={downloadAll}><Download data-icon="inline-start" />全部下载</Button></div>
              <div className="flex flex-col divide-y rounded-md border">
                {manifest.files.map((file, index) => <motion.a initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.04 }} key={file.id} href={file.url} className="flex min-h-14 items-center gap-2 px-3 py-3 text-sm hover:bg-muted sm:gap-3"><File className="shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate">{file.name}</span><span className="shrink-0 text-xs text-muted-foreground">{formatBytes(file.size)}</span><Download className="shrink-0" /></motion.a>)}
              </div>
              <p className="text-xs text-muted-foreground">有效至 {new Date(manifest.expiresAt * 1000).toLocaleString()}</p>
              <Button variant="ghost" onClick={reset}>返回</Button>
            </motion.div>
          ) : (
            <motion.div key={mode} {...panelMotion}>
              <FieldGroup>
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="pin">{mode === "upload" ? "上传授权 PIN" : mode === "download" ? "取件 PIN" : "PIN"}</FieldLabel>
                  <InputOTP id="pin" maxLength={6} value={pin} onChange={(value) => setPin(value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" aria-invalid={Boolean(error)} aria-label="PIN" containerClassName="w-full justify-center"><InputOTPGroup className="gap-2"><>{Array.from({ length: 6 }, (_, index) => <InputOTPSlot key={index} index={index} />)}</></InputOTPGroup></InputOTP>
                  {error ? <FieldError>{error}</FieldError> : null}
                </Field>
                {mode === "upload" ? <Field><FieldLabel htmlFor="files">文件批次{files.length ? ` · ${files.length} · ${formatBytes(totalSize)}` : ""}</FieldLabel><Input id="files" type="file" multiple onChange={(event) => setFiles(Array.from(event.target.files || []))} /></Field> : null}
                {pending ? <div className="flex flex-col gap-2"><div className="flex items-center justify-between text-xs text-muted-foreground"><span>{status || "正在处理"}</span><span>{Math.round(progress)}%</span></div><Progress value={progress} /></div> : null}
                <div className="grid gap-2 min-[340px]:grid-cols-2">
                  <Button disabled={pending} onClick={mode === "upload" ? upload : () => selectMode("upload")}>{pending && mode === "upload" ? <Spinner data-icon="inline-start" /> : <ArrowUpFromLine data-icon="inline-start" />}存入</Button>
                  <Button variant="outline" disabled={pending} onClick={mode === "download" ? download : () => selectMode("download")}>{pending && mode === "download" ? <Spinner data-icon="inline-start" /> : <ArrowDownToLine data-icon="inline-start" />}取出</Button>
                </div>
                {mode !== "idle" ? <><Separator /><Button variant="ghost" size="sm" onClick={() => selectMode("idle")}>取消</Button></> : null}
              </FieldGroup>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </main>
  )
}
