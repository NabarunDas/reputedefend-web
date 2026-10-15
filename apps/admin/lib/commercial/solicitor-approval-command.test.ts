import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { sessionCookie } from "../auth/config"
import { PAID_SERVICE_AGREEMENT_VERSION, paidServiceAgreementContentHash } from "../../../../lib/commercial/paid-service-agreement"

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("../auth/backend", async original => ({
  ...await original<typeof import("../auth/backend")>(),
  backend: () => mocks,
  tokenHash: (value: string) => `hash:${value}`,
}))
import { solicitorApprovalCommand } from "./solicitor-approval-command"

const origin = "https://admin.profilerelaunch.com"
const key = "33333333-3333-4333-8333-333333333333"
const evidence = "Solicitor approval email dated 15 October 2026, subject: PS-2026-10-14.2 - Approval"
const validBody = { version: PAID_SERVICE_AGREEMENT_VERSION, contentHash: paidServiceAgreementContentHash, evidence, confirmed: true }

function req(body: unknown, options: { origin?: string; requestOrigin?: string; token?: string; idempotency?: string; contentType?: string } = {}) {
  return new NextRequest(`${options.requestOrigin ?? origin}/api/operations/solicitor-approval`, {
    method: "POST",
    headers: {
      origin: options.origin ?? origin,
      "content-type": options.contentType ?? "application/json",
      "idempotency-key": options.idempotency ?? key,
      cookie: `${sessionCookie}=${options.token ?? "a".repeat(64)}`,
    },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.stubEnv("VERCEL_ENV", "")
  vi.stubEnv("ADMIN_AUTH_ENABLED", "true")
  vi.stubEnv("ADMIN_ORIGIN", origin)
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
  vi.stubEnv("SUPABASE_SECRET_KEY", "test")
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test")
  mocks.rpc.mockReset()
})
afterEach(() => vi.unstubAllEnvs())

describe("authenticated solicitor approval command", () => {
  it("records the genuine owner-provided reference with a hashed Admin session via the existing audited RPC", async () => {
    mocks.rpc.mockResolvedValue({ status: "confirmed", version: PAID_SERVICE_AGREEMENT_VERSION, hash: paidServiceAgreementContentHash, operative: true })
    const response = await solicitorApprovalCommand(req(validBody))
    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload).toMatchObject({ operative: true, version: PAID_SERVICE_AGREEMENT_VERSION })
    expect(mocks.rpc).toHaveBeenCalledWith("admin_confirm_paid_service_agreement_v1", {
      p_token: "hash:" + "a".repeat(64), p_request: key, p_evidence: evidence,
    })
    expect(response.headers.get("cache-control")).toContain("no-store")
    expect(JSON.stringify(payload)).not.toContain(evidence)
  })
  it.each([
    [{ ...validBody, version: "PS-2026-10-14.1" }, "wrong version"],
    [{ ...validBody, contentHash: "f".repeat(64) }, "wrong hash"],
    [{ ...validBody, confirmed: false }, "unconfirmed"],
    [{ ...validBody, evidence: "not evidence" }, "too short"],
    [{ ...validBody, evidence: "bad\nreference of attorney approval" }, "control characters"],
  ])("rejects %s (%s) without any database mutation", async body => {
    const response = await solicitorApprovalCommand(req(body))
    expect(response.status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("rejects a cross-origin POST before attempting a database command", async () => {
    expect((await solicitorApprovalCommand(req(validBody, { origin: "https://evil.example" }))).status).toBe(403)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("accepts exact deployment and stable branch Preview hostnames with same-origin requests", async () => {
    const deployment = "https://profilerelaunch-admin-kj0yz08w5-clientcove.vercel.app"
    const branch = "https://profilerelaunch-admin-git-develop-clientcove.vercel.app"
    vi.stubEnv("VERCEL_ENV", "preview")
    vi.stubEnv("VERCEL_URL", new URL(deployment).hostname)
    vi.stubEnv("VERCEL_BRANCH_URL", new URL(branch).hostname)
    mocks.rpc.mockResolvedValue({
      status: "confirmed", version: PAID_SERVICE_AGREEMENT_VERSION,
      hash: paidServiceAgreementContentHash, operative: true,
    })
    for (const permittedOrigin of [deployment, branch]) {
      const response = await solicitorApprovalCommand(req(validBody, {
        origin: permittedOrigin, requestOrigin: permittedOrigin,
      }))
      expect(response.status).toBe(200)
    }
    expect(mocks.rpc).toHaveBeenCalledTimes(2)
  })
  it("rejects a cross-host Preview POST even when both hostnames are in the allowlist", async () => {
    const deployment = "https://profilerelaunch-admin-kj0yz08w5-clientcove.vercel.app"
    const branch = "https://profilerelaunch-admin-git-develop-clientcove.vercel.app"
    vi.stubEnv("VERCEL_ENV", "preview")
    vi.stubEnv("VERCEL_URL", new URL(deployment).hostname)
    vi.stubEnv("VERCEL_BRANCH_URL", new URL(branch).hostname)
    expect((await solicitorApprovalCommand(req(validBody, {
      origin: branch, requestOrigin: deployment,
    }))).status).toBe(403)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("refuses the webhook-only custom host and any unlisted Preview alias", async () => {
    vi.stubEnv("VERCEL_ENV", "preview")
    vi.stubEnv("VERCEL_URL", "profilerelaunch-admin-kj0yz08w5-clientcove.vercel.app")
    vi.stubEnv("VERCEL_BRANCH_URL", "profilerelaunch-admin-git-develop-clientcove.vercel.app")
    for (const forbidden of [
      "https://dev-hooks.profilerelaunch.com",
      "https://not-a-real-preview.vercel.app",
    ]) {
      expect((await solicitorApprovalCommand(req(validBody, {
        origin: forbidden, requestOrigin: forbidden,
      }))).status).toBe(403)
    }
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("allows only the canonical Admin hostname in Production", async () => {
    vi.stubEnv("VERCEL_ENV", "production")
    vi.stubEnv("VERCEL_URL", "profilerelaunch-admin-kj0yz08w5-clientcove.vercel.app")
    for (const badOrigin of ["https://profilerelaunch-admin-kj0yz08w5-clientcove.vercel.app", "https://dev-hooks.profilerelaunch.com"]) {
      expect((await solicitorApprovalCommand(req(validBody, {
        origin: badOrigin, requestOrigin: badOrigin,
      }))).status).toBe(403)
    }
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("rejects an invalid Admin cookie and invalid idempotency key", async () => {
    expect((await solicitorApprovalCommand(req(validBody, { token: "bad" }))).status).toBe(401)
    expect((await solicitorApprovalCommand(req(validBody, { idempotency: "bad" }))).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("requires JSON, then refuses oversized evidence without database side effects", async () => {
    expect((await solicitorApprovalCommand(req(validBody, { contentType: "text/plain" }))).status).toBe(415)
    expect((await solicitorApprovalCommand(req({ ...validBody, evidence: "a".repeat(3000) }))).status).toBe(413)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("denies invalid sessions, malformed evidence and request conflicts returned by SQL", async () => {
    for (const [status, expected] of [["unauthorised", 401], ["invalid", 400], ["conflict", 409], ["unknown_version", 409]] as const) {
      mocks.rpc.mockResolvedValueOnce({ status })
      expect((await solicitorApprovalCommand(req(validBody))).status).toBe(expected)
    }
  })
  it("fails closed when the database reports a different agreement hash even after attempting approval", async () => {
    mocks.rpc.mockResolvedValue({ status: "confirmed", version: PAID_SERVICE_AGREEMENT_VERSION, hash: "f".repeat(64), operative: true })
    expect((await solicitorApprovalCommand(req(validBody))).status).toBe(503)
  })
  it("accepts idempotent replay and an already recorded genuine approval", async () => {
    for (const status of ["replay", "already_confirmed"]) {
      mocks.rpc.mockResolvedValueOnce({ status, version: PAID_SERVICE_AGREEMENT_VERSION, hash: paidServiceAgreementContentHash, operative: true })
      expect((await solicitorApprovalCommand(req(validBody))).status).toBe(200)
    }
  })
})
