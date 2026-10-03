"use client"
import { useRef, useState, type FormEvent } from "react"
import type { CommercialPriceChoice } from "@/lib/commercial-workspace/model"
import { isUuid } from "@/lib/records/model"

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

export function CaseQuoteForm({
  caseId, customerId, businessId, locationId, customerName, businessName, choice,
}: {
  caseId: string
  customerId: string
  businessId: string
  locationId: string | null
  customerName: string
  businessName: string
  choice: CommercialPriceChoice
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
    <p>Quoting <strong>{customerName}</strong> for <strong>{businessName}</strong>.</p>
    <p>{choice.serviceName} · {choice.amountLabel} · {choice.paymentLabel}. This is the current approved price. The server checks the case, the customer and the price again.</p>
    <label>Scope<textarea name="scope" required minLength={10} maxLength={5000} rows={3} /></label>
    <label>Exclusions<textarea name="exclusions" required minLength={10} maxLength={5000} rows={3} /></label>
    <label>Valid until<input name="validUntil" type="datetime-local" required /></label>
    <button type="submit" disabled={busy}>{busy ? "Creating…" : "Create draft quote"}</button>
    <p role="status">{message}</p>
  </form>
}
