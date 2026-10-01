"use client"

import { useState } from "react"

export function ExportButton({ reportKey, preset, startDate, endDate }: { reportKey: string; preset: string; startDate?: string | null; endDate?: string | null }) {
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  async function exportCsv() {
    setBusy(true)
    setMessage("")
    try {
      const response = await fetch("/api/operations/reports/export", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ reportKey, preset, startDate, endDate }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({ message: "Export failed." }))
        setMessage(body.message || "Export failed.")
        return
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = response.headers.get("content-disposition")?.split("filename=")?.[1]?.replace(/"/g, "") || "export.csv"
      link.click()
      URL.revokeObjectURL(url)
      setMessage("Export downloaded.")
    } catch {
      setMessage("Export failed.")
    } finally {
      setBusy(false)
    }
  }
  return <div>
    <button type="button" onClick={exportCsv} disabled={busy}>Download CSV</button>
    {message && <p role="status">{message}</p>}
  </div>
}

export function SavedFilterForm({ module, filters }: { module: string; filters: Array<{ id: string; name: string; version: number; filter: Record<string, unknown> }> }) {
  const [message, setMessage] = useState("")
  async function send(operation: string, payload: Record<string, unknown>, version?: number) {
    setMessage("")
    const response = await fetch("/api/operations/reports/filters", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({ operation, payload, version }),
    })
    const body = await response.json().catch(() => ({ message: "Saved filter update failed." }))
    setMessage(body.message || "Saved filter updated.")
  }
  return <section className="panel">
    <h2>Saved filters</h2>
    <form onSubmit={event => {
      event.preventDefault()
      const data = new FormData(event.currentTarget)
      void send("create", { module, name: String(data.get("name") || ""), filter: { preset: String(data.get("preset") || "today") } })
    }}>
      <label>Name<input name="name" required maxLength={80} /></label>
      <label>Period preset
        <select name="preset" defaultValue="today">
          <option value="today">Today</option>
          <option value="last_7_days">Last 7 days</option>
          <option value="current_month">Current month</option>
        </select>
      </label>
      <button type="submit">Save filter</button>
    </form>
    {!filters.length ? <p className="muted">No saved filters for this module.</p> : <ul>{filters.map(item => (
      <li key={item.id}>
        {item.name}
        <button type="button" onClick={() => void send("delete", { id: item.id }, item.version)}>Delete</button>
      </li>
    ))}</ul>}
    {message && <p role="status">{message}</p>}
  </section>
}

export function PeriodForm({ preset, startDate, endDate }: { preset: string; startDate?: string | null; endDate?: string | null }) {
  return <form method="get" className="filters" aria-label="Report period">
    <label>Period
      <select name="preset" defaultValue={preset}>
        <option value="today">Today</option>
        <option value="last_7_days">Last 7 days</option>
        <option value="current_month">Current month</option>
        <option value="custom">Custom</option>
      </select>
    </label>
    <label>Start date<input type="date" name="start" defaultValue={startDate || ""} /></label>
    <label>End date<input type="date" name="end" defaultValue={endDate || ""} /></label>
    <button>Apply</button>
    <p className="muted">Europe/London calendar boundaries. Custom end date is inclusive as a local day and exclusive at the next midnight.</p>
  </form>
}
