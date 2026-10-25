"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"

const RETRY = "We couldn't save that. Please try again shortly."

export function GuidedHandoverForm({ reference, submitted, correctionRequested }: {
  reference: string
  submitted: boolean
  correctionRequested: boolean
}) {
  const router = useRouter()
  const [error, setError] = useState("")
  const [status, setStatus] = useState("")
  const [busy, setBusy] = useState(false)

  async function send(operation: "request_correction" | "report_submission", fields: Record<string, string>) {
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
    void send("report_submission", {
      note: String(form.get("note") ?? ""),
      submittedOn: String(form.get("submittedOn") ?? ""),
      googleReference: String(form.get("googleReference") ?? ""),
    })
  }

  return (
    <div className="guided-handover">
      <form onSubmit={onCorrection}>
        <h3>Ask for a correction</h3>
        <p>Tell us what to change before you submit this pack to Google. ProfileRelaunch does not submit Guided work for you.</p>
        {correctionRequested ? <p>A correction request is already with ProfileRelaunch.</p> : null}
        <label>What should we change?
          <textarea name="note" required minLength={10} maxLength={2000} rows={4} />
        </label>
        <button type="submit" disabled={busy}>Request a correction</button>
      </form>
      <form onSubmit={onReport}>
        <h3>I submitted this to Google</h3>
        <p>This records your own submission. It is not a decision from Google, and it does not mean ProfileRelaunch submitted the pack.</p>
        {submitted ? <p>You have already recorded a Google submission for this case.</p> : (
          <>
            <label>Date you submitted it
              <input name="submittedOn" type="date" required />
            </label>
            <label>Google reference
              <input name="googleReference" required maxLength={200} autoComplete="off" />
            </label>
            <label>What did you submit?
              <textarea name="note" required minLength={10} maxLength={2000} rows={3} />
            </label>
            <button type="submit" disabled={busy}>Record my Google submission</button>
          </>
        )}
      </form>
      {status ? <p role="status">{status}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  )
}
