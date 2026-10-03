import Link from "next/link"
import { notFound } from "next/navigation"
import { getCase } from "@/lib/cases/queries"
import { getCaseAuthorization } from "@/lib/authorization/queries"
import { loadCaseFlow } from "@/lib/case-flow/load"
import { outcomes } from "@/lib/cases/model"
import { ukDate } from "@/lib/admin/activity"
import { caseDestination } from "@/lib/case-flow/destinations"
import { isUuid, safeWebUrl } from "@/lib/records/model"
import { PlanForm, TransitionForm, NoteForm, TaskForm, ResolveTask, SubmissionForm, ResolveSubmission, CloseForm } from "../forms"
import { AuthorizationPanel } from "./authorization-forms"
import { Badge } from "../../ui"
import { CaseHeader } from "./cockpit/header"
import { CaseJourney } from "./cockpit/journey"
import { CaseCompletion, CaseNextActionCard } from "./cockpit/next-action"
import { CaseAttention, CaseBlockers } from "./cockpit/notices"
import { CasePrerequisites } from "./cockpit/prerequisites"
import { CaseSnapshot } from "./cockpit/snapshot"
import { actionTarget } from "./cockpit/presentation"

export const metadata = { title: "Case" }

/**
 * The case cockpit.
 *
 * The page answers six questions in its first screen — whose case this is,
 * where it has got to, what is done, what is stopping it, who it is waiting
 * on and what to do next — and it answers all of them by rendering the UX-1
 * case flow model. It does not work any of them out. There is no second
 * status mapping here, no phase inferred from a stage, no prerequisite
 * recalculated and no blocker decided; where the model is silent the page is
 * silent too.
 *
 * Everything below the cockpit is the existing case workspace, regrouped.
 * Every command is the command it was before, with the checks it had before.
 * The cockpit recommends and navigates; it never acts.
 */
export default async function CasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ before?: string | string[] }> }) {
  const { id } = await params, { before } = await searchParams
  if (Array.isArray(before)) notFound()
  // `getCase` validates the identifier and the history cursor and is the read
  // that decides whether this page exists at all, so it goes first. The
  // authorisation read and the flow projection are independent of each other.
  // A failure in either is left to propagate: a projection that cannot be
  // built is a problem to see, not one to paper over with the old layout.
  const c = await getCase(id, before)
  const [authz, flow] = await Promise.all([getCaseAuthorization(id), loadCaseFlow(id)])

  const closed = ["CLOSED", "CANCELLED"].includes(c.status)
  const events = c.events.slice(0, 50), last = events.at(-1), url = safeWebUrl(c.reviewUrl)
  const openTasks = c.tasks.filter(task => task.status === "OPEN")
  const settledTasks = c.tasks.filter(task => task.status !== "OPEN")
  const unresolved = c.submissions.filter(s => !s.result)
  // Unchanged from before the redesign, including the stage list.
  const canRecordSubmission = !closed && c.track !== "UNDECIDED"
    && ["SERVICE_SELECTION", "PAYMENT_REQUIRED", "AUTHORIZATION_REQUIRED", "READY_TO_SUBMIT", "FURTHER_REVIEW"].includes(c.stage)
    && unresolved.length === 0

  // Which section of this page the recommendation points at, so that section
  // can be open when the operator arrives at it. It opens a disclosure; it
  // does not grant, withhold or pre-fill anything.
  const recommended = flow.primaryAction ? actionTarget(flow.primaryAction) : null
  const openSection = recommended?.href.startsWith("#") ? recommended.href.slice(1) : null

  // UX-1 returns the Guided and Managed checklists for the whole life of a
  // case, which is right for the model and wrong to put on screen the whole
  // time: a case in Submission does not need its satisfied permissions read
  // back to it, and a case in Service does not yet need to read requirements
  // it has not reached. The journey already says which of those a case is in,
  // so the phase decides whether the list is worth showing. It decides
  // nothing about whether the prerequisites are met.
  const prerequisitePhase = flow.phases.find(item => item.id === "PREREQUISITES")?.state
  const showPrerequisites = prerequisitePhase === "CURRENT" || prerequisitePhase === "NEEDS_ATTENTION"

  return <section className="page">
    <Link className="back-link" href="/cases">Back to cases</Link>
    <CaseHeader c={c} flow={flow} />
    {flow.reopened && <p className="notice">This case was previously closed and has been reopened for further work.</p>}
    <CaseJourney phases={flow.phases} phase={flow.phase} progress={flow.progressSummary} />
    <div className="cockpit-split">
      {flow.primaryAction
        ? <CaseNextActionCard action={flow.primaryAction} />
        : <CaseCompletion outcome={c.outcome ? outcomes[c.outcome] : null} summary={c.summary} />}
      <CaseSnapshot c={c} flow={flow} />
    </div>
    <CaseBlockers blockers={flow.blockers} />
    <CaseAttention items={flow.attentionItems} />
    {showPrerequisites && <CasePrerequisites groups={flow.prerequisites} />}

    <section className="cockpit-group" aria-labelledby="case-work-heading">
      <h2 className="cockpit-group-heading" id="case-work-heading">Work on this case</h2>
      <section className="panel" id="case-plan">
        <h3>Case planning</h3>
        <p>Recorded plan: {c.nextAction || "Not recorded"}{c.due && ` — ${ukDate(c.due)}`}</p>
        {c.firstResponseDue && <p>First response target: {ukDate(c.firstResponseDue)}</p>}
        <p className="muted">This is the operator&rsquo;s own note about the case. The recommendation above is worked out from the case itself.</p>
        {!closed && <details open={openSection === "case-plan"}>
          <summary>Edit assignment, priority and plan</summary>
          <PlanForm key={c.version} c={c} />
        </details>}
      </section>
      {!closed && <section className="panel" id="case-progress">
        <h3>Progress case</h3>
        <p className="muted">Moving the stage records where the case has got to. It does not satisfy a prerequisite the database is still waiting for.</p>
        <details open={openSection === "case-progress"}>
          <summary>Move to another stage</summary>
          {c.transitions.length ? <TransitionForm key={c.version} c={c} /> : <p>Use the submission or closure action to continue.</p>}
        </details>
      </section>}
      {!closed && <div id="case-authorisation"><AuthorizationPanel caseId={c.id} data={authz} /></div>}
      <section className="panel" id="case-tasks">
        <h3>Tasks ({openTasks.length} open)</h3>
        {!c.tasks.length && <p>No tasks recorded.</p>}
        {!!openTasks.length && <ul className="task-list">{openTasks.map(t => <li key={t.id}>
          <strong>{t.title}</strong> · <Badge tone="info">{t.status}</Badge>
          <p>{t.owner === "ADMIN" ? "Admin" : "Customer"} · {ukDate(t.due)} · {t.kind}</p>
          <p>Deadline source: {t.source} · Original timezone: {t.timezone}</p>
          {t.resolution && <p>{t.resolution}</p>}
          {!closed && <details><summary>Resolve this task<span className="sr-only">: {t.title}</span></summary><ResolveTask key={c.version} c={c} t={t} /></details>}
        </li>)}</ul>}
        {!!settledTasks.length && <details>
          <summary>Completed and cancelled tasks ({settledTasks.length})</summary>
          <ul className="task-list">{settledTasks.map(t => <li key={t.id}>
            <strong>{t.title}</strong> · <Badge tone={t.status === "DONE" ? "success" : "neutral"}>{t.status}</Badge>
            <p>{t.owner === "ADMIN" ? "Admin" : "Customer"} · {ukDate(t.due)} · {t.kind}</p>
            <p>Deadline source: {t.source} · Original timezone: {t.timezone}</p>
            {t.resolution && <p>{t.resolution}</p>}
          </li>)}</ul>
        </details>}
        {!closed && <details><summary>Add a task</summary><TaskForm key={c.version} c={c} /></details>}
      </section>
      <section className="panel" id="case-submissions">
        <h3>Submission attempts</h3>
        {!c.submissions.length && <p>No submission recorded. A prepared pack is not a submitted appeal.</p>}
        {!!unresolved.length && <p>An attempt is recorded with no decision against it. Nothing further can be submitted until it is resolved.</p>}
        {c.submissions.map(s => <article key={s.id}>
          <h4>{s.reference}</h4>
          <p>Submitted by {s.actor === "CUSTOMER" ? "the customer" : "ProfileRelaunch"} on {ukDate(s.submittedAt)} via {s.channel}</p>
          <p>{s.evidence}</p>
          <p>{s.result || "Awaiting a decision"} {s.resultNote}</p>
          {!closed && !s.result && <details><summary>Record a decision or withdrawal<span className="sr-only">: {s.reference}</span></summary><ResolveSubmission key={c.version} c={c} s={s} /></details>}
        </article>)}
        {canRecordSubmission && <details open={openSection === "case-submissions"}>
          <summary>Record an externally completed submission</summary>
          <SubmissionForm key={c.version} c={c} />
        </details>}
      </section>
      {!closed && <section className="panel">
        <h3>Notes</h3>
        <details><summary>Add a note</summary><NoteForm key={c.version} c={c} /></details>
      </section>}
      {!closed && <section className="panel" id="case-closure">
        <h3>Close or withdraw this case</h3>
        <p className="muted">Closing is permanent and records an outcome against the case. Reopening is possible but is itself a recorded event.</p>
        <details open={openSection === "case-closure"}><summary>Record the outcome and close</summary><CloseForm key={c.version} c={c} /></details>
      </section>}
      {closed && <section className="panel">
        <h3>Closure</h3>
        <p>{c.outcome ? outcomes[c.outcome] : "Historical closure — outcome not recorded"}</p>
        <p className="preserve-lines">{c.summary}</p>
        <details><summary>Reopen with a new task</summary><TaskForm key={c.version} c={c} reopen /></details>
      </section>}
    </section>

    <section className="cockpit-group" aria-labelledby="case-workspaces-heading">
      <h2 className="cockpit-group-heading" id="case-workspaces-heading">Supporting workspaces</h2>
      <section className="panel">
        <h3>Evidence &amp; Documents</h3>
        <p className="muted">Upload files, refresh malware scan status, review versions and record future customer visibility. Files stay in private storage. This does not send an email or open a customer portal.</p>
        <p><Link className="button-link secondary" href={`/cases/${c.id}/evidence`}>Open evidence workspace</Link></p>
      </section>
      <section className="panel">
        <h3>Communications</h3>
        <p className="muted">Draft, review and queue customer email. Provider acceptance is not delivery, and live sending stays blocked on the current daily scheduler.</p>
        {caseDestination("CASE_COMMUNICATIONS", c.id) && <p><Link className="button-link secondary" href={caseDestination("CASE_COMMUNICATIONS", c.id)!.href}>Open case communications</Link></p>}
      </section>
      <section className="panel">
        <h3>Related records</h3>
        <p className="cockpit-links">
          {isUuid(c.customerId) ? <Link href={`/records/client/${c.customerId}`}>Open the client record</Link> : <span className="muted">No client record</span>}
          {isUuid(c.businessId) ? <Link href={`/records/business/${c.businessId}`}>Open the business record</Link> : <span className="muted">No business record</span>}
          {isUuid(c.locationId) ? <Link href={`/records/location/${c.locationId}`}>Open the location record</Link> : <span className="muted">No location recorded</span>}
        </p>
      </section>
    </section>

    <section className="cockpit-group" aria-labelledby="case-details-heading">
      <h2 className="cockpit-group-heading" id="case-details-heading">Case details</h2>
      <section className="panel">
        <h3>Case context</h3>
        <h4>Original request</h4>
        <p className="preserve-lines">{c.issue}</p>
        {url && <p><a href={url} target="_blank" rel="noopener noreferrer">Open the review (new tab)</a></p>}
        {c.type === "REVIEW_PROTECTION" && !url && <p>The exact review URL and agreed scope still need to be recorded in the evidence workflow.</p>}
        <p>Received {ukDate(c.createdAt)}.</p>
      </section>
      <details className="panel">
        <summary>Customer-visible preview</summary>
        <p>This is a preview. It is read-only, contains approved notes and the closure summary, and does not give customer access or send a message.</p>
        <p>{c.customerPreview.reference}</p>
        {c.customerPreview.summary && <p>{c.customerPreview.summary}</p>}
        {c.customerPreview.notes.map((n, i) => <p key={i} className="preserve-lines">{n}</p>)}
      </details>
      <details className="panel">
        <summary>Technical and operator details</summary>
        <dl>
          <dt>Technical stage</dt>
          <dd>{flow.technicalStageLabel} ({flow.technicalStage})</dd>
          <dt>Stored case status</dt>
          <dd>{c.status}</dd>
          <dt>Assignment</dt>
          <dd>{c.assigned ? "Assigned to ProfileRelaunch Administrator" : "Unassigned"}</dd>
          <dt>Recorded operator plan</dt>
          <dd>{c.nextAction || "Not recorded"}</dd>
          <dt>Recorded due date</dt>
          <dd>{c.due ? ukDate(c.due) : "Not recorded"}</dd>
        </dl>
      </details>
    </section>

    <section className="cockpit-group" aria-labelledby="case-history-heading">
      <h2 className="cockpit-group-heading" id="case-history-heading">History</h2>
      <section className="panel">
        <h3>Case history</h3>
        <p className="muted">Workflow events are shown newest first. The original request remains above.</p>
        <ol className="history-list">{events.map(e => <li key={e.id}><strong>{e.event.replaceAll("_", " ")}</strong> · {ukDate(e.createdAt)} · {e.visibility === "CUSTOMER" ? "Approved for customer" : "Internal"}<p className="preserve-lines">{e.note}</p>{typeof e.details.summary === "string" && <p>Closure summary: {e.details.summary}</p>}{typeof e.details.previousSummary === "string" && <p>Previous closure: {e.details.previousSummary}</p>}</li>)}</ol>
        {c.events.length > 50 && last && <Link href={`/cases/${c.id}?before=${last.id}`}>Older history</Link>}
        {before && <p><Link href={`/cases/${c.id}`}>Latest history</Link></p>}
      </section>
    </section>
  </section>
}
