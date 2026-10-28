import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/auth/backend", async original => ({ ...await original<typeof import("@/lib/auth/backend")>(), backend: () => mocks }))
import { POST } from "@/app/api/packs/command/route"
import { packCommand } from "./command"
import { sessionCookie } from "@/lib/auth/config"
import { PACK_COMMAND_CONFLICT, PACK_COMMAND_UNCERTAIN, packDeniedMessage } from "./publication"
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
    expect(record).toEqual({ event: "pack_command_uncertain", operation: "publish", correlationId: key, errorName: "PostgrestError" })
    expect(JSON.stringify(record)).not.toContain(filename)
    expect(JSON.stringify(record)).not.toContain(mailbox)
    expect(JSON.stringify(record)).not.toContain(secret)
    logged.mockRestore()
  })
})
