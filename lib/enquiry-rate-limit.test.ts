import { describe, expect, it } from "vitest"
import { hashPublicClient, trustedClientAddress } from "@/lib/enquiry-rate-limit"

function request(headers: Record<string, string>) {
  return new Request("https://profilerelaunch.com/api/enquiry", { headers })
}

describe("trusted public client address", () => {
  it("ignores a client-supplied X-Forwarded-For list and its leftmost address", () => {
    const spoofed = request({
      "x-forwarded-for": "203.0.113.10, 198.51.100.20",
      "x-real-ip": "203.0.113.10",
    })
    const otherSpoof = request({ "x-forwarded-for": "192.0.2.8" })
    expect(trustedClientAddress(spoofed)).toBe("unknown")
    expect(trustedClientAddress(otherSpoof)).toBe("unknown")
    expect(hashPublicClient(trustedClientAddress(spoofed), "server-secret")).toBe(
      hashPublicClient(trustedClientAddress(otherSpoof), "server-secret"),
    )
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
    expect(hashPublicClient(trustedClientAddress(first), secret)).toBe(hashPublicClient("198.51.100.24", secret))
    expect(hashPublicClient(trustedClientAddress(first), secret)).toBe(hashPublicClient(trustedClientAddress(second), secret))
    expect(hashPublicClient("198.51.100.24", "other-secret")).not.toBe(hashPublicClient("198.51.100.24", secret))
  })

  it("does not treat a forged leftmost Vercel token as the client", () => {
    const requestWithGarbageTail = request({ "x-vercel-forwarded-for": "203.0.113.10, not-an-address" })
    expect(trustedClientAddress(requestWithGarbageTail)).toBe("unknown")
  })
})
