import { readFileSync } from "node:fs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/auth/backend", async original => ({ ...await original<typeof import("@/lib/auth/backend")>(), backend: () => mocks }))
import { POST } from "@/app/api/packs/command/route"
import { packCommand } from "./command"
import { sessionCookie } from "@/lib/auth/config"
import { PACK_COMMAND_CONFLICT, PACK_COMMAND_UNCERTAIN, packDeniedMessage, packPreflightFailedMessage } from "./publication"
import { packArgs } from "./validation"

const origin = "https://admin.profilerelaunch.com"
const caseId = "55555555-5555-4555-8555-555555555555"
const packId = "99999999-9999-4999-8999-999999999999"
const versionId = "77777777-7777-4777-8777-777777777777"
const key = "33333333-3333-4333-8333-333333333333"
const createBody = { operation: "create" as const, caseId }

function req(body: unknown = createBody, headers: Record<string, string> = {}) {
  return new NextRequest(`${origin}/api/packs/command`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", "idempotency-key": key, cookie: `${sessionCookie}=${"a".repeat(64)}`, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.stubEnv("ADMIN_AUTH_ENABLED", "true")
  vi.stubEnv("ADMIN_ORIGIN", origin)
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
  vi.stubEnv("SUPABASE_SECRET_KEY", "test")
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test")
  mocks.rpc.mockReset()
})
afterEach(() => vi.unstubAllEnvs())

describe("prepared pack commands", () => {
  it("rejects unauthenticated, wrong origin and oversized JSON", async () => {
    expect((await POST(req(createBody, { cookie: "" }))).status).toBe(401)
    expect((await POST(req(createBody, { origin: "https://evil.example" }))).status).toBe(403)
    expect((await POST(req("x".repeat(32769)))).status).toBe(413)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("creates a draft pack without touching evidence storage", async () => {
    mocks.rpc.mockResolvedValue({ status: "success", id: packId, packNumber: 1, packStatus: "DRAFT", recordVersion: 1 })
    const response = await packCommand(req())
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload).toMatchObject({ packStatus: "DRAFT", packNumber: 1 })
    expect(JSON.stringify(payload)).not.toMatch(/storage|arn:aws|presigned|google/i)
    expect(mocks.rpc).toHaveBeenCalledWith("admin_prepared_pack_command_v1", expect.objectContaining({
      p_operation: "create", p_case: caseId, p_pack: null, p_data: {},
    }))
  })
  it("rejects snapshot fields and storage coordinates from the browser", async () => {
    expect(packArgs("add_item", {
      operation: "add_item", caseId, packId, recordVersion: 1, versionId, documentTitle: "Forged",
    })).toBeNull()
    expect(packArgs("add_item", {
      operation: "add_item", caseId, packId, recordVersion: 1, versionId, storageKey: "cases/x",
    })).toBeNull()
    expect((await packCommand(req({
      operation: "add_item", caseId, packId, recordVersion: 1, versionId, storageBucket: "test-evidence",
    }))).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("accepts a draft role change and rejects a missing or invented role", async () => {
    expect(packArgs("set_item_role", {
      operation: "set_item_role", caseId, packId, recordVersion: 4, versionId, role: "INSTRUCTIONS",
    })).toMatchObject({ role: "INSTRUCTIONS", versionId })
    expect(packArgs("set_item_role", {
      operation: "set_item_role", caseId, packId, recordVersion: 4, versionId,
    })).toBeNull()
    expect(packArgs("set_item_role", {
      operation: "set_item_role", caseId, packId, recordVersion: 4, versionId, role: "deliverable",
    })).toBeNull()
    expect(packArgs("set_item_role", {
      operation: "set_item_role", caseId, packId, recordVersion: 4, versionId, role: "EVIDENCE", documentTitle: "Forged",
    })).toBeNull()
    mocks.rpc.mockResolvedValue({ status: "success", id: packId, packStatus: "DRAFT", recordVersion: 5 })
    const response = await packCommand(req({
      operation: "set_item_role", caseId, packId, recordVersion: 4, versionId, role: "EVIDENCE",
    }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ message: "The document role has been updated. The pack is still a draft." })
    expect(mocks.rpc).toHaveBeenCalledWith("admin_prepared_pack_command_v1", expect.objectContaining({
      p_operation: "set_item_role", p_data: { versionId, role: "EVIDENCE" },
    }))
  })
  it("explains a Guided approval denial by the missing or duplicated role", async () => {
    mocks.rpc.mockResolvedValue({ status: "denied", reason: "deliverable" })
    const denied = await packCommand(req({
      operation: "approve", caseId, packId, recordVersion: 6, note: "This exact evidence selection is the prepared pack.", confirmed: true,
    }))
    expect(denied.status).toBe(403)
    expect(await denied.json()).toMatchObject({ message: packDeniedMessage("approve", "deliverable") })
    expect(packDeniedMessage("approve", "deliverable")).toBe("This Guided pack needs exactly one completed statement. Nothing was approved.")
    expect(packDeniedMessage("approve", "instructions")).toBe("This Guided pack needs exactly one customer submission instructions document. Nothing was approved.")
    expect(packDeniedMessage("approve", "role")).toMatch(/needs a role/)
    expect(packDeniedMessage("approve", "document")).toMatch(/different documents/)
    expect(packDeniedMessage("approve", "author")).toMatch(/staff-authored/)
    expect(packDeniedMessage("approve", "evidence")).toMatch(/belong to this case/)
    expect(packDeniedMessage("approve", "empty")).toMatch(/no files/)
    expect(packDeniedMessage("approve", "version")).toMatch(/not a clean, accepted version/)
    expect(packDeniedMessage("approve")).toBe("That action is not allowed for this pack.")
    expect(packDeniedMessage("publish", "deliverable")).toMatch(/Nothing was made visible and the pack was not published/)
  })
  it("requires confirmation and a meaningful note to approve", async () => {
    expect(packArgs("approve", { operation: "approve", caseId, packId, recordVersion: 2, note: "too short", confirmed: true })).toBeNull()
    expect(packArgs("approve", { operation: "approve", caseId, packId, recordVersion: 2, note: "This exact evidence selection is the prepared pack.", confirmed: false })).toBeNull()
    mocks.rpc.mockResolvedValue({ status: "success", id: packId, packStatus: "APPROVED", recordVersion: 3 })
    const response = await packCommand(req({
      operation: "approve", caseId, packId, recordVersion: 2, note: "This exact evidence selection is the prepared pack.", confirmed: true,
    }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ message: expect.stringMatching(/does not confirm payment, permission or submission to Google/) })
    expect(mocks.rpc).toHaveBeenCalledWith("admin_prepared_pack_command_v1", expect.objectContaining({
      p_operation: "approve", p_data: { note: "This exact evidence selection is the prepared pack.", confirmed: true },
    }))
  })
  it("requires confirmation and a publication note to publish or unpublish", async () => {
    expect(packArgs("publish", { operation: "publish", caseId, packId, recordVersion: 3, note: "too short", confirmed: true })).toBeNull()
    expect(packArgs("unpublish", { operation: "unpublish", caseId, packId, recordVersion: 3, reason: "Withdraw this pack from customer case access.", confirmed: false })).toBeNull()
    mocks.rpc.mockResolvedValue({ status: "success", id: packId, packStatus: "APPROVED", recordVersion: 4, published: true })
    const response = await packCommand(req({
      operation: "publish", caseId, packId, recordVersion: 3, note: "Publish this pack for the customer case-access view.", confirmed: true,
    }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ message: expect.stringMatching(/available in the customer portal/) })
    expect(mocks.rpc).toHaveBeenCalledWith("admin_prepared_pack_command_v1", expect.objectContaining({
      p_operation: "publish", p_data: { note: "Publish this pack for the customer case-access view.", confirmed: true },
    }))
  })
  it("maps denied and conflict without leaking storage", async () => {
    mocks.rpc.mockResolvedValue({ status: "denied" })
    const denied = await packCommand(req({ operation: "add_item", caseId, packId, recordVersion: 1, versionId }))
    expect(denied.status).toBe(403)
    expect(await denied.text()).not.toMatch(/storage|arn:aws/)
    mocks.rpc.mockResolvedValue({ status: "conflict" })
    const conflict = await packCommand(req())
    expect(conflict.status).toBe(409)
    expect(await conflict.json()).toMatchObject({ message: PACK_COMMAND_CONFLICT })
    expect(PACK_COMMAND_CONFLICT).not.toMatch(/try again/i)
  })
  it("states a known publication block without claiming the pack was shared", async () => {
    mocks.rpc.mockResolvedValue({ status: "denied", reason: "version" })
    const response = await packCommand(req({
      operation: "publish", caseId, packId, recordVersion: 3, note: "Publish this pack for the customer case-access view.", confirmed: true,
    }))
    expect(response.status).toBe(403)
    const body = await response.json()
    expect(body.message).toBe(packDeniedMessage("publish", "version"))
    expect(body.message).toMatch(/Nothing was made visible and the pack was not published/)
    expect(body.message).not.toMatch(/try again|succeeded|visible to the customer/i)
  })
  it("logs an uncertain pack command without the error text", async () => {
    const filename = "private-statement.pdf"
    const mailbox = "person@example.com"
    const secret = "sb_secret_token_value"
    mocks.rpc.mockRejectedValue(Object.assign(new Error(`read failed ${filename} ${mailbox} ${secret}`), { name: "PostgrestError" }))
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})
    const response = await packCommand(req({
      operation: "publish", caseId, packId, recordVersion: 3, note: "Publish this pack for the customer case-access view.", confirmed: true,
    }))
    expect(response.status).toBe(503)
    const body = await response.text()
    expect(body).toContain(PACK_COMMAND_UNCERTAIN)
    expect(body).toContain(key)
    expect(body).not.toContain(filename)
    expect(body).not.toContain(mailbox)
    expect(body).not.toContain(secret)
    expect(PACK_COMMAND_UNCERTAIN).not.toMatch(/try again/i)
    const record = JSON.parse(String(logged.mock.calls[0][0]))
    expect(record).toEqual({ event: "pack_command_uncertain", operation: "publish", correlationId: key, stage: "command", errorName: "PostgrestError" })
    expect(JSON.stringify(record)).not.toContain(filename)
    expect(JSON.stringify(record)).not.toContain(mailbox)
    expect(JSON.stringify(record)).not.toContain(secret)
    logged.mockRestore()
  })

  it("reports a mail-context failure as a preflight miss and does not call the publication command", async () => {
    enableOutgoingMail()
    const secret = "sb_secret_token_value"
    const sql = "cannot execute UPDATE in a read-only transaction"
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "admin_guided_pack_mail_context_v1") {
        throw Object.assign(new Error(`${sql} ${secret}`), { name: "PostgrestError", code: "25006" })
      }
      return { status: "success", id: packId, packStatus: "APPROVED", recordVersion: 4 }
    })
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})
    const publishBody = {
      operation: "publish" as const, caseId, packId, recordVersion: 3, note: "Publish this pack for the customer case-access view.", confirmed: true,
    }
    const response = await packCommand(req(publishBody))
    expect(response.status).toBe(503)
    const body = await response.text()
    expect(body).toContain(packPreflightFailedMessage("publish"))
    expect(body).not.toContain(PACK_COMMAND_UNCERTAIN)
    expect(body).not.toContain(sql)
    expect(body).not.toContain("25006")
    expect(body).not.toContain(secret)
    expect(body).not.toContain("a".repeat(64))
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(["admin_guided_pack_mail_context_v1"])
    expect(JSON.parse(String(logged.mock.calls[0][0]))).toEqual({
      event: "pack_command_preflight_failed",
      operation: "publish",
      correlationId: key,
      stage: "mail_context",
      errorName: "PostgrestError",
    })
    logged.mockRestore()

    mocks.rpc.mockClear()
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "admin_guided_pack_mail_context_v1") throw Object.assign(new Error(sql), { name: "PostgrestError" })
      return { status: "success" }
    })
    const loggedEmail = vi.spyOn(console, "error").mockImplementation(() => {})
    const emailResponse = await packCommand(req({ operation: "send_pack_email", caseId, packId, recordVersion: 4 }))
    expect(emailResponse.status).toBe(503)
    const emailBody = await emailResponse.text()
    expect(emailBody).toContain(packPreflightFailedMessage("send_pack_email"))
    expect(emailBody).not.toContain(PACK_COMMAND_UNCERTAIN)
    expect(emailBody).not.toContain(sql)
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(["admin_guided_pack_mail_context_v1"])
    expect(JSON.parse(String(loggedEmail.mock.calls[0][0])).stage).toBe("mail_context")
    loggedEmail.mockRestore()
  })

  it("keeps a failure during the publication command uncertain after preflight succeeds", async () => {
    enableOutgoingMail()
    const secret = "sb_secret_token_value"
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "admin_guided_pack_mail_context_v1") {
        return {
          status: "applicable",
          caseRef: "PR-26-MXAAAC",
          amountMinor: 9900,
          currency: "GBP",
          serviceCode: "GUIDED_RELAUNCH",
          serviceName: "Guided Relaunch",
        }
      }
      throw Object.assign(new Error(`publish command failed ${secret}`), { name: "PostgrestError" })
    })
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})
    const response = await packCommand(req({
      operation: "publish", caseId, packId, recordVersion: 3, note: "Publish this pack for the customer case-access view.", confirmed: true,
    }))
    expect(response.status).toBe(503)
    const body = await response.text()
    expect(body).toContain(PACK_COMMAND_UNCERTAIN)
    expect(body).not.toContain(packPreflightFailedMessage("publish"))
    expect(body).not.toContain(secret)
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual([
      "admin_guided_pack_mail_context_v1",
      "admin_prepared_pack_command_v1",
    ])
    expect(JSON.parse(String(logged.mock.calls[0][0]))).toMatchObject({
      event: "pack_command_uncertain",
      stage: "command",
      operation: "publish",
    })
    logged.mockRestore()

    mocks.rpc.mockClear()
    const loggedEmail = vi.spyOn(console, "error").mockImplementation(() => {})
    const emailResponse = await packCommand(req({ operation: "send_pack_email", caseId, packId, recordVersion: 4 }))
    expect(emailResponse.status).toBe(503)
    expect(await emailResponse.text()).toContain(PACK_COMMAND_UNCERTAIN)
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual([
      "admin_guided_pack_mail_context_v1",
      "admin_prepared_pack_command_v1",
    ])
    loggedEmail.mockRestore()
  })

  it("returns after the pack is published while a hanging mail provider is not awaited", async () => {
    enableOutgoingMail()
    const source = readFileSync(new URL("./command.ts", import.meta.url), "utf8")
    expect(source).not.toContain("wakeDevMailDispatch")
    expect(source).not.toContain("runDevMailDispatchWorker")
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name.startsWith("dev_mail_dispatch_") || name === "communication_begin_provider_attempt_v1" || name === "job_claim_batch_v1") {
        return new Promise(() => {})
      }
      if (name === "admin_guided_pack_mail_context_v1") {
        return {
          status: "applicable",
          caseRef: "PR-26-MALL2A",
          amountMinor: 9900,
          currency: "GBP",
          serviceCode: "GUIDED_RELAUNCH",
          serviceName: "Guided Relaunch",
        }
      }
      return { status: "success", id: packId, packNumber: 1, packStatus: "APPROVED", recordVersion: 4, packEmail: "success" }
    })
    const pending = packCommand(req({
      operation: "publish", caseId, packId, recordVersion: 3, note: "Publish this pack for the customer case-access view.", confirmed: true,
    }))
    const response = await Promise.race([
      pending,
      new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error("publish waited for the mail provider")), 800)),
    ])
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ packStatus: "APPROVED" })
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual([
      "admin_guided_pack_mail_context_v1",
      "admin_prepared_pack_command_v1",
    ])
  })

  it("claims the published pack on the develop lane and still returns after a provider failure", async () => {
    const portal = "https://profilerelaunch-customer-git-develop-clientcove.vercel.app"
    vi.stubEnv("VERCEL_ENV", "preview")
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "develop")
    vi.stubEnv("VERCEL_BRANCH_URL", "profilerelaunch-admin-git-develop-clientcove.vercel.app")
    vi.stubEnv("SUPABASE_URL", "https://rmzozuiamjcclvtgutgd.supabase.co")
    vi.stubEnv("AWS_EVIDENCE_BUCKET", "profilerelaunch-evidence-dev-01")
    vi.stubEnv("CUSTOMER_ORIGIN", portal)
    vi.stubEnv("COMMUNICATIONS_SEND_ENABLED", "true")
    vi.stubEnv("JOB_PROVIDER_MODE", "production")
    vi.stubEnv("RESEND_API_KEY", "re_test_key")
    vi.stubEnv("COMMUNICATIONS_FROM_EMAIL", "ops@example.com")
    vi.stubEnv("COMMUNICATIONS_REPLY_TO_EMAIL", "cases@profilerelaunch.com")
    vi.stubEnv("COMMUNICATIONS_REPLY_TO_CONFIRMED", "monitored")
    vi.stubEnv("DEV_MAIL_DISPATCH_WORKER_ENABLED", "")
    const source = readFileSync(new URL("./command.ts", import.meta.url), "utf8")
    expect(source).not.toContain("wakeDevMailDispatch")
    expect(source).not.toContain("runDevMailDispatchWorker")
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "admin_guided_pack_mail_context_v1") {
        return {
          status: "applicable",
          caseRef: "PR-26-MALL2A",
          amountMinor: 9900,
          currency: "GBP",
          serviceCode: "GUIDED_RELAUNCH",
          serviceName: "Guided Relaunch",
        }
      }
      if (name === "admin_prepared_pack_command_v1") {
        return { status: "success", id: packId, packNumber: 1, packStatus: "APPROVED", recordVersion: 4, packEmail: "already_queued" }
      }
      if (name === "dev_mail_dispatch_claim_pack_v1") return { status: "denied", reason: "not_ready" }
      return { status: "success" }
    })
    const adminOrigin = "https://profilerelaunch-admin-git-develop-clientcove.vercel.app"
    const held = await packCommand(new NextRequest(`${adminOrigin}/api/packs/command`, {
      method: "POST",
      headers: {
        origin: adminOrigin,
        "content-type": "application/json",
        "idempotency-key": key,
        cookie: `${sessionCookie}=${"a".repeat(64)}`,
      },
      body: JSON.stringify({
        operation: "publish", caseId, packId, recordVersion: 3, note: "Publish this pack for the customer case-access view.", confirmed: true,
      }),
    }))
    expect(held.status).toBe(200)
    expect(await held.json()).toMatchObject({
      message: expect.stringMatching(/Email queued/),
      packStatus: "APPROVED",
    })
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual([
      "admin_guided_pack_mail_context_v1",
      "admin_prepared_pack_command_v1",
      "dev_mail_dispatch_claim_pack_v1",
    ])
    expect(mocks.rpc.mock.calls[2][1]).toMatchObject({ p_pack: packId, p_customer_origin: portal })
  })
})

function enableOutgoingMail() {
  vi.stubEnv("VERCEL_ENV", "production")
  vi.stubEnv("SUPABASE_URL", "https://cxwwekdzkkjjbiyofrov.supabase.co")
  vi.stubEnv("COMMUNICATIONS_SEND_ENABLED", "true")
  vi.stubEnv("JOB_WORKER_ENABLED", "true")
  vi.stubEnv("JOB_PROVIDER_MODE", "production")
  vi.stubEnv("RESEND_API_KEY", "re_test_key")
  vi.stubEnv("COMMUNICATIONS_FROM_EMAIL", "ops@example.com")
  vi.stubEnv("JOB_WORKER_CADENCE_SECONDS", "300")
  vi.stubEnv("COMMUNICATIONS_REPLY_TO_EMAIL", "cases@profilerelaunch.com")
  vi.stubEnv("COMMUNICATIONS_REPLY_TO_CONFIRMED", "monitored")
}
