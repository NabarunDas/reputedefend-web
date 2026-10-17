import Link from "next/link"
import { requireStaff } from "@/lib/require-staff"
import { ukDate } from "@/lib/admin/activity"
import { renderEvidenceRequest } from "@/lib/communications/brand-email"
import { loadTemplates } from "@/lib/settings/queries"
import { EmptyState, PageHeader } from "../../ui"
import { ApproveButton, SettingsActionForm } from "../forms"
import styles from "./templates.module.css"

export const metadata = { title: "Review email templates" }

type TemplateRow = {
  id: string
  key: string
  version: number
  name: string
  subject: string
  body?: string | null
  createdAt: string
  recordVersion?: number
}

const SAMPLE_REF = "PR-EXAMPLE-0001"
const SAMPLE_URL = "https://customer.profilerelaunch.com/action/00000000-0000-4000-8000-000000000001"

/** A non-deliverable demonstration: the complete template text below is authoritative. */
function exampleFor(row: TemplateRow): string | null {
  if (row.key !== "EVIDENCE_REQUEST" || row.version < 3 || !row.body) return null
  const marker = "Documents requested"
  const position = row.body.indexOf(marker)
  if (position < 0) return null
  const prose = row.body.slice(0, position).trim().replaceAll("{case_ref}", SAMPLE_REF)
  const sample = renderEvidenceRequest({
    caseRef: SAMPLE_REF,
    introduction: prose,
    documents: ["Google's suspension or rejection notice", "Supporting information relevant to the case"],
    uploadUrl: SAMPLE_URL,
  })
  return sample?.html ?? null
}

function TemplateCard({ row, draft }: { row: TemplateRow; draft: boolean }) {
  const bodyAvailable = typeof row.body === "string" && row.body.trim().length > 0
  const exampleHtml = bodyAvailable ? exampleFor(row) : null
  return <li className={styles.card}>
    <div className={styles.heading}>
      <div>
        <strong>{row.name}</strong>
        <p className={styles.meta}>{row.key} · Version {row.version} · {draft ? "Draft — not active" : "Approved"}</p>
      </div>
      <span className={styles.meta}>{ukDate(row.createdAt)}</span>
    </div>
    <p className={styles.label}>Saved subject</p>
    <p className={styles.subject}>{row.subject}</p>
    {bodyAvailable ? <>
      <p className={styles.label}>Complete saved message wording</p>
      <pre className={styles.body}>{row.body}</pre>
      <p className={styles.meta}>Text in braces, such as {"{case_ref}"}, is replaced when the actual customer email is generated.</p>
      {exampleHtml ? <details className={styles.example}>
        <summary>See example branded layout</summary>
        <p className={styles.meta}>Illustration with sample documents and a non-working example upload link. The complete saved template wording is shown above. The final email is generated from the approved template and its case data.</p>
        <iframe
          className={styles.frame}
          title={`Sample branded email layout for ${row.key} version ${row.version}`}
          srcDoc={exampleHtml}
          sandbox=""
          referrerPolicy="no-referrer"
          loading="lazy"
        />
      </details> : null}
      {draft ? <div className={styles.actions}>
        <ApproveButton operation="approve_template_draft" id={row.id} version={row.recordVersion ?? 1} label="Approve" record={`${row.key}: ${row.name}`} />
      </div> : <div className={styles.actions}>
        <ApproveButton operation="retire_template" id={row.id} version={row.recordVersion ?? 1} label="Retire template" record={`${row.key} v${row.version}`} />
      </div>}
    </> : <p className={styles.unavailable} role="status">
      Full saved wording is unavailable. Approval is blocked until the template preview is enabled.
    </p>}
  </li>
}

export default async function TemplatesPage() {
  await requireStaff()
  const data = await loadTemplates() as {
    approved?: TemplateRow[]
    drafts?: TemplateRow[]
  }
  return <section className="page">
    <Link className="back-link" href="/settings">Back to settings</Link>
    <PageHeader title="Review email templates" description="Read the complete saved wording before approving. New templates are inactive drafts until approved. Outgoing email sending remains disabled." />
    <section className="panel">
      <h2>Drafts awaiting review</h2>
      {!data.drafts?.length ? <EmptyState>No unpublished drafts.</EmptyState> : (
        <ul className={styles.grid}>{data.drafts.map(row => <TemplateCard key={row.id} row={row} draft />)}</ul>
      )}
    </section>
    <section className="panel">
      <h2>Approved versions</h2>
      {!data.approved?.length ? <EmptyState>No approved templates.</EmptyState> : (
        <ul className={styles.grid}>{data.approved.map(row => <TemplateCard key={row.id} row={row} draft={false} />)}</ul>
      )}
    </section>
    <section className="panel">
      <h2>Create template draft</h2>
      <SettingsActionForm
        operation="create_template_draft"
        submit="Save template draft"
        fields={[
          { name: "templateKey", label: "Template key", required: true, maxLength: 40 },
          { name: "name", label: "Name", required: true, maxLength: 120 },
          { name: "subject", label: "Subject", required: true, maxLength: 200 },
          { name: "body", label: "Body", required: true, maxLength: 5000 },
        ]}
      />
      <p className="muted">Allowed keys: EVIDENCE_REQUEST, CASE_UPDATE, CONVERSATION_REPLY, GUARD_ALERT. Approval creates an immutable version; only an approved version can be used for new drafts.</p>
    </section>
  </section>
}
