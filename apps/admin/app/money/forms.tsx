"use client"
import { useRef, useState, type FormEvent } from "react"
import { LOST_PAYMENT_LINK_NOTE } from "@/lib/payments/model"
import { ADMIN_RECENT_SIGN_IN_MESSAGE } from "@/lib/admin/reauth-copy"

function futureLocalMin(minutes = 5) {
  const at = new Date(Date.now() + minutes * 60 * 1000)
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`
}

async function post(operation: string, body: Record<string, unknown>, key: string) {
  const response = await fetch("/api/operations/payments", {
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

export function IssuePaymentActionForm({
  serviceOrderId, version, operation, label, obligationId,
}: { serviceOrderId: string; version: number; operation: "issue_guided_payment_action" | "issue_managed_setup_action" | "issue_recovery_action" | "issue_invoice_fallback"; label: string; obligationId?: string | null }) {
  const { busy, message, actionUrl, run } = useCommand()
  const minFrom = futureLocalMin(5)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const expiresAt = form.get("expiresAt") ? new Date(String(form.get("expiresAt"))).toISOString() : ""
    await run(operation, {
      serviceOrderId,
      version,
      expiresAt,
      obligationId: form.get("obligationId") || undefined,
    })
  }
  return <form onSubmit={submit}>
    {obligationId && <input type="hidden" name="obligationId" value={obligationId} />}
    <label>Expires<input name="expiresAt" type="datetime-local" required min={minFrom} suppressHydrationWarning /></label>
    {operation === "issue_invoice_fallback" && label === "Issue success-fee invoice" && <p>This issues the success-fee invoice. It is due within 14 days. The customer opens it from the signed-in portal. In a development workspace the invoice is test mode. This does not email a bearer secret, mark the obligation paid, or charge a card. {ADMIN_RECENT_SIGN_IN_MESSAGE}</p>}
    {operation === "issue_invoice_fallback" && label !== "Issue success-fee invoice" && <p>This creates a TEST-MODE hosted payment fallback. It does not mark the obligation paid. The customer opens it from the signed-in portal. {ADMIN_RECENT_SIGN_IN_MESSAGE}</p>}
    <button type="submit" disabled={busy}>{label}</button>
    <p role="status">{message}{actionUrl && operation !== "issue_invoice_fallback" ? ` This is a one-time customer link. Copy it now. It cannot be shown again. ${LOST_PAYMENT_LINK_NOTE}` : ""}</p>
    {actionUrl && operation !== "issue_invoice_fallback" && <p><label>Customer link<input readOnly value={actionUrl} /></label></p>}
  </form>
}

export function ApproveSuccessFeeForm({
  serviceOrderId, version, evidence,
}: { serviceOrderId: string; version: number; evidence?: Array<{ id: string; filename: string; versionNumber: number }> }) {
  const { busy, message, run } = useCommand()
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await run("approve_success_fee", {
      serviceOrderId,
      version,
      outcomeEvidenceVersionId: String(form.get("outcomeEvidenceVersionId") || ""),
      evidenceNote: String(form.get("evidenceNote") || ""),
      approvalReason: String(form.get("approvalReason") || ""),
    })
  }
  return <form onSubmit={submit}>
    <p>{ADMIN_RECENT_SIGN_IN_MESSAGE} The amount is the immutable accepted order total. This page does not charge a card. Select accepted case evidence for the same case.</p>
    <label>Accepted outcome evidence
      <select name="outcomeEvidenceVersionId" required>
        <option value="">Select accepted evidence</option>
        {(evidence ?? []).map(item => <option key={item.id} value={item.id}>{item.filename} · v{item.versionNumber}</option>)}
      </select>
    </label>
    <label>Evidence note<textarea name="evidenceNote" required minLength={10} maxLength={2000} /></label>
    <label>Approval reason<textarea name="approvalReason" required minLength={10} maxLength={2000} /></label>
    <button type="submit" disabled={busy}>Approve success fee</button>
    <p role="status">{message}</p>
  </form>
}

type AcceptedEvidence = { id: string; filename: string; versionNumber: number }
type SuccessCheck = { id: string; finding: string; qualifying: boolean; invalidated: boolean }

function evidenceOptions(evidence: AcceptedEvidence[]) {
  return <>
    <option value="">Select accepted evidence</option>
    {evidence.map(item => <option key={item.id} value={item.id}>{item.filename} · v{item.versionNumber}</option>)}
  </>
}

async function postCheck(body: Record<string, unknown>, key: string) {
  const response = await fetch("/api/cases/journey/success-observation", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": key },
    body: JSON.stringify(body),
  })
  const result = await response.json() as { message?: string }
  return { ok: response.ok, message: result.message || "" }
}

export function RecordSuccessBaselineForm({ serviceOrderId, evidence }: { serviceOrderId: string; evidence: AcceptedEvidence[] }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const commandKey = useRef<string | null>(null)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    commandKey.current ||= crypto.randomUUID()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setMessage("")
    try {
      const result = await postCheck({
        action: "baseline",
        serviceOrderId,
        evidenceVersionId: String(form.get("evidenceVersionId") || ""),
      }, commandKey.current)
      setMessage(result.message)
      if (result.ok) window.location.reload()
      else commandKey.current = null
    } catch {
      setMessage("We couldn’t save the contracted target. Reload the page and try again.")
      commandKey.current = null
    } finally {
      setBusy(false)
    }
  }
  return <form onSubmit={submit}>
    <p>Freeze the profile or review already saved on this case. The address is copied from the case. You do not type a different one. Choose accepted evidence that identifies that exact target. This does not approve a fee, create an invoice, or charge a card. {ADMIN_RECENT_SIGN_IN_MESSAGE}</p>
    <label>Evidence that identifies the contracted target
      <select name="evidenceVersionId" required>{evidenceOptions(evidence)}</select>
    </label>
    <button type="submit" disabled={busy}>Record the contracted target</button>
    <p role="status">{message}</p>
  </form>
}

export function RecordSuccessObservationForm({
  serviceOrderId,
  baseline,
  evidence,
  checks,
}: {
  serviceOrderId: string
  baseline: { targetRef: string; restrictionRef: string }
  evidence: AcceptedEvidence[]
  checks: SuccessCheck[]
}) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const commandKey = useRef<string | null>(null)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    commandKey.current ||= crypto.randomUUID()
    const form = new FormData(event.currentTarget)
    const historicException = form.get("historicException") === "on"
    setBusy(true)
    setMessage("")
    try {
      const result = await postCheck({
        action: "observation",
        serviceOrderId,
        evidenceVersionId: String(form.get("evidenceVersionId") || ""),
        finding: String(form.get("finding") || ""),
        reviewVisibility: String(form.get("reviewVisibility") || ""),
        sourceAccess: String(form.get("sourceAccess") || ""),
        observerRef: String(form.get("observerRef") || ""),
        note: String(form.get("note") || ""),
        historicException,
        historicReason: historicException ? String(form.get("historicReason") || "") : "",
      }, commandKey.current)
      setMessage(result.message)
      if (result.ok) window.location.reload()
      else commandKey.current = null
    } catch {
      setMessage("We couldn’t save that check. Reload the page and try again.")
      commandKey.current = null
    } finally {
      setBusy(false)
    }
  }
  return <form onSubmit={submit}>
    <p>Record one check of the contracted target below. A live check is timed when you save it. Two trustworthy absent checks, at least 48 hours apart, are required before the success fee can be approved. This does not approve the fee, create an invoice, or charge a card. {ADMIN_RECENT_SIGN_IN_MESSAGE}</p>
    <p>Contracted target: {baseline.targetRef}</p>
    <p>Original issue: {baseline.restrictionRef}</p>
    {checks.length > 0 && <ul>
      {checks.map((check, index) => <li key={check.id}>Check {index + 1}: {check.finding}.{check.invalidated ? " Withdrawn from the qualifying pair." : check.qualifying ? " Counted on its evidence time." : " Not counted until the evidence and time qualify."}</li>)}
    </ul>}
    <label>Accepted evidence for this check only
      <select name="evidenceVersionId" required>{evidenceOptions(evidence)}</select>
    </label>
    <label>Finding
      <select name="finding" required defaultValue="">
        <option value="" disabled>Choose what this check found</option>
        <option value="ABSENT">Absent — the original issue was not seen</option>
        <option value="PRESENT">Present — the original issue was still seen</option>
        <option value="RECURRENCE">Recurrence — the original issue returned</option>
        <option value="AMBIGUOUS">Ambiguous — the check was not conclusive</option>
        <option value="UNRELATED">Unrelated — a different incident was seen</option>
      </select>
    </label>
    <label>What was shown
      <select name="reviewVisibility" required defaultValue="">
        <option value="">Choose what was shown</option>
        <option value="NOT_APPLICABLE">Profile check — not a review</option>
        <option value="NOT_SHOWN">The identified review was not shown</option>
        <option value="VISIBLE">The identified review was shown</option>
      </select>
    </label>
    <label>Source
      <select name="sourceAccess" required defaultValue="">
        <option value="">Choose whether the source could be opened</option>
        <option value="ACCESSIBLE">The profile or review source could be opened</option>
        <option value="INACCESSIBLE">The source could not be opened</option>
      </select>
    </label>
    <label>Observer reference<input name="observerRef" required minLength={8} maxLength={200} /></label>
    <label>Note<textarea name="note" required minLength={10} maxLength={2000} /></label>
    <label className="checkbox"><input name="historicException" type="checkbox" />This check uses older accepted evidence. Its upload time is the check time. A typed date is not used.</label>
    <label>Why this older evidence is the check<textarea name="historicReason" minLength={20} maxLength={2000} /></label>
    <button type="submit" disabled={busy}>Record success check</button>
    <p role="status">{message}</p>
  </form>
}

export function WithdrawSuccessCheckForm({ check }: { check: SuccessCheck }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const commandKey = useRef<string | null>(null)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    commandKey.current ||= crypto.randomUUID()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setMessage("")
    try {
      const result = await postCheck({
        action: "invalidate",
        observationId: check.id,
        reason: String(form.get("reason") || ""),
      }, commandKey.current)
      setMessage(result.message)
      if (result.ok) window.location.reload()
      else commandKey.current = null
    } catch {
      setMessage("We couldn’t withdraw that check. Reload the page and try again.")
      commandKey.current = null
    } finally {
      setBusy(false)
    }
  }
  if (check.invalidated) return null
  return <form onSubmit={submit}>
    <p>Withdraw check {check.finding.toLowerCase()} from the qualifying pair. The original record stays. This does not delete it or charge a card.</p>
    <label>Reason<textarea name="reason" required minLength={20} maxLength={2000} /></label>
    <button type="submit" disabled={busy}>Withdraw this check</button>
    <p role="status">{message}</p>
  </form>
}

export function PauseSuccessFeeForm({
  serviceOrderId,
  collectionPause,
}: {
  serviceOrderId: string
  collectionPause: "OPEN" | "UPHELD" | "NOT_UPHELD" | null
}) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const commandKey = useRef<string | null>(null)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    commandKey.current ||= crypto.randomUUID()
    const form = new FormData(event.currentTarget)
    const disputeAction = collectionPause === "OPEN" ? "resolve" : "open"
    setBusy(true)
    setMessage("")
    try {
      const result = await postCheck({
        action: "dispute",
        disputeAction,
        serviceOrderId,
        reason: String(form.get("reason") || ""),
        resolution: String(form.get("resolution") || ""),
        outcome: String(form.get("outcome") || ""),
      }, commandKey.current)
      setMessage(result.message)
      if (result.ok) window.location.reload()
      else commandKey.current = null
    } catch {
      setMessage("We couldn’t record that dispute. Reload the page and try again.")
      commandKey.current = null
    } finally {
      setBusy(false)
    }
  }
  if (collectionPause === "UPHELD") {
    return <p>The dispute was upheld. This success fee stays not payable. No card is charged.</p>
  }
  return <form onSubmit={submit}>
    {collectionPause === "OPEN"
      ? <>
        <p>Collection is paused. Decide the written dispute before a new invoice can be issued. An invoice that was already issued is not cancelled here, and no card is charged.</p>
        <label>Decision
          <select name="outcome" required defaultValue="">
            <option value="">Choose the decision</option>
            <option value="UPHELD">Upheld — the fee is not payable</option>
            <option value="NOT_UPHELD">Not upheld — the fee can still be invoiced</option>
          </select>
        </label>
        <label>Resolution<textarea name="resolution" required minLength={20} maxLength={2000} /></label>
        <button type="submit" disabled={busy}>Record the dispute decision</button>
      </>
      : <>
        <p>Pause collection when the customer disputes the outcome in writing. This does not create an invoice, cancel one that was already issued, or charge a card. {ADMIN_RECENT_SIGN_IN_MESSAGE}</p>
        <label>Customer’s dispute<textarea name="reason" required minLength={20} maxLength={2000} /></label>
        <button type="submit" disabled={busy}>Pause collection</button>
      </>}
    <p role="status">{message}</p>
  </form>
}
