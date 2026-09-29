"use client"
import { useRef, useState, type FormEvent } from "react"

async function post(operation: string, body: Record<string, unknown>, key: string) {
  const response = await fetch("/api/operations/communications", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": key },
    body: JSON.stringify({ operation, ...body }),
  })
  const result = await response.json() as { message?: string }
  return { ok: response.ok, message: result.message || "" }
}

export function DraftCommunicationForm({ caseId }: { caseId?: string }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [template, setTemplate] = useState("EVIDENCE_REQUEST")
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
        templateKey: String(form.get("templateKey") || ""),
        caseId: String(form.get("caseId") || ""),
        evidenceRequestId: String(form.get("evidenceRequestId") || "") || undefined,
        fact: String(form.get("fact") || "") || undefined,
        effect: String(form.get("effect") || "") || undefined,
        nextStep: String(form.get("nextStep") || "") || undefined,
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
    <label>Case ID<input name="caseId" required defaultValue={caseId || ""} maxLength={36} /></label>
    <label>Template
      <select name="templateKey" value={template} onChange={event => setTemplate(event.target.value)}>
        <option value="EVIDENCE_REQUEST">Evidence request</option>
        <option value="CASE_UPDATE">Case update</option>
      </select>
    </label>
    {template === "EVIDENCE_REQUEST"
      ? <label>Evidence request ID<input name="evidenceRequestId" required maxLength={36} /></label>
      : <>
        <label>Fact<textarea name="fact" required minLength={10} maxLength={400} rows={2} /></label>
        <label>Effect<textarea name="effect" required minLength={10} maxLength={400} rows={2} /></label>
        <label>Next step<textarea name="nextStep" required minLength={10} maxLength={400} rows={2} /></label>
      </>}
    <button type="submit" disabled={busy}>{busy ? "Drafting…" : "Draft communication"}</button>
    {message && <p role="status">{message}</p>}
  </form>
}

export function ReviewCommunicationForm({ communicationId, version }: { communicationId: string; version: number }) {
  return <SimpleCommandForm operation="review" communicationId={communicationId} version={version} label="Mark reviewed" busyLabel="Reviewing…" />
}

export function QueueCommunicationForm({ communicationId, version }: { communicationId: string; version: number }) {
  return <SimpleCommandForm operation="queue" communicationId={communicationId} version={version} label="Queue for sending" busyLabel="Queuing…" confirm="Queue this reviewed communication. It will not send from this page." />
}

export function ResendDraftForm({ communicationId, caseId }: { communicationId: string; caseId: string }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const commandKey = useRef<string | null>(null)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    commandKey.current ||= crypto.randomUUID()
    setBusy(true)
    setMessage("")
    try {
      const result = await post("resend_draft", { communicationId, caseId }, commandKey.current)
      setMessage(result.message)
      if (result.ok) window.location.reload()
      else commandKey.current = null
    } catch {
      setMessage("We couldn’t draft a replacement. Reload the page and try again.")
      commandKey.current = null
    } finally {
      setBusy(false)
    }
  }
  return <form onSubmit={submit}>
    <p className="muted">Creates a new draft to the current verified address. The original recipient snapshot is kept.</p>
    <button type="submit" disabled={busy}>{busy ? "Drafting…" : "Draft replacement"}</button>
    {message && <p role="status">{message}</p>}
  </form>
}

function SimpleCommandForm({
  operation, communicationId, version, label, busyLabel, confirm,
}: {
  operation: string
  communicationId: string
  version: number
  label: string
  busyLabel: string
  confirm?: string
}) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const commandKey = useRef<string | null>(null)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    commandKey.current ||= crypto.randomUUID()
    setBusy(true)
    setMessage("")
    try {
      const result = await post(operation, { communicationId, version }, commandKey.current)
      setMessage(result.message)
      if (result.ok) window.location.reload()
      else commandKey.current = null
    } catch {
      setMessage("We couldn’t save that communication. Reload the page and try again.")
      commandKey.current = null
    } finally {
      setBusy(false)
    }
  }
  return <form onSubmit={submit}>
    {confirm && <p className="muted">{confirm}</p>}
    <button type="submit" disabled={busy}>{busy ? busyLabel : label}</button>
    {message && <p role="status">{message}</p>}
  </form>
}
