"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"

const RETRY = "We couldn't save that. Please try again shortly."

const OUTCOMES = [
  ["STILL_WAITING", "Still waiting for Google"],
  ["REINSTATED", "Profile reinstated"],
  ["NOT_REINSTATED", "Profile not reinstated"],
  ["MORE_INFORMATION", "Google requested more information"],
  ["OTHER", "Other outcome"],
] as const

export type GuidedEvidenceOption = { selector: string; label: string }

export type GuidedHandoverState = {
  submitted: boolean
  correctionRequested: boolean
  outcomeReported: boolean
  outcomeReviewed: boolean
  evidenceOptions: GuidedEvidenceOption[]
}

export function GuidedHandoverForm({
  reference,
  submitted,
  correctionRequested,
  outcomeReported,
  evidenceOptions,
}: { reference: string } & GuidedHandoverState) {
  const router = useRouter()
  const [error, setError] = useState("")
  const [status, setStatus] = useState("")
  const [busy, setBusy] = useState(false)

  async function send(operation: "request_correction" | "report_submission" | "report_outcome", fields: Record<string, string>) {
    setBusy(true)
    setError("")
    setStatus("")
    try {
      const response = await fetch("/api/portal/documents/handover", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ reference, operation, ...fields }),
      })
      const body = await response.json() as { message?: string }
      const message = typeof body.message === "string" ? body.message : RETRY
      if (!response.ok) {
        setError(message)
        return
      }
      setStatus(message)
      router.refresh()
    } catch {
      setError(RETRY)
    } finally {
      setBusy(false)
    }
  }

  function onCorrection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const note = String(new FormData(event.currentTarget).get("note") ?? "")
    void send("request_correction", { note })
  }

  function onReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const fields: Record<string, string> = {
      note: String(form.get("note") ?? ""),
      submittedOn: String(form.get("submittedOn") ?? ""),
    }
    const googleReference = String(form.get("googleReference") ?? "").trim()
    if (googleReference) fields.googleReference = googleReference
    void send("report_submission", fields)
  }

  function onOutcome(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const fields: Record<string, string> = {
      note: String(form.get("note") ?? ""),
      outcome: String(form.get("outcome") ?? ""),
      decidedOn: String(form.get("decidedOn") ?? ""),
    }
    const googleReference = String(form.get("googleReference") ?? "").trim()
    if (googleReference) fields.googleReference = googleReference
    const evidenceSelector = String(form.get("evidenceSelector") ?? "").trim()
    if (evidenceSelector) fields.evidenceSelector = evidenceSelector
    void send("report_outcome", fields)
  }

  return (
    <div className="guided-handover">
      <form onSubmit={onCorrection}>
        <h3>Request a correction</h3>
        <p>Tell us what to change before you submit this pack to Google. ProfileRelaunch does not submit Guided work for you.</p>
        {correctionRequested ? <p>A correction request is already with ProfileRelaunch.</p> : <>
          <label>What should we change?
            <textarea name="note" required minLength={10} maxLength={2000} rows={4} />
          </label>
          <button type="submit" disabled={busy}>Request a correction</button>
        </>}
      </form>
      <form onSubmit={onReport}>
        <h3>I submitted this to Google</h3>
        <p>This records your own submission. It is not a decision from Google, and it does not mean ProfileRelaunch submitted the pack.</p>
        {submitted ? <p>You have already recorded a Google submission for this case.</p> : (
          <>
            <label>Date you submitted it
              <input name="submittedOn" type="date" required />
            </label>
            <label>Google reference, if Google gave you one
              <input name="googleReference" maxLength={200} autoComplete="off" />
            </label>
            <label>What did you submit?
              <textarea name="note" required minLength={10} maxLength={2000} rows={3} />
            </label>
            <button type="submit" disabled={busy}>I submitted this to Google</button>
          </>
        )}
      </form>
      {submitted ? (
        <form onSubmit={onOutcome}>
          <h3>Update Google&apos;s decision</h3>
          <p>This is your report. It is not an independently verified Google decision, and it does not change your completed ProfileRelaunch service or its payment.</p>
          {outcomeReported ? <p>You can update this report. ProfileRelaunch has not verified it with Google.</p> : null}
          <label>Google&apos;s decision
            <select name="outcome" required defaultValue="">
              <option value="" disabled>Choose an outcome</option>
              {OUTCOMES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>Date of that decision
            <input name="decidedOn" type="date" required />
          </label>
          <label>Google reference, if Google gave you one
            <input name="googleReference" maxLength={200} autoComplete="off" />
          </label>
          <label>What did Google say?
            <textarea name="note" required minLength={10} maxLength={2000} rows={3} />
          </label>
          {evidenceOptions.length > 0 ? (
            <label>Supporting evidence you already uploaded
              <select name="evidenceSelector" defaultValue="">
                <option value="">No file</option>
                {evidenceOptions.map(option => <option key={option.selector} value={option.selector}>{option.label}</option>)}
              </select>
            </label>
          ) : null}
          <button type="submit" disabled={busy}>Update Google&apos;s decision</button>
        </form>
      ) : null}
      {status ? <p role="status">{status}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  )
}
