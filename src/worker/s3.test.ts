import { describe, expect, it } from "vitest"

import { md5Base64, presignPut } from "./s3"
import type { Env } from "./types"

describe("md5Base64", () => {
  it("converts a hexadecimal MD5 digest", () => {
    expect(md5Base64("5d41402abc4b2a76b9719d911017c592")).toBe("XUFAKrxLKna5cZ2REBfFkg==")
  })

  it("uses the virtual-hosted bucket endpoint when path style is disabled", async () => {
    const env = { S3_ENDPOINT: "https://oss-cn-shenzhen.aliyuncs.com", S3_BUCKET: "93-file-transfer", S3_ACCESS_KEY_ID: "test", S3_SECRET_ACCESS_KEY: "test", S3_REGION: "cn-shenzhen", S3_FORCE_PATH_STYLE: "false" } as Env
    const url = await presignPut(env, "objects/test", "text/plain", "5d41402abc4b2a76b9719d911017c592", 900)
    expect(new URL(url).hostname).toBe("93-file-transfer.oss-cn-shenzhen.aliyuncs.com")
  })
})
