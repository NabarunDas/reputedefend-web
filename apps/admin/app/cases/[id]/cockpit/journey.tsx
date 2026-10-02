import type { CaseFlowModel } from "@/lib/case-flow/model"
import type { CasePhaseId } from "@/lib/case-flow/phases"
import { phaseStatePresentation } from "./presentation"

/**
 * The nine-phase journey, exactly as the model reports it.
 *
 * Every phase state comes from `flow.phases`. Nothing here infers that an
 * earlier phase must be finished because a later one has started: a case can
 * move backwards, and a problem found late can reopen an earlier phase, so
 * forcing everything behind the current step to green would be a lie the
 * model is specifically careful not to tell.
 */
export function CaseJourney({ phases, phase, progress }: {
  phases: CaseFlowModel["phases"]
  phase: CasePhaseId
  progress: CaseFlowModel["progressSummary"]
}) {
  // The model's own current phase. It is looked up rather than worked out,
  // and it exists whether or not that phase is flagged as needing attention.
  const current = phases.find(item => item.id === phase)
  return <section className="panel" aria-labelledby="case-journey-heading">
    <h2 id="case-journey-heading">Case journey</h2>
    {current && <p>{current.label}: {current.detail}</p>}
    <p className="muted">{progress.completed} of {progress.total} phases complete.</p>
    <ol className="journey">
      {phases.map(item => {
        const state = phaseStatePresentation[item.state]
        return <li
          key={item.id}
          className={`journey-step journey-${item.state.toLowerCase().replaceAll("_", "-")}`}
          aria-current={item.id === phase ? "step" : undefined}
        >
          <p className="journey-mark" aria-hidden="true">{state.symbol}</p>
          <p className="journey-label">{item.label}</p>
          <p className="journey-state">{state.status}</p>
        </li>
      })}
    </ol>
  </section>
}
