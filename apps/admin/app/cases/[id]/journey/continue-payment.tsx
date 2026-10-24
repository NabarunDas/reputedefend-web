"use client"
import { useRef, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"

/**
 * Confirms the accepted order on the case. It does not issue a Stripe link,
 * send email, or mark the obligation paid.
 */
export function ContinueAcceptedServiceForm({ caseId, version, label }: { caseId: string; version: number; label: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [message, setMessage] = useState("")
  const key = useRef<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || done) return
    key.current ||= crypto.randomUUID()
    setBusy(true)
    setMessage("")
    try {
      const response = await fetch("/api/cases/journey/reconcile", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": key.current },
        body: JSON.stringify({ caseId, version }),
      })
      const result = await response.json() as { message?: string }
      setMessage(result.message || "Unable to confirm the accepted order.")
      if (response.ok) {
        setDone(true)
        router.refresh()
      } else key.current = null
    } catch {
      setMessage("Uncertain result. Reload before trying again.")
      key.current = null
    } finally {
      setBusy(false)
    }
  }

  return <form onSubmit={submit}>
    <p>This records the accepted order on the case. It does not send a payment email, open Stripe, or mark the obligation paid.</p>
    <button type="submit" disabled={busy || done}>{label}</button>
    <p role="status">{message}</p>
  </form>
}
