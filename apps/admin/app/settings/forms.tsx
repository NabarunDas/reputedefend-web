"use client"

import { useState } from "react"

async function send(operation: string, payload: Record<string, unknown>, version?: number) {
  const response = await fetch("/api/operations/settings", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
    body: JSON.stringify({ operation, payload, version }),
  })
  const body = await response.json().catch(() => ({ message: "Update failed." }))
  return { ok: response.ok, message: String(body.message || "Updated.") }
}

export function SettingsActionForm({
  operation,
  fields,
  version,
  submit,
}: {
  operation: string
  fields: Array<{ name: string; label: string; type?: string; required?: boolean; maxLength?: number }>
  version?: number
  submit: string
}) {
  const [message, setMessage] = useState("")
  return <form onSubmit={event => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const payload: Record<string, unknown> = {}
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
    const target = String(data.get("target") || "")
    void send("create_setting_draft", {
      key: "SERVICE_HOURS",
      reason: String(data.get("reason") || ""),
      effectiveFrom: String(data.get("effectiveFrom") || "") || undefined,
      payload: {
        timezone: "Europe/London",
        weekdays: [1, 2, 3, 4, 5].map(day => ({ day, start, end })),
        firstResponseTargetHours: target ? Number(target) : null,
        independentOfGuardMonitoring: true,
      },
    }).then(result => {
      setMessage(result.message)
      if (result.ok) window.location.reload()
    })
  }}>
    <label>Weekday start<input name="start" type="time" required defaultValue="09:00" /></label>
    <label>Weekday end<input name="end" type="time" required defaultValue="17:30" /></label>
    <label>First-response target hours<input name="target" type="number" min={1} max={168} /></label>
    <label>Effective from<input name="effectiveFrom" type="datetime-local" /></label>
    <label>Reason<input name="reason" required minLength={3} maxLength={500} /></label>
    <button type="submit">Save service-hours draft</button>
    <p className="muted">This is a case/enquiry target, not a Guard SLA. Approved hours do not rewrite existing case due dates.</p>
    {message && <p role="status">{message}</p>}
  </form>
}

export function RetentionForm() {
  const [message, setMessage] = useState("")
  return <form onSubmit={event => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const num = (name: string) => Number(data.get(name))
    void send("create_setting_draft", {
      key: "RETENTION",
      reason: String(data.get("reason") || ""),
      payload: {
        unsuccessfulEnquiriesDays: num("unsuccessfulEnquiriesDays"),
        caseEvidenceDays: num("caseEvidenceDays"),
        financialDays: num("financialDays"),
        consentDays: num("consentDays"),
        securityLogsDays: num("securityLogsDays"),
      },
    }).then(result => {
      setMessage(result.message)
      if (result.ok) window.location.reload()
    })
  }}>
    <label>Unsuccessful enquiries (days)<input name="unsuccessfulEnquiriesDays" type="number" min={1} max={3650} required /></label>
    <label>Case evidence (days)<input name="caseEvidenceDays" type="number" min={1} max={3650} required /></label>
    <label>Financial records (days)<input name="financialDays" type="number" min={1} max={3650} required /></label>
    <label>Consent records (days)<input name="consentDays" type="number" min={1} max={3650} required /></label>
    <label>Security logs (days)<input name="securityLogsDays" type="number" min={1} max={3650} required /></label>
    <label>Reason<input name="reason" required minLength={3} maxLength={500} /></label>
    <button type="submit">Save retention draft</button>
    <p className="muted">This records the approved policy. Deletion is not automated in this step. Legal holds still block removal.</p>
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

export function ApproveButton({ operation, id, version, label }: { operation: string; id: string; version: number; label: string }) {
  const [message, setMessage] = useState("")
  return <span>
    <button type="button" onClick={() => {
      void send(operation, { id }, version).then(result => {
        setMessage(result.message)
        if (result.ok) window.location.reload()
      })
    }}>{label}</button>
    {message && <p role="status">{message}</p>}
  </span>
}
