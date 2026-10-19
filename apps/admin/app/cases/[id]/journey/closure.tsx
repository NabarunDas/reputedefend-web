import Link from "next/link"
import type { JourneyClosurePanel } from "@/lib/case-journey/closure"
import { ukDate } from "@/lib/admin/activity"
import type { CaseDetail } from "@/lib/cases/model"
import { CloseForm, TaskForm } from "../../forms"

/**
 * Step 11 closes or reopens with the existing case commands.
 * The outcome and summary already recorded are repeated exactly.
 * Guard is linked, never required, and never started from here.
 */
export function ClosurePanel({ caseDetail, panel }: { caseDetail: CaseDetail; panel: JourneyClosurePanel }) {
  return <div className="guided-facts" data-closure={panel.headline}>
    <p><strong>{panel.headline}.</strong> {panel.detail}</p>
    <p>Case status: {panel.statusLabel}. Verified outcome: {panel.outcomeLabel}. Service track: {panel.trackLabel}.</p>
    <p className="preserve-lines">Stored customer summary: {panel.summary || "Not recorded"}</p>
    {panel.otherSummary !== null && <p className="notice preserve-lines">Case record summary: {panel.otherSummary || "Not recorded"}</p>}
    <p>Billing position: {panel.billingLabel}</p>
    {panel.tasks.length === 0
      ? <p>No tasks are recorded.</p>
      : <ul>
        {panel.tasks.map(task => <li key={task.id}><strong>{task.title}: {task.state}.</strong></li>)}
      </ul>}
    {panel.attempts.length === 0
      ? <p>No submission attempt is recorded.</p>
      : <ul>
        {panel.attempts.map(attempt => <li key={attempt.id}><strong>{attempt.reference}: {attempt.state}.</strong></li>)}
      </ul>}
    {panel.closureRecord
      ? <div>
        <h3>Closure record</h3>
        <p>Status {panel.closureRecord.status}. Outcome: {panel.closureRecord.outcomeLabel}.</p>
        <p className="preserve-lines">{panel.closureRecord.summary || "No customer summary is stored."}</p>
      </div>
      : <p>No closure record. The database status has not confirmed CLOSED or CANCELLED.</p>}
    <h3>Closure history</h3>
    {panel.history.length === 0
      ? <p>No close, reopen or outcome event is in the loaded history.</p>
      : <ol className="history-list">
        {panel.history.map(item => <li key={item.id}>
          <strong>{item.label}</strong> · {ukDate(item.at)}
          <p className="preserve-lines">{item.detail}</p>
        </li>)}
      </ol>}
    {panel.blockers.length > 0 && <div className="guided-warning">
      <p><strong>Closure is not offered yet</strong></p>
      <ul>{panel.blockers.map(item => <li key={item}>{item}</li>)}</ul>
    </div>}
    {panel.notices.map(notice => <p key={notice} className="notice">{notice}</p>)}
    <p><strong>Who must act.</strong> {panel.who}</p>
    <p>Case version {panel.version}. A newer version is refused, and the case stays as the database left it.</p>
    {panel.commands?.close && panel.locked && <details>
      <summary>Close with the recorded outcome</summary>
      <CloseForm c={caseDetail} locked={panel.locked} />
    </details>}
    {panel.commands?.reopen && <details>
      <summary>Reopen with a follow-up task</summary>
      <TaskForm key={caseDetail.version} c={caseDetail} reopen />
    </details>}
    <section>
      <h3>Optional Relaunch Guard</h3>
      <p>{panel.guard.text}</p>
      <p><Link href={panel.guard.href}>Open the Guard workspace</Link></p>
    </section>
    <p>This step does not send a closure email, submit anything to Google, or collect a payment.</p>
  </div>
}
