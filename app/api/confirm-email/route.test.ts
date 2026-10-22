import { afterEach, describe, expect, it, vi } from "vitest"
import { GET } from "./route"

afterEach(() => vi.unstubAllEnvs())

describe("email confirmation CSRF endpoint", () => {
  it("sets a same-site httpOnly CSRF cookie scoped to the matching POST endpoint", async () => {
    vi.stubEnv("VERCEL_ENV", "preview")
    const r = await GET(new Request("https://sample.vercel.app/api/confirm-email", {
      headers: { "sec-fetch-site": "same-origin" },
    }))
    expect(r.status).toBe(200)
    const { csrf } = await r.json() as { csrf: string }
    expect(csrf).toMatch(/^[0-9a-f]{64}$/)
    const cookie = r.headers.get("set-cookie") ?? ""
    expect(cookie).toContain("pr_email_confirm=")
    expect(cookie).toContain("Path=/api/confirm-email")
    expect(cookie).toMatch(/httponly/i)
    expect(cookie).toMatch(/samesite=strict/i)
    expect(cookie).toMatch(/secure/i)
    expect(r.headers.get("cache-control")).toContain("no-store")
  })

  it("does not issue a cookie to cross-site callers or in Production", async () => {
    vi.stubEnv("VERCEL_ENV", "preview")
    const cross = await GET(new Request("https://sample.vercel.app/api/confirm-email", {
      headers: { "sec-fetch-site": "cross-site" },
    }))
    expect(cross.status).toBe(403)
    expect(cross.headers.get("set-cookie")).toBeNull()
    vi.stubEnv("VERCEL_ENV", "production")
    const prod = await GET(new Request("https://profilerelaunch.com/api/confirm-email"))
    expect(prod.status).toBe(403)
    expect(prod.headers.get("set-cookie")).toBeNull()
  })
})
