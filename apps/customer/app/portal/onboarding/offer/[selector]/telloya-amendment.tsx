"use client"
import { useState, type FormEvent } from "react"

export function TelloyaAmendmentRequest({ enabled, selector }: { enabled: boolean; selector?: string }) {
  const [message, setMessage] = useState("")
  const [status, setStatus] = useState("")
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!enabled || !selector) return
    setStatus("")
    const response = await fetch("/api/portal/onboarding/offer/amendment", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({ selector, message }),
    })
    const result = await response.json() as { message?: string }
    setStatus(result.message ?? "Please try again.")
  }
  return <section aria-labelledby="telloya-amendment-title">
    <h2 id="telloya-amendment-title">Request changes</h2>
    <p>A request asks the team to prepare another version. It does not change the offer you were sent and it does not take payment.</p>
    <form onSubmit={submit}>
      <label htmlFor="telloya-amendment">What should change?</label>
      <textarea id="telloya-amendment" name="message" maxLength={1000} disabled={!enabled} value={message} onChange={event => setMessage(event.target.value)} />
      <button type="submit" disabled={!enabled}>Request changes</button>
    </form>
    <p role="status">{status}</p>
  </section>
}
