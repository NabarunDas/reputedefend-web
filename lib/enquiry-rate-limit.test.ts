import { beforeEach, describe, expect, it } from "vitest"
import { consumePublicRateLimit, hashPublicClient, resetEnquiryRateLimit, trustedClientAddress } from "@/lib/enquiry-rate-limit"

function request(headers: Record<string, string>) {
  return new Request("https://profilerelaunch.com/api/enquiry", { headers })
}

const identified = () => request({ "x-vercel-forwarded-for": "198.51.100.24" })

describe("trusted public client address", () => {
  it("ignores a client-supplied X-Forwarded-For list and its leftmost address", () => {
    const spoofed = request({
      "x-forwarded-for": "203.0.113.10, 198.51.100.20",
      "x-real-ip": "203.0.113.10",
    })
    const otherSpoof = request({ "x-forwarded-for": "192.0.2.8" })
    expect(trustedClientAddress(spoofed)).toBeNull()
    expect(trustedClientAddress(otherSpoof)).toBeNull()
  })

  it("uses the rightmost x-vercel-forwarded-for address and the same hash on every instance", () => {
    const first = request({
      "x-forwarded-for": "203.0.113.10",
      "x-vercel-forwarded-for": "203.0.113.10, 198.51.100.24",
    })
    const second = request({ "x-vercel-forwarded-for": "198.51.100.24" })
    expect(trustedClientAddress(first)).toBe("198.51.100.24")
    expect(trustedClientAddress(second)).toBe("198.51.100.24")
    const secret = "shared-server-secret"
    expect(hashPublicClient(trustedClientAddress(first) ?? "", secret)).toBe(hashPublicClient("198.51.100.24", secret))
    expect(hashPublicClient(trustedClientAddress(first) ?? "", secret)).toBe(
      hashPublicClient(trustedClientAddress(second) ?? "", secret),
    )
    expect(hashPublicClient("198.51.100.24", "other-secret")).not.toBe(hashPublicClient("198.51.100.24", secret))
  })

  it("rejects a missing header and a forged or malformed rightmost token", () => {
    expect(trustedClientAddress(request({}))).toBeNull()
    expect(trustedClientAddress(request({ "x-vercel-forwarded-for": "   " }))).toBeNull()
    expect(trustedClientAddress(request({ "x-vercel-forwarded-for": "203.0.113.10, not-an-address" }))).toBeNull()
    expect(trustedClientAddress(request({ "x-vercel-forwarded-for": "198.51.100.24, 203.0.113.10" }))).toBe("203.0.113.10")
    expect(trustedClientAddress(request({ "x-vercel-forwarded-for": "01.2.3.4" }))).toBeNull()
    expect(trustedClientAddress(request({ "x-vercel-forwarded-for": "256.1.1.1" }))).toBeNull()
    expect(trustedClientAddress(request({ "x-vercel-forwarded-for": "198.51.100.24:443" }))).toBeNull()
    expect(trustedClientAddress(request({ "x-vercel-forwarded-for": "1:2:3" }))).toBeNull()
    expect(trustedClientAddress(request({ "x-vercel-forwarded-for": ":::" }))).toBeNull()
    expect(trustedClientAddress(request({ "x-vercel-forwarded-for": "fe80::1%eth0" }))).toBeNull()
    expect(trustedClientAddress(request({ "x-vercel-forwarded-for": "2001:DB8::1" }))).toBe("2001:db8::1")
    expect(trustedClientAddress(request({ "x-vercel-forwarded-for": "::1" }))).toBe("::1")
    expect(trustedClientAddress(request({ "x-vercel-forwarded-for": "1:2:3:4:5:6:7:8" }))).toBe("1:2:3:4:5:6:7:8")
    expect(trustedClientAddress(request({ "x-vercel-forwarded-for": "203.0.113.9, 2001:db8:85a3::8a2e:370:7334" }))).toBe(
      "2001:db8:85a3::8a2e:370:7334",
    )
  })
})

describe("unidentified clients do not share a budget", () => {
  beforeEach(() => {
    resetEnquiryRateLimit()
  })

  it("returns 503 for missing and malformed addresses without consuming an identified client's slots", async () => {
    const spoofed = request({ "x-forwarded-for": "203.0.113.10", "x-real-ip": "198.51.100.8" })
    const malformed = request({ "x-vercel-forwarded-for": "203.0.113.10, not-an-address" })
    for (let index = 0; index < 9; index += 1) {
      expect(await consumePublicRateLimit(new Request("https://profilerelaunch.com/api/enquiry"))).toEqual({ ok: false, status: 503 })
      expect(await consumePublicRateLimit(spoofed)).toEqual({ ok: false, status: 503 })
      expect(await consumePublicRateLimit(malformed)).toEqual({ ok: false, status: 503 })
    }
    for (let index = 0; index < 8; index += 1) {
      expect(await consumePublicRateLimit(identified())).toEqual({ ok: true })
    }
    expect(await consumePublicRateLimit(identified())).toEqual({ ok: false, status: 429 })
  })
})
