import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { FileText, X } from "lucide-react"

import type { PreviewFile } from "@/app/public-transfer/types"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"

type PreviewKind = "video" | "audio" | "image" | "text"
type TextEncoding = "utf-8" | "gbk"

const extensions: Record<PreviewKind, Set<string>> = {
  video: new Set(["mp4", "webm", "mov"]),
  audio: new Set(["mp3", "flac", "wav"]),
  image: new Set(["webp", "jpeg", "jpg", "png", "bmp", "gif"]),
  text: new Set(["txt", "md", "log"]),
}

function extensionOf(name: string) {
  return name.split(".").pop()?.toLowerCase() || ""
}

export function previewKind(file: PreviewFile): PreviewKind | null {
  const extension = extensionOf(file.name)
  return (Object.entries(extensions) as Array<[PreviewKind, Set<string>]>).find(([, values]) => values.has(extension))?.[0] || null
}

export function FilePreview({ file, onClose }: { file: PreviewFile | null; onClose: () => void }) {
  const kind = file ? previewKind(file) : null
  const [encoding, setEncoding] = useState<TextEncoding>("utf-8")
  const [text, setText] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!file || kind !== "text") return
    const controller = new AbortController()
    setLoading(true)
    setError("")
    fetch(file.previewUrl, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("无法读取文件")
        return response.arrayBuffer()
      })
      .then((buffer) => setText(new TextDecoder(encoding).decode(buffer)))
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return
        setError(caught instanceof Error ? caught.message : "预览失败")
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [encoding, file, kind])

  useEffect(() => {
    if (!file) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose() }
    window.addEventListener("keydown", closeOnEscape)
    return () => window.removeEventListener("keydown", closeOnEscape)
  }, [file, onClose])

  return <AnimatePresence>{file && kind ? <motion.div className="fixed inset-0 z-50 flex flex-col bg-background/96 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal="true" aria-label={`预览 ${file.name}`}>
    <header className="flex h-16 shrink-0 items-center gap-3 border-b px-3 sm:px-5"><FileText className="size-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate text-sm font-medium">{file.name}</span>{kind === "text" ? <Select value={encoding} onValueChange={(value) => setEncoding(value as TextEncoding)}><SelectTrigger size="sm" aria-label="文本编码"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="utf-8">UTF-8</SelectItem><SelectItem value="gbk">GBK</SelectItem></SelectContent></Select> : null}<Button variant="ghost" size="icon" onClick={onClose} aria-label="关闭预览" title="关闭预览"><X /></Button></header>
    <motion.div className="flex min-h-0 flex-1 items-center justify-center p-4 sm:p-8" initial={{ opacity: 0, scale: 0.985 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.08 }}>
      {kind === "image" ? <img src={file.previewUrl} alt={file.name} className="max-h-full max-w-full object-contain" /> : null}
      {kind === "video" ? <video src={file.previewUrl} controls playsInline className="max-h-full max-w-full bg-black" /> : null}
      {kind === "audio" ? <audio src={file.previewUrl} controls className="w-full max-w-lg" /> : null}
      {kind === "text" ? <div className="h-full w-full max-w-5xl overflow-auto border bg-background p-4 sm:p-6">{loading ? <div className="grid h-full place-items-center"><Spinner /></div> : error ? <div className="grid h-full place-items-center text-sm text-destructive">{error}</div> : <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-6">{text}</pre>}</div> : null}
    </motion.div>
  </motion.div> : null}</AnimatePresence>
}
