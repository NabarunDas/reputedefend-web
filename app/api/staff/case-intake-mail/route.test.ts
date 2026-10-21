import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it, vi } from "vitest"
import { createStaffCaseIntakeMailHandler, staffSessionTokenHash } from "./route"

vi.mock("@/lib/providers/resend-enquiry-provider", () => ({
  createResendEnquiryProvider: () => {
    throw new Error("Resend must be mocked; tests must never send real email")
  },
}))

const token = "a".repeat(64)
const caseId = "11111111-1111-4111-8111-111111111111"
const key = "33333333-3333-4333-8333-333333333333"
const publicRef = "PR-26-RZYCE4"

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://reputedefend-web-git-develop-clientcove.vercel.app/api/staff/case-intake-mail", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "idempotency-key": key,
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

describe("POST /api/staff/case-intake-mail", () => {
  it("refuses an unauthenticated public reference and does not send", async () => {
    const retry = vi.fn(async () => ({ ok: true, receiptEmailStatus: "sent" }))
    const verifySession = vi.fn(async () => true)
    const POST = createStaffCaseIntakeMailHandler({ lane: () => true, verifySession, retry })
    const response = await POST(request({ caseId, publicRef }, { authorization: "" }))
    expect(response.status).toBe(401)
    expect(verifySession).not.toHaveBeenCalled()
    expect(retry).not.toHaveBeenCalled()
  })

  it("refuses a public reference that is not paired with the stored case id", async () => {
    const retry = vi.fn(async () => ({ ok: true, receiptEmailStatus: "sent" }))
    const POST = createStaffCaseIntakeMailHandler({
      lane: () => true,
      verifySession: async () => true,
      retry,
    })
    const response = await POST(request({ publicRef }))
    expect(response.status).toBe(400)
    expect(retry).not.toHaveBeenCalled()
    const withAddress = await POST(request({ caseId, publicRef, email: "person@example.com" }))
    expect(withAddress.status).toBe(400)
    expect(retry).not.toHaveBeenCalled()
  })

  it("is absent outside the develop DEV lane", async () => {
    const retry = vi.fn(async () => ({ ok: true, receiptEmailStatus: "sent" }))
    const POST = createStaffCaseIntakeMailHandler({ lane: () => false, retry })
    const response = await POST(request({ caseId, publicRef }))
    expect(response.status).toBe(404)
    expect(retry).not.toHaveBeenCalled()
  })

  it("verifies the session hash and then retries that exact case", async () => {
    const retry = vi.fn(async () => ({ ok: true, receiptEmailStatus: "sent" }))
    const seen: string[] = []
    const verifySession = vi.fn(async (value: string) => {
      seen.push(value)
      return true
    })
    const POST = createStaffCaseIntakeMailHandler({ lane: () => true, verifySession, retry })
    const response = await POST(request({ caseId, publicRef }))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, receiptEmailStatus: "sent" })
    expect(seen).toEqual([staffSessionTokenHash(token)])
    expect(seen[0]).not.toBe(token)
    expect(retry).toHaveBeenCalledWith({ caseId, publicRef })
  })

  it("does not accept a Vercel OIDC header in place of the Admin session", async () => {
    const retry = vi.fn(async () => ({ ok: true, receiptEmailStatus: "sent" }))
    const verifySession = vi.fn(async () => true)
    const POST = createStaffCaseIntakeMailHandler({ lane: () => true, verifySession, retry })
    const denied = await POST(request({ caseId, publicRef }, {
      authorization: "",
      "x-vercel-trusted-oidc-idp-token": "preview.oidc.token-value",
    }))
    expect(denied.status).toBe(401)
    await expect(denied.json()).resolves.toEqual({ ok: false })
    expect(verifySession).not.toHaveBeenCalled()
    expect(retry).not.toHaveBeenCalled()
  })

  it("does not register the removed public route and does not use the public rate limiter", () => {
    const source = readFileSync(fileURLToPath(new URL("./route.ts", import.meta.url)), "utf8")
    expect(source).not.toContain("consumePublicRateLimit")
    expect(source).not.toContain("enquiry-rate-limit")
    expect(existsSync(fileURLToPath(new URL("../dev/case-intake-mail/route.ts", import.meta.url)))).toBe(false)
  })
})
