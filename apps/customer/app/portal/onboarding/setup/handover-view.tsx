import type { HandoverSubscription } from "@/lib/portal/onboarding/handover"

const PAYMENT_RECEIVED = "Your subscription payment has been confirmed. We're preparing your service and will guide you through the remaining setup steps."

function when(value: string): string | null {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return `${new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)} UK`
}

export function HandoverUnavailable() {
  return (
    <div className="onboarding-page">
      <h1>Service setup</h1>
      <p className="onboarding-banner">We couldn&apos;t load service setup just now. This does not say whether a payment was recorded.</p>
      <p><a className="portal-button" href="/portal/products">Back to My Products</a></p>
    </div>
  )
}

function SubscriptionSetup({ subscription }: { subscription: HandoverSubscription }) {
  const paid = subscription.financialStatus === "verified" && subscription.operationalStatus === "not_started"
  const confirmed = subscription.paymentConfirmedAt ? when(subscription.paymentConfirmedAt) : null
  return (
    <article className="onboarding-request">
      <header>
        <p className="onboarding-kicker">{subscription.product} · {subscription.reference}</p>
        <h2>{paid ? "Payment received" : subscription.customerDisplay}</h2>
        {paid ? <p>Setup pending</p> : null}
        <p className="onboarding-banner">{paid ? PAYMENT_RECEIVED : subscription.customerDisplay}</p>
      </header>
      <section>
        <h3>Business</h3>
        <p>{subscription.businessName}</p>
        {subscription.locations.length > 0 ? (
          <>
            <h3>Selected locations</h3>
            <ul>
              {subscription.locations.map(location => <li key={location.locationId}>{location.locationName}</li>)}
            </ul>
          </>
        ) : null}
      </section>
      <section>
        <h3>Guard</h3>
        {subscription.guard.included ? (
          <>
            <p>Included in your package. Monitoring setup is pending.</p>
            <p>{subscription.guard.quantity} {subscription.guard.quantity === 1 ? "location" : "locations"} included. Monitoring has not started.</p>
            {subscription.guard.locations.length > 0 ? (
              <ul>
                {subscription.guard.locations.map(location => <li key={location.locationId}>{location.locationName}</li>)}
              </ul>
            ) : null}
          </>
        ) : <p>Relaunch Guard is not included in this subscription.</p>}
      </section>
      <section>
        <h3>Setup checklist</h3>
        <ol className="onboarding-steps" aria-label={`${subscription.product} setup`}>
          {subscription.checklist.map((step, index) => (
            <li key={step.key} className={`onboarding-step is-${step.state === "complete" ? "complete" : "upcoming"}`}>
              <span className="onboarding-step-mark" aria-hidden="true">{step.state === "complete" ? "✓" : index + 1}</span>
              <span>{step.label}</span>
              <span className="muted">{step.state === "complete" ? "Complete" : "Planned"}</span>
            </li>
          ))}
        </ol>
      </section>
      {confirmed ? <p className="onboarding-times">Payment confirmed {confirmed}.</p> : null}
    </article>
  )
}

export function HandoverView({ subscriptions }: { subscriptions: readonly HandoverSubscription[] }) {
  return (
    <div className="onboarding-page">
      <header>
        <h1>Service setup</h1>
        <p className="lead">This page shows whether payment has been confirmed and which setup steps are still planned. It does not buy a number, configure an assistant, or activate a service.</p>
      </header>
      {subscriptions.length === 0 ? (
        <p>There is no Telloya or Complete subscription waiting for setup on this account.</p>
      ) : subscriptions.map(subscription => (
        <SubscriptionSetup key={subscription.reference} subscription={subscription} />
      ))}
      <p><a className="portal-button" href="/portal/products">Back to My Products</a></p>
    </div>
  )
}
