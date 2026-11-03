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
  const [overage, setOverage] = useState(false)
  const [cap, setCap] = useState("")
  const [checked, setChecked] = useState<Record<string, boolean>>({})

  function spendingCapMinor() {
    if (!offer.conditions.overagePermitted || !overage) return null
    if (!/^\d+(\.\d{1,2})?$/.test(cap)) return null
    const pounds = Number(cap)
    const minor = Math.round(pounds * 100)
    if (!Number.isFinite(pounds) || minor < 1 || minor > 100_000_000) return null
    return minor
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setMessage(null)
    const overageCapMinor = spendingCapMinor()
    if (offer.conditions.overagePermitted && overage && overageCapMinor == null) {
      setMessage("Enter a monthly spending cap to authorise additional usage. No cap is assumed.")
      setPending(false)
      return
    }
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
          conditions: {
            tier: offer.conditions.tier,
            includedMinutes: offer.conditions.includedMinutes,
            minutesRollover: offer.conditions.minutesRollover,
            baseAmountMinor: offer.conditions.baseAmountMinor,
            guardIncluded: offer.conditions.guardIncluded,
            guardUnitMinor: offer.conditions.guardUnitMinor,
            guardQuantity: offer.conditions.guardQuantity,
            overagePermitted: offer.conditions.overagePermitted,
            overageRateMinor: offer.conditions.overageRateMinor,
            overageOptIn: offer.conditions.overagePermitted ? overage : false,
            overageCapMinor,
          },
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
      {offer.conditions.overagePermitted && offer.conditions.overageRateMinor != null ? (
        <>
          <label className="offer-check">
            <input
              type="checkbox"
              name="overage"
              checked={overage}
              onChange={event => {
                setOverage(event.target.checked)
                if (!event.target.checked) setCap("")
              }}
            />
            <span>I agree to additional usage at {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(offer.conditions.overageRateMinor / 100)} per minute. This is separate from the recurring charge.</span>
          </label>
          <label className="offer-check">
            <span>Monthly spending cap, in pounds. Leave this blank unless you opt in.</span>
            <input
              type="text"
              name="overageCap"
              inputMode="decimal"
              value={cap}
              disabled={!overage}
              onChange={event => setCap(event.target.value)}
            />
          </label>
        </>
      ) : null}
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
