import { describe, expect, it } from "vitest"
import { NextRequest } from "next/server"
import { proxy } from "./proxy"
import { GET, POST } from "./app/api/[[...path]]/route"

describe("admin access boundary", () => {
  it("redirects Production browser traffic from Vercel aliases to the canonical Admin domain", async () => {
    const previous = process.env.VERCEL_ENV
    process.env.VERCEL_ENV = "production"
    try {
      const result = await proxy(new NextRequest("https://profilerelaunch-admin.vercel.app/login?source=bookmark"))
      expect(result.status).toBe(308)
      expect(result.headers.get("location")).toBe("https://admin.profilerelaunch.com/login?source=bookmark")
      expect(result.headers.get("cache-control")).toContain("no-store")

      const canonical = await proxy(new NextRequest("https://admin.profilerelaunch.com/login"))
      expect(canonical.headers.get("x-middleware-next")).toBe("1")
    } finally {
      if (previous === undefined) delete process.env.VERCEL_ENV
      else process.env.VERCEL_ENV = previous
    }
  })

  it("does not canonical-redirect provider or internal API routes", async () => {
    const previous = process.env.VERCEL_ENV
    process.env.VERCEL_ENV = "production"
    try {
      const result = await proxy(new NextRequest("https://profilerelaunch-admin.vercel.app/api/webhooks/stripe", { method: "POST" }))
      expect(result.headers.get("x-middleware-next")).toBe("1")
    } finally {
      if (previous === undefined) delete process.env.VERCEL_ENV
      else process.env.VERCEL_ENV = previous
    }
  })

  it.each(["/", "/today", "/security", "/clients/customer-id", "/documents/private.pdf", "/exports/data.csv", "/login/extra", "/_next/image", "/brand/secret.png"])("blocks %s without leaking the destination", async path => {
    const result = await proxy(new NextRequest(`https://admin.profilerelaunch.com${path}?email=private@example.com&next=https://example.com`, {
      headers: { cookie: "staff=true; role=OWNER", "x-staff-role": "OWNER" },
    }))
    expect(result.status).toBe(303)
    expect(result.headers.get("location")).toBe("https://admin.profilerelaunch.com/login")
    expect(result.headers.get("cache-control")).toContain("no-store")
  })
  it.each(["/api", "/api/clients", "/api/auth/otp", "/api/evidence/command", "/api/packs/command"])("denies %s as JSON, not a successful login page", async path => {
    const result = await proxy(new NextRequest(`https://admin.profilerelaunch.com${path}`))
    expect(result.status).toBe(401)
    expect(await result.json()).toEqual({ error: "Staff sign-in is required." })
  })
  it("allows the scheduled job route through so Cron can authenticate itself", async () => {
    const allowed = await proxy(new NextRequest("https://admin.profilerelaunch.com/api/internal/jobs/run"))
    expect(allowed.headers.get("x-middleware-next")).toBe("1")
    expect((await proxy(new NextRequest("https://admin.profilerelaunch.com/api/internal/jobs/run", { method: "POST" }))).status).toBe(401)
  })
  it("allows the inbound Resend webhook through so the dedicated secret can authenticate it", async () => {
    const allowed = await proxy(new NextRequest("https://admin.profilerelaunch.com/api/webhooks/resend/inbound", { method: "POST" }))
    expect(allowed.headers.get("x-middleware-next")).toBe("1")
    expect((await proxy(new NextRequest("https://admin.profilerelaunch.com/api/webhooks/resend/inbound"))).status).toBe(401)
  })
  it("allows the Stripe webhook through so the dedicated signature can authenticate it", async () => {
    const allowed = await proxy(new NextRequest("https://admin.profilerelaunch.com/api/webhooks/stripe", { method: "POST" }))
    expect(allowed.headers.get("x-middleware-next")).toBe("1")
    expect((await proxy(new NextRequest("https://admin.profilerelaunch.com/api/webhooks/stripe"))).status).toBe(401)
  })
  it.each(["/login", "/robots.txt", "/_next/static/chunks/app.js", "/brand/profile-relaunch-logo.png", "/brand/profile-relaunch-logo-light.png"])("allows public read %s with noindex", async path => {
    const result = await proxy(new NextRequest(`https://admin.profilerelaunch.com${path}`))
    expect(result.headers.get("x-middleware-next")).toBe("1")
    expect(result.headers.get("x-robots-tag")).toContain("noindex")
  })
  it.each(["POST", "PUT", "PATCH", "DELETE", "OPTIONS"])("does not permit %s on the public login route", async method => {
    expect((await proxy(new NextRequest("https://admin.profilerelaunch.com/login", { method }))).status).toBe(401)
  })
  it("denies APIs independently of proxy execution", async () => {
    for (const handler of [GET, POST]) {
      const result = handler()
      expect(result.status).toBe(401)
      expect(result.headers.get("cache-control")).toContain("no-store")
    }
  })
})
