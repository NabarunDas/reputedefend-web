import { telloyaJourneyProgress, type TelloyaJourneySnapshot } from "@/lib/commercial/telloya-admin-journey"

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
  </section>
}
