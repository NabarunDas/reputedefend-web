import Link from "next/link"
import { requireStaff } from "@/lib/require-staff"
import { ukDate } from "@/lib/admin/activity"
import { loadTemplates } from "@/lib/settings/queries"
import { EmptyState, PageHeader } from "../../ui"
import { ApproveButton, SettingsActionForm } from "../forms"

export const metadata = { title: "Templates" }

export default async function TemplatesPage() {
  await requireStaff()
  const data = await loadTemplates() as {
    approved?: Array<{ key: string; version: number; name: string; subject: string; createdAt: string }>
    drafts?: Array<{ id: string; key: string; name: string; subject: string; createdAt: string; recordVersion?: number }>
  }
  return <section className="page">
    <Link className="back-link" href="/settings">Back to settings</Link>
    <PageHeader title="Template lifecycle" description="Approved versions are immutable and used for outbound drafts. New wording is a draft until approved. Live mail stays disabled." />
    <section className="panel">
      <h2>Approved versions</h2>
      {!data.approved?.length ? <EmptyState>No approved templates.</EmptyState> : (
        <ul>{data.approved.map(row => <li key={`${row.key}-${row.version}`}>{row.key} v{row.version}: {row.name} — {row.subject} ({ukDate(row.createdAt)})</li>)}</ul>
      )}
    </section>
    <section className="panel">
      <h2>Drafts</h2>
      {!data.drafts?.length ? <EmptyState>No unpublished drafts.</EmptyState> : (
        <ul>{data.drafts.map(row => <li key={row.id}>{row.key}: {row.name} — {row.subject} <ApproveButton operation="approve_template_draft" id={row.id} version={row.recordVersion ?? 1} label="Approve" /></li>)}</ul>
      )}
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
      <p className="muted">Allowed keys: EVIDENCE_REQUEST, CASE_UPDATE, CONVERSATION_REPLY, GUARD_ALERT. Approving inserts the next immutable version. Outbound send still uses the latest approved version only.</p>
    </section>
  </section>
}
