"use client"

import { useState } from "react"

async function send(operation: string, payload: Record<string, unknown>, version?: number) {
  const parsedVersion = payload.version == null ? version : Number(payload.version)
  const next = { ...payload }
  delete next.version
  const response = await fetch("/api/operations/settings", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
    body: JSON.stringify({ operation, payload: next, version: Number.isInteger(parsedVersion) ? parsedVersion : version }),
  })
  const body = await response.json().catch(() => ({ message: "Update failed." }))
  return { ok: response.ok, message: String(body.message || "Updated.") }
}

export function SettingsActionForm({
  operation,
  fields,
  version,
  extras,
  submit,
}: {
  operation: string
  fields: Array<{ name: string; label: string; type?: string; required?: boolean; maxLength?: number }>
  version?: number
  extras?: Record<string, unknown>
  submit: string
}) {
  const [message, setMessage] = useState("")
  return <form onSubmit={event => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const payload: Record<string, unknown> = { ...(extras || {}) }
    for (const field of fields) payload[field.name] = String(data.get(field.name) || "")
    void send(operation, payload, version).then(result => {
      setMessage(result.message)
      if (result.ok) window.location.reload()
    })
  }}>
    {fields.map(field => (
      <label key={field.name}>{field.label}
        <input name={field.name} type={field.type || "text"} required={field.required} maxLength={field.maxLength} />
      </label>
    ))}
    <button type="submit">{submit}</button>
    {message && <p role="status">{message}</p>}
  </form>
}

export function HoursForm() {
  const [message, setMessage] = useState("")
  return <form onSubmit={event => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const start = String(data.get("start") || "")
    const end = String(data.get("end") || "")
    const weekend = String(data.get("weekendPolicy") || "EXCLUDED") === "INCLUDED" ? "INCLUDED" : "EXCLUDED"
    const days = weekend === "INCLUDED" ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5]
    void send("create_setting_draft", {
      key: "SERVICE_HOURS",
      reason: String(data.get("reason") || ""),
      effectiveFrom: String(data.get("effectiveFrom") || "") || undefined,
      payload: {
        timezone: "Europe/London",
        weekendPolicy: weekend,
        bankHolidayPolicy: "INCLUDED",
        windows: days.map(day => ({ day, start, end })),
      },
    }).then(result => {
      setMessage(result.message)
      if (result.ok) window.location.reload()
    })
  }}>
    <label>Weekday start<input name="start" type="time" required defaultValue="09:00" /></label>
    <label>Weekday end<input name="end" type="time" required defaultValue="17:00" /></label>
    <label>Weekend policy
      <select name="weekendPolicy" defaultValue="EXCLUDED">
        <option value="EXCLUDED">Weekdays only</option>
        <option value="INCLUDED">Include Saturday and Sunday</option>
      </select>
    </label>
    <label>Effective from<input name="effectiveFrom" type="datetime-local" /></label>
    <label>Reason<input name="reason" required minLength={3} maxLength={500} /></label>
    <button type="submit">Save service-hours draft</button>
    <p className="muted">Europe/London windows only. This is not a Guard monitoring clock and does not invent a two-hour response promise.</p>
    {message && <p role="status">{message}</p>}
  </form>
}

export function ResponseTargetsForm() {
  const [message, setMessage] = useState("")
  return <form onSubmit={event => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    void send("create_setting_draft", {
      key: "RESPONSE_TARGETS",
      reason: String(data.get("reason") || ""),
      effectiveFrom: String(data.get("effectiveFrom") || "") || undefined,
      payload: {
        ENQUIRY_FIRST_RESPONSE: { hours: Number(data.get("enquiryHours")) },
        CASE_FIRST_RESPONSE: { hours: Number(data.get("caseHours")) },
      },
    }).then(result => {
      setMessage(result.message)
      if (result.ok) window.location.reload()
    })
  }}>
    <label>Enquiry first-response hours<input name="enquiryHours" type="number" min={1} max={168} required /></label>
    <label>Case first-response hours<input name="caseHours" type="number" min={1} max={168} required /></label>
    <label>Effective from<input name="effectiveFrom" type="datetime-local" /></label>
    <label>Reason<input name="reason" required minLength={3} maxLength={500} /></label>
    <button type="submit">Save response-target draft</button>
    <p className="muted">Approval requires an approved service-hours version. No target minutes are invented here.</p>
    {message && <p role="status">{message}</p>}
  </form>
}

export function RetentionForm() {
  const [message, setMessage] = useState("")
  return <form onSubmit={event => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    void send("create_retention_draft", {
      category: String(data.get("category") || ""),
      retentionMode: String(data.get("retentionMode") || ""),
      durationDays: String(data.get("durationDays") || "") || undefined,
      reason: String(data.get("reason") || ""),
    }).then(result => {
      setMessage(result.message)
      if (result.ok) window.location.reload()
    })
  }}>
    <label>Category<input name="category" required maxLength={40} /></label>
    <label>Retention mode<input name="retentionMode" required maxLength={40} placeholder="RETAIN_FOR_PERIOD" /></label>
    <label>Duration days<input name="durationDays" type="number" min={1} max={3650} /></label>
    <label>Reason<input name="reason" required minLength={3} maxLength={500} /></label>
    <button type="submit">Save retention draft</button>
    <p className="muted">Each category stays “Retention policy not approved” until you approve a version. Deletion automation cannot run without that.</p>
    {message && <p role="status">{message}</p>}
  </form>
}

export function ResolveIncidentForm({ id, version }: { id: string; version: number }) {
  const [message, setMessage] = useState("")
  return <form onSubmit={event => {
    event.preventDefault()
    const resolution = String(new FormData(event.currentTarget).get("resolution") || "")
    void send("resolve_incident", { id, resolution }, version).then(result => {
      setMessage(result.message)
      if (result.ok) window.location.reload()
    })
  }}>
    <label>Resolution<input name="resolution" required minLength={3} maxLength={2000} /></label>
    <button type="submit">Resolve</button>
    {message && <p role="status">{message}</p>}
  </form>
}

export function ApproveButton({
  operation, id, version, label, extras,
}: {
  operation: string
  id: string
  version: number
  label: string
  extras?: Record<string, unknown>
}) {
  const [message, setMessage] = useState("")
  return <span>
    <button type="button" onClick={() => {
      void send(operation, { id, ...(extras || {}) }, version).then(result => {
        setMessage(result.message)
        if (result.ok) window.location.reload()
      })
    }}>{label}</button>
    {message && <p role="status">{message}</p>}
  </span>
}

export function ExportPrivacyButton({ id, version }: { id: string; version: number }) {
  const [message, setMessage] = useState("")
  return <span>
    <button type="button" onClick={() => {
      void fetch("/api/operations/privacy-export", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ privacyRequestId: id, version }),
      }).then(async response => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({ message: "Export failed." }))
          setMessage(String(body.message || "Export failed."))
          return
        }
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        link.download = "privacy-export.csv"
        link.click()
        URL.revokeObjectURL(url)
        setMessage("Export downloaded. It was not emailed.")
      })
    }}>Download reviewed export</button>
    {message && <p role="status">{message}</p>}
  </span>
}
