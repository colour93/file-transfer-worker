import { describe, expect, it } from "vitest"

import { buildCodeMessage, buildPrefilledUrl } from "./sharing"

describe("credential sharing", () => {
  it("builds an upload URL that can prefill the code", () => {
    expect(buildPrefilledUrl("https://files.example", "upload", "1234567890")).toBe("https://files.example/?mode=upload&code=1234567890")
  })

  it("includes the current origin in pickup guidance", () => {
    expect(buildCodeMessage("https://files.example", "download", "1234567890")).toContain("请前往 https://files.example")
  })
})
