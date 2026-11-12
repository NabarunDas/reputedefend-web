import { telloyaJourneyProgress, type TelloyaJourneySnapshot } from "@/lib/commercial/telloya-admin-journey"
import { formatGbpPence, previewTelloyaOffer } from "@/lib/commercial/telloya-offer"
import { telloyaSetupChecklist } from "@/lib/commercial/telloya-setup"
import { TelloyaDemoForm } from "./telloya-demo-form"

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

export function TelloyaJourney({ snapshot, demo = { availability: "closed" } }: { snapshot: TelloyaJourneySnapshot; demo?: TelloyaDemoPanel }) {
  const progress = telloyaJourneyProgress(snapshot)
  if (!progress) return null
  const preview = previewTelloyaOffer(snapshot.planTier, snapshot.guardLocationCount)
  const setup = telloyaSetupChecklist({ initialInvoicePaid: false, completed: [] })
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
      {demo.scheduledAt && <p>Booked for {demo.scheduledAt}{demo.timezone ? ` (${demo.timezone})` : ""}.</p>}
      {demo.completedAt && <p>Completed at {demo.completedAt}.</p>}
      <TelloyaDemoForm enquiryId={demo.enquiryId} version={demo.version} status={demo.status} timezone={demo.timezone} />
    </>}
    {demo.availability !== "ready" && <p><button type="button" disabled>Mark demo booked</button> <button type="button" disabled>Mark demo completed</button></p>}
    <h3>Offer preview</h3>
    <p>Preview / test only, not available to customers</p>
    <p>Catalogue display only. This is not an approved offer, and Send stays closed until an approved plan, service agreement, and tax treatment exist.</p>
    {preview?.monthlyTotalPence !== null && preview?.monthlyTotalPence !== undefined
      ? <p>Illustrative monthly total {formatGbpPence(preview.monthlyTotalPence)} for {preview.planCode}, including {formatGbpPence(preview.guardAmountPence)} for {preview.guardLocations} Guard locations. One voice location and one number. Overage is off.</p>
      : <p>No illustrative total is available until a plan is confirmed.</p>}
    <p><button type="button" disabled>Send offer</button></p>
    <h3>Setup</h3>
    <p>{setup.next} Going live stays blocked until the voice safety gates are verified. Recording a number or forwarding instructions does not turn forwarding on and does not place a call.</p>
  </section>
}
