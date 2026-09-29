"use client"
import { useRef, useState, type FormEvent } from "react"

async function post(path: string, operation: string, body: Record<string, unknown>, key: string) {
  const response = await fetch(path, {
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
  async function run(path: string, operation: string, body: Record<string, unknown>) {
    if (busy) return
    commandKey.current ||= crypto.randomUUID()
    setBusy(true)
    setMessage("")
    try {
      const result = await post(path, operation, body, commandKey.current)
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

export function CreatePriceForm() {
  const { busy, message, run } = useCommand()
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await run("/api/operations/catalogue", "create_price_version", {
      serviceCode: String(form.get("serviceCode") || ""),
      displayName: String(form.get("displayName") || ""),
      amountMinor: Number(form.get("amountMinor")),
      effectiveFrom: form.get("effectiveFrom") ? new Date(String(form.get("effectiveFrom"))).toISOString() : "",
      taxBehaviour: String(form.get("taxBehaviour") || "UNCONFIRMED"),
    })
  }
  return <form onSubmit={submit}>
    <label>Service
      <select name="serviceCode" required>
        <option value="GUIDED_RELAUNCH">Guided Relaunch</option>
        <option value="MANAGED_RELAUNCH">Managed Relaunch</option>
        <option value="GUIDED_REVIEW">Guided Review</option>
        <option value="MANAGED_REVIEW">Managed Review</option>
        <option value="RELAUNCH_GUARD">Relaunch Guard</option>
      </select>
    </label>
    <label>Display name<input name="displayName" required maxLength={120} /></label>
    <label>Amount (pence)<input name="amountMinor" type="number" min={0} step={1} required /></label>
    <label>Effective from<input name="effectiveFrom" type="datetime-local" required /></label>
    <label>Tax behaviour
      <select name="taxBehaviour" defaultValue="UNCONFIRMED">
        <option value="UNCONFIRMED">Unconfirmed</option>
        <option value="NOT_APPLICABLE">Not applicable</option>
        <option value="INCLUSIVE">Inclusive</option>
        <option value="EXCLUSIVE">Exclusive</option>
      </select>
    </label>
    <button type="submit" disabled={busy}>{busy ? "Saving…" : "Create draft price"}</button>
    {message && <p role="status">{message}</p>}
  </form>
}

export function ApprovePriceForm({ priceVersionId, version }: { priceVersionId: string; version: number }) {
  const { busy, message, run } = useCommand()
  return <form onSubmit={event => { event.preventDefault(); void run("/api/operations/catalogue", "approve_price_version", { priceVersionId, version }) }}>
    <button type="submit" disabled={busy}>{busy ? "Approving…" : "Approve price"}</button>
    {message && <p role="status">{message}</p>}
  </form>
}

export function RetirePriceForm({ priceVersionId, version }: { priceVersionId: string; version: number }) {
  const { busy, message, run } = useCommand()
  return <form onSubmit={event => { event.preventDefault(); void run("/api/operations/catalogue", "retire_price_version", { priceVersionId, version }) }}>
    <button type="submit" disabled={busy}>{busy ? "Retiring…" : "Retire price"}</button>
    {message && <p role="status">{message}</p>}
  </form>
}

export function CreateQuoteForm() {
  const { busy, message, run } = useCommand()
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await run("/api/operations/quotes", "create_draft", {
      serviceCode: String(form.get("serviceCode") || ""),
      customerId: String(form.get("customerId") || ""),
      businessId: String(form.get("businessId") || ""),
      caseId: String(form.get("caseId") || "") || undefined,
      locationId: String(form.get("locationId") || "") || undefined,
      monitoringRequestId: String(form.get("monitoringRequestId") || "") || undefined,
      priceVersionId: String(form.get("priceVersionId") || ""),
      scope: String(form.get("scope") || ""),
      exclusions: String(form.get("exclusions") || ""),
      validUntil: form.get("validUntil") ? new Date(String(form.get("validUntil"))).toISOString() : "",
      qualificationId: String(form.get("qualificationId") || "") || undefined,
      applyDiscount: form.get("applyDiscount") === "true",
    })
  }
  return <form onSubmit={submit}>
    <label>Service
      <select name="serviceCode" required>
        <option value="GUIDED_RELAUNCH">Guided Relaunch</option>
        <option value="MANAGED_RELAUNCH">Managed Relaunch</option>
        <option value="GUIDED_REVIEW">Guided Review</option>
        <option value="MANAGED_REVIEW">Managed Review</option>
        <option value="RELAUNCH_GUARD">Relaunch Guard</option>
      </select>
    </label>
    <label>Customer ID<input name="customerId" required maxLength={36} /></label>
    <label>Business ID<input name="businessId" required maxLength={36} /></label>
    <label>Case ID<input name="caseId" maxLength={36} /></label>
    <label>Location ID<input name="locationId" maxLength={36} /></label>
    <label>Monitoring request ID<input name="monitoringRequestId" maxLength={36} /></label>
    <label>Price version ID<input name="priceVersionId" required maxLength={36} /></label>
    <label>Scope<textarea name="scope" required minLength={10} maxLength={5000} rows={3} /></label>
    <label>Exclusions<textarea name="exclusions" required minLength={10} maxLength={5000} rows={3} /></label>
    <label>Valid until<input name="validUntil" type="datetime-local" required /></label>
    <label>Qualification snapshot ID<input name="qualificationId" maxLength={36} /></label>
    <label className="checkbox"><input type="checkbox" name="applyDiscount" value="true" />Apply recorded paid Guard discount</label>
    <button type="submit" disabled={busy}>{busy ? "Creating…" : "Create draft quote"}</button>
    {message && <p role="status">{message}</p>}
  </form>
}

export function RecordQualificationForm() {
  const { busy, message, run } = useCommand()
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await run("/api/operations/quotes", "record_qualification", {
      serviceCode: String(form.get("serviceCode") || ""),
      priceVersionId: String(form.get("priceVersionId") || ""),
      qualificationResult: String(form.get("qualificationResult") || "NOT_QUALIFIED"),
      coverageBasis: String(form.get("coverageBasis") || ""),
      coverageStatus: String(form.get("coverageStatus") || ""),
      coverageType: String(form.get("coverageType") || ""),
      paidVsIncluded: String(form.get("paidVsIncluded") || ""),
      issuePredatesPaidCoverage: form.get("issuePredatesPaidCoverage") === "false" ? "false" : "true",
      locationId: String(form.get("locationId") || "") || undefined,
      reasonCode: String(form.get("reasonCode") || "") || undefined,
      evidenceNotes: String(form.get("evidenceNotes") || "") || undefined,
    })
  }
  return <form onSubmit={submit}>
    <p className="muted">Do not infer paid coverage from a monitoring request or included period. Only record QUALIFIED when paid active coverage facts are proven.</p>
    <label>Service
      <select name="serviceCode" required>
        <option value="MANAGED_RELAUNCH">Managed Relaunch</option>
        <option value="MANAGED_REVIEW">Managed Review</option>
        <option value="GUIDED_RELAUNCH">Guided Relaunch</option>
        <option value="GUIDED_REVIEW">Guided Review</option>
        <option value="RELAUNCH_GUARD">Relaunch Guard</option>
      </select>
    </label>
    <label>Price version ID<input name="priceVersionId" required maxLength={36} /></label>
    <label>Location ID<input name="locationId" maxLength={36} /></label>
    <label>Result
      <select name="qualificationResult" defaultValue="NOT_QUALIFIED">
        <option value="NOT_QUALIFIED">Not qualified</option>
        <option value="QUALIFIED">Qualified paid Guard</option>
      </select>
    </label>
    <label>Coverage basis
      <select name="coverageBasis" defaultValue="NONE">
        <option value="NONE">None / unproven</option>
        <option value="PAID">Paid</option>
        <option value="INCLUDED_ONLY">Included only</option>
      </select>
    </label>
    <label>Coverage status
      <select name="coverageStatus" defaultValue="UNKNOWN">
        <option value="UNKNOWN">Unknown</option>
        <option value="ACTIVE">Active</option>
        <option value="INACTIVE">Inactive</option>
        <option value="PAUSED">Paused</option>
        <option value="EXPIRED">Expired</option>
      </select>
    </label>
    <label>Coverage type
      <select name="coverageType" defaultValue="NONE">
        <option value="NONE">None</option>
        <option value="PAID_GUARD">Paid Guard</option>
        <option value="INCLUDED_GUARD">Included Guard</option>
      </select>
    </label>
    <label>Paid vs included
      <select name="paidVsIncluded" defaultValue="UNPROVEN">
        <option value="UNPROVEN">Unproven</option>
        <option value="PAID">Paid</option>
        <option value="INCLUDED_ONLY">Included only</option>
      </select>
    </label>
    <label>Issue predates paid coverage
      <select name="issuePredatesPaidCoverage" defaultValue="true">
        <option value="true">Yes / unknown</option>
        <option value="false">No</option>
      </select>
    </label>
    <label>Reason code<input name="reasonCode" maxLength={80} /></label>
    <label>Evidence notes<textarea name="evidenceNotes" maxLength={2000} rows={2} /></label>
    <button type="submit" disabled={busy}>{busy ? "Recording…" : "Record qualification snapshot"}</button>
    {message && <p role="status">{message}</p>}
  </form>
}

export function QuoteActionForm({ operation, quoteId, version, quoteVersionId, label, extra }: {
  operation: string
  quoteId: string
  version: number
  quoteVersionId?: string
  label: string
  extra?: Record<string, unknown>
}) {
  const { busy, message, run } = useCommand()
  return <form onSubmit={event => { event.preventDefault(); void run("/api/operations/quotes", operation, { quoteId, version, quoteVersionId, ...extra }) }}>
    <button type="submit" disabled={busy}>{busy ? "Saving…" : label}</button>
    {message && <p role="status">{message}</p>}
  </form>
}

export function SetDraftTaxForm({ quoteId, version, quoteVersionId }: { quoteId: string; version: number; quoteVersionId: string }) {
  const { busy, message, run } = useCommand()
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await run("/api/operations/quotes", "set_draft_tax", {
      quoteId, version, quoteVersionId,
      taxBehaviour: String(form.get("taxBehaviour") || ""),
      taxRateBps: String(form.get("taxRateBps") || "") || undefined,
      taxJurisdiction: String(form.get("taxJurisdiction") || "") || undefined,
      taxCode: String(form.get("taxCode") || "") || undefined,
    })
  }
  return <form onSubmit={submit}>
    <label>Tax behaviour
      <select name="taxBehaviour" required>
        <option value="NOT_APPLICABLE">Not applicable</option>
        <option value="INCLUSIVE">Inclusive</option>
        <option value="EXCLUSIVE">Exclusive</option>
        <option value="UNCONFIRMED">Unconfirmed</option>
      </select>
    </label>
    <label>Tax rate (bps)<input name="taxRateBps" type="number" min={0} max={10000} /></label>
    <label>Jurisdiction<input name="taxJurisdiction" maxLength={2} /></label>
    <label>Tax code<input name="taxCode" maxLength={40} /></label>
    <button type="submit" disabled={busy}>{busy ? "Saving…" : "Set draft tax"}</button>
    {message && <p role="status">{message}</p>}
  </form>
}

export function CreateVersionForm({ quoteId, version }: { quoteId: string; version: number }) {
  const { busy, message, run } = useCommand()
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await run("/api/operations/quotes", "create_version", {
      quoteId, version,
      scope: String(form.get("scope") || "") || undefined,
      exclusions: String(form.get("exclusions") || "") || undefined,
      validUntil: form.get("validUntil") ? new Date(String(form.get("validUntil"))).toISOString() : undefined,
    })
  }
  return <form onSubmit={submit}>
    <label>Amended scope<textarea name="scope" minLength={10} maxLength={5000} rows={2} /></label>
    <label>Amended exclusions<textarea name="exclusions" minLength={10} maxLength={5000} rows={2} /></label>
    <label>Valid until<input name="validUntil" type="datetime-local" /></label>
    <button type="submit" disabled={busy}>{busy ? "Creating…" : "Create replacement version"}</button>
    {message && <p role="status">{message}</p>}
  </form>
}

export function OfferQuoteActionForm({ quoteId, expiresAt }: { quoteId: string; expiresAt?: string }) {
  const { busy, message, actionUrl, run } = useCommand()
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await run("/api/operations/quotes", "create_quote_acceptance_action", {
      quoteId,
      expiresAt: form.get("expiresAt") ? new Date(String(form.get("expiresAt"))).toISOString() : "",
    })
  }
  return <form onSubmit={submit}>
    <label>Action expires<input name="expiresAt" type="datetime-local" required defaultValue={expiresAt} /></label>
    <button type="submit" disabled={busy}>{busy ? "Creating…" : "Issue customer acceptance link"}</button>
    {message && <p role="status">{message}</p>}
    {actionUrl && <p><label>Customer link<input readOnly value={actionUrl} /></label></p>}
  </form>
}

export function RevokeQuoteActionForm({ quoteId, actionId }: { quoteId: string; actionId: string }) {
  const { busy, message, run } = useCommand()
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await run("/api/operations/quotes", "revoke_action", {
      quoteId, actionId, reason: String(form.get("reason") || ""),
    })
  }
  return <form onSubmit={submit}>
    <label>Reason<textarea name="reason" required minLength={10} maxLength={2000} rows={2} /></label>
    <button type="submit" disabled={busy}>{busy ? "Revoking…" : "Revoke open quote action"}</button>
    {message && <p role="status">{message}</p>}
  </form>
}
