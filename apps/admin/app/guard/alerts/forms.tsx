"use client"
import { useRef, useState, type FormEvent } from "react"

async function post(operation: string, body: Record<string, unknown>, key: string) {
  const response = await fetch("/api/operations/guard-alerts", {
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

export function AcknowledgeForm({ alertId, version }: { alertId: string; version: number }) {
  const { busy, message, run } = useCommand()
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    await run("acknowledge", {
      alertId, version,
      severity: String(data.get("severity") || ""),
      disposition: String(data.get("disposition") || ""),
      reason: String(data.get("reason") || ""),
    })
  }
  return <form onSubmit={submit}>
    <label>Severity
      <select name="severity" required>
        <option value="LOW">Low</option>
        <option value="MEDIUM">Medium</option>
        <option value="HIGH">High</option>
        <option value="CRITICAL">Critical</option>
      </select>
    </label>
    <label>Disposition
      <select name="disposition" required>
        <option value="CONFIRMED_CUSTOMER_ISSUE">Confirmed customer issue</option>
        <option value="INTERNAL_ONLY">Internal only</option>
        <option value="FALSE_POSITIVE">False positive</option>
      </select>
    </label>
    <label>Review note
      <textarea name="reason" required minLength={10} maxLength={500} />
    </label>
    <button type="submit" disabled={busy}>Acknowledge</button>
    <p role="status">{message}</p>
  </form>
}

export function ReasonForm({
  alertId, version, operation, label, extra,
}: {
  alertId: string
  version: number
  operation: string
  label: string
  extra?: Record<string, unknown>
}) {
  const { busy, message, run } = useCommand()
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const reason = String(new FormData(event.currentTarget).get("reason") || "")
    await run(operation, { alertId, version, reason, ...extra })
  }
  return <form onSubmit={submit}>
    <label>Reason
      <textarea name="reason" required minLength={10} maxLength={500} />
    </label>
    <button type="submit" disabled={busy}>{label}</button>
    <p role="status">{message}</p>
  </form>
}

export function EscalateForm({ alertId, version, current }: { alertId: string; version: number; current: string }) {
  const ranks = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
  const next = ranks.filter(item => ranks.indexOf(item) > ranks.indexOf(current))
  if (!next.length) return null
  const { busy, message, run } = useCommand()
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    await run("escalate", { alertId, version, severity: String(data.get("severity") || ""), reason: String(data.get("reason") || "") })
  }
  return <form onSubmit={submit}>
    <label>New severity
      <select name="severity" required>{next.map(item => <option key={item} value={item}>{item}</option>)}</select>
    </label>
    <label>Reason
      <textarea name="reason" required minLength={10} maxLength={500} />
    </label>
    <button type="submit" disabled={busy}>Escalate</button>
    <p role="status">{message}</p>
  </form>
}

export function PrepareNotificationForm({ alertId, version }: { alertId: string; version: number }) {
  const { busy, message, run } = useCommand()
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    await run("prepare_notification", {
      alertId, version,
      notificationKind: String(data.get("notificationKind") || "INITIAL"),
      fact: String(data.get("fact") || ""),
      effect: String(data.get("effect") || ""),
      nextStep: String(data.get("nextStep") || ""),
      reason: String(data.get("reason") || ""),
    })
  }
  return <form onSubmit={submit}>
    <label>Kind
      <select name="notificationKind">
        <option value="INITIAL">Initial</option>
        <option value="FOLLOW_UP">Follow-up</option>
        <option value="RESOLUTION">Resolution</option>
      </select>
    </label>
    <label>Fact<textarea name="fact" required minLength={10} maxLength={400} /></label>
    <label>Effect<textarea name="effect" required minLength={10} maxLength={400} /></label>
    <label>Next step<textarea name="nextStep" required minLength={10} maxLength={400} /></label>
    <label>Reason for follow-up or resolution<textarea name="reason" minLength={10} maxLength={500} /></label>
    <button type="submit" disabled={busy}>Prepare notification</button>
    <p role="status">{message}</p>
  </form>
}

export function NotificationActionForm({
  alertId, version, communicationId, operation, label,
}: {
  alertId: string
  version: number
  communicationId: string
  operation: "approve_notification" | "queue_notification"
  label: string
}) {
  const { busy, message, run } = useCommand()
  return <form onSubmit={event => { event.preventDefault(); void run(operation, { alertId, version, communicationId }) }}>
    <button type="submit" disabled={busy}>{label}</button>
    <p role="status">{message}</p>
  </form>
}

export function CreateCaseForm({ alertId, version }: { alertId: string; version: number }) {
  const { busy, message, run } = useCommand()
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await run("create_intervention_case", {
      alertId, version, caseType: String(new FormData(event.currentTarget).get("caseType") || ""),
    })
  }
  return <form onSubmit={submit}>
    <label>Case type
      <select name="caseType" required>
        <option value="PROFILE_RECOVERY">Profile recovery</option>
        <option value="REVIEW_PROTECTION">Review protection</option>
      </select>
    </label>
    <button type="submit" disabled={busy}>Create intervention case</button>
    <p role="status">{message}</p>
  </form>
}

export function LinkCaseForm({ alertId, version }: { alertId: string; version: number }) {
  const { busy, message, run } = useCommand()
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await run("link_existing_case", { alertId, version, caseId: String(new FormData(event.currentTarget).get("caseId") || "") })
  }
  return <form onSubmit={submit}>
    <label>Existing case id
      <input name="caseId" required pattern="[0-9a-fA-F-]{36}" />
    </label>
    <button type="submit" disabled={busy}>Link existing case</button>
    <p role="status">{message}</p>
  </form>
}

export function ServiceActionForm({
  serviceActionId, version, operation, label,
}: {
  serviceActionId: string
  version: number
  operation: "acknowledge_service_action" | "resolve_service_action"
  label: string
}) {
  const { busy, message, run } = useCommand()
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await run(operation, { serviceActionId, version, reason: String(new FormData(event.currentTarget).get("reason") || "") })
  }
  return <form onSubmit={submit}>
    <label>Note<textarea name="reason" required minLength={10} maxLength={500} /></label>
    <button type="submit" disabled={busy}>{label}</button>
    <p role="status">{message}</p>
  </form>
}
