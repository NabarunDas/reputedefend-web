import { describe, expect, it } from "vitest"
import {
  containsTokenMaterial,
  decryptTokenPayload,
  encryptTokenPayload,
  forbiddenTokenFields,
} from "./token-crypto"

const key = "0123456789abcdef0123456789abcdef"
const payload = { accessToken: "ya29.synthetic-access", refreshToken: "1//synthetic-refresh" }

describe("token encryption", () => {
  it("never leaves plaintext in the stored material", () => {
    const encrypted = encryptTokenPayload({ payload, key, keyVersion: "v1" })
    const serialised = JSON.stringify(encrypted)
    expect(serialised).not.toContain(payload.accessToken)
    expect(serialised).not.toContain(payload.refreshToken)
    expect(serialised).not.toContain(key)
    expect(encrypted.keyVersion).toBe("v1")
  })

  it("round-trips only with the same key", () => {
    const encrypted = encryptTokenPayload({ payload, key, keyVersion: "v1" })
    expect(decryptTokenPayload<typeof payload>({ encrypted, key })).toEqual(payload)
    expect(decryptTokenPayload({ encrypted, key: "fedcba9876543210fedcba9876543210" })).toBeNull()
  })

  it("returns null rather than throwing when the ciphertext is tampered with", () => {
    const encrypted = encryptTokenPayload({ payload, key, keyVersion: "v1" })
    const tampered = Buffer.from(encrypted.ciphertext, "base64")
    tampered[0] ^= 0xff
    expect(decryptTokenPayload({
      encrypted: { ...encrypted, ciphertext: tampered.toString("base64") },
      key,
    })).toBeNull()
    expect(decryptTokenPayload({ encrypted: { ...encrypted, authTag: Buffer.alloc(16).toString("base64") }, key })).toBeNull()
  })

  it("produces a different ciphertext for the same payload each time", () => {
    const first = encryptTokenPayload({ payload, key, keyVersion: "v1" })
    const second = encryptTokenPayload({ payload, key, keyVersion: "v1" })
    expect(first.ciphertext).not.toBe(second.ciphertext)
    expect(first.iv).not.toBe(second.iv)
  })
})

describe("token leak detection", () => {
  it("flags every forbidden field name", () => {
    for (const field of forbiddenTokenFields) {
      expect(containsTokenMaterial({ [field]: "x" }), field).toBe(true)
    }
  })

  it("passes an Admin-safe response", () => {
    expect(containsTokenMaterial({
      status: "CONNECTED",
      grantedScopes: ["https://www.googleapis.com/auth/business.manage"],
      connectedAt: "2026-02-01T10:00:00.000Z",
      lastErrorCode: "QUOTA_EXCEEDED",
    })).toBe(false)
    expect(containsTokenMaterial(null)).toBe(false)
  })
})
