"use client"
import { useRef, useState, type FormEvent } from "react"

async function post(operation: string, body: Record<string, unknown>, key: string) {
  const response = await fetch("/api/operations/guard-checks", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": key },
    body: JSON.stringify({ operation, ...body }),
  })
  const result = await response.json() as { message?: string }
  return { ok: response.ok, message: result.message || "" }
}

function useCommand() {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const commandKey = useRef<string | null>(null)
  async function run(operation: string, body: Record<string, unknown>) {
    if (busy) return
    commandKey.current ||= crypto.randomUUID()
    setBusy(true)
    setMessage("")
    try {
      const result = await post(operation, body, commandKey.current)
      setMessage(result.message)
      if (result.ok) window.location.reload()
      else commandKey.current = null
    } catch {
      setMessage("We couldn’t save that. Reload the page and try again.")
      commandKey.current = null
    } finally {
      setBusy(false)
    }
  }
  return { busy, message, run }
}

export function ClaimForm({
  obligationId, version, label = "Claim check",
}: {
  obligationId: string
  version: number
  label?: string
}) {
  const { busy, message, run } = useCommand()
  return <form onSubmit={event => { event.preventDefault(); void run("claim", { obligationId, version }) }}>
    <button type="submit" disabled={busy}>{label}</button>
    <p role="status">{message}</p>
  </form>
}

export function ReleaseForm({ obligationId, version }: { obligationId: string; version: number }) {
  const { busy, message, run } = useCommand()
  return <form onSubmit={event => { event.preventDefault(); void run("release", { obligationId, version, reason: "released" }) }}>
    <button type="submit" disabled={busy}>Release claim</button>
    <p role="status">{message}</p>
  </form>
}

export function FailRetryForm({ obligationId, version }: { obligationId: string; version: number }) {
  const { busy, message, run } = useCommand()
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const reason = String(new FormData(event.currentTarget).get("reason") || "")
    await run("fail", { obligationId, version, reason })
  }
  return <form onSubmit={submit}>
    <label>Retryable technical failure
      <textarea name="reason" required minLength={10} maxLength={200} />
    </label>
    <p className="muted">Use this for browser or page-load interruptions only. Profile unavailability is an observation, not a technical failure.</p>
    <button type="submit" disabled={busy}>Record failure and retry</button>
    <p role="status">{message}</p>
  </form>
}

export function CancelForm({ obligationId, version }: { obligationId: string; version: number }) {
  const { busy, message, run } = useCommand()
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const reason = String(new FormData(event.currentTarget).get("reason") || "")
    await run("cancel", { obligationId, version, reason })
  }
  return <form onSubmit={submit}>
    <label>Cancel reason
      <input name="reason" required minLength={3} maxLength={200} />
    </label>
    <button type="submit" disabled={busy}>Cancel check</button>
    <p role="status">{message}</p>
  </form>
}

export function CompleteObservationForm({ obligationId, version }: { obligationId: string; version: number }) {
  const { busy, message, run } = useCommand()
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await run("complete", {
      obligationId,
      version,
      classification: String(form.get("classification") || ""),
      profileAvailability: String(form.get("profileAvailability") || ""),
      locationIdentified: form.get("locationIdentified") === "true",
      displayedBusinessName: String(form.get("displayedBusinessName") || ""),
      reviewCount: String(form.get("reviewCount") || ""),
      rating: String(form.get("rating") || ""),
      ratingAvailable: form.get("ratingAvailable") === "true",
      latestReviewReference: String(form.get("latestReviewReference") || ""),
      latestReviewAt: String(form.get("latestReviewAt") || ""),
      profileUrl: String(form.get("profileUrl") || ""),
      notes: String(form.get("notes") || ""),
    })
  }
  return <form onSubmit={submit}>
    <label>Classification
      <select name="classification" required>
        <option value="HEALTHY">Healthy</option>
        <option value="CHANGE_DETECTED">Change detected</option>
        <option value="PROFILE_UNAVAILABLE">Profile unavailable</option>
        <option value="INCOMPLETE">Incomplete</option>
      </select>
    </label>
    <label>Profile availability
      <select name="profileAvailability" required>
        <option value="AVAILABLE">Available</option>
        <option value="UNAVAILABLE">Unavailable</option>
        <option value="UNKNOWN">Unknown</option>
      </select>
    </label>
    <label>Correct location identified
      <select name="locationIdentified" required>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    </label>
    <label>Displayed business name<input name="displayedBusinessName" maxLength={200} /></label>
    <label>Review count<input name="reviewCount" inputMode="numeric" /></label>
    <label>Rating available
      <select name="ratingAvailable">
        <option value="false">Not available</option>
        <option value="true">Available</option>
      </select>
    </label>
    <label>Rating<input name="rating" inputMode="decimal" /></label>
    <label>Latest review reference<input name="latestReviewReference" /></label>
    <label>Latest review time<input name="latestReviewAt" type="datetime-local" /></label>
    <label>Profile URL<input name="profileUrl" /></label>
    <label>Notes<textarea name="notes" maxLength={2000} /></label>
    <p className="muted">Manual capture only. This does not call Google, send email, or create a customer alert. Incomplete facts cannot be healthy.</p>
    <button type="submit" disabled={busy}>Complete observation</button>
    <p role="status">{message}</p>
  </form>
}
