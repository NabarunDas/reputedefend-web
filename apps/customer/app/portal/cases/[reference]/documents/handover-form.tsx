"use client"

import { useRef, useState, type FormEvent, type ReactNode } from "react"
import { useRouter } from "next/navigation"

const RETRY = "We couldn't save that. Please try again shortly."
const CHECK = "Check the details and try again."
const SAVING = "Saving your update."
const DAY = /^\d{4}-\d{2}-\d{2}$/
const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9 .:_-]{0,198}$/

const OUTCOMES = [
  ["STILL_WAITING", "Still waiting for Google"],
  ["REINSTATED", "Profile reinstated"],
  ["NOT_REINSTATED", "Profile not reinstated"],
  ["MORE_INFORMATION", "Google requested more information"],
  ["OTHER", "Other outcome"],
] as const

const CORRECTION_RECORDED = "A correction request is already with ProfileRelaunch."
const SUBMISSION_RECORDED = "We've recorded that you submitted this pack to Google. This is your report. It is not a decision from Google."
const SUBMISSION_BOUNDARY = "ProfileRelaunch does not submit Guided packs to Google."

export type GuidedEvidenceOption = { selector: string; label: string }

export type GuidedHandoverState = {
  submitted: boolean
  correctionRequested: boolean
  outcomeReported: boolean
  outcomeReviewed: boolean
  evidenceOptions: GuidedEvidenceOption[]
}

type Panel = "correction" | "submission" | "outcome"
type RecordedSubmission = { submittedOn: string; googleReference: string; note: string }

function writtenNote(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length >= 10 && trimmed.length <= 2000 ? trimmed : null
}

function optionalReference(value: string): string | null | "invalid" {
  const reference = value.trim()
  if (!reference) return null
  if (!REFERENCE.test(reference) || reference.toLowerCase().includes("http")) return "invalid"
  return reference
}

function formatDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number)
  if (!year || !month || !date) return day
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, date)))
}

function ActionCard({
  id,
  title,
  description,
  expanded,
  onToggle,
  children,
}: {
  id: string
  title: string
  description: string
  expanded: boolean
  onToggle: () => void
  children: ReactNode
}) {
  const titleId = `${id}-title`
  const descriptionId = `${id}-description`
  const buttonId = `${id}-toggle`
  const panelId = `${id}-panel`
  return (
    <article className={expanded ? "guided-action-card is-open" : "guided-action-card"}>
      <h4 className="guided-action-heading">
        <button
          id={buttonId}
          type="button"
          className="guided-action-toggle"
          aria-expanded={expanded}
          aria-controls={panelId}
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          onClick={onToggle}
        >
          <span className="guided-action-title" id={titleId}>{title}</span>
          <span className="guided-action-description" id={descriptionId}>{description}</span>
          <span className="guided-action-chevron" aria-hidden="true" />
        </button>
      </h4>
      <div id={panelId} className="guided-action-panel" role="region" aria-labelledby={buttonId} hidden={!expanded}>
        {children}
      </div>
    </article>
  )
}

export function GuidedHandoverForm({
  reference,
  submitted,
  correctionRequested,
  outcomeReported,
  evidenceOptions,
}: { reference: string } & GuidedHandoverState) {
  const router = useRouter()
  const busyRef = useRef(false)
  const [open, setOpen] = useState<Panel | null>(null)
  const [error, setError] = useState("")
  const [status, setStatus] = useState("")
  const [announcement, setAnnouncement] = useState("")
  const [busy, setBusy] = useState(false)
  const [correctionSaved, setCorrectionSaved] = useState(false)
  const [recordedSubmission, setRecordedSubmission] = useState<RecordedSubmission | null>(null)
  const correctionRecorded = correctionRequested || correctionSaved
  const submissionRecorded = submitted || recordedSubmission !== null

  function toggle(panel: Panel, title: string) {
    setOpen(current => {
      const opening = current !== panel
      setAnnouncement(opening ? `${title} opened.` : `${title} closed.`)
      return opening ? panel : null
    })
  }

  async function send(operation: "request_correction" | "report_submission" | "report_outcome", fields: Record<string, string>, recorded?: RecordedSubmission) {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError("")
    setStatus("")
    setAnnouncement(SAVING)
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
        setAnnouncement("")
        return
      }
      if (operation === "request_correction") setCorrectionSaved(true)
      if (operation === "report_submission" && recorded) setRecordedSubmission(recorded)
      setOpen(null)
      setStatus(message)
      setAnnouncement("")
      router.refresh()
    } catch {
      setError(RETRY)
      setAnnouncement("")
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  function onCorrection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const note = writtenNote(String(new FormData(event.currentTarget).get("note") ?? ""))
    if (!note) {
      setError(CHECK)
      return
    }
    void send("request_correction", { note })
  }

  function onReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const note = writtenNote(String(form.get("note") ?? ""))
    const submittedOn = String(form.get("submittedOn") ?? "")
    const googleReference = optionalReference(String(form.get("googleReference") ?? ""))
    if (!note || !DAY.test(submittedOn) || googleReference === "invalid") {
      setError(CHECK)
      return
    }
    const fields: Record<string, string> = { note, submittedOn }
    if (googleReference) fields.googleReference = googleReference
    void send("report_submission", fields, { submittedOn, googleReference: googleReference ?? "", note })
  }

  function onOutcome(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const note = writtenNote(String(form.get("note") ?? ""))
    const outcome = String(form.get("outcome") ?? "")
    const decidedOn = String(form.get("decidedOn") ?? "")
    const googleReference = optionalReference(String(form.get("googleReference") ?? ""))
    const knownOutcome = OUTCOMES.some(([value]) => value === outcome)
    if (!note || !knownOutcome || !DAY.test(decidedOn) || googleReference === "invalid") {
      setError(CHECK)
      return
    }
    const fields: Record<string, string> = { note, outcome, decidedOn }
    if (googleReference) fields.googleReference = googleReference
    const evidenceSelector = String(form.get("evidenceSelector") ?? "").trim()
    if (evidenceSelector) fields.evidenceSelector = evidenceSelector
    void send("report_outcome", fields)
  }

  return (
    <section className="guided-next" aria-labelledby="guided-next-heading" aria-busy={busy}>
      <h3 id="guided-next-heading">What would you like to do next?</h3>
      {announcement ? <p className="sr-only" role="status">{announcement}</p> : null}
      {submissionRecorded ? (
        <div className="guided-confirmation" {...(status === SUBMISSION_RECORDED ? { role: "status" as const } : {})}>
          <h4>Your Google submission is recorded</h4>
          <p>{SUBMISSION_RECORDED}</p>
          <p>{SUBMISSION_BOUNDARY}</p>
          {recordedSubmission ? (
            <dl className="guided-confirmation-facts">
              <div>
                <dt>Submitted on</dt>
                <dd>{formatDay(recordedSubmission.submittedOn)}</dd>
              </div>
              {recordedSubmission.googleReference ? (
                <div>
                  <dt>Google reference</dt>
                  <dd>{recordedSubmission.googleReference}</dd>
                </div>
              ) : null}
              <div>
                <dt>What you submitted</dt>
                <dd>{recordedSubmission.note}</dd>
              </div>
            </dl>
          ) : null}
        </div>
      ) : null}
      <div className="guided-action-list">
        {correctionRecorded ? (
          <article className="guided-recorded">
            <h4>Request a correction</h4>
            <p>{CORRECTION_RECORDED}</p>
          </article>
        ) : (
          <ActionCard
            id="guided-correction"
            title="Request a correction"
            description="Ask us to change something before you submit your pack."
            expanded={open === "correction"}
            onToggle={() => toggle("correction", "Request a correction")}
          >
            <form onSubmit={onCorrection}>
              <p>Tell us what to change before you submit this pack to Google. ProfileRelaunch does not submit Guided work for you.</p>
              <label>What should we change?
                <textarea name="note" required minLength={10} maxLength={2000} rows={4} />
              </label>
              <button className="guided-submit" type="submit" disabled={busy}>Request a correction</button>
            </form>
          </ActionCard>
        )}
        {submissionRecorded ? (
          <ActionCard
            id="guided-outcome"
            title="Update Google's decision"
            description={outcomeReported
              ? "You can update this report. ProfileRelaunch has not verified it with Google."
              : "Tell us what you heard from Google."}
            expanded={open === "outcome"}
            onToggle={() => toggle("outcome", "Update Google's decision")}
          >
            <form onSubmit={onOutcome}>
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
              <button className="guided-submit" type="submit" disabled={busy}>Update Google&apos;s decision</button>
            </form>
          </ActionCard>
        ) : (
          <ActionCard
            id="guided-submission"
            title="I've submitted my pack to Google"
            description="Let us know when you've submitted it yourself."
            expanded={open === "submission"}
            onToggle={() => toggle("submission", "I've submitted my pack to Google")}
          >
            <form onSubmit={onReport}>
              <p>{SUBMISSION_BOUNDARY} This records your own submission. It is not a decision from Google.</p>
              <label>Date you submitted it
                <input name="submittedOn" type="date" required />
              </label>
              <label>Google reference, if Google gave you one
                <input name="googleReference" maxLength={200} autoComplete="off" />
              </label>
              <label>What did you submit?
                <textarea name="note" required minLength={10} maxLength={2000} rows={3} />
              </label>
              <button className="guided-submit" type="submit" disabled={busy}>I submitted this to Google</button>
            </form>
          </ActionCard>
        )}
      </div>
      {status && status !== SUBMISSION_RECORDED ? <p className="guided-status" role="status">{status}</p> : null}
      {error ? <p className="guided-status" role="alert">{error}</p> : null}
    </section>
  )
}
