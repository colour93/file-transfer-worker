import { Hono } from "hono"
import { deleteCookie, getCookie, setCookie } from "hono/cookie"
import { createRemoteJWKSet, jwtVerify } from "jose"

import { digest, pin, revealCode, safeEqual, sealCode, token } from "./crypto"
import {
  deleteObject,
  headObject,
  md5Base64,
  presignGet,
  presignPut,
} from "./s3"
import type { Env } from "./types"

type AppContext = { Bindings: Env }
type InputFile = { name: string; size: number; type?: string; md5: string }
type BatchRow = { id: string; status: string; expires_at: number | null }
type ObjectRow = {
  id: string
  object_key: string
  size_bytes: number
  md5_hex: string
  status: string
}

const app = new Hono<AppContext>()
const PENDING_UPLOAD_TTL = 12 * 60 * 60
const ADMIN_PAGE_SIZE = 20
const now = () => Math.floor(Date.now() / 1000)
const jsonError = (error: string, status = 400) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json" },
  })
const parseBody = async <T>(c: any) => {
  try {
    return (await c.req.json()) as T
  } catch {
    throw new Error("invalid_json")
  }
}
const emails = (env: Env) =>
  new Set(
    env.ADMIN_EMAILS.split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  )
const cookieOptions = (c: any, maxAge: number) => ({
  httpOnly: true,
  secure: new URL(c.req.url).protocol === "https:",
  sameSite: "Lax" as const,
  maxAge,
  path: "/",
})

async function limited(
  c: any,
  scope: string,
  limit: number,
  windowSeconds = 60,
) {
  const ip = c.req.header("CF-Connecting-IP") || "local"
  const bucket = Math.floor(now() / windowSeconds)
  const key = await digest(ip, c.env.HASH_SECRET)
  const row = (await c.env.DB.prepare(
    "INSERT INTO rate_limits(scope,key_hash,bucket,count,expires_at) VALUES(?,?,?,1,?) ON CONFLICT(scope,key_hash,bucket) DO UPDATE SET count=count+1 RETURNING count",
  )
    .bind(scope, key, bucket, (bucket + 1) * windowSeconds)
    .first()) as { count: number } | null
  return (row?.count || 1) > limit
}

async function admin(c: any) {
  const raw = getCookie(c, "session")
  if (!raw) return null
  const hash = await digest(raw, c.env.HASH_SECRET)
  const row = (await c.env.DB.prepare(
    "SELECT email,expires_at FROM oidc_sessions WHERE token_hash=?",
  )
    .bind(hash)
    .first()) as { email: string; expires_at: number } | null
  return row && row.expires_at > now() && emails(c.env).has(row.email)
    ? row.email
    : null
}

async function requireAdmin(c: any, next: any) {
  if (!(await admin(c))) return c.json({ error: "unauthorized" }, 401)
  return next()
}

async function discovery(env: Env) {
  const response = await fetch(
    `${env.OIDC_ISSUER.replace(/\/$/, "")}/.well-known/openid-configuration`,
  )
  if (!response.ok) throw new Error("oidc_discovery_failed")
  return (await response.json()) as any
}

function s3ConnectSources(env: Env) {
  const endpoint = new URL(env.S3_ENDPOINT)
  const sources = new Set([endpoint.origin])
  if (env.S3_FORCE_PATH_STYLE !== "true") {
    endpoint.hostname = `${env.S3_BUCKET}.${endpoint.hostname}`
    sources.add(endpoint.origin)
  }
  return [...sources].join(" ")
}

app.use("*", async (c, next) => {
  await next()
  c.header("X-Content-Type-Options", "nosniff")
  c.header("Referrer-Policy", "no-referrer")
  c.header(
    "Content-Security-Policy",
    `default-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ${s3ConnectSources(c.env)}; frame-ancestors 'none'`,
  )
})

app.onError((error, c) => {
  console.error(error instanceof Error ? error.message : "request_failed")
  return c.json(
    { error: error instanceof Error ? error.message : "request_failed" },
    500,
  )
})

app.get("/api/config", (c) =>
  c.json({ title: c.env.APP_TITLE?.trim() || "Transfer" }),
)

app.get("/auth/login", async (c) => {
  if (await limited(c, "login", 20, 300))
    return c.text("too many requests", 429)
  const callbackOrigin = new URL(c.env.OIDC_REDIRECT_URI).origin
  if (new URL(c.req.url).origin !== callbackOrigin)
    return c.redirect(`${callbackOrigin}/auth/login`)
  const oidc = await discovery(c.env)
  const state = token(24)
  const verifier = token(48)
  const nonce = token(24)
  const challenge = base64Url(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  )
  const params = new URLSearchParams({
    response_type: "code",
    client_id: c.env.OIDC_CLIENT_ID,
    redirect_uri: c.env.OIDC_REDIRECT_URI,
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
  })
  setCookie(c, "oidc_state", state, cookieOptions(c, 600))
  setCookie(c, "oidc_verifier", verifier, cookieOptions(c, 600))
  setCookie(c, "oidc_nonce", nonce, cookieOptions(c, 600))
  return c.redirect(`${oidc.authorization_endpoint}?${params}`)
})

app.get("/auth/callback", async (c) => {
  const state = c.req.query("state")
  if (!state || state !== getCookie(c, "oidc_state"))
    return c.text("invalid state", 400)
  const oidc = await discovery(c.env)
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: c.req.query("code") || "",
    redirect_uri: c.env.OIDC_REDIRECT_URI,
    client_id: c.env.OIDC_CLIENT_ID,
    client_secret: c.env.OIDC_CLIENT_SECRET,
    code_verifier: getCookie(c, "oidc_verifier") || "",
  })
  const tokenResponse = await fetch(oidc.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  })
  const tokenSet = (await tokenResponse.json()) as any
  if (!tokenResponse.ok || !tokenSet.id_token)
    return c.text("OIDC token exchange failed", 401)
  const verified = await jwtVerify(
    tokenSet.id_token,
    createRemoteJWKSet(new URL(oidc.jwks_uri)) as any,
    { issuer: oidc.issuer, audience: c.env.OIDC_CLIENT_ID },
  )
  if (verified.payload.nonce !== getCookie(c, "oidc_nonce"))
    return c.text("invalid nonce", 400)
  const email = String(verified.payload.email || "")
    .trim()
    .toLowerCase()
  if (!email) return c.text("OIDC email claim is missing", 403)
  if (
    c.env.OIDC_REQUIRE_VERIFIED_EMAIL !== "false" &&
    verified.payload.email_verified !== true
  )
    return c.text("OIDC email is not verified", 403)
  if (!emails(c.env).has(email))
    return c.text("email is not an administrator", 403)
  const session = token(32)
  const createdAt = now()
  const ttl = Number(c.env.SESSION_TTL || 28800)
  await c.env.DB.prepare(
    "INSERT INTO oidc_sessions(token_hash,email,created_at,expires_at) VALUES(?,?,?,?)",
  )
    .bind(
      await digest(session, c.env.HASH_SECRET),
      email,
      createdAt,
      createdAt + ttl,
    )
    .run()
  deleteCookie(c, "oidc_state", { path: "/" })
  deleteCookie(c, "oidc_verifier", { path: "/" })
  deleteCookie(c, "oidc_nonce", { path: "/" })
  setCookie(c, "session", session, cookieOptions(c, ttl))
  return c.redirect("/admin")
})

app.post("/auth/logout", async (c) => {
  const raw = getCookie(c, "session")
  if (raw)
    await c.env.DB.prepare("DELETE FROM oidc_sessions WHERE token_hash=?")
      .bind(await digest(raw, c.env.HASH_SECRET))
      .run()
  deleteCookie(c, "session", { path: "/" })
  return c.json({ ok: true })
})

app.post("/api/batches", async (c) => {
  if (await limited(c, "batch-create", 20, 60))
    return jsonError("too_many_requests", 429)
  const body = await parseBody<{ code: string; files: InputFile[] }>(c)
  const maxFiles = Number(c.env.MAX_BATCH_FILES || 20)
  if (
    !body.code ||
    !Array.isArray(body.files) ||
    body.files.length < 1 ||
    body.files.length > maxFiles
  )
    return jsonError("invalid_batch")
  const files = body.files.map((file) => ({
    name: String(file.name || "").slice(0, 255),
    size: Number(file.size),
    type: String(file.type || "application/octet-stream").slice(0, 150),
    md5: String(file.md5 || "").toLowerCase(),
  }))
  const maxFileBytes = Number(c.env.MAX_FILE_BYTES || 5368709120)
  if (
    files.some(
      (file) =>
        !file.name ||
        !Number.isSafeInteger(file.size) ||
        file.size < 0 ||
        file.size > maxFileBytes ||
        !/^[a-f0-9]{32}$/.test(file.md5),
    )
  )
    return jsonError("invalid_file")
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0)
  if (!Number.isSafeInteger(totalBytes)) return jsonError("invalid_batch_size")
  const codeHash = await digest(body.code, c.env.HASH_SECRET)
  const grant = (await c.env.DB.prepare(
    "SELECT * FROM upload_grants WHERE code_hash=?",
  )
    .bind(codeHash)
    .first()) as any
  const timestamp = now()
  if (!grant || grant.revoked_at || totalBytes > grant.max_batch_bytes)
    return jsonError("invalid_upload_code", 403)
  if (
    grant.time_rule_enabled &&
    (timestamp < grant.valid_from || timestamp > grant.valid_until)
  )
    return jsonError("upload_code_outside_time_window", 403)
  if (grant.uses_rule_enabled && grant.used_uses >= grant.max_uses)
    return jsonError("upload_code_exhausted", 403)

  const batchId = crypto.randomUUID()
  const pickupPin = pin()
  const shareToken = token(32)
  const completionToken = token(32)
  const reserved = await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO transfer_batches(id,upload_grant_id,pickup_hash,share_hash,completion_hash,status,total_files,total_bytes,created_at) SELECT ?,id,?,?,?,'pending',?,?,? FROM upload_grants WHERE id=? AND revoked_at IS NULL AND (time_rule_enabled=0 OR (valid_from<=? AND valid_until>=?)) AND (uses_rule_enabled=0 OR used_uses<max_uses)",
    ).bind(
      batchId,
      await digest(pickupPin, c.env.HASH_SECRET),
      await digest(shareToken, c.env.HASH_SECRET),
      await digest(completionToken, c.env.HASH_SECRET),
      files.length,
      totalBytes,
      timestamp,
      grant.id,
      timestamp,
      timestamp,
    ),
    c.env.DB.prepare(
      "UPDATE upload_grants SET used_uses=used_uses+1 WHERE id=? AND EXISTS(SELECT 1 FROM transfer_batches WHERE id=?)",
    ).bind(grant.id, batchId),
  ])
  if (!reserved[0].meta.changes)
    return jsonError("upload_code_unavailable", 409)

  const uploads: Array<{
    fileId: string
    ordinal: number
    uploadUrl: string
    headers: Record<string, string>
  }> = []
  const batchObjects = new Map<string, ObjectRow>()
  const uploadedObjects = new Set<string>()
  try {
    for (let ordinal = 0; ordinal < files.length; ordinal += 1) {
      const file = files[ordinal]
      const fingerprint = `${file.size}:${file.md5}`
      let object =
        batchObjects.get(fingerprint) ||
        ((await c.env.DB.prepare(
          "SELECT id,object_key,size_bytes,md5_hex,status FROM stored_objects WHERE status='ready' AND size_bytes=? AND md5_hex=? LIMIT 1",
        )
          .bind(file.size, file.md5)
          .first()) as ObjectRow | null)
      if (object && !batchObjects.has(fingerprint)) {
        const existing = await headObject(c.env, object.object_key)
        if (!existing.ok && existing.status !== 404)
          throw new Error("storage_check_failed")
        if (
          existing.status === 404 ||
          Number(existing.headers.get("content-length")) !==
            object.size_bytes ||
          existing.headers.get("x-amz-meta-md5")?.toLowerCase() !==
            object.md5_hex
        ) {
          await c.env.DB.prepare(
            "UPDATE stored_objects SET status='deleted',deleted_at=? WHERE id=? AND status='ready'",
          )
            .bind(timestamp, object.id)
            .run()
          object = null
        }
      }
      if (!object) {
        const objectId = crypto.randomUUID()
        const objectKey = `objects/${file.md5.slice(0, 2)}/${objectId}`
        await c.env.DB.prepare(
          "INSERT INTO stored_objects(id,object_key,size_bytes,md5_hex,status,created_at) VALUES(?,?,?,?, 'pending',?)",
        )
          .bind(objectId, objectKey, file.size, file.md5, timestamp)
          .run()
        object = {
          id: objectId,
          object_key: objectKey,
          size_bytes: file.size,
          md5_hex: file.md5,
          status: "pending",
        }
      }
      batchObjects.set(fingerprint, object)
      const fileId = crypto.randomUUID()
      await c.env.DB.prepare(
        "INSERT INTO batch_files(id,batch_id,object_id,original_name,content_type,size_bytes,md5_hex,ordinal) VALUES(?,?,?,?,?,?,?,?)",
      )
        .bind(
          fileId,
          batchId,
          object.id,
          file.name,
          file.type,
          file.size,
          file.md5,
          ordinal,
        )
        .run()
      if (object.status === "pending" && !uploadedObjects.has(object.id)) {
        uploadedObjects.add(object.id)
        uploads.push({
          fileId,
          ordinal,
          uploadUrl: await presignPut(
            c.env,
            object.object_key,
            file.type,
            file.md5,
            Number(c.env.UPLOAD_URL_TTL || 900),
          ),
          headers: {
            "content-type": file.type,
            "content-md5": md5Base64(file.md5),
            "x-amz-meta-md5": file.md5,
          },
        })
      }
    }
  } catch (error) {
    const objects = await c.env.DB.prepare(
      "SELECT DISTINCT object_id FROM batch_files WHERE batch_id=?",
    )
      .bind(batchId)
      .all<{ object_id: string }>()
    await c.env.DB.batch([
      c.env.DB.prepare(
        "UPDATE transfer_batches SET status='revoked',revoked_at=? WHERE id=? AND status='pending'",
      ).bind(now(), batchId),
      c.env.DB.prepare(
        "UPDATE upload_grants SET used_uses=MAX(0,used_uses-1) WHERE id=?",
      ).bind(grant.id),
    ])
    for (const object of objects.results)
      c.executionCtx.waitUntil(reclaimObject(c.env, object.object_id))
    throw error
  }

  let expiresAt: number | null = null
  if (uploads.length === 0) {
    expiresAt = timestamp + 7 * 86400
    await c.env.DB.prepare(
      "UPDATE transfer_batches SET status='ready',completed_at=?,expires_at=? WHERE id=? AND status='pending'",
    )
      .bind(timestamp, expiresAt, batchId)
      .run()
  }
  return c.json({
    id: batchId,
    pickupPin,
    shareUrl: `${new URL(c.req.url).origin}/s/${shareToken}`,
    completionToken,
    uploads,
    complete: uploads.length === 0,
    expiresAt,
  })
})

app.post("/api/batches/:id/complete", async (c) => {
  const body = await parseBody<{ completionToken: string }>(c)
  const batch = (await c.env.DB.prepare(
    "SELECT * FROM transfer_batches WHERE id=?",
  )
    .bind(c.req.param("id"))
    .first()) as any
  if (
    !batch ||
    !safeEqual(
      batch.completion_hash,
      await digest(body.completionToken || "", c.env.HASH_SECRET),
    )
  )
    return jsonError("not_found", 404)
  if (batch.status === "ready")
    return c.json({ ok: true, expiresAt: batch.expires_at })
  if (batch.status !== "pending") return jsonError("batch_unavailable", 409)
  const pending = await c.env.DB.prepare(
    "SELECT DISTINCT o.id,o.object_key,o.size_bytes,o.md5_hex,o.status FROM stored_objects o JOIN batch_files f ON f.object_id=o.id WHERE f.batch_id=? AND o.status='pending'",
  )
    .bind(batch.id)
    .all<ObjectRow>()
  for (const object of pending.results) {
    const response = await headObject(c.env, object.object_key)
    if (
      !response.ok ||
      Number(response.headers.get("content-length")) !== object.size_bytes ||
      response.headers.get("x-amz-meta-md5")?.toLowerCase() !== object.md5_hex
    )
      return jsonError("upload_not_ready", 409)
  }
  for (const object of pending.results) {
    const existing = (await c.env.DB.prepare(
      "SELECT id FROM stored_objects WHERE status='ready' AND size_bytes=? AND md5_hex=? AND id<>? LIMIT 1",
    )
      .bind(object.size_bytes, object.md5_hex, object.id)
      .first()) as { id: string } | null
    if (existing) {
      await c.env.DB.prepare(
        "UPDATE batch_files SET object_id=? WHERE batch_id=? AND object_id=?",
      )
        .bind(existing.id, batch.id, object.id)
        .run()
      const deleted = await deleteObject(c.env, object.object_key)
      if (deleted.ok || deleted.status === 404)
        await c.env.DB.prepare(
          "UPDATE stored_objects SET status='deleted',deleted_at=? WHERE id=?",
        )
          .bind(now(), object.id)
          .run()
    } else {
      await c.env.DB.prepare(
        "UPDATE stored_objects SET status='ready',ready_at=? WHERE id=? AND status='pending'",
      )
        .bind(now(), object.id)
        .run()
    }
  }
  for (const object of pending.results) {
    const canonical = (await c.env.DB.prepare(
      "SELECT id FROM stored_objects WHERE status='ready' AND size_bytes=? AND md5_hex=? ORDER BY ready_at,id LIMIT 1",
    )
      .bind(object.size_bytes, object.md5_hex)
      .first()) as { id: string } | null
    const current = (await c.env.DB.prepare(
      "SELECT status FROM stored_objects WHERE id=?",
    )
      .bind(object.id)
      .first()) as { status: string } | null
    if (
      canonical &&
      canonical.id !== object.id &&
      current?.status === "ready"
    ) {
      await c.env.DB.prepare(
        "UPDATE batch_files SET object_id=? WHERE batch_id=? AND object_id=?",
      )
        .bind(canonical.id, batch.id, object.id)
        .run()
      const deleted = await deleteObject(c.env, object.object_key)
      if (deleted.ok || deleted.status === 404)
        await c.env.DB.prepare(
          "UPDATE stored_objects SET status='deleted',deleted_at=? WHERE id=?",
        )
          .bind(now(), object.id)
          .run()
    }
  }
  const completedAt = now()
  const expiresAt = completedAt + 7 * 86400
  await c.env.DB.prepare(
    "UPDATE transfer_batches SET status='ready',completed_at=?,expires_at=? WHERE id=? AND status='pending'",
  )
    .bind(completedAt, expiresAt, batch.id)
    .run()
  return c.json({ ok: true, expiresAt })
})

async function manifest(env: Env, batch: BatchRow) {
  const result = await env.DB.prepare(
    "SELECT f.id,f.original_name,f.content_type,f.size_bytes,o.object_key FROM batch_files f JOIN stored_objects o ON o.id=f.object_id WHERE f.batch_id=? AND f.revoked_at IS NULL AND o.status=? ORDER BY f.ordinal",
  )
    .bind(batch.id, "ready")
    .all<any>()
  const files = await Promise.all(
    result.results.map(async (file) => {
      const ttl = Number(env.DOWNLOAD_URL_TTL || 60)
      const [url, previewUrl] = await Promise.all([
        presignGet(env, file.object_key, file.original_name, ttl),
        presignGet(env, file.object_key, file.original_name, ttl, "inline"),
      ])
      return {
        id: file.id,
        name: file.original_name,
        type: file.content_type,
        size: file.size_bytes,
        url,
        previewUrl,
      }
    }),
  )
  return { id: batch.id, expiresAt: batch.expires_at, files }
}

app.post("/api/downloads/resolve", async (c) => {
  if (await limited(c, "download", 20, 60))
    return jsonError("too_many_requests", 429)
  const body = await parseBody<{ pin: string }>(c)
  const batch = (await c.env.DB.prepare(
    "SELECT id,status,expires_at FROM transfer_batches WHERE pickup_hash=? AND status='ready' AND expires_at>?",
  )
    .bind(await digest(body.pin || "", c.env.HASH_SECRET), now())
    .first()) as BatchRow | null
  if (!batch) return jsonError("not_found", 404)
  const value = await manifest(c.env, batch)
  if (!value.files.length) return jsonError("not_found", 404)
  return c.json(value)
})

app.get("/api/shares/:token", async (c) => {
  const batch = (await c.env.DB.prepare(
    "SELECT id,status,expires_at FROM transfer_batches WHERE share_hash=? AND status='ready' AND expires_at>?",
  )
    .bind(await digest(c.req.param("token"), c.env.HASH_SECRET), now())
    .first()) as BatchRow | null
  if (!batch) return jsonError("not_found", 404)
  const value = await manifest(c.env, batch)
  if (!value.files.length) return jsonError("not_found", 404)
  return c.json(value)
})

app.get("/s/:token", (c) =>
  c.redirect(`/?share=${encodeURIComponent(c.req.param("token"))}`),
)

app.post("/api/admin/upload-grants", requireAdmin, async (c) => {
  const email = await admin(c)
  const body = await parseBody<{
    label?: string
    timeRuleEnabled: boolean
    validFrom?: string
    validUntil?: string
    usesRuleEnabled: boolean
    maxUses?: number
    maxBatchBytes: number
  }>(c)
  if (!email || (!body.timeRuleEnabled && !body.usesRuleEnabled))
    return jsonError("select_at_least_one_rule")
  const validFrom = body.timeRuleEnabled
    ? Math.floor(new Date(body.validFrom || "").getTime() / 1000)
    : null
  const validUntil = body.timeRuleEnabled
    ? Math.floor(new Date(body.validUntil || "").getTime() / 1000)
    : null
  const maxUses = body.usesRuleEnabled ? Number(body.maxUses) : null
  const maxBatchBytes = Number(body.maxBatchBytes)
  if (
    (body.timeRuleEnabled &&
      (!Number.isFinite(validFrom) ||
        !Number.isFinite(validUntil) ||
        validUntil! <= validFrom!)) ||
    (body.usesRuleEnabled &&
      (!Number.isSafeInteger(maxUses) || maxUses! < 1)) ||
    !Number.isSafeInteger(maxBatchBytes) ||
    maxBatchBytes < 1
  )
    return jsonError("invalid_rules")
  const code = pin()
  const id = crypto.randomUUID()
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO upload_grants(id,code_hash,label,time_rule_enabled,valid_from,valid_until,uses_rule_enabled,max_uses,max_batch_bytes,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    ).bind(
      id,
      await digest(code, c.env.HASH_SECRET),
      body.label?.trim() || null,
      body.timeRuleEnabled ? 1 : 0,
      validFrom,
      validUntil,
      body.usesRuleEnabled ? 1 : 0,
      maxUses,
      maxBatchBytes,
      email,
      now(),
    ),
    c.env.DB.prepare(
      "INSERT INTO upload_grant_codes(upload_grant_id,code_ciphertext) VALUES(?,?)",
    ).bind(id, await sealCode(code, c.env.HASH_SECRET)),
  ])
  return c.json({ id, code })
})

function pageParams(c: any) {
  const page = Math.max(1, Number.parseInt(c.req.query("page") || "1", 10) || 1)
  const pageSize = Math.min(
    ADMIN_PAGE_SIZE,
    Math.max(
      1,
      Number.parseInt(c.req.query("pageSize") || String(ADMIN_PAGE_SIZE), 10) ||
        ADMIN_PAGE_SIZE,
    ),
  )
  return { page, pageSize }
}

function pageResult(page: number, pageSize: number, total: number) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  return { page: Math.min(page, totalPages), pageSize, total, totalPages }
}

app.get("/api/admin/upload-grants", requireAdmin, async (c) => {
  const { page, pageSize } = pageParams(c)
  const totalRow = await c.env.DB.prepare(
    "SELECT COUNT(*) AS total FROM upload_grants",
  ).first<{ total: number }>()
  const pagination = pageResult(page, pageSize, Number(totalRow?.total || 0))
  const grants = await c.env.DB.prepare(
    "SELECT g.id,g.label,g.time_rule_enabled,g.valid_from,g.valid_until,g.uses_rule_enabled,g.max_uses,g.used_uses,g.max_batch_bytes,g.revoked_at,g.created_by,g.created_at,s.code_ciphertext FROM upload_grants g LEFT JOIN upload_grant_codes s ON s.upload_grant_id=g.id ORDER BY g.created_at DESC LIMIT ? OFFSET ?",
  )
    .bind(pageSize, (pagination.page - 1) * pageSize)
    .all<any>()
  const results = await Promise.all(
    grants.results.map(async (grant) => {
      let code: string | null = null
      if (grant.code_ciphertext) {
        try {
          code = await revealCode(grant.code_ciphertext, c.env.HASH_SECRET)
        } catch {
          code = null
        }
      }
      const { code_ciphertext: _ciphertext, ...value } = grant
      return { ...value, code }
    }),
  )
  return c.json({ grants: results, pagination })
})

app.post("/api/admin/upload-grants/:id/revoke", requireAdmin, async (c) => {
  await c.env.DB.prepare(
    "UPDATE upload_grants SET revoked_at=? WHERE id=? AND revoked_at IS NULL",
  )
    .bind(now(), c.req.param("id"))
    .run()
  return c.json({ ok: true })
})

app.get("/api/admin/files", requireAdmin, async (c) => {
  const { page, pageSize } = pageParams(c)
  const totalRow = await c.env.DB.prepare(
    "SELECT COUNT(*) AS total FROM batch_files",
  ).first<{ total: number }>()
  const pagination = pageResult(page, pageSize, Number(totalRow?.total || 0))
  const files = await c.env.DB.prepare(
    "SELECT f.id,f.batch_id,f.original_name,f.content_type,f.size_bytes,f.md5_hex,f.revoked_at,b.status AS batch_status,b.created_at,b.expires_at,g.label AS grant_label,o.status AS object_status,(SELECT COUNT(*) FROM batch_files rf JOIN transfer_batches rb ON rb.id=rf.batch_id WHERE rf.object_id=o.id AND rf.revoked_at IS NULL AND rb.status='ready' AND rb.expires_at>?) AS active_references FROM batch_files f JOIN transfer_batches b ON b.id=f.batch_id JOIN upload_grants g ON g.id=b.upload_grant_id JOIN stored_objects o ON o.id=f.object_id ORDER BY b.created_at DESC,f.ordinal LIMIT ? OFFSET ?",
  )
    .bind(now(), pageSize, (pagination.page - 1) * pageSize)
    .all()
  return c.json({ files: files.results, pagination })
})

async function reclaimObject(env: Env, objectId: string) {
  const object = (await env.DB.prepare(
    "SELECT id,object_key,status FROM stored_objects WHERE id=? AND status<>'deleted'",
  )
    .bind(objectId)
    .first()) as { id: string; object_key: string; status: string } | null
  if (!object) return
  const timestamp = now()
  const active = await env.DB.prepare(
    "SELECT 1 FROM batch_files f JOIN transfer_batches b ON b.id=f.batch_id WHERE f.object_id=? AND f.revoked_at IS NULL AND ((b.status='ready' AND b.expires_at>?) OR (b.status='pending' AND b.created_at>?)) LIMIT 1",
  )
    .bind(objectId, timestamp, timestamp - PENDING_UPLOAD_TTL)
    .first()
  if (active) return
  const response = await deleteObject(env, object.object_key)
  if (response.ok || response.status === 404)
    await env.DB.prepare(
      "UPDATE stored_objects SET status='deleted',deleted_at=? WHERE id=?",
    )
      .bind(now(), objectId)
      .run()
}

app.post("/api/admin/files/:id/revoke", requireAdmin, async (c) => {
  const file = (await c.env.DB.prepare(
    "SELECT batch_id,object_id FROM batch_files WHERE id=?",
  )
    .bind(c.req.param("id"))
    .first()) as { batch_id: string; object_id: string } | null
  if (!file) return jsonError("not_found", 404)
  await c.env.DB.prepare(
    "UPDATE batch_files SET revoked_at=? WHERE id=? AND revoked_at IS NULL",
  )
    .bind(now(), c.req.param("id"))
    .run()
  const remaining = await c.env.DB.prepare(
    "SELECT 1 FROM batch_files WHERE batch_id=? AND revoked_at IS NULL LIMIT 1",
  )
    .bind(file.batch_id)
    .first()
  if (!remaining)
    await c.env.DB.prepare(
      "UPDATE transfer_batches SET status='revoked',revoked_at=? WHERE id=? AND status='ready'",
    )
      .bind(now(), file.batch_id)
      .run()
  c.executionCtx.waitUntil(reclaimObject(c.env, file.object_id))
  return c.json({ ok: true })
})

app.post("/api/admin/batches/:id/revoke", requireAdmin, async (c) => {
  const batch = (await c.env.DB.prepare(
    "SELECT status,upload_grant_id FROM transfer_batches WHERE id=?",
  )
    .bind(c.req.param("id"))
    .first()) as { status: string; upload_grant_id: string } | null
  if (!batch) return jsonError("not_found", 404)
  const objects = await c.env.DB.prepare(
    "SELECT DISTINCT object_id FROM batch_files WHERE batch_id=?",
  )
    .bind(c.req.param("id"))
    .all<{ object_id: string }>()
  const revoked = await c.env.DB.prepare(
    "UPDATE transfer_batches SET status='revoked',revoked_at=? WHERE id=? AND status IN ('pending','ready')",
  )
    .bind(now(), c.req.param("id"))
    .run()
  if (revoked.meta.changes && batch.status === "pending")
    await c.env.DB.prepare(
      "UPDATE upload_grants SET used_uses=MAX(0,used_uses-1) WHERE id=?",
    )
      .bind(batch.upload_grant_id)
      .run()
  for (const object of objects.results)
    c.executionCtx.waitUntil(reclaimObject(c.env, object.object_id))
  return c.json({ ok: true })
})

async function scheduled(env: Env) {
  const timestamp = now()
  const pendingCutoff = timestamp - PENDING_UPLOAD_TTL
  await env.DB.prepare(
    "UPDATE transfer_batches SET status='expired' WHERE status='ready' AND expires_at<=?",
  )
    .bind(timestamp)
    .run()
  const stale = await env.DB.prepare(
    "SELECT id,upload_grant_id FROM transfer_batches WHERE status='pending' AND created_at<=?",
  )
    .bind(pendingCutoff)
    .all<{ id: string; upload_grant_id: string }>()
  for (const batch of stale.results) {
    const objects = await env.DB.prepare(
      "SELECT DISTINCT object_id FROM batch_files WHERE batch_id=?",
    )
      .bind(batch.id)
      .all<{ object_id: string }>()
    const expired = await env.DB.prepare(
      "UPDATE transfer_batches SET status='expired' WHERE id=? AND status='pending'",
    )
      .bind(batch.id)
      .run()
    if (expired.meta.changes) {
      await env.DB.batch([
        env.DB.prepare(
          "UPDATE upload_grants SET used_uses=MAX(0,used_uses-1) WHERE id=?",
        ).bind(batch.upload_grant_id),
        env.DB.prepare("DELETE FROM batch_files WHERE batch_id=?").bind(
          batch.id,
        ),
      ])
      for (const object of objects.results)
        await reclaimObject(env, object.object_id)
    }
  }
  const garbage = await env.DB.prepare(
    "SELECT id FROM stored_objects o WHERE (status='ready' AND NOT EXISTS(SELECT 1 FROM batch_files f JOIN transfer_batches b ON b.id=f.batch_id WHERE f.object_id=o.id AND f.revoked_at IS NULL AND ((b.status='ready' AND b.expires_at>?) OR (b.status='pending' AND b.created_at>?)))) OR (status='pending' AND created_at<=?)",
  )
    .bind(timestamp, pendingCutoff, pendingCutoff)
    .all<{ id: string }>()
  for (const object of garbage.results) await reclaimObject(env, object.id)
  await env.DB.prepare("DELETE FROM oidc_sessions WHERE expires_at<=?")
    .bind(timestamp)
    .run()
  await env.DB.prepare("DELETE FROM rate_limits WHERE expires_at<=?")
    .bind(timestamp)
    .run()
}

app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw))

export default {
  fetch: app.fetch,
  scheduled: (_event: ScheduledEvent, env: Env) => scheduled(env),
}

function base64Url(value: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(value)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}
