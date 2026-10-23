"use client"
import { useRef, useState, type FormEvent } from "react"
import type { CommercialPriceChoice } from "@/lib/commercial-workspace/model"
import { isUuid } from "@/lib/records/model"
import { ScopeExclusionsFields } from "../../../commercial/scope-fields"

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
  const commandKey = useRef<string | null>(null)
  async function run(path: string, operation: string, body: Record<string, unknown>) {
    if (busy) return
    commandKey.current ||= crypto.randomUUID()
    setBusy(true)
    setMessage("")
    try {
      const result = await post(path, operation, body, commandKey.current)
      setMessage(result.message)
      if (result.ok && !result.actionUrl) window.location.reload()
      if (!result.ok) commandKey.current = null
    } catch {
      setMessage("We couldn’t save that. Reload the page and try again.")
      commandKey.current = null
    } finally {
      setBusy(false)
    }
  }
  return { busy, message, run }
}

function defaultQuoteExpiry(): string {
  const at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`
}

export function CaseQuoteForm({
  caseId, customerId, businessId, locationId, customerName, businessName, choice, submitLabel = "Create draft quote", compact = false,
}: {
  caseId: string
  customerId: string
  businessId: string
  locationId: string | null
  customerName: string
  businessName: string
  choice: CommercialPriceChoice
  submitLabel?: string
  compact?: boolean
}) {
  const { busy, message, run } = useCommand()
  if (!isUuid(caseId) || !isUuid(customerId) || !isUuid(businessId) || !isUuid(choice.id)) {
    return <p role="status">This case has no usable customer and business relationship, so a quote cannot be drafted from here.</p>
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    // A normal draft. Guard discount qualification stays on Commercial;
    // this form does not send a qualification snapshot or applyDiscount.
    await run("/api/operations/quotes", "create_draft", {
      serviceCode: choice.serviceCode,
      customerId,
      businessId,
      caseId,
      locationId: locationId && isUuid(locationId) ? locationId : undefined,
      priceVersionId: choice.id,
      scope: String(form.get("scope") || ""),
      exclusions: String(form.get("exclusions") || ""),
      validUntil: form.get("validUntil") ? new Date(String(form.get("validUntil"))).toISOString() : "",
    })
  }
  return <form onSubmit={submit}>
    {compact ? <p>{choice.serviceName} · {choice.amountLabel}. The approved service wording is already filled in.</p> : <>
      <p>Quoting <strong>{customerName}</strong> for <strong>{businessName}</strong>.</p>
      <p>{choice.serviceName} · {choice.amountLabel} · {choice.paymentLabel}. This is the current approved price. The server checks the case, the customer and the price again.</p>
    </>}
    {compact ? <details>
      <summary>Review Service Details</summary>
      <ScopeExclusionsFields serviceCode={choice.serviceCode} compact />
    </details> : <ScopeExclusionsFields serviceCode={choice.serviceCode} />}
    <label>Quote expiry<input name="validUntil" type="datetime-local" required defaultValue={compact ? defaultQuoteExpiry() : undefined} /></label>
    <button type="submit" disabled={busy}>{busy ? "Creating…" : submitLabel}</button>
    <p role="status">{message}</p>
  </form>
}
