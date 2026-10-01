import Link from "next/link"
import { requireStaff } from "@/lib/require-staff"
import { ukDate } from "@/lib/admin/activity"
import { loadSettingVersions, loadSettingsOverview } from "@/lib/settings/queries"
import { EmptyState, PageHeader } from "../ui"
import { ApproveButton, HoursForm, RetentionForm, SettingsActionForm } from "./forms"

export const metadata = { title: "Settings" }

type Overview = {
  staff?: {
    title?: string
    registeredAccount?: string
    identityBound?: boolean
    removable?: boolean
    roles?: string
    lastSignIn?: string | null
    activeSessions?: number
  }
  serviceHours?: { version?: number; payload?: Record<string, unknown>; effectiveFrom?: string } | null
  retention?: { version?: number; payload?: Record<string, unknown>; effectiveFrom?: string } | null
  templates?: { approved?: number; drafts?: number }
  openComplaints?: number
  openIncidents?: number
  activeHolds?: number
  openPrivacy?: number
  schedules?: Array<{ id: string; status: string; recordVersion?: number; effectiveFrom: string; effectiveTo?: string | null }>
  temporalNote?: string
}

export default async function SettingsPage() {
  await requireStaff()
  const [overview, hours, retention] = await Promise.all([
    loadSettingsOverview() as Promise<Overview>,
    loadSettingVersions("SERVICE_HOURS"),
    loadSettingVersions("RETENTION"),
  ])
  const staff = overview.staff || {}
  const hourVersions = ((hours as { versions?: Array<{ id: string; version: number; recordVersion: number; status: string; reason: string }> }).versions || [])
  const retentionVersions = ((retention as { versions?: Array<{ id: string; version: number; recordVersion: number; status: string; reason: string }> }).versions || [])
  return <section className="page">
    <PageHeader title="Settings" description="Staff identity, session security, versioned hours/retention, template approval and Guard schedule drafts. No secrets are stored here." />
    <p className="muted">{overview.temporalNote}</p>
    <section className="panel">
      <h2>Staff identity</h2>
      <p>{staff.title}</p>
      <p>Registered account: {staff.registeredAccount}</p>
      <p className="muted">{staff.roles}</p>
      <p>Last successful sign-in: {staff.lastSignIn ? ukDate(staff.lastSignIn) : "None recorded"}.</p>
      <p>Active sessions: {staff.activeSessions ?? 0}. <Link href="/security">Manage sessions</Link></p>
      <p className="muted">This identity cannot be removed, invited, disabled or rebound. The last Owner cannot be removed because there is only one staff account.</p>
    </section>
    <section className="panel">
      <h2>Service hours</h2>
      {!overview.serviceHours ? <EmptyState>No approved case/enquiry hours yet. Guard monitoring stays seven days including bank holidays.</EmptyState> : (
        <p>Approved version {overview.serviceHours.version} from {overview.serviceHours.effectiveFrom ? ukDate(overview.serviceHours.effectiveFrom) : "—"}. First-response target: {String((overview.serviceHours.payload as { firstResponseTargetHours?: number | null })?.firstResponseTargetHours ?? "not set")} hours.</p>
      )}
      <HoursForm />
      {hourVersions.filter(row => row.status === "DRAFT").map(row => (
        <p key={row.id}>Draft v{row.version}: {row.reason} <ApproveButton operation="approve_setting" id={row.id} version={row.recordVersion} label="Approve" /></p>
      ))}
    </section>
    <section className="panel">
      <h2>Retention policy</h2>
      {!overview.retention ? <EmptyState>No approved retention periods yet. Deletion is not automated.</EmptyState> : (
        <p>Approved version {overview.retention.version}. Financial and audit records stay under this policy even when a deletion request is reviewed.</p>
      )}
      <RetentionForm />
      {retentionVersions.filter(row => row.status === "DRAFT").map(row => (
        <p key={row.id}>Draft v{row.version}: {row.reason} <ApproveButton operation="approve_setting" id={row.id} version={row.recordVersion} label="Approve" /></p>
      ))}
    </section>
    <section className="panel">
      <h2>Guard monitoring schedule</h2>
      <p className="muted">Check windows are independent of case service hours. Approving a new schedule does not rewrite existing obligations.</p>
      {!overview.schedules?.length ? <EmptyState>No schedule versions. Live monitoring remains disabled until Guard checks are enabled separately.</EmptyState> : (
        <ul>{overview.schedules.map(row => <li key={row.id}>{row.status} from {row.effectiveFrom}{row.effectiveTo ? ` to ${row.effectiveTo}` : ""}</li>)}</ul>
      )}
      <SettingsActionForm
        operation="create_schedule_draft"
        submit="Save Guard schedule draft"
        fields={[
          { name: "morningStart", label: "Morning start", type: "time", required: true },
          { name: "morningEnd", label: "Morning end", type: "time", required: true },
          { name: "eveningStart", label: "Evening start", type: "time", required: true },
          { name: "eveningEnd", label: "Evening end", type: "time", required: true },
          { name: "effectiveFrom", label: "Effective from", type: "date" },
        ]}
      />
      {overview.schedules?.filter(row => row.status === "DRAFT").map(row => (
        <p key={row.id}>Draft {row.id} <ApproveButton operation="approve_schedule" id={row.id} version={row.recordVersion ?? 1} label="Approve schedule" /></p>
      ))}
    </section>
    <section className="panel">
      <h2>Related work</h2>
      <ul>
        <li><Link href="/settings/templates">Approved template lifecycle</Link> — {overview.templates?.approved ?? 0} approved, {overview.templates?.drafts ?? 0} drafts</li>
        <li><Link href="/privacy">Privacy requests and legal holds</Link> — {overview.openPrivacy ?? 0} open, {overview.activeHolds ?? 0} holds</li>
        <li><Link href="/complaints">Complaints</Link> — {overview.openComplaints ?? 0} open</li>
        <li><Link href="/incidents">Incidents</Link> — {overview.openIncidents ?? 0} open</li>
        <li><Link href="/security">Sessions</Link></li>
      </ul>
    </section>
  </section>
}
