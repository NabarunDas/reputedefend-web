import type { OnboardingRequestView, OnboardingStage } from "@/lib/portal/onboarding/types"
import { legalIdentity } from "../../../../../lib/legal"
import { brandSiteUrl } from "../../../../../lib/brand"

const STEPS: readonly { stage: OnboardingStage; label: string }[] = [
  { stage: "received", label: "Request received" },
  { stage: "under_review", label: "Under review" },
  { stage: "verification", label: "Account and business verification" },
  { stage: "offer_preparation", label: "Offer preparation" },
  { stage: "awaiting_customer", label: "Awaiting your response" },
  { stage: "service_setup", label: "Service setup" },
  { stage: "ready", label: "Ready for use" },
]

function when(value: string): string | null {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return `${new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)} UK`
}

const STEP_EVIDENCE: Record<OnboardingStage, readonly string[]> = {
  received: ["Request received"],
  under_review: ["Under review"],
  verification: ["Email checked", "Business authority checked"],
  offer_preparation: ["Offer recorded"],
  awaiting_customer: ["Acceptance recorded", "Payment recorded"],
  service_setup: ["Service setup recorded"],
  ready: ["Ready for use"],
  declined: [],
  closed: [],
}

function stepState(request: OnboardingRequestView, stage: OnboardingStage): "complete" | "current" | "upcoming" {
  if (request.stage === "declined" || request.stage === "closed") return "upcoming"
  if (request.stage === stage) return "current"
  const evidence = STEP_EVIDENCE[stage]
  const recorded = stage === "verification"
    ? evidence.every(item => request.completed.includes(item))
    : evidence.some(item => request.completed.includes(item))
  return recorded ? "complete" : "upcoming"
}

function RequestProgress({ request }: { request: OnboardingRequestView }) {
  const closed = request.stage === "declined" || request.stage === "closed"
  const received = when(request.receivedAt)
  const updated = when(request.updatedAt)
  return (
    <article className="onboarding-request">
      <header>
        <p className="onboarding-kicker">{request.product}</p>
        <h2>{request.statusLabel}</h2>
        <p className={request.customerActionRequired ? "onboarding-banner is-action" : "onboarding-banner"}>
          {request.customerActionRequired ? "Action needed from you." : "Waiting for us."} {request.nextStep}
        </p>
      </header>
      {request.businessName ? (
        <section aria-labelledby={`business-${request.receivedAt}`}>
          <h3 id={`business-${request.receivedAt}`}>Business</h3>
          <p>{request.businessName}</p>
          {request.locations && request.locations.length > 0 ? (
            <>
              <h3>Selected locations</h3>
              <ul>
                {request.locations.map(location => <li key={location}>{location}</li>)}
              </ul>
            </>
          ) : null}
        </section>
      ) : null}
      <section aria-labelledby={`done-${request.receivedAt}`}>
        <h3 id={`done-${request.receivedAt}`}>Completed</h3>
        <ul>
          {request.completed.map(item => <li key={item}>{item}</li>)}
        </ul>
      </section>
      {closed ? <p>This request is closed. Later setup stages are not shown.</p> : (
        <ol className="onboarding-steps" aria-label={`${request.product} progress`}>
          {STEPS.map((step, index) => {
            const state = stepState(request, step.stage)
            return (
              <li key={step.stage} className={`onboarding-step is-${state}`} {...(state === "current" ? { "aria-current": "step" as const } : {})}>
                <span className="onboarding-step-mark" aria-hidden="true">{state === "complete" ? "✓" : index + 1}</span>
                <span>{step.label}</span>
              </li>
            )
          })}
        </ol>
      )}
      <p className="onboarding-times">
        {received ? <span>Received {received}.</span> : null}{" "}
        {updated ? <span>Last updated {updated}.</span> : null}
      </p>
    </article>
  )
}

export function OnboardingUnavailable() {
  return (
    <div className="onboarding-page">
      <h1>Setup progress</h1>
      <p className="onboarding-banner">We couldn&apos;t load setup progress just now. This does not say whether a request is in progress.</p>
      <p><a className="portal-button" href="/portal/products">Back to My Products</a></p>
    </div>
  )
}

export function OnboardingView({ requests }: { requests: readonly OnboardingRequestView[] }) {
  return (
    <div className="onboarding-page">
      <header>
        <h1>Setup progress</h1>
        <p className="lead">This page shows Telloya and Complete requests already on your account. It does not accept an offer, take a payment, or open a service.</p>
      </header>
      {requests.length === 0 ? (
        <p>There is no Telloya or Complete setup request on this account.</p>
      ) : requests.map(request => (
        <RequestProgress key={`${request.product}-${request.businessName ?? "account"}-${request.receivedAt}`} request={request} />
      ))}
      <section className="onboarding-help" aria-labelledby="onboarding-help">
        <h2 id="onboarding-help">Need help?</h2>
        <p>Contact ProfileRelaunch if you are waiting for a step or something on this page looks wrong.</p>
        <p className="onboarding-links">
          <a className="portal-button" href={`mailto:${legalIdentity.contactEmail}`}>{legalIdentity.contactEmail}</a>
          <a className="portal-button secondary" href={`${brandSiteUrl}/contact`}>Contact ProfileRelaunch</a>
          <a className="portal-button secondary" href="/portal/products">Back to My Products</a>
        </p>
      </section>
    </div>
  )
}
