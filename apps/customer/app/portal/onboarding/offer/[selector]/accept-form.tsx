"use client"

import { useRouter } from "next/navigation"
import { useRef, useState, type FormEvent } from "react"
import type { ReadyOffer } from "@/lib/portal/onboarding/offer-types"

export function AcceptOfferForm({ offer }: { offer: ReadyOffer }) {
  const router = useRouter()
  const key = useRef(crypto.randomUUID())
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [agreement, setAgreement] = useState(false)
  const [recurring, setRecurring] = useState(false)
  const [checked, setChecked] = useState<Record<string, boolean>>({})

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setMessage(null)
    try {
      const response = await fetch("/api/portal/onboarding/offer", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": key.current,
        },
        body: JSON.stringify({
          selector: offer.offerRef,
          offerVersion: offer.offerVersion,
          priceMinor: offer.priceMinor,
          taxBehaviour: offer.taxBehaviour,
          taxMinor: offer.taxMinor,
          cadence: offer.cadence,
          agreementRef: offer.agreement.versionRef,
          agreementAccepted: agreement,
          recurringConsent: offer.recurring ? recurring : false,
          confirmations: Object.fromEntries(offer.agreement.confirmations.map(item => [item.key, checked[item.key] === true])),
        }),
      })
      if (response.ok) {
        router.push(`/portal/onboarding/offer/${offer.offerRef}`)
        router.refresh()
        return
      }
      const body = await response.json().catch(() => null) as { message?: string } | null
      setMessage(body?.message ?? "We couldn't complete that step. Please try again shortly.")
      setPending(false)
    } catch {
      setMessage("We couldn't complete that step. Please try again shortly.")
      setPending(false)
    }
  }

  return (
    <form className="offer-accept" onSubmit={submit}>
      <h2>Accept this offer</h2>
      <p>Acceptance records this offer only. It does not take a payment or start the service.</p>
      <label className="offer-check">
        <input
          type="checkbox"
          name="agreement"
          checked={agreement}
          onChange={event => setAgreement(event.target.checked)}
        />
        <span>I accept the agreement shown above, including the cancellation arrangements.</span>
      </label>
      {offer.agreement.confirmations.map(item => (
        <label className="offer-check" key={item.key}>
          <input
            type="checkbox"
            name={item.key}
            checked={checked[item.key] === true}
            onChange={event => setChecked(current => ({ ...current, [item.key]: event.target.checked }))}
          />
          <span>{item.label}</span>
        </label>
      ))}
      {offer.recurring ? (
        <label className="offer-check">
          <input
            type="checkbox"
            name="recurring"
            checked={recurring}
            onChange={event => setRecurring(event.target.checked)}
          />
          <span>I agree to the recurring payment for this {offer.cadence === "YEAR" ? "yearly" : "monthly"} arrangement.</span>
        </label>
      ) : null}
      {message ? <p className="onboarding-banner" role="alert">{message}</p> : null}
      <button className="portal-button" type="submit" disabled={pending}>
        {pending ? "Recording acceptance" : "Accept offer"}
      </button>
    </form>
  )
}
