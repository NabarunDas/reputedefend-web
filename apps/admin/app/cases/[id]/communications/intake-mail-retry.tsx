"use client"
import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import type { IntakeMailRetryDestination } from "@/lib/case-intake-mail/offer"

export function IntakeMailRetryPanel({
  caseId,
  publicRef,
  destinations,
}: {
  caseId: string
  publicRef: string
  destinations: [IntakeMailRetryDestination, IntakeMailRetryDestination]
}) {
  const router = useRouter()
  const key = useRef<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [message, setMessage] = useState("")

  async function send() {
    if (!confirmed || busy || done || uncertain) return
    key.current ||= crypto.randomUUID()
    setBusy(true)
    setMessage("")
    try {
      const response = await fetch("/api/cases/intake-mail", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": key.current },
        body: JSON.stringify({ caseId, publicRef }),
      })
      const result = await response.json() as { message?: string }
      setMessage(result.message || "Unable to confirm the send.")
      if (response.ok) {
        setDone(true)
        router.refresh()
      } else if (response.status >= 500 || response.status === 409) {
        setUncertain(true)
      } else {
        key.current = null
      }
    } catch {
      setMessage("Uncertain result. Reload before trying again.")
      setUncertain(true)
    } finally {
      setBusy(false)
    }
  }

  return <section className="panel" aria-labelledby="intake-mail-retry-heading">
    <h3 id="intake-mail-retry-heading">Retry unsent intake emails</h3>
    <p>This sends the stored initial customer acknowledgement and the stored internal notification for {publicRef}. It does not create a case, and it does not review or send a later message.</p>
    <ul>
      {destinations.map(destination => <li key={destination.role}>
        {destination.role}: {destination.recipient}
        {destination.willSend ? "" : " — already accepted, and it will not be sent again"}
      </li>)}
    </ul>
    <label>
      <input
        type="checkbox"
        checked={confirmed}
        disabled={busy || done || uncertain}
        onChange={event => setConfirmed(event.target.checked)}
      />
      {" "}Send only these stored messages
    </label>
    <p>
      <button type="button" disabled={!confirmed || busy || done || uncertain} onClick={() => void send()}>
        Send the unsent intake emails
      </button>
    </p>
    {message && <p role="status">{message}</p>}
  </section>
}
