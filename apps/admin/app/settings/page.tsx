import Link from "next/link"
import { requireStaff } from "@/lib/require-staff"
import { ukDate } from "@/lib/admin/activity"
import { isSettingsSection } from "@/lib/settings/model"
import { loadRetentionPolicies, loadSessions, loadSettingVersions, loadSettingsOverview, loadSystemConfiguration } from "@/lib/settings/queries"
import { loadGoogleIntegrationHealth } from "@/lib/integrations/queries"
import { EmptyState, PageHeader } from "../ui"
import { SignOut } from "../sign-out"
import { RevokeSession } from "../revoke-session"
import { IntegrationPanel } from "./integrations"
import { ApproveButton, HoursForm, ResponseTargetsForm, RetentionForm, SettingsActionForm } from "./forms"

export const metadata = { title: "Settings" }

const sections = [
  { id: "account", label: "Account & sessions" },
  { id: "service", label: "Service settings" },
  { id: "guard", label: "Guard schedule & rota" },
  { id: "templates", label: "Communication templates" },
  { id: "privacy", label: "Privacy & retention" },
  { id: "complaints", label: "Complaints" },
  { id: "incidents", label: "Incidents" },
  { id: "integrations", label: "Integrations" },
  { id: "system", label: "System configuration" },
] as const

type Overview = {
  staff?: {
    title?: string
    registeredAccount?: string
    removable?: boolean
    roles?: string
    lastSignIn?: string | null
    activeSessions?: number
    enabled?: boolean
  }
  serviceHours?: { version?: number; payload?: Record<string, unknown>; effectiveFrom?: string } | null
  responseTargets?: { version?: number; payload?: Record<string, unknown> } | null
  alertEscalation?: { version?: number } | null
  supportedMarkets?: { version?: number } | null
  retention?: Record<string, { version?: number } | null>
  templates?: { approved?: number; drafts?: number }
  openComplaints?: number
  openIncidents?: number
  activeHolds?: number
  openPrivacy?: number
  schedules?: Array<{ id: string; status: string; recordVersion?: number; effectiveFrom: string; effectiveTo?: string | null }>
  rotaAssignments?: { active?: Array<{ id: string; coverageId: string; status: string }>; missingCoverage?: string[]; note?: string }
  temporalNote?: string
  singleAdminNote?: string
}

function configured(value: unknown, empty: string) {
  return value ? null : <EmptyState>{empty}</EmptyState>
}

export default async function SettingsPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> } = {}) {
  await requireStaff()
  const query = searchParams ? await searchParams : {}
  const raw = Array.isArray(query.section) ? query.section[0] : query.section
  const section = isSettingsSection(raw) ? raw : "account"
  const [overview, hours, targets, retention, sessions, integration] = await Promise.all([
    loadSettingsOverview() as Promise<Overview>,
    loadSettingVersions("SERVICE_HOURS"),
    loadSettingVersions("RESPONSE_TARGETS"),
    loadRetentionPolicies(),
    loadSessions(),
    loadGoogleIntegrationHealth(),
  ])
  const system = loadSystemConfiguration()
  const staff = overview.staff || {}
  const hourVersions = ((hours as { versions?: Array<{ id: string; version: number; recordVersion: number; status: string; reason: string }> }).versions || [])
  const targetVersions = ((targets as { versions?: Array<{ id: string; version: number; recordVersion: number; status: string; reason: string }> }).versions || [])
  const retentionVersions = ((retention as { versions?: Array<{ id: string; category: string; version: number; recordVersion: number; status: string; reason: string }> }).versions || [])
  return <section className="page">
    <PageHeader title="Settings" description="Account, sessions, versioned service settings, Guard schedule/rota, templates, privacy, complaints and incidents. No secrets are stored or displayed here." />
    <nav className="filters" aria-label="Settings sections">
      {sections.map(item => (
        <Link key={item.id} href={`/settings?section=${item.id}`} aria-current={section === item.id ? "page" : undefined}>{item.label}</Link>
      ))}
    </nav>
    <p className="muted">{overview.temporalNote}</p>
    <section id="account" className="panel">
      <h2>Account & sessions</h2>
      <p>{staff.title}</p>
      <p>Registered account: {staff.registeredAccount}</p>
      <p>Account enabled: {staff.enabled === false ? "Disabled" : "Enabled"} (read-only)</p>
      <p className="muted">{staff.roles}</p>
      <p>Last successful sign-in: {staff.lastSignIn ? ukDate(staff.lastSignIn) : "None recorded"}.</p>
      <p>Active sessions: {staff.activeSessions ?? 0}. <Link href="/security">Manage sessions</Link></p>
      <p className="muted">This identity cannot be removed, invited, disabled or rebound. The last Owner cannot be removed because there is only one staff account.</p>
      <p className="muted">{overview.singleAdminNote}</p>
      <ul className="sessions">{(sessions || []).map(session => <li key={session.id}>
        <strong>{session.current ? "This session" : "Another session"}</strong><br />
        Created {ukDate(session.createdAt)} · Last seen {ukDate(session.lastSeenAt)} · Expires {ukDate(session.expiresAt)}
        {!session.current && <RevokeSession id={session.id} label={ukDate(session.createdAt)} />}
      </li>)}</ul>
      <SignOut />
    </section>
    <section id="service" className="panel">
      <h2>Service settings</h2>
      <h3>Service hours</h3>
      {configured(overview.serviceHours, "Not configured")}
      {overview.serviceHours && <p>Approved version {overview.serviceHours.version} from {overview.serviceHours.effectiveFrom ? ukDate(overview.serviceHours.effectiveFrom) : "—"}.</p>}
      <HoursForm />
      {hourVersions.filter(row => row.status === "DRAFT").map(row => (
        <p key={row.id}>Draft v{row.version}: {row.reason} <ApproveButton operation="approve_setting" id={row.id} version={row.recordVersion} label="Approve" /></p>
      ))}
      {hourVersions.filter(row => row.status === "APPROVED").map(row => (
        <p key={row.id}>Approved v{row.version}: {row.reason} <ApproveButton operation="retire_setting" id={row.id} version={row.recordVersion} label="Retire hours" /></p>
      ))}
      <h3>Response targets</h3>
      {configured(overview.responseTargets, "Not configured")}
      {overview.responseTargets && <p>Approved version {overview.responseTargets.version}.</p>}
      <ResponseTargetsForm />
      {targetVersions.filter(row => row.status === "DRAFT").map(row => (
        <p key={row.id}>Draft v{row.version}: {row.reason} <ApproveButton operation="approve_setting" id={row.id} version={row.recordVersion} label="Approve" /></p>
      ))}
      {targetVersions.filter(row => row.status === "APPROVED").map(row => (
        <p key={row.id}>Approved v{row.version}: {row.reason} <ApproveButton operation="retire_setting" id={row.id} version={row.recordVersion} label="Retire targets" /></p>
      ))}
      <h3>Alert escalation</h3>
      {configured(overview.alertEscalation, "Not configured")}
      <SettingsActionForm
        operation="create_setting_draft"
        submit="Save alert-escalation draft"
        extras={{ key: "ALERT_ESCALATION", payload: { humanReviewRequired: true, customerNotificationRequiresReview: true } }}
        fields={[{ name: "reason", label: "Reason", required: true, maxLength: 500 }]}
      />
      <h3>Supported markets</h3>
      {configured(overview.supportedMarkets, "Not configured")}
      <SettingsActionForm
        operation="create_setting_draft"
        submit="Save supported-markets draft"
        extras={{ key: "SUPPORTED_MARKETS", payload: { countries: ["GB"], currencies: ["GBP"] } }}
        fields={[{ name: "reason", label: "Reason", required: true, maxLength: 500 }]}
      />
    </section>
    <section id="guard" className="panel">
      <h2>Guard schedule & rota</h2>
      <p className="muted">Current operating model has one Admin account; no backup staff account exists. Do not silently claim primary/backup coverage. Guard activation is not enabled by this step.</p>
      {!overview.schedules?.length ? <EmptyState>Not configured</EmptyState> : (
        <ul>{overview.schedules.map(row => <li key={row.id}>{row.status} from {String(row.effectiveFrom)}{row.effectiveTo ? ` to ${row.effectiveTo}` : ""}</li>)}</ul>
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
      {overview.schedules?.filter(row => row.status === "APPROVED").map(row => (
        <p key={row.id}>Approved {row.id} <ApproveButton operation="retire_schedule" id={row.id} version={row.recordVersion ?? 1} label="Retire schedule" /></p>
      ))}
      <h3>Rota</h3>
      <p className="muted">{overview.rotaAssignments?.note}</p>
      {!overview.rotaAssignments?.active?.length ? <EmptyState>No active coverage assignment.</EmptyState> : (
        <ul>{overview.rotaAssignments.active.map(row => <li key={row.id}>{row.status} · coverage {row.coverageId}</li>)}</ul>
      )}
      {overview.rotaAssignments?.missingCoverage?.length ? <p>Missing assignment: {overview.rotaAssignments.missingCoverage.length} coverage{overview.rotaAssignments.missingCoverage.length === 1 ? "" : "s"}.</p> : null}
      <SettingsActionForm
        operation="assign_rota"
        submit="Assign current Admin to coverage"
        fields={[
          { name: "coverageId", label: "Coverage id", required: true, maxLength: 36 },
          { name: "version", label: "Coverage version", required: true },
        ]}
      />
      <p className="muted">Assignment always binds to the signed-in Admin. A different assignee is rejected. No backup staff account exists.</p>
    </section>
    <section id="templates" className="panel">
      <h2>Communication templates</h2>
      <p>Approved templates: {overview.templates?.approved ?? 0}. Drafts: {overview.templates?.drafts ?? 0}.</p>
      <p><Link href="/settings/templates">Approved template lifecycle</Link></p>
      <p className="muted">Existing templates were migrated as APPROVED with provenance MIGRATED_EXISTING. New approvals record the active Admin. Draft and retired versions are never selected for send.</p>
    </section>
    <section id="privacy" className="panel">
      <h2>Privacy & retention</h2>
      {(["UNSUCCESSFUL_ENQUIRIES", "CASE_EVIDENCE", "FINANCIAL_RECORDS", "CONSENT_RECORDS", "SECURITY_LOGS"] as const).map(category => (
        <p key={category}>{category}: {overview.retention?.[category] ? `Approved v${overview.retention[category]?.version}` : "Retention policy not approved"}</p>
      ))}
      <RetentionForm />
      {retentionVersions.filter(row => row.status === "DRAFT").map(row => (
        <p key={row.id}>{row.category} draft v{row.version}: {row.reason} <ApproveButton operation="approve_retention" id={row.id} version={row.recordVersion} label="Approve retention" /></p>
      ))}
      {retentionVersions.filter(row => row.status === "APPROVED").map(row => (
        <p key={row.id}>{row.category} approved v{row.version}: {row.reason} <ApproveButton operation="retire_retention" id={row.id} version={row.recordVersion} label="Retire retention" /></p>
      ))}
      <p><Link href="/privacy">Privacy requests and legal holds</Link> — {overview.openPrivacy ?? 0} open, {overview.activeHolds ?? 0} holds</p>
    </section>
    <section id="complaints" className="panel">
      <h2>Complaints</h2>
      <p>Open complaints: {overview.openComplaints ?? 0}. <Link href="/complaints">Complaints</Link></p>
      <p className="muted">A complaint is its own durable work item. Closing a case does not delete it. There is no invented complaint SLA and no automatic refund.</p>
    </section>
    <section id="incidents" className="panel">
      <h2>Incidents</h2>
      <p>Open incidents: {overview.openIncidents ?? 0}. <Link href="/incidents">Incidents</Link></p>
      <p className="muted">Incidents record operational evidence only. They do not restart providers, enable Guard, send customer email or refund money.</p>
    </section>
    <IntegrationPanel health={integration} />
    <section id="system" className="panel">
      <h2>System configuration</h2>
      <ul>
        <li>Guard activation: {system.guardActivation}</li>
        <li>Guard checks: {system.guardChecks}</li>
        <li>Guard alerts: {system.guardAlerts}</li>
        <li>Guard alert notifications: {system.guardAlertNotifications}</li>
        <li>Guard subscriptions: {system.guardSubscriptions}</li>
        <li>refunds: {system.refunds}</li>
        <li>outgoing communications: {system.outgoingCommunications}</li>
        <li>inbound mail: {system.inboundMail}</li>
        <li>payment provider: {system.paymentProvider}</li>
        <li>Google: {system.google}</li>
        <li>Privacy deletion: {system.privacyDeletion}</li>
      </ul>
      <p className="muted">These are safe status labels only. Environment values, API keys and webhook secrets are not displayed and cannot be toggled here.</p>
    </section>
  </section>
}
