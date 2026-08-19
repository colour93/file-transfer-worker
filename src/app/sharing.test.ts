import { describe, expect, it } from "vitest"

import { buildCodeMessage, buildPrefilledUrl } from "./sharing"

describe("credential sharing", () => {
  it("builds an upload URL that can prefill the code", () => {
    expect(buildPrefilledUrl("https://files.example", "upload", "123456")).toBe("https://files.example/?mode=upload&code=123456")
  })

  it("includes the current origin in pickup guidance", () => {
    expect(buildCodeMessage("https://files.example", "download", "123456")).toContain("请前往 https://files.example")
  })
})
