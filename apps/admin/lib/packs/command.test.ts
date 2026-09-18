import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/auth/backend", async original => ({ ...await original<typeof import("@/lib/auth/backend")>(), backend: () => mocks }))
import { POST } from "@/app/api/packs/command/route"
import { packCommand } from "./command"
import { sessionCookie } from "@/lib/auth/config"
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
  it("maps denied and conflict without leaking storage", async () => {
    mocks.rpc.mockResolvedValue({ status: "denied" })
    const denied = await packCommand(req({ operation: "add_item", caseId, packId, recordVersion: 1, versionId }))
    expect(denied.status).toBe(403)
    expect(await denied.text()).not.toMatch(/storage|arn:aws/)
    mocks.rpc.mockResolvedValue({ status: "conflict" })
    expect((await packCommand(req())).status).toBe(409)
  })
})
