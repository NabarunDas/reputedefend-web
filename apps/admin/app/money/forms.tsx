"use client"
import { useRef, useState, type FormEvent } from "react"
import { LOST_PAYMENT_LINK_NOTE } from "@/lib/payments/model"
import { ADMIN_RECENT_SIGN_IN_MESSAGE } from "@/lib/admin/reauth-copy"

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
}: { serviceOrderId: string; version: number; operation: "issue_guided_payment_action" | "issue_managed_setup_action" | "issue_recovery_action" | "issue_invoice_fallback"; label: string; obligationId?: string | null }) {
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
    {operation === "issue_invoice_fallback" && label === "Issue success-fee invoice" && <p>This issues the success-fee invoice. It is due within 14 days. The customer opens it from the signed-in portal. In a development workspace the invoice is test mode. This does not email a bearer secret, mark the obligation paid, or charge a card. {ADMIN_RECENT_SIGN_IN_MESSAGE}</p>}
    {operation === "issue_invoice_fallback" && label !== "Issue success-fee invoice" && <p>This creates a TEST-MODE hosted payment fallback. It does not mark the obligation paid. The customer opens it from the signed-in portal. {ADMIN_RECENT_SIGN_IN_MESSAGE}</p>}
    <button type="submit" disabled={busy}>{label}</button>
    <p role="status">{message}{actionUrl && operation !== "issue_invoice_fallback" ? ` This is a one-time customer link. Copy it now. It cannot be shown again. ${LOST_PAYMENT_LINK_NOTE}` : ""}</p>
    {actionUrl && operation !== "issue_invoice_fallback" && <p><label>Customer link<input readOnly value={actionUrl} /></label></p>}
  </form>
}

export function ApproveSuccessFeeForm({
  serviceOrderId, version, evidence,
}: { serviceOrderId: string; version: number; evidence?: Array<{ id: string; filename: string; versionNumber: number }> }) {
  const { busy, message, run } = useCommand()
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await run("approve_success_fee", {
      serviceOrderId,
      version,
      outcomeEvidenceVersionId: String(form.get("outcomeEvidenceVersionId") || ""),
      evidenceNote: String(form.get("evidenceNote") || ""),
      approvalReason: String(form.get("approvalReason") || ""),
    })
  }
  return <form onSubmit={submit}>
    <p>{ADMIN_RECENT_SIGN_IN_MESSAGE} The amount is the immutable accepted order total. This page does not charge a card. Select accepted case evidence for the same case.</p>
    <label>Accepted outcome evidence
      <select name="outcomeEvidenceVersionId" required>
        <option value="">Select accepted evidence</option>
        {(evidence ?? []).map(item => <option key={item.id} value={item.id}>{item.filename} · v{item.versionNumber}</option>)}
      </select>
    </label>
    <label>Evidence note<textarea name="evidenceNote" required minLength={10} maxLength={2000} /></label>
    <label>Approval reason<textarea name="approvalReason" required minLength={10} maxLength={2000} /></label>
    <button type="submit" disabled={busy}>Approve success fee</button>
    <p role="status">{message}</p>
  </form>
}

export function RecordSuccessObservationForm({ serviceOrderId }: { serviceOrderId: string }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const commandKey = useRef<string | null>(null)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    commandKey.current ||= crypto.randomUUID()
    const form = new FormData(event.currentTarget)
    const observedAt = form.get("observedAt") ? new Date(String(form.get("observedAt"))).toISOString() : ""
    setBusy(true)
    setMessage("")
    try {
      const response = await fetch("/api/cases/journey/success-observation", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": commandKey.current },
        body: JSON.stringify({
          serviceOrderId,
          targetRef: String(form.get("targetRef") || ""),
          restrictionRef: String(form.get("restrictionRef") || ""),
          observedAt,
          finding: String(form.get("finding") || ""),
          observerRef: String(form.get("observerRef") || ""),
          note: String(form.get("note") || ""),
        }),
      })
      const result = await response.json() as { message?: string }
      setMessage(result.message || "")
      if (response.ok) window.location.reload()
      else commandKey.current = null
    } catch {
      setMessage("We couldn’t save that observation. Reload the page and try again.")
      commandKey.current = null
    } finally {
      setBusy(false)
    }
  }
  return <form onSubmit={submit}>
    <p>Record one check of the original profile or review. Two checks of the same target, at least 48 hours apart, are required before the success fee can be approved. This does not approve the fee, create an invoice, or charge a card. {ADMIN_RECENT_SIGN_IN_MESSAGE}</p>
    <label>Profile or review target<input name="targetRef" required minLength={1} maxLength={200} /></label>
    <label>Original restriction<input name="restrictionRef" required minLength={1} maxLength={200} /></label>
    <label>Observed at<input name="observedAt" type="datetime-local" required /></label>
    <label>Finding
      <select name="finding" required defaultValue="ABSENT">
        <option value="ABSENT">Absent — the original issue was not seen</option>
        <option value="PRESENT">Present — the original issue was still seen</option>
        <option value="RECURRENCE">Recurrence — the original issue returned</option>
        <option value="AMBIGUOUS">Ambiguous — the check was not conclusive</option>
        <option value="UNRELATED">Unrelated — a different cause was confirmed</option>
      </select>
    </label>
    <label>Observer reference<input name="observerRef" required minLength={8} maxLength={200} /></label>
    <label>Note<textarea name="note" required minLength={10} maxLength={2000} /></label>
    <button type="submit" disabled={busy}>Record success observation</button>
    <p role="status">{message}</p>
  </form>
}
