import { describe, expect, it } from "vitest"
import { digest, pin, revealCode, sealCode, token } from "./crypto"

describe("credentials", () => {
  it("generates a six digit PIN", () => expect(pin()).toMatch(/^\d{6}$/))
  it("generates URL-safe random tokens", () =>
    expect(token()).toMatch(/^[A-Za-z0-9_-]+$/))
  it("produces stable, secret-bound digests", async () => {
    expect(await digest("123", "a")).toBe(await digest("123", "a"))
    expect(await digest("123", "a")).not.toBe(await digest("123", "b"))
  })
  it("round-trips encrypted upload codes without storing plaintext", async () => {
    const encrypted = await sealCode("123456", "secret")
    expect(encrypted).not.toContain("123456")
    expect(await revealCode(encrypted, "secret")).toBe("123456")
    await expect(revealCode(encrypted, "wrong-secret")).rejects.toThrow()
  })
})
