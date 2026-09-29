import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { backend } from "../auth/backend"
import { privateResponseHeaders } from "../access"
import { parseProviderOccurredAt, verifyResendSignature } from "../communications/webhook"
import { inboundWebhookSecret } from "./gate"
import { parseMailbox } from "./mailbox"

const reply = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status, headers: privateResponseHeaders })

function boundedText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, max)
}

export async function handleResendInboundWebhook(request: NextRequest, env: Record<string, string | undefined> = process.env) {
  const secret = inboundWebhookSecret(env)
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
  let parsed: { type?: unknown; created_at?: unknown; data?: unknown }
  try { parsed = JSON.parse(raw) as { type?: unknown; created_at?: unknown; data?: unknown } }
  catch { return reply({ status: "invalid" }, 400) }
  if (parsed.type !== "email.received") return reply({ status: "ignored" }, 200)
  const data = parsed.data && typeof parsed.data === "object"
    ? parsed.data as { email_id?: unknown; message_id?: unknown; from?: unknown; subject?: unknown }
    : null
  const emailId = typeof data?.email_id === "string" ? data.email_id : ""
  if (emailId.length < 8 || emailId.length > 200) return reply({ status: "invalid" }, 400)
  const occurredAt = parseProviderOccurredAt(parsed.created_at)
  const sender = parseMailbox(data?.from)
  const result = await backend().rpc<{ status?: string; duplicate?: boolean }>("inbound_email_receive_event_v1", {
    p_provider: "resend",
    p_provider_event_id: id,
    p_event_type: "email.received",
    p_provider_email_id: emailId,
    p_rfc_message_id: boundedText(data?.message_id, 300),
    p_sender_address: sender?.address ?? null,
    p_subject: boundedText(data?.subject, 500),
    p_provider_occurred_at: occurredAt,
    p_sender_display: sender?.display ?? null,
  })
  if (result?.status !== "success") return reply({ status: "error" }, 503)
  return reply({ status: "success", duplicate: result.duplicate === true })
}
