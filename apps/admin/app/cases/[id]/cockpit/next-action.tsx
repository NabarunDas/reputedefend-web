import Link from "next/link"
import type { CaseNextAction } from "@/lib/case-flow/model"
import { ukDate } from "@/lib/admin/activity"
import { Badge } from "../../../ui"
import { actionStatePresentation, actionTarget, ownerSentence } from "./presentation"

/**
 * The one thing to do next, as UX-1 chose it.
 *
 * The card presents the recommendation and sends the operator to the place
 * the command already lives. It never performs the action, never repeats the
 * form and never narrows or widens what the model said: a step the model
 * marked as waiting is shown as waiting, with a link to look at rather than a
 * button to press, because pressing it is not what moves the case.
 */
export function CaseNextActionCard({ action }: { action: CaseNextAction }) {
  const state = actionStatePresentation[action.state]
  const target = actionTarget(action)
  return <section className="panel cockpit-next" id="case-next-action" aria-labelledby="case-next-action-heading">
    <p className="eyebrow">Next action</p>
    <h2 id="case-next-action-heading">{action.label}</h2>
    <p className="badge-row"><Badge tone={state.tone}>{state.word}</Badge></p>
    <p>{action.description}</p>
    <p className="cockpit-owner">{ownerSentence(action)}</p>
    {action.dueAt && <p className={action.overdue ? "cockpit-overdue" : "muted"}>
      Due {ukDate(action.dueAt)}{action.overdue && " — overdue"}
    </p>}
    {target && (state.primary
      ? <p><Link className="button-link" href={target.href}>{action.label}</Link></p>
      : <p><Link href={target.href}>View {target.label}</Link></p>)}
  </section>
}

/**
 * What a closed case shows instead. There is no action to recommend, so
 * there is no button; the outcome and the summary are the point.
 */
export function CaseCompletion({ outcome, summary }: { outcome: string | null; summary: string }) {
  return <section className="panel cockpit-next" id="case-next-action" aria-labelledby="case-completion-heading">
    <p className="eyebrow">Case complete</p>
    <h2 id="case-completion-heading">This case is closed</h2>
    <p>Outcome: {outcome ?? "Historical closure — outcome not recorded"}</p>
    {summary && <p className="preserve-lines">{summary}</p>}
    <p className="muted">Nothing is outstanding on the case itself. Anything still open below is handled in its own workspace.</p>
  </section>
}
