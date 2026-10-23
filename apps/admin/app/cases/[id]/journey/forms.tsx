"use client"
import { useRef, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { emailReadiness, screeningContradictsRecord, screeningFieldDefaults, type JourneyIntakeBrief } from "@/lib/case-journey/intake"

function postDecision(key: string, body: unknown) {
  return fetch("/api/cases/journey", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": key },
    body: JSON.stringify(body),
  })
}

function useDecision() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [message, setMessage] = useState("")
  const key = useRef<string | null>(null)
  async function send(body: unknown) {
    if (busy || done || uncertain) return
    key.current ||= crypto.randomUUID()
    setBusy(true)
    setMessage("")
    try {
      const response = await postDecision(key.current, body)
      const result = await response.json() as { message?: string }
      setMessage(result.message || "Unable to confirm the change.")
      if (response.ok) {
        setDone(true)
        router.refresh()
      } else if (response.status >= 500 || response.status === 409) setUncertain(true)
      else key.current = null
    } catch {
      setMessage("Uncertain result. Reload before trying again.")
      setUncertain(true)
    } finally {
      setBusy(false)
    }
  }
  return { busy, done, uncertain, message, send }
}

function safeLink(value: string) {
  if (!/^https?:\/\//i.test(value)) return value
  return <a href={value} target="_blank" rel="noopener noreferrer">{value} (new tab)</a>
}

function ConflictNotice({ brief }: { brief: JourneyIntakeBrief }) {
  const notes = [...brief.conflicts]
  if (brief.emailControl === "records_disagree") notes.push("The email-control records do not agree.")
  if (brief.authority === "records_disagree") notes.push("The business-authority records do not agree.")
  if (brief.authority === "revoked") notes.push("Business authority was revoked. This screening cannot restore it.")
  if (notes.length === 0) return null
  const submitted = brief.snapshot
  const joined = brief.conflicts.join(" ")
  const rows = submitted ? [
    joined.includes("business name") ? ["Business", submitted.businessName || "Not submitted", brief.businessName || "Not recorded"] : null,
    joined.includes("country") ? ["Country", submitted.country || "Not submitted", brief.country || "Not recorded"] : null,
    joined.includes("email") ? ["Email", submitted.email || "Not submitted", brief.email || "Not recorded"] : null,
    joined.includes("website") ? ["Website", submitted.websiteUrl || "Not submitted", brief.website || "Not recorded"] : null,
    joined.includes("profile URL") ? ["Google Profile", submitted.businessProfileUrl || "Not submitted", brief.profileUrl || "Not recorded"] : null,
  ].filter((row): row is [string, string, string] => row !== null) : []
  return <div className="guided-warning" role="alert">
    <p><strong>These records conflict.</strong></p>
    <ul>{notes.map(item => <li key={item}>{item}</li>)}</ul>
    {rows.length > 0 && <dl>{rows.map(([label, from, current]) => [
      <dt key={`${label}-label`}>{label}</dt>,
      <dd key={`${label}-value`}>Submitted: {from}. Current: {current}.</dd>,
    ])}</dl>}
  </div>
}

function EmailStatus({ brief }: { brief: JourneyIntakeBrief }) {
  const readiness = emailReadiness(brief)
  return <>
    <dt>{readiness.sameAddress ? "Email" : "Submitted email"}</dt>
    <dd>{readiness.submittedEmail || "No email"} — {readiness.label}</dd>
    {!readiness.sameAddress && <>
      <dt>Customer email</dt><dd>{readiness.customerEmail || "No email"}</dd>
    </>}
  </>
}

function RecoveryConfirmation({ caseId, mode }: { caseId: string; mode: "send" | "resend" }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      const response = await fetch("/api/cases/email-confirmation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ caseId }),
      })
      const result = await response.json() as { message?: string }
      setMessage(result.message || "Nothing was sent, and the address was not marked verified.")
    } catch {
      setMessage("Nothing was sent, and the address was not marked verified.")
    } finally {
      setBusy(false)
    }
  }
  const sending = mode === "send"
  return <form onSubmit={send}>
    <p>{sending
      ? "Send confirmation is only for recovery when the first receipt did not ask, or the provider did not accept that email. It does not verify the address."
      : "Resend confirmation is only for recovery. It does not verify the address."}</p>
    <button type="submit" disabled={busy}>{sending ? "Send confirmation" : "Resend confirmation"}</button>
    {message && <p role="status">{message}</p>}
  </form>
}

function EmailFollowUp({ brief, workflow, caseId }: { brief: JourneyIntakeBrief; workflow: boolean; caseId?: string }) {
  const readiness = emailReadiness(brief)
  const recovery = readiness.recovery === "send" || readiness.recovery === "resend" ? readiness.recovery : null
  const pendingLabel = readiness.confirmationPending || (readiness.provenance === "recovery" && readiness.label.startsWith("Email confirmation pending"))
  return <>
    <p>{readiness.detail}</p>
    {workflow && pendingLabel && <div className="guided-warning" role="status">
      <p><strong>{readiness.label}</strong></p>
      <p>{readiness.confirmationPending
        ? "The provider accepted the confirmation in the case receipt. This page does not verify the address."
        : "The provider accepted a separate recovery email. This page does not verify the address."}</p>
      {caseId && recovery && <RecoveryConfirmation caseId={caseId} mode={recovery} />}
    </div>}
    {workflow && !pendingLabel && recovery && caseId && <div className="guided-warning" role="status">
      <RecoveryConfirmation caseId={caseId} mode={recovery} />
    </div>}
    {workflow && readiness.state === "suppressed" && <div className="guided-warning" role="status">
      <p><strong>This verified address is suppressed.</strong></p>
      <p>Sending to it stays blocked. This page does not clear a suppression.</p>
    </div>}
  </>
}

export function IntakeSummary({ brief, reference }: { brief: JourneyIntakeBrief; reference: string }) {
  const submitted = brief.snapshot
  const enquiry = submitted?.details || brief.message
  return <div className="guided-facts">
    <dl>
      <dt>Case</dt><dd>{reference}</dd>
      <dt>Submitted</dt><dd>{brief.submittedAtLabel ?? "Time not recorded"}</dd>
      <dt>Customer</dt><dd>{submitted?.fullName || brief.customerName || "Not recorded"}</dd>
      <EmailStatus brief={brief} />
      <dt>Business</dt><dd>{submitted?.businessName || brief.businessName || "Not recorded"}</dd>
    </dl>
    <EmailFollowUp brief={brief} workflow={false} />
    <h3>Original enquiry</h3>
    <p className="preserve-lines">{enquiry || "No case message is stored."}</p>
    <ConflictNotice brief={brief} />
    <details className="guided-details">
      <summary>View original submission</summary>
      {submitted
        ? <dl>
          <dt>Phone</dt><dd>{submitted.phone || "No phone"}</dd>
          <dt>Country</dt><dd>{submitted.country || "No country"}</dd>
          <dt>Website</dt><dd>{submitted.websiteUrl ? safeLink(submitted.websiteUrl) : "Not provided"}</dd>
          <dt>Google Profile</dt><dd>{submitted.businessProfileUrl ? safeLink(submitted.businessProfileUrl) : "Not provided"}</dd>
          <dt>Review URL</dt><dd>{submitted.reviewUrl ? safeLink(submitted.reviewUrl) : "Not provided"}</dd>
        </dl>
        : <p>The original intake snapshot is not available from the reviewed read yet, so the submitted contact and business details are not shown as a separate original submission.</p>}
    </details>
  </div>
}

export function VerificationSummary({ brief, caseId }: { brief: JourneyIntakeBrief; caseId: string }) {
  const authority = brief.authority === "verified"
    ? "Business authority is recorded. It is separate from email control."
    : brief.authority === "pending"
      ? "A business membership is pending. That is not verified authority, and it does not block this screening."
      : brief.authority === "revoked"
        ? "Business authority was revoked. A checkbox on this form cannot restore it."
        : brief.authority === "records_disagree"
          ? "The business-authority records do not agree, so authority is not shown as verified."
          : "No business-authority membership is recorded. That does not block this screening."
  return <div className="guided-facts">
    <ConflictNotice brief={brief} />
    <dl>
      <dt>Business</dt><dd>{brief.businessName || "Not recorded"}</dd>
      <dt>Country</dt><dd>{brief.country || "Not recorded"}</dd>
      <dt>Customer</dt><dd>{brief.customerName || "Not recorded"}</dd>
      <EmailStatus brief={brief} />
      <dt>Website</dt><dd>{brief.website ? safeLink(brief.website) : "Not provided"}</dd>
      <dt>Google Profile</dt><dd>{brief.profileUrl ? safeLink(brief.profileUrl) : "Not provided"}</dd>
    </dl>
    <EmailFollowUp brief={brief} workflow caseId={caseId} />
    <details className="guided-details">
      <summary>Verification details</summary>
      <p>{authority}</p>
      <p>{brief.website ? "A website is not required." : "No website is recorded. A website is not required."}</p>
      <p>{brief.profileUrl ? "Saving a URL does not verify the listing." : "No Google profile URL is saved. An accessible listing is not required."}</p>
      <p>The purchasing establishment, country and tax eligibility are not part of this screening.</p>
      {brief.locationName && <p>Location name: {brief.locationName}.</p>}
      {brief.phone && <p>Phone: {brief.phone}.</p>}
      {brief.duplicates.length
        ? <p>Other businesses with this exact name: {brief.duplicates.map(row => row.name).join(", ")}. Matching names are a prompt to check, not a merge.</p>
        : <p>No other business has this exact name.</p>}
      {brief.snapshot
        ? <p>Original enquiry: {brief.snapshot.details}</p>
        : <p>The original intake snapshot is not available from the reviewed read yet, so the submitted contact and business details are not shown as a separate original submission.</p>}
      {brief.submittedAtLabel && <p>Submitted {brief.submittedAtLabel}.</p>}
    </details>
  </div>
}

export function IntakeReviewForm({ caseId, version }: { caseId: string; version: number }) {
  const { busy, done, uncertain, message, send } = useDecision()
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const outcome = form.get("outcome") === "INCOMPLETE" ? "INCOMPLETE" : "REVIEWED"
    await send({
      caseId,
      version,
      kind: "intake",
      data: {
        outcome,
        nextAction: outcome === "INCOMPLETE" ? String(form.get("nextAction") ?? "") : "",
        note: String(form.get("note") ?? ""),
      },
    })
  }
  return <form className="record-form" onSubmit={submit}>
    <h3>Record the intake review</h3>
    <p>A confirmation email is not a review. If the enquiry is incomplete, record the next action.</p>
    <fieldset disabled={busy || done || uncertain}>
      <label>Outcome
        <select name="outcome" defaultValue="REVIEWED">
          <option value="REVIEWED">Reviewed</option>
          <option value="INCOMPLETE">Incomplete — more information is needed</option>
        </select>
      </label>
      <label>Next action if the enquiry is incomplete
        <input name="nextAction" maxLength={200} />
      </label>
      <label>Note for the case history
        <textarea name="note" required minLength={10} maxLength={1000} rows={3} />
      </label>
      <button type="submit">{busy ? "Saving…" : "Record the intake review"}</button>
    </fieldset>
    {message && <p role="status">{message}</p>}
  </form>
}

export function VerificationForm({
  caseId,
  version,
  canComplete,
  recordedWebsite,
  recordedProfileUrl,
}: {
  caseId: string
  version: number
  canComplete: boolean
  recordedWebsite: string | null
  recordedProfileUrl: string | null
}) {
  const defaults = screeningFieldDefaults({ website: recordedWebsite, profileUrl: recordedProfileUrl })
  const { busy, done, uncertain, message, send } = useDecision()
  const [warning, setWarning] = useState("")
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const outcome = String(form.get("outcome") ?? "")
    const listing = String(form.get("listing") ?? "")
    const website = String(form.get("website") ?? "")
    const discrepancy = form.get("discrepancy") === "yes"
    if (screeningContradictsRecord({ website, listing, recordedWebsite, recordedProfileUrl, outcome, discrepancy })) {
      setWarning("That choice contradicts a website or Google profile already on the record. Mark the discrepancy, choose escalation, and give the reason before saving.")
      return
    }
    setWarning("")
    await send({
      caseId,
      version,
      kind: "verification",
      data: {
        outcome,
        source: String(form.get("source") ?? ""),
        listing,
        website,
        discrepancy,
        reason: String(form.get("reason") ?? ""),
        note: String(form.get("note") ?? ""),
      },
    })
  }
  return <form className="record-form" onSubmit={submit}>
    <h3>Record the screening decision</h3>
    <p>A saved Google URL is not a verified listing. A conflict is saved only as an escalation, with a reason.</p>
    <fieldset disabled={busy || done || uncertain}>
      <label>Outcome
        <select name="outcome" defaultValue={canComplete ? "PRELIMINARY_COMPLETE" : "FURTHER_INFORMATION"}>
          {canComplete && <option value="PRELIMINARY_COMPLETE">Preliminary checks completed</option>}
          <option value="FURTHER_INFORMATION">Further information required</option>
          <option value="LISTING_UNAVAILABLE">Listing unavailable or suspended</option>
          <option value="DUPLICATE_REVIEW">Duplicate review needed</option>
          <option value="ESCALATE">Material discrepancy requiring escalation</option>
        </select>
      </label>
      <label>What you checked
        <input name="source" required minLength={3} maxLength={200} />
      </label>
      <label>Website
        <select name="website" defaultValue={defaults.website}>
          <option value="PRESENT">A website exists</option>
          <option value="NONE">No website</option>
        </select>
      </label>
      {defaults.websiteRecorded
        ? <p>A website is already recorded. “No website” needs the discrepancy marked, escalation, and a reason.</p>
        : null}
      <label>Google listing
        <select name="listing" defaultValue={defaults.listing} required>
          {defaults.profileRecorded && <option value="">Choose how the listing stands</option>}
          <option value="ACCESSIBLE">Accessible</option>
          <option value="SUSPENDED_OR_MISSING">Suspended, missing or inaccessible</option>
          <option value="NOT_SUPPLIED">Not supplied</option>
        </select>
      </label>
      {defaults.profileRecorded
        ? <p>Choose accessible, or suspended, missing or inaccessible. “Not supplied” needs escalation.</p>
        : null}
      <label className="checkbox"><input type="checkbox" name="discrepancy" value="yes" /> The business details conflict and need escalation</label>
      <label>Reason
        <textarea name="reason" required minLength={10} maxLength={1000} rows={3} />
      </label>
      <label>Note for the case history
        <textarea name="note" required minLength={10} maxLength={1000} rows={3} />
      </label>
      <button type="submit">{busy ? "Saving…" : "Record the screening decision"}</button>
    </fieldset>
    {warning && <p role="status">{warning}</p>}
    {message && <p role="status">{message}</p>}
  </form>
}
