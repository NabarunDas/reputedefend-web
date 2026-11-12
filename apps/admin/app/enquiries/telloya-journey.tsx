import { telloyaJourneyProgress, type TelloyaJourneySnapshot } from "@/lib/commercial/telloya-admin-journey"
import { telloyaDemoWriteAvailable } from "@/lib/commercial/telloya-demo-status"

export function TelloyaJourney({ snapshot }: { snapshot: TelloyaJourneySnapshot }) {
  const progress = telloyaJourneyProgress(snapshot)
  if (!progress) return null
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
    <p>{telloyaDemoWriteAvailable() ? "Recording is available to an authorised administrator." : "Recording stays off. The admin journey flag is not enabled, and the source-only migration is not applied."}</p>
    <p><button type="button" disabled>Mark demo booked</button> <button type="button" disabled>Mark demo completed</button></p>
  </section>
}
