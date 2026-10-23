"use client"
import { useRef, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { isUuid } from "@/lib/records/model"
import { LOST_QUOTE_LINK_NOTE } from "@/lib/commerce/model"
import { customerPriceBoundary, customerPriceLine } from "../../../../lib/pricing"
import { ScopeExclusionsFields } from "./scope-fields"
import { localDateTime, quoteActionExpiryWindow } from "@/lib/commerce/action-expiry"
import { renderQuotationOffer } from "../../../../lib/email/quotation-offer"
import { approvedInclusiveRateBps } from "@/lib/commerce/validation"

function futureLocalMin(minutes = 5) {
  const at = new Date(Date.now() + minutes * 60 * 1000)
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`
}

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
  return { busy, message, actionUrl, run, setMessage }
}

export function CreatePriceForm() {
  const { busy, message, run, setMessage } = useCommand()
  const minFrom = futureLocalMin(5)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const effectiveFrom = form.get("effectiveFrom") ? new Date(String(form.get("effectiveFrom"))).toISOString() : ""
    if (!effectiveFrom || Date.parse(effectiveFrom) <= Date.now()) {
      setMessage("Choose a future effective date. Approval will not rewrite it.")
      return
    }
    await run("/api/operations/catalogue", "create_price_version", {
      serviceCode: String(form.get("serviceCode") || ""),
      displayName: String(form.get("displayName") || ""),
      amountMinor: Number(form.get("amountMinor")),
      effectiveFrom,
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
    <label>Effective from<input name="effectiveFrom" type="datetime-local" required min={minFrom} suppressHydrationWarning /></label>
    <p className="muted">Must be in the future. Approval keeps this timestamp and does not rewrite it.</p>
    <label>Internal tax record
      <select name="taxBehaviour" defaultValue="UNCONFIRMED">
        <option value="UNCONFIRMED">Unconfirmed</option>
        <option value="NOT_APPLICABLE">Not applicable</option>
        <option value="INCLUSIVE">Inclusive</option>
        <option value="EXCLUSIVE">Exclusive</option>
      </select>
    </label>
    <p className="muted">This is the catalogue record. A quote for one of the five published services cannot use Exclusive, because that would charge more than the published price.</p>
    <button type="submit" disabled={busy}>{busy ? "Saving…" : "Create draft price"}</button>
    {message && <p role="status">{message}</p>}
  </form>
}

export function ApprovePriceForm({ priceVersionId, version }: { priceVersionId: string; version: number }) {
  const { busy, message, run } = useCommand()
  return <form onSubmit={event => { event.preventDefault(); void run("/api/operations/catalogue", "approve_price_version", { priceVersionId, version }) }}>
    <p className="muted">Approval is allowed only when effective from is still in the future. The date is not rewritten.</p>
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
  const [serviceCode, setServiceCode] = useState("GUIDED_RELAUNCH")
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
      <select name="serviceCode" required value={serviceCode} onChange={event => setServiceCode(event.target.value)}>
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
    <p className="muted">Use the current approved price for this service. A future or retired version cannot be quoted yet.</p>
    <ScopeExclusionsFields serviceCode={serviceCode} />
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
      coverageId: String(form.get("coverageId") || "") || undefined,
      coverageBasis: String(form.get("coverageBasis") || ""),
      coverageStatus: String(form.get("coverageStatus") || ""),
      coverageType: String(form.get("coverageType") || ""),
      paidVsIncluded: String(form.get("paidVsIncluded") || ""),
      issuePredatesPaidCoverage: form.get("issuePredatesPaidCoverage") === "false" ? "false" : "true",
      locationId: String(form.get("locationId") || "") || undefined,
      issueObservedAt: form.get("issueObservedAt") ? new Date(String(form.get("issueObservedAt"))).toISOString() : undefined,
      reasonCode: String(form.get("reasonCode") || "") || undefined,
      evidenceNotes: String(form.get("evidenceNotes") || "") || undefined,
    })
  }
  return <form onSubmit={submit}>
    <p className="muted">Do not infer paid coverage from a monitoring request, an included period, or an Admin label. A qualified snapshot has to name the exact active Direct Guard coverage. The database checks the coverage and the billing facts.</p>
    <label>Guard coverage ID<input name="coverageId" maxLength={36} /></label>
    <p className="muted">Required for QUALIFIED. Included, paused, ending, ended, or unpaid Direct Guard cannot qualify.</p>
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
    <p className="muted">The snapshot is pinned to this price version. It cannot be applied to a different current price later.</p>
    <label>Location ID<input name="locationId" maxLength={36} /></label>
    <label>Issue observed at<input name="issueObservedAt" type="datetime-local" /></label>
    <p className="muted">Required for QUALIFIED. The issue must be at or after Guard activation on this exact location.</p>
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
    <button type="submit" className={operation === "cancel" ? "danger" : undefined} disabled={busy}>{busy ? "Saving…" : label}</button>
    {message && <p role="status">{message}</p>}
  </form>
}

export function ConfirmPricingForm({ quoteId, version, quoteVersionId }: { quoteId: string; version: number; quoteVersionId: string }) {
  const { busy, message, run } = useCommand()
  return <form onSubmit={event => {
    event.preventDefault()
    void run("/api/operations/quotes", "set_draft_tax", { quoteId, version, quoteVersionId, taxBehaviour: "NOT_APPLICABLE" })
  }}>
    <button type="submit" disabled={busy}>{busy ? "Saving…" : "Confirm Pricing"}</button>
    {message && <p role="status">{message}</p>}
  </form>
}

export function SetDraftTaxForm({ quoteId, version, quoteVersionId }: { quoteId: string; version: number; quoteVersionId: string }) {
  const { busy, message, run, setMessage } = useCommand()
  const [behaviour, setBehaviour] = useState("NOT_APPLICABLE")
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const taxBehaviour = String(form.get("taxBehaviour") || "")
    if (taxBehaviour === "EXCLUSIVE") {
      setMessage("A published quotation cannot add tax on top of the customer price.")
      return
    }
    const percent = String(form.get("taxPercent") || "")
    const taxRateBps = taxBehaviour === "INCLUSIVE" ? approvedInclusiveRateBps(percent) : null
    if (taxBehaviour === "INCLUSIVE" && taxRateBps === null) {
      setMessage("Enter the approved tax percentage before saving. The customer total stays the advertised price.")
      return
    }
    const jurisdiction = String(form.get("taxJurisdiction") || "").trim().toUpperCase()
    const taxCode = String(form.get("taxCode") || "").trim()
    if (taxBehaviour === "INCLUSIVE" && jurisdiction && !/^[A-Z]{2}$/.test(jurisdiction)) {
      setMessage("Enter the approved two-letter tax jurisdiction, or leave it blank.")
      return
    }
    await run("/api/operations/quotes", "set_draft_tax", {
      quoteId, version, quoteVersionId, taxBehaviour,
      ...(taxRateBps === null ? {} : { taxRateBps }),
      ...(jurisdiction ? { taxJurisdiction: jurisdiction } : {}),
      ...(taxCode ? { taxCode } : {}),
    })
  }
  return <form onSubmit={submit}>
    <p className="muted">{customerPriceLine} {customerPriceBoundary} This does not add tax to the advertised customer price.</p>
    <label>Tax treatment
      <select name="taxBehaviour" value={behaviour} onChange={event => setBehaviour(event.target.value)}>
        <option value="NOT_APPLICABLE">VAT not charged</option>
        <option value="INCLUSIVE">Approved tax included in the customer price</option>
      </select>
    </label>
    {behaviour === "INCLUSIVE" && <label>Approved tax percentage
      <input name="taxPercent" inputMode="decimal" autoComplete="off" placeholder="20" />
    </label>}
    <details>
      <summary>Additional tax details</summary>
      <label>Jurisdiction, when the approved decision names one
        <input name="taxJurisdiction" maxLength={2} autoComplete="off" />
      </label>
      <label>Tax code, when the approved decision names one
        <input name="taxCode" maxLength={40} autoComplete="off" />
      </label>
    </details>
    <button type="submit" disabled={busy}>{busy ? "Saving…" : "Save reviewed tax treatment"}</button>
    {message && <p role="alert">{message}</p>}
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

const previewActionUrl = "https://customer.example/action/00000000-0000-4000-8000-000000000001"

function previewHtmlDocument(html: string): string {
  return html.split(previewActionUrl).join("#").split("<script").join("").split("</script").join("")
}

function emailOutcome(ok: boolean, deliveryStatus: string | undefined): string {
  if (!ok) return "Needs attention"
  if (deliveryStatus === "DELIVERED") return "Delivered"
  if (deliveryStatus === "PROVIDER_ACCEPTED") return "Submitted to email provider"
  return "Queued"
}

type HeldQuotationEmail = {
  id: string
  kind: "process" | "attention" | "submitted" | "delivered"
  message: string
}

/** A queued row is kept. Another queue is not how that row is processed. */
function holdQueuedEmail(status: number, result: {
  id?: unknown
  lifecycle?: unknown
  deliveryStatus?: unknown
  message?: unknown
}): HeldQuotationEmail | null {
  if (status < 400 || !isUuid(result.id)) return null
  const message = typeof result.message === "string" && result.message
    ? result.message
    : "The quotation email is queued. It was not created again."
  if (result.deliveryStatus === "DELIVERED") return { id: result.id, kind: "delivered", message }
  if (result.deliveryStatus === "PROVIDER_ACCEPTED") return { id: result.id, kind: "submitted", message }
  if (result.deliveryStatus === "ACCEPTANCE_UNKNOWN" || /unknown/i.test(message)) {
    return { id: result.id, kind: "attention", message }
  }
  if (result.lifecycle === "QUEUED" && (result.deliveryStatus === "NONE" || result.deliveryStatus == null) && (status === 403 || status === 503)) {
    const kept = /already open/i.test(message)
      ? "A quotation email is already queued. It was not created again. Process that pending email from this step. Queued is not delivered."
      : message
    return { id: result.id, kind: "process", message: kept }
  }
  return { id: result.id, kind: "attention", message }
}

export function ProcessPendingQuotationEmail({ communicationId }: { communicationId: string }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [done, setDone] = useState<"idle" | "attention" | "submitted">("idle")
  const commandKey = useRef<string | null>(null)
  async function submit() {
    if (busy || done !== "idle") return
    commandKey.current ||= crypto.randomUUID()
    setBusy(true)
    try {
      const response = await fetch("/api/operations/dev-send-email", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": commandKey.current },
        body: JSON.stringify({ communicationId, confirmed: true }),
      })
      const result = await response.json() as { message?: string }
      const text = result.message || "The queued quotation email could not be confirmed."
      if (response.status === 403 && /sign in/i.test(text)) {
        setMessage(`${text} Return to this step after signing in. The queued quotation email is already saved.`)
        return
      }
      if (!response.ok) {
        setDone("attention")
        setMessage(/unknown/i.test(text)
          ? "Provider acceptance is unknown. The email was not sent again."
          : text)
        return
      }
      setDone("submitted")
      setMessage("Accepted by the provider is not delivered.")
    } catch {
      setDone("attention")
      setMessage("The queued quotation email could not be confirmed. It was not created again.")
    } finally {
      setBusy(false)
    }
  }
  if (done === "submitted") {
    return <p role="status"><strong>Quotation submitted to email provider</strong> {message}</p>
  }
  if (done === "attention") {
    return <p role="status"><strong>Email needs attention</strong> {message}</p>
  }
  return <div data-quotation-email="pending">
    <p>This processes the quotation email that is already queued. It does not create another email or another acceptance link.</p>
    <button type="button" onClick={submit} disabled={busy}>{busy ? "Processing…" : "Process Pending Quotation Email"}</button>
    {message && <p role="status">{message}</p>}
  </div>
}

export function SendQuotationForm({
  quoteId, publicRef, caseReference, serviceName, amountMinor, currency, paymentModel, scope, exclusions, validUntil,
}: {
  quoteId: string
  publicRef: string
  caseReference: string | null
  serviceName: string
  amountMinor: number
  currency: string
  paymentModel: string
  scope: string
  exclusions: string
  validUntil: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [editing, setEditing] = useState(false)
  const [subject, setSubject] = useState("")
  const [introduction, setIntroduction] = useState("")
  const [held, setHeld] = useState<HeldQuotationEmail | null>(null)
  const commandKey = useRef<string | null>(null)
  const preview = renderQuotationOffer({
    publicRef,
    caseRef: caseReference,
    serviceName,
    amountMinor,
    currency,
    paymentModel,
    scope,
    exclusions,
    validUntil,
    actionUrl: previewActionUrl,
    subject: editing && subject.trim() ? subject : undefined,
    introduction: editing && introduction.trim() ? introduction : undefined,
  })
  const previewHtml = preview ? previewHtmlDocument(preview.html) : ""
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    if (!preview) {
      setMessage("Check the subject and introduction. The quotation wording itself stays on the server.")
      return
    }
    commandKey.current ||= crypto.randomUUID()
    setBusy(true)
    setMessage("")
    try {
      const response = await fetch("/api/operations/quotes", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": commandKey.current },
        body: JSON.stringify({
          operation: "queue_quote_offer_email",
          quoteId,
          subject: editing && subject.trim() ? subject.trim() : undefined,
          introduction: editing && introduction.trim() ? introduction.trim() : undefined,
        }),
      })
      const result = await response.json() as { message?: string; deliveryStatus?: string; id?: string; lifecycle?: string }
      const recovered = holdQueuedEmail(response.status, result)
      if (recovered) {
        setHeld(recovered)
        setMessage(recovered.message)
        router.refresh()
        return
      }
      const outcome = emailOutcome(response.ok, result.deliveryStatus)
      setMessage(`${outcome}. ${result.message || "The quotation email could not be confirmed."}`)
      if (!response.ok) commandKey.current = null
    } catch {
      setMessage("We couldn’t save that. Reload the page and try again.")
      commandKey.current = null
    } finally {
      setBusy(false)
    }
  }
  return <form onSubmit={submit} data-quotation-email="preview">
    <h3>Send Quotation Email</h3>
    <p>Review the email, then send it. Sending does not mean the customer has accepted.</p>
    {preview ? <>
      <p><strong>Subject:</strong> {preview.subject}</p>
      <div className="email-preview">
        <iframe className="email-preview-frame email-preview-frame-branded" title="Quotation email" sandbox="" srcDoc={previewHtml} />
      </div>
    </> : <p role="alert">This quotation cannot be shown as an email yet. Check the subject and introduction.</p>}
    {editing ? <>
      <label>Subject
        <input name="subject" value={subject} maxLength={200} onChange={event => setSubject(event.target.value)} />
      </label>
      <label>Introduction
        <textarea name="introduction" value={introduction} maxLength={4000} rows={4} onChange={event => setIntroduction(event.target.value)} />
      </label>
      <p>Only the subject and introduction can be edited.</p>
    </> : <p><button type="button" onClick={() => setEditing(true)}>Edit</button></p>}
    {held?.kind === "process" && <ProcessPendingQuotationEmail communicationId={held.id} />}
    {held?.kind === "submitted" && <p><strong>Quotation submitted to email provider</strong></p>}
    {held?.kind === "delivered" && <p><strong>Quotation delivered</strong></p>}
    {held?.kind === "attention" && <p><strong>Email needs attention</strong> The quotation email was not sent again.</p>}
    {!held && <button type="submit" disabled={busy || !preview}>{busy ? "Sending…" : "Send Quotation Email"}</button>}
    {message && <p role="status">{message}</p>}
  </form>
}

export function OfferQuoteActionForm({
  quoteId, expiresAt, quoteValidUntil, submitLabel = "Issue customer acceptance link",
}: { quoteId: string; expiresAt?: string; quoteValidUntil?: string; submitLabel?: string }) {
  const { busy, message, actionUrl, run, setMessage } = useCommand()
  const window = quoteActionExpiryWindow(quoteValidUntil)
  const original = expiresAt ? Date.parse(expiresAt) : NaN
  const initial = Number.isFinite(original) && original >= window.earliest && original <= window.latest
    ? original : window.suggested
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const chosen = String(form.get("expiresAt") ?? "")
    const timestamp = Date.parse(chosen)
    const currentWindow = quoteActionExpiryWindow(quoteValidUntil)
    if (!currentWindow.ready || !Number.isFinite(timestamp)
      || timestamp <= currentWindow.earliest || timestamp > currentWindow.latest) {
      setMessage("Choose a link expiry after the next 15 minutes, within seven days, and no later than this quotation expires.")
      return
    }
    await run("/api/operations/quotes", "create_quote_acceptance_action", {
      quoteId, expiresAt: new Date(timestamp).toISOString(),
    })
  }
  return <form onSubmit={submit}>
    <label>Action expires
      <input name="expiresAt" type="datetime-local" required
        defaultValue={localDateTime(initial)}
        min={localDateTime(window.earliest)}
        max={localDateTime(window.latest)}
        disabled={!window.ready || busy}
        suppressHydrationWarning />
    </label>
    <p className="muted">The link must expire before the quotation expires, and within seven days. The suggested time is one day from now.</p>
    {!window.ready && <p role="alert">This quote expires too soon to issue a secure acceptance link. Review the quotation validity first.</p>}
    <button type="submit" disabled={busy || !window.ready}>{busy ? "Creating…" : submitLabel}</button>
    {message && <p role="status">{message}</p>}
    {actionUrl && <p role="status">This is a one-time customer link. Copy it now. It cannot be shown again. {LOST_QUOTE_LINK_NOTE}<label>Customer link<input readOnly value={actionUrl} /></label></p>}
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
    <button type="submit" className="danger" disabled={busy}>{busy ? "Revoking…" : "Revoke open quote action"}</button>
    {message && <p role="status">{message}</p>}
  </form>
}
