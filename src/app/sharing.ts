export type CodeMode = "upload" | "download"

export function buildPrefilledUrl(
  origin: string,
  mode: CodeMode,
  code: string,
) {
  const url = new URL("/", origin)
  url.searchParams.set("mode", mode)
  url.searchParams.set("code", code)
  return url.toString()
}

export function buildCodeMessage(
  origin: string,
  mode: CodeMode,
  code: string,
  appTitle: string,
) {
  if (mode === "upload")
    return `${appTitle}\n上传授权码：「${code}」\n请前往 ${origin}，选择“存”并输入以上授权码。`
  return `${appTitle}\n取件码：「${code}」\n请前往 ${origin}，选择“取”并输入以上取件码。`
}

export function extractBracketedPin(value: string) {
  return value.match(/「\s*(\d{6})\s*」/)?.[1] ?? null
}
