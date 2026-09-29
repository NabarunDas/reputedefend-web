import "server-only"
import { createHmac, timingSafeEqual } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { backend } from "../auth/backend"
import { privateResponseHeaders } from "../access"

const reply = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status, headers: privateResponseHeaders })

export function webhookSecret(env: Record<string, string | undefined> = process.env): string | null {
  const raw = env.RESEND_WEBHOOK_SECRET
  if (!raw || raw.length < 16) return null
  return raw
}

export function verifyResendSignature(rawBody: string, id: string, timestamp: string, signatureHeader: string, secret: string): boolean {
  if (!id || !timestamp || !signatureHeader) return false
  const age = Math.abs(Date.now() - Number(timestamp) * 1000)
  if (!Number.isFinite(age) || age > 5 * 60 * 1000) return false
  const secretBytes = secret.startsWith("whsec_") ? Buffer.from(secret.slice(6), "base64") : Buffer.from(secret)
  const expected = createHmac("sha256", secretBytes).update(`${id}.${timestamp}.${rawBody}`).digest("base64")
  const candidates = signatureHeader.split(" ").map(part => part.replace(/^v1,/, "").trim()).filter(Boolean)
  return candidates.some(candidate => {
    const provided = Buffer.from(candidate)
    const wanted = Buffer.from(expected)
    return provided.length === wanted.length && timingSafeEqual(provided, wanted)
  })
}

export async function handleResendWebhook(request: NextRequest, env: Record<string, string | undefined> = process.env) {
  const secret = webhookSecret(env)
  if (!secret) return reply({ status: "disabled" }, 503)
  const reader = request.body?.getReader()
  const decoder = new TextDecoder()
  let raw = "", size = 0
  if (reader) for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > 65536) { await reader.cancel(); return reply({ status: "invalid" }, 413) }
    raw += decoder.decode(value, { stream: true })
  }
  raw += decoder.decode()
  const id = request.headers.get("svix-id") || ""
  const timestamp = request.headers.get("svix-timestamp") || ""
  const signature = request.headers.get("svix-signature") || ""
  if (!verifyResendSignature(raw, id, timestamp, signature, secret)) return reply({ status: "unauthorized" }, 401)
  let parsed: { type?: unknown; data?: { email_id?: unknown } }
  try { parsed = JSON.parse(raw) as { type?: unknown; data?: { email_id?: unknown } } }
  catch { return reply({ status: "invalid" }, 400) }
  const eventType = typeof parsed.type === "string" ? parsed.type : ""
  const messageId = typeof parsed.data?.email_id === "string" ? parsed.data.email_id : null
  const result = await backend().rpc<{ status?: string; duplicate?: boolean; applied?: boolean }>("communication_apply_provider_event_v1", {
    p_provider: "resend",
    p_provider_event_id: id,
    p_event_type: eventType || "unknown",
    p_provider_message_id: messageId,
  })
  if (result?.status !== "success") return reply({ status: "error" }, 503)
  return reply({ status: "success", duplicate: result.duplicate === true })
}
