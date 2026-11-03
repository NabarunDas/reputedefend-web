"use client"

import { useRef, useState, type FormEvent } from "react"
import { assignTrustedStripeCheckout } from "../../../../../../../lib/payments/stripe-url"

export function ContinueToSecurePayment({ selector }: { selector: string }) {
  const key = useRef(crypto.randomUUID())
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setMessage(null)
    try {
      const response = await fetch("/api/portal/onboarding/payment", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": key.current,
        },
        body: JSON.stringify({ selector }),
      })
      const body = await response.json().catch(() => null) as { message?: string; checkoutUrl?: string } | null
      if (body?.checkoutUrl && assignTrustedStripeCheckout(body.checkoutUrl)) return
      setMessage(body?.message ?? "Payment setup is being prepared. Nothing has been paid and the service has not started.")
      setPending(false)
    } catch {
      setMessage("Payment setup is being prepared. Nothing has been paid and the service has not started.")
      setPending(false)
    }
  }

  return (
    <form onSubmit={start}>
      <button className="portal-button" type="submit" disabled={pending}>Continue to secure payment</button>
      {message ? <p className="onboarding-banner" role="alert">{message}</p> : null}
    </form>
  )
}
