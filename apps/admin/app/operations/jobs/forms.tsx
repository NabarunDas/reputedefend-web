"use client"
import { useRef, useState, type FormEvent } from "react"
import { ADMIN_RECENT_SIGN_IN_MESSAGE } from "@/lib/admin/reauth-copy"

export function EnqueueProbeForm() {
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
      const response = await fetch("/api/operations/jobs", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": commandKey.current },
        body: JSON.stringify({ operation: "enqueue_probe" }),
      })
      const result = await response.json() as { message?: string }
      setMessage(result.message || "")
      if (response.ok) window.location.reload()
      else commandKey.current = null
    } catch {
      setMessage("We couldn’t queue that probe. Reload the page and try again.")
      commandKey.current = null
    } finally {
      setBusy(false)
    }
  }
  return <form onSubmit={submit}>
    <button type="submit" disabled={busy}>{busy ? "Queuing…" : "Queue health probe"}</button>
    {message && <p role="status">{message}</p>}
  </form>
}

export function ReplayJobForm({ jobId, version }: { jobId: string; version: number }) {
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
      const response = await fetch("/api/operations/jobs", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": commandKey.current },
        body: JSON.stringify({
          operation: "replay",
          jobId,
          version,
          reason: String(form.get("reason") || ""),
          confirmed: form.get("confirmed") === "yes",
        }),
      })
      const result = await response.json() as { message?: string }
      setMessage(result.message || "")
      if (response.ok) window.location.reload()
      else commandKey.current = null
    } catch {
      setMessage("We couldn’t replay that job. Reload the page and try again.")
      commandKey.current = null
    } finally {
      setBusy(false)
    }
  }
  return <form onSubmit={submit}>
    <label>Reason for replay
      <textarea name="reason" required minLength={10} maxLength={2000} rows={2} />
    </label>
    <label className="checkbox"><input type="checkbox" name="confirmed" value="yes" required />Replay this dead-lettered job</label>
    <p className="muted">{ADMIN_RECENT_SIGN_IN_MESSAGE} The same idempotency key is reused.</p>
    <button type="submit" disabled={busy}>{busy ? "Replaying…" : "Replay job"}</button>
    {message && <p role="status">{message}</p>}
  </form>
}

export function DevStripeOneShotForm() {
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
      const response = await fetch("/api/operations/dev-stripe-reconcile", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": commandKey.current },
        body: JSON.stringify({
          eventId: String(form.get("eventId") || "").trim(),
          confirmed: form.get("confirmed") === "yes",
        }),
      })
      const result = await response.json() as { message?: string }
      setMessage(result.message || "")
      if (response.ok) window.location.reload()
      else commandKey.current = null
    } catch {
      setMessage("That event was not processed. Reload the page and try again.")
      commandKey.current = null
    } finally {
      setBusy(false)
    }
  }
  return <form onSubmit={submit}>
    <h3>DEV test-mode Stripe event</h3>
    <p className="muted">Processes one selected test-mode event on the DEV Preview develop deployment when that gate is on. It does not send email, charge a card, or run Guard.</p>
    <label>Stripe event id
      <input name="eventId" required pattern="evt_[A-Za-z0-9_]{4,160}" autoComplete="off" spellCheck={false} />
    </label>
    <label className="checkbox"><input type="checkbox" name="confirmed" value="yes" required />Process this one test-mode Stripe event</label>
    <button type="submit" disabled={busy}>{busy ? "Processing…" : "Process one DEV Stripe event"}</button>
    {message && <p role="status">{message}</p>}
  </form>
}
