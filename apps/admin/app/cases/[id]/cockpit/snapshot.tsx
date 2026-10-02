import type { CaseDetail } from "@/lib/cases/model"
import type { CaseFlowModel } from "@/lib/case-flow/model"
import { caseStatusLabel, priorityLabel, serviceTrackLabels, waitingLabel } from "./presentation"

/**
 * The six facts an operator glances at, all of them already on the page or
 * in the model. Nothing here is derived beyond counting the open tasks the
 * case already lists.
 */
export function CaseSnapshot({ c, flow }: { c: CaseDetail; flow: CaseFlowModel }) {
  const waiting = waitingLabel(flow.waitingOn)
  const openTasks = c.tasks.filter(task => task.status === "OPEN").length
  return <section className="panel cockpit-snapshot" aria-labelledby="case-snapshot-heading">
    <h2 id="case-snapshot-heading">Case snapshot</h2>
    <dl>
      <dt>Service track</dt>
      <dd>{serviceTrackLabels[flow.serviceTrack]}</dd>
      <dt>Current phase</dt>
      <dd>{flow.phaseLabel}</dd>
      <dt>Waiting on</dt>
      <dd>{waiting ?? "Nobody"}</dd>
      <dt>Open tasks</dt>
      <dd>{openTasks}</dd>
      <dt>Case status</dt>
      <dd>{caseStatusLabel(c.status).word}</dd>
      <dt>Priority</dt>
      <dd>{priorityLabel(c.priority).word}</dd>
    </dl>
  </section>
}
