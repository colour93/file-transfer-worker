import { describe, expect, it } from "vitest"

import { md5File } from "./hash"

describe("md5File", () => {
  it("hashes file contents", async () => {
    expect(await md5File(new File(["hello"], "hello.txt"))).toBe(
      "5d41402abc4b2a76b9719d911017c592",
    )
  })
})
