import { readFileSync } from "node:fs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { sessionCookie } from "@/lib/auth/config"
import { adminCommandOriginError, unauthorisedAdminAddressMessage } from "./command-origin"

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/auth/backend", async original => ({
  ...await original<typeof import("@/lib/auth/backend")>(),
  backend: () => mocks,
}))

import { POST as membership } from "@/app/api/records/membership/route"
import { paymentCommand } from "@/lib/payments/command"
import { settingsCommand } from "@/lib/settings/command"

const branchHost = "profilerelaunch-admin-git-develop-clientcove.vercel.app"
const immutableHost = "profilerelaunch-admin-nz53o6piq-clientcove.vercel.app"
const branch = `https://${branchHost}`
const immutable = `https://${immutableHost}`
const unknown = "https://profilerelaunch-admin-unknown-clientcove.vercel.app"
const production = "https://admin.profilerelaunch.com"
const customer = "22222222-2222-4222-8222-222222222222"
const business = "33333333-3333-4333-8333-333333333333"
const orderId = "55555555-5555-4555-8555-555555555555"
const key = "44444444-4444-4444-8444-444444444444"
const membershipBody = {
  customerId: customer,
  businessId: business,
  version: 0,
  status: "pending",
  evidence: "Awaiting business authority evidence.",
}
const settingsBody = {
  operation: "create_incident",
  payload: { kind: "EMAIL", title: "Bounce surge", summary: "Provider outage recorded." },
}
const legacyCommands = [
  "admin/command.ts",
  "authorization/command.ts",
  "cases/command.ts",
  "conversations/command.ts",
  "enquiries/command.ts",
  "guard/alerts-command.ts",
  "guard/checks-command.ts",
  "guard/command.ts",
  "integrations/command.ts",
  "jobs/command.ts",
  "packs/command.ts",
  "payments/command.ts",
  "records/command.ts",
  "reports/command.ts",
  "settings/command.ts",
]

function paymentBody() {
  return {
    operation: "issue_guided_payment_action",
    serviceOrderId: orderId,
    version: 1,
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  }
}

function request(url: string, body: unknown, originHeader: string | null, extra: Record<string, string> = {}) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "idempotency-key": key,
    cookie: `${sessionCookie}=${"a".repeat(64)}`,
    ...extra,
  }
  if (originHeader !== null) headers.origin = originHeader
  return new NextRequest(`${url}/api/command`, { method: "POST", headers, body: JSON.stringify(body) })
}

const commands = [
  {
    name: "business-authority membership",
    generic: "Please reload this page and try again.",
    rpc: "admin_membership_save_v1",
    body: () => membershipBody,
    send: (url: string, originHeader: string | null, extra?: Record<string, string>) =>
      membership(request(url, membershipBody, originHeader, extra)),
  },
  {
    name: "payment action",
    generic: "Reload this page and try again.",
    rpc: "admin_payment_command_v1",
    body: paymentBody,
    send: (url: string, originHeader: string | null, extra?: Record<string, string>) =>
      paymentCommand(request(url, paymentBody(), originHeader, extra)),
  },
  {
    name: "settings incident",
    generic: "Reload this page and try again.",
    rpc: "admin_settings_command_v1",
    body: () => settingsBody,
    send: (url: string, originHeader: string | null, extra?: Record<string, string>) =>
      settingsCommand(request(url, settingsBody, originHeader, extra)),
  },
] as const

beforeEach(() => {
  vi.stubEnv("ADMIN_AUTH_ENABLED", "true")
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
  vi.stubEnv("SUPABASE_SECRET_KEY", "test")
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test")
  vi.stubEnv("CUSTOMER_ORIGIN", "https://customer.profilerelaunch.com")
  vi.stubEnv("ADMIN_ORIGIN", "https://attacker.example")
  mocks.rpc.mockReset().mockResolvedValue({ status: "success", id: customer })
})
afterEach(() => vi.unstubAllEnvs())

function previewEnv() {
  vi.stubEnv("VERCEL_ENV", "preview")
  vi.stubEnv("VERCEL_BRANCH_URL", branchHost)
  vi.stubEnv("VERCEL_URL", immutableHost)
}

function productionEnv() {
  vi.stubEnv("VERCEL_ENV", "production")
  vi.stubEnv("VERCEL_BRANCH_URL", branchHost)
  vi.stubEnv("VERCEL_URL", immutableHost)
}

describe("Admin command same-origin allowlist", () => {
  it.each(commands)("accepts the stable DEV alias and the immutable Preview URL for $name", async command => {
    previewEnv()
    for (const url of [branch, immutable]) {
      mocks.rpc.mockClear()
      const response = await command.send(url, url)
      expect(response.status, url).toBe(200)
      expect(mocks.rpc).toHaveBeenCalledWith(command.rpc, expect.any(Object))
    }
  })

  it.each(commands)("rejects a mismatched, unknown, or missing Origin for $name without calling the database", async command => {
    previewEnv()
    const canonical = unauthorisedAdminAddressMessage(branch)
    const mismatch = await command.send(immutable, branch)
    const unknownResponse = await command.send(unknown, unknown)
    const missing = await command.send(branch, null)
    const forwarded = await command.send(unknown, unknown, { "x-forwarded-host": branchHost })
    expect(mismatch.status).toBe(403)
    expect(await mismatch.json()).toEqual({ message: command.generic })
    expect(unknownResponse.status).toBe(403)
    const unknownBody = await unknownResponse.json() as { message: string }
    expect(unknownBody.message).toBe(canonical)
    expect(unknownBody.message).not.toContain(unknown)
    expect(unknownBody.message).not.toMatch(/session|cookie|token/i)
    expect(missing.status).toBe(403)
    expect(await missing.json()).toEqual({ message: command.generic })
    expect(forwarded.status).toBe(403)
    expect((await forwarded.json() as { message: string }).message).toBe(canonical)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it.each(commands)("permits Production only at the pinned admin host for $name", async command => {
    productionEnv()
    const allowed = await command.send(production, production)
    expect(allowed.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith(command.rpc, expect.any(Object))
    mocks.rpc.mockClear()
    for (const url of [branch, immutable, unknown, "https://attacker.example"]) {
      const response = await command.send(url, url)
      expect(response.status, url).toBe(403)
      const body = await response.json() as { message: string }
      expect(body.message).toBe(unauthorisedAdminAddressMessage(production))
      expect(body.message).not.toContain(new URL(url).host)
    }
    const mismatch = await command.send(production, branch)
    expect(mismatch.status).toBe(403)
    expect(await mismatch.json()).toEqual({ message: command.generic })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("keeps session, content type and idempotency gates on an authorised Preview membership", async () => {
    previewEnv()
    expect((await membership(request(immutable, membershipBody, immutable, { cookie: "" }))).status).toBe(401)
    expect((await membership(request(immutable, membershipBody, immutable, { "content-type": "text/plain" }))).status).toBe(415)
    expect((await membership(request(immutable, membershipBody, immutable, { "idempotency-key": "" }))).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("does not record business authority when the Preview origin is rejected", async () => {
    previewEnv()
    const response = await membership(request(unknown, membershipBody, unknown))
    expect(response.status).toBe(403)
    expect(mocks.rpc.mock.calls.map(call => call[0])).not.toContain("admin_membership_save_v1")
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("names only the server address when a same-origin host is outside the allowlist", () => {
    const message = adminCommandOriginError(unknown, unknown, {
      origin: branch,
      allowedOrigins: [branch, immutable],
    }, "Please reload this page and try again.")
    expect(message).toBe(unauthorisedAdminAddressMessage(branch))
    expect(message).not.toContain("unknown")
    expect(adminCommandOriginError(null, branch, { origin: branch, allowedOrigins: [branch] }, "Reload this page and try again."))
      .toBe("Reload this page and try again.")
    expect(adminCommandOriginError(branch, immutable, { origin: branch, allowedOrigins: [branch, immutable] }, "Reload this page and try again."))
      .toBe("Reload this page and try again.")
    expect(adminCommandOriginError(immutable, immutable, { origin: branch, allowedOrigins: [branch, immutable] }, "Reload this page and try again."))
      .toBeNull()
  })

  it("keeps every listed Admin command on the shared allowlist and leaves the Production redirect alone", () => {
    for (const file of legacyCommands) {
      const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8")
      expect(source, file).toContain("adminCommandOriginError")
      expect(source, file).not.toMatch(/config\.origin/)
    }
    const proxy = readFileSync(new URL("../../proxy.ts", import.meta.url), "utf8")
    expect(proxy).toContain("productionBrowserRead")
    expect(proxy).toContain("PROD_ADMIN_ORIGIN")
    expect(proxy).not.toContain("adminCommandOriginError")
    const authRoute = readFileSync(new URL("../../app/auth/[action]/route.ts", import.meta.url), "utf8")
    expect(authRoute).toContain("allowedOrigins.includes(requestOrigin)")
    expect(authRoute).not.toContain("config.origin")
  })
})
