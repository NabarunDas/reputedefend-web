import { readFileSync } from "node:fs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { GET, POST } from "./route"

afterEach(() => vi.unstubAllEnvs())

function openPreviewLane() {
  vi.stubEnv("VERCEL_ENV", "preview")
  vi.stubEnv("VERCEL_GIT_COMMIT_REF", "develop")
  vi.stubEnv("SUPABASE_URL", "https://rmzozuiamjcclvtgutgd.supabase.co")
}

describe("email confirmation CSRF endpoint", () => {
  it("sets a same-site httpOnly CSRF cookie scoped to the matching POST endpoint", async () => {
    openPreviewLane()
    const page = readFileSync(new URL("../../confirm-email/[challengeId]/page.tsx", import.meta.url), "utf8")
    expect(page).not.toContain("cookies(")
    expect(page).not.toContain(".set(")
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
    expect(JSON.stringify({ csrf })).not.toContain("confirmed")
  })

  it("does not issue a cookie to cross-site callers, a preview without the DEV lane, or Production", async () => {
    openPreviewLane()
    const cross = await GET(new Request("https://sample.vercel.app/api/confirm-email", {
      headers: { "sec-fetch-site": "cross-site" },
    }))
    expect(cross.status).toBe(403)
    expect(cross.headers.get("set-cookie")).toBeNull()

    vi.stubEnv("VERCEL_ENV", "preview")
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "")
    vi.stubEnv("SUPABASE_URL", "")
    const incomplete = await GET(new Request("https://sample.vercel.app/api/confirm-email", {
      headers: { "sec-fetch-site": "same-origin" },
    }))
    expect(incomplete.status).toBe(403)
    expect(incomplete.headers.get("set-cookie")).toBeNull()

    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("VERCEL_ENV", "")
    const missingLane = await GET(new Request("https://profilerelaunch.com/api/confirm-email"))
    expect(missingLane.status).toBe(403)
    expect(missingLane.headers.get("set-cookie")).toBeNull()

    vi.stubEnv("VERCEL_ENV", "production")
    const prod = await GET(new Request("https://profilerelaunch.com/api/confirm-email"))
    expect(prod.status).toBe(403)
    expect(prod.headers.get("set-cookie")).toBeNull()
  })

  it("refuses a cross-origin POST before it can confirm or resend", async () => {
    const response = await POST(new Request("https://preview.example/api/confirm-email", {
      method: "POST",
      headers: {
        origin: "https://evil.example",
        host: "preview.example",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "confirm",
        challengeId: "11111111-1111-4111-8111-111111111111",
        token: "ab".repeat(32),
        csrf: "c".repeat(64),
      }),
    }))
    expect(response.status).toBe(400)
    const body = await response.json() as { message?: string }
    expect(body.message).toContain("already saved")
    expect(body.message).not.toMatch(/confirmed your email|token|hash/i)
  })
})
