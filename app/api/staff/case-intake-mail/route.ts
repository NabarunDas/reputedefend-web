import { createHash } from "node:crypto"
import { NextResponse } from "next/server"
import { retryStoredIntakeMail, type IntakeMailIdentity } from "@/lib/cases/intake"
import { developDevIntakeMailLane } from "@/lib/cases/persistence-config"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const maxDuration = 60

const UUID_PATTERN = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
const PUBLIC_REF_PATTERN = /^(PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$/
const BODY_LIMIT = 2048

export function staffSessionTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

type SessionRpc = {
  rpc: (
    name: "admin_session_v1",
    args: { p_token: string },
  ) => Promise<{ data: unknown; error: { message?: string } | null }>
}

async function defaultVerifySession(tokenHash: string) {
  try {
    const client = createSupabaseServerClient() as unknown as SessionRpc
    const { data, error } = await client.rpc("admin_session_v1", { p_token: tokenHash })
    if (error || !data || typeof data !== "object") return false
    return typeof (data as { userId?: unknown }).userId === "string"
  } catch {
    return false
  }
}

export type StaffCaseIntakeMailDeps = {
  lane: () => boolean
  verifySession: (tokenHash: string) => Promise<boolean>
  retry: (identity: IntakeMailIdentity) => Promise<{ ok: boolean; receiptEmailStatus?: string }>
}

function readIdentity(value: unknown): IntakeMailIdentity | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const body = value as Record<string, unknown>
  const keys = Object.keys(body)
  if (keys.length !== 2 || !Object.hasOwn(body, "caseId") || !Object.hasOwn(body, "publicRef")) return null
  if (typeof body.caseId !== "string" || !UUID_PATTERN.test(body.caseId)) return null
  if (typeof body.publicRef !== "string" || !PUBLIC_REF_PATTERN.test(body.publicRef)) return null
  return { caseId: body.caseId, publicRef: body.publicRef }
}

async function readBody(request: Request): Promise<{ ok: true; value: unknown } | { ok: false; status: 400 | 413 }> {
  const reader = request.body?.getReader()
  const decoder = new TextDecoder()
  let size = 0
  let raw = ""
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value?.byteLength ?? 0
      if (size > BODY_LIMIT) {
        await reader.cancel()
        return { ok: false, status: 413 }
      }
      raw += decoder.decode(value, { stream: true })
    }
  }
  raw += decoder.decode()
  if (!raw) return { ok: false, status: 400 }
  try {
    return { ok: true, value: JSON.parse(raw) as unknown }
  } catch {
    return { ok: false, status: 400 }
  }
}

/**
 * Staff replay of stored Get Help mail. A public reference is not accepted
 * on its own: the caller must present a live admin session, and the case id
 * must be the same stored row.
 */
export function createStaffCaseIntakeMailHandler(deps: Partial<StaffCaseIntakeMailDeps> = {}) {
  const lane = deps.lane ?? (() => developDevIntakeMailLane())
  const verifySession = deps.verifySession ?? defaultVerifySession
  const retry = deps.retry ?? ((identity: IntakeMailIdentity) => retryStoredIntakeMail(identity))

  return async function POST(request: Request) {
    if (!lane()) return NextResponse.json({ ok: false }, { status: 404 })
    const header = request.headers.get("authorization") ?? ""
    const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : ""
    if (!/^[a-f0-9]{64}$/.test(token)) return NextResponse.json({ ok: false }, { status: 401 })
    if (!UUID_PATTERN.test(request.headers.get("idempotency-key") ?? "")) {
      return NextResponse.json({ ok: false }, { status: 400 })
    }
    if (request.headers.get("content-type")?.split(";")[0] !== "application/json") {
      return NextResponse.json({ ok: false }, { status: 415 })
    }
    const body = await readBody(request)
    if (!body.ok) return NextResponse.json({ ok: false }, { status: body.status })
    const identity = readIdentity(body.value)
    if (!identity) return NextResponse.json({ ok: false }, { status: 400 })
    const allowed = await verifySession(staffSessionTokenHash(token))
    if (!allowed) return NextResponse.json({ ok: false }, { status: 401 })
    const result = await retry(identity)
    if (!result.ok) return NextResponse.json({ ok: false }, { status: 404 })
    const receiptEmailStatus = result.receiptEmailStatus === "sent" || result.receiptEmailStatus === "unavailable" || result.receiptEmailStatus === "suppressed"
      ? result.receiptEmailStatus
      : "unavailable"
    return NextResponse.json({ ok: true, receiptEmailStatus })
  }
}

export const POST = createStaffCaseIntakeMailHandler()
