import type { HandoverSubscription } from "@/lib/portal/onboarding/handover"
import { CopyForwardingNumber } from "./copy-number"

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
        {subscription.paymentScope === "initial_settlement" ? (
          <p>This confirms the initial settlement for the recorded period. A later period is not shown as paid.</p>
        ) : null}
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
            {subscription.guard.assignment === "pending_confirmation" ? (
              <p>Guard location assignment is pending confirmation.</p>
            ) : (
              <ul>
                {subscription.guard.locations.map(location => <li key={location.locationId}>{location.locationName}</li>)}
              </ul>
            )}
          </>
        ) : <p>Relaunch Guard is not included in this subscription.</p>}
      </section>
      {subscription.servicePreferences ? <section>
        <h3>Business preferences</h3>
        {subscription.servicePreferences.state === "complete" ? (
          <p>Preferences are recorded for every selected location. This is the record your setup team made from your confirmation. You will still confirm the service before it is activated.{subscription.serviceConfiguration && subscription.serviceConfiguration.state !== "needed" ? "" : " The receptionist is not configured or active."}</p>
        ) : subscription.servicePreferences.state === "partial" ? (
          <p>Preferences are recorded for {subscription.servicePreferences.confirmedCount} of {subscription.servicePreferences.locationCount} locations. The others are still needed.</p>
        ) : (
          <p>Your confirmed business preferences are still needed. Your setup team records them after you confirm them. This does not turn the receptionist on.</p>
        )}
        {subscription.servicePreferences.locations.map(location => {
          const configuration = subscription.serviceConfiguration?.locations.find(entry => entry.locationId === location.locationId)
          return (
          <article key={location.locationId}>
            <h4>{location.locationName}</h4>
            {location.status === "needed" ? <p>Preferences for this location are still needed.</p> : <>
              {configuration ? null : <p>{location.note}</p>}
              <p>Timezone: {location.timezone}</p>
              <p>Hours: {location.hoursSummary}</p>
              <p>Greeting: {location.greeting}</p>
              <p>Callback: {location.callbackInstructions}</p>
              <p>Language: {location.spokenLanguage}{location.additionalLanguages.length > 0 ? ` (also ${location.additionalLanguages.join(", ")})` : ""}</p>
              <p>Voice preference: {location.voicePresentation}{location.accent ? `, ${location.accent} accent` : ""}</p>
            </>}
          </article>
          )
        })}
      </section> : null}
      {subscription.serviceConfiguration ? <section>
        <h3>AI receptionist configuration</h3>
        {subscription.serviceConfiguration.state === "recorded" ? (
          <p>Your AI receptionist configuration has been recorded. We&apos;re completing the telephone setup and service checks.</p>
        ) : subscription.serviceConfiguration.state === "review" ? (
          <p>A confirmed preference changed after the configuration was recorded. The setup team needs to review it. The receptionist is not answering calls.</p>
        ) : subscription.serviceConfiguration.state === "partial" ? (
          <p>The AI configuration is recorded for {subscription.serviceConfiguration.recordedCount} of {subscription.serviceConfiguration.locationCount} locations. The receptionist cannot answer calls.</p>
        ) : (
          <p>The AI receptionist configuration has not been recorded. It cannot answer calls.</p>
        )}
        {subscription.serviceConfiguration.locations.map(location => (
          <article key={location.locationId}>
            <h4>{location.locationName}</h4>
            <p>{location.note}</p>
          </article>
        ))}
      </section> : null}
      {subscription.serviceAllocation ? <section>
        <h3>Telephone number</h3>
        {subscription.serviceAllocation.state === "recorded" ? (
          <p>Your receptionist number has been recorded. We&apos;re preparing the forwarding instructions and final service checks.</p>
        ) : subscription.serviceAllocation.state === "review" ? (
          <p>The recorded telephone number needs another check. It is not active and forwarding is not ready.</p>
        ) : subscription.serviceAllocation.state === "partial" ? (
          <p>A receptionist number is recorded for {subscription.serviceAllocation.recordedCount} of {subscription.serviceAllocation.locationCount} locations. Forwarding is not ready and the receptionist cannot answer calls.</p>
        ) : (
          <p>A receptionist number has not been recorded. Forwarding is not ready and the receptionist cannot answer calls.</p>
        )}
        {subscription.serviceAllocation.locations.map(location => (
          <article key={location.locationId}>
            <h4>{location.locationName}</h4>
            <p>{location.note}</p>
          </article>
        ))}
      </section> : null}
      {subscription.serviceTest ? <section>
        <h3>AI receptionist test call</h3>
        {subscription.serviceTest.state === "passed" ? (
          <p>Your AI receptionist has passed its conversation test. We still need to confirm the final telephone connection before your service can go live.</p>
        ) : (
          <p>This step checks a controlled conversation with the AI receptionist. It does not check the telephone connection, and the receptionist is not answering calls.</p>
        )}
        {subscription.serviceTest.locations.map(location => (
          <article key={location.locationId}>
            <h4>{location.locationName}</h4>
            <p>{location.note}</p>
          </article>
        ))}
      </section> : null}
      {subscription.serviceForwarding && subscription.serviceForwarding.sharedCount > 0 ? <section>
        <h3>Telephone setup</h3>
        <p>Instructions ready — service testing pending. These notes prepare a later connection. They are not proof that forwarding is switched on.</p>
        {subscription.serviceForwarding.locations.map(location => (
          <article key={location.locationId}>
            <h4>{location.locationName}</h4>
            {location.status === "shared" && location.e164 && location.instruction ? (
              <>
                <p>Assigned forwarding number</p>
                <p>{location.e164} <CopyForwardingNumber number={location.e164} /></p>
                <p>Forwarding method: {location.forwardingLabel}.</p>
                {location.carrierKnown && location.carrierName ? <p>Telephone provider: {location.carrierName}.</p> : <p>Exact settings vary by telephone provider.</p>}
                <p>{location.instruction}</p>
                <p>{location.notice}</p>
              </>
            ) : <p>{location.notice}</p>}
          </article>
        ))}
      </section> : null}
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
