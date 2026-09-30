"use client"
import { useRef, useState, type FormEvent } from "react"

function futureLocalMin(minutes = 5) {
  const at = new Date(Date.now() + minutes * 60 * 1000)
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`
}

async function post(operation: string, body: Record<string, unknown>, key: string) {
  const response = await fetch("/api/operations/payments", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": key },
    body: JSON.stringify({ operation, ...body }),
  })
  const result = await response.json() as { message?: string; actionUrl?: string }
  return { ok: response.ok, message: result.message || "", actionUrl: result.actionUrl }
}

function useCommand() {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [actionUrl, setActionUrl] = useState("")
  const commandKey = useRef<string | null>(null)
  async function run(operation: string, body: Record<string, unknown>) {
    if (busy) return
    commandKey.current ||= crypto.randomUUID()
    setBusy(true)
    setMessage("")
    try {
      const result = await post(operation, body, commandKey.current)
      setMessage(result.message)
      if (result.actionUrl) setActionUrl(result.actionUrl)
      if (result.ok && !result.actionUrl) window.location.reload()
      if (!result.ok) commandKey.current = null
    } catch {
      setMessage("We couldn’t save that. Reload the page and try again.")
      commandKey.current = null
    } finally {
      setBusy(false)
    }
  }
  return { busy, message, actionUrl, run }
}

export function IssuePaymentActionForm({
  serviceOrderId, version, operation, label, obligationId,
}: { serviceOrderId: string; version: number; operation: "issue_guided_payment_action" | "issue_managed_setup_action" | "issue_recovery_action"; label: string; obligationId?: string | null }) {
  const { busy, message, actionUrl, run } = useCommand()
  const minFrom = futureLocalMin(5)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const expiresAt = form.get("expiresAt") ? new Date(String(form.get("expiresAt"))).toISOString() : ""
    await run(operation, {
      serviceOrderId,
      version,
      expiresAt,
      obligationId: form.get("obligationId") || undefined,
    })
  }
  return <form onSubmit={submit}>
    {obligationId && <input type="hidden" name="obligationId" value={obligationId} />}
    <label>Expires<input name="expiresAt" type="datetime-local" required min={minFrom} suppressHydrationWarning /></label>
    <button type="submit" disabled={busy}>{label}</button>
    {actionUrl && <p><a href={actionUrl}>Open the one-time customer link</a></p>}
    <p role="status">{message}</p>
  </form>
}

export function ApproveSuccessFeeForm({ serviceOrderId, version }: { serviceOrderId: string; version: number }) {
  const { busy, message, run } = useCommand()
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await run("approve_success_fee", {
      serviceOrderId,
      version,
      evidenceNote: String(form.get("evidenceNote") || ""),
      approvalReason: String(form.get("approvalReason") || ""),
    })
  }
  return <form onSubmit={submit}>
    <p>Approval requires a fresh sign-in in the last five minutes. The amount is the immutable accepted order total. This page does not charge a card.</p>
    <label>Evidence note<textarea name="evidenceNote" required minLength={10} maxLength={2000} /></label>
    <label>Approval reason<textarea name="approvalReason" required minLength={10} maxLength={2000} /></label>
    <button type="submit" disabled={busy}>Approve success fee</button>
    <p role="status">{message}</p>
  </form>
}
