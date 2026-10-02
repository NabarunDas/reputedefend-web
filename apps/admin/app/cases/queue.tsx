/**
 * The case queue: one list item per case, each answering the questions an
 * operator asks before deciding what to pick up.
 *
 * Which case is this, whose is it, what human phase is it in, what is the next
 * action, is it ours or are we waiting, is anything blocking it, is anything
 * else wrong with it, is it late, and what is it worth. All of those come from
 * the UX-1 `CaseFlowModel`. None of them is worked out here: there is no phase
 * inferred from a stage, no action read off the recorded note, no urgency
 * score and no re-ordering. Where the model is silent this is silent too.
 *
 * The one thing the queue reads from the case row rather than the model is
 * assignment, which is a staffing fact about who owns the case and not a
 * statement about who owes the next step.
 */

import Link from "next/link"
import type { ReactNode } from "react"
import { ukDate } from "@/lib/admin/activity"
import { outcomes, type CaseRow } from "@/lib/cases/model"
import type { CaseFlowModel, CaseNextAction } from "@/lib/case-flow/model"
import { Badge } from "../ui"
import { actionOwnershipSummary, actionStatePresentation, caseAttentionNotices, priorityLabel, serviceTrackLabels } from "./presentation"

export type CaseQueueEntry = { row: CaseRow; flow: CaseFlowModel }

export function CaseQueue({ entries }: { entries: CaseQueueEntry[] }) {
  return <ul className="case-queue">
    {entries.map(entry => <CaseQueueItem key={entry.row.id} row={entry.row} flow={entry.flow} />)}
  </ul>
}

export function CaseQueueItem({ row, flow }: { row: CaseRow; flow: CaseFlowModel }) {
  const heading = `case-${row.id}`
  return <li>
    <article className="queue-case" aria-labelledby={heading}>
      <div className="queue-case-identity">
        {/* The single link per case. Nothing else in the row is clickable. */}
        <h2 className="queue-case-reference" id={heading}>
          <Link href={`/cases/${row.id}`}>{row.reference}</Link>
        </h2>
        <p className="queue-case-parties">{row.client} · {row.business}</p>
        <p className="queue-case-assignment muted">{row.assigned ? "Assigned" : "Unassigned"}</p>
      </div>
      <CaseQueueStatus flow={flow} priority={row.priority} />
      <CaseQueueAction flow={flow} />
    </article>
  </li>
}

/**
 * The human phase, what the case is worth doing as, and anything about it
 * that is not simply progressing.
 *
 * The attention summary counts rather than lists, for the reason given where
 * `caseAttentionNotices` is defined, and the codes behind it stay where they
 * are useful.
 */
export function CaseQueueStatus({ flow, priority }: { flow: CaseFlowModel; priority: string }) {
  const { word, tone } = priorityLabel(priority)
  const notices = caseAttentionNotices(flow)
  return <div className="queue-case-status">
    <p className="queue-case-phase">{flow.phaseLabel}</p>
    <p className="badge-row">
      <Badge tone="info">{serviceTrackLabels[flow.serviceTrack]}</Badge>
      <Badge tone={tone}>{word}</Badge>
    </p>
    {notices.length > 0 && <p className="queue-case-notices">
      {notices.map(notice => <span key={notice.text} className={`queue-notice queue-notice-${notice.tone}`}>{notice.text}</span>)}
    </p>}
  </div>
}

/**
 * What to do next, said in the model's words.
 *
 * A complete case says so and names its outcome; it is never given an
 * invented next step. An open case gets the resolver's label, the state of
 * that step, who it sits with under the wording that state makes true, and a
 * date only when the model carries an authoritative one.
 */
export function CaseQueueAction({ flow }: { flow: CaseFlowModel }) {
  const action = flow.primaryAction
  if (!action) return <div className="queue-case-action queue-case-action-complete">
    <p className="queue-action-state"><Badge tone="success">Complete</Badge></p>
    <p className="queue-action-label">{completionLabel(flow)}</p>
  </div>

  const { word, tone } = actionStatePresentation[action.state]
  const ownership = actionOwnershipSummary(action)
  return <div className={`queue-case-action queue-case-action-${action.state.toLowerCase().replace("_", "-")}`}>
    <p className="queue-action-state"><Badge tone={tone}>{word}</Badge></p>
    <p className="queue-action-label">{action.label}</p>
    <p className="queue-action-owner muted">{ownership.label}: {ownership.value}</p>
    <CaseQueueDue action={action} />
  </div>
}

/**
 * The action's own date, when it has one. UX-1 never invents a service level,
 * so a case with no authoritative date simply shows none. Lateness itself is
 * said once, as a word, in the status summary beside it.
 */
function CaseQueueDue({ action }: { action: CaseNextAction }): ReactNode {
  if (!action.dueAt) return null
  return <p className={`queue-action-due${action.overdue ? " queue-overdue" : ""}`}>Due {ukDate(action.dueAt)}</p>
}

function completionLabel(flow: CaseFlowModel): string {
  if (flow.outcome && flow.outcome in outcomes) return outcomes[flow.outcome as keyof typeof outcomes]
  return flow.outcome ?? "Outcome not recorded"
}
