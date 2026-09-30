import Link from "next/link"
import { notFound } from "next/navigation"
import { loadGuardAlert } from "@/lib/guard/alerts-queries"
import { alertSeverityLabel, alertStateLabel, canEscalate, deliveryStatusLabel } from "@/lib/guard/alerts-model"
import { Badge, PageHeader } from "../../../ui"
import {
  AcknowledgeForm, CreateCaseForm, EscalateForm, LinkCaseForm, NotificationActionForm,
  PrepareNotificationForm, ReasonForm, ServiceActionForm,
} from "../forms"

export const metadata = { title: "Guard alert" }

export default async function GuardAlertDetailPage({ params }: { params: Promise<{ alertId: string }> }) {
  const { alertId } = await params
  const detail = await loadGuardAlert(alertId)
  if (!detail) notFound()
  const alert = detail.alert
  const permitted = detail.permittedActions || {}
  const coverage = detail.coverage || {}
  const notifications = detail.notifications || []
  const actions = detail.serviceActions || []
  const observations = detail.observations || []
  const events = detail.events || []
  const discount = detail.discount || {}
  const enabled = detail.enabled === true
  const openRecovery = actions.find(item => item.state === "OPEN" || item.state === "ACKNOWLEDGED")
  return <section className="page">
    <PageHeader title={`${alert.locationName} alert`} description={`${alert.businessName} · ${alert.customerName}`} actions={<Link href="/guard/alerts">Back to alerts</Link>} />
    {!enabled && <p role="status">Guard alerts are not enabled</p>}
    <section className="panel">
      <p><Badge>{alertStateLabel(alert.state)}</Badge> · {alertSeverityLabel(alert.severity)} · {alert.reviewDisposition}</p>
      <p>Coverage {alert.coverageBasis} · {alert.coverageState}</p>
      <p>Issue codes: {alert.issueCodes?.join(", ") || "None"}</p>
      <p>Linked case: {alert.linkedCaseRef || "None"}</p>
      <p>Activation clock: {coverage.activatedAt || "—"}</p>
    </section>
    <section className="panel">
      <h2>Contact and access</h2>
      <p>Email verified: {String(detail.contact?.emailVerified === true)}</p>
      <p>Phone verified: {String(detail.contact?.phoneVerified === true)}</p>
      <p>Manager/Owner access verified: {String(detail.access?.verified === true)}</p>
    </section>
    <section className="panel">
      <h2>Observation timeline</h2>
      {!observations.length ? <p className="muted">No observations for this coverage.</p> : observations.map(item => (
        <p key={item.id}>{item.observedAt} · {item.classification} · {(item.issueCodes || []).join(", ") || "no codes"} · {item.attached ? "Attached" : "Recovery evidence only"}</p>
      ))}
    </section>
    <section className="panel">
      <h2>Alert events</h2>
      {events.map((item, index) => <p key={`${item.event}-${index}`}>{item.createdAt} · {item.event} · {item.reason}</p>)}
    </section>
    <section className="panel">
      <h2>Notifications</h2>
      {!notifications.length ? <p className="muted">No customer notification has been prepared.</p> : notifications.map(item => (
        <div key={item.id}>
          <p>{item.kind} · <span>{deliveryStatusLabel(item.deliveryStatus, item.lifecycle)}</span> · {item.subject}</p>
          {enabled && item.lifecycle === "DRAFT" && <NotificationActionForm alertId={alert.id} version={alert.version} communicationId={item.communicationId} operation="approve_notification" label="Approve notification" />}
          {enabled && item.lifecycle === "REVIEWED" && <NotificationActionForm alertId={alert.id} version={alert.version} communicationId={item.communicationId} operation="queue_notification" label="Queue notification" />}
        </div>
      ))}
    </section>
    <section className="panel">
      <h2>Discount assessment</h2>
      <p>Managed relaunch: {discount.managedRelaunch?.eligible ? "Eligible" : "Not eligible"} · {discount.managedRelaunch?.reason}</p>
      <p>Managed review: {discount.managedReview?.eligible ? "Eligible" : "Not eligible"} · {discount.managedReview?.reason}</p>
      <p>Guided: {discount.guided?.eligible ? "Eligible" : "Not eligible"} · {discount.guided?.reason}</p>
      <p className="muted">This assessment does not create a quote discount snapshot.</p>
    </section>
    <section className="panel">
      <h2>Service actions</h2>
      {!actions.length ? <p className="muted">No recovery actions.</p> : actions.map(item => (
        <div key={item.id}>
          <p>{item.kind} · {item.state} · {item.reasonCode}</p>
          <p>{item.details}</p>
          {enabled && item.state === "OPEN" && <ServiceActionForm serviceActionId={item.id} version={item.version} operation="acknowledge_service_action" label="Acknowledge recovery action" />}
          {enabled && (item.state === "OPEN" || item.state === "ACKNOWLEDGED") && <ServiceActionForm serviceActionId={item.id} version={item.version} operation="resolve_service_action" label="Resolve recovery action" />}
        </div>
      ))}
    </section>
    {enabled && permitted.acknowledge && <section className="panel"><h2>Acknowledge</h2><AcknowledgeForm alertId={alert.id} version={alert.version} /></section>}
    {enabled && permitted.dismiss && <section className="panel"><h2>Dismiss</h2><ReasonForm alertId={alert.id} version={alert.version} operation="dismiss" label="Dismiss as false positive" /></section>}
    {enabled && permitted.escalate && canEscalate(alert.severity, alert.state) && <section className="panel"><h2>Escalate</h2><EscalateForm alertId={alert.id} version={alert.version} current={alert.severity} /></section>}
    {enabled && permitted.resolve && <section className="panel"><h2>Resolve</h2><ReasonForm alertId={alert.id} version={alert.version} operation="resolve" label="Resolve alert" /></section>}
    {enabled && permitted.prepareNotification && <section className="panel"><h2>Prepare notification</h2><PrepareNotificationForm alertId={alert.id} version={alert.version} /></section>}
    {enabled && permitted.createInterventionCase && <section className="panel"><h2>Intervention case</h2><CreateCaseForm alertId={alert.id} version={alert.version} /><LinkCaseForm alertId={alert.id} version={alert.version} /></section>}
    {enabled && permitted.pauseForRecovery && openRecovery && <section className="panel"><h2>Pause for recovery</h2><ReasonForm alertId={alert.id} version={alert.version} operation="pause_for_recovery" label="Pause coverage" extra={{ serviceActionId: openRecovery.id }} /></section>}
    {enabled && permitted.resume && <section className="panel"><h2>Resume</h2><p>{coverage.resumeReady ? "Readiness currently appears restored." : "Resume remains denied until access, contact and billing readiness are restored."}</p><ReasonForm alertId={alert.id} version={alert.version} operation="resume" label="Resume coverage" /></section>}
  </section>
}
