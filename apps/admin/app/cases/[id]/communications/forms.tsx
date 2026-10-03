"use client"
import { useRef, useState, type FormEvent } from "react"
import type { EvidenceRequestChoice } from "@/lib/communications-workspace/model"

async function post(operation: string, body: Record<string, unknown>, key: string) {
  const response = await fetch("/api/operations/communications", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": key },
    body: JSON.stringify({ operation, ...body }),
  })
  const result = await response.json() as { message?: string }
  return { ok: response.ok, message: result.message || "" }
}

export function CaseEvidenceRequestDraftForm({ caseId, requests }: { caseId: string; requests: EvidenceRequestChoice[] }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const commandKey = useRef<string | null>(null)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const form = new FormData(event.currentTarget)
    commandKey.current ||= crypto.randomUUID()
    setBusy(true)
    setMessage("")
    try {
      const result = await post("draft", {
        templateKey: "EVIDENCE_REQUEST",
        caseId,
        evidenceRequestId: String(form.get("evidenceRequestId") || ""),
      }, commandKey.current)
      setMessage(result.message)
      if (result.ok) window.location.reload()
      else commandKey.current = null
    } catch {
      setMessage("We couldn’t draft that communication. Reload the page and try again.")
      commandKey.current = null
    } finally {
      setBusy(false)
    }
  }
  return <form onSubmit={submit}>
    <p className="muted">Drafts the evidence-request message for this case. It has not been sent.</p>
    <label>Evidence request
      <select name="evidenceRequestId" required defaultValue="">
        <option value="" disabled>Choose an open request</option>
        {requests.map(request => <option key={request.id} value={request.id}>{request.label}</option>)}
      </select>
    </label>
    <button type="submit" disabled={busy}>{busy ? "Drafting…" : "Draft evidence request"}</button>
    {message && <p role="status">{message}</p>}
  </form>
}

export function CaseUpdateDraftForm({ caseId }: { caseId: string }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const commandKey = useRef<string | null>(null)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const form = new FormData(event.currentTarget)
    commandKey.current ||= crypto.randomUUID()
    setBusy(true)
    setMessage("")
    try {
      const result = await post("draft", {
        templateKey: "CASE_UPDATE",
        caseId,
        fact: String(form.get("fact") || ""),
        effect: String(form.get("effect") || ""),
        nextStep: String(form.get("nextStep") || ""),
      }, commandKey.current)
      setMessage(result.message)
      if (result.ok) window.location.reload()
      else commandKey.current = null
    } catch {
      setMessage("We couldn’t draft that communication. Reload the page and try again.")
      commandKey.current = null
    } finally {
      setBusy(false)
    }
  }
  return <form onSubmit={submit}>
    <p className="muted">This drafts a case update. It is not the case’s next action, and it has not been sent.</p>
    <label>Fact<textarea name="fact" required minLength={10} maxLength={400} rows={2} /></label>
    <label>Effect<textarea name="effect" required minLength={10} maxLength={400} rows={2} /></label>
    <label>Next step<textarea name="nextStep" required minLength={10} maxLength={400} rows={2} /></label>
    <button type="submit" disabled={busy}>{busy ? "Drafting…" : "Draft case update"}</button>
    {message && <p role="status">{message}</p>}
  </form>
}

export function ReconcileAcceptanceForm({ caseId, communicationId, version }: { caseId: string; communicationId: string; version: number }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const commandKey = useRef<string | null>(null)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const form = new FormData(event.currentTarget)
    commandKey.current ||= crypto.randomUUID()
    setBusy(true)
    setMessage("")
    try {
      const result = await post("reconcile_acceptance", {
        caseId,
        communicationId,
        version,
        providerMessageId: String(form.get("providerMessageId") || ""),
        reason: String(form.get("reason") || ""),
      }, commandKey.current)
      setMessage(result.message)
      if (result.ok) window.location.reload()
      else commandKey.current = null
    } catch {
      setMessage("We couldn’t record that provider acceptance. Reload the page and try again.")
      commandKey.current = null
    } finally {
      setBusy(false)
    }
  }
  return <form onSubmit={submit}>
    <p className="muted">Record the provider message id only when the email provider accepted the message. This does not mark it delivered and does not send it again.</p>
    <label>Provider message id<input name="providerMessageId" required minLength={1} maxLength={200} /></label>
    <label>What the provider record shows<textarea name="reason" required minLength={10} maxLength={500} rows={3} /></label>
    <button type="submit" disabled={busy}>{busy ? "Recording…" : "Record provider acceptance"}</button>
    {message && <p role="status">{message}</p>}
  </form>
}
