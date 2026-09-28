import Link from "next/link"
import { notFound } from "next/navigation"
import { getCase } from "@/lib/cases/queries"
import { getCaseAuthorization } from "@/lib/authorization/queries"
import { stages, tracks, outcomes } from "@/lib/cases/model"
import { ukDate } from "@/lib/admin/activity"
import { safeWebUrl } from "@/lib/records/model"
import { PlanForm, TransitionForm, NoteForm, TaskForm, ResolveTask, SubmissionForm, ResolveSubmission, CloseForm } from "../forms"
import { AuthorizationPanel } from "./authorization-forms"
import { Badge, PageHeader } from "../../ui"

export const metadata = { title: "Case" }
export default async function CasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ before?: string | string[] }> }) {
  const { id } = await params, { before } = await searchParams
  if (Array.isArray(before)) notFound()
  const c = await getCase(id, before), authz = await getCaseAuthorization(id), closed = ["CLOSED", "CANCELLED"].includes(c.status), events = c.events.slice(0, 50), last = events.at(-1), url = safeWebUrl(c.reviewUrl)
  return <section className="page">
    <Link className="back-link" href="/cases">Back to cases</Link>
    <PageHeader title={c.reference} description={<>{stages[c.stage]} · {tracks[c.track]} · {c.priority}</>} />
    <section className="panel">
      <p>{c.client} — {c.business}</p>
      <p><Link href={`/records/client/${c.customerId}`}>Client</Link> · <Link href={`/records/business/${c.businessId}`}>Business</Link> · <Link href={`/records/location/${c.locationId}`}>Location</Link></p>
      <h2>Original request</h2>
      <p className="preserve-lines">{c.issue}</p>
      {url && <a href={url} target="_blank" rel="noopener noreferrer">Open the review (new tab)</a>}
      {c.type === "REVIEW_PROTECTION" && !url && <p>The exact review URL and agreed scope still need to be recorded in the evidence workflow.</p>}
      <p>Received {ukDate(c.createdAt)}. {c.assigned ? "Assigned to ProfileRelaunch Administrator." : "Unassigned."}</p>
      <p>Next action: {c.nextAction || "Not recorded"}{c.due && ` — ${ukDate(c.due)}`}</p>
      {c.firstResponseDue && <p>First response target: {ukDate(c.firstResponseDue)}</p>}
    </section>
    {closed ? <section className="panel"><h2>Closure</h2><p>{c.outcome ? outcomes[c.outcome] : "Historical closure — outcome not recorded"}</p><p>{c.summary}</p><details><summary>Reopen with a new task</summary><TaskForm key={c.version} c={c} reopen /></details></section> : <>
      <details className="panel"><summary>Assignment, priority and plan</summary><PlanForm key={c.version} c={c} /></details>
      <details className="panel"><summary>Move to the next stage</summary>{c.transitions.length ? <TransitionForm key={c.version} c={c} /> : <p>Use the submission or closure action to continue.</p>}</details>
      <details className="panel"><summary>Add a note</summary><NoteForm key={c.version} c={c} /></details>
    </>}
    <section className="panel">
      <h2>Evidence & Documents</h2>
      <p>Upload files, refresh malware scan status, review versions and record future customer visibility. Files stay in private storage. This does not send an email or open a customer portal.</p>
      <p><Link className="button-link" href={`/cases/${c.id}/evidence`}>Open evidence workspace</Link></p>
    </section>
    {!closed && <AuthorizationPanel caseId={c.id} data={authz} />}
    <section className="panel">
      <h2>Tasks</h2>
      {!c.tasks.length && <p>No tasks recorded.</p>}
      <ul className="task-list">{c.tasks.map(t => <li key={t.id}><strong>{t.title}</strong> · <Badge tone={t.status === "OPEN" ? "info" : t.status === "DONE" ? "success" : "neutral"}>{t.status}</Badge><p>{t.owner === "ADMIN" ? "Admin" : "Customer"} · {ukDate(t.due)} · {t.kind}</p><p>Deadline source: {t.source} · Original timezone: {t.timezone}</p>{t.resolution && <p>{t.resolution}</p>}{!closed && t.status === "OPEN" && <details><summary>Resolve this task</summary><ResolveTask key={c.version} c={c} t={t} /></details>}</li>)}</ul>
      {!closed && <details><summary>Add a task</summary><TaskForm key={c.version} c={c} /></details>}
    </section>
    <section className="panel">
      <h2>Submission attempts</h2>
      {!c.submissions.length && <p>No submission recorded. A prepared pack is not a submitted appeal.</p>}
      {c.submissions.map(s => <article key={s.id}><h3>{s.reference}</h3><p>Submitted by {s.actor === "CUSTOMER" ? "the customer" : "ProfileRelaunch"} on {ukDate(s.submittedAt)} via {s.channel}</p><p>{s.evidence}</p><p>{s.result || "Awaiting a decision"} {s.resultNote}</p>{!closed && !s.result && <details><summary>Record a decision or withdrawal</summary><ResolveSubmission key={c.version} c={c} s={s} /></details>}</article>)}
      {!closed && c.track !== "UNDECIDED" && ["SERVICE_SELECTION", "PAYMENT_REQUIRED", "AUTHORIZATION_REQUIRED", "READY_TO_SUBMIT", "FURTHER_REVIEW"].includes(c.stage) && !c.submissions.some(s => !s.result) && <details><summary>Record an externally completed submission</summary><SubmissionForm key={c.version} c={c} /></details>}
    </section>
    {!closed && <details className="panel"><summary>Close or withdraw this case</summary><CloseForm key={c.version} c={c} /></details>}
    <section className="panel">
      <h2>Customer-visible preview</h2>
      <p>This read-only preview contains approved notes and the closure summary. It does not give customer access or send a message.</p>
      <p>{c.customerPreview.reference}</p>
      {c.customerPreview.summary && <p>{c.customerPreview.summary}</p>}
      {c.customerPreview.notes.map((n, i) => <p key={i} className="preserve-lines">{n}</p>)}
    </section>
    <section className="panel">
      <h2>Case history</h2>
      <p>Workflow events are shown newest first. The original request remains above.</p>
      <ol className="history-list">{events.map(e => <li key={e.id}><strong>{e.event.replaceAll("_", " ")}</strong> · {ukDate(e.createdAt)} · {e.visibility === "CUSTOMER" ? "Approved for customer" : "Internal"}<p className="preserve-lines">{e.note}</p>{typeof e.details.summary === "string" && <p>Closure summary: {e.details.summary}</p>}{typeof e.details.previousSummary === "string" && <p>Previous closure: {e.details.previousSummary}</p>}</li>)}</ol>
      {c.events.length > 50 && last && <Link href={`/cases/${c.id}?before=${last.id}`}>Older history</Link>}
      {before && <p><Link href={`/cases/${c.id}`}>Latest history</Link></p>}
    </section>
  </section>
}
