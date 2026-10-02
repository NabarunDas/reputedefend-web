import type { CaseDetail } from "@/lib/cases/model"
import type { CaseFlowModel } from "@/lib/case-flow/model"
import { actionOwnershipSummary, caseStatusLabel, priorityLabel, serviceTrackLabels } from "./presentation"

/**
 * The six facts an operator glances at, all of them already on the page or
 * in the model. Nothing here is derived beyond counting the open tasks the
 * case already lists.
 *
 * The ownership row reads the primary action rather than `flow.waitingOn`,
 * which is that action's owner whatever its state and so would call a case
 * the operator has to act on a case they are waiting for.
 */
export function CaseSnapshot({ c, flow }: { c: CaseDetail; flow: CaseFlowModel }) {
  const ownership = actionOwnershipSummary(flow.primaryAction)
  const openTasks = c.tasks.filter(task => task.status === "OPEN").length
  return <section className="panel cockpit-snapshot" aria-labelledby="case-snapshot-heading">
    <h2 id="case-snapshot-heading">Case snapshot</h2>
    <dl>
      <dt>Service track</dt>
      <dd>{serviceTrackLabels[flow.serviceTrack]}</dd>
      <dt>Current phase</dt>
      <dd>{flow.phaseLabel}</dd>
      <dt>{ownership.label}</dt>
      <dd>{ownership.value}</dd>
      <dt>Open tasks</dt>
      <dd>{openTasks}</dd>
      <dt>Case status</dt>
      <dd>{caseStatusLabel(c.status).word}</dd>
      <dt>Priority</dt>
      <dd>{priorityLabel(c.priority).word}</dd>
    </dl>
  </section>
}
