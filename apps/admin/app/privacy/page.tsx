import Link from "next/link"
import { requireStaff } from "@/lib/require-staff"
import { ukDate } from "@/lib/admin/activity"
import { loadPrivacy } from "@/lib/settings/queries"
import { EmptyState, PageHeader } from "../ui"
import { ApproveButton, ExportPrivacyButton, SettingsActionForm } from "../settings/forms"

export const metadata = { title: "Privacy" }

export default async function PrivacyPage() {
  await requireStaff()
  const data = await loadPrivacy() as {
    holds?: Array<{ id: string; scopeKind?: string; category?: string | null; customerId?: string | null; reason: string; status: string; createdAt: string; recordVersion?: number }>
    requests?: Array<{
      id: string; kind: string; customerId: string; status: string; identityStatus?: string; requestedAt: string
      scopeNote?: string; notes?: string; outcomeNote?: string; recordVersion?: number
      preview?: {
        blockedByHold?: Record<string, unknown> | boolean
        retained?: Record<string, unknown>
        automatedDeletion?: boolean
        blockedNoApprovedRetention?: Record<string, unknown>
        externalDeletionRequired?: Record<string, unknown>
      }
      dispositions?: Array<{ category: string; proposedAction: string; status: string; blockedReason?: string; retainedCount?: number; eligibleCount?: number }>
    }>
    retentionPolicies?: Array<{ category: string; status: string }>
  }
  return <section className="page">
    <Link className="back-link" href="/settings">Back to settings</Link>
    <PageHeader title="Privacy operations" description="Verified access, export, correction and deletion reviews. Legal holds block deletion in the database. Financial, audit and consent records remain visible when retained." />
    <section className="panel">
      <h2>Legal holds</h2>
      {!data.holds?.length ? <EmptyState>No legal holds.</EmptyState> : (
        <ul>{data.holds.map(row => <li key={row.id}>
          {row.status} · {row.scopeKind || row.category}{row.customerId ? ` · customer ${row.customerId}` : ""} — {row.reason}
          {row.status === "ACTIVE" && <SettingsActionForm operation="release_hold" extras={{ id: row.id }} version={row.recordVersion ?? 1} submit="Release hold" fields={[{ name: "reason", label: "Release reason", required: true, maxLength: 500 }]} />}
        </li>)}</ul>
      )}
      <SettingsActionForm
        operation="create_hold"
        submit="Create legal hold"
        fields={[
          { name: "scopeKind", label: "Scope", required: true, maxLength: 20 },
          { name: "category", label: "Category", maxLength: 40 },
          { name: "customerId", label: "Customer id", maxLength: 36 },
          { name: "caseId", label: "Case id", maxLength: 36 },
          { name: "reason", label: "Reason", required: true, maxLength: 500 },
        ]}
      />
    </section>
    <section className="panel">
      <h2>Privacy requests</h2>
      {!data.requests?.length ? <EmptyState>No privacy requests.</EmptyState> : (
        <ul>{data.requests.map(row => <li key={row.id}>
          {row.kind} · {row.status} · {row.identityStatus || "UNVERIFIED"} · {ukDate(row.requestedAt)} — {row.scopeNote || row.notes}
          {row.preview && <div className="muted">
            <p>Retained financial/audit preview recorded. Automated deletion: {row.preview.automatedDeletion ? "yes" : "no"}.</p>
            <p>Blocked by hold: {row.preview.blockedByHold && (row.preview.blockedByHold === true || Object.values(row.preview.blockedByHold).some(Boolean)) ? "yes" : "no"}.</p>
            {row.preview.blockedNoApprovedRetention && <p>Blocked because no approved retention policy exists for one or more categories.</p>}
            {row.preview.externalDeletionRequired && <p>Evidence requiring storage deletion remains BLOCKED_EXTERNAL_DELETION.</p>}
            {row.preview.retained && <p>Retained: receipts {String((row.preview.retained as { paymentReceipts?: number }).paymentReceipts ?? 0)}, obligations {String((row.preview.retained as { paymentObligations?: number }).paymentObligations ?? 0)}.</p>}
          </div>}
          {row.dispositions?.map(item => (
            <p key={item.category} className="muted">{item.category}: {item.proposedAction} · {item.status} · eligible {item.eligibleCount ?? 0} · retained {item.retainedCount ?? 0}{item.blockedReason ? ` · ${item.blockedReason}` : ""}</p>
          ))}
          {row.outcomeNote && <p className="muted">{row.outcomeNote}</p>}
          {row.status === "RECEIVED" && <ApproveButton operation="request_privacy_identity" id={row.id} version={row.recordVersion ?? 1} label="Ask for identity" />}
          {(row.status === "RECEIVED" || row.status === "IDENTITY_REQUIRED") && <ApproveButton operation="verify_privacy_request" id={row.id} version={row.recordVersion ?? 1} label="Verify from contact" />}
          {(row.status === "RECEIVED" || row.status === "IDENTITY_REQUIRED") && (
            <SettingsActionForm
              operation="verify_privacy_manual"
              extras={{ id: row.id }}
              version={row.recordVersion ?? 1}
              submit="Verify manually"
              fields={[{ name: "note", label: "Verification evidence", required: true, maxLength: 500 }]}
            />
          )}
          {row.status === "VERIFIED" && <ApproveButton operation="start_privacy_review" id={row.id} version={row.recordVersion ?? 1} label="Start review" />}
          {["VERIFIED", "REVIEWING", "READY_FOR_ACTION"].includes(row.status) && <ApproveButton operation="preview_privacy_request" id={row.id} version={row.recordVersion ?? 1} label="Refresh preview" />}
          {row.status === "REVIEWING" && <ApproveButton operation="mark_privacy_ready" id={row.id} version={row.recordVersion ?? 1} label="Mark ready" />}
          {row.dispositions?.filter(item => item.status === "PENDING" || item.status === "BLOCKED").map(item => (
            <SettingsActionForm
              key={`${row.id}-${item.category}`}
              operation="review_disposition"
              extras={{ id: row.id, category: item.category }}
              version={row.recordVersion ?? 1}
              submit={`Review ${item.category}`}
              fields={[
                { name: "proposedAction", label: "Proposed action", required: true, maxLength: 20 },
                { name: "status", label: "Status", required: true, maxLength: 20 },
                { name: "reason", label: "Review note", required: true, maxLength: 500 },
              ]}
            />
          ))}
          {["ACCESS", "EXPORT"].includes(row.kind) && ["VERIFIED", "REVIEWING", "READY_FOR_ACTION"].includes(row.status) && <ExportPrivacyButton id={row.id} version={row.recordVersion ?? 1} />}
          {row.kind === "DELETION" && row.status === "READY_FOR_ACTION" && (
            <SettingsActionForm
              operation="execute_deletion"
              extras={{ id: row.id }}
              version={row.recordVersion ?? 1}
              submit="Execute eligible deletion"
              fields={[{ name: "enquiryId", label: "Enquiry id", required: true, maxLength: 36 }]}
            />
          )}
          {["VERIFIED", "REVIEWING", "READY_FOR_ACTION"].includes(row.status) && (
            <SettingsActionForm
              operation="complete_privacy_request"
              extras={{ id: row.id }}
              version={row.recordVersion ?? 1}
              submit="Complete review"
              fields={[{ name: "resolution", label: "Resolution note", required: true, maxLength: 1000 }]}
            />
          )}
          {!["COMPLETED", "REJECTED", "CANCELLED"].includes(row.status) && (
            <SettingsActionForm
              operation="reject_privacy_request"
              extras={{ id: row.id }}
              version={row.recordVersion ?? 1}
              submit="Reject request"
              fields={[{ name: "reason", label: "Rejection reason", required: true, maxLength: 500 }]}
            />
          )}
        </li>)}</ul>
      )}
      <SettingsActionForm
        operation="create_privacy_request"
        submit="Record privacy request"
        fields={[
          { name: "kind", label: "Kind", required: true, maxLength: 20 },
          { name: "customerId", label: "Customer id", required: true, maxLength: 36 },
          { name: "notes", label: "Scope", required: true, maxLength: 1000 },
        ]}
      />
      <p className="muted">A request cannot export or delete data until identity is verified. Completion does not erase receipts, obligations or audit events. Physical deletion stays disabled unless the server gate is exactly true. Exports are downloaded here and are not emailed.</p>
    </section>
  </section>
}
