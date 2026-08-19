# 管理 API

本文档描述管理后台使用的 HTTP API。所有 `/api/admin/*` 接口均要求管理员已通过 OIDC 登录，并在请求中携带同源 `session` Cookie。

## 通用约定

- 请求和响应使用 JSON，除 OIDC 跳转接口外。
- 时间字段均为 Unix 时间戳，单位为秒。
- 成功撤销操作返回 `{ "ok": true }`。
- 未登录、会话过期或邮箱不在 `ADMIN_EMAILS` 中时返回：

```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{ "error": "unauthorized" }
```

- 其他错误统一为 `{ "error": "错误码" }`。无法解析 JSON 等未被业务分支处理的异常可能返回 `500`。

## 管理员会话

### 登录

```http
GET /auth/login
```

跳转至配置的 OIDC 提供方。认证成功且邮箱通过管理员白名单校验后，服务写入 HttpOnly `session` Cookie，并跳转至 `/admin`。

登录限流为同一 IP 每 5 分钟 20 次；超限返回 `429 too many requests`。

### OIDC 回调

```http
GET /auth/callback?code=<code>&state=<state>
```

由 OIDC 提供方调用，不应由 API 客户端主动请求。成功后跳转至 `/admin`。

### 退出

```http
POST /auth/logout
```

删除服务端会话和浏览器中的 `session` Cookie。

```json
{ "ok": true }
```

## 上传授权

### 创建上传授权

```http
POST /api/admin/upload-grants
Content-Type: application/json
```

请求体：

```json
{
  "label": "项目资料",
  "timeRuleEnabled": true,
  "validFrom": "2026-08-19T00:00:00.000Z",
  "validUntil": "2026-08-20T00:00:00.000Z",
  "usesRuleEnabled": true,
  "maxUses": 10,
  "maxBatchBytes": 5368709120
}
```

| 字段              | 类型      | 必填     | 说明                                          |
| ----------------- | --------- | -------- | --------------------------------------------- |
| `label`           | `string`  | 否       | 授权备注；保存前去除首尾空白。                |
| `timeRuleEnabled` | `boolean` | 是       | 是否限制可用时间。                            |
| `validFrom`       | `string`  | 条件必填 | 启用时间规则时必填，必须能被 `Date` 解析。    |
| `validUntil`      | `string`  | 条件必填 | 启用时间规则时必填，且必须晚于 `validFrom`。  |
| `usesRuleEnabled` | `boolean` | 是       | 是否限制可创建的批次数。                      |
| `maxUses`         | `number`  | 条件必填 | 启用次数规则时必填，必须为大于等于 1 的整数。 |
| `maxBatchBytes`   | `number`  | 是       | 单批次容量上限，单位为字节，必须为正整数。    |

时间规则和次数规则必须至少启用一项。

成功响应：

```json
{
  "id": "b48f8724-20fa-4ec1-bf89-fc0188fc1eb6",
  "code": "123456"
}
```

可能的业务错误：

- `400 select_at_least_one_rule`：未启用任何规则。
- `400 invalid_rules`：时间、次数或容量参数无效。

### 查询上传授权

```http
GET /api/admin/upload-grants?page=1&pageSize=20
```

查询参数：

| 参数       | 默认值 | 说明                                 |
| ---------- | ------ | ------------------------------------ |
| `page`     | `1`    | 页码，最小为 1；超过末页时返回末页。 |
| `pageSize` | `20`   | 每页数量，范围为 1 至 20。           |

成功响应：

```json
{
  "grants": [
    {
      "id": "b48f8724-20fa-4ec1-bf89-fc0188fc1eb6",
      "label": "项目资料",
      "time_rule_enabled": 1,
      "valid_from": 1787068800,
      "valid_until": 1787155200,
      "uses_rule_enabled": 1,
      "max_uses": 10,
      "used_uses": 2,
      "max_batch_bytes": 5368709120,
      "revoked_at": null,
      "created_by": "admin@example.com",
      "created_at": 1787068800,
      "code": "123456"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

`time_rule_enabled` 和 `uses_rule_enabled` 使用 D1 整数布尔值 `0`/`1`。授权码解密失败时 `code` 为 `null`。

### 撤销上传授权

```http
POST /api/admin/upload-grants/:id/revoke
```

该接口幂等。授权不存在或已经撤销时仍返回：

```json
{ "ok": true }
```

撤销授权只阻止继续使用该授权创建批次，不会自动撤销已创建的批次。

## 文件管理

### 查询文件

```http
GET /api/admin/files?page=1&pageSize=20
```

分页参数与上传授权列表相同。

成功响应：

```json
{
  "files": [
    {
      "id": "d44d93f4-4f10-4452-9207-1248b76b91c4",
      "batch_id": "06d8e57c-8cd7-46b1-85af-f9f05e90bb1b",
      "original_name": "report.pdf",
      "content_type": "application/pdf",
      "size_bytes": 1048576,
      "md5_hex": "b6d81b360a5672d80c27430f39153e2c",
      "revoked_at": null,
      "batch_status": "ready",
      "created_at": 1787068800,
      "expires_at": 1787673600,
      "grant_label": "项目资料",
      "object_status": "ready",
      "active_references": 1
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

状态取值：

- `batch_status`：`pending`、`ready`、`revoked`、`expired`。
- `object_status`：`pending`、`ready`、`deleted`。
- `active_references`：当前仍被有效批次引用的数量。

### 撤销单个文件

```http
POST /api/admin/files/:id/revoke
```

成功时返回 `{ "ok": true }`。文件不存在时返回 `404 { "error": "not_found" }`。

撤销后该文件不再出现在取件结果中。如果它是批次中最后一个未撤销文件，批次也会被撤销。底层对象仅在没有其他有效引用时异步删除。

## 批次管理

### 撤销批次

```http
POST /api/admin/batches/:id/revoke
```

成功时返回 `{ "ok": true }`。批次不存在时返回 `404 { "error": "not_found" }`。

只有 `pending` 或 `ready` 状态会被更新为 `revoked`；对其他状态重复调用仍返回成功。撤销尚未完成的 `pending` 批次时，会归还一次上传授权使用次数。批次关联的底层对象仅在没有其他有效引用时异步删除。
