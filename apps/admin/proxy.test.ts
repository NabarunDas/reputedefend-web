import { describe, expect, it } from "vitest"
import { NextRequest } from "next/server"
import { proxy } from "./proxy"
import { GET, POST } from "./app/api/[[...path]]/route"
import { devMailDispatchWorkerBlock, devMailScheduleInstalled } from "./lib/jobs/dev-mail-dispatch"

describe("DEV public webhook-only hostname", () => {
  const host = "https://dev-hooks.profilerelaunch.com"
  const devProject = "https://rmzozuiamjcclvtgutgd.supabase.co"
  async function withPreview<T>(fn: () => Promise<T>): Promise<T> {
    const previous = process.env.VERCEL_ENV
    process.env.VERCEL_ENV = "preview"
    try { return await fn() } finally {
      if (previous === undefined) delete process.env.VERCEL_ENV
      else process.env.VERCEL_ENV = previous
    }
  }

  function restoreEnv(previous: {
    env: string | undefined
    branch: string | undefined
    project: string | undefined
    worker: string | undefined
    schedule: string | undefined
  }) {
    const assign = (name: string, value: string | undefined) => {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
    assign("VERCEL_ENV", previous.env)
    assign("VERCEL_GIT_COMMIT_REF", previous.branch)
    assign("SUPABASE_URL", previous.project)
    assign("DEV_MAIL_DISPATCH_WORKER_ENABLED", previous.worker)
    assign("DEV_MAIL_DISPATCH_SCHEDULE_INSTALLED", previous.schedule)
  }

  async function withDevResend<T>(fn: () => Promise<T>): Promise<T> {
    const previous = {
      env: process.env.VERCEL_ENV,
      branch: process.env.VERCEL_GIT_COMMIT_REF,
      project: process.env.SUPABASE_URL,
      worker: process.env.DEV_MAIL_DISPATCH_WORKER_ENABLED,
      schedule: process.env.DEV_MAIL_DISPATCH_SCHEDULE_INSTALLED,
    }
    process.env.VERCEL_ENV = "preview"
    process.env.VERCEL_GIT_COMMIT_REF = "develop"
    process.env.SUPABASE_URL = devProject
    process.env.DEV_MAIL_DISPATCH_WORKER_ENABLED = "false"
    process.env.DEV_MAIL_DISPATCH_SCHEDULE_INSTALLED = "false"
    try { return await fn() } finally { restoreEnv(previous) }
  }

  it("allows only the signed Stripe route to reach its handler on DEV Preview", () => withPreview(async () => {
    const request = new NextRequest(`${host}/api/webhooks/stripe`, { method: "POST" })
    const response = await proxy(request)
    expect(response.headers.get("x-middleware-next")).toBe("1")
    expect(response.headers.get("cache-control")).toContain("no-store")
  }))

  it.each([
    ["GET", "/"], ["GET", "/login"], ["POST", "/auth/send"],
    ["GET", "/api/webhooks/stripe"], ["HEAD", "/api/webhooks/stripe"],
    ["OPTIONS", "/api/webhooks/stripe"], ["POST", "/api/webhooks/resend"],
    ["POST", "/api/internal/jobs/run"], ["GET", "/api/internal/jobs/dev-payment-events"], ["GET", "/api/internal/jobs/dev-mail-dispatch"], ["POST", "/api/operations/dev-stripe-reconcile"], ["GET", "/_next/static/chunks/app.js"],
    ["GET", "/robots.txt"], ["POST", "/api/webhooks/stripe/"],
  ])("rejects %s %s without reaching other DEV routes", (method, route) => withPreview(async () => {
    const response = await proxy(new NextRequest(`${host}${route}`, { method }))
    expect(response.status).toBe(404)
    expect(response.headers.get("cache-control")).toContain("no-store")
  }))

  it("forwards only the signed Resend path on the DEV project, with the mail worker left off", async () => {
    const previous = {
      env: process.env.VERCEL_ENV,
      branch: process.env.VERCEL_GIT_COMMIT_REF,
      project: process.env.SUPABASE_URL,
      worker: process.env.DEV_MAIL_DISPATCH_WORKER_ENABLED,
      schedule: process.env.DEV_MAIL_DISPATCH_SCHEDULE_INSTALLED,
    }
    process.env.VERCEL_ENV = "preview"
    process.env.VERCEL_GIT_COMMIT_REF = "develop"
    process.env.SUPABASE_URL = devProject
    process.env.DEV_MAIL_DISPATCH_WORKER_ENABLED = "false"
    process.env.DEV_MAIL_DISPATCH_SCHEDULE_INSTALLED = "false"
    try {
      const accepted = await proxy(new NextRequest(`${host}/api/webhooks/resend`, { method: "POST" }))
      expect(accepted.headers.get("x-middleware-next")).toBe("1")
      expect(accepted.headers.get("cache-control")).toContain("no-store")
      const queried = await proxy(new NextRequest(`${host}/api/webhooks/resend?x-vercel-protection-bypass=present`, { method: "POST" }))
      expect(queried.headers.get("x-middleware-next")).toBe("1")
      process.env.SUPABASE_URL = `${devProject}/`
      expect((await proxy(new NextRequest(`${host}/api/webhooks/resend`, { method: "POST" }))).headers.get("x-middleware-next")).toBe("1")
      const stripe = await proxy(new NextRequest(`${host}/api/webhooks/stripe`, { method: "POST" }))
      expect(stripe.headers.get("x-middleware-next")).toBe("1")
      expect(devMailScheduleInstalled()).toBe(false)
      expect(devMailDispatchWorkerBlock({
        VERCEL_ENV: "preview",
        VERCEL_GIT_COMMIT_REF: "develop",
        VERCEL_BRANCH_URL: "profilerelaunch-admin-git-develop-clientcove.vercel.app",
        SUPABASE_URL: devProject,
        AWS_EVIDENCE_BUCKET: "profilerelaunch-evidence-dev-01",
        CUSTOMER_ORIGIN: "https://profilerelaunch-customer-git-develop-clientcove.vercel.app",
        COMMUNICATIONS_SEND_ENABLED: "true",
        JOB_PROVIDER_MODE: "production",
        RESEND_API_KEY: "re_dev_placeholder",
        COMMUNICATIONS_FROM_EMAIL: "ops@example.com",
        DEV_MAIL_DISPATCH_WORKER_ENABLED: "false",
        DEV_MAIL_DISPATCH_SCHEDULE_INSTALLED: "false",
        DEV_MAIL_DISPATCH_WORKER_SECRET: "d".repeat(32),
      })).toBe("disabled")
    } finally {
      restoreEnv(previous)
    }
  })

  it.each([
    ["GET", "/api/webhooks/resend"],
    ["GET", "/api/webhooks/resend?x-vercel-protection-bypass=present"],
    ["HEAD", "/api/webhooks/resend"],
    ["HEAD", "/api/webhooks/resend?x-vercel-protection-bypass=present"],
    ["PUT", "/api/webhooks/resend"],
    ["DELETE", "/api/webhooks/resend"],
    ["OPTIONS", "/api/webhooks/resend"],
    ["POST", "/api/webhooks/resend/"],
    ["POST", "/api/webhooks/resend/inbound"],
    ["POST", "/api/webhooks/stripe/extra"],
    ["GET", "/"],
    ["POST", "/auth/send"],
  ])("rejects %s %s on the hooks host even when the DEV mail project matches", (method, route) => withDevResend(async () => {
    const response = await proxy(new NextRequest(`${host}${route}`, { method }))
    expect(response.status).toBe(404)
    expect(response.headers.get("cache-control")).toContain("no-store")
  }))

  it.each([
    ["main", devProject, "preview"],
    ["develop", "https://cxwwekdzkkjjbiyofrov.supabase.co", "preview"],
    ["develop", "https://example.supabase.co", "preview"],
    ["develop", undefined, "preview"],
    ["develop", devProject, "production"],
    ["develop", devProject, "development"],
  ])("rejects the Resend path for branch %s, project %s and environment %s", (branch, project, environment) => withDevResend(async () => {
    process.env.VERCEL_GIT_COMMIT_REF = branch
    process.env.VERCEL_ENV = environment
    if (project === undefined) delete process.env.SUPABASE_URL
    else process.env.SUPABASE_URL = project
    const response = await proxy(new NextRequest(`${host}/api/webhooks/resend`, { method: "POST" }))
    expect(response.status).toBe(404)
    const stripe = await proxy(new NextRequest(`${host}/api/webhooks/stripe`, { method: "POST" }))
    if (environment === "preview") expect(stripe.headers.get("x-middleware-next")).toBe("1")
    else expect(stripe.status).toBe(404)
  }))

  it("does not treat a lookalike hostname as the DEV hooks host", () => withDevResend(async () => {
    for (const impostor of [
      "https://dev-hooks.profilerelaunch.com.evil.example/api/webhooks/resend",
      "https://hooks.profilerelaunch.com/api/webhooks/resend",
      "https://dev-hooks.profilerelaunch.co/api/webhooks/resend",
    ]) {
      const response = await proxy(new NextRequest(impostor, { method: "POST" }))
      expect(response.status).not.toBe(404)
      expect(response.headers.get("x-middleware-next")).toBe("1")
    }
    const production = await proxy(new NextRequest("https://admin.profilerelaunch.com/api/webhooks/resend", { method: "POST" }))
    expect(production.headers.get("x-middleware-next")).toBe("1")
    expect((await proxy(new NextRequest("https://admin.profilerelaunch.com/api/webhooks/resend"))).status).toBe(401)
  }))

  it("ignores query text but still only forwards the exact signed Stripe route", () => withPreview(async () => {
    const response = await proxy(new NextRequest(`${host}/api/webhooks/stripe?next=/login`, { method: "POST" }))
    expect(response.headers.get("x-middleware-next")).toBe("1")
    expect(response.headers.get("cache-control")).toContain("no-store")
  }))

  it("denies the Stripe path on that hostname outside Preview, even in Production", async () => {
    const previous = process.env.VERCEL_ENV
    process.env.VERCEL_ENV = "production"
    try {
      const response = await proxy(new NextRequest(`${host}/api/webhooks/stripe`, { method: "POST" }))
      expect(response.status).toBe(404)
    } finally {
      if (previous === undefined) delete process.env.VERCEL_ENV
      else process.env.VERCEL_ENV = previous
    }
  })

  it("does not affect the existing Production Stripe webhook", async () => {
    const previous = process.env.VERCEL_ENV
    process.env.VERCEL_ENV = "production"
    try {
      const response = await proxy(new NextRequest("https://admin.profilerelaunch.com/api/webhooks/stripe", { method: "POST" }))
      expect(response.headers.get("x-middleware-next")).toBe("1")
    } finally {
      if (previous === undefined) delete process.env.VERCEL_ENV
      else process.env.VERCEL_ENV = previous
    }
  })
})

describe("admin access boundary", () => {
  it("passes only the develop Preview payment-worker route through to its own bearer check", async () => {
    const oldEnv = process.env.VERCEL_ENV
    const oldBranch = process.env.VERCEL_GIT_COMMIT_REF
    const hostname = "https://profilerelaunch-admin-git-develop-clientcove.vercel.app"
    const path = "/api/internal/jobs/dev-payment-events"
    try {
      process.env.VERCEL_ENV = "preview"
      process.env.VERCEL_GIT_COMMIT_REF = "develop"
      const accepted = await proxy(new NextRequest(hostname + path))
      expect(accepted.headers.get("x-middleware-next")).toBe("1")
      expect(accepted.headers.get("cache-control")).toContain("no-store")
      for (const method of ["HEAD", "POST", "PUT", "DELETE", "OPTIONS"]) {
        expect((await proxy(new NextRequest(hostname + path, { method }))).status).toBe(401)
      }
      expect((await proxy(new NextRequest("https://profilerelaunch-admin.vercel.app" + path))).status).toBe(401)
      expect((await proxy(new NextRequest(hostname + path + "/"))).status).toBe(401)
      expect((await proxy(new NextRequest("https://dev-hooks.profilerelaunch.com" + path))).status).toBe(404)
      process.env.VERCEL_GIT_COMMIT_REF = "main"
      expect((await proxy(new NextRequest(hostname + path))).status).toBe(401)
      process.env.VERCEL_GIT_COMMIT_REF = "develop"
      process.env.VERCEL_ENV = "production"
      expect((await proxy(new NextRequest(hostname + path))).status).toBe(401)
    } finally {
      if (oldEnv === undefined) delete process.env.VERCEL_ENV
      else process.env.VERCEL_ENV = oldEnv
      if (oldBranch === undefined) delete process.env.VERCEL_GIT_COMMIT_REF
      else process.env.VERCEL_GIT_COMMIT_REF = oldBranch
    }
  })

  it("passes only the develop Preview mail-dispatch route through to its own bearer check", async () => {
    const oldEnv = process.env.VERCEL_ENV
    const oldBranch = process.env.VERCEL_GIT_COMMIT_REF
    const hostname = "https://profilerelaunch-admin-git-develop-clientcove.vercel.app"
    const path = "/api/internal/jobs/dev-mail-dispatch"
    try {
      process.env.VERCEL_ENV = "preview"
      process.env.VERCEL_GIT_COMMIT_REF = "develop"
      const accepted = await proxy(new NextRequest(hostname + path))
      expect(accepted.headers.get("x-middleware-next")).toBe("1")
      expect(accepted.headers.get("cache-control")).toContain("no-store")
      for (const method of ["HEAD", "POST", "PUT", "DELETE", "OPTIONS"]) {
        expect((await proxy(new NextRequest(hostname + path, { method }))).status).toBe(401)
      }
      expect((await proxy(new NextRequest("https://profilerelaunch-admin.vercel.app" + path))).status).toBe(401)
      expect((await proxy(new NextRequest(hostname + "/api/internal/jobs/dev-payment-events"))).headers.get("x-middleware-next")).toBe("1")
      process.env.VERCEL_GIT_COMMIT_REF = "main"
      expect((await proxy(new NextRequest(hostname + path))).status).toBe(401)
      process.env.VERCEL_GIT_COMMIT_REF = "develop"
      process.env.VERCEL_ENV = "production"
      expect((await proxy(new NextRequest(hostname + path))).status).toBe(401)
    } finally {
      if (oldEnv === undefined) delete process.env.VERCEL_ENV
      else process.env.VERCEL_ENV = oldEnv
      if (oldBranch === undefined) delete process.env.VERCEL_GIT_COMMIT_REF
      else process.env.VERCEL_GIT_COMMIT_REF = oldBranch
    }
  })

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
