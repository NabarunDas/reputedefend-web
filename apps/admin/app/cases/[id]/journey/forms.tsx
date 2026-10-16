"use client"
import { useRef, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { screeningContradictsRecord, screeningFieldDefaults, type JourneyIntakeBrief } from "@/lib/case-journey/intake"

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

export function IntakeBrief({ brief }: { brief: JourneyIntakeBrief }) {
  const email = brief.emailControl === "verified"
    ? "Email control is recorded. That is not business authority and it is not a review of this case."
    : brief.emailControl === "records_disagree"
      ? "The email-control records do not agree, so email is not shown as verified."
      : "Email control is not recorded. A delivered or opened message is not email control."
  const authority = brief.authority === "verified"
    ? "Business authority is recorded. It is separate from email control."
    : brief.authority === "pending"
      ? "A business membership is pending. That is not verified authority."
      : brief.authority === "revoked"
        ? "Business authority was revoked. A checkbox on this form cannot restore it."
        : brief.authority === "records_disagree"
          ? "The business-authority records do not agree, so authority is not shown as verified."
          : "No business-authority membership is recorded."
  return <div>
    <h3>Original submission</h3>
    <p>Submitted {brief.submittedAtLabel ?? "at a time that is not recorded"}.</p>
    {brief.snapshot
      ? <div>
        <p>Original enquiry: {brief.snapshot.details}</p>
        <p>Submitted contact: {brief.snapshot.fullName || "No name"} · {brief.snapshot.email || "No email"} · {brief.snapshot.phone || "No phone"}</p>
        <p>Submitted business: {brief.snapshot.businessName || "Not recorded"} · {brief.snapshot.country || "No country"}</p>
        <p>{brief.snapshot.websiteUrl ? `Submitted website: ${brief.snapshot.websiteUrl}` : "No website was submitted."}</p>
        <p>{brief.snapshot.businessProfileUrl ? `Submitted Google profile URL: ${brief.snapshot.businessProfileUrl}` : "No Google profile URL was submitted."}</p>
        {brief.snapshot.reviewUrl && <p>Submitted review URL: {brief.snapshot.reviewUrl}</p>}
      </div>
      : <div>
        <p>Original enquiry on the case: {brief.message || "No case message is stored."}</p>
        <p>The original intake snapshot is not available from the reviewed read yet, so the submitted contact and business details are not shown as a separate original submission.</p>
      </div>}
    <h3>Current business record</h3>
    <p>These are the records held now. They can differ from what the customer first submitted.</p>
    {brief.reviewUrl && <p>Review URL on the case: {brief.reviewUrl}</p>}
    <p>Customer: {brief.customerName || "Not recorded"} · {brief.email || "No email"} · {brief.phone || "No phone"}</p>
    <p>Business: {brief.businessName || "Not recorded"}</p>
    <p>{brief.website ? `Website on the business record: ${brief.website}. A website is not required.` : "No website is recorded. A website is not required."}</p>
    <p>Location: {brief.locationName || "Not named"} · {brief.country || "No country recorded"}</p>
    <p>{brief.profileUrl
      ? `A Google profile URL is saved: ${brief.profileUrl}. Saving a URL does not verify the listing.`
      : "No Google profile URL is saved. An accessible listing is not required."}</p>
    <p>{email}</p>
    <p>{authority}</p>
    {brief.duplicates.length
      ? <p>Other businesses with this exact name: {brief.duplicates.map(row => row.name).join(", ")}. Matching names are a prompt to check, not a merge.</p>
      : <p>No other business has this exact name.</p>}
    {brief.conflicts.length > 0 && <ul>{brief.conflicts.map(item => <li key={item}>{item}</li>)}</ul>}
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
    <p>Saving this records that you reviewed the enquiry. Sending or opening a confirmation email does not. If the enquiry is incomplete, record that and the next action instead of marking it reviewed.</p>
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
    <p>Record what you checked, the outcome and the reason. A website, a Companies House record and an accessible Google listing are not required. A suspended or missing listing does not block assessment or an evidence request. An unavailable listing can only be saved when the listing is marked suspended, missing or inaccessible. A conflict can only be saved as escalation. This form does not verify email, grant business authority, or record the purchasing establishment or tax eligibility.</p>
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
        ? <p>The business record already has a website, so this starts as “A website exists”. Choosing “No website” is a discrepancy: mark it, escalate, and give the reason.</p>
        : <p>No website is on the business record, so this starts as “No website”.</p>}
      <label>Google listing
        <select name="listing" defaultValue={defaults.listing} required>
          {defaults.profileRecorded && <option value="">Choose how the listing stands</option>}
          <option value="ACCESSIBLE">Accessible</option>
          <option value="SUSPENDED_OR_MISSING">Suspended, missing or inaccessible</option>
          <option value="NOT_SUPPLIED">Not supplied</option>
        </select>
      </label>
      {defaults.profileRecorded
        ? <p>A Google profile URL is saved. That does not mean the listing is accessible or verified. Choose accessible, or suspended, missing or inaccessible. “Not supplied” is a discrepancy and needs escalation.</p>
        : <p>No Google profile URL is saved, so this starts as “Not supplied”.</p>}
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
