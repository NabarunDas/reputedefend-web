import { formatUkDateTime } from "@/lib/admin/activity"
import { telloyaJourneyProgress, type TelloyaJourneySnapshot, type TelloyaOfferProgress, type TelloyaSetupProgress } from "@/lib/commercial/telloya-admin-journey"
import { formatGbpPence, previewTelloyaOffer } from "@/lib/commercial/telloya-offer"
import { telloyaSetupChecklist, type TelloyaSetupStep } from "@/lib/commercial/telloya-setup"
import { TelloyaDemoForm } from "./telloya-demo-form"
import { TelloyaOfferActions, type TelloyaOfferPanel } from "./telloya-offer-actions"

function demoWhenLabel(iso: string | null, timezone: string): string | null {
  if (!iso) return null
  return formatUkDateTime(iso, timezone)
}

const ACCEPTED_STATES = new Set(["ACCEPTED", "PAYMENT_PENDING", "ACTIVE", "PAUSED", "PAST_DUE", "CANCEL_AT_PERIOD_END"])
const PAID_STATES = new Set(["ACTIVE", "PAUSED", "PAST_DUE", "CANCEL_AT_PERIOD_END"])
const SETUP_STEPS: Record<string, TelloyaSetupStep[]> = {
  NUMBER_REQUIRED: ["preferences", "ai"],
  FORWARDING_REQUIRED: ["preferences", "ai", "number"],
  TEST_REQUIRED: ["preferences", "ai", "number", "forwarding"],
  AWAITING_CONFIRMATION: ["preferences", "ai", "number", "forwarding", "test_call"],
  READY_FOR_PROVIDER_VERIFICATION: ["preferences", "ai", "number", "forwarding", "test_call", "customer_connection"],
}

function setupProgress(state: string | null | undefined): TelloyaSetupProgress {
  if (state === "LIVE") return "active"
  if (state === "READY_FOR_PROVIDER_VERIFICATION") return "ready"
  if (state === "TEST_REQUIRED" || state === "AWAITING_CONFIRMATION") return "testing"
  if (state && state !== "NOT_STARTED") return "preparing"
  return "none"
}

function persistedJourney(snapshot: TelloyaJourneySnapshot, demo: TelloyaDemoPanel, offer: TelloyaOfferPanel): TelloyaJourneySnapshot {
  const next: TelloyaJourneySnapshot = { ...snapshot }
  if (demo.availability === "ready") next.demoStatus = demo.status
  if (offer.availability !== "ready") return next
  const accepted = ACCEPTED_STATES.has(offer.state)
  const offerStatus: TelloyaOfferProgress = offer.amendments.some(item => item.status === "REQUESTED")
    ? "amendment"
    : offer.state === "DRAFT"
      ? "draft"
      : offer.state === "OFFERED"
        ? offer.emailQueued ? "sent" : "prepared"
        : accepted
          ? "accepted"
          : "none"
  next.offerStatus = offerStatus
  next.agreementAccepted = offer.agreementAccepted ?? accepted
  next.paymentStatus = offer.paymentStatus ?? (PAID_STATES.has(offer.state) ? "paid" : offer.state === "PAYMENT_PENDING" ? "verifying" : "none")
  next.setupStatus = setupProgress(offer.provisionState)
  return next
}

export type TelloyaDemoPanel =
  | { availability: "closed" }
  | { availability: "unavailable" }
  | {
      availability: "ready"
      enquiryId: string
      status: "NOT_BOOKED" | "BOOKED" | "COMPLETED"
      version: number
      scheduledAt: string | null
      completedAt: string | null
      timezone: string
    }

export function TelloyaJourney({ snapshot, demo = { availability: "closed" }, offer = { availability: "closed" } }: { snapshot: TelloyaJourneySnapshot; demo?: TelloyaDemoPanel; offer?: TelloyaOfferPanel }) {
  const progress = telloyaJourneyProgress(persistedJourney(snapshot, demo, offer))
  if (!progress) return null
  const preview = previewTelloyaOffer(snapshot.planTier, snapshot.guardLocationCount)
  const paid = offer.availability === "ready" && (offer.paymentStatus === "paid" || PAID_STATES.has(offer.state))
  const setup = telloyaSetupChecklist({
    initialInvoicePaid: paid,
    completed: offer.availability === "ready" ? SETUP_STEPS[offer.provisionState ?? ""] ?? [] : [],
  })
  const bookedLabel = demo.availability === "ready" ? demoWhenLabel(demo.scheduledAt, demo.timezone) : null
  const completedLabel = demo.availability === "ready" ? demoWhenLabel(demo.completedAt, demo.timezone) : null
  const demoZone = demo.availability === "ready" && demo.timezone ? ` (${demo.timezone})` : ""
  return <section className="panel" aria-labelledby="telloya-journey-title">
    <h2 id="telloya-journey-title">Telloya progress</h2>
    <p>{progress.requestLabel} · {progress.planLabel}</p>
    <ol aria-label="Telloya progress">
      {progress.stages.map(stage => <li key={stage.id} aria-current={stage.state === "current" ? "step" : undefined}>
        {stage.label}{stage.state === "current" ? " · current" : stage.state === "complete" ? " · done" : ""}
      </li>)}
    </ol>
    <p><strong>Next step.</strong> {progress.next}</p>
    <p>{progress.owner} · {progress.followUp}</p>
    <h3>Offline demonstration</h3>
    <p>Status starts at not booked. A completed demonstration is recorded only after it has actually finished. This does not book, place, or provision a Retell demonstration.</p>
    {demo.availability === "closed" && <p>Recording stays off. The admin journey flag is not enabled.</p>}
    {demo.availability === "unavailable" && <p>This deployment does not have the demonstration record. Nothing was saved.</p>}
    {demo.availability === "ready" && <>
      <p>Status {demo.status === "NOT_BOOKED" ? "not booked" : demo.status === "BOOKED" ? "booked" : "completed"}. Record version {demo.version}.</p>
      {bookedLabel && <p>Booked for {bookedLabel}{demoZone}.</p>}
      {completedLabel && <p>Completed at {completedLabel}{demoZone}.</p>}
      <TelloyaDemoForm enquiryId={demo.enquiryId} version={demo.version} status={demo.status} timezone={demo.timezone} />
    </>}
    {demo.availability !== "ready" && <p><button type="button" disabled>Mark demo booked</button> <button type="button" disabled>Mark demo completed</button></p>}
    <h3>Offer preview</h3>
    <p>Preview / test only, not available to customers</p>
    <p>Catalogue display only. This is not an approved offer, and Send stays closed until an approved plan, service agreement, and tax treatment exist.</p>
    {preview?.monthlyTotalPence !== null && preview?.monthlyTotalPence !== undefined
      ? <p>Illustrative monthly total {formatGbpPence(preview.monthlyTotalPence)} for {preview.planCode}, including {formatGbpPence(preview.guardAmountPence)} for {preview.guardLocations} Guard locations. One voice location and one number. Overage is off.</p>
      : <p>No illustrative total is available until a plan is confirmed.</p>}
    <TelloyaOfferActions offer={offer} />
    {offer.availability !== "ready" && <p><button type="button" disabled>Send offer</button></p>}
    <h3>Setup</h3>
    <p>{setup.next} Going live stays blocked until the voice safety gates are verified. Recording a number or forwarding instructions does not turn forwarding on and does not place a call.</p>
  </section>
}
