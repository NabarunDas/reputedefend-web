"use client"
import { useRef, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import type { JourneyIntakeBrief } from "@/lib/case-journey/intake"

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
    <h3>Received enquiry</h3>
    <p>Case message: {brief.message || "No case message is stored."}</p>
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
    {brief.snapshot
      ? <div>
        <h3>Original intake snapshot</h3>
        <p>{brief.snapshot.details}</p>
        <p>{brief.snapshot.fullName} · {brief.snapshot.email} · {brief.snapshot.businessName} · {brief.snapshot.country}</p>
      </div>
      : <p>The original intake snapshot is stored on the case. Until the reviewed database read is applied, this screen shows the case message and the current customer, business and location records.</p>}
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

export function VerificationForm({ caseId, version }: { caseId: string; version: number }) {
  const { busy, done, uncertain, message, send } = useDecision()
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await send({
      caseId,
      version,
      kind: "verification",
      data: {
        outcome: String(form.get("outcome") ?? ""),
        source: String(form.get("source") ?? ""),
        listing: String(form.get("listing") ?? ""),
        website: String(form.get("website") ?? ""),
        discrepancy: form.get("discrepancy") === "yes",
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
        <select name="outcome" defaultValue="PRELIMINARY_COMPLETE">
          <option value="PRELIMINARY_COMPLETE">Preliminary checks completed</option>
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
        <select name="website" defaultValue="NONE">
          <option value="NONE">No website</option>
          <option value="PRESENT">A website exists</option>
        </select>
      </label>
      <label>Google listing
        <select name="listing" defaultValue="NOT_SUPPLIED">
          <option value="NOT_SUPPLIED">Not supplied</option>
          <option value="ACCESSIBLE">Accessible</option>
          <option value="SUSPENDED_OR_MISSING">Suspended, missing or inaccessible</option>
        </select>
      </label>
      <label className="checkbox"><input type="checkbox" name="discrepancy" value="yes" /> The business details conflict and need escalation</label>
      <label>Reason
        <textarea name="reason" required minLength={10} maxLength={1000} rows={3} />
      </label>
      <label>Note for the case history
        <textarea name="note" required minLength={10} maxLength={1000} rows={3} />
      </label>
      <button type="submit">{busy ? "Saving…" : "Record the screening decision"}</button>
    </fieldset>
    {message && <p role="status">{message}</p>}
  </form>
}
