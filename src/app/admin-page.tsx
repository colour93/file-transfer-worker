import { useCallback, useEffect, useState, type FormEvent } from "react"
import { AnimatePresence, motion } from "motion/react"
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileCog,
  KeyRound,
  Link2,
  LogIn,
  LogOut,
  Plus,
  FolderOpen,
  Trash2,
} from "lucide-react"

import {
  formatBytes,
  request,
  type ManagedFile,
  type PageInfo,
  type UploadGrant,
} from "@/app/api"
import { ColorSchemeButton } from "@/app/color-scheme"
import { buildCodeMessage, buildPrefilledUrl } from "@/app/sharing"
import { useAppTitle } from "@/app/use-app-title"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type SizeUnit = "MB" | "GB" | "TB"
type GrantForm = {
  label: string
  timeRuleEnabled: boolean
  validFrom: string
  validUntil: string
  usesRuleEnabled: boolean
  maxUses: string
  maxBatchSize: string
  sizeUnit: SizeUnit
}

function dateTimeInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function dateTimeIso(value: string) {
  return new Date(value).toISOString()
}

function freshForm(): GrantForm {
  return {
    label: "",
    timeRuleEnabled: true,
    validFrom: dateTimeInput(new Date()),
    validUntil: dateTimeInput(new Date(Date.now() + 24 * 3600_000)),
    usesRuleEnabled: true,
    maxUses: "10",
    maxBatchSize: "5",
    sizeUnit: "GB",
  }
}

const unitBytes: Record<SizeUnit, number> = {
  MB: 1024 ** 2,
  GB: 1024 ** 3,
  TB: 1024 ** 4,
}
const emptyPage: PageInfo = { page: 1, pageSize: 20, total: 0, totalPages: 1 }

function grantStatus(grant: UploadGrant) {
  if (grant.revoked_at) return "已撤销"
  if (
    grant.time_rule_enabled &&
    grant.valid_until &&
    grant.valid_until * 1000 < Date.now()
  )
    return "已过期"
  if (
    grant.time_rule_enabled &&
    grant.valid_from &&
    grant.valid_from * 1000 > Date.now()
  )
    return "未开始"
  if (
    grant.uses_rule_enabled &&
    grant.max_uses !== null &&
    grant.used_uses >= grant.max_uses
  )
    return "已用完"
  return "有效"
}

function fileStatus(file: ManagedFile) {
  if (file.revoked_at || file.batch_status === "revoked") return "已撤销"
  if (file.batch_status === "expired") return "已过期"
  if (file.batch_status === "pending") return "上传中"
  return file.object_status === "ready" ? "有效" : "已删除"
}

function PageControls({
  value,
  onChange,
}: {
  value: PageInfo
  onChange: (page: number) => void
}) {
  if (value.totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between gap-2 sm:justify-end">
      <span className="text-xs text-muted-foreground">
        第 {value.page} / {value.totalPages} 页
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="icon-sm"
          disabled={value.page <= 1}
          aria-label="上一页"
          title="上一页"
          onClick={() => onChange(value.page - 1)}
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          disabled={value.page >= value.totalPages}
          aria-label="下一页"
          title="下一页"
          onClick={() => onChange(value.page + 1)}
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  )
}

export function AdminPage() {
  const title = useAppTitle()
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [grants, setGrants] = useState<UploadGrant[]>([])
  const [files, setFiles] = useState<ManagedFile[]>([])
  const [grantPage, setGrantPage] = useState(1)
  const [filePage, setFilePage] = useState(1)
  const [grantPagination, setGrantPagination] = useState<PageInfo>(emptyPage)
  const [filePagination, setFilePagination] = useState<PageInfo>(emptyPage)
  const [form, setForm] = useState<GrantForm>(freshForm)
  const [created, setCreated] = useState("")
  const [error, setError] = useState("")
  const [copied, setCopied] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [grantData, fileData] = await Promise.all([
        request<{ grants: UploadGrant[]; pagination: PageInfo }>(
          `/api/admin/upload-grants?page=${grantPage}&pageSize=20`,
        ),
        request<{ files: ManagedFile[]; pagination: PageInfo }>(
          `/api/admin/files?page=${filePage}&pageSize=20`,
        ),
      ])
      setGrants(grantData.grants)
      setFiles(fileData.files)
      setGrantPagination(grantData.pagination)
      setFilePagination(fileData.pagination)
      setGrantPage(grantData.pagination.page)
      setFilePage(fileData.pagination.page)
      setAuthenticated(true)
    } catch {
      setAuthenticated(false)
    }
  }, [filePage, grantPage])

  useEffect(() => {
    void load()
  }, [load])

  if (authenticated === null)
    return (
      <main className="mx-auto flex min-h-svh w-full max-w-6xl flex-col gap-4 px-6 py-8">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-72 w-full" />
      </main>
    )

  if (!authenticated) {
    return (
      <main className="grid min-h-svh place-items-center px-6">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <FolderOpen />
            <CardTitle>{title} 管理</CardTitle>
          </CardHeader>
          <CardContent />
          <CardFooter>
            <Button asChild className="w-full">
              <a href="/auth/login">
                <LogIn data-icon="inline-start" />
                登录
              </a>
            </Button>
          </CardFooter>
        </Card>
      </main>
    )
  }

  async function create(event: FormEvent) {
    event.preventDefault()
    setError("")
    if (!form.timeRuleEnabled && !form.usesRuleEnabled)
      return setError("至少选择一条授权规则")
    try {
      const maxBatchBytes = Number(form.maxBatchSize) * unitBytes[form.sizeUnit]
      const data = await request<{ code: string }>("/api/admin/upload-grants", {
        method: "POST",
        body: JSON.stringify({
          label: form.label,
          timeRuleEnabled: form.timeRuleEnabled,
          validFrom: form.timeRuleEnabled
            ? dateTimeIso(form.validFrom)
            : undefined,
          validUntil: form.timeRuleEnabled
            ? dateTimeIso(form.validUntil)
            : undefined,
          usesRuleEnabled: form.usesRuleEnabled,
          maxUses: Number(form.maxUses),
          maxBatchBytes,
        }),
      })
      setCreated(data.code)
      setForm(freshForm())
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "创建失败")
    }
  }

  async function revokeGrant(id: string) {
    await request(`/api/admin/upload-grants/${id}/revoke`, { method: "POST" })
    await load()
  }

  async function revokeFile(id: string) {
    await request(`/api/admin/files/${id}/revoke`, { method: "POST" })
    await load()
  }

  async function revokeBatch(id: string) {
    await request(`/api/admin/batches/${id}/revoke`, { method: "POST" })
    await load()
  }

  async function copy(value: string, kind: string) {
    await navigator.clipboard.writeText(value)
    setCopied(kind)
    window.setTimeout(
      () => setCopied((current) => (current === kind ? null : current)),
      1600,
    )
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-6xl flex-col gap-6 px-4 py-5 sm:gap-8 sm:px-6 sm:py-8">
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <FolderOpen className="shrink-0" />
          <span className="truncate">{title} 管理</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <ColorSchemeButton />
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              request("/auth/logout", { method: "POST" }).then(() =>
                location.reload(),
              )
            }
          >
            <LogOut data-icon="inline-start" />
            <span className="hidden min-[380px]:inline">退出</span>
          </Button>
        </div>
      </header>

      <AnimatePresence>
        {created ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <Alert>
              <AlertTitle>上传授权 PIN</AlertTitle>
              <AlertDescription className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <code className="font-mono text-lg tracking-[0.2em]">
                  {created}
                </code>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      copy(
                        buildCodeMessage(
                          location.origin,
                          "upload",
                          created,
                          title,
                        ),
                        "created-code",
                      )
                    }
                  >
                    {copied === "created-code" ? (
                      <Check data-icon="inline-start" />
                    ) : (
                      <Copy data-icon="inline-start" />
                    )}
                    {copied === "created-code" ? "已复制" : "复制代码"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      copy(
                        buildPrefilledUrl(location.origin, "upload", created),
                        "created-url",
                      )
                    }
                  >
                    {copied === "created-url" ? (
                      <Check data-icon="inline-start" />
                    ) : (
                      <Link2 data-icon="inline-start" />
                    )}
                    {copied === "created-url" ? "已复制" : "复制直达链接"}
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <Tabs defaultValue="grants">
        <TabsList className="grid w-full grid-cols-2 sm:w-fit">
          <TabsTrigger value="grants">
            <KeyRound />
            授权 {grantPagination.total}
          </TabsTrigger>
          <TabsTrigger value="files">
            <FileCog />
            文件 {filePagination.total}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="grants" className="flex flex-col gap-8 pt-4">
          <Card>
            <CardHeader>
              <CardTitle>创建上传授权</CardTitle>
            </CardHeader>
            <CardContent>
              <form id="create-grant" onSubmit={create}>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="label">备注</FieldLabel>
                    <Input
                      id="label"
                      value={form.label}
                      onChange={(event) =>
                        setForm((value) => ({
                          ...value,
                          label: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field className="rounded-md border p-4">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="time-rule"
                          checked={form.timeRuleEnabled}
                          onCheckedChange={(checked) =>
                            setForm((value) => ({
                              ...value,
                              timeRuleEnabled: checked === true,
                            }))
                          }
                        />
                        <FieldLabel htmlFor="time-rule">
                          限定可用时间
                        </FieldLabel>
                      </div>
                      {form.timeRuleEnabled ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Field>
                            <FieldLabel htmlFor="valid-from">开始</FieldLabel>
                            <Input
                              id="valid-from"
                              required
                              type="datetime-local"
                              value={form.validFrom}
                              onChange={(event) =>
                                setForm((value) => ({
                                  ...value,
                                  validFrom: event.target.value,
                                }))
                              }
                            />
                          </Field>
                          <Field>
                            <FieldLabel htmlFor="valid-until">结束</FieldLabel>
                            <Input
                              id="valid-until"
                              required
                              type="datetime-local"
                              value={form.validUntil}
                              onChange={(event) =>
                                setForm((value) => ({
                                  ...value,
                                  validUntil: event.target.value,
                                }))
                              }
                            />
                          </Field>
                        </div>
                      ) : null}
                    </Field>
                    <Field className="rounded-md border p-4">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="uses-rule"
                          checked={form.usesRuleEnabled}
                          onCheckedChange={(checked) =>
                            setForm((value) => ({
                              ...value,
                              usesRuleEnabled: checked === true,
                            }))
                          }
                        />
                        <FieldLabel htmlFor="uses-rule">
                          限定使用次数
                        </FieldLabel>
                      </div>
                      {form.usesRuleEnabled ? (
                        <Field>
                          <FieldLabel htmlFor="max-uses">
                            最多创建批次
                          </FieldLabel>
                          <Input
                            id="max-uses"
                            required
                            type="number"
                            min="1"
                            value={form.maxUses}
                            onChange={(event) =>
                              setForm((value) => ({
                                ...value,
                                maxUses: event.target.value,
                              }))
                            }
                          />
                        </Field>
                      ) : null}
                    </Field>
                  </div>
                  <Field>
                    <FieldLabel htmlFor="max-batch-size">
                      单批次容量上限
                    </FieldLabel>
                    <div className="flex gap-2">
                      <Input
                        id="max-batch-size"
                        required
                        type="number"
                        min="1"
                        step="0.1"
                        value={form.maxBatchSize}
                        onChange={(event) =>
                          setForm((value) => ({
                            ...value,
                            maxBatchSize: event.target.value,
                          }))
                        }
                      />
                      <Select
                        value={form.sizeUnit}
                        onValueChange={(value) =>
                          setForm((current) => ({
                            ...current,
                            sizeUnit: value as SizeUnit,
                          }))
                        }
                      >
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="MB">MB</SelectItem>
                            <SelectItem value="GB">GB</SelectItem>
                            <SelectItem value="TB">TB</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>
                  </Field>
                  {error ? (
                    <Field data-invalid>
                      <FieldError>{error}</FieldError>
                    </Field>
                  ) : null}
                </FieldGroup>
              </form>
            </CardContent>
            <CardFooter className="justify-end">
              <Button
                className="w-full sm:w-auto"
                form="create-grant"
                type="submit"
              >
                <Plus data-icon="inline-start" />
                创建授权
              </Button>
            </CardFooter>
          </Card>

          <section
            aria-label="上传授权列表"
            className="hidden overflow-x-auto md:block"
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>授权 PIN</TableHead>
                  <TableHead>备注</TableHead>
                  <TableHead>规则</TableHead>
                  <TableHead>批次上限</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {grants.map((grant) => {
                  const codeKey = `grant-${grant.id}-code`
                  const urlKey = `grant-${grant.id}-url`
                  return (
                    <TableRow key={grant.id}>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <code className="font-mono tracking-[0.12em]">
                            {grant.code || "-"}
                          </code>
                          {grant.code ? (
                            <>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                title="复制代码"
                                aria-label="复制代码"
                                onClick={() =>
                                  copy(
                                    buildCodeMessage(
                                      location.origin,
                                      "upload",
                                      grant.code!,
                                      title,
                                    ),
                                    codeKey,
                                  )
                                }
                              >
                                {copied === codeKey ? <Check /> : <Copy />}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                title="复制直达链接"
                                aria-label="复制直达链接"
                                onClick={() =>
                                  copy(
                                    buildPrefilledUrl(
                                      location.origin,
                                      "upload",
                                      grant.code!,
                                    ),
                                    urlKey,
                                  )
                                }
                              >
                                {copied === urlKey ? <Check /> : <Link2 />}
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>{grant.label || "-"}</TableCell>
                      <TableCell className="text-xs">
                        <div className="flex flex-col gap-1">
                          {grant.time_rule_enabled ? (
                            <span>
                              {new Date(
                                grant.valid_from! * 1000,
                              ).toLocaleString()}{" "}
                              –{" "}
                              {new Date(
                                grant.valid_until! * 1000,
                              ).toLocaleString()}
                            </span>
                          ) : null}
                          {grant.uses_rule_enabled ? (
                            <span>
                              {grant.used_uses} / {grant.max_uses} 次
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        {formatBytes(grant.max_batch_bytes)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            grantStatus(grant) === "有效"
                              ? "default"
                              : "secondary"
                          }
                        >
                          {grantStatus(grant)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {!grant.revoked_at ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => revokeGrant(grant.id)}
                          >
                            撤销
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </section>
          <section
            aria-label="上传授权移动列表"
            className="flex flex-col divide-y border-y md:hidden"
          >
            {grants.map((grant) => {
              const codeKey = `grant-${grant.id}-code`
              const urlKey = `grant-${grant.id}-url`
              return (
                <article key={grant.id} className="flex flex-col gap-3 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {grant.label || "未命名授权"}
                      </div>
                      <code className="font-mono text-base tracking-[0.1em]">
                        {grant.code || "-"}
                      </code>
                    </div>
                    <Badge
                      className="shrink-0"
                      variant={
                        grantStatus(grant) === "有效" ? "default" : "secondary"
                      }
                    >
                      {grantStatus(grant)}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">批次上限</span>
                      <div>{formatBytes(grant.max_batch_bytes)}</div>
                    </div>
                    {grant.uses_rule_enabled ? (
                      <div>
                        <span className="text-muted-foreground">使用次数</span>
                        <div>
                          {grant.used_uses} / {grant.max_uses}
                        </div>
                      </div>
                    ) : null}
                    {grant.time_rule_enabled ? (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">有效时间</span>
                        <div>
                          {new Date(grant.valid_from! * 1000).toLocaleString()}
                          <br />至{" "}
                          {new Date(grant.valid_until! * 1000).toLocaleString()}
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {grant.code ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            copy(
                              buildCodeMessage(
                                location.origin,
                                "upload",
                                grant.code!,
                                title,
                              ),
                              codeKey,
                            )
                          }
                        >
                          {copied === codeKey ? (
                            <Check data-icon="inline-start" />
                          ) : (
                            <Copy data-icon="inline-start" />
                          )}
                          复制代码
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            copy(
                              buildPrefilledUrl(
                                location.origin,
                                "upload",
                                grant.code!,
                              ),
                              urlKey,
                            )
                          }
                        >
                          {copied === urlKey ? (
                            <Check data-icon="inline-start" />
                          ) : (
                            <Link2 data-icon="inline-start" />
                          )}
                          复制链接
                        </Button>
                      </>
                    ) : null}
                  </div>
                  {!grant.revoked_at ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => revokeGrant(grant.id)}
                    >
                      撤销授权
                    </Button>
                  ) : null}
                </article>
              )
            })}
          </section>
          <PageControls value={grantPagination} onChange={setGrantPage} />
        </TabsContent>

        <TabsContent value="files" className="flex flex-col gap-4 pt-4">
          <div className="text-sm">{filePagination.total} 个文件</div>
          <section
            aria-label="文件列表"
            className="hidden overflow-x-auto md:block"
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>文件</TableHead>
                  <TableHead>批次 / 授权</TableHead>
                  <TableHead>大小</TableHead>
                  <TableHead>引用</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.map((file) => (
                  <TableRow key={file.id}>
                    <TableCell>
                      <div
                        className="max-w-64 truncate font-medium"
                        title={file.original_name}
                      >
                        {file.original_name}
                      </div>
                      <code className="text-[10px] text-muted-foreground">
                        {file.md5_hex}
                      </code>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      <span>{file.batch_id.slice(0, 8)}</span>
                      <br />
                      <span className="text-muted-foreground">
                        {file.grant_label || "未命名授权"}
                      </span>
                    </TableCell>
                    <TableCell>{formatBytes(file.size_bytes)}</TableCell>
                    <TableCell>{file.active_references}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          fileStatus(file) === "有效" ? "default" : "secondary"
                        }
                      >
                        {fileStatus(file)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {!file.revoked_at && file.batch_status === "ready" ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="撤销文件"
                            onClick={() => revokeFile(file.id)}
                          >
                            <Trash2 />
                          </Button>
                        ) : null}
                        {file.batch_status === "ready" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => revokeBatch(file.batch_id)}
                          >
                            撤销批次
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
          <section
            aria-label="文件移动列表"
            className="flex flex-col divide-y border-y md:hidden"
          >
            {files.map((file) => (
              <article key={file.id} className="flex flex-col gap-3 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="break-words text-sm font-medium">
                      {file.original_name}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {formatBytes(file.size_bytes)} · {file.active_references}{" "}
                      个引用
                    </div>
                  </div>
                  <Badge
                    className="shrink-0"
                    variant={
                      fileStatus(file) === "有效" ? "default" : "secondary"
                    }
                  >
                    {fileStatus(file)}
                  </Badge>
                </div>
                <div className="text-xs">
                  <span className="text-muted-foreground">批次 </span>
                  <code>{file.batch_id.slice(0, 8)}</code>
                  <span className="text-muted-foreground">
                    {" "}
                    · {file.grant_label || "未命名授权"}
                  </span>
                </div>
                {file.batch_status === "ready" ? (
                  <div className="grid grid-cols-2 gap-2">
                    {!file.revoked_at ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => revokeFile(file.id)}
                      >
                        <Trash2 data-icon="inline-start" />
                        撤销文件
                      </Button>
                    ) : (
                      <span />
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => revokeBatch(file.batch_id)}
                    >
                      撤销批次
                    </Button>
                  </div>
                ) : null}
              </article>
            ))}
          </section>
          <PageControls value={filePagination} onChange={setFilePage} />
        </TabsContent>
      </Tabs>
    </main>
  )
}
