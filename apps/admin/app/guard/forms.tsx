"use client"
import { useRef, useState, type FormEvent } from "react"

function futureLocalMin(minutes = 5) {
  const at = new Date(Date.now() + minutes * 60 * 1000)
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`
}

async function post(operation: string, body: Record<string, unknown>, key: string) {
  const response = await fetch("/api/operations/guard", {
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

export function IdentifyLocationForm({
  monitoringRequestId, locations,
}: {
  monitoringRequestId: string
  locations: Array<{ id: string; businessId: string; name?: string | null }>
}) {
  const { busy, message, run } = useCommand()
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await run("identify_location", {
      monitoringRequestId,
      locationId: String(form.get("locationId") || ""),
    })
  }
  return <form onSubmit={submit}>
    <label>Identify another location
      <select name="locationId" required>
        <option value="">Select a location already on this business</option>
        {locations.map(location => <option key={location.id} value={location.id}>{location.name || location.id}</option>)}
      </select>
    </label>
    <button type="submit" disabled={busy}>Identify location</button>
    <p className="muted">This does not create dummy locations to match the requested count.</p>
    <p role="status">{message}</p>
  </form>
}

export function MappingActionForm({
  mappingId, version, operation, label,
}: {
  mappingId: string
  version: number
  operation: "remove_location" | "mark_mapping_ready"
  label: string
}) {
  const { busy, message, run } = useCommand()
  return <form onSubmit={event => { event.preventDefault(); void run(operation, { mappingId, version }) }}>
    <button type="submit" disabled={busy}>{label}</button>
    <p role="status">{message}</p>
  </form>
}

export function CreateDirectCoverageForm({
  mappingId, orders,
}: {
  mappingId: string
  orders: Array<{ id: string; publicRef: string; locationId: string | null; covered: boolean }>
}) {
  const { busy, message, run } = useCommand()
  const available = orders.filter(order => !order.covered)
  if (!available.length) return <p className="muted">No unmatched accepted Guard order for this location.</p>
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await run("create_direct_coverage", { mappingId, serviceOrderId: String(form.get("serviceOrderId") || "") })
  }
  return <form onSubmit={submit}>
    <label>Accepted Guard order
      <select name="serviceOrderId" required>
        {available.map(order => <option key={order.id} value={order.id}>{order.publicRef}</option>)}
      </select>
    </label>
    <button type="submit" disabled={busy}>Create direct coverage</button>
    <p className="muted">An accepted Guard order is not activated coverage. Billing stays pending until Step 16.</p>
    <p role="status">{message}</p>
  </form>
}

export function CreateIncludedOfferForm() {
  const { busy, message, run } = useCommand()
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await run("create_included_offer", {
      caseId: String(form.get("caseId") || ""),
      serviceOrderId: String(form.get("serviceOrderId") || ""),
    })
  }
  return <form onSubmit={submit}>
    <label>Managed recovery case id<input name="caseId" required /></label>
    <label>Accepted Managed order id<input name="serviceOrderId" required /></label>
    <button type="submit" disabled={busy}>Create included 30-day offer</button>
    <p className="muted">Eligibility is fail-closed. The customer must still choose the offer. This does not start the 30 days.</p>
    <p role="status">{message}</p>
  </form>
}

export function IssuePermissionForm({ coverageId }: { coverageId: string }) {
  const { busy, message, actionUrl, run } = useCommand()
  const min = futureLocalMin(30)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const expiresAt = form.get("expiresAt") ? new Date(String(form.get("expiresAt"))).toISOString() : ""
    await run("issue_permission_action", { coverageId, expiresAt })
  }
  return <form onSubmit={submit}>
    <label>Expires<input name="expiresAt" type="datetime-local" required min={min} suppressHydrationWarning /></label>
    <button type="submit" disabled={busy}>Issue Guard permission action</button>
    {actionUrl && <p>Copy this customer link now: <code>{actionUrl}</code></p>}
    <p role="status">{message}</p>
  </form>
}

export function RecordBaselineForm({ coverageId, version }: { coverageId: string; version: number }) {
  const { busy, message, run } = useCommand()
  const [availability, setAvailability] = useState("AVAILABLE")
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await run("record_baseline", {
      coverageId, version,
      profileUrl: String(form.get("profileUrl") || ""),
      displayedBusinessName: String(form.get("displayedBusinessName") || ""),
      profileAvailability: String(form.get("profileAvailability") || ""),
      reviewCount: String(form.get("reviewCount") || ""),
      rating: String(form.get("rating") || ""),
      latestReviewReference: String(form.get("latestReviewReference") || ""),
      notes: String(form.get("notes") || ""),
    })
  }
  return <form onSubmit={submit}>
    <label>Profile URL<input name="profileUrl" required maxLength={500} /></label>
    <label>Displayed business name<input name="displayedBusinessName" required maxLength={200} /></label>
    <label>Profile availability
      <select name="profileAvailability" required value={availability} onChange={event => setAvailability(event.target.value)}>
        <option value="AVAILABLE">Available</option>
        <option value="UNAVAILABLE">Unavailable</option>
        <option value="UNKNOWN">Unknown</option>
      </select>
    </label>
    <label>Review count<input name="reviewCount" type="number" min={0} step={1} /></label>
    <label>Rating<input name="rating" type="number" min={1} max={5} step={0.1} /></label>
    <label>Latest review reference<input name="latestReviewReference" maxLength={200} /></label>
    <label>Capture notes<textarea name="notes" maxLength={2000} /></label>
    <button type="submit" disabled={busy}>
      {availability === "AVAILABLE" ? "Record verified baseline" : "Record incomplete baseline"}
    </button>
    <p className="muted">Only an available, verified baseline can satisfy activation. Unavailable or unknown captures are kept as incomplete history and do not start daily observations.</p>
    <p role="status">{message}</p>
  </form>
}

export function CoverageActionForm({
  coverageId, version, operation, label,
}: {
  coverageId: string
  version: number
  operation: "assign_rota" | "activate" | "record_activation_exception"
  label: string
}) {
  const { busy, message, run } = useCommand()
  return <form onSubmit={event => { event.preventDefault(); void run(operation, { coverageId, version }) }}>
    <button type="submit" disabled={busy}>{label}</button>
    <p role="status">{message}</p>
  </form>
}

export function RevokePermissionForm({ coverageId, version }: { coverageId: string; version: number }) {
  const { busy, message, run } = useCommand()
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await run("revoke_permission", { coverageId, version, reason: String(form.get("reason") || "") })
  }
  return <form onSubmit={submit}>
    <label>Revocation reason<textarea name="reason" required minLength={10} maxLength={2000} /></label>
    <button type="submit" disabled={busy}>Revoke monitoring permission</button>
    <p className="muted">This does not cancel a separate case or financial order.</p>
    <p role="status">{message}</p>
  </form>
}

export function AcknowledgeExceptionForm({ exceptionId }: { exceptionId: string }) {
  const { busy, message, run } = useCommand()
  return <form onSubmit={event => { event.preventDefault(); void run("acknowledge_exception", { exceptionId }) }}>
    <button type="submit" disabled={busy}>Acknowledge exception</button>
    <p role="status">{message}</p>
  </form>
}
