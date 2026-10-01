import Link from "next/link"
import { requireStaff } from "@/lib/require-staff"
import { ukDate } from "@/lib/admin/activity"
import { loadPrivacy } from "@/lib/settings/queries"
import { EmptyState, PageHeader } from "../ui"
import { ApproveButton, SettingsActionForm } from "../settings/forms"

export const metadata = { title: "Privacy" }

export default async function PrivacyPage() {
  await requireStaff()
  const data = await loadPrivacy() as {
    holds?: Array<{ id: string; category: string; customerId?: string | null; reason: string; status: string; createdAt: string; recordVersion?: number }>
    requests?: Array<{
      id: string; kind: string; customerId: string; status: string; requestedAt: string
      scopeNote: string; outcomeNote?: string; recordVersion?: number
      preview?: { blockedByHold?: boolean; retained?: Record<string, unknown>; automatedDeletion?: boolean }
    }>
  }
  return <section className="page">
    <Link className="back-link" href="/settings">Back to settings</Link>
    <PageHeader title="Privacy operations" description="Verified access, export, correction and deletion reviews. Legal holds block deletion. Financial and audit records are retained." />
    <section className="panel">
      <h2>Legal holds</h2>
      {!data.holds?.length ? <EmptyState>No legal holds.</EmptyState> : (
        <ul>{data.holds.map(row => <li key={row.id}>
          {row.status} · {row.category}{row.customerId ? ` · customer ${row.customerId}` : " · all customers"} — {row.reason}
          {row.status === "ACTIVE" && <ApproveButton operation="release_hold" id={row.id} version={row.recordVersion ?? 1} label="Release hold" />}
        </li>)}</ul>
      )}
      <SettingsActionForm
        operation="create_hold"
        submit="Create legal hold"
        fields={[
          { name: "category", label: "Category", required: true, maxLength: 40 },
          { name: "customerId", label: "Customer id (optional)", maxLength: 36 },
          { name: "reason", label: "Reason", required: true, maxLength: 500 },
        ]}
      />
    </section>
    <section className="panel">
      <h2>Privacy requests</h2>
      {!data.requests?.length ? <EmptyState>No privacy requests.</EmptyState> : (
        <ul>{data.requests.map(row => <li key={row.id}>
          {row.kind} · {row.status} · {ukDate(row.requestedAt)} — {row.scopeNote}
          {row.preview?.retained && <p className="muted">Retained financial/audit preview recorded. Blocked by hold: {row.preview.blockedByHold ? "yes" : "no"}. Automated deletion: {row.preview.automatedDeletion ? "yes" : "no"}.</p>}
          {row.outcomeNote && <p className="muted">{row.outcomeNote}</p>}
          {row.status === "RECEIVED" && <ApproveButton operation="verify_privacy_request" id={row.id} version={row.recordVersion ?? 1} label="Mark verified" />}
          {["RECEIVED", "VERIFIED", "IN_REVIEW"].includes(row.status) && <ApproveButton operation="preview_privacy_request" id={row.id} version={row.recordVersion ?? 1} label="Refresh preview" />}
          {["VERIFIED", "IN_REVIEW"].includes(row.status) && <ApproveButton operation="complete_privacy_request" id={row.id} version={row.recordVersion ?? 1} label="Complete review" />}
        </li>)}</ul>
      )}
      <SettingsActionForm
        operation="create_privacy_request"
        submit="Record privacy request"
        fields={[
          { name: "kind", label: "Kind", required: true, maxLength: 20 },
          { name: "customerId", label: "Customer id", required: true, maxLength: 36 },
          { name: "scopeNote", label: "Scope", required: true, maxLength: 1000 },
        ]}
      />
      <p className="muted">Verification requires the customer’s current email to already be verified. Completion does not erase receipts, obligations or audit events. No secrets are exported.</p>
    </section>
  </section>
}
