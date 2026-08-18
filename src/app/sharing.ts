export type CodeMode = "upload" | "download"

export function buildPrefilledUrl(origin: string, mode: CodeMode, code: string) {
  const url = new URL("/", origin)
  url.searchParams.set("mode", mode)
  url.searchParams.set("code", code)
  return url.toString()
}

export function buildCodeMessage(origin: string, mode: CodeMode, code: string) {
  if (mode === "upload") return `上传授权码：${code}\n请前往 ${origin}，选择“存入”并输入以上授权码。`
  return `取件码：${code}\n请前往 ${origin}，选择“取出”并输入以上取件码。`
}
