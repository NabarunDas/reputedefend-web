"use client"
import { useRef, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"

/**
 * One Step 7 action. It queues the payment-request email and reuses an open
 * payment action. It does not show a bearer link or mark the obligation paid.
 */
export function PaymentRequestForm({ serviceOrderId, version }: { serviceOrderId: string; version: number }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const key = useRef<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    key.current ||= crypto.randomUUID()
    setBusy(true)
    setMessage("")
    try {
      const response = await fetch("/api/cases/journey/payment-request", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": key.current },
        body: JSON.stringify({ serviceOrderId, version }),
      })
      const result = await response.json() as { message?: string; actionUrl?: string }
      setMessage(result.message || "Unable to queue the payment-request email.")
      if (response.ok) router.refresh()
      else key.current = null
    } catch {
      setMessage("Uncertain result. Reload before trying again.")
      key.current = null
    } finally {
      setBusy(false)
    }
  }

  return <form onSubmit={submit}>
    <p>Use this only when an accepted Guided order is still unpaid and no payment-request email is queued. A new acceptance queues that email itself. This recovery step reuses the open payment action. It does not create another link, repeat the quotation, open Stripe, or mark the payment complete.</p>
    <button type="submit" disabled={busy}>Send payment request</button>
    <p role="status">{message}</p>
  </form>
}
