import { commercialOfferAcceptEnabled } from "@/lib/portal/onboarding/flag"
import type { AcceptedOffer, CommercialOfferRead, PricedOffer, ReadyOffer } from "@/lib/portal/onboarding/offer-types"

type ShownOffer = ReadyOffer | AcceptedOffer
import { AcceptOfferForm } from "./accept-form"

function pounds(minor: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(minor / 100)
}

function when(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return `${new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)} UK`
}

function cadenceLabel(cadence: PricedOffer["cadence"]) {
  if (cadence === "MONTH") return "Monthly"
  if (cadence === "YEAR") return "Yearly"
  return "One-time"
}

function taxLine(offer: ShownOffer) {
  if (offer.taxBehaviour === "NOT_APPLICABLE") return "Applicable tax is not charged on this offer."
  if (offer.taxBehaviour === "INCLUSIVE") {
    return offer.taxMinor == null
      ? "The price includes applicable tax."
      : `The price includes applicable tax of ${pounds(offer.taxMinor)}.`
  }
  return `Applicable tax of ${pounds(offer.taxMinor ?? 0)} is added to the price.`
}

function minutesLine(offer: ShownOffer) {
  if (offer.conditions.includedMinutes == null) return "Included minutes are quoted individually for this offer."
  const rollover = offer.conditions.minutesRollover
    ? "Unused minutes roll over."
    : "Unused minutes do not roll over."
  return `${offer.conditions.includedMinutes} minutes each month. ${rollover}`
}

function guardLine(offer: ShownOffer) {
  const { guardIncluded, guardQuantity, guardUnitMinor } = offer.conditions
  if (guardIncluded && guardUnitMinor != null) {
    const places = guardQuantity === 1 ? "1 location" : `${guardQuantity} locations`
    return `This Telloya plan includes optional Relaunch Guard for ${places} at ${pounds(guardUnitMinor)} each month. Relaunch Guard is not active. Accepting this offer does not start Guard coverage or Telloya.`
  }
  if (guardUnitMinor != null) {
    return `Relaunch Guard is optional and is not included in this offer. The approved price is ${pounds(guardUnitMinor)} per location each month. It is not active.`
  }
  return "Relaunch Guard is not part of this offer."
}

function overageLine(offer: ShownOffer) {
  const { conditions } = offer
  if ("overageOptIn" in conditions && conditions.overageOptIn && conditions.overageCapMinor != null && conditions.overageRateMinor != null) {
    return `Additional usage was authorised at ${pounds(conditions.overageRateMinor)} per minute, with a monthly spending cap of ${pounds(conditions.overageCapMinor)}. That cap is the only additional-usage amount recorded.`
  }
  if (offer.conditions.overagePermitted && offer.conditions.overageRateMinor != null) {
    return `Additional usage is ${pounds(offer.conditions.overageRateMinor)} per minute only if you opt in and enter a monthly spending cap. No cap is set unless you enter one. Accepting the subscription does not authorise extra usage charges.`
  }
  return "Additional usage is not authorised. Accepting this offer does not allow extra usage charges."
}

function Price({ offer }: { offer: ShownOffer }) {
  return (
    <section aria-labelledby="offer-price">
      <h2 id="offer-price">Price</h2>
      <dl className="offer-facts">
        <div>
          <dt>Arrangement</dt>
          <dd>{offer.recurring ? "Recurring" : "One-time"}</dd>
        </div>
        <div>
          <dt>Billing</dt>
          <dd>{cadenceLabel(offer.cadence)}</dd>
        </div>
        <div>
          <dt>Plan</dt>
          <dd>{offer.conditions.tier}</dd>
        </div>
        <div>
          <dt>Included minutes</dt>
          <dd>{minutesLine(offer)}</dd>
        </div>
        <div>
          <dt>Recurring base charge</dt>
          <dd>{pounds(offer.conditions.baseAmountMinor)}</dd>
        </div>
        <div>
          <dt>Relaunch Guard</dt>
          <dd>{guardLine(offer)}</dd>
        </div>
        <div>
          <dt>Additional usage</dt>
          <dd>{overageLine(offer)}</dd>
        </div>
        <div>
          <dt>Price</dt>
          <dd>{pounds(offer.priceMinor)}</dd>
        </div>
        <div>
          <dt>Total payable</dt>
          <dd>{pounds(offer.totalMinor)}</dd>
        </div>
      </dl>
      <p>{taxLine(offer)}</p>
    </section>
  )
}

function Agreement({ offer }: { offer: ShownOffer }) {
  return (
    <section aria-labelledby="offer-agreement">
      <h2 id="offer-agreement">{offer.agreement.title}</h2>
      <p className="offer-agreement">{offer.agreement.body}</p>
      <h3>Cancellation</h3>
      <p className="offer-agreement">{offer.agreement.cancellation}</p>
    </section>
  )
}

export function OfferUnavailable({ message }: { message?: string }) {
  return (
    <div className="onboarding-page">
      <h1>Commercial offer</h1>
      <p className="onboarding-banner">{message ?? "We couldn't show this offer just now. This does not say that there is no offer."}</p>
      <p><a className="portal-button" href="/portal/products">Back to My Products</a></p>
    </div>
  )
}

export function OfferView({ offer, acceptEnabled = commercialOfferAcceptEnabled() }: { offer: Exclude<CommercialOfferRead, { status: "unauthenticated" }>; acceptEnabled?: boolean }) {
  if (offer.status === "unavailable") {
    return <OfferUnavailable message={offer.reason === "authority" ? offer.nextStep : undefined} />
  }
  const accepted = offer.status === "accepted"
  const ready = offer.status === "ready"
  const pendingTerms = offer.status === "terms_pending"
  return (
    <div className="onboarding-page">
      <header>
        <p className="onboarding-kicker">{"conditions" in offer ? `Telloya · ${offer.conditions.tier}` : offer.product}</p>
        <h1>{accepted ? "Offer accepted" : "Commercial offer"}</h1>
        <p className="lead">{offer.nextStep}</p>
      </header>
      <section aria-labelledby="offer-business">
        <h2 id="offer-business">Business</h2>
        <p>{offer.businessName}</p>
        {offer.locations && offer.locations.length > 0 ? (
          <>
            <h3>Covered locations</h3>
            <ul>
              {offer.locations.map(location => <li key={location}>{location}</li>)}
            </ul>
          </>
        ) : null}
      </section>
      {ready || accepted ? (
        <>
          <section aria-labelledby="offer-services">
            <h2 id="offer-services">Included services</h2>
            <ul>
              {offer.services.map(service => <li key={service}>{service}</li>)}
            </ul>
          </section>
          <Price offer={offer} />
          <Agreement offer={offer} />
        </>
      ) : null}
      {pendingTerms ? (
        <p className="onboarding-banner">The agreement for this offer is not available yet. It cannot be accepted until that agreement is approved.</p>
      ) : null}
      {offer.status === "conditions_pending" ? (
        <p className="onboarding-banner">The commercial terms for this offer are not available yet. It cannot be accepted until those terms are approved.</p>
      ) : null}
      {accepted ? (
        <section aria-labelledby="offer-recorded">
          <h2 id="offer-recorded">What happens next</h2>
          <p>This offer is accepted{offer.acceptedAt && when(offer.acceptedAt) ? ` as of ${when(offer.acceptedAt)}` : ""}. Payment and service setup follow separately. Nothing has been paid and the service has not started.</p>
        </section>
      ) : null}
      {ready && acceptEnabled ? <AcceptOfferForm offer={offer} /> : null}
      {ready && !acceptEnabled ? (
        <p className="onboarding-banner">You can read this offer. Accepting it is not available from this page yet.</p>
      ) : null}
      <p className="onboarding-links">
        <a className="portal-button secondary" href="/portal/onboarding">Setup progress</a>
        <a className="portal-button secondary" href="/portal/products">Back to My Products</a>
      </p>
    </div>
  )
}
